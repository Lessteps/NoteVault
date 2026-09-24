// Shapes returned by notevault_app/webapp/api.py. Keep in step with it.

export interface AppInfo {
  api_version: number;
  vault_name: string;
  vault_path: string;
  theme: "dark" | "light";
}

export interface TreeEntry {
  type: "folder" | "note";
  name: string;
  /** Vault-relative POSIX path. */
  path: string;
  kind?: "note" | "code" | "canvas";
  has_children?: boolean;
}

export type Frontmatter = Record<string, unknown>;

export interface NoteData {
  path: string;
  name: string;
  title: string;
  kind: "note" | "code";
  raw: string;
  frontmatter: Frontmatter;
  body: string;
  /** mtime in seconds; sent back on save to detect outside edits. */
  modified: number;
  bookmarked: boolean;
}

export interface WriteResult {
  ok: boolean;
  conflict: boolean;
  modified: number;
}

export interface SearchHit {
  path: string;
  title: string;
  line_no: number;
  line: string;
}

export interface Mentions {
  linked: SearchHit[];
  unlinked: SearchHit[];
}

export interface Bookmark {
  path: string;
  label: string;
}

export interface IndexEntry {
  path: string;
  title: string;
}

// ── Tareas ─────────────────────────────────────────────────────────────────

export interface Task {
  id: string;
  name: string;
  created: string | null;
  start: string | null;
  start_time: string | null;
  due: string | null;
  due_time: string | null;
  status: string;
  subject: string;
  priority: number;
  reminder: string | null;
  reminder_done: boolean;
  body: string;
  repeat: string;
  repeat_until: string | null;
  repeat_label: string;
  overdue: boolean;
  done: boolean;
}

export type TaskFields = Partial<Omit<Task, "id" | "created" | "repeat_label" | "overdue" | "done">>;

export interface TasksMeta {
  statuses: string[];
  status_colors: Record<string, string>;
  done_status: string;
  priority_max: number;
  subjects: string[];
}

// ── Hábitos ────────────────────────────────────────────────────────────────

export interface HabitSubtask {
  id: string;
  name: string;
}

export interface Habit {
  id: string;
  name: string;
  icon: string;
  days: number[];
  subtasks: HabitSubtask[];
  repeat?: string;
  start_date?: string;
  end_date?: string;
  paused_from?: string;
  time?: string;
  duration_min?: number;
  in_calendar?: boolean;
  reminder_min?: number;
  colour?: string;
  notes?: string;
  area?: string;
  schedule: string;
}

export type HabitFields = Partial<Omit<Habit, "id" | "subtasks" | "schedule">>;

export interface HabitRangeDay {
  date: string;
  active: string[];
  done: string[];
  pct: number;
}

export interface HabitDayLog {
  date: string;
  active: string[];
  completed: Record<string, boolean>;
  subtasks: Record<string, Record<string, boolean>>;
  notes: string;
  journal: string;
}

export interface HabitRates {
  day: number | null;
  week: number | null;
  month: number | null;
  year: number | null;
}

export interface HabitStats {
  today: string;
  day: number;
  week: number;
  month: number;
  year: number;
  streak: number;
  habits: Record<string, HabitRates>;
}

// ── Calendario ─────────────────────────────────────────────────────────────

export interface Occurrence {
  id: string;
  title: string;
  kind: string; // routine | event | habit | exercise | task | project | issue | goal_item | saving
  date: string;
  start: string | null;
  duration_min: number | null;
  colour: string;
  done: boolean;
  source: string;
  editable: boolean;
  checkable: boolean;
  links: Array<Record<string, string>>;
  reminder_min: number | null;
}

export interface CalItem {
  kind: "event" | "routine" | "task";
  id: string;
  date: string;
  title: string;
  start: string | null;
  duration: number | null;
  location: string;
  description: string;
  reminder_min: number | null;
  colour: string | null;
  repeat: string;
  until: string | null;
  subject: string;
}

export interface CalPayload {
  mode: "create" | "edit";
  kind: "event" | "task";
  orig: { kind?: string; id?: string; date?: string };
  title: string;
  date: string;
  start: string | null;
  duration: number | null;
  repeat: string;
  until: string | null;
  location: string;
  description: string;
  subject: string;
  reminder_min: number | null;
  colour: string;
}

export interface CalSettings {
  day_start_hour: number;
  day_end_hour: number;
  default_duration_min: number;
}

export interface CalRoutine {
  id: string;
  title: string;
  start: string | null;
  duration_min: number | null;
  colour: string;
  repeat: string;
  describe: string;
  active_from: string | null;
  active_until: string | null;
  notes: string;
  reminder_min: number | null;
}

// ── Áreas y adjuntos ───────────────────────────────────────────────────────

export interface Area {
  id: string;
  name: string;
  icon: string;
  colour: string;
  order: number;
  archived: boolean;
}

// ── Proyectos ──────────────────────────────────────────────────────────────

export interface Project {
  id: string;
  key: string;
  name: string;
  status: string;
  status_colour: string;
  area: string;
  colour: string;
  icon: string;
  created: string | null;
  start: string | null;
  deadline: string | null;
  columns: string[];
  done_column: string;
  in_calendar: boolean;
  description: string;
  days_left: number | null;
  overdue: boolean;
}

export interface IssueSummary {
  total: number;
  done: number;
  open: number;
  overdue: number;
  progress: number;
  estimate_min: number;
  estimate_done_min: number;
  done_this_week?: number;
  days_left?: number | null;
}

export interface ProjectCard extends Project {
  summary: IssueSummary;
  throughput: number[];
  next_due: { key: string; title: string; due: string } | null;
}

export interface Issue {
  id: string;
  number: number;
  key: string;
  type: string;
  icon: string;
  type_colour: string;
  parent: string;
  title: string;
  status: string;
  priority: number;
  order: number;
  estimate_min: number | null;
  labels: string[];
  created: string | null;
  start: string | null;
  due: string | null;
  due_time: string;
  repeat: string;
  repeat_until: string | null;
  in_calendar: boolean;
  reminder: string | null;
  done_at: string | null;
  attachments: string[];
  updated: string | null;
  description: string;
  children: string[];
  done: boolean;
  overdue: boolean;
  linked_folder: string;
  linked_notes: string[];
}

export interface ProjectDetail {
  project: Project;
  progress: number;
  issues: Issue[];
  stats: {
    summary: IssueSummary;
    by_status: Array<[string, number]>;
    by_priority: Array<[number, number]>;
    by_type: Array<[string, number]>;
    submetas: Array<IssueSummary & { id: string }>;
    burndown: { days: string[]; remaining: Array<number | null>; ideal: number[] };
    throughput: Array<[string, number]>;
    cycle_days: number | null;
  };
}

export interface ProjectsMeta {
  statuses: string[];
  status_colours: Record<string, string>;
  types: string[];
  type_icons: Record<string, string>;
  type_colours: Record<string, string>;
  palette: string[];
  default_columns: string[];
}

export interface ProjectNoteEntry {
  path: string;
  dir: boolean;
  name: string;
  size?: number;
  modified?: number;
}
