// Mentor — «Preguntas, correcciones y ajustes» de un plan ya creado (parte de la API que NO modifica el plan):
//  - `mentor_plan_intent`: clasifica lo escrito (pregunta · corrección · ajuste). Con IA si la hay; si no, por reglas. En la duda devuelve
//    `confident: false` y la pregunta de aclaración. No escribe nada.
//  - `mentor_plan_ask`: responde una PREGUNTA sobre el plan (texto) con el plan compacto como contexto. NO modifica el plan: solo
//    guarda la pregunta y la respuesta en el historial del plan (`status: "answered"`), que no se puede deshacer ni deshace nada.
//    Sin IA: respuestas deterministas simples basadas en el modelo («esta semana toca…», «Backend ocupa las semanas…»).
// Las dependencias de las llamadas largas a la IA (trabajo con «pensando…», una operación a la vez por plan) llegan de `mentor.ts`.

import { AIConfig, type ChatMessage } from "../../core/aiClient.js";
import { ApiError } from "../../core/errors.js";
import { ChangeStore, viewOf } from "../../core/mentor/planChange.js";
import { answerByRules, askMessages, classifyByRules, intentMessages, MAX_QUESTION_CHARS, parseAskReply, parseIntentReply, type AskPlanLike } from "../../lib/planAsk.js";
import { PLAN_ID_RE, PlanStore } from "../../core/mentor/plan.js";
import { aiUnavailableReason } from "../../core/mentor/planner.js";
import { AppConfig } from "../appConfig.js";
import type { AppState } from "../appState.js";

export interface AskDeps {
  withJob: <T>(key: string, label: string, fn: (job: { send: (messages: ChatMessage[], o?: { signal?: AbortSignal; timeoutMs?: number }) => Promise<string> }) => Promise<T>) => Promise<T>;
  guarded: <T>(id: string, key: string, fn: () => Promise<T>) => Promise<T>;
  /** `abort` / `auto` si el error es una cancelación del estudiante */
  cancelMode: (e: unknown) => "abort" | "auto" | undefined;
  today: () => string;
}

const clean = (v: unknown, max: number): string => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export function mentorAskApi(app: AppState, deps: AskDeps) {
  const aiOn = (): boolean => aiUnavailableReason(AIConfig.fromDict(AppConfig.get_ai_config())) === null;
  const planOf = (id: string) => {
    if (!PLAN_ID_RE.test(id)) throw new ApiError("Plan inválido.");
    const plan = new PlanStore(app.root).load(id);
    if (!plan) throw new ApiError("Ese plan ya no existe.");
    return plan;
  };

  return {
    /** ¿Pregunta, corrección o ajuste? */
    async mentor_plan_intent(opts: unknown) {
      const o = (opts && typeof opts === "object" ? opts : {}) as Record<string, any>;
      const id = String(o.id ?? "");
      planOf(id);
      const text = clean(o.text, MAX_QUESTION_CHARS);
      if (!text) throw new ApiError("Escribe algo para el Mentor.");
      const rules = classifyByRules(text);
      // lo seguro por reglas no gasta una llamada a la IA
      if (rules.confident || o.noAi === true || !aiOn()) return { ...rules, source: "rules" as const };
      try {
        const raw = await deps.withJob(`intent:${id}`, "Entendiendo qué quieres hacer…", (job) => job.send(intentMessages(text) as ChatMessage[], { timeoutMs: 45_000 }));
        const parsed = parseIntentReply(raw, text);
        if (parsed) return { ...parsed, source: "ai" as const };
      } catch (e) {
        if (deps.cancelMode(e) === "abort") throw new ApiError("Cancelado.");
      }
      return { ...rules, source: "rules" as const };
    },

    /** Responde una pregunta sobre el plan. Nunca modifica el plan; sí deja la pregunta y la respuesta en su historial. */
    async mentor_plan_ask(opts: unknown) {
      const o = (opts && typeof opts === "object" ? opts : {}) as Record<string, any>;
      const id = String(o.id ?? "");
      const plan = planOf(id);
      const question = clean(o.question, MAX_QUESTION_CHARS);
      if (!question) throw new ApiError("Escribe tu pregunta sobre el plan.");
      return deps.guarded(`plan:${id}`, `ask:${question}`, () =>
        deps.withJob(`ask:${id}`, "Pensando la respuesta sobre tu plan…", async (job) => {
          const today = deps.today();
          const hist = new ChangeStore(app.root);
          const recent = hist
            .list(id)
            .filter((e) => e.kind === "question" && e.answer)
            .slice(-3)
            .map((e) => ({ q: e.comment, a: e.answer! }));
          let answer = "";
          let source: "ai" | "rules" | "none" = "none";
          let understood = true;
          let note = "";
          if (o.noAi !== true && aiOn()) {
            try {
              const raw = await job.send(askMessages(plan as unknown as AskPlanLike, question, today, recent) as ChatMessage[], { timeoutMs: 90_000 });
              const text = parseAskReply(raw);
              if (text) {
                answer = text;
                source = "ai";
              } else note = "La IA no devolvió una respuesta útil.";
            } catch (e) {
              const m = deps.cancelMode(e);
              if (m === "abort") throw new ApiError("Cancelado.");
              note = m === "auto" ? "Pediste seguir sin IA." : `La IA falló: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200);
            }
          } else note = o.noAi === true ? "Sin IA por petición tuya." : "La IA no está configurada.";
          if (!answer) {
            const r = answerByRules(plan as unknown as AskPlanLike, question, today);
            answer = `${note ? `${note} ` : ""}${r.answer}`.trim();
            source = "rules";
            understood = r.understood;
          }
          const entry = hist.append(id, {
            at: new Date().toISOString(),
            comment: question,
            status: "answered",
            kind: "question",
            answer,
            source,
            summary: "Pregunta respondida: el plan no cambió.",
            delta: { added: 0, removed: 0, moved: 0, deliverables: 0 },
            changed: [],
            warnings: [],
            fixOptions: [],
          });
          return { loading: false as const, answer, source, understood, entry: viewOf(entry), history: hist.list(id).map(viewOf) };
        }),
      );
    },
  };
}
