/**
 * Template engine for NoteVault.
 * Ported from notevault_app/core/templates.py.
 *
 * Templates are plain .md files that may contain variables:
 *   {{title}}           — note title (or "Nueva nota" if unknown)
 *   {{date}}            — today in YYYY-MM-DD
 *   {{time}}            — current time HH:MM
 *   {{date:%d/%m/%Y}}   — date with custom strftime format
 *   {{datetime}}        — date + time
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { formatDate } from "./dates";

const VAR_RE = /\{\{(\w+)(?::([^}]*))?\}\}/g;

export function expandTemplate(text: string, ctx?: Record<string, string> | null): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const base: Record<string, string> = {
    title: "",
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    datetime: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`,
  };
  if (ctx) {
    Object.assign(base, ctx);
  }

  return (text ?? "").replace(VAR_RE, (match, key, fmt) => {
    if (key === "date" && fmt) {
      return formatDate(now, fmt);
    }
    if (key === "datetime" && fmt) {
      return formatDate(now, fmt);
    }
    return key in base ? (base[key] ?? "") : match;
  });
}

export function listTemplates(templatesDir: string): string[] {
  if (!fs.existsSync(templatesDir) || !fs.statSync(templatesDir).isDirectory()) {
    return [];
  }
  return fs
    .readdirSync(templatesDir)
    .filter((name) => name.endsWith(".md"))
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
    .map((name) => path.join(templatesDir, name));
}

export function readAndExpand(templatePath: string, ctx?: Record<string, string> | null): string {
  const raw = fs.readFileSync(templatePath, "utf-8");
  return expandTemplate(raw, ctx);
}
