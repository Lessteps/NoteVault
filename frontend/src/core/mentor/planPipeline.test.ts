// Generación completa por partes: esqueleto + un bloque de temas por subplan, en paralelo limitado, con tiempo por llamada y presupuesto total.
// Si un bloque falla solo ese cae a reglas; progreso visible; cancelar MATA las llamadas (señal abortada); un plan largo no hace una sola llamada gigante.

import { describe, expect, it } from "vitest";
import { sanitizePreconditions } from "../../lib/planTime.js";
import type { StudentBrief } from "./brief.js";
import type { CatalogTopic } from "./goalDraft.js";
import { generateByParts, PipelineCancel, type PipelineProgress } from "./planPipeline.js";
import { autoSeeds, resolveScope, resolveBranches } from "./planSpec.js";

const TODAY = "2026-10-06";
const brief: StudentBrief = { version: 1, date: TODAY, weekday: "martes", sections: [], skipped: [] };
const topics = (branch: string, n: number, est = 60): CatalogTopic[] =>
  Array.from({ length: n }, (_, i) => ({ folder: `Programación/${branch}/T${String(i + 1).padStart(3, "0")}`, title: `T${i + 1}`, subject: "Programación", skills: ["implement"], completenessPct: 0, estMinutes: est }));
const ALL = [...topics("1 Fundamentals", 75), ...topics("2.1 Python", 20), ...topics("3 Desktop Apps (Electron)", 18), ...topics("4 Backend", 40), ...topics("5 Frontend", 30), ...topics("6 Databases", 25), ...topics("7 Automation", 14), ...topics("8 Mobile", 13)];
const pre = (over: Record<string, unknown> = {}) => sanitizePreconditions({ start: TODAY, end: "2027-04-04", minutesPerDay: 420, studyDays: [1, 2, 3, 4, 5, 6, 7], pace: "intenso", subjects: ["Programación"], levels: { Programación: "basico" }, deliverables: "ask", ...over }, TODAY);
const seedsOf = (p = pre()) => autoSeeds(p, resolveScope(p, ALL, []));

type Send = (m: any[], o: { signal: AbortSignal; timeoutMs: number }) => Promise<string>;
const keyOf = (m: any[]): string => /SUBPLAN key=(.+?) \|/.exec(m[1].content)![1]!;
const skeleton = (keys: string[]) => JSON.stringify({ type: "skeleton", rationale: "Primero lo básico.", subplans: keys.map((key, i) => ({ key, weight: 3 + (i % 2) })) });
const picks = (m: any[], keep?: (f: string) => boolean) => {
  const folders = [...m[1].content.matchAll(/folder=(\S[^|]*?) \|/g)].map((x) => x[1] as string).filter(keep ?? (() => true));
  return JSON.stringify({ type: "topic_order", subplans: [{ key: keyOf(m), reason: "De lo básico a lo avanzado.", topics: [...folders].reverse() }] });
};
const sleep = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
const run = (send: Send, o: Record<string, unknown> = {}, p = pre()) => generateByParts(p, seedsOf(p), { brief, aiOn: true, send, ...o } as never);

describe("un plan de 26 semanas ya no hace una sola llamada gigante", () => {
  it("1 llamada de esqueleto + una por subplan/bloque, cada una con ≤ 60 temas candidatos", async () => {
    const p = resolveBranches(pre(), ALL, [], "quiero ser full stack"); // sin Desktop, Mobile ni Automation
    const seen: { sys: string; topics: number; chars: number }[] = [];
    const send: Send = async (m) => {
      const sys = m[0].content as string;
      seen.push({ sys, topics: (m[1].content.match(/folder=/g) ?? []).length, chars: m[1].content.length });
      return sys.includes("ESQUELETO") ? skeleton(seedsOf(p).map((s) => `${s.area}|${s.objective}`.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""))) : picks(m);
    };
    const r = await run(send, {}, p);
    const skel = seen.filter((c) => c.sys.includes("ESQUELETO"));
    const blocks = seen.filter((c) => !c.sys.includes("ESQUELETO"));
    expect(skel).toHaveLength(1);
    expect(skel[0]!.topics).toBe(0); // el esqueleto no lleva temas
    expect(blocks.length).toBeGreaterThanOrEqual(5); // Fundamentals (15 por nivel básico), Python, Backend, Frontend, Databases, Tooling…
    expect(Math.max(...blocks.map((b) => b.topics))).toBeLessThanOrEqual(60);
    expect(seen.every((c) => c.chars < 12_000)).toBe(true); // ningún prompt enorme
    expect(r.calls).toBe(seen.length);
    expect(r.aiUsed).toBe(true);
    expect(Object.values(r.sources).every((x) => x === "ai")).toBe(true);
    expect(r.seeds.flatMap((s) => s.topics).some((t) => /Mobile|Desktop|Automation/.test(t.folder))).toBe(false);
  });

  it("un subplan con más de 60 temas se pide por bloques de 60", async () => {
    const big: CatalogTopic[] = topics("4 Backend", 130);
    const p = pre({ levels: {} });
    const seeds = autoSeeds(p, resolveScope(p, big, []));
    expect(seeds).toHaveLength(1);
    const sizes: number[] = [];
    const r = await generateByParts(p, seeds, { brief, aiOn: true, send: async (m: any[]) => { sizes.push((m[1].content.match(/folder=/g) ?? []).length); return picks(m); } });
    expect(sizes.sort((a, b) => b - a)).toEqual([60, 60, 10]);
    expect(r.seeds[0]!.topics).toHaveLength(130);
  });
});

describe("paralelismo limitado, progreso y respuesta compacta", () => {
  it("nunca hay más de `concurrency` llamadas de temas a la vez", async () => {
    for (const limit of [1, 3]) {
      let live = 0;
      let peak = 0;
      const send: Send = async (m) => {
        if (m[0].content.includes("ESQUELETO")) return "no JSON";
        live++;
        peak = Math.max(peak, live);
        await sleep(15);
        live--;
        return picks(m);
      };
      await run(send, { concurrency: limit }, resolveBranches(pre(), ALL, [], "full stack"));
      expect(peak).toBeLessThanOrEqual(limit);
      if (limit > 1) expect(peak).toBeGreaterThan(1); // de verdad en paralelo
    }
  });

  it("el progreso es real: «Esqueleto ✓ · Backend ✓ · Frontend … · 2/5 subplanes»", async () => {
    const labels: string[] = [];
    const prog: PipelineProgress[] = [];
    const p = pre({ branches: { Programación: ["4 Backend", "5 Frontend", "6 Databases"] }, branchPreset: "x" });
    const send: Send = async (m) => (m[0].content.includes("ESQUELETO") ? skeleton(seedsOf(p).map((s) => `programacion|${s.objective.toLowerCase()}`)) : picks(m));
    await run(send, { concurrency: 1, onProgress: (pr: PipelineProgress, l: string) => { labels.push(l); prog.push(JSON.parse(JSON.stringify(pr))); } }, p);
    expect(labels[0]).toBe("Esqueleto …");
    expect(labels.some((l) => l.startsWith("Esqueleto ✓ · Backend … "))).toBe(true);
    expect(labels.some((l) => /^Esqueleto ✓ · Backend ✓ · Frontend … · Databases · · 1\/3 subplanes$/.test(l) || /Backend ✓ · Frontend … .*1\/3 subplanes/.test(l))).toBe(true);
    expect(labels.at(-1)).toMatch(/Backend ✓ · Frontend ✓ · Databases ✓ · 3\/3 subplanes$/);
    expect(prog.at(-1)!.subplans.every((s) => s.state === "done")).toBe(true);
  });

  it("el esqueleto fija orden, pesos y objetivo; las claves inventadas se descartan", async () => {
    const p = pre({ branches: { Programación: ["4 Backend", "5 Frontend"] }, branchPreset: "x" });
    const send: Send = async (m) =>
      m[0].content.includes("ESQUELETO")
        ? JSON.stringify({ type: "skeleton", rationale: "Front primero.", subplans: [{ key: "programacion|avanzar en frontend", weight: 5, objective: "Interfaces con React" }, { key: "inventada|x", weight: 1 }, { key: "programacion|avanzar en backend", weight: 1 }] })
        : picks(m);
    const r = await run(send, {}, p);
    expect(r.seeds.map((s) => s.objective)).toEqual(["Interfaces con React", "Avanzar en Backend"]);
    expect(r.seeds[0]!.weight).toBeGreaterThan(r.seeds[1]!.weight!);
    expect(r.rationale).toBe("Front primero.");
    expect(r.discarded.join()).toContain("inventada");
  });

  it("respuesta compacta: una razón por subplan (en las notas) y solo carpetas; las inventadas y las de otro subplan se descartan", async () => {
    const p = pre({ branches: { Programación: ["4 Backend"] }, branchPreset: "x" });
    const send: Send = async (m) => JSON.stringify({ type: "topic_order", subplans: [{ key: keyOf(m), reason: "Orden lógico.", topics: ["Programación/4 Backend/T003", "Programación/8 Mobile/T001", "Programación/Inventado/X", "Programación/4 Backend/T001"] }] });
    const r = await run(send, {}, p);
    expect(r.seeds[0]!.topics.map((t) => t.folder)).toEqual(["Programación/4 Backend/T003", "Programación/4 Backend/T001"]);
    expect(r.seeds[0]!.notes).toContain("Orden lógico.");
    expect(r.discarded.join()).toMatch(/Mobile/);
  });
});

describe("fallos y tiempos: solo cae a reglas el bloque que falla", () => {
  const p = () => pre({ branches: { Programación: ["4 Backend", "5 Frontend", "6 Databases"] }, branchPreset: "x" });
  const skel = () => JSON.stringify({ type: "skeleton", rationale: "ok", subplans: seedsOf(p()).map((s) => ({ key: `programacion|${s.objective.toLowerCase()}`, weight: 3 })) });

  it("si Frontend falla, Backend y Databases conservan lo de la IA, Frontend queda en orden natural y se avisa con el motivo", async () => {
    const send: Send = async (m) => {
      if (m[0].content.includes("ESQUELETO")) return skel();
      if (keyOf(m).includes("frontend")) throw new Error("HTTP 500");
      return picks(m);
    };
    const r = await run(send, {}, p());
    expect(r.sources).toEqual({ "programacion|avanzar en backend": "ai", "programacion|avanzar en frontend": "rules", "programacion|avanzar en databases": "ai" });
    expect(r.aiUsed).toBe(true);
    const by = (k: string) => r.seeds.find((s) => s.objective.toLowerCase().includes(k))!;
    expect(by("backend").topics[0]!.folder).toBe("Programación/4 Backend/T040"); // la IA los dio al revés
    expect(by("frontend").topics[0]!.folder).toBe("Programación/5 Frontend/T001"); // orden natural
    expect(by("frontend").topics).toHaveLength(30); // no se pierde ningún tema
    expect(r.warnings).toEqual(["El subplan «Frontend» se completó con reglas porque la IA falló (HTTP 500)."]);
    expect(by("frontend").notes).toContain("orden natural");
  });

  it("una llamada que se cuelga vence en su tiempo, se ABORTA su señal y solo ese subplan va por reglas", async () => {
    const signals: AbortSignal[] = [];
    const send: Send = (m, o) => {
      if (m[0].content.includes("ESQUELETO")) return Promise.resolve(skel());
      if (keyOf(m).includes("databases")) {
        signals.push(o.signal);
        return new Promise(() => undefined); // nunca responde y no respeta la señal
      }
      return Promise.resolve(picks(m));
    };
    const t0 = Date.now();
    const r = await run(send, { callTimeoutMs: 60 }, p());
    expect(Date.now() - t0).toBeLessThan(3000);
    expect(signals).toHaveLength(1);
    expect(signals[0]!.aborted).toBe(true);
    expect(r.sources["programacion|avanzar en databases"]).toBe("rules");
    expect(r.sources["programacion|avanzar en backend"]).toBe("ai");
    expect(r.warnings.join()).toContain("El subplan «Databases» se completó con reglas porque la IA tardó demasiado.");
  });

  it("presupuesto total: lo que no cabe en el tiempo va por reglas con su motivo", async () => {
    let clock = 0;
    const send: Send = async (m) => {
      if (m[0].content.includes("ESQUELETO")) return skel();
      clock += 400;
      return picks(m);
    };
    const r = await run(send, { concurrency: 1, budgetMs: 1300, now: () => clock }, p());
    expect(Object.values(r.sources).sort()).toEqual(["ai", "rules", "rules"]);
    expect(r.warnings.every((w) => w.includes("se acabó el tiempo total"))).toBe(true);
  });

  it("esqueleto fallido: lo arma la app con reglas y los temas siguen pidiéndose por subplan", async () => {
    const send: Send = async (m) => {
      if (m[0].content.includes("ESQUELETO")) throw new Error("sin red");
      return picks(m);
    };
    const r = await run(send, {}, p());
    expect(r.skeletonOk).toBe(false);
    expect(r.warnings[0]).toContain("El esqueleto lo armó la app con reglas porque la IA falló");
    expect(r.seeds).toHaveLength(3);
    expect(r.aiUsed).toBe(true);
  });

  it("si TODO falla se devuelve todo por reglas sin lanzar, con un aviso por subplan", async () => {
    const r = await run(async () => "basura", {}, p());
    expect(r.aiUsed).toBe(false);
    expect(Object.values(r.sources)).toEqual(["rules", "rules", "rules"]);
    expect(r.warnings.filter((w) => w.startsWith("El subplan"))).toHaveLength(3);
    expect(r.warnings.join()).toContain("no devolvió una respuesta válida");
  });

  it("sin IA no se llama a nada", async () => {
    let n = 0;
    const r = await run(async () => (n++, ""), { aiOn: false }, p());
    expect(n).toBe(0);
    expect(r.calls).toBe(0);
    expect(r.seeds).toHaveLength(3);
  });
});

describe("cancelar de verdad", () => {
  const p = () => pre({ branches: { Programación: ["4 Backend", "5 Frontend", "6 Databases"] }, branchPreset: "x" });
  const sk = () => JSON.stringify({ type: "skeleton", rationale: "ok", subplans: seedsOf(p()).map((s) => ({ key: `programacion|${s.objective.toLowerCase()}`, weight: 3 })) });

  it("«abort»: lanza PipelineCancel y las llamadas en vuelo reciben la señal abortada (se mata el proceso)", async () => {
    let mode: "abort" | undefined;
    const inflight: AbortSignal[] = [];
    const send: Send = (m, o) => {
      if (m[0].content.includes("ESQUELETO")) return Promise.resolve(sk());
      inflight.push(o.signal);
      if (inflight.length === 1) setTimeout(() => ((mode = "abort"), o.signal.aborted || undefined), 5);
      return new Promise((ok, no) => {
        o.signal.addEventListener("abort", () => no(new Error("Cancelado.")));
        void ok;
      });
    };
    let root: AbortController | undefined;
    root = new AbortController();
    const prom = run(send, { cancelled: () => mode, signal: root.signal, concurrency: 1 }, p());
    setTimeout(() => root!.abort(), 30);
    await expect(prom).rejects.toBeInstanceOf(PipelineCancel);
    expect(inflight[0]!.aborted).toBe(true);
    expect(inflight.length).toBe(1); // no se lanzó nada más
  });

  it("«auto»: deja de llamar y el resto va por reglas (lo ya hecho se conserva)", async () => {
    let mode: "auto" | undefined;
    let n = 0;
    const send: Send = async (m) => {
      if (m[0].content.includes("ESQUELETO")) return sk();
      n++;
      if (n === 1) mode = "auto";
      return picks(m);
    };
    const r = await run(send, { cancelled: () => mode, concurrency: 1 }, p());
    expect(n).toBe(1);
    expect(Object.values(r.sources).filter((x) => x === "ai")).toHaveLength(1);
    expect(r.warnings.every((w) => w.includes("pediste seguir sin IA"))).toBe(true);
    expect(r.seeds).toHaveLength(3);
  });
});
