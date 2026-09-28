// Conversations: the private chat history, in the app's data folder (never in
// the vault, which syncs between devices). One file per conversation plus an
// index the history list reads.
//
// The title is written by the model after the first answer (`ai_title`); if the
// provider is unreachable the conversation keeps a title derived from the first
// question, so the history is never a list of "Nueva conversación".

import { AIConfig, sendChat, type ChatMessage } from "../../core/aiClient.js";
import {
  ConversationStore,
  sanitizeTitle,
  type Conversation,
  type ConversationMeta,
} from "../../core/conversations.js";
import { ApiError } from "../../core/errors.js";
import { AppConfig } from "../appConfig.js";
import type { AppState } from "../appState.js";

const MAX_TITLE_INPUT = 4_000;

export const TITLE_PROMPT =
  "Eres quien titula conversaciones de estudio en NoteVault. Devuelve SOLO un " +
  "título de 3 a 6 palabras, en español, sin comillas, sin puntuación final y " +
  "sin la palabra «conversación». Debe describir el tema tratado.";

/**
 * A reasoning model spends part of `max_tokens` thinking before it writes
 * anything, and how much varies call to call (measured: 243–1811 characters for
 * this exact prompt). A budget that is too small returns an empty answer with
 * `finish_reason: "length"`, which is why the first budget is generous and a
 * second, larger one is tried before giving up on the model.
 */
const TITLE_BUDGETS = [1500, 2500];
/** Keep the request small: less input, less thinking before the title. */
const ANSWER_INPUT = 1_200;

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
        `Pregunta:\n${String(question || "").slice(0, MAX_TITLE_INPUT)}\n\n` +
        `Respuesta:\n${String(answer || "").slice(0, ANSWER_INPUT)}`,
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
    }),
    messages,
  );
  return sanitizeTitle(raw);
}

/** The title to keep when the model cannot be asked. */
export function titleFallback(question: string): string {
  const line = String(question || "").replace(/\s+/g, " ").trim();
  if (!line) return "Nueva conversación";
  return line.length > 60 ? `${line.slice(0, 57).trim()}…` : line;
}

export function conversationsApi(_app: AppState) {
  // The vault is deliberately untouched: this history is private to the app.
  const store = (): ConversationStore => new ConversationStore(AppConfig.get_conversations_dir());

  return {
    conversation_list(): ConversationMeta[] {
      return store().list();
    },

    conversation_get(id: string): Conversation {
      const conv = store().get(String(id || ""));
      if (!conv) throw new ApiError("Esa conversación ya no existe.");
      return conv;
    },

    conversation_save(
      id: string | null,
      messages: unknown,
      model = "",
      title = "",
    ): Conversation {
      return store().save(id ? String(id) : null, { messages, model, title });
    },

    conversation_rename(id: string, title: string): Conversation {
      const conv = store().rename(String(id || ""), String(title || ""));
      if (!conv) throw new ApiError("Esa conversación ya no existe.");
      return conv;
    },

    conversation_delete(id: string): Record<string, unknown> {
      return { ok: store().remove(String(id || "")) };
    },

    /**
     * Name the conversation after its first turn. Cosmetic: when the provider
     * cannot answer, the title falls back to the question and `fallback` says so
     * — it never fails the turn.
     */
    async ai_title(id: string, question: string, answer = ""): Promise<Record<string, unknown>> {
      const conv = store().get(String(id || ""));
      if (!conv) throw new ApiError("Esa conversación ya no existe.");
      const fallback = titleFallback(question);
      const cfg = AIConfig.fromDict(AppConfig.get_ai_config());
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
  };
}
