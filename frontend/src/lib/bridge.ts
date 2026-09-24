// The only door from the UI to Python.
//
// Inside the desktop app, pywebview injects `window.pywebview.api` (the
// public methods of NoteVaultApi). Opened in a browser from the dev bridge
// (python -m notevault_app.webapp.devserver), calls go over localhost HTTP
// with a per-run token. Both reject with an Error carrying Python's message.

import type {
  AppInfo, Bookmark, Habit, HabitDayLog, HabitFields, HabitRangeDay, HabitStats, HabitSubtask,
  IndexEntry, Mentions, NoteData, SearchHit, Task, TaskFields, TasksMeta, TreeEntry, WriteResult,
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
};
