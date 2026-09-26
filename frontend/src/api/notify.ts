// Ported from notevault_app/webapp/notify.py
//
// Desktop notifications. The Python version shelled out to PowerShell /
// osascript / notify-send to stay Qt-free; in Electron the main process has a
// native Notification API, so we use that. electron is imported lazily so this
// module can be loaded (and unit-tested) outside an Electron runtime.

function clean(text: string, limit: number): string {
  return String(text || "")
    .split(/\s+/)
    .filter((s) => s)
    .join(" ")
    .slice(0, limit);
}

/** Show a notification; false when there is no way to (no Electron runtime,
 * or the OS reports notifications are unsupported). */
export function notify(title: string, body: string): boolean {
  const t = clean(title, 120) || "NoteVault";
  const b = clean(body, 400);
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const electron = require("electron") as {
      Notification?: {
        isSupported(): boolean;
        new (opts: { title: string; body: string }): { show(): void };
      };
    };
    const N = electron?.Notification;
    if (!N || !N.isSupported()) return false;
    new N({ title: t, body: b }).show();
    return true;
  } catch {
    return false;
  }
}
