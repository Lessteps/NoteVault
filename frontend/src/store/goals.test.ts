import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Area, GoalCard, GoalDetail, GoalItem, GoalsMeta, GoalsSidebar } from "../lib/types";

const { apiMock } = vi.hoisted(() => ({
  apiMock: {
    goalsList: vi.fn(),
    goalsSidebar: vi.fn(),
    areasList: vi.fn(),
    goalsMeta: vi.fn(),
    goalsGet: vi.fn(),
  },
}));

vi.mock("../lib/bridge", () => ({ api: apiMock }));

import { pct, useGoals } from "./goals";
import { useApp } from "./app";

function card(over: Partial<GoalCard> = {}): GoalCard {
  return {
    id: "g1", name: "Meta", area: "", status: "Activa", status_colour: "",
    priority: 2, start: null, end: null, icon: "", colour: "#fff",
    in_overview: false, order: null, created: null, description: "",
    overdue: false, days_left: null, linked_folder: "", linked_notes: [],
    progress: 0, counts: [0, 0], adherence7: null, daily: [], next: null,
    overdue_items: 0, habits: [], ...over,
  };
}

function item(over: Partial<GoalItem> = {}): GoalItem {
  return {
    id: "i1", goal: "g1", parent: "", name: "Submeta", status: "Pendiente",
    priority: 2, order: 1, start: null, due: null, due_time: "", duration_min: null,
    repeat: "", repeat_until: null, in_calendar: false, reminder_min: null,
    target: null, unit: "", value: null, habit_links: [], done_at: null,
    created: null, notes: "", category: "", is_priority: false, children: [],
    is_leaf: true, measurable: false, schedule: "", progress: 0, counts: [0, 0],
    adherence7: null, adherence30: null, streak: 0, done_today: false,
    value_today: null, late: false, linked_folder: "", linked_notes: [], ...over,
  };
}

function detail(items: GoalItem[] = [item()]): GoalDetail {
  return {
    goal: card({ id: "g1" }),
    items,
    categories: [],
    stats: { progress: 0, counts: [0, 0], adherence7: null, adherence30: null, best_streak: 0, days_left: null },
    history: { days: [], daily: [], repeating: [], completed: [] },
  };
}

function sidebar(): GoalsSidebar {
  return { today: 1, areas: {}, no_area: 1, all: 1, filters: { todas: 1 } };
}

function meta(): GoalsMeta {
  return { statuses: ["Activa"], status_colours: {}, item_statuses: ["Pendiente"], filters: ["todas"] };
}

function reset() {
  vi.clearAllMocks();
  useGoals.setState({
    view: "tablero", area: "*", filter: "todas", meta: null, sidebar: null,
    areas: [], cards: [], loaded: false, openId: null, detail: null,
    tab: "submetas", subView: "tarjetas", itemId: null, submetaId: null,
    editing: null, areaEditing: null, checklistFor: null, version: 0,
  });
  useApp.setState({ toasts: [] });
}

beforeEach(reset);

describe("loadAll", () => {
  it("loads cards + sidebar + areas and bumps version", async () => {
    apiMock.goalsList.mockResolvedValue([card()]);
    apiMock.goalsSidebar.mockResolvedValue(sidebar());
    apiMock.areasList.mockResolvedValue([]);
    apiMock.goalsMeta.mockResolvedValue(meta());
    await useGoals.getState().loadAll();
    const s = useGoals.getState();
    expect(s.cards).toHaveLength(1);
    expect(s.sidebar?.today).toBe(1);
    expect(s.loaded).toBe(true);
    expect(s.version).toBe(1);
  });
  it("queries with the active filter and area", async () => {
    apiMock.goalsList.mockResolvedValue([]);
    apiMock.goalsSidebar.mockResolvedValue(sidebar());
    apiMock.areasList.mockResolvedValue([]);
    apiMock.goalsMeta.mockResolvedValue(meta());
    useGoals.setState({ filter: "activas", area: "a1" });
    await useGoals.getState().loadAll();
    expect(apiMock.goalsList).toHaveBeenCalledWith("activas", "a1");
  });
  it("reuses a known meta instead of re-reading it", async () => {
    apiMock.goalsList.mockResolvedValue([]);
    apiMock.goalsSidebar.mockResolvedValue(sidebar());
    apiMock.areasList.mockResolvedValue([]);
    apiMock.goalsMeta.mockResolvedValue(meta());
    await useGoals.getState().loadAll();
    await useGoals.getState().loadAll();
    expect(apiMock.goalsMeta).toHaveBeenCalledTimes(1);
  });
  it("a failure toasts instead of throwing", async () => {
    apiMock.goalsList.mockRejectedValue(new Error("caído"));
    await useGoals.getState().loadAll();
    expect(useGoals.getState().loaded).toBe(false);
    expect(useApp.getState().toasts.at(-1)?.text).toContain("caído");
  });
});

describe("navigation resets the open goal", () => {
  it("setView/setArea/setFilter clear openId and detail", async () => {
    apiMock.goalsList.mockResolvedValue([]);
    apiMock.goalsSidebar.mockResolvedValue(sidebar());
    apiMock.areasList.mockResolvedValue([]);
    apiMock.goalsMeta.mockResolvedValue(meta());
    useGoals.setState({ openId: "g1", detail: detail(), view: "hoy" });
    useGoals.getState().setView("tablero");
    expect(useGoals.getState().openId).toBeNull();
    useGoals.setState({ openId: "g1", detail: detail() });
    useGoals.getState().setArea("a1");
    expect(useGoals.getState().area).toBe("a1");
    expect(useGoals.getState().view).toBe("tablero");
    expect(useGoals.getState().openId).toBeNull();
    useGoals.setState({ openId: "g1", detail: detail() });
    useGoals.getState().setFilter("activas");
    expect(useGoals.getState().openId).toBeNull();
    await Promise.resolve();
  });
});

describe("open/reload", () => {
  it("open(gid) resets tabs and loads the detail", async () => {
    apiMock.goalsGet.mockResolvedValue(detail());
    useGoals.setState({ tab: "hoy", itemId: "viejo", submetaId: "viejo" });
    await useGoals.getState().open("g1");
    const s = useGoals.getState();
    expect(s.openId).toBe("g1");
    expect(s.view).toBe("tablero");
    expect(s.tab).toBe("submetas");
    expect(s.detail?.goal.id).toBe("g1");
  });
  it("open(null) closes and refreshes the board", async () => {
    apiMock.goalsList.mockResolvedValue([]);
    apiMock.goalsSidebar.mockResolvedValue(sidebar());
    apiMock.areasList.mockResolvedValue([]);
    apiMock.goalsMeta.mockResolvedValue(meta());
    useGoals.setState({ openId: "g1", detail: detail() });
    await useGoals.getState().open(null);
    expect(useGoals.getState().openId).toBeNull();
    expect(apiMock.goalsList).toHaveBeenCalled();
  });
  it("reload drops item selections that no longer exist", async () => {
    apiMock.goalsGet.mockResolvedValue(detail([item({ id: "i2" })]));
    useGoals.setState({ openId: "g1", itemId: "i1", submetaId: "i1" });
    await useGoals.getState().reload();
    expect(useGoals.getState().itemId).toBeNull();
    expect(useGoals.getState().submetaId).toBeNull();
  });
  it("reload keeps selections that still exist", async () => {
    apiMock.goalsGet.mockResolvedValue(detail());
    useGoals.setState({ openId: "g1", itemId: "i1", submetaId: "i1" });
    await useGoals.getState().reload();
    expect(useGoals.getState().itemId).toBe("i1");
    expect(useGoals.getState().submetaId).toBe("i1");
  });
  it("a missing goal closes the panel with a toast", async () => {
    apiMock.goalsGet.mockRejectedValue(new Error("no existe"));
    useGoals.setState({ openId: "g1" });
    await useGoals.getState().reload();
    expect(useGoals.getState().openId).toBeNull();
    expect(useGoals.getState().detail).toBeNull();
  });
  it("refreshAfterWrite reloads detail + sidebar and bumps version", async () => {
    apiMock.goalsGet.mockResolvedValue(detail());
    apiMock.goalsSidebar.mockResolvedValue(sidebar());
    useGoals.setState({ openId: "g1" });
    await useGoals.getState().refreshAfterWrite();
    expect(apiMock.goalsGet).toHaveBeenCalledWith("g1");
    expect(useGoals.getState().sidebar?.today).toBe(1);
    expect(useGoals.getState().version).toBe(2); // reload +1, refresh +1
  });
});

describe("sync setters", () => {
  it("tabs, views and dialogs", () => {
    const s = () => useGoals.getState();
    s().setTab("hoy");
    expect(useGoals.getState().tab).toBe("hoy");
    expect(useGoals.getState().submetaId).toBeNull();
    s().setSubView("arbol");
    s().openItem("i1");
    s().openSubmeta("i1");
    expect(useGoals.getState()).toMatchObject({ subView: "arbol", itemId: "i1", submetaId: "i1", tab: "submetas" });
    s().setEditing("");
    s().setAreaEditing("a1");
    s().setChecklistFor("i1");
    expect(useGoals.getState()).toMatchObject({ editing: "", areaEditing: "a1", checklistFor: "i1" });
  });
});

describe("pct", () => {
  it("formats fractions and blanks", () => {
    expect(pct(0.755)).toBe("76 %");
    expect(pct(null)).toBe("—");
    expect(pct(undefined)).toBe("—");
  });
});
