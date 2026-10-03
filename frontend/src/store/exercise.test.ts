import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Exercise, ExerciseStats } from "../lib/types";

const { apiMock } = vi.hoisted(() => ({
  apiMock: {
    exMeta: vi.fn(),
    exList: vi.fn(),
    exStats: vi.fn(),
  },
}));

vi.mock("../lib/bridge", () => ({ api: apiMock }));

import { useExercise } from "./exercise";

function exercise(over: Partial<Exercise> = {}): Exercise {
  return {
    id: "lunes_1", day: "lunes", name: "Bench Press", video: "",
    video_path: "", series_reps: "4x5", rest: "2-3 min", how_to: "",
    has_video: false, video_name: "", muscles: { primary: [], secondary: [] },
    ...over,
  };
}

function period(over = {}) {
  return { done: 1, total: 2, pct: 0.5, trained: 1, due: 2, ...over };
}

function stats(): ExerciseStats {
  return {
    year: 2026,
    today: { done: 1, total: 2, pct: 0.5 },
    week: period(), month: period(), anual: period(),
    streak: { current: 2, best: 5 },
  };
}

function reset() {
  vi.clearAllMocks();
  useExercise.setState({ days: [], list: [], stats: null, loaded: false, error: null });
}

beforeEach(reset);

describe("load", () => {
  it("fills days + routine + stats", async () => {
    apiMock.exMeta.mockResolvedValue({ days: [{ key: "lunes", name: "Lunes", subtitle: "", glyph: "" }] });
    apiMock.exList.mockResolvedValue([exercise()]);
    apiMock.exStats.mockResolvedValue(stats());
    await useExercise.getState().load();
    const s = useExercise.getState();
    expect(s.days.map((d) => d.key)).toEqual(["lunes"]);
    expect(s.list).toHaveLength(1);
    expect(s.stats?.streak.best).toBe(5);
    expect(s.loaded).toBe(true);
    expect(s.error).toBeNull();
  });
  it("a failure still marks loaded and keeps the message in state", async () => {
    apiMock.exMeta.mockRejectedValue(new Error("caído"));
    apiMock.exList.mockResolvedValue([]);
    apiMock.exStats.mockResolvedValue(stats());
    await useExercise.getState().load();
    const s = useExercise.getState();
    expect(s.loaded).toBe(true);
    expect(s.error).toContain("caído");
    expect(s.list).toEqual([]);
  });
});

describe("refresh", () => {
  it("re-reads routine + stats and clears the error", async () => {
    useExercise.setState({ error: "viejo" });
    apiMock.exList.mockResolvedValue([exercise()]);
    apiMock.exStats.mockResolvedValue(stats());
    await useExercise.getState().refresh();
    const s = useExercise.getState();
    expect(s.list).toHaveLength(1);
    expect(s.error).toBeNull();
  });
  it("a failure keeps the old list and records the error", async () => {
    const before = [exercise()];
    useExercise.setState({ list: before });
    apiMock.exList.mockRejectedValue(new Error("no"));
    apiMock.exStats.mockResolvedValue(stats());
    await useExercise.getState().refresh();
    expect(useExercise.getState().list).toEqual(before);
    expect(useExercise.getState().error).toContain("no");
  });
});

describe("refreshStats", () => {
  it("updates only the stats", async () => {
    useExercise.setState({ list: [exercise()] });
    apiMock.exStats.mockResolvedValue(stats());
    await useExercise.getState().refreshStats();
    expect(useExercise.getState().stats?.year).toBe(2026);
    expect(useExercise.getState().list).toHaveLength(1);
  });
  it("a failure records the error", async () => {
    apiMock.exStats.mockRejectedValue(new Error("no"));
    await useExercise.getState().refreshStats();
    expect(useExercise.getState().error).toContain("no");
  });
});
