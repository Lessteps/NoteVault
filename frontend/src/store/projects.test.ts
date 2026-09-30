import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Issue, ProjectCard, ProjectDetail, ProjectsMeta } from "../lib/types";

const { apiMock } = vi.hoisted(() => ({
  apiMock: {
    projectsList: vi.fn(),
    projectsMeta: vi.fn(),
    areasList: vi.fn(),
    projectsGet: vi.fn(),
    issueUpdate: vi.fn(),
    issueMove: vi.fn(),
  },
}));

vi.mock("../lib/bridge", () => ({ api: apiMock }));

import { descendants, issueById, useProjects } from "./projects";
import { useApp } from "./app";

function card(over: Partial<ProjectCard> = {}): ProjectCard {
  return {
    id: "p1", key: "PW", name: "Proyecto", status: "En curso", status_colour: "",
    area: "", colour: "#fff", icon: "", created: null, start: null, deadline: null,
    columns: ["Por hacer", "Hecho"], done_column: "Hecho", in_calendar: false,
    description: "", days_left: null, overdue: false, folders: [],
    summary: { total: 1, done: 0, open: 1, overdue: 0, progress: 0, estimate_min: 0, estimate_done_min: 0 },
    throughput: [], next_due: null, ...over,
  };
}

function issue(over: Partial<Issue> = {}): Issue {
  return {
    id: "x1", number: 1, key: "PW-1", type: "Tarea", icon: "", type_colour: "",
    parent: "", title: "Issue", status: "Por hacer", priority: 2, order: 1,
    estimate_min: null, labels: [], created: null, start: null, due: null,
    due_time: "", repeat: "", repeat_until: null, in_calendar: false,
    reminder: null, done_at: null, attachments: [], updated: null,
    description: "", children: [], done: false, overdue: false,
    linked_folder: "", linked_notes: [], ...over,
  };
}

function detail(over: Partial<ProjectDetail> = {}, issues: Issue[] = [issue()]): ProjectDetail {
  return {
    project: card({ id: "p1" }),
    progress: 0,
    issues,
    stats: {
      summary: { total: 1, done: 0, open: 1, overdue: 0, progress: 0, estimate_min: 0, estimate_done_min: 0 },
      by_status: [], by_priority: [], by_type: [], submetas: [],
      burndown: { days: [], remaining: [], ideal: [] }, throughput: [], cycle_days: null,
    },
    ...over,
  };
}

function meta(): ProjectsMeta {
  return { statuses: ["Planeado", "En curso"], status_colours: {}, done_status: "Hecho" } as ProjectsMeta;
}

function reset() {
  vi.clearAllMocks();
  useProjects.setState({
    cards: [], meta: null, areas: [], loaded: false, openId: null,
    detail: null, tab: "resumen", issueId: null, editing: null,
    creating: null, goalFilter: "",
  });
  useApp.setState({ toasts: [] });
}

beforeEach(reset);

describe("loadAll", () => {
  it("loads cards + meta + areas", async () => {
    apiMock.projectsList.mockResolvedValue([card()]);
    apiMock.projectsMeta.mockResolvedValue(meta());
    apiMock.areasList.mockResolvedValue([]);
    await useProjects.getState().loadAll();
    const s = useProjects.getState();
    expect(s.cards).toHaveLength(1);
    expect(s.loaded).toBe(true);
  });
  it("reuses a known meta instead of re-reading it", async () => {
    apiMock.projectsList.mockResolvedValue([]);
    apiMock.projectsMeta.mockResolvedValue(meta());
    apiMock.areasList.mockResolvedValue([]);
    await useProjects.getState().loadAll();
    await useProjects.getState().loadAll();
    expect(apiMock.projectsMeta).toHaveBeenCalledTimes(1);
  });
  it("a failure toasts instead of throwing", async () => {
    apiMock.projectsList.mockRejectedValue(new Error("caído"));
    await useProjects.getState().loadAll();
    expect(useProjects.getState().loaded).toBe(false);
    expect(useApp.getState().toasts.at(-1)?.text).toContain("caído");
  });
});

describe("open/reload", () => {
  it("open(pid) resets the panel and loads the detail", async () => {
    apiMock.projectsGet.mockResolvedValue(detail());
    apiMock.projectsList.mockResolvedValue([card()]);
    useProjects.setState({ tab: "tablero", issueId: "viejo", goalFilter: "g" });
    await useProjects.getState().open("p1");
    const s = useProjects.getState();
    expect(s.openId).toBe("p1");
    expect(s.tab).toBe("resumen");
    expect(s.issueId).toBeNull();
    expect(s.goalFilter).toBe("");
    expect(s.detail?.project.id).toBe("p1");
  });
  it("open(null) closes and refreshes the board", async () => {
    apiMock.projectsList.mockResolvedValue([]);
    apiMock.projectsMeta.mockResolvedValue(meta());
    apiMock.areasList.mockResolvedValue([]);
    useProjects.setState({ openId: "p1", detail: detail(), issueId: "x1" });
    await useProjects.getState().open(null);
    expect(useProjects.getState().openId).toBeNull();
    expect(useProjects.getState().detail).toBeNull();
    expect(apiMock.projectsList).toHaveBeenCalled();
  });
  it("reload drops an issueId that no longer exists", async () => {
    apiMock.projectsGet.mockResolvedValue(detail({}, [issue({ id: "x2" })]));
    apiMock.projectsList.mockResolvedValue([]);
    useProjects.setState({ openId: "p1", issueId: "x1" });
    await useProjects.getState().reload();
    expect(useProjects.getState().issueId).toBeNull();
  });
  it("reload keeps an issueId that still exists", async () => {
    apiMock.projectsGet.mockResolvedValue(detail());
    apiMock.projectsList.mockResolvedValue([]);
    useProjects.setState({ openId: "p1", issueId: "x1" });
    await useProjects.getState().reload();
    expect(useProjects.getState().issueId).toBe("x1");
  });
  it("a missing project closes the panel with a toast", async () => {
    apiMock.projectsGet.mockRejectedValue(new Error("no existe"));
    useProjects.setState({ openId: "p1" });
    await useProjects.getState().reload();
    expect(useProjects.getState().openId).toBeNull();
    expect(useProjects.getState().detail).toBeNull();
  });
});

describe("updateIssue (optimistic)", () => {
  it("merges at once, reloads and reports true", async () => {
    useProjects.setState({ openId: "p1", detail: detail() });
    apiMock.issueUpdate.mockResolvedValue(issue({ id: "x1", title: "Nuevo" }));
    apiMock.projectsGet.mockResolvedValue(detail({}, [issue({ id: "x1", title: "Nuevo" })]));
    apiMock.projectsList.mockResolvedValue([]);
    const ok = await useProjects.getState().updateIssue("x1", { title: "Nuevo" });
    expect(ok).toBe(true);
    expect(useProjects.getState().detail?.issues[0]?.title).toBe("Nuevo");
  });
  it("rolls back and reports false when the server refuses", async () => {
    const d = detail();
    useProjects.setState({ openId: "p1", detail: d });
    apiMock.issueUpdate.mockRejectedValueOnce(new Error("rechazado"));
    const ok = await useProjects.getState().updateIssue("x1", { title: "Otro" });
    expect(ok).toBe(false);
    expect(useProjects.getState().detail).toEqual(d);
  });
  it("reports false with nothing open and no api call", async () => {
    expect(await useProjects.getState().updateIssue("x1", { title: "x" })).toBe(false);
    expect(apiMock.issueUpdate).not.toHaveBeenCalled();
  });
});

describe("moveIssue (optimistic)", () => {
  it("marks done when landing in the done column", async () => {
    useProjects.setState({ openId: "p1", detail: detail() });
    apiMock.issueMove.mockResolvedValue({ ok: true });
    apiMock.projectsGet.mockResolvedValue(detail({}, [issue({ id: "x1", status: "Hecho", done: true })]));
    apiMock.projectsList.mockResolvedValue([]);
    await useProjects.getState().moveIssue("x1", "Hecho", 0);
    expect(apiMock.issueMove).toHaveBeenCalledWith("p1", "x1", "Hecho", 0);
    expect(useProjects.getState().detail?.issues[0]).toMatchObject({ status: "Hecho", done: true });
  });
  it("rolls back when the move fails", async () => {
    const d = detail();
    useProjects.setState({ openId: "p1", detail: d });
    apiMock.issueMove.mockRejectedValueOnce(new Error("no"));
    await useProjects.getState().moveIssue("x1", "Hecho", 0);
    expect(useProjects.getState().detail).toEqual(d);
  });
});

describe("sync setters", () => {
  it("setTab/openIssue/setEditing/setCreating/setGoalFilter", () => {
    const s = () => useProjects.getState();
    s().setTab("tablero");
    s().openIssue("x1");
    s().setEditing("");
    s().setCreating({ status: "Por hacer" });
    s().setGoalFilter("g1");
    expect(useProjects.getState()).toMatchObject({
      tab: "tablero", issueId: "x1", editing: "",
      creating: { status: "Por hacer" }, goalFilter: "g1",
    });
  });
});

describe("issueById/descendants", () => {
  const d = detail({}, [
    issue({ id: "raiz", children: ["a", "b"] }),
    issue({ id: "a", children: ["c"] }),
    issue({ id: "b" }),
    issue({ id: "c" }),
  ]);
  it("finds by id and lists every descendant", () => {
    expect(issueById(d, "b")?.key).toBe("PW-1");
    expect(issueById(d, "zzz")).toBeUndefined();
    expect([...descendants(d, "raiz")].sort()).toEqual(["a", "b", "c"]);
  });
  it("a cycle cannot hang the walk", () => {
    const loop = detail({}, [
      issue({ id: "a", children: ["b"] }),
      issue({ id: "b", children: ["a"] }),
    ]);
    expect([...descendants(loop, "a")].sort()).toEqual(["a", "b"]);
  });
});
