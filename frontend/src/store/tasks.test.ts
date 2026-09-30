import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Task, TasksMeta } from "../lib/types";

const { apiMock } = vi.hoisted(() => ({
  apiMock: {
    tasksList: vi.fn(),
    tasksMeta: vi.fn(),
    tasksCreate: vi.fn(),
    tasksUpdate: vi.fn(),
    tasksDelete: vi.fn(),
  },
}));

vi.mock("../lib/bridge", () => ({ api: apiMock }));

import { EMPTY_FILTERS, applyFilters, useTasks } from "./tasks";
import { useApp } from "./app";

function task(over: Partial<Task> = {}): Task {
  return {
    id: "t1",
    name: "Tarea",
    created: "2026-09-01",
    start: null,
    start_time: null,
    due: null,
    due_time: null,
    status: "Sin empezar",
    subject: "Historia",
    priority: 2,
    reminder: null,
    reminder_done: false,
    body: "",
    repeat: "",
    repeat_until: null,
    repeat_label: "",
    overdue: false,
    done: false,
    ...over,
  };
}

function meta(over: Partial<TasksMeta> = {}): TasksMeta {
  return {
    statuses: ["Sin empezar", "En progreso", "Completado"],
    status_colors: {},
    done_status: "Completado",
    priority_max: 3,
    subjects: ["Historia"],
    ...over,
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

function reset() {
  vi.clearAllMocks();
  useTasks.setState({
    view: "tabla",
    tasks: [],
    meta: null,
    loaded: false,
    filters: EMPTY_FILTERS,
    openId: null,
    version: 0,
  });
  useApp.setState({ toasts: [] });
}

beforeEach(reset);

describe("applyFilters", () => {
  const tasks = [
    task({ id: "a", name: "Ensayo de historia", status: "Sin empezar", subject: "Historia", priority: 3, done: false }),
    task({ id: "b", name: "Mapa", status: "Completado", subject: "Geo", priority: 1, done: true, body: "relieve" }),
  ];
  it("filters by query across name/subject/status/body", () => {
    expect(applyFilters(tasks, { ...EMPTY_FILTERS, query: "ensayo" }).map((t) => t.id)).toEqual(["a"]);
    expect(applyFilters(tasks, { ...EMPTY_FILTERS, query: "relieve" }).map((t) => t.id)).toEqual(["b"]);
  });
  it("filters by status/subject/priority and hideDone", () => {
    expect(applyFilters(tasks, { ...EMPTY_FILTERS, status: "Completado" }).map((t) => t.id)).toEqual(["b"]);
    expect(applyFilters(tasks, { ...EMPTY_FILTERS, subject: "Historia" }).map((t) => t.id)).toEqual(["a"]);
    expect(applyFilters(tasks, { ...EMPTY_FILTERS, priority: 1 }).map((t) => t.id)).toEqual(["b"]);
    expect(applyFilters(tasks, { ...EMPTY_FILTERS, hideDone: true }).map((t) => t.id)).toEqual(["a"]);
  });
});

describe("sync actions", () => {
  it("setView/setFilters/clearFilters/open", () => {
    const s = () => useTasks.getState();
    s().setView("calendario");
    expect(s().view).toBe("calendario");
    s().setFilters({ status: "Sin empezar", priority: 2 });
    expect(s().filters).toMatchObject({ status: "Sin empezar", priority: 2, query: "" });
    s().clearFilters();
    expect(s().filters).toEqual(EMPTY_FILTERS);
    s().open("t9");
    expect(s().openId).toBe("t9");
  });
});

describe("load", () => {
  it("loads tasks + meta and bumps version", async () => {
    apiMock.tasksList.mockResolvedValue([task()]);
    apiMock.tasksMeta.mockResolvedValue(meta());
    await useTasks.getState().load();
    const s = useTasks.getState();
    expect(s.tasks).toHaveLength(1);
    expect(s.meta?.done_status).toBe("Completado");
    expect(s.loaded).toBe(true);
    expect(s.version).toBe(1);
  });
  it("a failure toasts instead of throwing", async () => {
    apiMock.tasksList.mockRejectedValue(new Error("caído"));
    apiMock.tasksMeta.mockResolvedValue(meta());
    await useTasks.getState().load();
    expect(useTasks.getState().loaded).toBe(false);
    expect(useApp.getState().toasts.at(-1)?.text).toContain("caído");
  });
});

describe("create", () => {
  it("appends, focuses and refreshes meta", async () => {
    const created = task({ id: "nueva", name: "Nueva tarea" });
    apiMock.tasksCreate.mockResolvedValue(created);
    apiMock.tasksMeta.mockResolvedValue(meta());
    const out = await useTasks.getState().create({ name: "Nueva tarea" });
    expect(apiMock.tasksCreate).toHaveBeenCalledWith({ name: "Nueva tarea" });
    expect(out?.id).toBe("nueva");
    expect(useTasks.getState().tasks.map((t) => t.id)).toEqual(["nueva"]);
    expect(useTasks.getState().openId).toBe("nueva");
    await flush();
    expect(apiMock.tasksMeta).toHaveBeenCalled();
  });
  it("returns null and toasts on failure", async () => {
    apiMock.tasksCreate.mockRejectedValue(new Error("no"));
    const out = await useTasks.getState().create();
    expect(out).toBeNull();
    expect(useTasks.getState().tasks).toEqual([]);
  });
});

describe("update (optimistic)", () => {
  it("shows done/overdue at once, then keeps the server answer", async () => {
    useTasks.setState({ tasks: [task({ id: "a", status: "Sin empezar", due: "2000-01-01" })], meta: meta() });
    const saved = task({ id: "a", status: "Completado", due: "2000-01-01", done: true, overdue: false });
    let resolveSave!: (v: Task) => void;
    apiMock.tasksUpdate.mockReturnValueOnce(new Promise((r) => (resolveSave = r)));
    const p = useTasks.getState().update("a", { status: "Completado" });
    // Optimistic: derived flags without waiting for the server.
    expect(useTasks.getState().tasks[0]).toMatchObject({ status: "Completado", done: true });
    resolveSave(saved);
    await p;
    expect(useTasks.getState().tasks[0]).toEqual(saved);
    expect(useTasks.getState().version).toBe(1);
  });
  it("marks overdue when due passed and not done", async () => {
    useTasks.setState({ tasks: [task({ id: "a" })], meta: meta() });
    apiMock.tasksUpdate.mockResolvedValue(task({ id: "a", due: "2000-01-01", overdue: true }));
    await useTasks.getState().update("a", { due: "2000-01-01" });
    expect(useTasks.getState().tasks[0]).toMatchObject({ due: "2000-01-01", overdue: true, done: false });
  });
  it("rolls back when the server refuses", async () => {
    const before = task({ id: "a", name: "Antes" });
    useTasks.setState({ tasks: [before], meta: meta() });
    apiMock.tasksUpdate.mockRejectedValueOnce(new Error("rechazado"));
    await useTasks.getState().update("a", { name: "Después" });
    expect(useTasks.getState().tasks[0]).toEqual(before);
    expect(useApp.getState().toasts.at(-1)?.text).toContain("rechazado");
  });
  it("ignores unknown ids without calling the api", async () => {
    useTasks.setState({ tasks: [task({ id: "a" })], meta: meta() });
    await useTasks.getState().update("zzz", { name: "x" });
    expect(apiMock.tasksUpdate).not.toHaveBeenCalled();
  });
});

describe("remove (optimistic)", () => {
  it("removes at once, clears openId and bumps version", async () => {
    useTasks.setState({ tasks: [task({ id: "a" }), task({ id: "b" })], openId: "a" });
    apiMock.tasksDelete.mockResolvedValue({ ok: true });
    await useTasks.getState().remove("a");
    expect(useTasks.getState().tasks.map((t) => t.id)).toEqual(["b"]);
    expect(useTasks.getState().openId).toBeNull();
    expect(useTasks.getState().version).toBe(1);
  });
  it("restores the list when delete fails", async () => {
    const before = [task({ id: "a" })];
    useTasks.setState({ tasks: before, openId: "a" });
    apiMock.tasksDelete.mockRejectedValueOnce(new Error("falla"));
    await useTasks.getState().remove("a");
    expect(useTasks.getState().tasks).toEqual(before);
  });
});
