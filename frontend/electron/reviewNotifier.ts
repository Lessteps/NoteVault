// Windows notification for topics whose spaced-repetition review is due.
//
// The review notes (`<Subject>/Repaso/<topic>.md`) carry the date; this checks them
// when the app starts and every half hour, and shows ONE notification per topic per
// due date, so it never nags. Clicking it brings the window to the front.

import { app, BrowserWindow, Notification } from "electron";
import fs from "node:fs";
import path from "node:path";
import { getAppState } from "../src/api/registry";
import { APP_DATA_DIR } from "../src/api/appConfig";
import { listReviews } from "../src/core/practice/reviewFiles";
import { isoDate } from "../src/core/practice/reviewSchedule";

const STATE_FILE = path.join(APP_DATA_DIR, "review-notified.json");
const EVERY_MS = 30 * 60 * 1000;

function loadNotified(): Record<string, string> {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8")) as Record<string, string>;
  } catch {
    return {};
  }
}

function saveNotified(state: Record<string, string>): void {
  try {
    fs.mkdirSync(APP_DATA_DIR, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state), "utf-8");
  } catch {
    /* a lost record only means one repeated notification */
  }
}

export function checkReviews(): void {
  const root = getAppState()?.root;
  if (!root || !Notification.isSupported()) return;
  const today = isoDate(new Date());
  const notified = loadNotified();
  const fresh = listReviews(root, today).filter((r) => r.inDays <= 0 && notified[r.path] !== r.next);
  if (!fresh.length) return;

  const names = fresh.slice(0, 4).map((r) => `• ${r.topic}`).join("\n");
  const more = fresh.length > 4 ? `\n…y ${fresh.length - 4} más` : "";
  const note = new Notification({
    title: fresh.length === 1 ? "Toca repasar un tema" : `Toca repasar ${fresh.length} temas`,
    body: `${names}${more}`,
  });
  note.on("click", () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });
  note.show();
  for (const r of fresh) notified[r.path] = r.next;
  saveNotified(notified);
}

export function startReviewNotifier(): void {
  // Windows only shows toast notifications for an app that has an identity.
  app.setAppUserModelId("com.notevault.app");
  setTimeout(checkReviews, 8000);
  setInterval(checkReviews, EVERY_MS);
}
