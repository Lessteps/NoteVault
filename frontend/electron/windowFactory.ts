// Windows other than the main one.
//
// The app state (`src/api/appState`) belongs to whichever window is in front,
// so a second window is just the same renderer pointed at one note: it opens
// that note, follows the vault's file events, and its own title-bar buttons act
// on itself (see `appWindow()` in ipc.ts).

import { BrowserWindow, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { installZoom } from "./zoom";

// The main bundle is an ES module, where __dirname is undefined (same trick as
// main.ts).
const here = path.dirname(fileURLToPath(import.meta.url));
const DEV_URL = process.env.VITE_DEV_SERVER_URL;

/** The preload the renderer needs; it is built next to the main bundle. */
export function getPreloadPath(): string {
  const mjs = path.join(here, "preload.mjs");
  return fs.existsSync(mjs) ? mjs : path.join(here, "preload.js");
}

/** A separate window on the same vault, opened at `noteRel` if given. */
export function openSecondaryWindow(noteRel = ""): { ok: boolean } {
  const win = new BrowserWindow({
    width: 1200,
    height: 850,
    backgroundColor: "#191919",
    autoHideMenuBar: true,
    // Like the main window: the app draws its own title bar.
    frame: false,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.on("maximize", () => win.webContents.send("nv-window-state", { maximized: true }));
  win.on("unmaximize", () => win.webContents.send("nv-window-state", { maximized: false }));
  installZoom(win);
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });
  const query = noteRel ? { note: noteRel } : undefined;
  if (DEV_URL) {
    const url = noteRel ? `${DEV_URL}?note=${encodeURIComponent(noteRel)}` : DEV_URL;
    void win.loadURL(url);
  } else {
    void win.loadFile(path.join(here, "../dist/index.html"), query ? { query } : undefined);
  }
  return { ok: true };
}
