// Currículo de práctica generado por la IA por BLOQUES de semanas (patrón de planPipeline): validación de temas, ejercicios existentes
// priorizados, paralelo limitado, fallo por bloque → plantillas, presupuesto agotado, cancelación real y sin IA.

import { describe, expect, it } from "vitest";
import { buildSchedule, type SchedulePlan, type ScheduleTopic } from "../../lib/planSchedule";
import { CURRICULUM_BLOCK_WEEKS, CurriculumCancel, curriculumMessages, generateCurriculum, parseCurriculumReply, type CurriculumProgress } from "./planCurriculumAi";

const START = "2026-10-05";
const BASES = { id: "bases", title: "Bases", kind: "bases" as const, order: 0 };
const PY = { id: "lang-python", title: "Lenguaje: Python", kind: "language" as const, order: 10 };
const CORE = { id: "core", title: "Conocimientos", kind: "knowledge" as const, order: 100 };
const topic = (folder: string, title: string, group: string): ScheduleTopic => ({ folder, title, estMinutes: 60, targetWeek: 1, group });
const many = (p: string, n: number, g: string) => Array.from({ length: n }, (_, i) => topic(`${p}/${i + 1}`, `${p} tema ${i + 1}`, g));

const plan: SchedulePlan = {
  id: "p1",
  start: START,
  end: "2026-11-29", // 8 semanas → bloques de 3: [1-3] [4-6] [7-8]
  structure: "areas",
  preconditions: { minutesPerDay: 360, studyDays: [1, 2, 3, 4, 5], pace: "intenso" },
  subplans: [
    { id: "s-be", areaId: "backend", area: "Backend", objective: "x", groups: [BASES, PY, CORE], phase: { fromWeek: 1, toWeek: 8 }, topics: [...many("F", 10, "bases"), ...many("PY", 20, "lang-python"), ...many("BE", 20, "core")] },
    { id: "s-db", areaId: "databases", area: "Databases", objective: "x", groups: [CORE], phase: { fromWeek: 1, toWeek: 8 }, topics: many("DB", 20, "core") },
  ],
};
const sch = buildSchedule(plan);

const okReply = (weeks: number[], extra: Record<string, unknown> = {}): string =>
  JSON.stringify({
    weeks: weeks.map((w) => ({
      week: w,
      exercises: [
        { topic: "DB/1", practice: "database", title: `Semana ${w}: diseña la tabla y escribe la consulta con JOIN`, statement: "Con datos de ejemplo", startDate: "2031-01-01", minutes: 500 },
        { topic: "INVENTADO/1", practice: "area", title: "Tema que no existe" },
      ],
      logic: [{ title: "Dos sumas" }, { title: "Paréntesis balanceados" }, { title: "Frecuencia de palabras" }],
      weeklyProject: { title: `API semana ${w}`, description: "CRUD con SQL" },
      dailyProjects: [{ topic: "BE/1", title: "Endpoint GET /productos" }],
      ...extra,
    })),
    monthly: [{ month: "2026-10", title: "Mini tienda", description: "Integra los semanales" }, { month: "2031-05", title: "Fuera" }],
  });
const weeksIn = (text: string): number[] => [...text.matchAll(/SEMANA (\d+)/g)].map((m) => Number(m[1]));

describe("generación por bloques con IA simulada", () => {
  it("una llamada por bloque de 3 semanas; valida temas, ignora fechas y minutos y marca la fuente", async () => {
    const seen: number[][] = [];
    const r = await generateCurriculum(plan, sch, {
      aiOn: true,
      send: async (m) => {
        const ws = weeksIn(m[1]!.content);
        seen.push(ws);
        return okReply(ws);
      },
    });
    expect(CURRICULUM_BLOCK_WEEKS).toBe(3);
    expect(r.calls).toBe(3);
    expect(seen.map((x) => x.length).sort()).toEqual([2, 3, 3]);
    expect(r.aiUsed).toBe(true);
    expect(r.curriculum.source).toBe("ai");
    expect(r.curriculum.weeks.map((w) => w.week)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    const json = JSON.stringify(r.curriculum);
    expect(json).not.toMatch(/2031|500|INVENTADO/);
    const w1 = r.curriculum.weeks[0]!;
    expect(w1.exercises.find((e) => e.source === "ai")!.topic).toBe("DB/1");
    expect(w1.weeklyProject!.title).toBe("API semana 1");
    expect(w1.dailyProjects[0]!.topic).toBe("BE/1");
    expect(r.curriculum.monthly).toEqual([expect.objectContaining({ month: "2026-10", title: "Mini tienda", source: "ai" })]);
    // cada tema practicado la semana tiene ejercicio (la IA cubre uno y la plantilla completa el resto)
    expect(w1.exercises.length).toBeGreaterThan(1);
    expect(r.warnings).toEqual([]);
  });

  it("los temas que ya tienen ejercicios en la vault se priorizan: la IA no pisa su ejercicio y el prompt los marca", async () => {
    let prompt = "";
    const r = await generateCurriculum(plan, sch, {
      aiOn: true,
      existing: { count: (f) => (f === "DB/1" ? 5 : 0) },
      send: async (m) => {
        if (weeksIn(m[1]!.content).includes(1)) prompt = m[1]!.content;
        return okReply(weeksIn(m[1]!.content));
      },
    });
    expect(prompt).toMatch(/DB\/1 ·.*ya tiene 5 ejercicios/);
    const w1 = r.curriculum.weeks[0]!;
    const db1 = w1.exercises.filter((e) => e.topic === "DB/1");
    expect(db1.length).toBeGreaterThan(0);
    expect(db1.every((e) => e.source === "vault" && e.existing === 5)).toBe(true);
    expect(w1.exercises.some((e) => e.source === "ai" && e.topic === "DB/1")).toBe(false);
  });

  it("paralelo limitado: nunca más llamadas simultáneas que la concurrencia", async () => {
    let live = 0;
    let peak = 0;
    const big: SchedulePlan = { ...plan, end: "2027-03-07" }; // 22 semanas → 8 bloques
    const r = await generateCurriculum(big, buildSchedule(big), {
      aiOn: true,
      concurrency: 2,
      send: async (m) => {
        live++;
        peak = Math.max(peak, live);
        await new Promise((ok) => setTimeout(ok, 5));
        live--;
        return okReply(weeksIn(m[1]!.content));
      },
    });
    expect(r.calls).toBe(8);
    expect(peak).toBe(2);
  });

  it("si un bloque falla, SOLO ese bloque cae a plantillas (marcadas) y el resto conserva lo de la IA", async () => {
    const r = await generateCurriculum(plan, sch, {
      aiOn: true,
      send: async (m) => {
        const ws = weeksIn(m[1]!.content);
        if (ws.includes(4)) throw new Error("boom");
        if (ws.includes(7)) return "esto no es JSON";
        return okReply(ws);
      },
    });
    const by = new Map(r.curriculum.weeks.map((w) => [w.week, w]));
    expect([1, 2, 3].every((w) => by.get(w)!.source === "ai")).toBe(true);
    expect([4, 5, 6, 7, 8].every((w) => by.get(w)!.source === "template")).toBe(true);
    expect(by.get(5)!.exercises.every((e) => e.source === "template" || e.source === "vault")).toBe(true);
    expect(r.curriculum.source).toBe("mixed");
    expect(r.warnings).toHaveLength(2);
    expect(r.warnings[0]).toMatch(/semanas 4–6 .* plantillas porque la IA falló/);
    expect(r.warnings[1]).toMatch(/semanas 7–8 .* plantillas porque la IA no devolvió un currículo válido/);
  });

  it("con el presupuesto total agotado no se llama a la IA: todo cae a plantillas", async () => {
    let t = 0;
    let called = 0;
    const r = await generateCurriculum(plan, sch, { aiOn: true, budgetMs: 5_000, now: () => (t += 10_000), send: async () => { called++; return ""; } });
    expect(called).toBe(0);
    expect(r.curriculum.source).toBe("template");
    expect(r.warnings.every((w) => /se acabó el tiempo total/.test(w))).toBe(true);
  });

  it("cancelar (abort) mata la llamada en vuelo (señal abortada) y lanza; «auto» deja el resto en plantillas sin llamar", async () => {
    const ctl = new AbortController();
    let flag: "abort" | undefined;
    let sawAbort = false;
    const p = generateCurriculum(plan, sch, {
      aiOn: true,
      concurrency: 1,
      signal: ctl.signal,
      cancelled: () => flag,
      send: (_m, o) =>
        new Promise<string>((_ok, rej) => {
          o.signal.addEventListener("abort", () => {
            sawAbort = true;
            rej(new Error("cancel"));
          });
          setTimeout(() => {
            flag = "abort";
            ctl.abort();
          }, 5);
        }),
    });
    await expect(p).rejects.toBeInstanceOf(CurriculumCancel);
    expect(sawAbort).toBe(true);
    let calls = 0;
    const auto = await generateCurriculum(plan, sch, { aiOn: true, cancelled: () => "auto", send: async () => { calls++; return ""; } });
    expect(calls).toBe(0);
    expect(auto.curriculum.source).toBe("template");
  });

  it("sin IA: plantillas deterministas, cero llamadas, progreso por bloque y misma salida cada vez", async () => {
    const progress: CurriculumProgress[] = [];
    const labels: string[] = [];
    const a = await generateCurriculum(plan, sch, { aiOn: false, send: async () => { throw new Error("no se llama"); }, now: () => 0, onProgress: (p, l) => { progress.push(JSON.parse(JSON.stringify(p))); labels.push(l); } });
    const b = await generateCurriculum(plan, sch, { aiOn: false, send: async () => "", now: () => 0 });
    expect(a.calls).toBe(0);
    expect(a.aiUsed).toBe(false);
    expect(a.curriculum.source).toBe("template");
    expect(JSON.stringify(a.curriculum)).toBe(JSON.stringify(b.curriculum));
    expect(progress.at(-1)!.blocks.every((x) => x.state === "template")).toBe(true);
    expect(labels.at(-1)).toBe("Práctica del plan: 3/3 bloques de semanas");
    expect(a.curriculum.weeks.find((w) => w.week === 1)!.exercises.some((e) => /Practica .* en Python: 3 ejercicios del tema/.test(e.title))).toBe(true);
  });

  it("fromWeek omite las semanas pasadas", async () => {
    const r = await generateCurriculum(plan, sch, { aiOn: false, fromWeek: 6, send: async () => "" });
    expect(r.curriculum.weeks.map((w) => w.week)).toEqual([6, 7, 8]);
  });
});

describe("prompt y respuesta", () => {
  it("el prompt solo lista temas reales del plan, pide JSON sin fechas ni minutos y menciona el objetivo y los meses", () => {
    const m = curriculumMessages(sch, [1, 2], ["2026-10"], "Backend", { count: () => 0 });
    expect(m[0]!.content).toMatch(/NO escribas fechas ni minutos/);
    expect(m[0]!.content).toMatch(/Programming practice/i);
    expect(m[1]!.content).toContain("OBJETIVO DEL PLAN: Backend");
    expect(m[1]!.content).toMatch(/SEMANA 1 · enfoque: Backend/);
    expect(m[1]!.content).toMatch(/práctica language en Python/);
    expect(m[1]!.content).toMatch(/práctica database en SQL/);
    expect(m[1]!.content).toContain("2026-10");
  });

  it("acepta la respuesta con texto alrededor o dentro de un bloque ```json y descarta semanas no pedidas", () => {
    const parsed = parseCurriculumReply("Claro:\n```json\n" + okReply([1, 9]) + "\n```", plan, [1, 2], ["2026-10"]);
    expect(parsed.ok).toBe(true);
    expect(parsed.weeks.map((w) => w.week)).toEqual([1]);
    expect(parseCurriculumReply("{}", plan, [1], []).ok).toBe(false);
  });
});
