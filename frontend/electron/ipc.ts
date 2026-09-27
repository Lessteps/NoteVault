import { ipcMain } from "electron";
import { getRegistry } from "../src/api/registry";
import { browserManager, type BrowserBounds } from "./browserManager";

export function registerIpc(): void {
  ipcMain.handle("nv", async (_e, method: string, args: unknown[]) => {
    switch (method) {
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
