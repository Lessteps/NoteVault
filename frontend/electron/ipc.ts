import { ipcMain } from "electron";
import { getRegistry } from "../src/api/registry";

export function registerIpc(): void {
  ipcMain.handle("nv", async (_e, method: string, args: unknown[]) => {
    const fn = getRegistry()[method];
    if (!fn) throw new Error(`Método desconocido: ${method}`);
    return await fn(...(args ?? []));
  });
}
