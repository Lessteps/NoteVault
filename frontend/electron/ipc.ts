import { BrowserWindow, ipcMain } from "electron";
import { getRegistry } from "../src/api/registry";
import { browserManager, type BrowserBounds } from "./browserManager";
import { openSecondaryWindow } from "./windowFactory";

/** The window the app is drawing its own title bar for. */
function appWindow(): BrowserWindow | null {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null;
}

export function registerIpc(): void {
  ipcMain.handle("nv", async (_e, method: string, args: unknown[]) => {
    switch (method) {
      case "window_minimize":
        appWindow()?.minimize();
        return { maximized: appWindow()?.isMaximized() ?? false };
      case "window_toggle_maximize": {
        const win = appWindow();
        if (!win) return { maximized: false };
        if (win.isMaximized()) win.unmaximize();
        else win.maximize();
        return { maximized: win.isMaximized() };
      }
      case "window_close":
        appWindow()?.close();
        return { ok: true };
      case "window_open_new":
        return openSecondaryWindow(String(args[0] ?? ""));
      case "window_state":
        return { maximized: appWindow()?.isMaximized() ?? false };
      case "browser_attach":
        return browserManager.attach(args[0] as BrowserBounds, args[1] as string | undefined);
      case "browser_detach":
        browserManager.detach();
        return { ok: true };
      case "browser_set_bounds":
        browserManager.setBounds(args[0] as BrowserBounds);
        return { ok: true };
      case "browser_navigate":
        return await browserManager.navigate(String(args[0] || ""));
      case "browser_action":
        return browserManager.action(args[0] as "back" | "forward" | "reload" | "stop");
      case "browser_state":
        return browserManager.getState();
      case "browser_destroy":
        browserManager.destroy();
        return { ok: true };
    }

    const fn = getRegistry()[method];
    if (!fn) throw new Error(`Método desconocido: ${method}`);
    return await fn(...(args ?? []));
  });
}
