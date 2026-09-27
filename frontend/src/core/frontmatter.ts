// Ported from notevault_app/core/frontmatter_utils.py — the REFERENCE MODULE for
// the Electron/TS migration. It shows the conventions in docs/ELECTRON_MIGRATION:
// same function names, same behaviour, byte-identical frontmatter output. Pure
// string logic (no fs), so it needs no node types and its test runs as-is.

import { stripChars } from "./text";

// Python: re.compile(r"\A---\r?\n(.*?)\r?\n---\r?\n?", re.S)
// \A = start of string → "^" without the "m" flag; re.S → "s" flag.
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export const VALID_SUBJECTS = ["mathematics", "programming", "english", "general"] as const;
export const VALID_TYPES = [
  "concept", "topic", "chapter", "skill", "method", "formula",
  "definition", "theorem", "example", "exercise", "flashcard",
  "error", "project", "vocabulary", "grammar", "note",
  // Study view files (see core/practice/viewFiles.ts).
  "teorica", "practica", "resumen",
] as const;
export const VALID_STATUSES = ["learning", "reviewing", "mastered", "pending"] as const;

export type FrontmatterValue = string | number | boolean | string[];

/** Split YAML frontmatter from the markdown body and parse types cleanly.
 * Returns [properties, body]. */
export function parseFrontmatter(text: string): [Record<string, FrontmatterValue>, string] {
  const src = text ?? "";
  const m = FRONTMATTER_RE.exec(src);
  if (!m) return [{}, src];

  const fmText = m[1]!;
  const body = src.slice(m[0].length);
  const data: Record<string, FrontmatterValue> = {};

  for (const rawLine of fmText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes(":")) continue;
    const idx = line.indexOf(":");
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    const low = val.toLowerCase();

    if (low === "true" || low === "yes") {
      data[key] = true;
    } else if (low === "false" || low === "no") {
      data[key] = false;
    } else if (val.startsWith("[") && val.endsWith("]")) {
      data[key] = val.slice(1, -1).split(",")
        .map((x) => stripChars(x.trim(), "\"'"))
        .filter((x) => x.length > 0);
    } else if (/^-?\d+$/.test(val)) {
      data[key] = parseInt(val, 10);
    } else if (/^-?\d+\.\d+$/.test(val)) {
      data[key] = parseFloat(val);
    } else {
      data[key] = stripChars(val, "\"'");
    }
  }
  return [data, body];
}

/** Format a dict into a YAML frontmatter string including the --- delimiters.
 * NOTE (float caveat): JS has no int/float distinction, so a Python float like
 * 2.0 that prints "2.0" prints "2" here. sanitize_properties rounds the only
 * floats that matter (mastery to 2 dp), so this is not hit in practice; if a
 * golden test ever shows it, store such values as strings. */
export function dumpFrontmatter(data: Record<string, unknown>): string {
  if (!data || Object.keys(data).length === 0) return "";
  const lines = ["---"];
  for (const [k, v] of Object.entries(data)) {
    if (typeof v === "boolean") {
      lines.push(`${k}: ${v ? "true" : "false"}`);
    } else if (typeof v === "number") {
      lines.push(`${k}: ${v}`);
    } else if (Array.isArray(v)) {
      const items = v.map((x) => (typeof x === "string" ? `"${x}"` : String(x))).join(", ");
      lines.push(`${k}: [${items}]`);
    } else {
      const vStr = String(v).replace(/\n/g, " ").trim();
      if (/[:#"']/.test(vStr)) {
        lines.push(`${k}: "${vStr.replace(/"/g, '\\"')}"`);
      } else {
        lines.push(`${k}: ${vStr}`);
      }
    }
  }
  lines.push("---");
  return lines.join("\n") + "\n";
}

/** Update or inject frontmatter properties into a markdown document. */
export function updateFrontmatter(fullText: string, updates: Record<string, unknown>): string {
  const [current, body] = parseFrontmatter(fullText);
  const merged: Record<string, unknown> = { ...current, ...updates };
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(merged)) {
    if (v !== null && v !== undefined) clean[k] = v;
  }
  if (Object.keys(clean).length === 0) return body;
  return dumpFrontmatter(clean) + body;
}

/** Validate and clean structured note properties (clamps + coercions). */
export function sanitizeProperties(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...props };
  if ("mastery" in out) {
    const val = Number(out.mastery);
    out.mastery = Number.isFinite(val) ? Math.round(Math.max(0, Math.min(1, val)) * 100) / 100 : 0.0;
  }
  if ("difficulty" in out) {
    const val = parseInt(String(out.difficulty), 10);
    out.difficulty = Number.isFinite(val) ? Math.max(1, Math.min(5, val)) : 1;
  }
  if ("goal_level" in out) {
    const val = parseInt(String(out.goal_level), 10);
    out.goal_level = Number.isFinite(val) ? Math.max(1, Math.min(4, val)) : 1;
  }
  if ("tags" in out && typeof out.tags === "string") {
    out.tags = [out.tags];
  }
  return out;
}
