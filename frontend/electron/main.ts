import { app, BrowserWindow, Menu, shell } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registerIpc } from "./ipc";
import { getAppState, initRegistry, warmStudyIndex } from "../src/api/registry";

import fs from "node:fs";
import { AppConfig } from "../src/api/appConfig";
import { readGpuStatus } from "../src/api/gpuStatus";
import { browserManager } from "./browserManager";
import { getPreloadPath } from "./windowFactory";

// Allow HTML5 video and audio autoplay in embedded views
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

// Configure GPU and rendering switches before app ready to maximize performance and respect settings
try {
  const rendering = AppConfig.get_rendering();
  if (rendering.mode === "software") {
    app.disableHardwareAcceleration();
  } else {
    app.commandLine.appendSwitch("ignore-gpu-blocklist");
    app.commandLine.appendSwitch("enable-gpu-rasterization");
    app.commandLine.appendSwitch("enable-zero-copy");
    if (rendering.angle !== "default") {
      app.commandLine.appendSwitch("use-angle", rendering.angle);
    }
    if (rendering.angle === "vulkan") {
      app.commandLine.appendSwitch("enable-features", "Vulkan");
    }
  }
} catch (e) {
  console.warn("Failed to apply rendering command-line switches:", e);
}

export async function gpuStatus() {
  return readGpuStatus();
}

// The bundle is loaded as an ES module, where __dirname is undefined.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEV_URL = process.env.VITE_DEV_SERVER_URL;

import { FileWatcherService, type WatchEvent } from "../src/core/fileWatcher";

let win: BrowserWindow | null = null;
let fileWatcher: FileWatcherService | null = null;

export function restartFileWatcher(root?: string) {
  if (fileWatcher) {
    fileWatcher.stop();
    fileWatcher = null;
  }
  const target = root ?? getAppState()?.root;
  if (target && fs.existsSync(target)) {
    fileWatcher = new FileWatcherService(target, (event: WatchEvent) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send("vault-watch-event", event);
      }
    });
    fileWatcher.start();
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: "#191919",
    autoHideMenuBar: true,
    // The app draws its own title bar: one row with the tab strip, the sync
    // status and the window controls. Without `frame: false` Windows puts its
    // own title bar above that one and the interface loses the space.
    frame: false,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.on("maximize", () => win?.webContents.send("nv-window-state", { maximized: true }));
  win.on("unmaximize", () => win?.webContents.send("nv-window-state", { maximized: false }));
  const state = getAppState();
  if (state) state.window = win;
  browserManager.setWindow(win);
  restartFileWatcher();
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
  // The app has its own custom top bar; drop Electron's native File/Edit/View menu.
  Menu.setApplicationMenu(null);
  initRegistry();
  registerIpc();
  createWindow();
  // The first study view of a cold process used to wait ~30 s for the whole vault
  // to be read (measured over 2 107 notes). Warming it here, in the background and
  // in batches, takes that off the click; nothing is waiting for the result.
  setTimeout(() => {
    void warmStudyIndex()
      .then((r) => console.log(`study index warm: ${r.notes} notes in ${r.ms} ms`))
      .catch((e) => console.warn("study index warm failed:", e));
  }, 4000);
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  browserManager.destroy();
  fileWatcher?.stop();
});
