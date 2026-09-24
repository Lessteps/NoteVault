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
