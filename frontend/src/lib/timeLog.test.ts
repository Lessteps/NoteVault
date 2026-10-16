import { describe, expect, it } from "vitest";
import { minutesBetween, minutesOn, minutesText, sanitizeEntry, type TimeEntry } from "./timeLog";

const e = (o: Partial<TimeEntry>): TimeEntry => ({ id: "x", areaKey: "backend", date: "2026-10-16", minutes: 25, kind: "pomodoro", at: "", ...o });

describe("registro de horas", () => {
  it("descarta lo inválido y limpia lo demás", () => {
    expect(sanitizeEntry({ id: "a", areaKey: "backend", date: "2026-10-16", minutes: 25.4, kind: "pomodoro", note: "  algo   de nota " })).toMatchObject({ minutes: 25, note: "algo de nota", kind: "pomodoro" });
    expect(sanitizeEntry({ id: "a", areaKey: "backend", date: "2026-10-16", minutes: 0 })).toBeNull();
    expect(sanitizeEntry({ id: "a", areaKey: "backend", date: "2026-10-16", minutes: 721 })).toBeNull();
    expect(sanitizeEntry({ id: "a", areaKey: "", date: "2026-10-16", minutes: 5 })).toBeNull();
    expect(sanitizeEntry({ id: "a", areaKey: "x", date: "16/10/2026", minutes: 5 })).toBeNull();
    expect(sanitizeEntry({ id: "a", areaKey: "x", date: "2026-10-16", minutes: 5, kind: "otra" })!.kind).toBe("manual");
    expect(sanitizeEntry(null)).toBeNull();
  });

  it("suma por día, por área y por rango", () => {
    const list = [e({ minutes: 25 }), e({ minutes: 30, areaKey: "frontend" }), e({ minutes: 10, date: "2026-10-14" }), e({ minutes: 50, date: "2026-10-20" })];
    expect(minutesOn(list, "2026-10-16")).toBe(55);
    expect(minutesOn(list, "2026-10-16", "backend")).toBe(25);
    expect(minutesBetween(list, "2026-10-12", "2026-10-18", "backend")).toBe(35);
    expect(minutesBetween(list, "2026-10-12", "2026-10-18")).toBe(65);
  });

  it("escribe el tiempo en horas y minutos", () => {
    expect(minutesText(0)).toBe("0 min");
    expect(minutesText(45)).toBe("45 min");
    expect(minutesText(60)).toBe("1 h");
    expect(minutesText(80)).toBe("1 h 20 min");
  });
});
