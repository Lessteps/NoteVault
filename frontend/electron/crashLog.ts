import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

/** Past this size the log starts over, so it never grows without bound. */
const MAX_BYTES = 512 * 1024;

export function crashLogPath(): string {
  return path.join(app.getPath("userData"), "crash.log");
}

/** Appends one line to `crash.log` in the app data folder. Never throws. */
export function logCrash(kind: string, detail: unknown): void {
  try {
    const file = crashLogPath();
    if (fs.existsSync(file) && fs.statSync(file).size > MAX_BYTES) fs.rmSync(file);
    const text = detail instanceof Error ? (detail.stack ?? detail.message) : typeof detail === "string" ? detail : JSON.stringify(detail);
    fs.appendFileSync(file, `${new Date().toISOString()} [${kind}] ${text}\n`);
  } catch {
    /* the log must never be the thing that breaks the app */
  }
}

/**
 * Records what the process was doing when the window died or froze: until now a crash left
 * nothing behind. Call once, before the window is created.
 */
export function installCrashLog(): void {
  process.on("uncaughtException", (e) => logCrash("uncaughtException", e));
  process.on("unhandledRejection", (e) => logCrash("unhandledRejection", e instanceof Error ? e : String(e)));
  app.on("render-process-gone", (_e, contents, details) =>
    logCrash("render-process-gone", { url: contents.getURL(), ...details }),
  );
  app.on("child-process-gone", (_e, details) => logCrash("child-process-gone", details));
}

/** Window-level events: the page freezing and coming back is logged with how long it was stuck. */
export function watchWindowHealth(win: Electron.BrowserWindow): void {
  let stuckAt = 0;
  win.webContents.on("unresponsive", () => {
    stuckAt = Date.now();
    logCrash("unresponsive", { url: win.webContents.getURL() });
  });
  win.webContents.on("responsive", () => {
    if (stuckAt) logCrash("responsive", `recovered after ${Date.now() - stuckAt} ms`);
    stuckAt = 0;
  });
  win.webContents.on("console-message", (e) => {
    const level = (e as unknown as { level?: string | number }).level;
    if (level === "error" || level === 3) {
      const msg = (e as unknown as { message?: string }).message ?? "";
      logCrash("renderer-error", msg.slice(0, 800));
    }
  });
}
