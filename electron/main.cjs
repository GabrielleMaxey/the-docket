const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { app, BrowserWindow, Menu } = require("electron");

let apiPort = process.env.API_PORT || "8787";
let apiProcess = null;

const PACKAGED_ENV_TEMPLATE = `# Task Manager — edit this file with your Jira credentials, then restart the app.
# See docs/JIRA_SETUP.md in the project repo for full setup help.

JIRA_BASE_URL=https://your-domain.atlassian.net
JIRA_EMAIL=your-email@example.com
JIRA_API_TOKEN=replace-with-token
API_PORT=8787

# Optional: Anthropic for Chat and reports
# ANTHROPIC_API_KEY=sk-ant-...
`;

function getWindowIconPath() {
  return path.join(app.getAppPath(), "public", "task-manager-favicon.svg");
}

function getApiScriptPath() {
  return path.join(app.getAppPath(), "server", "jiraProxy.mjs");
}

function getPackagedUserDataRoot() {
  return app.getPath("userData");
}

function readApiPortFromEnvFile(envPath) {
  if (!fs.existsSync(envPath)) {
    return null;
  }

  const content = fs.readFileSync(envPath, "utf8");
  const match = content.match(/^API_PORT\s*=\s*(\d+)\s*$/m);
  if (!match) {
    return null;
  }

  const port = String(match[1] || "").trim();
  return port || null;
}

function syncApiPortForPackagedApp() {
  if (!app.isPackaged) {
    return;
  }

  const envPath = path.join(getPackagedUserDataRoot(), ".env");
  const fromFile = readApiPortFromEnvFile(envPath);
  if (fromFile) {
    apiPort = fromFile;
    process.env.API_PORT = fromFile;
  }
}

function ensurePackagedUserData() {
  if (!app.isPackaged) {
    return null;
  }

  const userDataRoot = getPackagedUserDataRoot();
  const dataDir = path.join(userDataRoot, "data");
  fs.mkdirSync(dataDir, { recursive: true });

  const envPath = path.join(userDataRoot, ".env");
  if (!fs.existsSync(envPath)) {
    fs.writeFileSync(envPath, PACKAGED_ENV_TEMPLATE, "utf8");
  }

  return userDataRoot;
}

function getApiEnv() {
  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
    API_PORT: apiPort,
  };

  if (app.isPackaged) {
    const userDataRoot = ensurePackagedUserData();
    if (userDataRoot) {
      env.TASK_MANAGER_USER_DATA = userDataRoot;
    }
  }

  return env;
}

function startApiProcess() {
  if (apiProcess) {
    return;
  }

  const apiScriptPath = getApiScriptPath();
  apiProcess = spawn(process.execPath, [apiScriptPath], {
    stdio: "inherit",
    env: getApiEnv(),
  });

  apiProcess.on("exit", () => {
    apiProcess = null;
  });
}

function stopApiProcess() {
  if (!apiProcess || apiProcess.killed) {
    return;
  }

  apiProcess.kill("SIGTERM");
}

async function waitForApi(maxAttempts = 40) {
  const url = `http://127.0.0.1:${apiPort}/api/health`;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return true;
      }
    } catch {
      // Proxy still starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return false;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    icon: getWindowIconPath(),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      additionalArguments: app.isPackaged
        ? [`--api-port=${apiPort}`]
        : [`--api-port=${apiPort}`, "--api-base=http://localhost:5173"],
    },
  });

  win.once("ready-to-show", () => {
    win.show();
  });

  if (!app.isPackaged) {
    win.loadURL("http://localhost:5173");
    return;
  }

  win.loadURL(`http://127.0.0.1:${apiPort}`);
}

function installApplicationMenu() {
  const template = [
    ...(process.platform === "darwin"
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ]
      : []),
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "delete" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [{ role: "minimize" }, { role: "close" }],
    },
  ];

  if (process.platform === "darwin") {
    template[3].submenu = [{ role: "minimize" }, { role: "zoom" }, { type: "separator" }, { role: "front" }];
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(async () => {
  installApplicationMenu();

  if (app.isPackaged) {
    ensurePackagedUserData();
    syncApiPortForPackagedApp();
  }

  startApiProcess();

  if (app.isPackaged) {
    const ready = await waitForApi();
    if (!ready) {
      console.error(
        `[electron] API did not become ready on port ${apiPort}. Check ${path.join(getPackagedUserDataRoot(), ".env")}.`
      );
    }
  }

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  stopApiProcess();
});

process.on("SIGINT", () => {
  stopApiProcess();
});

process.on("SIGTERM", () => {
  stopApiProcess();
});
