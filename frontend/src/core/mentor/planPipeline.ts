/**
 * Generación COMPLETA por partes (en vez de una sola llamada gigante a la IA, que en planes largos supera el tiempo):
 *  1. ESQUELETO: una llamada pequeña decide qué subplanes entran, su orden, su peso y su objetivo (sin temas).
 *  2. TEMAS: una llamada por subplan (y por cada bloque de ≤60 temas) con solo los candidatos de esa rama, EN PARALELO con concurrencia
 *     limitada. La respuesta es compacta: carpetas elegidas + UNA razón corta por subplan.
 *  Cada llamada tiene su tiempo máximo y todas comparten un presupuesto total; si un bloque falla (o se acaba el tiempo), SOLO ese bloque
 *  cae a reglas (orden natural) y el resto conserva lo que la IA devolvió. Se marca la fuente por subplan y se avisa con el motivo concreto.
 *  Cancelar mata las llamadas en vuelo (AbortSignal): `abort` lanza; `auto` deja el resto en reglas y termina.
 */

import type { ChatMessage } from "../aiClient.js";
import { TOPIC_BLOCK } from "../../lib/planBuild.js";
import type { PlanPreconditions } from "../../lib/planTime.js";
import type { StudentBrief } from "./brief.js";
import { fold, keywordsOf } from "./goalDraft.js";
import { subplanKey, type SubplanSeed } from "./plan.js";
import { parseSkeletonReply, parseTopicsReply, skeletonMessages, topicsBlockMessages } from "./planBuildAi.js";

export const DEFAULT_CONCURRENCY = 3;
export const DEFAULT_CALL_TIMEOUT_MS = 120_000;
export const DEFAULT_BUDGET_MS = 480_000;

export class PipelineCancel extends Error {
  constructor(readonly mode: "abort" | "auto") {
    super(mode === "auto" ? "Seguir sin IA." : "Cancelado por ti.");
  }
}

export type SourceKind = "ai" | "rules" | "mixed";

export interface PipelineProgress {
  skeleton: "pending" | "done" | "rules" | "skipped";
  /** una entrada por subplan, en el orden del esqueleto */
  subplans: Array<{ key: string; name: string; done: number; total: number; state: "pending" | "running" | "done" | "rules" | "mixed" }>;
}

export interface PipelineOpts {
  /** una llamada a la IA; debe respetar `signal` (matar el proceso) y `timeoutMs` */
  send: (messages: ChatMessage[], o: { signal: AbortSignal; timeoutMs: number }) => Promise<string>;
  brief: StudentBrief;
  /** hay IA disponible; si no, todo va por reglas sin llamar a nada */
  aiOn: boolean;
  concurrency?: number;
  callTimeoutMs?: number;
  budgetMs?: number;
  /** cancelación externa: `abort` lanza, `auto` deja el resto por reglas */
  cancelled?: () => "abort" | "auto" | undefined;
  signal?: AbortSignal;
  onProgress?: (p: PipelineProgress, label: string) => void;
  now?: () => number;
}

export interface PipelineResult {
  seeds: SubplanSeed[];
  /** clave original del subplan → fuente */
  sources: Record<string, SourceKind>;
  warnings: string[];
  rationale: string;
  discarded: string[];
  /** alguna llamada de la IA contribuyó */
  aiUsed: boolean;
  skeletonOk: boolean;
  calls: number;
}

const short = (s: string, n = 28): string => (s.length > n ? `${s.slice(0, n - 1).trim()}…` : s);
const nameOf = (s: Pick<SubplanSeed, "area" | "objective">): string => short(s.objective.replace(/^Avanzar en /, "") || s.area);

/** Ordena los candidatos de un subplan grande por relevancia con lo que pidió el estudiante (los demás, en su orden natural). */
function byRelevance(topics: SubplanSeed["topics"], hint: string): SubplanSeed["topics"] {
  const words = keywordsOf(hint);
  if (!words.length || topics.length <= TOPIC_BLOCK) return topics;
  const score = (t: SubplanSeed["topics"][number]): number => words.filter((w) => fold(`${t.folder} ${t.title}`).includes(w)).length;
  return topics.map((t, i) => ({ t, i, s: score(t) })).sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.t);
}

export async function generateByParts(pre: PlanPreconditions, seedsIn: readonly SubplanSeed[], o: PipelineOpts): Promise<PipelineResult> {
  const now = o.now ?? Date.now;
  const started = now();
  const concurrency = Math.max(1, o.concurrency ?? DEFAULT_CONCURRENCY);
  const callTimeout = o.callTimeoutMs ?? DEFAULT_CALL_TIMEOUT_MS;
  const budget = o.budgetMs ?? DEFAULT_BUDGET_MS;
  const warnings: string[] = [];
  const discarded: string[] = [];
  const sources: Record<string, SourceKind> = {};
  const root = new AbortController();
  o.signal?.addEventListener("abort", () => root.abort(), { once: true });
  let calls = 0;
  let aiUsed = false;
  let rationale = "";
  let skeletonOk = false;

  const stopMode = (): "abort" | "auto" | undefined => o.cancelled?.();
  const checkAbort = (): void => {
    if (stopMode() === "abort") throw new PipelineCancel("abort");
  };
  /** una llamada con su tiempo máximo (la mata de verdad con la señal) y el cancelar externo */
  async function call(messages: ChatMessage[]): Promise<{ ok: true; text: string } | { ok: false; why: "timeout" | "error" | "cancel"; msg: string }> {
    checkAbort();
    if (stopMode() === "auto") return { ok: false, why: "cancel", msg: "pediste seguir sin IA" };
    const left = budget - (now() - started);
    if (left <= 1000) return { ok: false, why: "timeout", msg: "se acabó el tiempo total" };
    const ctl = new AbortController();
    const kill = (): void => ctl.abort();
    root.signal.addEventListener("abort", kill, { once: true });
    const timeoutMs = Math.min(callTimeout, left);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    calls++;
    try {
      const text = await Promise.race([
        o.send(messages, { signal: ctl.signal, timeoutMs }),
        new Promise<never>((_, rej) => {
          timer = setTimeout(() => {
            timedOut = true;
            ctl.abort();
            rej(new Error("timeout"));
          }, timeoutMs + 1500);
        }),
        new Promise<never>((_, rej) => ctl.signal.addEventListener("abort", () => rej(new Error(timedOut ? "timeout" : "cancel")), { once: true })),
      ]);
      return { ok: true, text };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (stopMode() === "abort") throw new PipelineCancel("abort");
      if (stopMode() === "auto" || msg === "cancel") return { ok: false, why: "cancel", msg: "pediste seguir sin IA" };
      if (timedOut || msg === "timeout" || /tardó más de|demasiado/i.test(msg)) return { ok: false, why: "timeout", msg: "la IA tardó demasiado" };
      return { ok: false, why: "error", msg: `la IA falló (${msg.slice(0, 120)})` };
    } finally {
      if (timer) clearTimeout(timer);
      root.signal.removeEventListener("abort", kill);
    }
  }

  // sin IA: nada que pedir
  const strip = (s: SubplanSeed): SubplanSeed => {
    const { notes: _n, ...rest } = s;
    return { ...rest, topics: s.topics.map(({ diagnostic: _d, ...t }) => t) };
  };
  let seeds = seedsIn.map(strip);
  const origKey = new Map(seeds.map((s) => [s, subplanKey(s)] as const));
  if (!o.aiOn || !seeds.length) {
    for (const s of seeds) sources[subplanKey(s)] = "rules";
    return { seeds, sources, warnings, rationale, discarded, aiUsed: false, skeletonOk: false, calls };
  }

  const progress: PipelineProgress = { skeleton: "pending", subplans: [] };
  const label = (): string => {
    const parts = [`Esqueleto ${progress.skeleton === "done" ? "✓" : progress.skeleton === "rules" ? "(reglas)" : progress.skeleton === "skipped" ? "✓" : "…"}`];
    const doneN = progress.subplans.filter((p) => p.state === "done" || p.state === "rules" || p.state === "mixed").length;
    for (const p of progress.subplans.slice(0, 5)) parts.push(`${p.name} ${p.state === "done" ? "✓" : p.state === "rules" || p.state === "mixed" ? "(reglas)" : p.state === "running" ? "…" : "·"}`);
    if (progress.subplans.length > 5) parts.push(`+${progress.subplans.length - 5}`);
    if (progress.subplans.length) parts.push(`${doneN}/${progress.subplans.length} subplanes`);
    return parts.join(" · ");
  };
  const emit = (): void => o.onProgress?.(progress, label());
  emit();

  // ── 1 · esqueleto ──
  const weights = new Map<string, number>();
  if (seeds.length > 1) {
    const r = await call(skeletonMessages(o.brief, pre, seeds));
    if (r.ok) {
      const parsed = parseSkeletonReply(r.text, new Set(seeds.map(subplanKey)));
      if (parsed.ok) {
        skeletonOk = true;
        rationale = parsed.rationale;
        discarded.push(...parsed.discarded);
        const byKey = new Map(seeds.map((s) => [subplanKey(s), s]));
        const ordered: SubplanSeed[] = [];
        for (const it of parsed.items) {
          const s = byKey.get(it.key)!;
          ordered.push(it.objective && !s.goalId ? { ...s, objective: it.objective } : s);
          origKey.set(ordered.at(-1)!, it.key);
          weights.set(it.key, it.weight);
        }
        seeds = ordered;
        progress.skeleton = "done";
      } else {
        warnings.push("El esqueleto lo armó la app con reglas porque la IA no devolvió un esqueleto válido.");
        progress.skeleton = "rules";
      }
    } else {
      warnings.push(`El esqueleto lo armó la app con reglas porque ${r.msg}.`);
      progress.skeleton = "rules";
    }
  } else progress.skeleton = "skipped";

  // ── 2 · temas: una tarea por (subplan, bloque), en paralelo limitado ──
  const hint = `${pre.freeObjective ?? ""} ${pre.notes ?? ""}`;
  interface Task { si: number; bi: number; blocks: number; topics: SubplanSeed["topics"] }
  const tasks: Task[] = [];
  const prepared = seeds.map((s) => (s.topics.length > TOPIC_BLOCK ? { ...s, topics: byRelevance(s.topics, hint) } : s));
  prepared.forEach((s, si) => {
    const blocks = Math.max(1, Math.ceil(s.topics.length / TOPIC_BLOCK));
    if (s.topics.length < 2) return;
    for (let bi = 0; bi < blocks; bi++) tasks.push({ si, bi, blocks, topics: s.topics.slice(bi * TOPIC_BLOCK, (bi + 1) * TOPIC_BLOCK) });
  });
  progress.subplans = prepared.map((s, si) => ({ key: origKey.get(seeds[si]!) ?? subplanKey(s), name: nameOf(s), done: 0, total: tasks.filter((t) => t.si === si).length, state: "pending" as const }));
  emit();

  type BlockRes = { picked: SubplanSeed["topics"]; ok: boolean; reason?: string; why?: string };
  const results = new Map<string, BlockRes>();
  let next = 0;
  async function worker(): Promise<void> {
    while (next < tasks.length) {
      const t = tasks[next++]!;
      const s = prepared[t.si]!;
      const key = subplanKey(s);
      const prog = progress.subplans[t.si]!;
      prog.state = "running";
      emit();
      const cand = { ...s, topics: t.topics };
      const r = await call(topicsBlockMessages(o.brief, pre, cand, { index: t.bi, count: t.blocks }));
      let res: BlockRes = { picked: t.topics, ok: false, reason: "" };
      if (r.ok) {
        const parsed = parseTopicsReply(r.text, new Map([[key, new Set(t.topics.map((x) => x.folder))]]));
        if (parsed.ok) {
          aiUsed = true;
          const by = new Map(t.topics.map((x) => [x.folder, x]));
          const picked = (parsed.order[key] ?? []).map((x) => by.get(x.folder)!).filter(Boolean);
          res = { picked, ok: true, why: parsed.reasons?.[key] };
          discarded.push(...parsed.discarded);
        } else res.reason = "la IA no devolvió una respuesta válida";
      } else res.reason = r.msg;
      results.set(`${t.si}#${t.bi}`, res);
      prog.done++;
      if (prog.done >= prog.total) {
        const mine = tasks.filter((x) => x.si === t.si).map((x) => results.get(`${x.si}#${x.bi}`)!);
        prog.state = mine.every((m) => m.ok) ? "done" : mine.some((m) => m.ok) ? "mixed" : "rules";
      }
      emit();
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()));
  checkAbort();

  // ── 3 · se ensambla: lo que la IA eligió + lo que cayó a reglas, con el aviso concreto por subplan ──
  const out: SubplanSeed[] = [];
  prepared.forEach((s, si) => {
    const key = origKey.get(seeds[si]!) ?? subplanKey(s);
    const mine = tasks.filter((x) => x.si === si);
    if (!mine.length) {
      sources[key] = "rules";
      out.push(s);
      return;
    }
    const rs = mine.map((x) => results.get(`${x.si}#${x.bi}`)!);
    const topics = rs.flatMap((r) => r.picked);
    const okN = rs.filter((r) => r.ok).length;
    const kind: SourceKind = okN === rs.length ? "ai" : okN === 0 ? "rules" : "mixed";
    sources[key] = kind;
    const notes: string[] = [];
    const why = rs.find((r) => r.why)?.why;
    if (why) notes.push(why);
    if (kind !== "ai") {
      const reason = rs.find((r) => !r.ok)?.reason ?? "la IA no respondió";
      warnings.push(`El subplan «${nameOf(s)}» se ${kind === "mixed" ? "completó en parte" : "completó"} con reglas porque ${reason}.`);
      notes.push("Temas en el orden natural de la materia (sin la selección de la IA).");
    }
    const w = weights.get(key);
    const mins = topics.reduce((n, t) => n + t.estMinutes, 0);
    out.push({ ...s, topics: topics.length ? topics : s.topics, ...(notes.length ? { notes: notes.join(" ") } : {}), ...(w ? { weight: Math.max(1, Math.round((mins * w) / 3)) } : {}) });
  });
  return { seeds: out, sources, warnings, rationale, discarded: [...new Set(discarded)].slice(0, 20), aiUsed, skeletonOk, calls };
}
