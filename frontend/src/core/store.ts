/**
 * Small storage helpers shared by the Metas, Proyectos and Finanzas modules.
 * Ported from notevault_app/core/store.py.
 *
 * Frontmatter contract (docs/VAULT_FORMAT.md, "Frontmatter tipado").
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { formatDate, nowLocalIso, todayIso } from "./dates";
import { FieldDef, FieldType, LAYOUT } from "./vaultFormat";

const KEY_RE = /^([a-z_0-9]+):[ \t]*(.*)$/;

const ACCENT_MAP: Record<string, string> = {
  á: "a", é: "e", í: "i", ó: "o", ú: "u", ü: "u", ñ: "n",
  Á: "a", É: "e", Í: "i", Ó: "o", Ú: "u", Ü: "u", Ñ: "n",
};

// ── Ids ───────────────────────────────────────────────────────────────────

/** 'g20260914-a1b2c3': a letter, the creation day and 6 random hex digits. */
export function newId(prefix: string, day?: Date | string | null): string {
  let dayStr: string;
  if (!day) {
    dayStr = formatDate(new Date(), "%Y%m%d");
  } else if (day instanceof Date) {
    dayStr = formatDate(day, "%Y%m%d");
  } else {
    dayStr = String(day).replace(/-/g, "").slice(0, 8);
  }
  const hex = crypto.randomUUID().replace(/-/g, "").slice(0, 6);
  return `${prefix}${dayStr}-${hex}`;
}

/** 'Programación y más' -> 'programacion-y-mas' (ids for areas, categories). */
export function slug(text: string): string {
  const translated = (text || "").replace(/[áéíóúüñÁÉÍÓÚÜÑ]/g, (ch) => ACCENT_MAP[ch] ?? ch);
  const out = translated
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return out || "x";
}

// ── Value encoding ────────────────────────────────────────────────────────

export function quote(text: unknown): string {
  return '"' + String(text).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
}

export function unquote(raw: string): string {
  const s = (raw ?? "").trim();
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    const inner = s.slice(1, -1);
    const out: string[] = [];
    let i = 0;
    while (i < inner.length) {
      const ch = inner[i]!;
      if (ch === "\\" && i + 1 < inner.length) {
        const nxt = inner[i + 1]!;
        if (nxt === "n") out.push("\n");
        else if (nxt === "t") out.push("\t");
        else out.push(nxt);
        i += 2;
        continue;
      }
      out.push(ch);
      i += 1;
    }
    return out.join("");
  }
  if (s.length >= 2 && s.startsWith("'") && s.endsWith("'")) {
    return s.slice(1, -1).replace(/''/g, "'");
  }
  return s;
}

export function fmtNum(value: unknown): string {
  if (typeof value === "boolean") {
    return value ? "1" : "0";
  }
  const f = Number(value);
  if (Number.isInteger(f)) {
    return String(f);
  }
  // Shortest decimal, round to 6 decimal places like Python round(f, 6)
  const rounded = Math.round(f * 1e6) / 1e6;
  return String(rounded);
}

export function parseNum(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim().replace(",", ".");
  if (!s) return null;
  const f = Number(s);
  if (Number.isNaN(f)) return null;
  return Number.isInteger(f) ? Math.trunc(f) : f;
}

export function parseIntSafe(raw: unknown): number | null {
  if (typeof raw === "boolean") return null;
  if (typeof raw === "number") return Number.isInteger(raw) ? raw : Math.trunc(raw);
  const s = String(raw ?? "").trim();
  if (!/^-?\d+$/.test(s)) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

export function parseDay(raw: unknown): string | null {
  if (!raw) return null;
  if (raw instanceof Date) return todayIso(raw);
  const s = String(raw).trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

export function parseDt(raw: unknown): string | null {
  if (!raw) return null;
  if (raw instanceof Date) return nowLocalIso(raw).slice(0, 16);
  const s = String(raw).trim();
  const m = /^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2})/.exec(s);
  return m ? m[1]!.replace(" ", "T") : null;
}

export function splitList(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((s) => String(s ?? "").trim()).filter(Boolean);
  }
  return String(raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** The text after 'key: ', or null when the key must not be written. */
export function encode(kind: FieldType, value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (kind === "bool") {
    return value ? "true" : null;
  }
  if (kind === "bool0") {
    return value ? "true" : "false";
  }
  if (kind === "id") {
    const s = String(value);
    return s ? s : null;
  }
  if (kind === "str") {
    const s = String(value);
    return s !== "" ? quote(s) : null;
  }
  if (kind === "int") {
    if (value === "") return null;
    const n = typeof value === "number" ? Math.trunc(value) : parseInt(String(value), 10);
    return Number.isFinite(n) ? String(n) : null;
  }
  if (kind === "num") {
    if (value === "") return null;
    return fmtNum(value);
  }
  if (kind === "date") {
    if (value instanceof Date) return todayIso(value);
    const s = String(value).trim();
    return s || null;
  }
  if (kind === "datetime") {
    if (value instanceof Date) return nowLocalIso(value).slice(0, 16);
    const s = String(value).trim();
    return s || null;
  }
  if (kind === "list") {
    const items = splitList(value);
    return items.length ? quote(items.join(",")) : null;
  }
  throw new Error(`Unknown field type: ${kind}`);
}

export function decode(kind: FieldType, raw: string): unknown {
  const text = unquote(raw);
  if (kind === "bool" || kind === "bool0") {
    return text.trim().toLowerCase() === "true";
  }
  if (kind === "id" || kind === "str") {
    return text;
  }
  if (kind === "int") {
    return parseIntSafe(text);
  }
  if (kind === "num") {
    return text.trim() ? parseNum(text) : null;
  }
  if (kind === "date") {
    return text.trim() ? parseDay(text) : null;
  }
  if (kind === "datetime") {
    return text.trim() ? parseDt(text) : null;
  }
  if (kind === "list") {
    return splitList(text);
  }
  throw new Error(`Unknown field type: ${kind}`);
}

// ── Frontmatter documents ─────────────────────────────────────────────────

/**
 * Read frontmatter document from disk.
 * Returns [values, extra, body] or null when the file cannot be read.
 */
export function readDoc(
  filePath: string,
  fields: readonly FieldDef[],
): [Record<string, unknown>, Record<string, unknown>, string] | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const text = fs.readFileSync(filePath, "utf-8");
    return parseDoc(text, fields);
  } catch {
    return null;
  }
}

export function parseDoc(
  text: string,
  fields: readonly FieldDef[],
): [Record<string, unknown>, Record<string, unknown>, string] {
  const types = new Map<string, FieldType>(fields as ReadonlyArray<[string, FieldType]>);
  const values: Record<string, unknown> = {};
  const extra: Record<string, unknown> = {};
  let bodyLines: string[] = [];

  const lines = (text ?? "").replace(/\r\n/g, "\n").split("\n");
  if (!lines.length || lines[0]!.trim() !== "---") {
    return [values, extra, (text ?? "").trim()];
  }

  let end: number | null = null;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trim() === "---") {
      end = i;
      break;
    }
    const m = KEY_RE.exec(line);
    if (!m) continue;

    const key = m[1]!;
    const raw = m[2]!;
    const fieldType = types.get(key);

    if (fieldType) {
      values[key] = decode(fieldType, raw);
    } else {
      const txt = unquote(raw);
      if ((txt.startsWith("[") && txt.endsWith("]")) || (txt.startsWith("{") && txt.endsWith("}"))) {
        try {
          extra[key] = JSON.parse(txt);
        } catch {
          extra[key] = txt;
        }
      } else {
        extra[key] = txt;
      }
    }
  }

  if (end !== null) {
    bodyLines = lines.slice(end + 1);
  }

  return [values, extra, bodyLines.join("\n").trim()];
}

export function dumpDoc(
  fields: readonly FieldDef[],
  values: Record<string, unknown>,
  extra?: Record<string, unknown> | null,
  body: string = "",
): string {
  const out: string[] = ["---"];

  for (const [key, kind] of fields) {
    const text = encode(kind, values[key]);
    if (text !== null) {
      out.push(`${key}: ${text}`);
    }
  }

  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (value !== null && value !== undefined && String(value) !== "") {
        if (Array.isArray(value)) {
          out.push(`${key}: ${JSON.stringify(value)}`);
        } else if (typeof value === "object" || typeof value === "boolean" || typeof value === "number") {
          out.push(`${key}: ${JSON.stringify(value)}`);
        } else {
          out.push(`${key}: ${quote(value)}`);
        }
      }
    }
  }

  out.push("---");
  const trimmedBody = (body || "").trim();
  if (trimmedBody) {
    out.push("");
    out.push(trimmedBody);
  }

  return out.join("\n") + "\n";
}

// ── Files ─────────────────────────────────────────────────────────────────

/** Write through a temporary file so a crash never leaves half a file. */
export function writeText(filePath: string, text: string): void {
  const p = path.resolve(filePath);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = path.join(path.dirname(p), `${path.basename(p)}.tmp`);
  fs.writeFileSync(tmp, text, "utf-8");
  fs.renameSync(tmp, p);
}

export function dumpJson(data: unknown): string {
  return JSON.stringify(data, null, 2) + "\n";
}

export function loadJson<T = unknown>(filePath: string, defaultValue: T | null = null): T | null {
  try {
    if (!fs.existsSync(filePath)) return defaultValue;
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content) as T;
  } catch {
    return defaultValue;
  }
}

export function writeJson(filePath: string, data: unknown): void {
  writeText(filePath, dumpJson(data));
}

export function trashDir(vaultRoot: string): string {
  return path.join(vaultRoot, LAYOUT.trash_dir);
}

export function toTrash(vaultRoot: string, targetPath: string, bucket: string): string | null {
  const p = path.resolve(targetPath);
  if (!fs.existsSync(p)) return null;

  const folder = path.join(trashDir(vaultRoot), bucket);
  fs.mkdirSync(folder, { recursive: true });

  const parsed = path.parse(p);
  let target = path.join(folder, parsed.base);
  let n = 1;
  while (fs.existsSync(target)) {
    target = path.join(folder, `${parsed.name} ${n}${parsed.ext}`);
    n++;
  }
  fs.renameSync(p, target);
  return target;
}

/** Remember a parsed value per path until the file's mtime changes. */
export class MtimeCache<T = unknown> {
  private data = new Map<string, [number, T]>();

  get(filePath: string, loader: (p: string | null) => T): T {
    const p = path.resolve(filePath);
    let mtime: number;
    try {
      mtime = fs.statSync(p).mtimeMs;
    } catch {
      this.data.delete(p);
      return loader(null);
    }
    const hit = this.data.get(p);
    if (hit && hit[0] === mtime) {
      return hit[1];
    }
    const value = loader(p);
    this.data.set(p, [mtime, value]);
    return value;
  }

  forget(filePath?: string | null): void {
    if (!filePath) {
      this.data.clear();
    } else {
      this.data.delete(path.resolve(filePath));
    }
  }
}
