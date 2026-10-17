import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { buildStudentBrief } from "./brief.js";
import {
  applyReview, buildDayRecord, DayCloseStore, dayHasActivity, emptyMemory, memoryLines, reviewByRules, sanitizeReview, sanitizeStudentDay,
  type DayRecordInput,
} from "./dayClose.js";

const base = (over: Partial<DayRecordInput> = {}): DayRecordInput => ({
  date: "2026-10-12",
  planned: [
    { folder: "P/a", title: "A", minutes: 60, done: true },
    { folder: "P/b", title: "B", minutes: 90, done: false },
  ],
  completed: ["A"],
  attempts: [
    { discipline: "backend", skill: "endpoint_design", subject: "programming", score: 40, counted: true, verdict: "incorrect", seconds: 600 },
    { discipline: "backend", skill: "endpoint_design", subject: "programming", score: 60, counted: true, verdict: "partial", seconds: 300 },
    { discipline: "sql", skill: "joins", subject: "programming", score: 90, counted: false, verdict: "correct", seconds: 120 },
  ],
  errors: [{ category: "conceptual", subject: "programming", topic: "P/b", skill: "endpoint_design", repeat: 2 }],
  katas: [{ areaId: "backend", status: "done" }, { areaId: "frontend", status: "skipped" }],
  ...over,
});

describe("registro determinista del día (sin IA)", () => {
  it("resume lo previsto, lo hecho, los intentos y los puntos flojos", () => {
    const r = buildDayRecord(base(), "t");
    expect(r.planned).toMatchObject({ topics: 2, minutes: 150, done: 1, pending: [{ folder: "P/b", title: "B" }] });
    expect(r.attempts).toMatchObject({ total: 3, counted: 2, wrong: 2, minutes: 17 });
    expect(r.attempts.avgScore).toBe(63.3);
    expect(r.weak[0]).toMatchObject({ skill: "endpoint_design", attempts: 2, errors: 2, avgScore: 50 });
    expect(r.weak.some((w) => w.skill === "joins")).toBe(false);
    expect(r.errorsByCategory).toEqual({ conceptual: 2 });
    expect(r.katas).toEqual({ done: 1, skipped: 1 });
  });

  it("un día vacío no cuenta como actividad, salvo que el estudiante escriba algo", () => {
    const r = buildDayRecord(base({ planned: [], completed: [], attempts: [], errors: [], katas: [] }));
    expect(dayHasActivity(r, sanitizeStudentDay({}))).toBe(false);
    expect(dayHasActivity(r, sanitizeStudentDay({ feeling: "Me costó" }))).toBe(true);
  });
});

describe("sesiones de estudio en el cierre del día", () => {
  const sessions = [
    { areaName: "Backend", minutes: 50, understanding: 2, focus: 4, doubt: "El token expira", errors: "PUT vs PATCH", open: 1 },
    { areaName: "Frontend", minutes: 25, understanding: 4, focus: 3, doubt: "", errors: "", open: 0 },
  ];

  it("resume tiempo, medias y lo que la persona escribió; sin sesiones el registro no cambia", () => {
    const r = buildDayRecord(base({ sessions }), "t");
    expect(r.sessions).toEqual({ count: 2, minutes: 75, avgUnderstanding: 3, avgFocus: 3.5, doubts: ["El token expira"], errors: ["PUT vs PATCH"], openTopics: 1 });
    expect("sessions" in buildDayRecord(base(), "t")).toBe(false);
    expect("sessions" in buildDayRecord(base({ sessions: [] }), "t")).toBe(false);
  });

  it("un día solo con sesiones ya es actividad: merece revisión", () => {
    const r = buildDayRecord(base({ planned: [], completed: [], attempts: [], errors: [], katas: [], sessions }));
    expect(dayHasActivity(r, sanitizeStudentDay({}))).toBe(true);
  });
});

describe("revisión del cierre", () => {
  it("sin IA hay revisión por reglas con correcciones sobre lo pendiente y lo flojo", () => {
    const rev = reviewByRules(buildDayRecord(base()), sanitizeStudentDay({ feeling: "No entendí las rutas" }));
    expect(rev.source).toBe("rules");
    expect(rev.corrections.map((c) => c.title)).toEqual(["Retomar «B»", "Repasar endpoint_design"]);
    expect(rev.studentSaid).toEqual(["No entendí las rutas"]);
  });

  it("valida la respuesta de la IA: recorta, descarta duplicados y temas inventados", () => {
    const rev = sanitizeReview(
      {
        summary: "Buen día",
        observations: ["a", "", "b"],
        corrections: [
          { title: "Repasar JOINs", why: "falló 3 veces", kind: "review", topic: "P/b" },
          { title: "repasar joins", kind: "review" },
          { title: "Rehacer ruta", kind: "inventado", topic: "P/NOEXISTE" },
        ],
      },
      "ai",
      new Set(["P/b"]),
    )!;
    expect(rev.observations).toEqual(["a", "b"]);
    expect(rev.corrections).toEqual([
      { title: "Repasar JOINs", why: "falló 3 veces", kind: "review", topic: "P/b" },
      { title: "Rehacer ruta", why: "", kind: "review" },
    ]);
    expect(sanitizeReview({ nada: true }, "ai")).toBeNull();
  });
});

describe("memoria del Mentor", () => {
  const rev = (titles: string[]) => ({ source: "ai" as const, summary: "x", observations: ["Flojea en joins"], studentSaid: ["Me cuesta SQL"], corrections: titles.map((title) => ({ title, why: "porque", kind: "review" as const })) });

  it("acumula correcciones sin duplicar las abiertas y reemplaza el mismo día", () => {
    let m = applyReview(emptyMemory(), "2026-10-12", rev(["Repasar JOINs"]));
    m = applyReview(m, "2026-10-13", rev(["Repasar JOINs", "Rehacer endpoint"]));
    expect(m.corrections.map((c) => [c.date, c.title])).toEqual([["2026-10-12", "Repasar JOINs"], ["2026-10-13", "Rehacer endpoint"]]);
    m = applyReview(m, "2026-10-13", rev(["Rehacer endpoint"]));
    expect(m.observations.filter((o) => o.date === "2026-10-13")).toHaveLength(1);
    expect(m.closedDays).toEqual(["2026-10-12", "2026-10-13"]);
  });

  it("las líneas del informe priorizan correcciones abiertas y omiten las resueltas", () => {
    const m = applyReview(emptyMemory(), "2026-10-12", rev(["Repasar JOINs", "Rehacer endpoint"]));
    m.corrections[1]!.status = "done";
    const lines = memoryLines(m, "2026-10-13").map((l) => l.text);
    expect(lines[0]).toContain("Repasar JOINs");
    expect(lines.some((l) => l.includes("Rehacer endpoint"))).toBe(false);
    expect(lines.some((l) => l.includes("Me cuesta SQL"))).toBe(true);
  });

  it("entra en el informe del Mentor como sección propia", () => {
    const m = applyReview(emptyMemory(), "2026-10-12", rev(["Repasar JOINs"]));
    const brief = buildStudentBrief({ today: new Date(2026, 9, 13), memory: () => m }, { only: ["mentor_memory"] });
    expect(brief.sections).toHaveLength(1);
    expect(brief.sections[0]!.lines.map((l) => l.text).join("\n")).toContain("Repasar JOINs");
    expect(buildStudentBrief({ today: new Date(2026, 9, 13), memory: () => emptyMemory() }, { only: ["mentor_memory"] }).sections).toHaveLength(0);
  });
});

describe("almacén", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nv_dayclose_"));
  });

  it("guarda el día y la memoria en .notevault/mentor y los recupera", () => {
    const st = new DayCloseStore(tmp);
    st.saveDay({ version: 1, record: buildDayRecord(base()), student: sanitizeStudentDay({ feeling: "ok" }) });
    expect(st.loadDay("2026-10-12")!.record.planned.topics).toBe(2);
    expect(st.loadDay("2026-10-13")).toBeNull();
    const mem = st.saveMemory(applyReview(emptyMemory(), "2026-10-12", { source: "rules", summary: "s", observations: [], studentSaid: [], corrections: [{ title: "T", why: "", kind: "redo" }] }));
    expect(st.memory().corrections[0]!.title).toBe("T");
    expect(mem.closedDays).toEqual(["2026-10-12"]);
    expect(fs.existsSync(path.join(tmp, ".notevault", "mentor", "memory.json"))).toBe(true);
  });
});
