// Ported from notevault_app/webapp/modules/projects.py
// Proyectos: the bridge over core/projectManager (a single-user Jira).

import * as fs from "node:fs";
import * as path from "node:path";
import { ApiError } from "../../core/errors.js";
import {
  PALETTE,
  PROJECT_STATUS_COLORS,
  PROJECT_STATUSES,
  TYPE_COLOURS,
  TYPE_ICONS,
  type Issue,
  type Project,
  ProjectStats,
} from "../../core/projectManager.js";
import { Recurrence } from "../../core/recurrence.js";
import { toTrash } from "../../core/store.js";
import { DEFAULT_COLUMNS, ISSUE_TYPES } from "../../core/vaultFormat.js";
import type { AppState } from "../appState.js";
import {
  clampInt,
  isoDate,
  isoDt,
  oneLine,
  optDate,
  optDatetime,
  optTime,
} from "../common.js";
import { checkRef } from "./files.js";

const _HEX_RE = /^#[0-9a-fA-F]{6}$/;
const _KEY_RE = /^[A-Z0-9]{1,8}$/;
export const MAX_NOTE_BYTES = 5 * 1024 * 1024;

function listItem(value: unknown, maxLen = 60): string {
  // Lists are stored comma-separated: a comma would split the item.
  return oneLine(value, maxLen).replace(/,/g, " ").trim();
}

export function issueDict(i: Issue, today: Date): Record<string, unknown> {
  const extra = i.extra || {};
  let notes = extra.linked_notes || [];
  if (typeof notes === "string") {
    notes = [notes];
  }
  const cleanNotes = (Array.isArray(notes) ? notes : [])
    .filter((n): n is string => typeof n === "string")
    .map(String);

  return {
    id: i.id,
    number: i.number,
    key: i.key,
    type: i.type,
    icon: TYPE_ICONS[i.type] || "",
    type_colour: TYPE_COLOURS[i.type] || "#8b8b96",
    parent: i.parent,
    title: i.title,
    status: i.status,
    priority: i.priority,
    order: i.order,
    estimate_min: i.estimate_min,
    labels: [...(i.labels || [])],
    created: isoDate(i.created),
    start: isoDate(i.start),
    due: isoDate(i.due),
    due_time: i.due_time,
    repeat: i.repeat,
    repeat_until: isoDate(i.repeat_until),
    in_calendar: i.in_calendar,
    reminder: isoDt(i.reminder),
    done_at: isoDate(i.done_at),
    attachments: [...(i.attachments || [])],
    updated: isoDt(i.updated),
    description: i.description,
    children: (i.children || []).map((c) => c.id),
    done: i.is_done,
    overdue: i.is_overdue(today),
    linked_folder: String(extra.linked_folder || ""),
    linked_notes: cleanNotes,
  };
}

export function projectDict(p: Project, today: Date): Record<string, unknown> {
  return {
    id: p.id,
    key: p.key,
    name: p.name,
    status: p.status,
    status_colour: PROJECT_STATUS_COLORS[p.status] || "#8b8b96",
    area: p.area,
    colour: p.colour,
    icon: p.icon,
    created: isoDate(p.created),
    start: isoDate(p.start),
    deadline: isoDate(p.deadline),
    columns: [...p.columns],
    done_column: p.done_column,
    in_calendar: p.in_calendar,
    description: p.description,
    days_left: p.days_left(today),
    overdue: p.is_overdue(today),
  };
}

function projectFields(fields: unknown): Record<string, any> {
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
    throw new ApiError("Datos de proyecto inválidos.");
  }
  const f = fields as Record<string, any>;
  const out: Record<string, any> = {};

  if ("name" in f) {
    out.name = oneLine(f.name, 120) || "Nuevo proyecto";
  }
  if ("key" in f) {
    const key = oneLine(f.key, 8).toUpperCase();
    if (key && !_KEY_RE.test(key)) {
      throw new ApiError("La clave solo admite letras y números (máx. 8).");
    }
    if (key) {
      out.key = key;
    }
  }
  if ("icon" in f) {
    out.icon = oneLine(f.icon, 8);
  }
  if ("status" in f) {
    if (!PROJECT_STATUSES.includes(f.status)) {
      throw new ApiError("Estado inválido.");
    }
    out.status = f.status;
  }
  if ("area" in f) {
    out.area = String(f.area || "")
      .replace(/[^a-z0-9-]/gi, "")
      .slice(0, 60);
  }
  if ("colour" in f) {
    const c = String(f.colour || "");
    if (!_HEX_RE.test(c)) {
      throw new ApiError("Color inválido.");
    }
    out.colour = c;
  }
  for (const k of ["start", "deadline"]) {
    if (k in f) {
      out[k] = optDate(f[k]);
    }
  }
  if ("in_calendar" in f) {
    out.in_calendar = Boolean(f.in_calendar);
  }
  if ("description" in f) {
    out.description = String(f.description || "").slice(0, 100_000);
  }
  return out;
}

function parseColumns(
  fields: Record<string, any>,
): [string[], string, Record<string, string>] | null {
  const cols = fields.columns;
  if (cols === undefined || cols === null) {
    return null;
  }
  if (!Array.isArray(cols)) {
    throw new ApiError("Columnas inválidas.");
  }
  const clean: string[] = [];
  for (const c of cols) {
    const item = listItem(c, 40);
    if (item && !clean.includes(item)) {
      clean.push(item);
    }
  }
  if (!clean.length) {
    throw new ApiError("El flujo necesita al menos una columna.");
  }
  const done = listItem(fields.done_column, 40);
  const rawRenames = fields.renames || {};
  if (typeof rawRenames !== "object" || Array.isArray(rawRenames)) {
    throw new ApiError("Datos inválidos.");
  }
  const renames: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawRenames)) {
    renames[listItem(k, 40)] = listItem(v, 40);
  }
  return [clean, clean.includes(done) ? done : clean[clean.length - 1]!, renames];
}

function notesPath(root: string, rel: unknown, mustExist = true): string {
  const text = String(rel ?? "").trim().replace(/\\/g, "/");
  if (
    !text ||
    text.startsWith("/") ||
    text.includes("\0") ||
    text.includes(":")
  ) {
    throw new ApiError("Ruta inválida.");
  }
  const parts = text.split("/").filter((x) => x.length > 0);
  if (parts.some((x) => x === ".." || x === "." || x.startsWith("."))) {
    throw new ApiError("Ruta inválida.");
  }
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, ...parts);
  const relPath = path.relative(resolvedRoot, target);
  if (relPath.startsWith("..") || path.isAbsolute(relPath) || relPath === "") {
    throw new ApiError("Ruta inválida.");
  }
  if (mustExist && !fs.existsSync(target)) {
    throw new ApiError("Ese documento ya no existe.");
  }
  return target;
}

function listNotes(root: string): Array<Record<string, unknown>> {
  if (!fs.existsSync(root)) return [];
  const out: Array<Record<string, unknown>> = [];

  function walk(current: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const fullPath = path.join(current, entry.name);
      let stat: fs.Stats;
      try {
        stat = fs.lstatSync(fullPath);
      } catch {
        continue;
      }
      if (stat.isSymbolicLink()) continue;
      const relPosix = path.relative(root, fullPath).split(path.sep).join("/");
      if (stat.isDirectory()) {
        out.push({ path: relPosix, dir: true, name: entry.name });
        walk(fullPath);
      } else if (stat.isFile() && entry.name.toLowerCase().endsWith(".md")) {
        const stem = entry.name.slice(0, -3);
        out.push({
          path: relPosix,
          dir: false,
          name: stem,
          size: stat.size,
          modified: stat.mtimeMs / 1000,
        });
      }
    }
  }

  walk(root);
  out.sort((a, b) => String(a.path).localeCompare(String(b.path)));
  return out;
}

export function projectsApi(app: AppState) {
  function pm() {
    return app.mgrs().projects;
  }

  function needProject(pid: unknown): Project {
    const p = pm().get(String(pid));
    if (!p) {
      throw new ApiError("Ese proyecto ya no existe.");
    }
    return p;
  }

  function needIssue(pid: string, xid: unknown): Issue {
    const i = pm().getIssue(pid, String(xid));
    if (!i) {
      throw new ApiError("Ese issue ya no existe.");
    }
    return i;
  }

  function issueFields(p: Project, fields: unknown): Record<string, any> {
    if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
      throw new ApiError("Datos de issue inválidos.");
    }
    const f = fields as Record<string, any>;
    const out: Record<string, any> = {};

    if ("title" in f) {
      out.title = oneLine(f.title, 200) || "Nuevo issue";
    }
    if ("type" in f) {
      if (!ISSUE_TYPES.includes(f.type)) {
        throw new ApiError("Tipo inválido.");
      }
      out.type = f.type;
    }
    if ("status" in f) {
      if (!p.columns.includes(f.status)) {
        throw new ApiError("Estado inválido.");
      }
      out.status = f.status;
    }
    if ("priority" in f) {
      out.priority = clampInt(f.priority, 1, 4, 2);
    }
    if ("parent" in f) {
      const parent = String(f.parent || "");
      if (parent && pm().getIssue(p.id, parent) === null) {
        throw new ApiError("El padre ya no existe.");
      }
      out.parent = parent;
    }
    for (const k of ["start", "due", "repeat_until"]) {
      if (k in f) {
        out[k] = optDate(f[k]);
      }
    }
    if ("due_time" in f) {
      out.due_time = optTime(f.due_time) || "";
    }
    if ("estimate_min" in f) {
      const v = f.estimate_min;
      out.estimate_min =
        v === null || v === undefined || v === "" ? null : clampInt(v, 0, 100_000, 0) || null;
    }
    if ("reminder" in f) {
      out.reminder = optDatetime(f.reminder);
    }
    if ("in_calendar" in f) {
      out.in_calendar = Boolean(f.in_calendar);
    }
    if ("repeat" in f) {
      out.repeat = Recurrence.parse(oneLine(f.repeat, 60)).toString();
    }
    if ("labels" in f) {
      const labels = Array.isArray(f.labels)
        ? f.labels
        : String(f.labels || "").split(",");
      out.labels = labels
        .map((v: unknown) => listItem(v, 40))
        .filter(Boolean)
        .slice(0, 30);
    }
    if ("description" in f) {
      out.description = String(f.description || "").slice(0, 200_000);
    }
    if ("attachments" in f) {
      const refs = f.attachments || [];
      if (!Array.isArray(refs)) {
        throw new ApiError("Adjuntos inválidos.");
      }
      out.attachments = refs.map((r: unknown) => checkRef(r)).slice(0, 50);
    }
    if ("linked_folder" in f || "linked_notes" in f) {
      const extra: Record<string, any> = {};
      if ("linked_folder" in f) {
        extra.linked_folder = oneLine(f.linked_folder, 400);
      }
      if ("linked_notes" in f) {
        const notes = f.linked_notes || [];
        if (!Array.isArray(notes)) {
          throw new ApiError("Notas vinculadas inválidas.");
        }
        extra.linked_notes = notes
          .map((n: unknown) => oneLine(n, 400))
          .filter(Boolean)
          .slice(0, 50);
      }
      out.extra = extra;
    }
    return out;
  }

  function notesRoot(pid: string): string {
    const p = needProject(pid);
    return path.resolve(pm().notesDir(p.id));
  }

  return {
    projects_meta() {
      return {
        statuses: [...PROJECT_STATUSES],
        status_colours: PROJECT_STATUS_COLORS,
        types: [...ISSUE_TYPES],
        type_icons: TYPE_ICONS,
        type_colours: TYPE_COLOURS,
        palette: PALETTE,
        default_columns: [...DEFAULT_COLUMNS],
      };
    },

    projects_list() {
      const mgr = pm();
      const today = new Date();
      const out: Array<Record<string, unknown>> = [];
      for (const p of mgr.projects()) {
        const stats = new ProjectStats(mgr, p, today);
        const s = stats.summary();
        const nxt = stats.next_due();
        const d = projectDict(p, today);
        d.summary = s;
        d.throughput = stats.throughput(8).map(([, n]) => n);
        d.next_due = nxt ? { key: nxt.key, title: nxt.title, due: isoDate(nxt.due) } : null;
        out.push(d);
      }
      return out;
    },

    projects_get(pid: string) {
      const mgr = pm();
      const p = needProject(pid);
      mgr.fixDuplicateNumbers(p.id);
      const today = new Date();
      const stats = new ProjectStats(mgr, p, today);
      const [days, remaining, ideal] = stats.burndown();
      const sortedIssues = [...mgr.issues(p.id)].sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order;
        return a.number - b.number;
      });

      return {
        project: projectDict(p, today),
        progress: mgr.progress(p),
        issues: sortedIssues.map((i) => issueDict(i, today)),
        stats: {
          summary: stats.summary(),
          by_status: stats.by_status(),
          by_priority: stats.by_priority(),
          by_type: stats.by_type(),
          submetas: stats.submetas().map(([g, s]) => ({ id: g.id, ...s })),
          burndown: {
            days: days.map((d) => isoDate(d)!),
            remaining,
            ideal,
          },
          throughput: stats.throughput(8).map(([d, n]) => [isoDate(d)!, n]),
          cycle_days: stats.cycle_days(),
        },
      };
    },

    projects_create(fields: Record<string, unknown>) {
      const f = projectFields(fields);
      const cols = parseColumns(fields as Record<string, any>);
      const mgr = pm();
      const name = f.name || "Nuevo proyecto";
      delete f.name;
      const existingKeys = new Set(mgr.projects().map((p) => p.key));
      if (f.key && existingKeys.has(f.key)) {
        throw new ApiError("Esa clave ya la usa otro proyecto.");
      }
      if (cols) {
        f.columns = cols[0];
        f.done_column = cols[1];
      }
      const p = mgr.create(name, f);
      return projectDict(p, new Date());
    },

    projects_update(pid: string, fields: Record<string, unknown>) {
      const p = needProject(pid);
      const f = projectFields(fields);
      const cols = parseColumns(fields as Record<string, any>);
      const mgr = pm();
      if (f.key && f.key !== p.key && mgr.projects().some((o) => o.key === f.key)) {
        throw new ApiError("Esa clave ya la usa otro proyecto.");
      }
      mgr.update(p.id, f);
      if (cols) {
        const [cleanCols, doneCol, renames] = cols;
        const colsChanged =
          cleanCols.length !== p.columns.length ||
          cleanCols.some((c, idx) => c !== p.columns[idx]);
        if (colsChanged || doneCol !== p.done_column || Object.keys(renames).length > 0) {
          mgr.setColumns(p.id, cleanCols, doneCol, renames);
        }
      }
      const updated = mgr.get(p.id) || p;
      return projectDict(updated, new Date());
    },

    projects_delete(pid: string) {
      const p = needProject(pid);
      pm().delete(p.id);
      return { ok: true };
    },

    projects_issue_create(pid: string, fields: Record<string, unknown>) {
      const p = needProject(pid);
      const f = issueFields(p, fields);
      const title = String(f.title || "Nuevo issue");
      delete f.title;
      const mgr = pm();
      const i = mgr.createIssue(p.id, title, f);
      if (!i) {
        throw new ApiError("No se pudo crear el issue.");
      }
      return issueDict(mgr.getIssue(p.id, i.id) || i, new Date());
    },

    projects_issue_update(pid: string, xid: string, fields: Record<string, unknown>) {
      const p = needProject(pid);
      const issue = needIssue(p.id, xid);
      const f = issueFields(p, fields);
      if (f.repeat && !(f.due ?? issue.due)) {
        throw new ApiError("Un issue que se repite necesita una fecha de vencimiento.");
      }
      const parent = "parent" in f ? f.parent : undefined;
      delete f.parent;
      if ("extra" in f) {
        const merged = { ...(issue.extra || {}), ...f.extra };
        f.extra = merged;
      }
      const mgr = pm();
      mgr.updateIssue(p.id, issue.id, f);
      if (parent !== undefined && parent !== issue.parent) {
        mgr.reparent(p.id, issue.id, parent || null);
      }
      return issueDict(needIssue(p.id, issue.id), new Date());
    },

    projects_issue_move(pid: string, xid: string, status: string, index: number) {
      const p = needProject(pid);
      needIssue(p.id, xid);
      if (!p.columns.includes(status)) {
        throw new ApiError("Columna inválida.");
      }
      pm().move(p.id, String(xid), status, clampInt(index, 0, 10 ** 6, 0));
      return { ok: true };
    },

    projects_issue_delete(pid: string, xid: string) {
      const p = needProject(pid);
      needIssue(p.id, xid);
      pm().deleteIssue(p.id, String(xid));
      return { ok: true };
    },

    projects_notes_list(pid: string) {
      const root = notesRoot(pid);
      return listNotes(root);
    },

    projects_note_read(pid: string, rel: string) {
      const root = notesRoot(pid);
      const target = notesPath(root, rel, true);
      const stat = fs.statSync(target);
      if (!target.toLowerCase().endsWith(".md") || !stat.isFile()) {
        throw new ApiError("Solo notas .md.");
      }
      const raw = fs.readFileSync(target, "utf-8");
      return { path: rel, raw, modified: stat.mtimeMs / 1000 };
    },

    projects_note_write(pid: string, rel: string, raw: string) {
      const root = notesRoot(pid);
      const target = notesPath(root, rel, false);
      if (!target.toLowerCase().endsWith(".md")) {
        throw new ApiError("Solo notas .md.");
      }
      const data = String(raw ?? "");
      if (Buffer.byteLength(data, "utf-8") > MAX_NOTE_BYTES) {
        throw new ApiError("La nota es demasiado grande.");
      }
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, data, "utf-8");
      const stat = fs.statSync(target);
      return { ok: true, modified: stat.mtimeMs / 1000 };
    },

    projects_note_create(pid: string, folder: string, name: string, is_folder = false) {
      const root = notesRoot(pid);
      const clean = String(name || "")
        .replace(/[\\/:*?"<>|\x00-\x1f]+/g, " ")
        .trim()
        .replace(/^\.+|\.+$/g, "")
        .slice(0, 120);
      if (!clean) {
        throw new ApiError("Falta el nombre.");
      }
      const base = folder ? notesPath(root, folder, true) : root;
      if (!fs.statSync(base).isDirectory()) {
        throw new ApiError("Carpeta inválida.");
      }
      const target = path.join(base, is_folder ? clean : `${clean}.md`);
      if (fs.existsSync(target)) {
        throw new ApiError("Ya existe uno con ese nombre.");
      }
      if (is_folder) {
        fs.mkdirSync(target, { recursive: true });
      } else {
        fs.writeFileSync(target, `# ${clean}\n\n`, "utf-8");
      }
      const relPosix = path.relative(root, target).split(path.sep).join("/");
      return { path: relPosix };
    },

    projects_note_delete(pid: string, rel: string) {
      const root = notesRoot(pid);
      const target = notesPath(root, rel, true);
      toTrash(app.root, target, `proyectos/${pid}/notas`);
      return { ok: true };
    },
  };
}
