/**
 * Currículo de PRÁCTICA del plan generado por la IA, por BLOQUES de semanas en paralelo limitado (mismo patrón que `planPipeline.ts`):
 * cada llamada tiene su tiempo máximo y todas comparten un presupuesto total; cancelar mata las llamadas en vuelo (AbortSignal); si un bloque
 * falla, se agota el tiempo o la respuesta no es válida, SOLO ese bloque cae a PLANTILLAS (marcadas como automáticas) y el resto conserva lo
 * que devolvió la IA. Sin IA todo va por plantillas sin llamar a nada.
 *
 * La IA solo ve los temas reales del plan que se practican cada semana (carpeta, título, tipo de práctica, lenguaje y cuántos ejercicios
 * ya existen en la vault). Se IGNORAN fechas y minutos; todo se valida (`sanitizeCurriculumWeek`): temas inexistentes, semanas fuera del plan
 * y textos largos se descartan. Los temas que ya tienen ejercicios en la vault se priorizan y no se inventan ejercicios para ellos.
 */

import type { ChatMessage } from "../aiClient.js";
import { objectsIn } from "./planDraft.js";
import {
  sanitizeCurriculumWeek,
  scopeOfPlan,
  shortOf,
  templateCurriculumWeek,
  weekPracticeTopics,
  type CurriculumMonth,
  type CurriculumWeek,
  type ExistingExercises,
  type PracticeCurriculum,
} from "../../lib/planCurriculum.js";
import { PRACTICE_NAME, PRACTICE_PURPOSE } from "../../lib/practiceTrack.js";
import { monthName, type PlanSchedule, type SchedulePlan } from "../../lib/planSchedule.js";

export const CURRICULUM_BLOCK_WEEKS = 3;
export const DEFAULT_CONCURRENCY = 3;
export const DEFAULT_CALL_TIMEOUT_MS = 120_000;
export const DEFAULT_BUDGET_MS = 480_000;

export class CurriculumCancel extends Error {
  constructor(readonly mode: "abort" | "auto") {
    super(mode === "auto" ? "Seguir sin IA." : "Cancelado por ti.");
  }
}

export interface CurriculumProgress {
  /** una entrada por bloque de semanas */
  blocks: Array<{ from: number; to: number; state: "pending" | "running" | "done" | "template" }>;
}

export interface CurriculumOpts {
  send: (messages: ChatMessage[], o: { signal: AbortSignal; timeoutMs: number }) => Promise<string>;
  aiOn: boolean;
  existing?: ExistingExercises;
  /** primera semana a generar (las pasadas no hacen falta); por defecto 1 */
  fromWeek?: number;
  concurrency?: number;
  callTimeoutMs?: number;
  budgetMs?: number;
  cancelled?: () => "abort" | "auto" | undefined;
  signal?: AbortSignal;
  onProgress?: (p: CurriculumProgress, label: string) => void;
  now?: () => number;
  /** objetivo del plan para el prompt (p. ej. «Backend») */
  objective?: string;
}

export interface CurriculumResult {
  curriculum: PracticeCurriculum;
  aiUsed: boolean;
  calls: number;
  warnings: string[];
}

// ── Prompt ──────────────────────────────────────────────────────────────

export const CURRICULUM_SYSTEM = [
  "Eres el Mentor de estudio y diseñas la PRÁCTICA del plan de un estudiante de programación.",
  `${PRACTICE_NAME} es una ${PRACTICE_PURPOSE}. La práctica de este plan debe estar ENFOCADA en el objetivo del plan y conectada con los temas que se estudian cada semana.`,
  "Recibes, por semana, los TEMAS REALES que se practican (carpeta exacta, título, tipo de práctica y lenguaje) y cuántos ejercicios tiene ya cada uno en la vault del estudiante.",
  "Responde SOLO un objeto JSON con esta forma (sin texto fuera del JSON):",
  '{"weeks":[{"week":1,"exercises":[{"topic":"<carpeta EXACTA>","practice":"language|database|ui|scripting|tooling|area","language":"Python","title":"<=110 caracteres","statement":"<=250 caracteres"}],"logic":[{"title":"<=110","statement":"<=250"}],"weeklyProject":{"title":"<=90","description":"<=280"},"dailyProjects":[{"topic":"<carpeta EXACTA de un tema de teoría de esa semana>","title":"<=90","description":"<=280"}]}],"monthly":[{"month":"AAAA-MM","title":"<=90","description":"<=280"}]}',
  "REGLAS:",
  "- `topic` debe ser EXACTAMENTE una de las carpetas listadas; no inventes temas.",
  "- Ejercicios concretos y accionables, conectados con el tema («Escribe en Python un cliente HTTP que…», «Diseña la tabla y escribe la consulta con JOIN que…»). De 1 a 2 por tema.",
  "- Para los temas que YA tienen ejercicios en la vault (marcados «ya tiene N») NO propongas ejercicios: la app los prioriza.",
  "- `logic`: de 3 a 5 retos de lógica tipo entrevista técnica alineados con el enfoque de la semana (estructuras de datos, cadenas, recorridos…).",
  "- `weeklyProject`: UN proyecto semanal que acumule lo estudiado esa semana; `dailyProjects`: mini-proyectos diarios (uno por tema ancla) que apliquen la teoría y la práctica de ese día.",
  "- `monthly`: solo para los meses listados; integra los proyectos semanales del mes.",
  "- NO escribas fechas ni minutos: la app decide el reparto. Todo en español.",
].join("\n");

export function curriculumMessages(sch: PlanSchedule, weeks: readonly number[], months: readonly string[], objective: string, existing?: ExistingExercises): ChatMessage[] {
  const lines: string[] = [`OBJETIVO DEL PLAN: ${objective || "programación"}.`, ""];
  for (const w of weeks) {
    const topics = weekPracticeTopics(sch, w, existing);
    const days = sch.days.filter((d) => d.week === w && d.focus);
    const focuses = [...new Set(days.map((d) => d.focus!.label))];
    lines.push(`SEMANA ${w} · enfoque: ${focuses.join(" + ") || "repaso"}`);
    const theory = [...new Map(days.flatMap((d) => (d.blocks ?? []).filter((b) => b.kind === "theory").flatMap((b) => b.items)).map((i) => [i.folder, i])).values()];
    if (theory.length) lines.push(`  teoría (candidatos a tema ancla de proyecto diario): ${theory.slice(0, 10).map((t) => `${t.folder} «${shortOf(t.title)}»`).join("; ")}`);
    if (!topics.length) lines.push("  (sin temas de práctica esta semana)");
    for (const t of topics.slice(0, 24)) lines.push(`  - ${t.folder} · «${shortOf(t.title)}» · práctica ${t.practice}${t.language ? ` en ${t.language}` : ""}${t.existing ? ` · ya tiene ${t.existing} ejercicios` : ""}`);
  }
  if (months.length) lines.push("", `MESES para el proyecto mensual: ${months.map((m) => `${m} (${monthName(m)})`).join(", ")}`);
  lines.push("", `Devuelve las semanas ${weeks.join(", ")} (todas) en el JSON.`);
  return [{ role: "system", content: CURRICULUM_SYSTEM }, { role: "user", content: lines.join("\n") }];
}

export interface ParsedCurriculum {
  ok: boolean;
  weeks: CurriculumWeek[];
  monthly: CurriculumMonth[];
  reason?: string;
}

const oneLine = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Valida la respuesta de un bloque: solo semanas pedidas, temas reales; nada de fechas ni minutos. */
export function parseCurriculumReply(text: string, plan: SchedulePlan, wanted: readonly number[], months: readonly string[]): ParsedCurriculum {
  const scope = scopeOfPlan(plan);
  for (const obj of objectsIn(text)) {
    if (!Array.isArray(obj.weeks)) continue;
    const weeks: CurriculumWeek[] = [];
    for (const w of obj.weeks) {
      const n = Math.round(Number((w as Record<string, unknown>)?.week));
      if (!wanted.includes(n)) continue;
      const clean = sanitizeCurriculumWeek(w, scope, "ai");
      if (clean && (clean.exercises.length || clean.logic.length || clean.weeklyProject || clean.dailyProjects.length) && !weeks.some((x) => x.week === clean.week)) weeks.push(clean);
    }
    const monthly: CurriculumMonth[] = [];
    for (const m of Array.isArray(obj.monthly) ? obj.monthly : []) {
      const rec = m as Record<string, unknown>;
      const month = String(rec?.month ?? "");
      const title = oneLine(rec?.title, 100);
      const description = oneLine(rec?.description, 320);
      if (months.includes(month) && title && !monthly.some((x) => x.month === month)) monthly.push({ month, title, ...(description ? { description } : {}), source: "ai" });
    }
    if (weeks.length) return { ok: true, weeks, monthly };
  }
  return { ok: false, weeks: [], monthly: [], reason: "la IA no devolvió un currículo válido" };
}

// ── Generación por bloques ──────────────────────────────────────────────

export async function generateCurriculum(plan: SchedulePlan, sch: PlanSchedule, o: CurriculumOpts): Promise<CurriculumResult> {
  const now = o.now ?? Date.now;
  const started = now();
  const concurrency = Math.max(1, o.concurrency ?? DEFAULT_CONCURRENCY);
  const callTimeout = o.callTimeoutMs ?? DEFAULT_CALL_TIMEOUT_MS;
  const budget = o.budgetMs ?? DEFAULT_BUDGET_MS;
  const warnings: string[] = [];
  const root = new AbortController();
  o.signal?.addEventListener("abort", () => root.abort(), { once: true });
  let calls = 0;
  let aiUsed = false;

  const from = Math.max(1, o.fromWeek ?? 1);
  const allWeeks = Array.from({ length: sch.weeks }, (_, i) => i + 1).filter((w) => w >= from && sch.days.some((d) => d.week === w && d.study));
  const blocks: number[][] = [];
  for (let i = 0; i < allWeeks.length; i += CURRICULUM_BLOCK_WEEKS) blocks.push(allWeeks.slice(i, i + CURRICULUM_BLOCK_WEEKS));
  const monthsOf = (ws: readonly number[]): string[] => [...new Set(sch.days.filter((d) => ws.includes(d.week)).map((d) => d.date.slice(0, 7)))];
  const progress: CurriculumProgress = { blocks: blocks.map((b) => ({ from: b[0]!, to: b[b.length - 1]!, state: "pending" as const })) };
  const emit = (): void => {
    const done = progress.blocks.filter((b) => b.state === "done" || b.state === "template").length;
    o.onProgress?.(progress, `Práctica del plan: ${done}/${progress.blocks.length} bloques de semanas`);
  };
  emit();

  const stopMode = (): "abort" | "auto" | undefined => o.cancelled?.();
  const checkAbort = (): void => {
    if (stopMode() === "abort") throw new CurriculumCancel("abort");
  };
  async function call(messages: ChatMessage[]): Promise<{ ok: true; text: string } | { ok: false; msg: string }> {
    checkAbort();
    if (stopMode() === "auto") return { ok: false, msg: "pediste seguir sin IA" };
    const left = budget - (now() - started);
    if (left <= 1000) return { ok: false, msg: "se acabó el tiempo total" };
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
      if (stopMode() === "abort") throw new CurriculumCancel("abort");
      if (stopMode() === "auto" || msg === "cancel") return { ok: false, msg: "pediste seguir sin IA" };
      if (timedOut || msg === "timeout" || /tardó más de|demasiado/i.test(msg)) return { ok: false, msg: "la IA tardó demasiado" };
      return { ok: false, msg: `la IA falló (${msg.slice(0, 120)})` };
    } finally {
      if (timer) clearTimeout(timer);
      root.signal.removeEventListener("abort", kill);
    }
  }

  const byWeek = new Map<number, CurriculumWeek>();
  const monthly: CurriculumMonth[] = [];
  const tpl = (ws: readonly number[]): void => {
    for (const w of ws) byWeek.set(w, templateCurriculumWeek(sch, w, o.existing));
  };

  if (!o.aiOn) {
    tpl(allWeeks);
    for (const b of progress.blocks) b.state = "template";
    emit();
  } else {
    let next = 0;
    const worker = async (): Promise<void> => {
      while (next < blocks.length) {
        const bi = next++;
        const ws = blocks[bi]!;
        progress.blocks[bi]!.state = "running";
        emit();
        const months = monthsOf(ws);
        const r = await call(curriculumMessages(sch, ws, months, o.objective ?? "", o.existing));
        let ok = false;
        let why = "";
        if (r.ok) {
          const parsed = parseCurriculumReply(r.text, plan, ws, months);
          if (parsed.ok) {
            ok = true;
            aiUsed = true;
            for (const w of ws) {
              const got = parsed.weeks.find((x) => x.week === w);
              const base = templateCurriculumWeek(sch, w, o.existing);
              if (!got) {
                byWeek.set(w, base);
                warnings.push(`La semana ${w} se completó con plantillas porque la IA no la devolvió.`);
                continue;
              }
              // la IA solo propone donde faltan: lo de la vault se conserva y se prioriza; lo que la IA no cubrió se completa con plantilla
              const vault = base.exercises.filter((e) => e.source === "vault");
              const vaultTopics = new Set(vault.map((e) => e.topic));
              const aiEx = got.exercises.filter((e) => !vaultTopics.has(e.topic));
              const covered = new Set(aiEx.map((e) => e.topic));
              const filler = base.exercises.filter((e) => e.source === "template" && !covered.has(e.topic));
              byWeek.set(w, { ...got, exercises: [...vault, ...aiEx, ...filler], logic: got.logic.length ? got.logic : base.logic });
            }
            monthly.push(...parsed.monthly.filter((m) => !monthly.some((x) => x.month === m.month)));
          } else why = parsed.reason ?? "";
        } else why = r.msg;
        if (!ok) {
          tpl(ws);
          warnings.push(`Las semanas ${ws[0]}–${ws[ws.length - 1]} se completaron con plantillas porque ${why || "la IA no respondió"}.`);
        }
        progress.blocks[bi]!.state = ok ? "done" : "template";
        emit();
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, blocks.length) }, () => worker()));
    checkAbort();
  }

  const weeks = [...byWeek.values()].sort((a, b) => a.week - b.week);
  const source = weeks.every((w) => w.source === "ai") && weeks.length ? "ai" : weeks.some((w) => w.source === "ai") ? "mixed" : "template";
  return { curriculum: { generatedAt: new Date(now()).toISOString(), source, weeks, monthly, ...(warnings.length ? { warnings } : {}) }, aiUsed, calls, warnings };
}
