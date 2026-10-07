// Screen capture from the renderer's side: where the shot should go, and what to
// say when it is saved. The picking itself happens in an overlay window owned by
// the main process (electron/screenCapture.ts).

import { api } from "./bridge";
import { useApp } from "../store/app";

/** Vault-relative folder the user is working in: the open note's, or the vault root (""). */
export function captureFolder(active: string | null = useApp.getState().active): string {
  if (!active) return "";
  const i = active.lastIndexOf("/");
  return i < 0 ? "" : active.slice(0, i);
}

export async function startScreenCapture(): Promise<void> {
  try {
    await api.captureStart(captureFolder());
  } catch (e) {
    useApp.getState().toast("error", (e as Error).message);
  }
}

/** Wires the shortcut and the "saved" toast; returns the cleanup. */
export function listenForCaptures(): () => void {
  const offRequest = api.onCaptureRequest(() => void startScreenCapture());
  const offDone = api.onCaptureDone(({ rel }) => {
    const s = useApp.getState();
    s.toast("info", `Captura guardada en ${rel} (también en el portapapeles)`);
    s.refreshTree();
  });
  return () => {
    offRequest();
    offDone();
  };
}
