const { contextBridge } = require("electron");

// Keep renderer isolated; expand this API only when desktop-specific features are needed.
contextBridge.exposeInMainWorld("desktop", {
  platform: process.platform,
});
