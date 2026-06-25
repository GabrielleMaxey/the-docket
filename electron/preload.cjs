const { contextBridge } = require("electron");

const readApiPortFromArgv = () => {
  const flag = process.argv.find((arg) => arg.startsWith("--api-port="));
  if (!flag) {
    return null;
  }

  const port = flag.slice("--api-port=".length).trim();
  return port || null;
};

const readApiBaseFromArgv = () => {
  const flag = process.argv.find((arg) => arg.startsWith("--api-base="));
  if (!flag) {
    return null;
  }

  const base = flag.slice("--api-base=".length).trim();
  return base || null;
};

const apiPort = readApiPortFromArgv() || process.env.API_PORT || "8787";
const apiBaseUrl = readApiBaseFromArgv() || `http://127.0.0.1:${apiPort}`;

contextBridge.exposeInMainWorld("desktop", {
  platform: process.platform,
  apiPort: Number(apiPort),
  apiBaseUrl,
});
