// The only door from the UI to Python.
//
// Inside the desktop app, pywebview injects `window.pywebview.api` (the
// public methods of NoteVaultApi). Opened in a browser from the dev bridge
// (python -m notevault_app.webapp.devserver), calls go over localhost HTTP
// with a per-run token. Both reject with an Error carrying Python's message.

import type {
  AppInfo, Area, Bookmark, VaultInfo, HomeOverview, Exercise, ExerciseDay, ExerciseOverview, FinCategory, FinCheck, FinGoal, FinMeta, FinPace, FinSidebar, FinTotals, Movement, Goal, GoalCard, GoalDetail, GoalItem, GoalsMeta, GoalsSidebar, GoalsTodayRow, Issue, Project, ProjectCard, ProjectDetail, ProjectNoteEntry, ProjectsMeta, CalItem, CalPayload, CalRoutine, CalSettings, Habit, HabitDayLog, HabitFields, HabitRangeDay, HabitStats, HabitSubtask,
  IndexEntry, Mentions, NoteData, Occurrence, SearchHit, Task, TaskFields, TasksMeta, TreeEntry, WriteResult,
} from "./types";

type PyApi = Record<string, (...args: unknown[]) => Promise<unknown>>;

declare global {
  interface Window {
    pywebview?: { api: PyApi };
  }
}

type Transport = { kind: "pywebview" } | { kind: "http"; token: string };

let transport: Promise<Transport> | null = null;

/**
 * Decide once how to reach Python. pywebview fills in its API a moment after
 * the page loads, so wait for whichever answers first: the pywebview ready
 * event, or the dev bridge's token endpoint.
 */
function getTransport(): Promise<Transport> {
  transport ??= new Promise<Transport>((resolve, reject) => {
    let settled = false;
    const done = (t: Transport) => {
      if (!settled) {
        settled = true;
        resolve(t);
      }
    };
    if (window.pywebview?.api && Object.keys(window.pywebview.api).length) {
      done({ kind: "pywebview" });
      return;
    }
    window.addEventListener("pywebviewready", () => done({ kind: "pywebview" }), {
      once: true,
    });
    fetch("./__nv_dev_token")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { token?: string }) => {
        if (j.token) done({ kind: "http", token: j.token });
      })
      .catch(() => {
        /* not the dev bridge: pywebview will answer */
      });
    setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error("NoteVault: no hay conexión con Python."));
      }
    }, 15000);
  });
  return transport;
}

function asError(e: unknown): Error {
  if (e instanceof Error) return e;
  if (e && typeof e === "object" && "message" in e) {
    return new Error(String((e as { message: unknown }).message));
  }
  return new Error(String(e));
}

export async function call<T>(method: string, ...args: unknown[]): Promise<T> {
  const t = await getTransport();
  if (t.kind === "pywebview") {
    const fn = window.pywebview?.api?.[method];
    if (!fn) throw new Error(`Método desconocido: ${method}`);
    try {
      return (await fn(...args)) as T;
    } catch (e) {
      throw asError(e);
    }
  }
  const res = await fetch(`./api/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-NoteVault-Token": t.token },
    body: JSON.stringify({ args }),
  });
  const payload = (await res.json()) as { result?: T; error?: string };
  if (!res.ok) throw new Error(payload.error ?? `HTTP ${res.status}`);
  return payload.result as T;
}

export const api = {
  appInfo: () => call<AppInfo>("app_info"),
  stats: () => call<{ notes: number }>("stats"),
  setTheme: (theme: "dark" | "light") => call<{ theme: string }>("set_theme", theme),
  openExternal: (url: string) => call<{ ok: boolean }>("open_external", url),
  setUnsaved: (count: number) => call<{ ok: boolean }>("set_unsaved", count),

  listDir: (path = "") => call<TreeEntry[]>("list_dir", path),
  noteIndex: () => call<IndexEntry[]>("note_index"),

  readNote: (path: string) => call<NoteData>("read_note", path),
  writeNote: (path: string, raw: string, expectedModified: number | null) =>
    call<WriteResult>("write_note", path, raw, expectedModified),
  createNote: (title: string, folder = "") => call<{ path: string }>("create_note", title, folder),
  createFolder: (name: string, parent = "") =>
    call<{ path: string }>("create_folder", name, parent),
  rename: (path: string, newName: string) => call<{ path: string }>("rename", path, newName),
  remove: (path: string) => call<{ ok: boolean }>("delete", path),
  move: (path: string, destFolder: string) => call<{ path: string }>("move", path, destFolder),

  resolveLink: (target: string) => call<{ path: string | null }>("resolve_link", target),
  search: (query: string, limit = 100) => call<SearchHit[]>("search", query, limit),
  mentions: (path: string) => call<Mentions>("mentions", path),

  bookmarks: () => call<Bookmark[]>("bookmarks"),
  toggleBookmark: (path: string) => call<{ bookmarked: boolean }>("toggle_bookmark", path),

  readAttachment: (notePath: string, name: string) =>
    call<{ data_url: string }>("read_attachment", notePath, name),

  // Tareas
  tasksMeta: () => call<TasksMeta>("tasks_meta"),
  tasksList: () => call<Task[]>("tasks_list"),
  tasksInRange: (first: string, last: string) =>
    call<Array<{ date: string; id: string }>>("tasks_in_range", first, last),
  tasksCreate: (fields: TaskFields = {}) => call<Task>("tasks_create", fields),
  tasksUpdate: (id: string, fields: TaskFields) => call<Task>("tasks_update", id, fields),
  tasksDelete: (id: string) => call<{ ok: boolean }>("tasks_delete", id),
  tasksDueReminders: () => call<Task[]>("tasks_due_reminders"),
  tasksMarkReminderShown: (id: string) => call<{ ok: boolean }>("tasks_mark_reminder_shown", id),

  // Hábitos
  habitsList: () => call<Habit[]>("habits_list"),
  habitsRange: (first: string, last: string) => call<HabitRangeDay[]>("habits_range", first, last),
  habitsDay: (day: string) => call<HabitDayLog>("habits_day", day),
  habitsStats: (ref = "") => call<HabitStats>("habits_stats", ref),
  habitsSetDone: (day: string, id: string, done: boolean) =>
    call<{ ok: boolean; pct: number }>("habits_set_done", day, id, done),
  habitsSetSubtask: (day: string, id: string, sub: string, done: boolean) =>
    call<{ ok: boolean }>("habits_set_subtask", day, id, sub, done),
  habitsSetDayText: (day: string, notes: string, journal: string) =>
    call<{ ok: boolean }>("habits_set_day_text", day, notes, journal),
  habitsAdd: (fields: HabitFields = {}) => call<Habit>("habits_add", fields),
  habitsUpdate: (id: string, fields: HabitFields) => call<Habit>("habits_update", id, fields),
  habitsRemove: (id: string) => call<{ ok: boolean }>("habits_remove", id),
  habitsReorder: (ids: string[]) => call<{ ok: boolean }>("habits_reorder", ids),
  habitsAddSubtask: (id: string, name: string) => call<HabitSubtask>("habits_add_subtask", id, name),
  habitsRemoveSubtask: (id: string, sub: string) => call<{ ok: boolean }>("habits_remove_subtask", id, sub),

  // Calendario
  calRange: (first: string, last: string) => call<Record<string, Occurrence[]>>("cal_range", first, last),
  calSettings: () => call<CalSettings>("cal_settings"),
  calItem: (day: string, id: string, kind: string) => call<CalItem>("cal_item", day, id, kind),
  calSave: (p: CalPayload) => call<{ ok: boolean; message: string }>("cal_save", p),
  calDelete: (orig: { kind: string; id: string; date: string }, scope: "one" | "all" = "all") =>
    call<{ ok: boolean }>("cal_delete", orig, scope),
  calMove: (occ: Occurrence, day: string, start: string, duration: number) =>
    call<{ ok: boolean }>("cal_move", occ, day, start, duration),
  calSetDone: (day: string, id: string, done: boolean) => call<{ ok: boolean }>("cal_set_done", day, id, done),
  calRoutines: () => call<CalRoutine[]>("cal_routines"),
  calRoutineSave: (id: string | null, fields: Partial<CalRoutine>) =>
    call<{ ok: boolean }>("cal_routine_save", id, fields),
  calRoutineRemove: (id: string) => call<{ ok: boolean }>("cal_routine_remove", id),

  // Áreas y adjuntos
  areasList: (includeArchived = false) => call<Area[]>("areas_list", includeArchived),
  areasSave: (id: string, fields: Partial<Area>) => call<Area>("areas_save", id, fields),
  areasArchive: (id: string, archived = true) => call<{ ok: boolean }>("areas_archive", id, archived),
  areasCreateSuggested: () => call<Area[]>("areas_create_suggested"),
  attachAdd: (module: string, owner: string, filename: string, dataB64: string) =>
    call<{ ref: string }>("attach_add", module, owner, filename, dataB64),
  attachRead: (ref: string) => call<{ name: string; mime: string; data_url: string }>("attach_read", ref),
  attachOpen: (ref: string) => call<{ ok: boolean }>("attach_open", ref),
  attachRemove: (ref: string) => call<{ ok: boolean }>("attach_remove", ref),

  // Proyectos
  projectsMeta: () => call<ProjectsMeta>("projects_meta"),
  projectsList: () => call<ProjectCard[]>("projects_list"),
  projectsGet: (pid: string) => call<ProjectDetail>("projects_get", pid),
  projectsCreate: (fields: Record<string, unknown>) => call<Project>("projects_create", fields),
  projectsUpdate: (pid: string, fields: Record<string, unknown>) => call<Project>("projects_update", pid, fields),
  projectsDelete: (pid: string) => call<{ ok: boolean }>("projects_delete", pid),
  issueCreate: (pid: string, fields: Partial<Issue>) => call<Issue>("projects_issue_create", pid, fields),
  issueUpdate: (pid: string, xid: string, fields: Partial<Issue>) =>
    call<Issue>("projects_issue_update", pid, xid, fields),
  issueMove: (pid: string, xid: string, status: string, index: number) =>
    call<{ ok: boolean }>("projects_issue_move", pid, xid, status, index),
  issueDelete: (pid: string, xid: string) => call<{ ok: boolean }>("projects_issue_delete", pid, xid),
  projectNotesList: (pid: string) => call<ProjectNoteEntry[]>("projects_notes_list", pid),
  projectNoteRead: (pid: string, rel: string) =>
    call<{ path: string; raw: string; modified: number }>("projects_note_read", pid, rel),
  projectNoteWrite: (pid: string, rel: string, raw: string) =>
    call<{ ok: boolean; modified: number }>("projects_note_write", pid, rel, raw),
  projectNoteCreate: (pid: string, folder: string, name: string, isFolder = false) =>
    call<{ path: string }>("projects_note_create", pid, folder, name, isFolder),
  projectNoteDelete: (pid: string, rel: string) => call<{ ok: boolean }>("projects_note_delete", pid, rel),

  // Metas
  goalsMeta: () => call<GoalsMeta>("goals_meta"),
  goalsSidebar: () => call<GoalsSidebar>("goals_sidebar"),
  goalsList: (filter: string, area: string) => call<GoalCard[]>("goals_list", filter, area),
  goalsGet: (gid: string) => call<GoalDetail>("goals_get", gid),
  goalsToday: (day = "", gid = "") => call<{ date: string; rows: GoalsTodayRow[] }>("goals_today", day, gid),
  goalsCreate: (fields: Partial<Goal>, submetas: string[] = []) => call<Goal>("goals_create", fields, submetas),
  goalsUpdate: (gid: string, fields: Partial<Goal>) => call<Goal>("goals_update", gid, fields),
  goalsDelete: (gid: string) => call<{ ok: boolean }>("goals_delete", gid),
  goalItemCreate: (gid: string, name: string, parent = "", fields: Partial<GoalItem> = {}, subtasks: string[] = []) =>
    call<GoalItem>("goals_item_create", gid, name, parent, fields, subtasks),
  goalItemUpdate: (gid: string, iid: string, fields: Partial<GoalItem>) => call<GoalItem>("goals_item_update", gid, iid, fields),
  goalItemDelete: (gid: string, iid: string) => call<{ ok: boolean }>("goals_item_delete", gid, iid),
  goalItemMove: (gid: string, iid: string, parent: string, index: number) =>
    call<{ ok: boolean }>("goals_item_move", gid, iid, parent, index),
  goalItemIndent: (gid: string, iid: string, direction: number) => call<{ ok: boolean }>("goals_item_indent", gid, iid, direction),
  goalSetDone: (gid: string, iid: string, day: string, done: boolean, value: number | string | null = null) =>
    call<{ ok: boolean }>("goals_set_done", gid, iid, day, done, value),

  // Finanzas
  finMeta: () => call<FinMeta>("fin_meta"),
  finSidebar: () => call<FinSidebar>("fin_sidebar"),
  finRange: (first: string, last: string) => call<Movement[]>("fin_range", first, last),
  finMonthExtras: (year: number, month: number) =>
    call<{ budgets: Array<{ category: FinCategory; used: number; budget: number }>; this: FinTotals; prev: FinTotals }>(
      "fin_month_extras", year, month),
  finDueChecks: (day: string) => call<FinCheck[]>("fin_due_checks", day),
  finNewId: () => call<{ id: string }>("fin_new_id"),
  finAdd: (day: string, fields: Partial<Movement>) => call<Movement>("fin_add", day, fields),
  finUpdate: (day: string, id: string, fields: Partial<Movement>, newDay = "") =>
    call<Movement>("fin_update", day, id, fields, newDay),
  finDelete: (day: string, id: string) => call<{ ok: boolean }>("fin_delete", day, id),
  finDeleteMany: (pairs: Array<[string, string]>) => call<{ ok: boolean }>("fin_delete_many", pairs),
  finCategorySave: (id: string, fields: Partial<FinCategory>) => call<FinCategory>("fin_category_save", id, fields),
  finGoals: () => call<{ goals: Array<FinGoal & { pace: FinPace; projection: string | null }>; general: number }>("fin_goals"),
  finGoal: (id: string) => call<{
    goal: FinGoal; pace: FinPace; projection: string | null; days: Array<{ date: string; net: number }>;
    months: Array<[string, number]>; movements: Movement[];
  }>("fin_goal", id),
  finGoalSave: (id: string, fields: Partial<FinGoal>) => call<FinGoal>("fin_goal_save", id, fields),
  finGoalDelete: (id: string) => call<{ ok: boolean }>("fin_goal_delete", id),
  // Ejercicio
  exMeta: () => call<{ days: Array<{ key: string; name: string; subtitle: string; glyph: string }> }>("ex_meta"),
  exList: () => call<Exercise[]>("ex_list"),
  exDays: (first: string, last: string) => call<ExerciseDay[]>("ex_days", first, last),
  exMark: (day: string, id: string, done: boolean, weight: number | string = 0, reps: number | string = 0, notes = "") =>
    call<{ ok: boolean; pct: number }>("ex_mark", day, id, done, weight, reps, notes),
  exOverview: (year = 0, exerciseId = "") => call<ExerciseOverview>("ex_overview", year, exerciseId),
  exSave: (id: string, fields: Partial<Exercise>) => call<Exercise>("ex_save", id, fields),
  exRemove: (id: string) => call<{ ok: boolean }>("ex_remove", id),
  exLinkVideos: () => call<{ linked: string[]; already: string[]; missing: string[] }>("ex_link_videos"),
  exVideoUrl: (id: string) => call<{ url: string; name: string }>("ex_video_url", id),
  exOpenVideo: (id: string) => call<{ ok: boolean }>("ex_open_video", id),
  exPickVideo: (id: string) => call<{ ok: boolean }>("ex_pick_video", id),
  vaultList: () => call<VaultInfo[]>("vault_list"),
  vaultPick: () => call<{ ok: boolean; fallback?: boolean } & Partial<VaultInfo>>("vault_pick"),
  vaultCreate: (name: string) => call<{ ok: boolean; fallback?: boolean; path?: string }>("vault_create", name),
  vaultOpen: (path: string) => call<{ ok: boolean; name: string; path: string }>("vault_open", path),
  knowledgeGraph: () => call<{ nodes: import("./graph").GraphNode[]; edges: import("./graph").GraphEdge[] }>("knowledge_graph"),
  homeOverview: () => call<HomeOverview>("home_overview"),
  saveTextAs: (name: string, text: string) => call<{ ok: boolean; fallback?: boolean; path?: string }>("save_text_as", name, text),
};
