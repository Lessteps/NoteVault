/**
 * Proyectos: a single-user Jira. A project holds issues (Submeta, Tarea,
 * Subtarea, Error, Mejora) that move through the project's Kanban columns.
 * Ported from notevault_app/core/project_manager.py.
 *
 *     .notevault/proyectos/<project-id>/<project-id>.md       the project
 *     .notevault/proyectos/<project-id>/issues/<issue-id>.md  one issue per file
 *
 * FORMAT_VERSION 3 kept a project in one file with a "## Tareas" checklist.
 * `migrate_projects()` turns every step into an issue and only then moves the
 * old file to `.notevault/.papelera/proyectos-v3/`; it never overwrites.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { addDays, parseIsoDate, parseIsoDatetime, todayIso, weekday } from "./dates";
import { Recurrence } from "./recurrence";
import { Occurrence } from "./scheduleFormat";
import {
  dumpDoc,
  newId,
  parseDay,
  readDoc,
  splitList,
  toTrash,
  unquote,
  writeText,
} from "./store";
import {
  DEFAULT_COLUMNS,
  formatLayout,
  ISSUE_FIELDS,
  ISSUE_TYPES,
  isSyncConflict,
  LAYOUT,
  PROJECT_FIELDS,
  PROJECT_STATUSES as VAULT_PROJECT_STATUSES,
} from "./vaultFormat";

export const [P_PLANNED, P_ACTIVE, P_PAUSED, P_DONE] = VAULT_PROJECT_STATUSES;
export const PROJECT_STATUSES = [...VAULT_PROJECT_STATUSES];

export const PROJECT_STATUS_COLORS: Record<string, string> = {
  [P_PLANNED]: "#8b8b96",
  [P_ACTIVE]: "#2383e2",
  [P_PAUSED]: "#ff9632",
  [P_DONE]: "#4ade80",
};

export const PALETTE = [
  "#2383e2",
  "#4ade80",
  "#ff9632",
  "#f2555a",
  "#a78bfa",
  "#38bdf8",
  "#facc15",
  "#fb7185",
];

export const [T_GOAL, T_TASK, T_SUBTASK, T_BUG, T_IMPROVEMENT] = ISSUE_TYPES;
export const TYPE_ICONS: Record<string, string> = {
  [T_GOAL]: "◆",
  [T_TASK]: "☑",
  [T_SUBTASK]: "↳",
  [T_BUG]: "🐞",
  [T_IMPROVEMENT]: "⬆",
};
export const TYPE_COLOURS: Record<string, string> = {
  [T_GOAL]: "#a78bfa",
  [T_TASK]: "#2383e2",
  [T_SUBTASK]: "#38bdf8",
  [T_BUG]: "#f2555a",
  [T_IMPROVEMENT]: "#4ade80",
};

export const TASKS_HEADING = "## Tareas";
export const LEGACY_BUCKET = "proyectos-v3";

function _today(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function deriveKey(name: string, taken: Iterable<string> = []): string {
  const table: Record<string, string> = {
    á: "a", é: "e", í: "i", ó: "o", ú: "u", ü: "u", ñ: "n",
    Á: "A", É: "E", Í: "I", Ó: "O", Ú: "U", Ü: "U", Ñ: "N",
  };
  const translated = (name || "").replace(/[áéíóúüñÁÉÍÓÚÜÑ]/g, (c) => table[c] || c);
  const words = translated.match(/[A-Za-z0-9]+/g) || [];
  let base: string;
  if (!words.length) {
    base = "PRY";
  } else if (words.length === 1) {
    base = words[0]!.slice(0, 3).toUpperCase();
  } else {
    base = words
      .slice(0, 4)
      .map((w) => w[0]!)
      .join("")
      .toUpperCase();
  }
  let key = base;
  let n = 2;
  const takenSet = new Set(Array.from(taken).map((t) => t.toUpperCase()));
  while (takenSet.has(key)) {
    key = `${base}${n}`;
    n += 1;
  }
  return key;
}
export const derive_key = deriveKey;

export class Project {
  id: string;
  key: string;
  name: string;
  status: string;
  area: string;
  colour: string;
  icon: string;
  created: Date | null;
  start: Date | null;
  deadline: Date | null;
  columns: string[];
  done_column: string;
  in_calendar: boolean;
  description: string;
  extra: Record<string, any>;

  constructor(
    values: Record<string, any> = {},
    extra?: Record<string, any> | null,
    description = "",
  ) {
    this.id = String(values.id || "");
    this.key = String(values.key || "");
    this.name = String(values.name || "Nuevo proyecto");
    this.status = String(values.status || P_PLANNED);
    this.area = String(values.area || "");
    this.colour = String(values.colour || PALETTE[0]);
    this.icon = String(values.icon || "");
    this.created = values.created ? parseIsoDate(values.created) : null;
    this.start = values.start ? parseIsoDate(values.start) : null;
    this.deadline = values.deadline ? parseIsoDate(values.deadline) : null;

    let cols: string[];
    if (Array.isArray(values.columns)) {
      cols = values.columns.map(String);
    } else if (typeof values.columns === "string" && values.columns) {
      cols = splitList(values.columns);
    } else {
      cols = [...DEFAULT_COLUMNS];
    }
    this.columns = cols.length ? cols : [...DEFAULT_COLUMNS];
    this.done_column = String(values.done_column || this.columns[this.columns.length - 1]);
    if (!this.columns.includes(this.done_column)) {
      this.columns.push(this.done_column);
    }
    this.in_calendar = Boolean(values.in_calendar);
    this.description = description;
    this.extra = extra ? { ...extra } : {};
  }

  get color(): string {
    return this.colour;
  }

  get is_done(): boolean {
    return this.status === P_DONE;
  }
  get isDone(): boolean {
    return this.is_done;
  }

  values(): Record<string, any> {
    const out: Record<string, any> = {};
    for (const [k] of PROJECT_FIELDS) {
      out[k] = (this as any)[k];
    }
    return out;
  }

  days_left(today?: Date | null): number | null {
    const t = today || _today();
    if (!this.deadline) return null;
    return Math.round((this.deadline.getTime() - t.getTime()) / 86400000);
  }
  daysLeft(today?: Date | null): number | null {
    return this.days_left(today);
  }

  is_overdue(today?: Date | null): boolean {
    const t = today || _today();
    return Boolean(this.deadline && this.deadline.getTime() < t.getTime() && !this.is_done);
  }
  isOverdue(today?: Date | null): boolean {
    return this.is_overdue(today);
  }
}

export class Issue {
  reminder_kind = "issue";

  id: string;
  project: string;
  number: number;
  type: string;
  parent: string;
  title: string;
  status: string;
  priority: number;
  order: number;
  estimate_min: number | null;
  labels: string[];
  created: Date | null;
  start: Date | null;
  due: Date | null;
  due_time: string;
  repeat: string;
  repeat_until: Date | null;
  in_calendar: boolean;
  reminder: Date | null;
  reminder_done: boolean;
  done_at: Date | null;
  attachments: string[];
  updated: Date | null;
  description: string;
  extra: Record<string, any>;
  children: Issue[] = [];
  done_column = "";
  key_prefix = "";

  constructor(
    values: Record<string, any> = {},
    extra?: Record<string, any> | null,
    description = "",
  ) {
    this.id = String(values.id || "");
    this.project = String(values.project || "");
    this.number = Math.trunc(Number(values.number || 0)) || 0;
    this.type = String(values.type || T_TASK);
    this.parent = String(values.parent || "");
    this.title = String(values.title || "Nuevo issue");
    this.status = String(values.status || "");
    this.priority = Math.max(1, Math.min(4, Math.trunc(Number(values.priority || 2)) || 2));
    this.order = values.order !== null && values.order !== undefined ? Number(values.order) : 0;
    this.estimate_min =
      values.estimate_min !== null && values.estimate_min !== undefined
        ? Math.trunc(Number(values.estimate_min))
        : null;

    let lbls: string[];
    if (Array.isArray(values.labels)) {
      lbls = values.labels.map(String);
    } else if (typeof values.labels === "string" && values.labels) {
      lbls = splitList(values.labels);
    } else {
      lbls = [];
    }
    this.labels = lbls;

    this.created = values.created ? parseIsoDate(values.created) : null;
    this.start = values.start ? parseIsoDate(values.start) : null;
    this.due = values.due ? parseIsoDate(values.due) : null;
    this.due_time = String(values.due_time || "");
    this.repeat = Recurrence.parse(values.repeat).toString();
    this.repeat_until = values.repeat_until ? parseIsoDate(values.repeat_until) : null;
    this.in_calendar = Boolean(values.in_calendar);
    this.reminder = values.reminder ? parseIsoDatetime(values.reminder) : null;
    this.reminder_done = Boolean(values.reminder_done);
    this.done_at = values.done_at ? parseIsoDate(values.done_at) : null;

    let atts: string[];
    if (Array.isArray(values.attachments)) {
      atts = values.attachments.map(String);
    } else if (typeof values.attachments === "string" && values.attachments) {
      atts = splitList(values.attachments);
    } else {
      atts = [];
    }
    this.attachments = atts;

    this.updated = values.updated ? parseIsoDatetime(values.updated) : null;
    this.description = description;
    this.extra = extra ? { ...extra } : {};
  }

  values(): Record<string, any> {
    const out: Record<string, any> = {};
    for (const [k] of ISSUE_FIELDS) {
      out[k] = (this as any)[k];
    }
    return out;
  }

  get is_done(): boolean {
    return Boolean(this.done_column) && this.status === this.done_column;
  }
  get isDone(): boolean {
    return this.is_done;
  }

  get key(): string {
    return this.key_prefix ? `${this.key_prefix}-${this.number}` : `#${this.number}`;
  }

  get name(): string {
    return `${this.key} ${this.title}`;
  }

  get rule(): Recurrence {
    return Recurrence.parse(this.repeat);
  }

  is_overdue(today?: Date | null): boolean {
    const t = today || _today();
    return Boolean(this.due && this.due.getTime() < t.getTime() && !this.is_done);
  }
  isOverdue(today?: Date | null): boolean {
    return this.is_overdue(today);
  }

  occurs_on(d: Date | string): boolean {
    const target = typeof d === "string" ? parseIsoDate(d) || new Date() : d;
    if (!this.repeat) {
      return Boolean(this.due && todayIso(this.due) === todayIso(target));
    }
    return this.rule.occursOn(target, this.due || this.start, this.repeat_until);
  }
  occursOn(d: Date | string): boolean {
    return this.occurs_on(d);
  }

  matches(query: string): boolean {
    const q = (query || "").trim().toLowerCase();
    if (!q) return true;
    const haystack = [
      this.key,
      this.title,
      this.description,
      this.type,
      this.labels.join(","),
    ].join(" ").toLowerCase();
    return haystack.includes(q);
  }
}

export class ProjectManager {
  vaultRoot: string;
  projectsDir: string;
  private _cache: Project[] | null = null;
  private _stamp: string | null = null;
  private _issues: Map<string, [string, Issue[], [string, string, string[]]]> = new Map();
  private _migrated = false;

  constructor(vaultRoot: string) {
    this.vaultRoot = path.resolve(vaultRoot);
    this.projectsDir = path.join(this.vaultRoot, LAYOUT.projects_dir);
  }

  projectPath(pid: string): string {
    return path.join(this.vaultRoot, formatLayout(LAYOUT.project, { id: pid }));
  }
  project_path(pid: string): string {
    return this.projectPath(pid);
  }

  issuesDir(pid: string): string {
    return path.join(this.vaultRoot, formatLayout(LAYOUT.project_issues_dir, { id: pid }));
  }
  issues_dir(pid: string): string {
    return this.issuesDir(pid);
  }

  issuePath(pid: string, xid: string): string {
    return path.join(
      this.vaultRoot,
      formatLayout(LAYOUT.issue, { project: pid, id: xid }),
    );
  }
  issue_path(pid: string, xid: string): string {
    return this.issuePath(pid, xid);
  }

  notesDir(pid: string): string {
    const folder = path.join(path.dirname(this.projectPath(pid)), "notas");
    fs.mkdirSync(folder, { recursive: true });
    return folder;
  }
  notes_dir(pid: string): string {
    return this.notesDir(pid);
  }

  private _stampOf(folder: string): string {
    try {
      if (!fs.existsSync(folder)) return "";
      const files: [string, number][] = [];
      const entries = fs.readdirSync(folder, { withFileTypes: true });
      for (const e of entries) {
        if (e.isDirectory()) {
          const subDir = path.join(folder, e.name);
          const subFiles = fs.readdirSync(subDir).filter((f) => f.endsWith(".md"));
          for (const sf of subFiles) {
            const p = path.join(subDir, sf);
            files.push([p, fs.statSync(p).mtimeMs]);
          }
        } else if (e.isFile() && e.name.endsWith(".md")) {
          const p = path.join(folder, e.name);
          files.push([p, fs.statSync(p).mtimeMs]);
        }
      }
      files.sort((a, b) => a[0].localeCompare(b[0]));
      return files.map(([p, m]) => `${p}:${m}`).join(";");
    } catch {
      return "";
    }
  }

  projects(force = false): Project[] {
    if (!this._migrated) {
      this._migrated = true;
      migrateProjects(this.vaultRoot);
    }
    const stamp = this._stampOf(this.projectsDir);
    if (force || this._cache === null || stamp !== this._stamp) {
      const out: Project[] = [];
      if (fs.existsSync(this.projectsDir)) {
        for (const dirName of fs.readdirSync(this.projectsDir)) {
          const pDir = path.join(this.projectsDir, dirName);
          if (!fs.statSync(pDir).isDirectory()) continue;
          const projFile = path.join(pDir, `${dirName}.md`);
          if (!fs.existsSync(projFile) || isSyncConflict(dirName)) continue;
          const parsed = readDoc(projFile, PROJECT_FIELDS);
          if (!parsed) continue;
          const [values, extra, body] = parsed;
          values.id = values.id || dirName;
          out.push(new Project(values as Record<string, any>, extra, body));
        }
      }
      const orderMap = new Map<string, number>(PROJECT_STATUSES.map((s, i) => [s, i]));
      out.sort((a, b) => {
        const ordA = orderMap.get(a.status) ?? 9;
        const ordB = orderMap.get(b.status) ?? 9;
        if (ordA !== ordB) return ordA - ordB;
        const deadA = a.deadline ? a.deadline.getTime() : Infinity;
        const deadB = b.deadline ? b.deadline.getTime() : Infinity;
        if (deadA !== deadB) return deadA - deadB;
        return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      });
      this._cache = out;
      this._stamp = stamp;
      if (force) {
        this._issues.clear();
      }
    }
    return [...this._cache];
  }

  get(pid: string): Project | null {
    return this.projects().find((p) => p.id === pid) ?? null;
  }

  save(project: Project): void {
    writeText(
      this.projectPath(project.id),
      dumpDoc(PROJECT_FIELDS, project.values(), project.extra, project.description),
    );
    this._cache = null;
  }

  create(name = "Nuevo proyecto", fields: Record<string, any> = {}): Project {
    const existing = this.projects();
    const today = _today();
    const colour =
      fields.color || fields.colour || PALETTE[existing.length % PALETTE.length];
    delete fields.color;
    delete fields.colour;

    const project = new Project({
      id: newId("p"),
      name: name.trim() || "Nuevo proyecto",
      key: deriveKey(name, existing.map((p) => p.key)),
      status: P_PLANNED,
      colour,
      created: today,
      start: today,
    });
    this._apply(project, fields);
    this.save(project);
    this.notesDir(project.id);
    return project;
  }

  update(pid: string, fields: Record<string, any> = {}): Project | null {
    const project = this.get(pid);
    if (!project) return null;
    if ("color" in fields) {
      fields.colour = fields.color;
      delete fields.color;
    }
    this._apply(project, fields);
    this.save(project);
    return project;
  }

  private _apply(project: Project, fields: Record<string, any>): void {
    const validKeys = new Set(PROJECT_FIELDS.map(([k]) => k).filter((k) => k !== "id"));
    for (const [k, v] of Object.entries(fields)) {
      if (validKeys.has(k)) {
        if (k === "columns") {
          const list = splitList(v);
          (project as any).columns = list.length ? list : [...DEFAULT_COLUMNS];
        } else {
          (project as any)[k] = v;
        }
      } else if (k === "description") {
        project.description = String(v || "");
      } else if (k === "extra") {
        Object.assign(project.extra, v || {});
      }
    }
  }

  delete(pid: string): void {
    toTrash(this.vaultRoot, path.dirname(this.projectPath(pid)), "proyectos");
    this._cache = null;
    this._issues.delete(pid);
  }

  setColumns(
    pid: string,
    columns: string[],
    doneColumnOrRenames?: string | Record<string, string> | null,
    renamesArg: Record<string, string> = {},
  ): void {
    const project = this.get(pid);
    if (!project) return;
    const cleanColumns = columns
      .map((c) => c.trim().replace(/,/g, " "))
      .filter(Boolean);
    if (!cleanColumns.length) return;

    let doneColumn: string | null = null;
    let renames: Record<string, string> = renamesArg;
    if (typeof doneColumnOrRenames === "string") {
      doneColumn = doneColumnOrRenames;
    } else if (doneColumnOrRenames && typeof doneColumnOrRenames === "object") {
      renames = doneColumnOrRenames;
    }

    let targetDone =
      doneColumn && cleanColumns.includes(doneColumn)
        ? doneColumn
        : renames[project.done_column] || project.done_column;
    if (!cleanColumns.includes(targetDone)) {
      targetDone = cleanColumns[cleanColumns.length - 1]!;
    }

    for (const issue of this.issues(pid)) {
      let nextStatus = renames[issue.status] || issue.status;
      if (!cleanColumns.includes(nextStatus)) {
        nextStatus = cleanColumns[0]!;
      }
      if (nextStatus !== issue.status) {
        issue.status = nextStatus;
        ProjectManager._stampDone(issue, targetDone);
        this.saveIssue(issue);
      }
    }
    project.columns = cleanColumns;
    project.done_column = targetDone;
    this.save(project);
  }
  set_columns(
    pid: string,
    columns: string[],
    doneColumnOrRenames?: string | Record<string, string> | null,
    renamesArg: Record<string, string> = {},
  ): void {
    this.setColumns(pid, columns, doneColumnOrRenames, renamesArg);
  }

  // ── Issues ────────────────────────────────────────────────────────────

  issues(pid: string): Issue[] {
    const project = this.get(pid);
    if (!project) return [];
    const dir = this.issuesDir(pid);
    const stamp = this._stampOf(dir);
    const hit = this._issues.get(pid);

    const hitConfig = hit?.[2];
    const configMatches =
      hitConfig &&
      hitConfig[0] === project.key &&
      hitConfig[1] === project.done_column &&
      hitConfig[2].length === project.columns.length &&
      hitConfig[2].every((c, idx) => c === project.columns[idx]);

    if (!hit || hit[0] !== stamp || !configMatches) {
      const out: Issue[] = [];
      if (fs.existsSync(dir)) {
        for (const file of fs.readdirSync(dir).sort()) {
          if (!file.endsWith(".md") || isSyncConflict(file)) continue;
          const p = path.join(dir, file);
          const parsed = readDoc(p, ISSUE_FIELDS);
          if (!parsed) continue;
          const [values, extra, body] = parsed;
          values.id = values.id || path.parse(file).name;
          values.project = pid;
          const issue = new Issue(values as Record<string, any>, extra, body);
          issue.done_column = project.done_column;
          issue.key_prefix = project.key;
          if (!project.columns.includes(issue.status)) {
            issue.status = project.columns[0]!;
          }
          out.push(issue);
        }
      }
      ProjectManager._link(out);
      this._issues.set(pid, [
        stamp,
        out,
        [project.key, project.done_column, [...project.columns]],
      ]);
      return [...out];
    }
    return [...hit[1]];
  }

  static _link(issues: Issue[]): void {
    const byId = new Map<string, Issue>();
    for (const i of issues) {
      byId.set(i.id, i);
      i.children = [];
    }
    for (const i of issues) {
      const parent = byId.get(i.parent);
      const seen = new Set<string>();
      let cur = parent;
      let cycle = false;
      while (cur && !seen.has(cur.id)) {
        if (cur.id === i.id) {
          cycle = true;
          break;
        }
        seen.add(cur.id);
        cur = byId.get(cur.parent);
      }
      if (parent && !cycle) {
        parent.children.push(i);
      } else if (i.parent) {
        i.parent = "";
      }
    }
    for (const i of issues) {
      i.children.sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order;
        return a.number - b.number;
      });
    }
  }

  tree(pid: string): Issue[] {
    const roots = this.issues(pid).filter((i) => !i.parent);
    roots.sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.number - b.number;
    });
    return roots;
  }

  getIssue(pid: string, xid: string): Issue | null {
    return this.issues(pid).find((i) => i.id === xid) ?? null;
  }
  get_issue(pid: string, xid: string): Issue | null {
    return this.getIssue(pid, xid);
  }

  allIssues(): Issue[] {
    const out: Issue[] = [];
    for (const p of this.projects()) {
      out.push(...this.issues(p.id));
    }
    return out;
  }
  all_issues(): Issue[] {
    return this.allIssues();
  }

  descendants(issue: Issue): Issue[] {
    const out: Issue[] = [];
    const stack = [...issue.children];
    while (stack.length) {
      const cur = stack.pop()!;
      out.push(cur);
      stack.push(...cur.children);
    }
    return out;
  }

  saveIssue(issue: Issue): void {
    writeText(
      this.issuePath(issue.project, issue.id),
      dumpDoc(ISSUE_FIELDS, issue.values(), issue.extra, issue.description),
    );
    this._issues.delete(issue.project);
  }
  save_issue(issue: Issue): void {
    this.saveIssue(issue);
  }

  createIssue(
    pid: string,
    title: string,
    fields: Record<string, any> = {},
  ): Issue | null {
    const project = this.get(pid);
    if (!project) return null;
    const issues = this.issues(pid);
    let status = fields.status || project.columns[0]!;
    delete fields.status;
    if (!project.columns.includes(status)) {
      status = project.columns[0]!;
    }
    const column = issues.filter((i) => i.status === status);
    const issueType = fields.type || T_TASK;
    delete fields.type;

    const maxNum = issues.length ? Math.max(...issues.map((i) => i.number)) : 0;
    const maxOrd = column.length ? Math.max(...column.map((i) => i.order)) : 0;

    const issue = new Issue({
      id: newId("x"),
      project: pid,
      number: maxNum + 1,
      type: issueType,
      title: title.trim() || "Nuevo issue",
      status,
      priority: 2,
      order: maxOrd + 1,
      created: _today(),
      updated: new Date(),
    });
    issue.done_column = project.done_column;
    issue.key_prefix = project.key;
    ProjectManager._applyIssue(issue, fields);
    ProjectManager._stampDone(issue, project.done_column);
    this.saveIssue(issue);
    return issue;
  }
  create_issue(
    pid: string,
    title: string,
    fields: Record<string, any> = {},
  ): Issue | null {
    return this.createIssue(pid, title, fields);
  }

  static _applyIssue(issue: Issue, fields: Record<string, any>): void {
    const validKeys = new Set(
      ISSUE_FIELDS.map(([k]) => k).filter((k) => k !== "id" && k !== "number"),
    );
    for (const [k, v] of Object.entries(fields)) {
      if (validKeys.has(k)) {
        if (k === "priority" && v !== null && v !== undefined) {
          issue.priority = Math.max(1, Math.min(4, Math.trunc(Number(v))));
        } else if (k === "repeat") {
          issue.repeat = Recurrence.parse(v).toString();
        } else if (k === "labels" || k === "attachments") {
          (issue as any)[k] = splitList(v);
        } else if (k === "reminder" || k === "updated") {
          (issue as any)[k] = v ? parseIsoDatetime(v) : null;
        } else if (k === "created" || k === "start" || k === "due" || k === "repeat_until" || k === "done_at") {
          (issue as any)[k] = v ? parseIsoDate(v) : null;
        } else {
          (issue as any)[k] = v;
        }
      } else if (k === "description") {
        issue.description = String(v || "");
      } else if (k === "extra") {
        Object.assign(issue.extra, v || {});
      }
    }
  }

  static _stampDone(issue: Issue, doneColumn: string, day?: Date | null): void {
    if (issue.status === doneColumn) {
      issue.done_at = issue.done_at || day || _today();
    } else {
      issue.done_at = null;
    }
  }

  updateIssue(
    pid: string,
    xid: string,
    fields: Record<string, any> = {},
  ): Issue | null {
    const issue = this.getIssue(pid, xid);
    const project = this.get(pid);
    if (!issue || !project) return null;

    const wasDone = issue.is_done;
    if ("reminder" in fields && fields.reminder !== issue.reminder) {
      issue.reminder_done = false;
    }
    ProjectManager._applyIssue(issue, fields);
    issue.updated = new Date();
    if (!project.columns.includes(issue.status)) {
      issue.status = project.columns[0]!;
    }
    ProjectManager._stampDone(issue, project.done_column);
    if (issue.is_done && !wasDone && issue.repeat) {
      ProjectManager._rollForward(issue, project);
    }
    this.saveIssue(issue);
    return issue;
  }
  update_issue(
    pid: string,
    xid: string,
    fields: Record<string, any> = {},
  ): Issue | null {
    return this.updateIssue(pid, xid, fields);
  }

  static _rollForward(issue: Issue, project: Project): void {
    if (!issue.due) return;
    const nxt = issue.rule.nextAfter(issue.due, issue.due, issue.repeat_until);
    if (!nxt) return;
    const shiftMs = nxt.getTime() - issue.due.getTime();
    issue.due = nxt;
    if (issue.start) {
      issue.start = new Date(issue.start.getTime() + shiftMs);
    }
    if (issue.reminder) {
      issue.reminder = new Date(issue.reminder.getTime() + shiftMs);
      issue.reminder_done = false;
    }
    issue.status = project.columns[0]!;
    issue.done_at = null;
  }

  move(pid: string, xid: string, status: string, index: number): void {
    const project = this.get(pid);
    const issue = this.getIssue(pid, xid);
    if (!project || !issue || !project.columns.includes(status)) {
      return;
    }
    const column = this.issues(pid)
      .filter((i) => i.status === status && i.id !== xid)
      .sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order;
        return a.number - b.number;
      });
    const clampedIndex = Math.max(0, Math.min(index, column.length));
    const before = clampedIndex > 0 ? column[clampedIndex - 1]!.order : null;
    const after = clampedIndex < column.length ? column[clampedIndex]!.order : null;

    let order: number;
    if (before === null && after === null) {
      order = 1;
    } else if (before === null) {
      order = after! - 1;
    } else if (after === null) {
      order = before + 1;
    } else {
      order = (before + after) / 2;
      if (!(before < order && order < after)) {
        for (let n = 0; n < column.length; n++) {
          const other = column[n]!;
          other.order = n < clampedIndex ? n + 1 : n + 2;
          this.saveIssue(other);
        }
        order = clampedIndex + 1;
      }
    }
    const wasDone = issue.is_done;
    issue.status = status;
    issue.order = Number.isInteger(order) ? order : Math.round(order * 1e6) / 1e6;
    issue.updated = new Date();
    ProjectManager._stampDone(issue, project.done_column);
    if (issue.is_done && !wasDone && issue.repeat) {
      ProjectManager._rollForward(issue, project);
    }
    this.saveIssue(issue);
  }

  setIssueStatus(pid: string, xid: string, status: string): void {
    this.move(pid, xid, status, 1e6);
  }
  set_issue_status(pid: string, xid: string, status: string): void {
    this.setIssueStatus(pid, xid, status);
  }

  reparent(pid: string, xid: string, parent?: string | null): void {
    const issue = this.getIssue(pid, xid);
    if (!issue) return;
    const byId = new Map(this.issues(pid).map((i) => [i.id, i]));
    let cur = byId.get(parent || "");
    while (cur) {
      if (cur.id === xid) return;
      cur = byId.get(cur.parent);
    }
    issue.parent = parent || "";
    this.saveIssue(issue);
  }

  deleteIssue(pid: string, xid: string): void {
    const issue = this.getIssue(pid, xid);
    if (!issue) return;
    const nodes = [issue, ...this.descendants(issue)];
    for (const node of nodes) {
      toTrash(this.vaultRoot, this.issuePath(pid, node.id), `proyectos/${pid}`);
    }
    this._issues.delete(pid);
  }
  delete_issue(pid: string, xid: string): void {
    this.deleteIssue(pid, xid);
  }

  fixDuplicateNumbers(pid: string): number {
    const seen = new Map<number, string>();
    let fixed = 0;
    const list = [...this.issues(pid)].sort((a, b) => {
      if (a.number !== b.number) return a.number - b.number;
      const createdA = a.created ? a.created.getTime() : 0;
      const createdB = b.created ? b.created.getTime() : 0;
      if (createdA !== createdB) return createdA - createdB;
      return a.id.localeCompare(b.id);
    });
    let top = list.length ? Math.max(...list.map((i) => i.number)) : 0;
    for (const issue of list) {
      if (seen.has(issue.number)) {
        top += 1;
        issue.number = top;
        this.saveIssue(issue);
        fixed += 1;
      }
      seen.set(issue.number, issue.id);
    }
    return fixed;
  }
  fix_duplicate_numbers(pid: string): number {
    return this.fixDuplicateNumbers(pid);
  }

  filtered(query = "", status = ""): Project[] {
    const q = (query || "").trim().toLowerCase();
    return this.projects().filter((p) => {
      if (status && p.status !== status) return false;
      if (q) {
        const text = `${p.name} ${p.key} ${p.description}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }

  activeProjects(): Project[] {
    return this.projects().filter((p) => p.status === P_ACTIVE);
  }
  active_projects(): Project[] {
    return this.activeProjects();
  }

  dueOn(d: Date | string, includeOverdue = true): [Project, Issue][] {
    const target = typeof d === "string" ? parseIsoDate(d) || new Date() : d;
    const out: [Project, Issue][] = [];

    for (const p of this.projects()) {
      if (p.status === P_DONE) continue;
      for (const i of this.issues(p.id)) {
        if (i.is_done || !i.due) continue;
        const dueTime = i.due.getTime();
        const targetTime = target.getTime();
        if (i.occursOn(target) || (includeOverdue && dueTime < targetTime && !i.repeat)) {
          out.push([p, i]);
        }
      }
    }
    out.sort((a, b) => {
      const dueA = a[1].due!.getTime();
      const dueB = b[1].due!.getTime();
      if (dueA !== dueB) return dueA - dueB;
      return b[1].priority - a[1].priority;
    });
    return out;
  }
  due_on(d: Date | string, includeOverdue = true): [Project, Issue][] {
    return this.dueOn(d, includeOverdue);
  }

  progress(project: Project): number {
    const issues = this.issues(project.id).filter(
      (i) => i.type !== T_GOAL || !i.children.length,
    );
    if (!issues.length) return 0.0;
    const doneCount = issues.filter((i) => i.is_done).length;
    return doneCount / issues.length;
  }
}

export class ProjectStats {
  manager: ProjectManager;
  project: Project;
  today: Date;
  issues: Issue[];
  work: Issue[];

  constructor(manager: ProjectManager, projectOrId: Project | string, today?: Date | null) {
    this.manager = manager;
    this.project =
      typeof projectOrId === "string"
        ? manager.get(projectOrId) || new Project({ id: projectOrId })
        : projectOrId;
    this.today = today || _today();
    this.issues = manager.issues(this.project.id);
    this.work = this.issues.filter((i) => !(i.type === T_GOAL && i.children.length > 0));
  }

  static _summary(issues: Issue[], today: Date): Record<string, any> {
    const total = issues.length;
    const done = issues.filter((i) => i.is_done).length;
    return {
      total,
      done,
      open: total - done,
      overdue: issues.filter((i) => i.is_overdue(today)).length,
      progress: total ? done / total : 0.0,
      estimate_min: issues.reduce((acc, i) => acc + (i.estimate_min || 0), 0),
      estimate_done_min: issues
        .filter((i) => i.is_done)
        .reduce((acc, i) => acc + (i.estimate_min || 0), 0),
    };
  }

  summary(): Record<string, any> {
    const s = ProjectStats._summary(this.work, this.today);
    const weekStart = addDays(this.today, -weekday(this.today));
    s.done_this_week = this.work.filter(
      (i) => i.is_done && i.done_at && i.done_at.getTime() >= weekStart.getTime(),
    ).length;
    s.days_left = this.project.days_left(this.today);
    return s;
  }

  byStatus(): [string, number][] {
    return this.project.columns.map((c) => [
      c,
      this.work.filter((i) => i.status === c).length,
    ]);
  }
  by_status(): [string, number][] {
    return this.byStatus();
  }

  byPriority(): [number, number][] {
    return [1, 2, 3, 4].map((p) => [
      p,
      this.work.filter((i) => i.priority === p && !i.is_done).length,
    ]);
  }
  by_priority(): [number, number][] {
    return this.byPriority();
  }

  byType(): [string, number][] {
    return ISSUE_TYPES.map((t) => [t, this.issues.filter((i) => i.type === t).length]);
  }
  by_type(): [string, number][] {
    return this.byType();
  }

  submetas(): [Issue, Record<string, any>][] {
    const out: [Issue, Record<string, any>][] = [];
    const goals = this.issues
      .filter((i) => i.type === T_GOAL)
      .sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order;
        return a.number - b.number;
      });
    for (const goal of goals) {
      const members = this.manager
        .descendants(goal)
        .filter((d) => !(d.type === T_GOAL && d.children.length > 0));
      out.push([goal, ProjectStats._summary(members, this.today)]);
    }
    return out;
  }

  burndown(): [Date[], (number | null)[], number[]] {
    const createdList = this.work.map((i) => i.created).filter(Boolean) as Date[];
    const firstCreated = createdList.length
      ? new Date(Math.min(...createdList.map((d) => d.getTime())))
      : this.today;
    let first = this.project.start || firstCreated;
    const last =
      this.project.deadline && this.project.deadline > this.today
        ? this.project.deadline
        : this.today;

    if ((last.getTime() - first.getTime()) / 86400000 > 180) {
      first = addDays(last, -180);
    }
    const days: Date[] = [];
    const remaining: (number | null)[] = [];
    let d = new Date(first);
    while (d.getTime() <= last.getTime()) {
      days.push(new Date(d));
      if (d.getTime() <= this.today.getTime()) {
        const count = this.work.filter((i) => {
          const cDate = i.created || first;
          const createdBefore = cDate.getTime() <= d.getTime();
          const doneBefore = i.done_at && i.done_at.getTime() <= d.getTime();
          return createdBefore && !doneBefore;
        }).length;
        remaining.push(count);
      } else {
        remaining.push(null);
      }
      d = addDays(d, 1);
    }

    const nonNulls = remaining.filter((v): v is number => v !== null);
    const startValue = nonNulls.length ? Math.max(...nonNulls) : 0;
    const n = days.length - 1 || 1;
    const ideal = this.project.deadline
      ? days.map((_, k) => Math.round(startValue * (1 - k / n) * 100) / 100)
      : [];
    return [days, remaining, ideal];
  }

  throughput(weeks = 8): [Date, number][] {
    const monday = addDays(this.today, -weekday(this.today));
    const out: [Date, number][] = [];
    for (let k = weeks - 1; k >= 0; k--) {
      const start = addDays(monday, -k * 7);
      const end = addDays(start, 6);
      const count = this.work.filter(
        (i) => i.done_at && i.done_at >= start && i.done_at <= end,
      ).length;
      out.push([start, count]);
    }
    return out;
  }

  cycleDays(): number | null {
    const spans = this.work
      .filter((i) => i.done_at && i.created)
      .map((i) => Math.round((i.done_at!.getTime() - i.created!.getTime()) / 86400000));
    if (!spans.length) return null;
    const avg = spans.reduce((acc, v) => acc + v, 0) / spans.length;
    return Math.round(avg * 10) / 10;
  }
  cycle_days(): number | null {
    return this.cycleDays();
  }

  nextDue(): Issue | null {
    const open = this.work
      .filter((i) => !i.is_done && i.due)
      .sort((a, b) => a.due!.getTime() - b.due!.getTime());
    return open.length ? open[0]! : null;
  }
  next_due(): Issue | null {
    return this.nextDue();
  }
}

export class ProjectCalendarSource {
  prefix = "issue:";
  prefixes = ["issue:", "project:"] as const;
  manager: ProjectManager;

  constructor(manager: ProjectManager) {
    this.manager = manager;
  }

  occurrences(first: Date, last: Date): Record<string, Occurrence[]> {
    const out: Record<string, Occurrence[]> = {};

    for (const p of this.manager.projects()) {
      if (p.in_calendar && p.deadline && first <= p.deadline && p.deadline <= last) {
        const dIso = todayIso(p.deadline);
        if (!out[dIso]) out[dIso] = [];
        out[dIso]!.push(
          new Occurrence(
            `project:${p.id}`,
            `🏁 ${p.name}`,
            "project",
            new Date(p.deadline),
            null,
            null,
            p.colour,
            [{ type: "project", id: p.id }],
            p.status === P_DONE,
            "proyectos",
            false,
          ),
        );
      }

      if (p.status === P_DONE) continue;

      for (const i of this.manager.issues(p.id)) {
        if (!(p.in_calendar || i.in_calendar) || !(i.due || i.repeat)) {
          continue;
        }
        let d = new Date(first);
        while (d.getTime() <= last.getTime()) {
          if (i.occursOn(d)) {
            const start = i.due_time || null;
            const dIso = todayIso(d);
            if (!out[dIso]) out[dIso] = [];
            out[dIso]!.push(
              new Occurrence(
                `${this.prefix}${p.id}/${i.id}`,
                `${i.key} ${i.title}`,
                "issue",
                new Date(d),
                start,
                start ? i.estimate_min || 60 : null,
                p.colour,
                [{ type: "project", id: p.id, issue: i.id }],
                i.is_done,
                "proyectos",
                false,
              ),
            );
          }
          d = addDays(d, 1);
        }
      }
    }
    return out;
  }

  setDone(_d: Date, occurrenceId: string, done: boolean): void {
    if (occurrenceId.startsWith("project:")) {
      const pid = occurrenceId.slice("project:".length);
      const project = this.manager.get(pid);
      if (project) {
        this.manager.update(pid, { status: done ? P_DONE : P_ACTIVE });
      }
      return;
    }
    const rem = occurrenceId.slice(this.prefix.length);
    const slashIdx = rem.indexOf("/");
    const pid = slashIdx >= 0 ? rem.slice(0, slashIdx) : rem;
    const xid = slashIdx >= 0 ? rem.slice(slashIdx + 1) : "";
    const project = this.manager.get(pid);
    if (!project) return;
    const column = done ? project.done_column : project.columns[0]!;
    this.manager.move(pid, xid, column, 1e6);
  }
  set_done(d: Date, occurrenceId: string, done: boolean): void {
    this.setDone(d, occurrenceId, done);
  }
}

// ── Migration from FORMAT_VERSION 3 ───────────────────────────────────────

const STEP_RE = /^\s*-\s*\[([ xX])\]\s*(.+?)\s*$/;
const V3_KEY_RE = /^([a-z_0-9\-]+):\s*(.*)$/;

export function _parseV3(text: string): [Record<string, string>, string, [string, boolean, string | null][]] {
  const fm: Record<string, string> = {};
  const body: string[] = [];
  let count = 0;
  for (const rawLine of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = rawLine.trim();
    if (line === "---" && count < 2) {
      count += 1;
      continue;
    }
    if (count === 1) {
      const m = V3_KEY_RE.exec(line);
      if (m) {
        fm[m[1]!] = unquote(m[2]!.trim());
      }
    } else if (count >= 2) {
      body.push(rawLine);
    }
  }

  const description: string[] = [];
  const steps: [string, boolean, string | null][] = [];
  let inTasks = false;

  for (const line of body) {
    if (line.trim().toLowerCase() === TASKS_HEADING.toLowerCase()) {
      inTasks = true;
      continue;
    }
    if (inTasks) {
      const m = STEP_RE.exec(line);
      if (m) {
        let rest = m[2]!;
        let due: string | null = null;
        if (rest.includes("|")) {
          const parts = rest.split("|");
          const tail = parts.pop()!;
          rest = parts.join("|");
          due = parseDay(tail.trim());
        }
        steps.push([rest.trim(), m[1]!.toLowerCase() === "x", due]);
      }
    } else {
      description.push(line);
    }
  }
  return [fm, description.join("\n").trim(), steps];
}

export function migrateProjects(vaultRoot: string, today?: Date | null): string[] {
  const root = path.resolve(vaultRoot);
  const pdir = path.join(root, LAYOUT.projects_dir);
  if (!fs.existsSync(pdir) || !fs.statSync(pdir).isDirectory()) {
    return [];
  }
  const todayDate = today || _today();
  const todayStr = todayIso(todayDate);
  const migrated: string[] = [];

  for (const entry of fs.readdirSync(pdir)) {
    const candidate = path.join(pdir, entry);
    if (!fs.statSync(candidate).isFile() || !entry.endsWith(".md")) {
      continue;
    }
    const pid = path.parse(entry).name;
    const text = fs.readFileSync(candidate, "utf-8");
    const [fm, description, steps] = _parseV3(text);

    const projectDir = path.join(pdir, pid);
    const issuesDir = path.join(projectDir, "issues");
    fs.mkdirSync(issuesDir, { recursive: true });

    const key = fm.key || deriveKey(fm.name || pid);
    const columns = [...DEFAULT_COLUMNS];
    const doneCol = columns[columns.length - 1]!;

    const projDoc = dumpDoc(
      PROJECT_FIELDS,
      {
        id: pid,
        key,
        name: fm.name || "Proyecto migrado",
        status: fm.status || P_ACTIVE,
        area: fm.area || "",
        colour: fm.color || fm.colour || PALETTE[0],
        icon: fm.icon || "",
        created: fm.created || todayStr,
        start: fm.start || todayStr,
        deadline: fm.deadline || "",
        columns,
        done_column: doneCol,
        in_calendar: Boolean(fm.in_calendar),
      },
      {},
      description,
    );
    writeText(path.join(projectDir, `${pid}.md`), projDoc);

    for (let idx = 0; idx < steps.length; idx++) {
      const [title, done, due] = steps[idx]!;
      const xid = newId("x");
      const issueDoc = dumpDoc(
        ISSUE_FIELDS,
        {
          id: xid,
          number: idx + 1,
          type: T_TASK,
          title,
          status: done ? doneCol : columns[0],
          priority: 2,
          order: idx + 1,
          created: todayStr,
          due: due || "",
          done_at: done ? todayStr : "",
          updated: todayStr,
        },
        {},
        "",
      );
      writeText(path.join(issuesDir, `${xid}.md`), issueDoc);
    }

    toTrash(root, candidate, LEGACY_BUCKET);
    migrated.push(pid);
  }
  return migrated;
}
export const migrate_projects = migrateProjects;
