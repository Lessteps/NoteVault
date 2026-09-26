/**
 * Daily Notes support for NoteVault.
 * Ported from notevault_app/core/daily_notes.py.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { todayIso } from "./dates";
import { readAndExpand } from "./templates";

export function todayPath(dailyDir: string): string {
  return path.join(dailyDir, `${todayIso()}.md`);
}

/** Return the path to today's daily note, creating it if needed. Idempotent. */
export function openOrCreateToday(
  _vaultRoot: string,
  dailyDir: string,
  templatePath?: string | null,
  title?: string | null,
): string {
  fs.mkdirSync(dailyDir, { recursive: true });
  const p = todayPath(dailyDir);
  if (fs.existsSync(p)) {
    return p;
  }

  const todayStr = todayIso();
  const noteTitle = title || todayStr;
  const ctx = { title: noteTitle, date: todayStr };

  let content: string;
  if (templatePath && fs.existsSync(templatePath)) {
    content = readAndExpand(templatePath, ctx);
  } else {
    content =
      `---\ntitle: ${noteTitle}\ndate: ${todayStr}\ntags: []\n---\n\n` +
      `# ${noteTitle}\n\n`;
  }

  fs.writeFileSync(p, content, "utf-8");
  return p;
}
