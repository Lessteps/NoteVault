import { describe, expect, it } from "vitest";
import { localDay, minutesBetween, minutesOn, minutesText, sanitizeAssessment, sanitizeEntry, summarizeTimeLog, type TimeEntry } from "./timeLog";

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

  it("la evaluación necesita las dos respuestas y una comprensión de 1 a 5; recorta lo largo", () => {
    const ok = { id: "a", areaKey: "backend", date: "2026-10-16", minutes: 25, topics: ["4.2 HTTP", ""], understanding: 4.4, learned: "  idea   principal ", doubt: "una duda" };
    expect(sanitizeAssessment(ok)).toMatchObject({ understanding: 4, learned: "idea principal", topics: ["4.2 HTTP"] });
    expect(sanitizeAssessment({ ...ok, doubt: "" })).toBeNull();
    expect(sanitizeAssessment({ ...ok, understanding: 0 })).toBeNull();
    expect(sanitizeAssessment({ ...ok, understanding: 6 })).toBeNull();
    expect(sanitizeAssessment({ ...ok, learned: "x".repeat(900) })!.learned).toHaveLength(600);
  });

  it("localDay es el día local, no el de UTC", () => {
    expect(localDay(new Date(2026, 9, 16, 23, 30))).toBe("2026-10-16");
    expect(localDay(new Date(2026, 0, 5, 0, 5))).toBe("2026-01-05");
  });
});


describe("clasificación del tiempo registrado", () => {
  it("una entrada antigua sin tipo sigue siendo válida (sin clasificar) y el tipo/temas se limpian", () => {
    const old = sanitizeEntry({ id: "a", areaKey: "backend", date: "2026-10-16", minutes: 25, kind: "pomodoro" })!;
    expect(old.work).toBeUndefined();
    expect(old.topics).toBeUndefined();
    expect(sanitizeEntry({ id: "a", areaKey: "backend", date: "2026-10-16", minutes: 25, work: "theory", topics: ["P/4.2 HTTP", "  "] })).toMatchObject({ work: "theory", topics: ["P/4.2 HTTP"] });
    expect(sanitizeEntry({ id: "a", areaKey: "backend", date: "2026-10-16", minutes: 25, work: "otro" })!.work).toBeUndefined();
  });

  it("suma el tiempo REAL por área y tipo dentro del rango, con sesiones y sin clasificar", () => {
    const list = [
      e({ id: "1", work: "theory", minutes: 45 }),
      e({ id: "2", work: "practice", minutes: 35, areaKey: "frontend" }),
      e({ id: "3", minutes: 10 }),
      e({ id: "4", work: "theory", minutes: 30, date: "2026-10-30" }),
    ];
    const week = summarizeTimeLog(list, { from: "2026-10-12", to: "2026-10-18" });
    expect(week).toMatchObject({ totalMinutes: 90, sessions: 3, hasAny: true, byArea: { backend: 55, frontend: 35 }, byKind: { theory: 45, practice: 35, project: 0, review: 0, unclassified: 10 } });
    expect(summarizeTimeLog(list, { areaKey: "frontend" }).totalMinutes).toBe(35);
    expect(summarizeTimeLog(list, { from: "2026-11-01" })).toMatchObject({ totalMinutes: 0, sessions: 0, hasAny: false });
  });
});
