/**
 * When the app reminds you to review. Pure: the Electron notifier and the tests share it.
 *
 * A topic is announced ONCE per due date (never nagged), only from the hour you chose (09:00 by
 * default) so the notification arrives when you start your day and not while the app happens to be
 * running at 3 a.m., and only when the reminders are on.
 */

import type { ReviewItem } from "./reviewFiles.js";

export interface ReminderSettings {
  enabled: boolean;
  /** hour of the day (0-23) from which a due review is announced */
  hour: number;
}

export const DEFAULT_REMINDERS: ReminderSettings = { enabled: true, hour: 9 };

export function normalizeReminderSettings(raw: unknown): ReminderSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const hour = Number(r.hour);
  return {
    enabled: r.enabled === undefined ? DEFAULT_REMINDERS.enabled : Boolean(r.enabled),
    hour: Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : DEFAULT_REMINDERS.hour,
  };
}

/** The reviews to announce now: due today or overdue, not yet announced for their date, and past the chosen hour. */
export function reviewsToAnnounce(
  items: readonly ReviewItem[],
  notified: Readonly<Record<string, string>>,
  settings: ReminderSettings,
  now: Date,
): ReviewItem[] {
  if (!settings.enabled || now.getHours() < settings.hour) return [];
  return items.filter((r) => r.inDays <= 0 && notified[r.path] !== r.next);
}

export function reminderText(items: readonly ReviewItem[]): { title: string; body: string } {
  const names = items.slice(0, 4).map((r) => `• ${r.topic}`).join("\n");
  const more = items.length > 4 ? `\n…y ${items.length - 4} más` : "";
  return {
    title: items.length === 1 ? "Toca repasar un tema" : `Toca repasar ${items.length} temas`,
    body: `${names}${more}`,
  };
}
