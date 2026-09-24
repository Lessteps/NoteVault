import { app, BrowserWindow, shell } from "electron";
import path from "node:path";
import { registerIpc } from "./ipc";

import fs from "node:fs";

const DEV_URL = process.env.VITE_DEV_SERVER_URL;
let win: BrowserWindow | null = null;

function getPreloadPath(): string {
  const mjs = path.join(__dirname, "preload.mjs");
  if (fs.existsSync(mjs)) return mjs;
  return path.join(__dirname, "preload.js");
}

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: "#191919",
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  // The window must never navigate away; external links open in the OS browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    const base = DEV_URL ?? "file://";
    if (!url.startsWith(base)) {
      e.preventDefault();
      if (/^https?:/i.test(url)) void shell.openExternal(url);
    }
  });
  if (DEV_URL) void win.loadURL(DEV_URL);
  else void win.loadFile(path.join(__dirname, "../dist/index.html"));
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
