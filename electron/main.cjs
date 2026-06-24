const path = require("path");
const { spawn } = require("child_process");
const { app, BrowserWindow, Menu } = require("electron");

const API_PORT = process.env.API_PORT || "8787";
let apiProcess = null;

function getWindowIconPath() {
  return path.join(app.getAppPath(), "public", "task-manager-favicon.svg");
}

function getApiScriptPath() {
  return path.join(app.getAppPath(), "server", "jiraProxy.mjs");
}

function startApiProcess() {
  if (apiProcess) {
    return;
  }

  const apiScriptPath = getApiScriptPath();
  apiProcess = spawn(process.execPath, [apiScriptPath], {
    stdio: "inherit",
    env: {
      ...process.env,
      API_PORT,
    },
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
    },
  });

  win.once("ready-to-show", () => {
    win.show();
  });

  if (!app.isPackaged) {
    win.loadURL("http://localhost:5173");
    return;
  }

  win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
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

app.whenReady().then(() => {
  installApplicationMenu();
  startApiProcess();
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
