// Proyectos · carpetas vinculadas: a project points at real Windows folders, and
// this module is the only door to their files. Everything that touches the disk
// resolves its path through `resolveInside`, so "..", absolute paths and symlinks
// that leave the linked root are refused before any syscall.
//
// The links themselves live in the project's frontmatter (`extra.folders`), so the
// vault keeps holding the model and nothing here needs a schema change.

import * as fs from "node:fs";
import * as path from "node:path";
import { ApiError } from "../../core/errors.js";
import type { AppState } from "../appState.js";
import { oneLine } from "../common.js";

/** Folders that never show up in the tree. */
const IGNORED = new Set([".git", "node_modules", ".notevault", "$RECYCLE.BIN", "System Volume Information"]);
const MAX_ENTRIES = 5000;
const MAX_DEPTH = 12;
/** Above this a text file opens read-only, as asked for in the brief. */
export const READONLY_BYTES = 2 * 1024 * 1024;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export interface LinkedFolder {
  id: string;
  path: string;
  name: string;
  /** The destination: exactly one per project, where new notes are created. */
  target: boolean;
  /** The folder is linked but gone (moved, renamed, unplugged). */
  missing?: boolean;
}

export interface TreeEntry {
  name: string;
  rel: string;
  dir: boolean;
  size: number;
  modified: number;
}

function newId(prefix: string): string {
  const stamp = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
  const rnd = Math.random().toString(16).slice(2, 6);
  return `${prefix}${stamp}-${rnd}`;
}

function isTempName(name: string): boolean {
  return name.startsWith("~$") || name.endsWith(".tmp") || name.endsWith(".swp") || name.endsWith(".crdownload") || name.endsWith(".part");
}

function samePath(a: string, b: string): boolean {
  return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
}

/** True when `child` is `root` or really sits inside it (after following symlinks). */
function insideRoot(root: string, child: string): boolean {
  const rel = path.relative(root, child);
  if (rel === "") return true;
  return !rel.startsWith("..") && !path.isAbsolute(rel);
}

function realOf(p: string): string {
  try {
    return fs.realpathSync.native(p);
  } catch {
    return p;
  }
}

export function projectFoldersApi(app: AppState) {
  const pm = () => app.mgrs().projects;

  /** The project's linked folders, normalised (older records may lack the field). */
  function folders(pid: string): LinkedFolder[] {
    const p = pm().get(pid);
    if (!p) throw new ApiError("Ese proyecto ya no existe.");
    const raw = (p.extra as Record<string, unknown>)?.folders;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((f): f is Record<string, unknown> => Boolean(f) && typeof f === "object")
      .map((f) => ({
        id: String(f.id || ""),
        path: String(f.path || ""),
        name: String(f.name || path.basename(String(f.path || ""))),
        target: Boolean(f.target),
      }))
      .filter((f) => f.id && f.path);
  }

  function store(pid: string, list: LinkedFolder[]): LinkedFolder[] {
    // Exactly one destination; if none is marked, the first one is. Removing the
    // destination (or the whole list) is fine: nothing on disk is touched.
    const clean = list.map((f, i) => ({ ...f, target: list.some((x) => x.target) ? f.target : i === 0 }));
    const first = clean.findIndex((f) => f.target);
    clean.forEach((f, i) => {
      f.target = i === first;
    });
    pm().update(pid, { extra: { folders: clean } });
    return clean;
  }

  function folderOrFail(pid: string, folderId: string): { list: LinkedFolder[]; folder: LinkedFolder } {
    const list = folders(pid);
    const folder = list.find((f) => f.id === folderId);
    if (!folder) throw new ApiError("Esa carpeta no está vinculada al proyecto.");
    return { list, folder };
  }

  /** The absolute path of `rel` inside a linked root, or a refusal. */
  function resolveInside(folder: LinkedFolder, rel = "", opts: { mustExist?: boolean; allowRoot?: boolean } = {}): string {
    const { mustExist = true, allowRoot = false } = opts;
    const raw = String(rel ?? "");
    if (path.isAbsolute(raw) || /^[a-zA-Z]:/.test(raw)) {
      throw new ApiError("No se admiten rutas absolutas.");
    }
    const parts = raw.split(/[\\/]+/).filter((x) => x !== "" && x !== ".");
    if (parts.some((x) => x === "..")) {
      throw new ApiError("La ruta sale de la carpeta vinculada.");
    }
    const root = path.resolve(folder.path);
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
      throw new ApiError("La carpeta vinculada ya no existe o no es accesible.");
    }
    const abs = parts.length ? path.resolve(root, ...parts) : root;
    if (!allowRoot && samePath(abs, root)) {
      throw new ApiError("Falta indicar el archivo.");
    }
    if (!insideRoot(root, abs)) {
      throw new ApiError("La ruta sale de la carpeta vinculada.");
    }
    // A symlink inside the tree could still point outside: follow the deepest
    // existing part of the path and check where it really lands.
    const realRoot = realOf(root);
    let probe = abs;
    while (!fs.existsSync(probe)) {
      const parent = path.dirname(probe);
      if (parent === probe) break;
      probe = parent;
    }
    const realProbe = realOf(probe);
    if (!samePath(realProbe, realRoot) && !insideRoot(realRoot, realProbe)) {
      throw new ApiError("La ruta sale de la carpeta vinculada (enlace simbólico).");
    }
    if (mustExist && !fs.existsSync(abs)) {
      throw new ApiError("El archivo ya no existe.");
    }
    return abs;
  }

  /** A name we are willing to write on disk. */
  function cleanName(value: unknown, isFolder: boolean): string {
    const base = String(value ?? "").replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();
    const name = oneLine(base, 120);
    if (!name || name.startsWith(".") || name === "..") {
      throw new ApiError("Nombre de archivo inválido.");
    }
    if (isFolder) return name;
    return /\.[a-z0-9]{1,6}$/i.test(name) ? name : `${name}.md`;
  }

  /** "nota.md" -> "nota (2).md" when the name is taken. */
  function freePath(dir: string, name: string): string {
    const ext = path.extname(name);
    const stem = name.slice(0, name.length - ext.length);
    let candidate = path.join(dir, name);
    let n = 2;
    while (fs.existsSync(candidate)) {
      candidate = path.join(dir, `${stem} (${n})${ext}`);
      n += 1;
    }
    return candidate;
  }

  function walk(root: string, current: string, depth: number, out: TreeEntry[]): void {
    if (depth > MAX_DEPTH || out.length >= MAX_ENTRIES) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (IGNORED.has(e.name) || isTempName(e.name)) continue;
      const abs = path.join(current, e.name);
      let stat: fs.Stats;
      try {
        stat = fs.statSync(abs);
      } catch {
        continue;
      }
      const dir = stat.isDirectory();
      out.push({
        name: e.name,
        rel: path.relative(root, abs).split(path.sep).join("/"),
        dir,
        size: dir ? 0 : stat.size,
        modified: Math.round(stat.mtimeMs),
      });
      if (out.length >= MAX_ENTRIES) return;
      if (dir) walk(root, abs, depth + 1, out);
    }
  }

  function trash(abs: string): void {
    // Windows' recycle bin when we run inside Electron; otherwise a soft delete
    // inside the vault, so nothing is ever destroyed outright.
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const electron = require("electron") as { shell?: { trashItem(p: string): Promise<void> } };
      if (electron?.shell?.trashItem) {
        void electron.shell.trashItem(abs);
        return;
      }
    } catch {
      // Outside the app: fall through to the local bin.
    }
    const bin = path.join(app.root, ".notevault", ".papelera", "vinculadas");
    fs.mkdirSync(bin, { recursive: true });
    fs.renameSync(abs, path.join(bin, `${Date.now()}-${path.basename(abs)}`));
  }

  return {
    /** The native folder picker; `path: null` when the user closes it. */
    async projects_pick_folder(): Promise<{ path: string | null }> {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const electron = require("electron") as {
        dialog?: { showOpenDialog(o?: unknown, options?: unknown): Promise<{ canceled: boolean; filePaths: string[] }> };
        BrowserWindow?: { getFocusedWindow(): unknown };
      };
      if (!electron?.dialog) {
        throw new ApiError("El selector de carpetas solo está disponible dentro de la app.");
      }
      const win = electron.BrowserWindow?.getFocusedWindow() ?? null;
      const options = {
        title: "Vincular una carpeta",
        properties: ["openDirectory", "createDirectory"],
      };
      const res = win
        ? await electron.dialog.showOpenDialog(win, options)
        : await electron.dialog.showOpenDialog(options);
      if (res.canceled || !res.filePaths.length) return { path: null };
      return { path: res.filePaths[0]! };
    },

    projects_folders(pid: string): LinkedFolder[] {
      return folders(pid).map((f) => ({ ...f, missing: !fs.existsSync(f.path) }));
    },

    /** Link a folder. Never writes anything on disk (that is phase 4's job). */
    projects_folder_link(pid: string, folderPath: string): { folder: LinkedFolder; folders: LinkedFolder[]; warning: string } {
      const raw = String(folderPath || "").trim();
      if (!raw) throw new ApiError("Ruta vacía.");
      const abs = path.resolve(raw);
      let stat: fs.Stats;
      try {
        stat = fs.statSync(abs);
      } catch {
        throw new ApiError("La carpeta no existe o no es accesible.");
      }
      if (!stat.isDirectory()) throw new ApiError("Eso no es una carpeta.");
      const list = folders(pid);
      const already = list.find((f) => samePath(f.path, abs));
      if (already) return { folder: already, folders: list, warning: "" };

      let warning = "";
      const other = path.join(abs, ".notevault", "project.json");
      if (fs.existsSync(other)) {
        try {
          const info = JSON.parse(fs.readFileSync(other, "utf-8")) as { project_id?: string; name?: string };
          if (info.project_id && info.project_id !== pid) {
            warning = `Esa carpeta está vinculada al proyecto «${info.name || info.project_id}». Se añadirá igualmente, pero comparten archivo .notevault.`;
          }
        } catch {
          warning = "Esa carpeta tiene un .notevault/project.json ilegible.";
        }
      }
      try {
        fs.accessSync(abs, fs.constants.W_OK);
      } catch {
        warning = `${warning ? `${warning} ` : ""}La carpeta es de solo lectura: podrás abrir archivos, pero no crear ni guardar.`;
      }

      const folder: LinkedFolder = { id: newId("f"), path: abs, name: path.basename(abs) || abs, target: false };
      const next = store(pid, [...list, folder]);
      return { folder: next.find((f) => f.id === folder.id)!, folders: next, warning };
    },

    /** Unlink only: nothing on disk is touched. */
    projects_folder_unlink(pid: string, folderId: string): { folders: LinkedFolder[] } {
      const { list } = folderOrFail(pid, folderId);
      return { folders: store(pid, list.filter((f) => f.id !== folderId)) };
    },

    projects_folder_target(pid: string, folderId: string): { folders: LinkedFolder[] } {
      const { list } = folderOrFail(pid, folderId);
      return { folders: store(pid, list.map((f) => ({ ...f, target: f.id === folderId }))) };
    },

    /** The whole tree of a linked folder: the explorer renders it as it comes. */
    projects_folder_tree(pid: string, folderId: string): { folder: LinkedFolder; entries: TreeEntry[] } {
      const { folder } = folderOrFail(pid, folderId);
      const root = path.resolve(folder.path);
      if (!fs.existsSync(root)) return { folder, entries: [] };
      const entries: TreeEntry[] = [];
      walk(root, root, 0, entries);
      return { folder, entries };
    },

    projects_file_read(pid: string, folderId: string, rel: string): {
      raw: string; modified: number; size: number; kind: string; readonly: boolean;
    } {
      const { folder } = folderOrFail(pid, folderId);
      const abs = resolveInside(folder, rel);
      const stat = fs.statSync(abs);
      if (!stat.isFile()) throw new ApiError("Eso no es un archivo.");
      const ext = path.extname(abs).toLowerCase();
      const kind = ext === ".md" || ext === ".markdown" ? "markdown" : ext === ".txt" ? "text" : ext === ".json" || ext === ".yml" || ext === ".yaml" || ext === ".csv" ? "code" : "binary";
      if (kind === "binary") {
        return { raw: "", modified: Math.round(stat.mtimeMs), size: stat.size, kind, readonly: true };
      }
      const raw = fs.readFileSync(abs, "utf-8");
      return {
        raw,
        modified: Math.round(stat.mtimeMs),
        size: stat.size,
        kind,
        readonly: stat.size > READONLY_BYTES,
      };
    },

    /** Atomic save: write a sibling temp file, then rename over the original. */
    projects_file_write(pid: string, folderId: string, rel: string, raw: string, expectedModified?: number | null): {
      ok: boolean; conflict: boolean; modified: number;
    } {
      if (typeof raw !== "string") throw new ApiError("Contenido inválido.");
      if (Buffer.byteLength(raw, "utf-8") > MAX_FILE_BYTES) throw new ApiError("El archivo supera el tamaño máximo (10 MB).");
      const { folder } = folderOrFail(pid, folderId);
      const abs = resolveInside(folder, rel);
      const stat = fs.existsSync(abs) ? fs.statSync(abs) : null;
      if (!stat) throw new ApiError("El archivo ya no existe.");
      if (expectedModified !== undefined && expectedModified !== null) {
        if (Math.abs(stat.mtimeMs - Number(expectedModified)) > 1) {
          return { ok: false, conflict: true, modified: Math.round(stat.mtimeMs) };
        }
      }
      const tmp = `${abs}.nv-${process.pid}.tmp`;
      fs.writeFileSync(tmp, raw, "utf-8");
      fs.renameSync(tmp, abs);
      return { ok: true, conflict: false, modified: Math.round(fs.statSync(abs).mtimeMs) };
    },

    projects_file_create(pid: string, folderId: string, rel: string, name: string, isFolder = false): { entry: TreeEntry } {
      const { folder } = folderOrFail(pid, folderId);
      const dir = resolveInside(folder, rel || "", { allowRoot: true });
      if (!fs.statSync(dir).isDirectory()) throw new ApiError("El destino no es una carpeta.");
      const clean = cleanName(name, Boolean(isFolder));
      const abs = freePath(dir, clean);
      if (isFolder) {
        fs.mkdirSync(abs, { recursive: false });
      } else {
        fs.writeFileSync(abs, "", "utf-8");
      }
      const stat = fs.statSync(abs);
      return {
        entry: {
          name: path.basename(abs),
          rel: path.relative(path.resolve(folder.path), abs).split(path.sep).join("/"),
          dir: Boolean(isFolder),
          size: stat.size,
          modified: Math.round(stat.mtimeMs),
        },
      };
    },

    projects_file_rename(pid: string, folderId: string, rel: string, newName: string): { entry: TreeEntry } {
      const { folder } = folderOrFail(pid, folderId);
      const abs = resolveInside(folder, rel);
      const stat = fs.statSync(abs);
      const clean = cleanName(newName, stat.isDirectory());
      const dest = path.join(path.dirname(abs), clean);
      if (!samePath(abs, dest) && fs.existsSync(dest)) throw new ApiError("Ya existe algo con ese nombre.");
      fs.renameSync(abs, dest);
      const now = fs.statSync(dest);
      return {
        entry: {
          name: path.basename(dest),
          rel: path.relative(path.resolve(folder.path), dest).split(path.sep).join("/"),
          dir: now.isDirectory(),
          size: now.isDirectory() ? 0 : now.size,
          modified: Math.round(now.mtimeMs),
        },
      };
    },

    /** Drag & drop inside the tree (or into another linked folder of the project). */
    projects_file_move(pid: string, folderId: string, rel: string, destRel: string, destFolderId?: string): { entry: TreeEntry } {
      const { folder } = folderOrFail(pid, folderId);
      const src = resolveInside(folder, rel);
      const to = destFolderId ? folderOrFail(pid, destFolderId).folder : folder;
      const destDir = resolveInside(to, destRel || "", { allowRoot: true });
      if (!fs.statSync(destDir).isDirectory()) throw new ApiError("El destino no es una carpeta.");
      if (fs.statSync(src).isDirectory() && insideRoot(src, destDir)) {
        throw new ApiError("No se puede mover una carpeta dentro de sí misma.");
      }
      const dest = freePath(destDir, path.basename(src));
      fs.renameSync(src, dest);
      const now = fs.statSync(dest);
      return {
        entry: {
          name: path.basename(dest),
          rel: path.relative(path.resolve(to.path), dest).split(path.sep).join("/"),
          dir: now.isDirectory(),
          size: now.isDirectory() ? 0 : now.size,
          modified: Math.round(now.mtimeMs),
        },
      };
    },

    /** To the Windows recycle bin (never a permanent delete). */
    projects_file_delete(pid: string, folderId: string, rel: string): { ok: boolean } {
      const { folder } = folderOrFail(pid, folderId);
      const abs = resolveInside(folder, rel);
      trash(abs);
      return { ok: true };
    },

    projects_file_open(pid: string, folderId: string, rel: string, mode: "open" | "reveal" = "open"): { ok: boolean } {
      const { folder } = folderOrFail(pid, folderId);
      const abs = resolveInside(folder, rel);
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const electron = require("electron") as {
          shell?: { openPath(p: string): Promise<string>; showItemInFolder(p: string): void };
        };
        if (electron?.shell) {
          if (mode === "reveal") electron.shell.showItemInFolder(abs);
          else void electron.shell.openPath(abs);
        }
      } catch {
        // Outside the app there is nothing to open with.
      }
      return { ok: true };
    },

    /** Binary previews (images, PDF) as data URLs, so the renderer needs no file:// access. */
    projects_file_data(pid: string, folderId: string, rel: string, maxBytes = 25 * 1024 * 1024): { data_url: string; mime: string; size: number } {
      const { folder } = folderOrFail(pid, folderId);
      const abs = resolveInside(folder, rel);
      const stat = fs.statSync(abs);
      if (stat.size > maxBytes) throw new ApiError("El archivo es demasiado grande para previsualizarlo.");
      const ext = path.extname(abs).toLowerCase();
      const mime = ext === ".pdf" ? "application/pdf"
        : ext === ".svg" ? "image/svg+xml"
          : ext === ".png" ? "image/png"
            : ext === ".gif" ? "image/gif"
              : ext === ".webp" ? "image/webp"
                : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg"
                  : ext === ".bmp" ? "image/bmp"
                    : "application/octet-stream";
      return { data_url: `data:${mime};base64,${fs.readFileSync(abs).toString("base64")}`, mime, size: stat.size };
    },

    /**
     * Bring the project's legacy notes (kept inside .notevault) into the
     * destination folder as real .md files. Copies, never deletes: the old ones
     * stay where they were.
     */
    projects_notes_migrate(pid: string, folderId: string): { moved: string[]; skipped: string[] } {
      const { folder } = folderOrFail(pid, folderId);
      const target = resolveInside(folder, "", { allowRoot: true });
      const legacy = path.join(app.root, ".notevault", "proyectos", pid, "notas");
      const moved: string[] = [];
      const skipped: string[] = [];
      if (!fs.existsSync(legacy)) return { moved, skipped };
      const walkLegacy = (dir: string, rel: string): void => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          if (IGNORED.has(e.name) || isTempName(e.name)) continue;
          const abs = path.join(dir, e.name);
          const relPath = rel ? `${rel}/${e.name}` : e.name;
          if (e.isDirectory()) {
            walkLegacy(abs, relPath);
            continue;
          }
          const destDir = path.join(target, ...rel.split("/").filter(Boolean));
          fs.mkdirSync(destDir, { recursive: true });
          const dest = path.join(destDir, e.name);
          if (fs.existsSync(dest)) {
            skipped.push(relPath);
            continue;
          }
          fs.copyFileSync(abs, dest);
          moved.push(relPath);
        }
      };
      walkLegacy(legacy, "");
      return { moved, skipped };
    },

    /** Where the old notes live, without touching anything. */
    projects_notes_legacy(pid: string): { dir: string; files: string[] } {
      const legacy = path.join(app.root, ".notevault", "proyectos", pid, "notas");
      const files: string[] = [];
      const walkLegacy = (dir: string, rel: string): void => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          if (e.isDirectory()) walkLegacy(path.join(dir, e.name), rel ? `${rel}/${e.name}` : e.name);
          else if (!isTempName(e.name)) files.push(rel ? `${rel}/${e.name}` : e.name);
        }
      };
      if (fs.existsSync(legacy)) walkLegacy(legacy, "");
      return { dir: legacy, files };
    },
  };
}
