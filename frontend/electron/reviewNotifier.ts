// Windows notification for topics whose spaced-repetition review is due.
//
// The review notes (`<Subject>/Repaso/<topic>.md`) carry the date. This checks them when the app
// starts and every 10 minutes, and shows ONE notification per topic per due date (from the hour
// chosen in the Repaso calendar), so it never nags. Clicking it brings the window to the front and
// opens the Repaso calendar.

import { app, BrowserWindow, Notification } from "electron";
import fs from "node:fs";
import path from "node:path";
import { getAppState } from "../src/api/registry";
import { APP_DATA_DIR } from "../src/api/appConfig";
import { setReviewTestHook } from "../src/api/reviewHooks";
import { loadReviewSettings } from "../src/api/reviewSettings";
import { listReviews } from "../src/core/practice/reviewFiles";
import { reminderText, reviewsToAnnounce } from "../src/core/practice/reviewReminders";
import { isoDate } from "../src/core/practice/reviewSchedule";

const STATE_FILE = path.join(APP_DATA_DIR, "review-notified.json");
const EVERY_MS = 10 * 60 * 1000;

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

/** Brings the window to the front and asks it to open the Repaso calendar. */
function openReviewCalendar(): void {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  win.webContents.send("nv-open-review");
}

export function checkReviews(): void {
  const root = getAppState()?.root;
  if (!root || !Notification.isSupported()) return;
  const now = new Date();
  const notified = loadNotified();
  const fresh = reviewsToAnnounce(listReviews(root, isoDate(now)), notified, loadReviewSettings(), now);
  if (!fresh.length) return;

  const note = new Notification(reminderText(fresh));
  note.on("click", openReviewCalendar);
  note.show();
  for (const r of fresh) notified[r.path] = r.next;
  saveNotified(notified);
}

/** A notification on demand (the "Probar" button): shows what a real reminder looks like. */
export function testReviewNotification(): { supported: boolean; due: number } {
  if (!Notification.isSupported()) return { supported: false, due: 0 };
  const root = getAppState()?.root;
  const due = root ? listReviews(root, isoDate(new Date())).filter((r) => r.inDays <= 0) : [];
  const note = new Notification(
    due.length ? reminderText(due) : { title: "Recordatorios de repaso activos", body: "Te avisaré cuando un tema toque repasarse." },
  );
  note.on("click", openReviewCalendar);
  note.show();
  return { supported: true, due: due.length };
}

export function startReviewNotifier(): void {
  setReviewTestHook(testReviewNotification);
  // Windows only shows toast notifications for an app that has an identity.
  app.setAppUserModelId("com.notevault.app");
  setTimeout(checkReviews, 8000);
  setInterval(checkReviews, EVERY_MS);
}
