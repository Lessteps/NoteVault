/**
 * Files attached to module entities (facturas, capturas).
 * Ported from notevault_app/core/module_attachments.py.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { parseIsoDate } from "./dates";
import { relPosix } from "./paths";
import { toTrash } from "./store";
import { ATTACHMENT_EXTS, DATA_DIR } from "./vaultFormat";

export function dataRoot(vaultRoot: string): string {
  return path.join(vaultRoot, DATA_DIR);
}

export function folderFor(vaultRoot: string, moduleName: string, day: Date | string): string {
  const d = typeof day === "string" ? parseIsoDate(day) ?? new Date() : day;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return path.join(dataRoot(vaultRoot), moduleName, "adjuntos", String(year), month);
}

function nextName(folder: string, owner: string, ext: string): string {
  let n = 1;
  while (true) {
    const candidate = path.join(folder, `${owner}-${n}${ext}`);
    if (!fs.existsSync(candidate)) {
      return candidate;
    }
    n++;
  }
}

export function isSupported(filePath: string): boolean {
  const ext = path.extname(String(filePath)).toLowerCase();
  return (ATTACHMENT_EXTS as readonly string[]).includes(ext);
}

/** Copy source into the vault attachments folder and return relative reference. Never overwrites. */
export function storeFile(
  vaultRoot: string,
  moduleName: string,
  owner: string,
  sourcePath: string,
  day?: Date | string | null,
): string {
  const source = path.resolve(sourcePath);
  const ext = path.extname(source).toLowerCase();
  if (!isSupported(source)) {
    throw new Error(`Tipo de archivo no admitido: ${ext || path.basename(source)}`);
  }
  const folder = folderFor(vaultRoot, moduleName, day || new Date());
  fs.mkdirSync(folder, { recursive: true });
  const finalExt = ext === ".jpeg" ? ".jpg" : ext;
  const target = nextName(folder, owner, finalExt);
  fs.copyFileSync(source, target);
  return relPosix(dataRoot(vaultRoot), target);
}

export function storeImageBytes(
  vaultRoot: string,
  moduleName: string,
  owner: string,
  buffer: Buffer,
  day?: Date | string | null,
): string {
  const folder = folderFor(vaultRoot, moduleName, day || new Date());
  fs.mkdirSync(folder, { recursive: true });
  const target = nextName(folder, owner, ".png");
  fs.writeFileSync(target, buffer);
  return relPosix(dataRoot(vaultRoot), target);
}

/** Absolute path of a reference, or null when the file does not exist. */
export function resolveModuleAttachment(vaultRoot: string, reference: string): string | null {
  if (!reference) return null;
  const clean = reference.trim();
  if (path.isAbsolute(clean) || clean.split(/[\\/]/).includes("..")) {
    return null;
  }
  const p = path.join(dataRoot(vaultRoot), clean);
  return fs.existsSync(p) ? p : null;
}

export function removeModuleAttachment(vaultRoot: string, reference: string, bucket: string): void {
  const p = resolveModuleAttachment(vaultRoot, reference);
  if (p) {
    toTrash(vaultRoot, p, bucket);
  }
}
