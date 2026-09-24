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

// ── Metas ──────────────────────────────────────────────────────────────────

export interface Goal {
  id: string;
  name: string;
  area: string;
  status: string;
  status_colour: string;
  priority: number;
  start: string | null;
  end: string | null;
  icon: string;
  colour: string;
  in_overview: boolean;
  order: number | null;
  created: string | null;
  description: string;
  overdue: boolean;
  days_left: number | null;
  linked_folder: string;
  linked_notes: string[];
}

export interface GoalCard extends Goal {
  progress: number;
  counts: [number, number];
  adherence7: number | null;
  daily: number[];
  next: { name: string; date: string } | null;
  overdue_items: number;
  habits: Array<{ id: string; name: string; icon: string }>;
}

export interface GoalItem {
  id: string;
  goal: string;
  parent: string;
  name: string;
  status: string;
  priority: number;
  order: number;
  start: string | null;
  due: string | null;
  due_time: string;
  duration_min: number | null;
  repeat: string;
  repeat_until: string | null;
  in_calendar: boolean;
  reminder_min: number | null;
  target: number | null;
  unit: string;
  value: number | null;
  habit_links: string[];
  done_at: string | null;
  created: string | null;
  notes: string;
  category: string;
  is_priority: boolean;
  children: string[];
  is_leaf: boolean;
  measurable: boolean;
  schedule: string;
  progress: number;
  counts: [number, number];
  adherence7: number | null;
  adherence30: number | null;
  streak: number;
  done_today: boolean;
  value_today: number | null;
  late: boolean;
  linked_folder: string;
  linked_notes: string[];
}

export interface GoalDetail {
  goal: Goal;
  items: GoalItem[];
  categories: string[];
  stats: {
    progress: number;
    counts: [number, number];
    adherence7: number | null;
    adherence30: number | null;
    best_streak: number;
    days_left: number | null;
  };
  history: {
    days: string[];
    daily: number[];
    repeating: Array<{ id: string; name: string; cells: Array<number | null>; streak: number; progress: number }>;
    completed: Array<{ id: string; name: string; done_at: string }>;
  };
}

export interface GoalsTodayRow {
  goal: { id: string; name: string; icon: string; colour: string; area: string };
  item: {
    id: string; name: string; priority: number; due: string | null; due_time: string;
    repeating: boolean; measurable: boolean; target: number | null; unit: string;
  };
  done: boolean;
  value: number | null;
  late: boolean;
  streak: number;
}

export interface GoalsSidebar {
  today: number;
  areas: Record<string, number>;
  no_area: number;
  all: number;
  filters: Record<string, number>;
}

export interface GoalsMeta {
  statuses: string[];
  status_colours: Record<string, string>;
  item_statuses: string[];
  filters: string[];
}

// ── Finanzas ───────────────────────────────────────────────────────────────

export type MovementType = "gasto" | "ingreso" | "ahorro" | "retiro";

export interface Movement {
  id: string;
  type: MovementType;
  amount_cents: number;
  currency: string;
  category?: string;
  goal?: string;
  what?: string;
  reason?: string;
  time?: string;
  attachments: string[];
  created?: string;
  date: string;
}

export interface FinCategory {
  id: string;
  name: string;
  icon: string;
  colour: string;
  kind: "gasto" | "ingreso";
  budget_month_cents: number;
  order: number;
  archived: boolean;
}

export interface FinGoal {
  id: string;
  name: string;
  icon: string;
  colour: string;
  target_cents: number;
  currency: string;
  start: string;
  deadline: string;
  show_in_daily: boolean;
  cadence: { mode: "rule"; rule: string } | { mode: "period"; period: "week" | "month" };
  suggested_cents: number;
  status: string;
  created: string;
  notes: string;
}

export interface FinPace {
  saved: number;
  remaining: number;
  per_day: number | null;
  per_week: number | null;
  per_month: number | null;
  days_left: number | null;
}

export type FinTotals = Record<MovementType | "balance", number>;

export interface FinMeta {
  types: MovementType[];
  type_labels: Record<MovementType, string>;
  type_colours: Record<MovementType, string>;
  goal_statuses: string[];
  currency: string;
  categories: FinCategory[];
  goals: FinGoal[];
}

export interface FinSidebar {
  pending: number;
  month: FinTotals;
  general: number;
  goals: Array<{ id: string; icon: string; name: string; saved: number }>;
  total_saved: number;
}

export interface FinCheck {
  goal: FinGoal;
  checked: boolean;
  ids: string[];
  pace: FinPace;
  first: string;
  last: string;
}

// ── Ejercicio ──────────────────────────────────────────────────────────────

export interface Exercise {
  id: string;
  day: string;
  name: string;
  video: string;
  video_path: string;
  series_reps: string;
  rest: string;
  how_to: string;
  has_video: boolean;
  video_name: string;
}

export interface ExerciseEntry {
  done?: boolean;
  weight?: number;
  reps?: number;
  notes?: string;
}

export interface ExerciseDay {
  date: string;
  day: string;
  exercises: Exercise[];
  log: Record<string, ExerciseEntry>;
  pct: number;
}

export interface ExerciseOverview {
  week: number;
  month: number;
  year: number;
  grid: Record<string, number>;
  breakdown: Array<{ day: string; rows: Array<{ id: string; name: string; done: number; total: number }> }>;
}

// ── Vista General ─────────────────────────────────────────────────────────

export interface HomeOverview {
  today: string;
  habits: Array<{ id: string; name: string; icon: string; done: boolean; subs: [number, number] }>;
  exercise: { day: string; rows: Array<{ id: string; name: string; series_reps: string; how_to: string; entry: ExerciseEntry }> };
  tasks: { today: HomeTask[]; overdue: HomeTask[] };
  projects: {
    issues: Array<{ project: { id: string; name: string; colour: string; done_column: string; first_column: string }; id: string; key: string; title: string; due: string; done: boolean }>;
    active: Array<{ id: string; name: string; icon: string; colour: string; progress: number }>;
  };
  finance: { day: FinTotals; month: FinTotals; prev: FinTotals; checks: Array<{ goal: { id: string; name: string; icon: string; colour: string; suggested_cents: number }; checked: boolean }> };
  goals: {
    list: Array<{ id: string; name: string; icon: string; colour: string; progress: number }>;
    items: Array<{ goal: { id: string; name: string; icon: string; colour: string }; item: { id: string; name: string; priority: number; due_time: string; measurable: boolean; target: number | null; unit: string }; done: boolean }>;
    any: boolean;
  };
}

export interface HomeTask {
  id: string; name: string; status: string; subject: string; priority: number; due: string | null; done: boolean;
}

export interface VaultInfo {
  path: string;
  name: string;
  current?: boolean;
  exists?: boolean;
  markdown: number;
  folders: number;
  code_markers: number;
  truncated: boolean;
  obsidian: boolean;
}

// ── Asistente ──────────────────────────────────────────────────────────────

export interface AiConfig {
  provider: string;
  base_url: string;
  model: string;
  has_key: boolean;
  temperature: number;
  max_tokens: number;
  include_note: boolean;
  is_bridge: boolean;
}

export interface AiProvider {
  key: string;
  label: string;
  hint: string;
  needs_key: boolean;
  needs_url: boolean;
  default_url: string;
  default_model: string;
  bridge: boolean;
}

export interface PracticeResult {
  score: number;
  verdict: "correct" | "partial" | "incorrect" | string;
  rubric: boolean[];
  errors: Array<{ category: string; anchor: string; description: string; evidence: string; fix: string }>;
  feedback: string;
  next_step: string;
  example: string;
}

export interface PracticeAttempt { at: string; score: number; verdict: string; quality: number | null; seconds: number; transport: string }

export interface PracticePending { id: string; answer: string; hints_used: number; seconds: number; solution_seen: boolean }

export interface PracticeExercise {
  path: string;
  note_id: string;
  title: string;
  subject: string;
  discipline: string;
  skill: string;
  mode: { id: string; label: string; answer_kind: "text" | "code" | "short" | "drill" };
  difficulty: number;
  level: string;
  assistance: "helper" | "nohelp";
  timer: import("./practiceTimer").TimerSpec;
  statement: string;
  code: string;
  code_lang: string;
  hints: string[];
  has_solution: boolean;
  rubric: string[];
  drill: { kind: string; label: string; items: number } | null;
  draft: string;
  history: PracticeAttempt[];
  pending: PracticePending | null;
}

export interface PracticeGraded { graded: true; result: PracticeResult; quality: number | null; history: PracticeAttempt[]; solution?: string }
export interface PracticeWaiting {
  graded: false;
  waiting?: boolean;
  request?: string;
  request_path?: string;
  response_file?: string;
  bridge?: boolean;
  prompt?: string;
  url?: string;
  label?: string;
}

export interface LadderInfo {
  path: string;
  title: string;
  subject: string;
  technique: string;
  difficulty: number;
  statement: string;
  steps: number;
  levels: Array<{ number: number; label: string }>;
  state: { current: number; passed: number[]; best: Record<string, number>; count: Record<string, number> };
  history: Array<PracticeAttempt & { level: number }>;
  pending: { id: string; level: number } | null;
}

export interface LadderLevel {
  level: number;
  label: string;
  task: string;
  timer: import("./practiceTimer").TimerSpec;
  fields: string[];
  order?: number[];
  hidden?: number[];
  steps?: Array<{ text: string; why?: string }>;
  variants?: string[];
  variant?: number;
}

export interface LadderData { fields: string[]; order?: number[]; hidden?: number[]; variant?: number }
export interface LadderGraded { graded: true; result: PracticeResult; quality: number | null; rubric: string[]; passed: boolean; message: string; current: number; proof?: string }

export interface StudyExerciseRef { path: string; note_id: string; title: string; discipline: string; skill: string; mode: string; difficulty: number }
export interface StudySnapshot {
  area: { subject: string; title: string; subject_title: string; folder: string };
  exercises: number;
  queue: {
    items: Array<{
      kind: string; title: string; reason: string;
      exercise?: StudyExerciseRef;
      card?: { srs_id: string; source: string; kind: string; question: string; answer: string; missing: boolean };
    }>;
    gaps: string[];
    counts: { recommendations: number; srs_exercises: number; cards: number; total: number };
  };
  ledgers: Array<{
    title: string;
    skills: Array<{
      code: string; title: string; status: "not_started" | "practicing" | "consolidated"; label: string;
      best: number | null; is_due: boolean; due: string; interval_days: number | null; bands: string[];
      exercises: number; attempted: number; practice: string; practice_title: string;
    }>;
  }>;
  concepts: Array<{ title: string; done: number; total: number; best: number | null }>;
  errors: Array<{
    id: string; repeat_count: number; category: string; skill: string; anchor: string;
    description: string; fix: string; seen: string; note: string; source: string;
  }>;
}

export interface WebRules {
  enabled: boolean;
  mode: "blocklist" | "allowlist";
  blocked_domains: string[];
  blocked_patterns: string[];
  allowed_domains: string[];
  daily_limits: Record<string, number>;
  confirm_to_relax: boolean;
}
export interface WebOverview {
  bookmarks: Array<{ id: string; title: string; url: string; folder?: string }>;
  history: Array<{ time: string; url: string; title: string }>;
  history_days: string[];
  day: string;
  usage: Array<{ host: string; seconds: number }>;
  week: Array<{ date: string; seconds: number }>;
  restrictions: WebRules;
  limits: Array<{ domain: string; minutes: number; used: number }>;
  presets: string[];
  relax_phrase: string;
  embedded: boolean;
}
