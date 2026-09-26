import { contextBridge, ipcRenderer } from "electron";

// The ONLY thing exposed to the renderer. Mirrors window.pywebview.api's shape.
contextBridge.exposeInMainWorld("nv", {
  invoke: (method: string, args: unknown[]) => ipcRenderer.invoke("nv", method, args),
});
