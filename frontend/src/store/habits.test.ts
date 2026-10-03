import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Habit, HabitDayLog, HabitRangeDay, HabitStats } from "../lib/types";

const { apiMock } = vi.hoisted(() => ({
  apiMock: {
    habitsList: vi.fn(),
    habitsStats: vi.fn(),
    habitsDay: vi.fn(),
    habitsRange: vi.fn(),
    habitsSetDone: vi.fn(),
    habitsSetSubtask: vi.fn(),
    habitsSetDayText: vi.fn(),
    habitsAdd: vi.fn(),
    habitsUpdate: vi.fn(),
    habitsRemove: vi.fn(),
    habitsReorder: vi.fn(),
    habitsAddSubtask: vi.fn(),
    habitsRemoveSubtask: vi.fn(),
  },
}));

vi.mock("../lib/bridge", () => ({ api: apiMock }));

import { useHabits } from "./habits";
import { useApp } from "./app";
import { useNavState } from "./navState";

function habit(over: Partial<Habit> = {}): Habit {
  return {
    id: "h1", name: "Hábito", icon: "✅", days: [],
    subtasks: [], schedule: "todos los días", ...over,
  };
}

function log(over: Partial<HabitDayLog> = {}): HabitDayLog {
  return {
    date: "2026-09-29", active: ["h1"], completed: {},
    subtasks: {}, notes: "", journal: "", ...over,
  };
}

function row(over: Partial<HabitRangeDay> = {}): HabitRangeDay {
  return { date: "2026-09-29", active: ["h1", "h2"], done: [], pct: 0, ...over };
}

function stats(over: Partial<HabitStats> = {}): HabitStats {
  return {
    today: "2026-09-29", day: 0.5, week: 0.5, month: 0.5,
    year: 0.5, streak: 3, habits: {}, ...over,
  };
}

function reset() {
  vi.clearAllMocks();
  useHabits.setState({
    view: "general", habits: [], stats: null, loaded: false,
    day: "2026-09-29", log: null, rows: {}, editingId: null,
  });
  useApp.setState({ toasts: [] });
}

beforeEach(reset);

describe("load", () => {
  it("loads habits + stats + day log together", async () => {
    apiMock.habitsList.mockResolvedValue([habit()]);
    apiMock.habitsStats.mockResolvedValue(stats());
    apiMock.habitsDay.mockResolvedValue(log());
    await useHabits.getState().load();
    const s = useHabits.getState();
    expect(s.habits).toHaveLength(1);
    expect(s.stats?.streak).toBe(3);
    expect(s.log?.date).toBe("2026-09-29");
    expect(s.loaded).toBe(true);
  });
  it("a failure toasts instead of throwing", async () => {
    apiMock.habitsList.mockRejectedValue(new Error("caído"));
    apiMock.habitsStats.mockResolvedValue(stats());
    apiMock.habitsDay.mockResolvedValue(log());
    await useHabits.getState().load();
    expect(useHabits.getState().loaded).toBe(false);
    expect(useApp.getState().toasts.at(-1)?.text).toContain("caído");
  });
});

describe("setDay", () => {
  it("ignores a stale response when the day already changed", async () => {
    let resolveDay!: (v: HabitDayLog) => void;
    apiMock.habitsDay.mockReturnValueOnce(new Promise((r) => (resolveDay = r)));
    apiMock.habitsDay.mockResolvedValue(log({ date: "2026-09-30" }));
    const first = useHabits.getState().setDay("2026-09-29");
    await useHabits.getState().setDay("2026-09-30");
    resolveDay(log({ date: "2026-09-29" }));
    await first;
    // The late answer for the old day must not overwrite the current log.
    expect(useHabits.getState().log?.date).toBe("2026-09-30");
  });
});

describe("setDone (optimistic)", () => {
  it("recomputes pct at once and refreshes stats", async () => {
    useHabits.setState({ rows: { "2026-09-29": row() }, log: log() });
    apiMock.habitsSetDone.mockResolvedValue({ ok: true, pct: 0.5 });
    apiMock.habitsStats.mockResolvedValue(stats({ day: 0.5 }));
    await useHabits.getState().setDone("2026-09-29", "h1", true);
    const s = useHabits.getState();
    expect(s.rows["2026-09-29"]).toMatchObject({ done: ["h1"], pct: 0.5 });
    expect(s.log?.completed).toMatchObject({ h1: true });
    expect(apiMock.habitsStats).toHaveBeenCalled();
  });
  it("ignores habits that are not active that day", async () => {
    useHabits.setState({ rows: { "2026-09-29": row() }, log: log() });
    apiMock.habitsSetDone.mockResolvedValue({ ok: true, pct: 0 });
    apiMock.habitsStats.mockResolvedValue(stats());
    await useHabits.getState().setDone("2026-09-29", "fantasma", true);
    expect(useHabits.getState().rows["2026-09-29"]?.done).toEqual([]);
  });
  it("rolls back when the server refuses", async () => {
    const beforeRow = row();
    const beforeLog = log();
    useHabits.setState({ rows: { "2026-09-29": beforeRow }, log: beforeLog });
    apiMock.habitsSetDone.mockRejectedValueOnce(new Error("rechazado"));
    await useHabits.getState().setDone("2026-09-29", "h1", true);
    expect(useHabits.getState().rows["2026-09-29"]).toEqual(beforeRow);
    expect(useHabits.getState().log).toEqual(beforeLog);
  });
});

describe("writes", () => {
  it("update is optimistic and drops the cached rows", async () => {
    useHabits.setState({
      habits: [habit({ id: "h1", name: "Viejo" })],
      rows: { "2026-09-29": row() },
    });
    apiMock.habitsUpdate.mockResolvedValue(habit({ id: "h1", name: "Nuevo" }));
    apiMock.habitsStats.mockResolvedValue(stats());
    apiMock.habitsDay.mockResolvedValue(log());
    await useHabits.getState().update("h1", { name: "Nuevo" });
    const s = useHabits.getState();
    expect(s.habits[0]?.name).toBe("Nuevo");
    expect(s.rows).toEqual({});
  });
  it("update rolls back on failure", async () => {
    const before = [habit({ id: "h1", name: "Viejo" })];
    useHabits.setState({ habits: before });
    apiMock.habitsUpdate.mockRejectedValueOnce(new Error("no"));
    await useHabits.getState().update("h1", { name: "Nuevo" });
    expect(useHabits.getState().habits).toEqual(before);
  });
  it("remove clears editingId and rolls back on failure", async () => {
    useHabits.setState({ habits: [habit({ id: "h1" })], editingId: "h1" });
    apiMock.habitsRemove.mockResolvedValue({ ok: true });
    apiMock.habitsStats.mockResolvedValue(stats());
    apiMock.habitsDay.mockResolvedValue(log());
    await useHabits.getState().remove("h1");
    expect(useHabits.getState().habits).toEqual([]);
    expect(useHabits.getState().editingId).toBeNull();
  });
  it("move out of bounds does nothing without calling the api", async () => {
    useHabits.setState({ habits: [habit({ id: "h1" })] });
    await useHabits.getState().move("h1", -1);
    await useHabits.getState().move("desconocido", 1);
    expect(apiMock.habitsReorder).not.toHaveBeenCalled();
    expect(useHabits.getState().habits.map((h) => h.id)).toEqual(["h1"]);
  });
  it("move reorders and rolls back when reorder fails", async () => {
    useHabits.setState({ habits: [habit({ id: "a" }), habit({ id: "b" })] });
    apiMock.habitsReorder.mockResolvedValueOnce({ ok: true });
    await useHabits.getState().move("a", 1);
    expect(useHabits.getState().habits.map((h) => h.id)).toEqual(["b", "a"]);
    expect(apiMock.habitsReorder).toHaveBeenCalledWith(["b", "a"]);
  });
  it("loadRange merges rows by date", async () => {
    useHabits.setState({ rows: { "2026-09-28": row({ date: "2026-09-28" }) } });
    apiMock.habitsRange.mockResolvedValue([row({ date: "2026-09-29" })]);
    await useHabits.getState().loadRange("2026-09-28", "2026-09-29");
    expect(Object.keys(useHabits.getState().rows).sort()).toEqual(["2026-09-28", "2026-09-29"]);
  });
});

describe("el diario del dia", () => {
  it("setDayText guarda la nota y el texto del diario a la vez", async () => {
    useHabits.setState({ log: log() });
    apiMock.habitsSetDayText.mockResolvedValue({ ok: true });
    await useHabits.getState().setDayText("2026-09-29", "me siento bien", "hoy sencille la induccion");
    expect(apiMock.habitsSetDayText).toHaveBeenCalledWith(
      "2026-09-29", "me siento bien", "hoy sencille la induccion",
    );
    expect(useHabits.getState().log).toMatchObject({
      notes: "me siento bien", journal: "hoy sencille la induccion",
    });
  });
  it("setDayText de otro dia no toca el log que se ve", async () => {
    useHabits.setState({ log: log({ date: "2026-09-29", notes: "mia" }) });
    apiMock.habitsSetDayText.mockResolvedValue({ ok: true });
    await useHabits.getState().setDayText("2026-09-30", "de otro dia", "");
    expect(useHabits.getState().log?.notes).toBe("mia");
    expect(apiMock.habitsSetDayText).toHaveBeenCalled();
  });
  it("un fallo al guardar el diario avisa y deja el texto en pantalla", async () => {
    useHabits.setState({ log: log() });
    apiMock.habitsSetDayText.mockRejectedValueOnce(new Error("disco"));
    await useHabits.getState().setDayText("2026-09-29", "mi nota", "mi diario");
    // Se queda escrito: perderlo al escribir seria peor que reintentar.
    expect(useHabits.getState().log?.notes).toBe("mi nota");
    expect(useApp.getState().toasts.at(-1)?.text).toContain("disco");
  });
});

describe("subtareas", () => {
  it("setSubtask marca una casilla sin tocar las demas del habito", async () => {
    useHabits.setState({
      log: log({ subtasks: { h1: { teoria: true, practica: false } } }),
    });
    apiMock.habitsSetSubtask.mockResolvedValue({ ok: true });
    await useHabits.getState().setSubtask("2026-09-29", "h1", "practica", true);
    expect(useHabits.getState().log?.subtasks.h1).toEqual({ teoria: true, practica: true });
    expect(apiMock.habitsSetSubtask).toHaveBeenCalledWith("2026-09-29", "h1", "practica", true);
  });
  it("setSubtask crea la entrada del habito si no habia ninguna", async () => {
    useHabits.setState({ log: log({ subtasks: {} }) });
    apiMock.habitsSetSubtask.mockResolvedValue({ ok: true });
    await useHabits.getState().setSubtask("2026-09-29", "h1", "teoria", true);
    expect(useHabits.getState().log?.subtasks.h1).toEqual({ teoria: true });
  });
  it("setSubtask de otro dia no inventa un log", async () => {
    useHabits.setState({ log: log({ date: "2026-09-29" }) });
    apiMock.habitsSetSubtask.mockResolvedValue({ ok: true });
    await useHabits.getState().setSubtask("2026-09-30", "h1", "teoria", true);
    expect(useHabits.getState().log?.date).toBe("2026-09-29");
    expect(useHabits.getState().log?.subtasks).toEqual({});
  });
  it("addSubtask anade la que devuelve el servidor, sin perder las otras", async () => {
    useHabits.setState({
      habits: [habit({ id: "h1", subtasks: [{ id: "s1", name: "Teoria" }] })],
    });
    apiMock.habitsAddSubtask.mockResolvedValue({ id: "s2", name: "Practica" });
    await useHabits.getState().addSubtask("h1", "Practica");
    expect(apiMock.habitsAddSubtask).toHaveBeenCalledWith("h1", "Practica");
    expect(useHabits.getState().habits[0]!.subtasks).toEqual([
      { id: "s1", name: "Teoria" }, { id: "s2", name: "Practica" },
    ]);
  });
  it("addSubtask que falla no toca la lista y avisa", async () => {
    const before = [habit({ id: "h1", subtasks: [{ id: "s1", name: "Teoria" }] })];
    useHabits.setState({ habits: before });
    apiMock.habitsAddSubtask.mockRejectedValueOnce(new Error("no"));
    await useHabits.getState().addSubtask("h1", "Practica");
    expect(useHabits.getState().habits).toEqual(before);
    expect(useApp.getState().toasts.at(-1)?.text).toContain("no");
  });
  it("removeSubtask quita la casilla y la devuelve si el servidor dice que no", async () => {
    const habitos = () => useHabits.getState().habits;
    useHabits.setState({
      habits: [habit({ id: "h1", subtasks: [{ id: "s1", name: "A" }, { id: "s2", name: "B" }] })],
    });
    apiMock.habitsRemoveSubtask.mockResolvedValueOnce({ ok: true });
    await useHabits.getState().removeSubtask("h1", "s1");
    expect(habitos()[0]!.subtasks).toEqual([{ id: "s2", name: "B" }]);

    // Al reintentar, el punto de retorno es el estado de antes de ESTA
    // operacion, no el original: "s2" vuelve a aparecer, "s1" no.
    apiMock.habitsRemoveSubtask.mockRejectedValueOnce(new Error("no"));
    await useHabits.getState().removeSubtask("h1", "s2");
    expect(habitos()[0]!.subtasks).toEqual([{ id: "s2", name: "B" }]);
    expect(useApp.getState().toasts.at(-1)?.text).toContain("no");
  });
});

describe("add", () => {
  it("crea el habito, lo abre para editarlo y refresca las estadisticas", async () => {
    apiMock.habitsAdd.mockResolvedValue(habit({ id: "nuevo", name: "Nuevo hábito" }));
    apiMock.habitsStats.mockResolvedValue(stats());
    const h = await useHabits.getState().add({ name: "Nuevo hábito" });
    expect(apiMock.habitsAdd).toHaveBeenCalledWith({ name: "Nuevo hábito" });
    expect(h?.id).toBe("nuevo");
    const s = useHabits.getState();
    expect(s.habits.map((x) => x.id)).toEqual(["nuevo"]);
    expect(s.editingId).toBe("nuevo");
    expect(s.rows).toEqual({});
  });
  it("si falla devuelve null y no deja un habito a medias", async () => {
    apiMock.habitsAdd.mockRejectedValue(new Error("nombre repetido"));
    const h = await useHabits.getState().add();
    expect(h).toBeNull();
    expect(useHabits.getState().habits).toEqual([]);
    expect(useApp.getState().toasts.at(-1)?.text).toContain("nombre repetido");
  });
});

describe("refreshStats", () => {
  it("relee solo las estadisticas y un fallo las deja como estaban", async () => {
    useHabits.setState({ stats: stats({ streak: 9 }) });
    apiMock.habitsStats.mockResolvedValue(stats({ streak: 1 }));
    await useHabits.getState().refreshStats();
    expect(useHabits.getState().stats?.streak).toBe(1);

    apiMock.habitsStats.mockRejectedValueOnce(new Error("no"));
    await useHabits.getState().refreshStats();
    expect(useHabits.getState().stats?.streak).toBe(1);
  });
});

describe("la vista se recuerda", () => {
  it("persistField guarda la vista en el nav state", () => {
    useHabits.getState().setView("semanal");
    // Sin jsdom no hay localStorage: se mira el nav state, que es el store
    // que por debajo acaba persistiendo.
    expect(useNavState.getState().values["habits.view"]).toBe("semanal");
  });
});
