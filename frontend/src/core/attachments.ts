/**
 * Attachments embedded in notes.
 * Ported from notevault_app/core/attachments.py.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { formatDate } from "./dates";
import { relPosix, toPosix } from "./paths";

export const ATTACHMENTS_DIR = "attachments";

export const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"]);
export const VIDEO_EXTS = new Set([".mp4", ".mov", ".webm", ".mkv", ".m4v", ".avi"]);
export const AUDIO_EXTS = new Set([".mp3", ".wav", ".ogg", ".m4a", ".flac", ".aac"]);
export const PDF_EXTS = new Set([".pdf"]);

const UNSAFE = /[\\/:*?"<>|]+/g;

export type AttachmentKind = "image" | "video" | "audio" | "pdf" | null;

export function kindOf(filePath: string): AttachmentKind {
  const ext = path.extname(String(filePath)).toLowerCase();
  if (IMAGE_EXTS.has(ext)) return "image";
  if (VIDEO_EXTS.has(ext)) return "video";
  if (AUDIO_EXTS.has(ext)) return "audio";
  if (PDF_EXTS.has(ext)) return "pdf";
  return null;
}

export function fsPath(p: string): string {
  if (process.platform !== "win32") {
    return p;
  }
  const resolved = path.resolve(p);
  if (resolved.length < 248 || resolved.startsWith("\\\\?\\")) {
    return resolved;
  }
  if (resolved.startsWith("\\\\")) {
    return "\\\\?\\UNC\\" + resolved.slice(2);
  }
  return "\\\\?\\" + resolved;
}

export function uniqueName(folder: string, name: string): string {
  const parsed = path.parse(name);
  let candidate = path.join(folder, name);
  let n = 1;
  while (fs.existsSync(fsPath(candidate))) {
    candidate = path.join(folder, `${parsed.name} ${n}${parsed.ext}`);
    n++;
  }
  return candidate;
}

export function attachmentsFolder(notePath: string): string {
  return path.join(path.dirname(notePath), ATTACHMENTS_DIR);
}

export function importFile(notePath: string, sourcePath: string): string {
  const source = path.resolve(sourcePath);
  const folder = attachmentsFolder(notePath);
  try {
    if (path.resolve(path.dirname(source)) === path.resolve(folder)) {
      return source;
    }
  } catch {
    // Ignore error
  }
  fs.mkdirSync(fsPath(folder), { recursive: true });
  const safe = path.basename(source).replace(UNSAFE, "_").trim() || "archivo";
  const target = uniqueName(folder, safe);
  fs.copyFileSync(fsPath(source), fsPath(target));
  return target;
}

export function importImageBytes(notePath: string, buffer: Buffer): string {
  const folder = attachmentsFolder(notePath);
  fs.mkdirSync(fsPath(folder), { recursive: true });
  const stamp = formatDate(new Date(), "%Y%m%d-%H%M%S");
  const target = uniqueName(folder, `Pegado ${stamp}.png`);
  fs.writeFileSync(fsPath(target), buffer);
  return target;
}

export function markdownFor(notePath: string, attachmentPath: string): string {
  let rel: string;
  try {
    rel = relPosix(path.dirname(notePath), attachmentPath);
  } catch {
    rel = toPosix(attachmentPath);
  }
  const target = rel.includes(" ") ? `<${rel}>` : rel;
  return `![](${target})`;
}

const searchCache = new Map<string, string | null>();
const MAX_SEARCH_DIRS = 3000;

export function resolveAttachment(
  notePath: string,
  name: string,
  vaultRoot?: string | null,
): string | null {
  const clean = name.trim();
  if (!clean) return null;

  const noteDir = path.dirname(notePath);
  const raw = clean;
  const candidates: string[] = path.isAbsolute(raw)
    ? [raw]
    : [
        path.join(noteDir, raw),
        path.join(noteDir, ATTACHMENTS_DIR, path.basename(raw)),
      ];

  if (vaultRoot && !path.isAbsolute(raw)) {
    candidates.push(path.join(vaultRoot, raw));
  }

  for (const c of candidates) {
    if (fs.existsSync(fsPath(c))) {
      return c;
    }
  }

  if (vaultRoot && path.basename(raw) === raw) {
    return findInVault(vaultRoot, path.basename(raw));
  }

  return null;
}

export function findInVault(root: string, filename: string): string | null {
  const key = `${path.resolve(root)}|${filename.toLowerCase()}`;
  if (searchCache.has(key)) {
    return searchCache.get(key)!;
  }

  const IGNORED = new Set([
    "node_modules", "__pycache__", "site-packages", "venv", ".venv", "env",
    "dist", "build", "target", "out", "bin", "obj", ".git", ".idea",
    ".vscode", ".next", ".cache", "vendor",
  ]);

  let found: string | null = null;
  let visited = 0;
  const stack = [path.resolve(root)];

  while (stack.length) {
    const dir = stack.pop()!;
    visited++;
    if (visited >= MAX_SEARCH_DIRS) break;

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (!IGNORED.has(entry.name) && !entry.name.startsWith(".")) {
            stack.push(path.join(dir, entry.name));
          }
        } else if (entry.isFile()) {
          if (entry.name.toLowerCase() === filename.toLowerCase()) {
            found = path.join(dir, entry.name);
            break;
          }
        }
      }
      if (found) break;
    } catch {
      continue;
    }
  }

  searchCache.set(key, found);
  return found;
}
