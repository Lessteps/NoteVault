// The reminder preferences of the review system (on/off and the hour), kept next to the app's other
// private state; shared by the notifier (Electron main) and the API the Repaso calendar talks to.

import * as fs from "node:fs";
import * as path from "node:path";
import { normalizeReminderSettings, type ReminderSettings } from "../core/practice/reviewReminders.js";
import { APP_DATA_DIR } from "./appConfig.js";

// Resolved when used (not at import): tests replace the app config module.
const file = (): string => path.join(APP_DATA_DIR, "review-settings.json");

export function loadReviewSettings(): ReminderSettings {
  try {
    return normalizeReminderSettings(JSON.parse(fs.readFileSync(file(), "utf-8")));
  } catch {
    return normalizeReminderSettings({});
  }
}

export function saveReviewSettings(raw: unknown): ReminderSettings {
  const settings = normalizeReminderSettings(raw);
  fs.mkdirSync(APP_DATA_DIR, { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(settings), "utf-8");
  return settings;
}
