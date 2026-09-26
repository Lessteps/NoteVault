import { contextBridge, ipcRenderer } from "electron";

// The ONLY thing exposed to the renderer. Mirrors window.pywebview.api's shape.
contextBridge.exposeInMainWorld("nv", {
  invoke: (method: string, args: unknown[]) => ipcRenderer.invoke("nv", method, args),
  onWatchEvent: (cb: (data: { eventType: string; relPath: string; fullPath: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: any) => cb(data);
    ipcRenderer.on("vault-watch-event", handler);
    return () => {
      ipcRenderer.removeListener("vault-watch-event", handler);
    };
  },
});
