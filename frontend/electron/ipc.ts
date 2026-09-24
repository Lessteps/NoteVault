import { ipcMain } from "electron";
import { registry } from "../src/api/registry";

export function registerIpc(): void {
  ipcMain.handle("nv", async (_e, method: string, args: unknown[]) => {
    const fn = (registry as Record<string, (...a: unknown[]) => unknown>)[method];
    if (!fn) throw new Error(`Método desconocido: ${method}`);
    return await fn(...(args ?? []));
  });
}
