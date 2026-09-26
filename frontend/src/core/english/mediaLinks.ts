// Ported from notevault_app/core/english/media_links.py
// Timestamp links to a moment of a media file in the vault.
// Format: [mm:ss](nv://media?file=<vault-relative path, percent-encoded>&t=<seconds>)

import * as path from "node:path";
import { AUDIO_EXTS, VIDEO_EXTS } from "../attachments.js";

export const MEDIA_EXTS = new Set<string>([
  ...VIDEO_EXTS,
  ...AUDIO_EXTS,
  ".mpg",
  ".mpeg",
  ".wmv",
  ".opus",
  ".wma",
]);

export function isMediaFile(p: string): boolean {
  return MEDIA_EXTS.has(path.extname(String(p)).toLowerCase());
}

export function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.trunc(seconds));
  const h = Math.floor(total / 3600);
  const rest = total % 3600;
  const m = Math.floor(rest / 60);
  const s = rest % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function secondsText(seconds: number): string {
  const value = Math.round(Math.max(0, seconds) * 10) / 10;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** urllib.parse.quote(s, safe="/"): percent-encode everything except letters,
 * digits and _.-~ and "/". encodeURIComponent leaves !'()* unescaped and
 * escapes "/", so fix both. */
function quotePath(s: string): string {
  return encodeURIComponent(s)
    .replace(/%2F/gi, "/")
    .replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

export function vaultRelative(p: string, vaultRoot: string | null): string {
  if (vaultRoot != null) {
    const rel = path.relative(path.resolve(vaultRoot), path.resolve(p));
    if (rel && !rel.startsWith("..") && !path.isAbsolute(rel)) {
      return rel.split(path.sep).join("/");
    }
  }
  return String(p).split(path.sep).join("/");
}

export function mediaUrl(relPath: string, seconds: number): string {
  return `nv://media?file=${quotePath(String(relPath).replace(/\\/g, "/"))}&t=${secondsText(seconds)}`;
}

export function mediaLink(relPath: string, seconds: number, label: string | null = null): string {
  return `[${label ?? formatTimestamp(seconds)}](${mediaUrl(relPath, seconds)})`;
}

function clockSeconds(text: string): number {
  let total = 0;
  for (const part of text.split(":")) {
    const n = Number(part);
    if (!Number.isFinite(n)) return 0;
    total = total * 60 + n;
  }
  return Math.max(0, total);
}

export function parseMediaUrl(url: string | null | undefined): [string, number] | null {
  const s = String(url ?? "").trim();
  const m = /^nv:\/\/media\/?(?:\?(.*))?$/i.exec(s);
  if (!m) return null;
  const qs = new URLSearchParams(m[1] ?? "");
  const file = (qs.get("file") ?? "").trim();
  if (!file) return null;
  const rawT = (qs.get("t") ?? "0").trim().toLowerCase().replace(/s$/, "");
  const n = Number(rawT || "0");
  const seconds = Number.isFinite(n) ? Math.max(0, n) : clockSeconds(rawT);
  return [file, seconds];
}

export function resolveMedia(file: string, vaultRoot: string | null): string {
  return !path.isAbsolute(file) && vaultRoot != null ? path.join(vaultRoot, file) : file;
}

export const is_media_file = isMediaFile;
export const format_timestamp = formatTimestamp;
export const vault_relative = vaultRelative;
export const media_url = mediaUrl;
export const media_link = mediaLink;
export const parse_media_url = parseMediaUrl;
export const resolve_media = resolveMedia;
