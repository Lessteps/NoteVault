// The only door from the UI to Python.
//
// Inside the desktop app, pywebview injects `window.pywebview.api` (the
// public methods of NoteVaultApi). Opened in a browser from the dev bridge
// (python -m notevault_app.webapp.devserver), calls go over localhost HTTP
// with a per-run token. Both reject with an Error carrying Python's message.

import type {
  AiConfig, AiProvider, AppInfo, Area, Bookmark, VaultInfo, HomeOverview, Exercise, ExerciseDay, ExerciseOverview, FinCategory, FinCheck, FinGoal, FinMeta, FinPace, FinSidebar, FinTotals, Movement, Goal, GoalCard, GoalDetail, GoalItem, GoalsMeta, GoalsSidebar, GoalsTodayRow, Issue, Project, ProjectCard, ProjectDetail, ProjectFolder, FolderEntry, ProjectNoteEntry, ProjectsMeta, CalItem, CalPayload, CalRoutine, CalSettings, Habit, HabitDayLog, HabitFields, HabitRangeDay, HabitStats, HabitSubtask,
  IndexEntry, Mentions, NoteData, Occurrence, SearchHit, Task, TaskFields, TasksMeta, TreeEntry, WriteResult,
  RenderingSettings, GpuStatus, Conversation, ConversationMeta,
} from "./types";

type PyApi = Record<string, (...args: unknown[]) => Promise<unknown>>;

declare global {
  interface Window {
    pywebview?: { api: PyApi };
    nv?: {
      invoke: (method: string, args: unknown[]) => Promise<unknown>;
      onWatchEvent?: (cb: (data: { eventType: string; relPath: string; fullPath: string }) => void) => () => void;
      onBrowserState?: (cb: (data: BrowserState) => void) => () => void;
      onWindowState?: (cb: (data: { maximized: boolean }) => void) => () => void;
      onAiStream?: (cb: (data: AiStreamEvent) => void) => () => void;
    };
  }
}

/** One event of a streamed assistant answer (channel `nv-ai-stream`). */
export interface AiStreamEvent {
  id: string;
  type: "start" | "delta" | "thinking" | "done" | "error";
  /** A token, for `delta` (answer) and `thinking` (model reasoning). */
  text?: string;
  /** The failure, for `error`. */
  message?: string;
  /** For `done`: the user cancelled, so the answer is partial. */
  stopped?: boolean;
}

/** A past revision of a file, as reported by the vault's git repository. */
export interface VersionRevision {
  hash: string;
  date: string;
  author: string;
  subject: string;
}

export interface BrowserBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BrowserState {
  url: string;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
  /** site icon as a data URL, empty when unknown */
  favicon?: string;
  /** whether the native view is attached to the window */
  attached?: boolean;
}

type Transport = { kind: "pywebview" } | { kind: "http"; token: string } | { kind: "electron" };

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
    if (window.nv) {
      done({ kind: "electron" });
      return;
    }
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
  if (t.kind === "electron") {
    try {
      return (await window.nv!.invoke(method, args)) as T;
    } catch (e) {
      throw asError(e);
    }
  }
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

export const getRendering = () => call<RenderingSettings>("get_rendering");
export const setRendering = (patch: Partial<RenderingSettings>) => call<RenderingSettings>("set_rendering", patch);
export const gpuStatus = () => call<GpuStatus>("gpu_status");
export const relaunchApp = () => call<{ ok: boolean }>("relaunch_app");

export const api = {
  appInfo: () => call<AppInfo>("app_info"),
  stats: () => call<{ notes: number }>("stats"),
  setTheme: (theme: "dark" | "light") => call<{ theme: string }>("set_theme", theme),
  openExternal: (url: string) => call<{ ok: boolean }>("open_external", url),
  setUnsaved: (count: number) => call<{ ok: boolean }>("set_unsaved", count),
  getRendering,
  setRendering,
  gpuStatus,
  relaunchApp,

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

  // Proyectos · carpetas vinculadas (Notas)
  pickFolder: () => call<{ path: string | null }>("projects_pick_folder"),
  projectFolders: (pid: string) => call<ProjectFolder[]>("projects_folders", pid),
  projectFolderLink: (pid: string, folderPath: string) =>
    call<{ folder: ProjectFolder; folders: ProjectFolder[]; warning: string }>("projects_folder_link", pid, folderPath),
  projectFolderUnlink: (pid: string, folderId: string) =>
    call<{ folders: ProjectFolder[] }>("projects_folder_unlink", pid, folderId),
  projectFolderTarget: (pid: string, folderId: string) =>
    call<{ folders: ProjectFolder[] }>("projects_folder_target", pid, folderId),
  projectFolderTree: (pid: string, folderId: string) =>
    call<{ folder: ProjectFolder; entries: FolderEntry[] }>("projects_folder_tree", pid, folderId),
  projectFileRead: (pid: string, folderId: string, rel: string) =>
    call<{ raw: string; modified: number; size: number; kind: string; readonly: boolean }>("projects_file_read", pid, folderId, rel),
  projectFileWrite: (pid: string, folderId: string, rel: string, raw: string, expectedModified: number | null = null) =>
    call<{ ok: boolean; conflict: boolean; modified: number }>("projects_file_write", pid, folderId, rel, raw, expectedModified),
  projectFileCreate: (pid: string, folderId: string, rel: string, name: string, isFolder = false) =>
    call<{ entry: FolderEntry }>("projects_file_create", pid, folderId, rel, name, isFolder),
  projectFileRename: (pid: string, folderId: string, rel: string, newName: string) =>
    call<{ entry: FolderEntry }>("projects_file_rename", pid, folderId, rel, newName),
  projectFileMove: (pid: string, folderId: string, rel: string, destRel: string, destFolderId = "") =>
    call<{ entry: FolderEntry }>("projects_file_move", pid, folderId, rel, destRel, destFolderId),
  projectFileDelete: (pid: string, folderId: string, rel: string) =>
    call<{ ok: boolean }>("projects_file_delete", pid, folderId, rel),
  projectFileOpen: (pid: string, folderId: string, rel: string, mode: "open" | "reveal" = "open") =>
    call<{ ok: boolean }>("projects_file_open", pid, folderId, rel, mode),
  projectFileData: (pid: string, folderId: string, rel: string) =>
    call<{ data_url: string; mime: string; size: number }>("projects_file_data", pid, folderId, rel),
  projectNotesMigrate: (pid: string, folderId: string) =>
    call<{ moved: string[]; skipped: string[] }>("projects_notes_migrate", pid, folderId),
  projectNotesLegacy: (pid: string) => call<{ dir: string; files: string[] }>("projects_notes_legacy", pid),

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
  exStats: (year = 0) => call<import("./types").ExerciseStats>("ex_stats", year),
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
  aiSettings: () => call<{ config: AiConfig; providers: AiProvider[]; models: string[] }>("ai_settings"),
  aiSettingsSave: (fields: Partial<AiConfig> & { api_key?: string; clear_key?: boolean }) => call<AiConfig>("ai_settings_save", fields),
  aiModels: () => call<string[]>("ai_models"),
  aiTest: () => call<{ ok: boolean; reply: string }>("ai_test"),
  aiWorkspace: (rel: string) => call<{ id: string; name: string; icon: string }>("ai_workspace", rel),
  aiChat: (history: Array<{ role: string; content: string }>, question: string, noteRel = "", selection = "") =>
    call<{ reply?: string; bridge?: boolean; prompt?: string; url?: string; label?: string }>("ai_chat", history, question, noteRel, selection),
  /** Streamed chat: the answer arrives over onAiStream, the promise holds it whole. */
  aiChatStream: (id: string, history: Array<{ role: string; content: string }>, question: string, noteRel = "", selection = "", mode = "") =>
    call<{ reply?: string; stopped?: boolean; bridge?: boolean; prompt?: string; url?: string; label?: string }>(
      "ai_chat_stream", id, history, question, noteRel, selection, mode,
    ),
  /** What a chat action would create (nothing is written). */
  assistantActionPreview: (action: unknown) =>
    call<{ title: string; warnings: string[]; open: string; ops: Array<{ kind: "mkdir" | "write"; rel: string; exists: boolean; overwrite: boolean }> }>(
      "assistant_action_preview", action,
    ),
  /** Runs an action the user accepted. */
  assistantActionApply: (action: unknown) =>
    call<{ ok: boolean; written: string[]; skipped: string[]; open: string }>("assistant_action_apply", action),
  aiChatCancel: (id: string) => call<{ ok: boolean }>("ai_chat_cancel", id),
  onAiStream: (cb: (ev: AiStreamEvent) => void): (() => void) => {
    if (typeof window !== "undefined" && window.nv?.onAiStream) {
      return window.nv.onAiStream(cb);
    }
    return () => {};
  },

  // ── Historial de conversaciones (privado, en los datos de la app) ────
  conversationList: () => call<ConversationMeta[]>("conversation_list"),
  conversationGet: (id: string) => call<Conversation>("conversation_get", id),
  conversationSave: (id: string | null, messages: unknown[], model = "", title = "") =>
    call<Conversation>("conversation_save", id, messages, model, title),
  conversationRename: (id: string, title: string) => call<Conversation>("conversation_rename", id, title),
  conversationDelete: (id: string) => call<{ ok: boolean }>("conversation_delete", id),
  aiTitle: (id: string, question: string, answer = "") =>
    call<{ title: string; fallback?: boolean; error?: string }>("ai_title", id, question, answer),
  notePropertiesMeta: () => call<{ subjects: string[]; types: string[]; statuses: string[] }>("note_properties_meta"),
  noteSetProperties: (rel: string, props: Record<string, unknown>, expectedModified: number | null = null) =>
    call<WriteResult>("note_set_properties", rel, props, expectedModified),
  englishSentences: () => call<string[]>("english_sentences"),
  englishSpeak: (text: string) => call<{ ok: boolean }>("english_speak", text),
  revealInOs: (rel: string) => call<{ ok: boolean }>("reveal_in_os", rel),
  duplicate: (rel: string) => call<{ path: string }>("duplicate", rel),
  openInDefaultApp: (rel: string) => call<{ ok: boolean }>("open_in_default_app", rel),
  openInNewWindow: (rel: string) => call<{ ok: boolean }>("window_open_new", rel),
  versionHistory: (rel: string) => call<{ hash: string; date: string; author: string; subject: string }[]>("version_history", rel),
  versionFile: (rel: string, hash: string) => call<{ content: string }>("version_file", rel, hash),
  homeOverview: () => call<HomeOverview>("home_overview"),
  templatesList: () => call<{ folder: string; templates: Array<{ name: string; title: string }> }>("templates_list"),
  templateText: (name: string, title = "") => call<{ text: string }>("template_text", name, title),
  noteFromTemplate: (name: string, title: string, folder = "") => call<{ path: string }>("note_from_template", name, title, folder),
  dailyNote: () => call<{ path: string }>("daily_note"),
  tagsList: () => call<Array<{ tag: string; count: number }>>("tags_list"),
  tagNotes: (tag: string) => call<Array<{ path: string; title: string }>>("tag_notes", tag),
  canvasRead: (rel: string) => call<{ path: string; title: string; doc: import("./canvas").CanvasDoc; modified: number }>("canvas_read", rel),
  canvasWrite: (rel: string, doc: import("./canvas").CanvasDoc, expectedModified: number | null) =>
    call<WriteResult>("canvas_write", rel, doc, expectedModified),
  canvasCreate: (title: string, folder = "") => call<{ path: string }>("canvas_create", title, folder),
  canvasList: () => call<Array<{ path: string; title: string }>>("canvas_list"),
  canvasImages: () => call<Array<{ path: string; title: string }>>("canvas_images"),
  canvasMedia: (rel: string) => call<{ data_url: string }>("canvas_media", rel),
  canvasFileInfo: (rel: string) =>
    call<{ exists: boolean; kind?: string; title?: string; path?: string; text?: string }>("canvas_file_info", rel),
  practiceLoad: (rel: string) => call<import("./types").PracticeExercise>("practice_load", rel),
  practiceSolution: (rel: string) => call<{ solution: string }>("practice_solution", rel),
  practiceSaveDraft: (rel: string, text: string) => call<{ ok: boolean }>("practice_save_draft", rel, text),
  practiceGrade: (rel: string, answer: string, hints: number, seconds: number, solutionSeen: boolean, via = "") =>
    call<import("./types").PracticeGraded | import("./types").PracticeWaiting>("practice_grade", rel, answer, hints, seconds, solutionSeen, via),
  practiceReply: (rel: string, request: string, text = "") =>
    call<import("./types").PracticeGraded | import("./types").PracticeWaiting>("practice_reply", rel, request, text),
  practiceDiscard: (rel: string, request: string) => call<{ ok: boolean }>("practice_discard", rel, request),
  practiceGiveUp: (rel: string, seconds: number, hints: number) => call<import("./types").PracticeGraded>("practice_give_up", rel, seconds, hints),
  practiceDrillStart: (rel: string) => call<{ session: string; prompts: string[] }>("practice_drill_start", rel),
  practiceDrillCheck: (session: string, index: number, given: string, seconds: number) =>
    call<{ ok: boolean; answer: string }>("practice_drill_check", session, index, given, seconds),
  practiceDrillFinish: (session: string, seconds: number) => call<import("./types").PracticeGraded>("practice_drill_finish", session, seconds),
  ladderLoad: (rel: string) => call<import("./types").LadderInfo>("ladder_load", rel),
  ladderLevel: (rel: string, level: number) => call<import("./types").LadderLevel>("ladder_level", rel, level),
  ladderSaveDraft: (rel: string, level: number, data: import("./types").LadderData) => call<{ ok: boolean }>("ladder_save_draft", rel, level, data),
  ladderGrade: (rel: string, level: number, data: import("./types").LadderData, seconds: number, solutionSeen: boolean, via = "") =>
    call<import("./types").LadderGraded | import("./types").PracticeWaiting>("ladder_grade", rel, level, data, seconds, solutionSeen, via),
  ladderReply: (rel: string, request: string, text = "") =>
    call<import("./types").LadderGraded | import("./types").PracticeWaiting>("ladder_reply", rel, request, text),
  ladderDiscard: (rel: string, request: string) => call<{ ok: boolean }>("ladder_discard", rel, request),
  ladderProof: (rel: string) => call<{ proof: string }>("ladder_proof", rel),
  ladderGiveUp: (rel: string, level: number, data: import("./types").LadderData, seconds: number) =>
    call<import("./types").LadderGraded>("ladder_give_up", rel, level, data, seconds),
  studyArea: (rel: string) => call<{ subject: string; folder: string; title: string; subject_title: string } | null>("study_area", rel),
  studySnapshot: (rel: string) => call<import("./types").StudySnapshot>("study_snapshot", rel),
  studyTopicGet: (rel: string) => call<import("./types").TopicData>("study_topic_get", rel),
  /** The view file of a folder (created when missing): practica or resumen. */
studyTopicMap: (rel: string) => call<{ ok: boolean; path: string }>("study_topic_map", rel),
    studyViewEnsure: (rel: string) =>
    call<{ ok: boolean; kind: "practica" | "resumen" | "ejercicios" | "none"; path: string; created: string[]; tagged?: string[]; errors: string[] }>("study_view_ensure", rel),
  studyTopicConvert: (folder: string) => call<{ ok: boolean; path: string; manifest: any }>("study_topic_convert", folder),
  studyTopicSessionBuild: (
    folder: string,
    skill: string,
    difficulty: number,
    quantity: string,
    assistance: string,
  ) => call<import("./types").TopicSessionResult>("study_topic_session_build", folder, skill, difficulty, quantity, assistance),
  /** AI reads the topic's theory and rewrites its practice plan (skills x difficulty counts). */
  studyTopicReevaluate: (folder: string) =>
    call<{ ok: boolean; plan: import("./types").PracticePlan; path: string }>("study_topic_reevaluate", folder),
  /** The topic review notes: when each practised topic is due again. */
  studyReviewsList: () =>
    call<{ today: string; items: import("./types").ReviewItem[] }>("study_reviews_list"),
  /** The AI proposes areas and topics for a subject (nothing is written). */
  studySpacePropose: (subject: string, scope: string, objective: string, existingFolder = "") =>
    call<{ areas: Array<{ name: string; topics: Array<{ name: string }> }>; conversationId: string }>("study_space_propose", subject, scope, objective, existingFolder),
  studySpaceGenerate: (request: unknown) => call<{ jobId: string; conversationId: string }>("study_space_generate", request),
  studySpaceStatus: (jobId: string) =>
    call<{ id: string; folder: string; log: string[]; done: boolean; error: string; finished: number; total: number; conversationId: string }>("study_space_status", jobId),
  studySpaceList: () => call<string[]>("study_space_list"),
  studyTopicPlan: (folder: string) =>
    call<{ plan: import("./types").PracticePlan | null }>("study_topic_plan", folder),
  studyTopicDashboard: (subject?: string) => call<import("./types").TopicDashboardData>("study_topic_dashboard", subject),
  /** AI-drafts a subject's areas/topics and creates the folder tree + overviews. */
  studyGenerateSyllabus: (subject: string) =>
    call<{ ok: boolean; created: string[]; folders: string[]; plan: unknown }>("study_generate_syllabus", subject),
  /** A session drawn from every topic of an area (see `study_area_session_build`). */
  studyAreaSessionBuild: (
    folder: string,
    skill: string,
    difficulty: number,
    quantity: string,
    assistance: string,
  ) => call<import("./types").TopicSessionResult>("study_area_session_build", folder, skill, difficulty, quantity, assistance),
  studyExamAssemble: (
    topicFolder?: string,
    examGroup?: string,
    targetDifficulty?: number,
  ) => call<{ ok: boolean; session: import("./types").ExamSession }>("study_exam_assemble", topicFolder, examGroup, targetDifficulty),
  studyExamSubmit: (
    session: import("./types").ExamSession,
    submissions: import("./types").ExamItemSubmission[],
  ) => call<{ ok: boolean; record: import("./types").ExamRecord; item_results: import("./types").ExamItemGradingResult[] }>("study_exam_submit", session, submissions),
  studyCardGrade: (srsId: string, quality: number) => call<{ ok: boolean }>("study_card_grade", srsId, quality),
  studyErrorResolve: (id: string) => call<{ ok: boolean }>("study_error_resolve", id),
  studyErrorDigest: () => call<{ text: string }>("study_error_digest"),
  mapTemplates: () => call<Array<{ name: string; yaml: string }>>("map_templates"),
  mapBuild: (yaml: string, folder: string, name: string) => call<{ ok: boolean; path?: string; errors?: string[] }>("map_build", yaml, folder, name),
  mapGenerate: (order: string, context: string[], extra: string, template: string, folder: string, name: string) =>
    call<{ ok: boolean; path?: string; errors?: string[]; bridge?: boolean; prompt?: string; url?: string; label?: string }>(
      "map_generate", order, context, extra, template, folder, name),
  webOverview: (day = "") => call<import("./types").WebOverview>("web_overview", day),
  webNormalize: (text: string) => call<{ url: string; host: string }>("web_normalize", text),
  webBookmarkAdd: (title: string, url: string) => call<{ id: string; title: string; url: string }>("web_bookmark_add", title, url),
  webBookmarkRemove: (url: string) => call<{ ok: boolean }>("web_bookmark_remove", url),
  webHistoryClear: () => call<{ ok: boolean }>("web_history_clear"),
  webRestrictionsSave: (data: import("./types").WebRules, phrase = "") =>
    call<{ ok: boolean; needs_phrase?: boolean; phrase?: string; restrictions?: import("./types").WebRules }>("web_restrictions_save", data, phrase),
  webPreset: (data: import("./types").WebRules, name: string) => call<import("./types").WebRules>("web_preset", data, name),
  webOpen: (text: string) => call<{ ok: boolean; blocked?: boolean; reason?: string; system?: boolean }>("web_open", text),
  studyFolders: () => call<Array<{ id: string; name: string; icon: string; exists: boolean; index: string }>>("study_folders"),
  studyFolderCreate: (id: string, structure: boolean) => call<{ path: string; created: boolean; index: string }>("study_folder_create", id, structure),
  enPlayerPick: () => call<import("./types").PlayerMedia & { ok: boolean }>("en_player_pick"),
  enPlayerOpen: (file: string, seconds = 0) => call<import("./types").PlayerMedia & { ok: boolean }>("en_player_open", file, seconds),
  enPlayerSubtitles: (id: string, track: "en" | "es") =>
    call<{ ok: boolean; pairs?: import("./player").Pair[]; en_file?: string; es_file?: string }>("en_player_subtitles", id, track),
  enPlayerLink: (id: string, seconds: number) => call<{ link: string }>("en_player_link", id, seconds),
  enPlayerMine: (id: string, fields: { sentence: string; seconds: number; mode: "translate" | "cloze"; target: string; level: string; reference_es: string }) =>
    call<{ path: string; stamp: string }>("en_player_mine", id, fields),
  saveTextAs: (name: string, text: string) => call<{ ok: boolean; fallback?: boolean; path?: string }>("save_text_as", name, text),
  onWatchEvent: (cb: (data: { eventType: string; relPath: string; fullPath: string }) => void): (() => void) => {
    if (typeof window !== "undefined" && window.nv?.onWatchEvent) {
      return window.nv.onWatchEvent(cb);
    }
    return () => {};
  },
  browserAttach: (bounds: BrowserBounds, url?: string) => call<BrowserState>("browser_attach", bounds, url),
  browserDetach: () => call<{ ok: boolean }>("browser_detach"),
  browserSetBounds: (bounds: BrowserBounds) => call<{ ok: boolean }>("browser_set_bounds", bounds),
  browserNavigate: (url: string) => call<BrowserState>("browser_navigate", url),
  browserAction: (action: "back" | "forward" | "reload" | "stop") => call<BrowserState>("browser_action", action),
  browserState: () => call<BrowserState>("browser_state"),
  browserDestroy: () => call<{ ok: boolean }>("browser_destroy"),
  onBrowserState: (cb: (state: BrowserState) => void): (() => void) => {
    if (typeof window !== "undefined" && window.nv?.onBrowserState) {
      return window.nv.onBrowserState(cb);
    }
    return () => {};
  },

  // ── Window controls (the app draws its own title bar) ────────────────
  windowMinimize: () => call<{ maximized: boolean }>("window_minimize"),
  windowToggleMaximize: () => call<{ maximized: boolean }>("window_toggle_maximize"),
  windowClose: () => call<{ ok: boolean }>("window_close"),
  windowState: () => call<{ maximized: boolean }>("window_state"),
  onWindowState: (cb: (state: { maximized: boolean }) => void): (() => void) => {
    if (typeof window !== "undefined" && window.nv?.onWindowState) {
      return window.nv.onWindowState(cb);
    }
    return () => {};
  },
};

/**
 * True when the UI runs inside the Electron shell, the only host that has a
 * window of its own to minimise/maximise/close (pywebview and the dev bridge
 * bring their own chrome).
 */
export const isElectron = (): boolean =>
  typeof window !== "undefined" && Boolean(window.nv);
