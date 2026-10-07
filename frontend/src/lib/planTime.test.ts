import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonthsToDate,
  adjustedMinutes,
  capacityOf,
  coverage,
  eachDay,
  isoDow,
  periodLabel,
  presetEnd,
  preconditionsProblem,
  MAX_NOTES_CHARS,
  sanitizePreconditions,
  selectionOf,
  shortWeekLabel,
  weekIndex,
  weekRangesOf,
  type PlanPreconditions,
} from "./planTime";

const pre = (over: Partial<PlanPreconditions> = {}): PlanPreconditions => ({
  start: "2026-10-05", // lunes
  end: "2026-10-11", // domingo
  minutesPerDay: 120,
  studyDays: [1, 2, 3, 4, 5, 6],
  pace: "intenso",
  goalIds: ["g1"],
  subjects: [],
  levels: {},
  deliverables: "yes",
  ...over,
});

describe("fechas", () => {
  it("días de la semana ISO y rangos", () => {
    expect(isoDow("2026-10-05")).toBe(1);
    expect(isoDow("2026-10-11")).toBe(7);
    expect(eachDay("2026-10-30", "2026-11-02")).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
    expect(eachDay("2026-10-05", "2026-10-01")).toEqual([]);
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
  });

  it("los presets terminan el día anterior al mismo día del periodo siguiente", () => {
    expect(presetEnd("1s", "2026-10-06")).toBe("2026-10-12");
    expect(presetEnd("2s", "2026-10-06")).toBe("2026-10-19");
    expect(presetEnd("1m", "2026-10-06")).toBe("2026-11-05");
    expect(presetEnd("2m", "2026-10-06")).toBe("2026-12-05");
    expect(presetEnd("3m", "2026-10-06")).toBe("2027-01-05");
    expect(presetEnd("6m", "2026-10-06")).toBe("2027-04-05");
    expect(addMonthsToDate("2026-01-31", 1)).toBe("2026-02-28");
  });
});

describe("semanas de un periodo libre", () => {
  it("1 semana: una sola semana de 7 días", () => {
    const w = weekRangesOf("2026-10-06", "2026-10-12");
    expect(w).toEqual([{ week: 1, start: "2026-10-06", end: "2026-10-12", days: 7 }]);
  });

  it("2 meses: semanas de 7 días desde el inicio, la última más corta", () => {
    const w = weekRangesOf("2026-10-06", "2026-12-05");
    expect(w).toHaveLength(9);
    expect(w[0]).toMatchObject({ start: "2026-10-06", end: "2026-10-12" });
    expect(w.at(-1)).toMatchObject({ week: 9, start: "2026-12-01", end: "2026-12-05", days: 5 });
  });

  it("personalizado que empieza a mitad de semana (miércoles)", () => {
    const w = weekRangesOf("2026-10-07", "2026-10-22");
    expect(w.map((x) => [x.start, x.end, x.days])).toEqual([
      ["2026-10-07", "2026-10-13", 7],
      ["2026-10-14", "2026-10-20", 7],
      ["2026-10-21", "2026-10-22", 2],
    ]);
    expect(weekIndex("2026-10-06", "2026-10-07", "2026-10-22")).toBe(0);
    expect(weekIndex("2026-10-20", "2026-10-07", "2026-10-22")).toBe(2);
    expect(weekIndex("2026-10-23", "2026-10-07", "2026-10-22")).toBe(4);
  });

  it("etiquetas legibles", () => {
    expect(periodLabel("2026-10-06", "2026-11-05")).toBe("6 oct – 5 nov");
    expect(periodLabel("2026-12-20", "2027-01-10")).toBe("20 dic 2026 – 10 ene 2027");
    expect(shortWeekLabel("2026-10-06", "2026-10-12")).toBe("6–12 oct");
    expect(shortWeekLabel("2026-10-29", "2026-11-04")).toBe("29 oct – 4 nov");
  });
});

describe("capacityOf", () => {
  it("días de estudio × tiempo diario (lunes-sábado de una semana = 6 días)", () => {
    const c = capacityOf(pre());
    expect(c).toMatchObject({ totalDays: 7, studyDays: 6, blockedDays: 0, weeks: 1, rawMinutes: 720, effectiveMinutes: 720, hoursPerWeek: 12 });
  });

  it("solo los días elegidos cuentan", () => {
    expect(capacityOf(pre({ studyDays: [1, 3, 5] })).studyDays).toBe(3);
    expect(capacityOf(pre({ studyDays: [7] })).studyDays).toBe(1);
  });

  it("las fechas bloqueadas restan, pero solo si caen en día de estudio", () => {
    const c = capacityOf(pre({ blockedDates: ["2026-10-07", "2026-10-11"] })); // miércoles + domingo (no estudia)
    expect(c.studyDays).toBe(5);
    expect(c.blockedDays).toBe(1);
    expect(c.effectiveMinutes).toBe(600);
  });

  it("el ritmo reduce la capacidad efectiva: 70 % / 85 % / 100 %", () => {
    expect(capacityOf(pre({ pace: "suave" })).effectiveMinutes).toBe(504);
    expect(capacityOf(pre({ pace: "normal" })).effectiveMinutes).toBe(612);
    expect(capacityOf(pre({ pace: "intenso" })).effectiveMinutes).toBe(720);
    expect(capacityOf(pre({ pace: "suave" })).rawMinutes).toBe(720);
  });

  it("una primera semana parcial: desde hoy a mitad de periodo solo cuenta lo que queda", () => {
    const full = capacityOf(pre({ end: "2026-10-18" }));
    const partial = capacityOf(pre({ end: "2026-10-18" }), "2026-10-08"); // jueves
    expect(full.studyDays).toBe(12);
    expect(partial.totalDays).toBe(11);
    expect(partial.studyDays).toBe(9); // jue vie sáb + 6 de la segunda semana
    // un `from` anterior al inicio no suma días
    expect(capacityOf(pre(), "2026-09-01").totalDays).toBe(7);
  });

  it("un periodo de 3 meses da ~13 semanas", () => {
    const c = capacityOf(pre({ start: "2026-10-06", end: presetEnd("3m", "2026-10-06") }));
    expect(c.weeks).toBe(13.1);
    expect(c.hoursPerWeek).toBeGreaterThan(11);
  });
});

describe("precondiciones", () => {
  it("sanea sin lanzar: días y minutos válidos, niveles conocidos", () => {
    const p = sanitizePreconditions({ start: "mal", end: "2026-10-31", minutesPerDay: 3, studyDays: [0, 3, 3, 9, "5"], pace: "raro", levels: { Mat: "avanzado", Prog: "otro" }, goalIds: ["g1", "g1", ""] }, "2026-10-05");
    expect(p.start).toBe("2026-10-05");
    expect(p.minutesPerDay).toBe(120);
    expect(p.studyDays).toEqual([3, 5]);
    expect(p.pace).toBe("normal");
    expect(p.levels).toEqual({ Mat: "avanzado" });
    expect(p.goalIds).toEqual(["g1"]);
    expect(p.deliverables).toBe("ask");
  });

  it("detecta lo que no sirve", () => {
    expect(preconditionsProblem(pre({ end: "2026-10-01" }))).toContain("anterior");
    expect(preconditionsProblem(pre(), "2026-12-01")).toContain("ya terminó");
    expect(preconditionsProblem(pre({ goalIds: [], subjects: [] }))).toContain("qué quieres cubrir");
    expect(preconditionsProblem(pre({ goalIds: [], subjects: [], freeObjective: "mates" }))).toBeNull();
    expect(preconditionsProblem(pre())).toBeNull();
  });
});

describe("lo que hay que cubrir", () => {
  const topics = [
    { folder: "Prog/A", area: "Prog", minutes: 60, goalIds: ["g1"] },
    { folder: "Prog/B", area: "Prog", minutes: 60, goalIds: [] },
    { folder: "Mat/C", area: "Mat", minutes: 60, goalIds: ["g1"] },
    { folder: "Ing/D", area: "Ing", minutes: 60, goalIds: [] },
  ];

  it("une metas y materias sin contar dos veces un mismo tema", () => {
    const s = selectionOf({ goalIds: ["g1"], subjects: ["Prog"], levels: {} }, topics);
    expect(s.folders).toEqual(["Prog/A", "Prog/B", "Mat/C"]);
    expect(s.minutes).toBe(180);
  });

  it("el nivel declarado ajusta los minutos", () => {
    expect(adjustedMinutes(60, "Prog", { Prog: "empezando" })).toBe(70);
    expect(adjustedMinutes(60, "Prog", { Prog: "avanzado" })).toBe(50);
    expect(adjustedMinutes(60, "Prog", { Prog: "no_se" })).toBe(60);
    expect(selectionOf({ goalIds: [], subjects: ["Prog"], levels: { Prog: "avanzado" } }, topics).minutes).toBe(100);
  });

  it("avisa de si sobra o falta tiempo", () => {
    expect(coverage(600, 1200)).toMatchObject({ fits: true, spareMinutes: 600 });
    expect(coverage(600, 1200).text).toContain("sobran 10 h");
    expect(coverage(1200, 600).fits).toBe(false);
    expect(coverage(1200, 600).text).toContain("faltan 10 h");
    expect(coverage(600, 0).text).toContain("no tienes horas");
  });
});

describe("notes (comentarios para la IA)", () => {
  it("se sanea: una cadena, sin caracteres de control, saltos de línea conservados y con tope", () => {
    const n = (v: unknown) => sanitizePreconditions({ notes: v }, "2026-10-05").notes;
    expect(n("  hola\r\nmundo\u0000\u0007 \n\n\n\nfin  ")).toBe("hola\nmundo\n\nfin");
    expect(n(123)).toBeUndefined();
    expect(n("   ")).toBeUndefined();
    expect(n({ a: 1 })).toBeUndefined();
    expect(n("x".repeat(MAX_NOTES_CHARS + 500))!.length).toBe(MAX_NOTES_CHARS);
    expect("notes" in sanitizePreconditions({}, "2026-10-05")).toBe(false);
  });
});
