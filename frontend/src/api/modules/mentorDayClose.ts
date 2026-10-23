// Mentor — Cierre del día y memoria (ver `core/mentor/dayClose.ts`).
//
//  - mentor_day_record({ date? }) -> { date, record, review, student, closedAt, memory }: el registro DETERMINISTA del día (sin IA): temas previstos y
//    terminados, intentos, errores y katas. Lo calcula y lo guarda cada vez que se pide (barato); si el día ya se cerró, devuelve también la revisión.
//  - mentor_day_close({ date?, mood?, feeling?, notes?, noAi? }) -> igual + `source`: cierra el día. UNA llamada a la IA (con el registro, lo que dijo
//    el estudiante y las correcciones abiertas) que guarda la revisión y alimenta la memoria. Sin IA, o si falla, hay revisión por reglas.
//  - mentor_memory_get() -> { memory }: lo que el Mentor recuerda.
//  - mentor_correction_task({ id }) -> { memory, taskId }: convierte una corrección en una tarea (solo cuando el estudiante lo pide).
//  - mentor_correction_set({ id, status }) -> { memory }: la marca como hecha, descartada o la reabre.
// Escribe SOLO en `.notevault/mentor/` y, al pedirlo, una tarea. Nunca notas.

import { AIConfig, type ChatMessage } from "../../core/aiClient.js";
import { ApiError } from "../../core/errors.js";
import {
  applyReview, buildDayRecord, DayCloseStore, dayHasActivity, reviewByRules, sanitizeReview, sanitizeStudentDay,
  type CorrectionStatus, type DayRecord, type DayRecordInput, type DayReview, type StoredDay, type StudentDay,
} from "../../core/mentor/dayClose.js";
import { AreaPracticeStore } from "../../core/mentor/areaPracticeState.js";
import { SessionRecordStore } from "../../core/mentor/sessionRecordStore.js";
import { refreshPlanProgress, PlanStore, type Plan, type TopicLiteLookup } from "../../core/mentor/plan.js";
import { aiUnavailableReason } from "../../core/mentor/planner.js";
import type { TopicSnap } from "../../core/mentor/topics.js";
import { loadAllAttempts } from "../../core/practice/ledger.js";
import { StudyErrorManager } from "../../core/studyErrorManager.js";
import { buildSchedule, progressPlan, type SchedulePlan } from "../../lib/planSchedule.js";
import { AppConfig } from "../appConfig.js";
import type { AppState } from "../appState.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface DayCloseDeps {
  withJob: <T>(key: string, label: string, fn: (job: { send: (messages: ChatMessage[], o?: { signal?: AbortSignal; timeoutMs?: number }) => Promise<string> }) => Promise<T>) => Promise<T>;
  guarded: <T>(id: string, key: string, fn: () => Promise<T>) => Promise<T>;
  cancelMode: (e: unknown) => "abort" | "auto" | undefined;
  today: () => string;
  /** planes activos ese día */
  activePlans: (day: string) => Plan[];
  /** los temas de la vault (progreso real) */
  topicSnaps: () => TopicSnap[];
  /** el índice de la vault aún no está listo */
  cold: () => boolean;
}

/** El JSON de una respuesta de IA: el primer objeto `{…}` (tolera cercos de código y texto alrededor). */
export function jsonOf(text: string): unknown {
  const s = String(text ?? "").replace(/```[a-z]*\n?|```/gi, "");
  const a = s.indexOf("{");
  const b = s.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try {
    return JSON.parse(s.slice(a, b + 1));
  } catch {
    return null;
  }
}

const SYSTEM =
  "Eres el Mentor de estudio de una persona. Al cerrar su día revisas, de forma breve y concreta, lo que pasó y decides qué debes recordar y qué debe corregir. " +
  "Recibes el registro del día (cifras reales), lo que el estudiante dijo con sus palabras y las correcciones que ya tienes abiertas. " +
  "Responde SOLO con un objeto JSON con esta forma: " +
  '{"summary": string (2 frases como máximo), "observations": string[] (hasta 5 notas para ti mismo: patrones, puntos débiles, lo que funcionó), ' +
  '"studentSaid": string[] (hasta 4: lo que el estudiante expresó y debes tener en cuenta), ' +
  '"corrections": [{"title": string (acción corta), "why": string, "kind": "redo"|"review"|"note_fix"|"practice"|"plan", "topic": string (carpeta exacta de un tema del registro, opcional)}] (hasta 5)}. ' +
  "No repitas correcciones que ya están abiertas. No inventes temas ni cifras. Sin texto fuera del JSON.";

export function mentorDayCloseApi(app: AppState, deps: DayCloseDeps) {
  const store = () => new DayCloseStore(app.root);
  const aiOn = (): boolean => aiUnavailableReason(AIConfig.fromDict(AppConfig.get_ai_config())) === null;
  const dateOf = (o: Record<string, any>): string => {
    const d = o.date === undefined || o.date === "" ? deps.today() : String(o.date);
    if (!DATE_RE.test(d)) throw new ApiError("Fecha inválida (AAAA-MM-DD).");
    if (d > deps.today()) throw new ApiError("No se puede cerrar un día que aún no llegó.");
    return d;
  };

  /** El registro determinista de un día, con el progreso de los planes al día. */
  function recordFor(date: string): DayRecord {
    const today = deps.today();
    const snaps = new Map(deps.topicSnaps().map((t) => [t.folder, t] as const));
    const lookup: TopicLiteLookup = (f) => snaps.get(f);
    const planStore = new PlanStore(app.root);
    const plans: Plan[] = [];
    for (const p of deps.activePlans(date)) {
      // sella la fecha de los temas recién completados (solo el día actual: no se inventa el pasado)
      if (date === today) {
        const r = refreshPlanProgress(p, lookup, today);
        plans.push(r.changed ? planStore.save(r.plan) : r.plan);
      } else plans.push(p);
    }
    const planned: Array<{ folder: string; title: string; minutes: number; done: boolean }> = [];
    const completed: string[] = [];
    const katas: Array<{ areaId: string; status: string }> = [];
    const seen = new Set<string>();
    for (const p of plans) {
      const doneAt = new Map(p.subplans.flatMap((s) => s.topics.map((t) => [t.folder, t.completedAt ?? ""] as const)));
      for (const s of p.subplans) for (const t of s.topics) if (t.completedAt === date && !completed.includes(t.title)) completed.push(t.title);
      const day = buildSchedule(date === today ? progressPlan(p as unknown as SchedulePlan, { today }) : (p as never)).byDate.get(date);
      for (const t of day?.topics ?? []) {
        if (seen.has(t.folder)) continue;
        seen.add(t.folder);
        const at = doneAt.get(t.folder) ?? "";
        planned.push({ folder: t.folder, title: t.title, minutes: Math.round(t.minutes), done: !!at && at <= date });
      }
      const marks = new AreaPracticeStore(app.root).load(p.id);
      for (const [areaId, days] of Object.entries(marks)) {
        const st = (days as Record<string, string>)[date];
        if (st) katas.push({ areaId, status: st });
      }
    }
    const attempts: Array<DayRecordInput["attempts"][number]> = [];
    for (const rec of Object.values(loadAllAttempts(app.root))) {
      for (const a of Array.isArray(rec.attempts) ? rec.attempts : []) {
        if (!String(a?.at ?? "").startsWith(date)) continue;
        attempts.push({
          discipline: String(a.discipline ?? ""),
          skill: String(a.skill ?? ""),
          subject: String(a.subject ?? ""),
          score: Number(a.score),
          counted: String(a.counted ?? "").toLowerCase() === "true" || a.counted === true,
          verdict: String(a.verdict ?? ""),
          seconds: Number(a.seconds) || 0,
        });
      }
    }
    const errors = new StudyErrorManager(app.root)
      .errors()
      .filter((e) => String(e.occurred_at ?? "").startsWith(date))
      .map((e) => ({ category: e.category, subject: e.subject, topic: e.topic, skill: e.skill, repeat: e.repeat_count || 1 }));
    // las sesiones de estudio del día (Pomodoro): lo que la persona escribió al acabar cada bloque
    const sessions: NonNullable<DayRecordInput["sessions"]>[number][] = [];
    for (const p of plans) {
      for (const r of new SessionRecordStore(app.root, p.id).list()) {
        if (r.date !== date) continue;
        sessions.push({ areaName: r.areaName, minutes: r.minutes, understanding: r.assessment?.understanding ?? 0, focus: r.assessment?.focus ?? 0, doubt: r.assessment?.doubt ?? "", errors: r.assessment?.errors ?? "", open: r.assigned.filter((t) => t.status !== "done").length });
      }
    }
    return buildDayRecord({ date, planned, completed, attempts, errors, katas, sessions });
  }

  const view = (day: StoredDay) => ({
    date: day.record.date,
    record: day.record,
    student: day.student ?? null,
    review: day.review ?? null,
    closedAt: day.closedAt ?? null,
    memory: store().memory(),
  });

  const userMessage = (record: DayRecord, student: StudentDay, openTitles: string[]): string => {
    const lines: string[] = [];
    lines.push(`Fecha: ${record.date}`);
    lines.push(`Temas previstos: ${record.planned.topics} (${record.planned.done} terminados, ${record.planned.minutes} min previstos).`);
    if (record.planned.pending.length) lines.push(`Sin terminar: ${record.planned.pending.map((t) => `${t.title} [${t.folder}]`).join("; ")}`);
    if (record.completed.length) lines.push(`Completados hoy: ${record.completed.join("; ")}`);
    lines.push(`Intentos: ${record.attempts.total} (${record.attempts.counted} cuentan, ${record.attempts.wrong} con fallos, ${record.attempts.minutes} min)${record.attempts.avgScore !== null ? `, nota media ${record.attempts.avgScore}` : ""}.`);
    for (const w of record.weak) lines.push(`Punto flojo: ${w.skill || w.discipline} — ${w.attempts} intentos, media ${w.avgScore}, ${w.errors} errores.`);
    if (Object.keys(record.errorsByCategory).length) lines.push(`Errores por tipo: ${Object.entries(record.errorsByCategory).map(([k, v]) => `${k} ${v}`).join(", ")}`);
    lines.push(`Katas: ${record.katas.done} hechos, ${record.katas.skipped} saltados.`);
    if (record.sessions) {
      const s = record.sessions;
      lines.push(`Sesiones de estudio: ${s.count} (${s.minutes} min)${s.avgUnderstanding !== null ? `, comprensión media ${s.avgUnderstanding}/5` : ""}${s.avgFocus !== null ? `, concentración media ${s.avgFocus}/5` : ""}, ${s.openTopics} temas o tareas sin terminar.`);
      for (const d of s.doubts) lines.push(`Duda anotada en una sesión: ${d}`);
      for (const e of s.errors) lines.push(`Errores anotados en una sesión: ${e}`);
    }
    lines.push("");
    lines.push(`El estudiante dice${student.mood ? ` (ánimo ${student.mood}/5)` : ""}: ${student.feeling || "(nada)"}`);
    if (student.notes) lines.push(`Quiere que tengas en cuenta: ${student.notes}`);
    if (openTitles.length) lines.push(`Correcciones ya abiertas (no las repitas): ${openTitles.join("; ")}`);
    return lines.join("\n");
  };

  return {
    mentor_day_record(opts: unknown) {
      const o = (opts && typeof opts === "object" ? opts : {}) as Record<string, any>;
      const date = dateOf(o);
      if (deps.cold()) return { loading: true as const };
      const st = store();
      const prev = st.loadDay(date);
      const record = recordFor(date);
      // un día ya cerrado conserva lo que dijo el estudiante y su revisión; el registro se actualiza
      const day: StoredDay = { version: 1, record, ...(prev?.student ? { student: prev.student } : {}), ...(prev?.review ? { review: prev.review } : {}), ...(prev?.closedAt ? { closedAt: prev.closedAt } : {}) };
      st.saveDay(day);
      return { loading: false as const, ...view(day) };
    },

    async mentor_day_close(opts: unknown) {
      const o = (opts && typeof opts === "object" ? opts : {}) as Record<string, any>;
      const date = dateOf(o);
      if (deps.cold()) return { loading: true as const };
      const student = sanitizeStudentDay(o);
      const st = store();
      const record = recordFor(date);
      if (!dayHasActivity(record, student)) throw new ApiError("Ese día no tiene nada que revisar: ni temas, ni intentos, ni katas. Escribe cómo te fue si quieres dejar constancia.");
      const known = new Set(record.planned.pending.map((t) => t.folder));
      const mem = st.memory();
      const openTitles = mem.corrections.filter((c) => c.status === "open" || c.status === "task").map((c) => c.title);
      const finish = (review: DayReview, source: "ai" | "rules", note?: string) => {
        const day: StoredDay = { version: 1, record, student, review, closedAt: new Date().toISOString() };
        st.saveDay(day);
        st.saveMemory(applyReview(st.memory(), date, review));
        return { loading: false as const, source, ...(note ? { note } : {}), ...view(day) };
      };
      if (o.noAi === true || !aiOn()) {
        return finish(reviewByRules(record, student), "rules", o.noAi === true ? "Revisión sin IA por petición tuya." : "La IA no está configurada: revisión por reglas sobre tu registro.");
      }
      return deps.guarded(`day:${date}`, "close", () =>
        deps.withJob(`dayclose:${date}`, "El Mentor está revisando tu día…", async (job) => {
          try {
            const text = await job.send(
              [
                { role: "system", content: SYSTEM },
                { role: "user", content: userMessage(record, student, openTitles) },
              ] as ChatMessage[],
              { timeoutMs: 120_000 },
            );
            const review = sanitizeReview(jsonOf(text), "ai", known);
            if (review) return finish(review, "ai");
            return finish(reviewByRules(record, student), "rules", "La IA no devolvió una revisión válida: se guardó la revisión por reglas.");
          } catch (e) {
            const mode = deps.cancelMode(e);
            if (mode === "abort") throw new ApiError("Cancelaste el cierre del día. No se guardó nada.");
            const why = mode === "auto" ? "Seguiste sin IA" : `La IA falló (${e instanceof Error ? e.message : String(e)})`.slice(0, 180);
            return finish(reviewByRules(record, student), "rules", `${why}: se guardó la revisión por reglas.`);
          }
        }),
      );
    },

    mentor_memory_get() {
      return { memory: store().memory() };
    },

    mentor_correction_task(opts: unknown) {
      const o = (opts && typeof opts === "object" ? opts : {}) as Record<string, any>;
      const st = store();
      const mem = st.memory();
      const c = mem.corrections.find((x) => x.id === String(o.id ?? ""));
      if (!c) throw new ApiError("Esa corrección ya no existe.");
      if (c.status === "task" && c.taskId) return { memory: mem, taskId: c.taskId };
      const task = app.mgrs().tasks.create(c.title, { due: new Date(), body: c.why ? `${c.why}${c.topic ? `\nTema: ${c.topic}` : ""}` : c.topic ? `Tema: ${c.topic}` : "" });
      const saved = st.saveMemory({ ...mem, corrections: mem.corrections.map((x) => (x.id === c.id ? { ...x, status: "task" as const, taskId: task.id } : x)) });
      return { memory: saved, taskId: task.id };
    },

    mentor_correction_set(opts: unknown) {
      const o = (opts && typeof opts === "object" ? opts : {}) as Record<string, any>;
      const status = String(o.status ?? "") as CorrectionStatus;
      if (!["open", "done", "dismissed"].includes(status)) throw new ApiError("Estado inválido.");
      const st = store();
      const mem = st.memory();
      if (!mem.corrections.some((x) => x.id === String(o.id ?? ""))) throw new ApiError("Esa corrección ya no existe.");
      return { memory: st.saveMemory({ ...mem, corrections: mem.corrections.map((x) => (x.id === String(o.id) ? { ...x, status } : x)) }) };
    },
  };
}
