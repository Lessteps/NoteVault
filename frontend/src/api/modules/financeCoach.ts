// Coach Financiero IA para el módulo de Finanzas.
//
// Mantiene conversaciones privadas 100% aisladas de Notas, Mentor y Ejercicio
// en `~/.notevault/finance_coach_conversations/`, e inyecta dinámicamente en el
// System Prompt el balance del mes, presupuesto, ritmo de gasto (pace) y metas.

import {
  AIConfig,
  AIError,
  BRIDGE_URLS,
  buildBridgePrompt,
  sendChat,
  streamChat,
  type ChatMessage,
} from "../../core/aiClient.js";
import {
  ConversationStore,
  sanitizeTitle,
  type Conversation,
  type ConversationMeta,
} from "../../core/conversations.js";
import { todayIso } from "../../core/dates.js";
import { ApiError } from "../../core/errors.js";
import { buildFinanceCoachPrompt } from "../../core/financeCoachPrompt.js";
import type { FinanceContextData } from "../../lib/financeCoachTypes.js";
import { AppConfig } from "../appConfig.js";
import type { AppState } from "../appState.js";

const MAX_HISTORY = 40;
const MAX_TEXT = 60_000;
const MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

const TITLE_PROMPT =
  "Eres quien titula conversaciones con el Asesor Financiero en NoteVault. " +
  "Devuelve SOLO un título de 3 a 6 palabras, en español, sin comillas, sin puntuación final " +
  "y sin la palabra «conversación». Debe describir el tema o consulta financiera tratada.";

const TITLE_BUDGETS = [1500, 2500];

function titleFallback(question: string): string {
  const line = String(question || "")
    .trim()
    .split(/[\r\n]+/)[0]
    ?.trim();
  if (!line) return "Consulta financiera";
  return sanitizeTitle(line) || "Consulta financiera";
}

async function requestTitle(
  cfg: AIConfig,
  question: string,
  answer: string,
  maxTokens: number,
): Promise<string> {
  const messages: ChatMessage[] = [
    { role: "system", content: TITLE_PROMPT },
    {
      role: "user",
      content:
        `Consulta del usuario:\n${String(question || "").slice(0, 4000)}\n\n` +
        `Respuesta del coach:\n${String(answer || "").slice(0, 1200)}`,
    },
  ];
  const raw = await sendChat(
    new AIConfig({
      provider: cfg.provider,
      base_url: cfg.base_url,
      model: cfg.model,
      api_key: cfg.api_key,
      temperature: 0.2,
      max_tokens: maxTokens,
      include_note: false,
      claude_path: cfg.claude_path,
      claude_timeout_s: cfg.claude_timeout_s,
    }),
    messages,
  );
  return sanitizeTitle(raw);
}

export function financeCoachApi(app: AppState) {
  const aiCfg = (): AIConfig => AIConfig.fromDict(AppConfig.get_ai_config());
  const store = (): ConversationStore =>
    new ConversationStore(AppConfig.get_finance_coach_conversations_dir());

  const streams = new Map<string, AbortController>();

  const emit = (data: Record<string, unknown>): void => {
    const win = app.window as
      | { webContents?: { send: (channel: string, payload: unknown) => void } }
      | null;
    win?.webContents?.send("nv-ai-stream", data);
  };

  const getContextData = (): FinanceContextData => {
    const fm = app.mgrs().finances;
    const today = new Date();
    const year = today.getFullYear();
    const monthIndex = today.getMonth();
    const monthLabel = MONTH_NAMES[monthIndex] || `Mes ${monthIndex + 1}`;

    const [thisMonth] = fm.compareMonth(year, monthIndex + 1);
    const budgetCents = fm.budgetMonth();

    const totalDays = new Date(year, monthIndex + 1, 0).getDate();
    const daysElapsed = Math.max(1, today.getDate());
    const spentCents = thisMonth?.gasto ?? 0;
    const dailyAvg = Math.round(spentCents / daysElapsed);
    const projected = dailyAvg * totalDays;

    let paceStatus: "under" | "over" | "on_track" = "on_track";
    if (budgetCents > 0) {
      if (projected > budgetCents) paceStatus = "over";
      else if (projected < budgetCents * 0.9) paceStatus = "under";
    }

    const monthPairs = fm.month(year, monthIndex + 1);
    const catMap = new Map(fm.categories(null, true).map((c) => [c.id, c.name]));

    const catSpent = new Map<string, number>();
    for (const [, m] of monthPairs) {
      if (m.type === "gasto") {
        const cid = m.category || "sin_categoria";
        catSpent.set(cid, (catSpent.get(cid) ?? 0) + (m.amount_cents ?? 0));
      }
    }

    const categories = fm.categories(null, true).map((c) => ({
      name: c.name,
      kind: c.kind as "gasto" | "ingreso",
      budget_cents: c.budget_cents || undefined,
      spent_cents: catSpent.get(c.id) ?? 0,
    }));

    const goals = fm.goals(true).map((g) => ({
      name: g.name,
      target_cents: g.target_cents,
      saved_cents: fm.saved(g.id),
    }));

    const recurrents = fm.recurrents().map((r) => ({
      what: r.what,
      amount_cents: r.amount_cents,
      type: r.type,
      frequency: r.rule?.frequency || "mensual",
    }));

    const movements = monthPairs.map(([d, m]) => ({
      date: todayIso(d),
      type: String(m.type || "gasto"),
      what: String(m.what || "Movimiento"),
      amount_cents: Number(m.amount_cents) || 0,
      category: m.category ? (catMap.get(m.category) || m.category) : undefined,
    }));

    return {
      currency: fm.currency() || "$",
      monthLabel,
      monthTotals: {
        spent_cents: spentCents,
        income_cents: thisMonth?.ingreso ?? 0,
        saved_cents: thisMonth?.ahorro ?? 0,
        balance_cents: thisMonth?.balance ?? 0,
      },
      budget_cents: budgetCents,
      pace: {
        daysElapsed,
        totalDays,
        dailyAverageCents: dailyAvg,
        projectedMonthEndCents: projected,
        status: paceStatus,
      },
      categories,
      goals,
      recurrents,
      movements,
    };
  };

  return {
    fin_coach_context(): FinanceContextData {
      return getContextData();
    },

    fin_coach_conversations(): ConversationMeta[] {
      return store().list();
    },

    fin_coach_conversation_get(id: string): Conversation | null {
      return store().get(String(id || ""));
    },

    fin_coach_conversation_save(
      id: string | null,
      messages: unknown,
      model = "",
      title = "",
    ): Conversation {
      return store().save(id ? String(id) : null, { messages, model, title });
    },

    fin_coach_conversation_rename(id: string, title: string): Conversation {
      const conv = store().rename(String(id || ""), String(title || ""));
      if (!conv) throw new ApiError("Esa conversación del coach financiero ya no existe.");
      return conv;
    },

    fin_coach_conversation_delete(id: string): Record<string, unknown> {
      return { ok: store().remove(String(id || "")) };
    },

    async fin_coach_ai_title(
      id: string,
      question: string,
      answer = "",
    ): Promise<Record<string, unknown>> {
      const conv = store().get(String(id || ""));
      if (!conv) throw new ApiError("Esa conversación ya no existe.");
      const fallback = titleFallback(question);
      const cfg = aiCfg();

      if (!cfg.is_bridge) {
        let lastError = "";
        for (const budget of TITLE_BUDGETS) {
          try {
            const title = await requestTitle(cfg, question, answer, budget);
            if (title.length >= 3) {
              store().rename(conv.id, title);
              return { title, fallback: false };
            }
            lastError = "respuesta vacía";
          } catch (e) {
            lastError = (e as Error).message;
          }
        }
        store().rename(conv.id, fallback);
        return { title: fallback, fallback: true, error: lastError };
      }

      store().rename(conv.id, fallback);
      return { title: fallback, fallback: true };
    },

    async fin_coach_chat_stream(
      streamId: string,
      history: unknown,
      question: string,
    ): Promise<Record<string, unknown>> {
      const id = String(streamId || "");
      if (!id) throw new ApiError("ID de stream requerido.");
      if (!Array.isArray(history)) throw new ApiError("Historial inválido.");
      const q = String(question || "").trim().slice(0, MAX_TEXT);
      if (!q) throw new ApiError("Escribe una consulta financiera.");

      const contextData = getContextData();
      const systemPrompt = buildFinanceCoachPrompt(contextData);

      const messages: ChatMessage[] = [{ role: "system", content: systemPrompt }];

      for (const m of history.slice(-MAX_HISTORY)) {
        if (m && typeof m === "object") {
          const role = (m as Record<string, unknown>).role;
          if (role === "user" || role === "assistant") {
            messages.push({
              role,
              content: String((m as Record<string, unknown>).content || "").slice(0, MAX_TEXT),
            });
          }
        }
      }

      messages.push({ role: "user", content: q });

      const cfg = aiCfg();

      if (cfg.is_bridge) {
        return {
          bridge: true,
          prompt: buildBridgePrompt(messages),
          url: BRIDGE_URLS[cfg.provider] ?? "",
          label: cfg.info.label,
        };
      }

      const controller = new AbortController();
      streams.set(id, controller);
      emit({ id, type: "start" });

      try {
        const reply = await streamChat(cfg, messages, {
          signal: controller.signal,
          onDelta: (text) => emit({ id, type: "delta", text }),
          onThinking: (text) => emit({ id, type: "thinking", text }),
        });
        const stopped = controller.signal.aborted;
        emit({ id, type: "done", stopped });
        return { reply, stopped };
      } catch (e) {
        const message = e instanceof AIError ? e.message : String(e);
        emit({ id, type: "error", message });
        throw new ApiError(message);
      } finally {
        streams.delete(id);
      }
    },

    fin_coach_chat_cancel(streamId: string): Record<string, unknown> {
      const id = String(streamId || "");
      const controller = streams.get(id);
      if (!controller) return { ok: false };
      controller.abort();
      streams.delete(id);
      return { ok: true };
    },
  };
}
