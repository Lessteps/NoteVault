import { describe, expect, it } from "vitest";
import { placeBlocks, sanitizeAreaTimes, setAreaTime } from "./areaTimes";

describe("areaTimes", () => {
  it("sanea horas, ids y duraciones", () => {
    expect(sanitizeAreaTimes({ backend: { start: "09:30", durationMin: 60 }, frontend: { start: "25:00" }, "a b": { start: "10:00" }, bd: { start: "10:00", durationMin: 5 }, x: null })).toEqual({
      backend: { start: "09:30", durationMin: 60 },
      bd: { start: "10:00" },
    });
    expect(sanitizeAreaTimes("basura")).toEqual({});
  });

  it("pone y quita el horario de un área", () => {
    const a = setAreaTime({}, "backend", { start: "07:00", durationMin: 90 });
    expect(a).toEqual({ backend: { start: "07:00", durationMin: 90 } });
    expect(setAreaTime(a, "backend", null)).toEqual({});
    expect(setAreaTime(a, "backend", { start: "mal" })).toEqual(a);
  });

  it("sin horarios apila desde las 09:00 con 15 min de respiro (como antes)", () => {
    const r = placeBlocks([{ key: "a", minutes: 60 }, { key: "b", minutes: 45 }], {});
    expect(r.map((x) => [x.key, x.start, x.durationMin, x.fixed])).toEqual([["a", "09:00", 60, false], ["b", "10:15", 45, false]]);
  });

  it("la hora fija se respeta y lo apilado se aparta de ella", () => {
    const r = placeBlocks([{ key: "a", minutes: 60 }, { key: "b", minutes: 45 }], { a: { start: "09:00", durationMin: 90 } });
    expect(r.map((x) => [x.key, x.start, x.durationMin, x.fixed])).toEqual([["a", "09:00", 90, true], ["b", "10:45", 45, false]]);
  });

  it("dos áreas con la misma hora fija se quedan donde dijo el estudiante", () => {
    const r = placeBlocks([{ key: "a", minutes: 30 }, { key: "b", minutes: 30 }], { a: { start: "18:00" }, b: { start: "18:00" } });
    expect(r.every((x) => x.start === "18:00" && x.fixed)).toBe(true);
  });
});
