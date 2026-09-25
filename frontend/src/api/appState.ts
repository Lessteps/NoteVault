// Ported from the non-module core of notevault_app/webapp/api.py (NoteVaultApi).
//
// Shared state and path plumbing behind every API module. Paths coming from
// the UI are vault-relative POSIX strings; resolve() turns them into real
// paths and refuses anything that escapes the vault or touches internal
// folders. The Python bridge used a per-call lock because pywebview ran each
// call on its own thread; the Electron main process is single-threaded, so no
// lock is needed.

import * as fs from "node:fs";
import * as path from "node:path";
import { ApiError } from "../core/errors.js";
import { kindFor } from "../core/fileKinds.js";
import { dumpFrontmatter } from "../core/frontmatter.js";
import { NotesService } from "../core/notesService.js";
import { VaultManager } from "../core/vaultManager.js";
import { Managers } from "./context.js";

export const MAX_WRITE_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
export const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"]);
export const API_VERSION = 1;

export interface ResolveOpts {
  mustExist?: boolean;
  allowRoot?: boolean;
}

/** Frontmatter can hold dates and other YAML types; JSON cannot. */
export function jsonSafe(value: unknown): unknown {
  if (
    value === null ||
    value === undefined ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return value ?? null;
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value instanceof Set) return [...value].map(jsonSafe);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[String(k)] = jsonSafe(v);
    }
    return out;
  }
  return String(value);
}

/** Replace (or add, or remove when null) top-level frontmatter keys, leaving
 * every other line exactly as it was, nested YAML included. */
export function setFrontmatterKeys(text: string, updates: Record<string, unknown>): string {
  const lines = text.split("\n");
  let end: number | null = null;
  if (lines.length && lines[0]!.trim() === "---") {
    for (let i = 1; i < lines.length; i++) {
      if (lines[i]!.trim() === "---") {
        end = i;
        break;
      }
    }
  }
  let head: string[];
  let body: string[];
  if (end === null) {
    head = [];
    body = lines;
  } else {
    head = lines.slice(1, end);
    body = lines.slice(end + 1);
  }
  const keep: string[] = [];
  let skipping = false;
  for (const ln of head) {
    let key: string | null = null;
    if (ln && !/^\s/.test(ln) && ln.includes(":")) {
      key = ln.split(":", 1)[0]!.trim();
    }
    if (key !== null) {
      skipping = key in updates;
    } else if (ln.trim().startsWith("- ") || (/^\s/.test(ln) && ln.trim())) {
      // continuation of the previous key
    } else {
      skipping = false;
    }
    if (!skipping) keep.push(ln);
  }
  const newKeys = Object.keys(updates).filter((k) => updates[k] !== null && updates[k] !== undefined);
  let added: string[] = [];
  if (newKeys.length) {
    const obj: Record<string, unknown> = {};
    for (const k of newKeys) obj[k] = updates[k];
    added = dumpFrontmatter(obj).split("\n").slice(1, -2);
  }
  const newHead = [...keep, ...added];
  if (!newHead.length) return body.join("\n");
  return ["---", ...newHead, "---", ...body].join("\n");
}

export class AppState {
  vault!: VaultManager;
  service!: NotesService;
  root!: string;
  window: unknown = null;
  unsaved = 0;
  closeOk = false;
  private managers: Managers | null = null;

  constructor(vaultPath: string) {
    this.open(vaultPath);
  }

  open(vaultPath: string): void {
    this.vault = new VaultManager(vaultPath);
    this.service = new NotesService(this.vault);
    this.root = path.resolve(this.vault.vaultRoot);
    this.managers = null;
  }

  mgrs(): Managers {
    let m = this.managers;
    if (m === null || m.root !== this.root) {
      m = this.managers = new Managers(this.root);
      return m;
    }
    return m.fresh();
  }

  rel(p: string): string {
    return path.relative(this.root, path.resolve(p)).split(path.sep).join("/");
  }

  /** Vault-relative string -> absolute path inside the vault, or ApiError. */
  resolve(rel: unknown, opts: ResolveOpts = {}): string {
    const mustExist = opts.mustExist ?? true;
    const allowRoot = opts.allowRoot ?? false;
    if (typeof rel !== "string") throw new ApiError("Ruta inválida.");
    let r = rel.trim().replace(/\\/g, "/");
    if (r.includes("\x00")) throw new ApiError("Ruta inválida.");
    if (r === "" || r === ".") {
      if (allowRoot) return this.root;
      throw new ApiError("Ruta vacía.");
    }
    if (r.startsWith("/") || (r.length > 1 && r[1] === ":")) {
      throw new ApiError("Solo se aceptan rutas dentro del vault.");
    }
    const parts = r.split("/").filter((p) => p !== "" && p !== ".");
    if (parts.some((p) => p === "..")) {
      throw new ApiError("Solo se aceptan rutas dentro del vault.");
    }
    if (parts.some((p) => p.startsWith("."))) {
      throw new ApiError("Esa carpeta es interna de NoteVault.");
    }
    const abs = path.resolve(this.root, ...parts);
    if (abs !== this.root && !isInside(this.root, abs)) {
      throw new ApiError("Solo se aceptan rutas dentro del vault.");
    }
    if (mustExist && !fs.existsSync(abs)) {
      throw new ApiError(`No existe: ${rel}`);
    }
    return abs;
  }

  entry(item: {
    path: string;
    type: string;
    name: string;
    kind?: string | null;
  }): Record<string, unknown> {
    const p = item.path;
    const out: Record<string, unknown> = {
      type: item.type,
      name: item.name,
      path: this.rel(p),
    };
    if (item.type === "folder") {
      out.has_children = this.service.hasChildren(p);
    } else {
      out.kind = item.kind || kindFor(p);
    }
    return out;
  }
}

function isInside(root: string, child: string): boolean {
  const rel = path.relative(root, child);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}
