// Asesor Nutricional IA para el módulo de Alimentación.
//
// Mantiene conversaciones 100% aisladas del asistente de Notas, Mentor, Ejercicio y Finanzas
// en su propio directorio de almacenamiento, e inyecta dinámicamente el diario de hoy,
// macros acumulados, despensa y perfil de entrenamiento en el System Prompt.

import {
  AIConfig,
  AIError,
  BRIDGE_URLS,
  buildBridgePrompt,
  sendChat,
  sendMultimodalChat,
  streamChat,
  type ChatMessage,
  type MultimodalChatMessage,
} from "../../core/aiClient.js";
import {
  ConversationStore,
  sanitizeTitle,
  type Conversation,
  type ConversationMeta,
} from "../../core/conversations.js";
import { todayIso } from "../../core/dates.js";
import { ApiError } from "../../core/errors.js";
import { buildNutritionCoachSystemPrompt } from "../../core/nutritionCoachPrompt.js";
import type { EstimatedDishResult } from "../../lib/nutritionTypes.js";
import {
  ESTIMATE_DISH_SYSTEM_PROMPT,
  parseEstimatedDishResponse,
} from "../../core/nutritionMealEstimator.js";
import {
  SCAN_LABEL_SYSTEM_PROMPT,
  parseScannedLabelResponse,
} from "../../core/nutritionLabelScanner.js";
import type { ScannedNutritionLabel } from "../../lib/nutritionTypes.js";
import { AppConfig } from "../appConfig.js";
import type { AppState } from "../appState.js";

const MAX_HISTORY = 40;
const MAX_TEXT = 60_000;
const TITLE_PROMPT =
  "Eres quien titula conversaciones con el Asesor Nutricional en NoteVault. " +
  "Devuelve SOLO un título de 3 a 6 palabras, en español, sin comillas, sin puntuación final " +
  "y sin la palabra «conversación». Debe describir la consulta nutricional o plato.";

const TITLE_BUDGETS = [1500, 2500];

function titleFallback(question: string): string {
  const line = String(question || "")
    .trim()
    .split(/[\r\n]+/)[0]
    ?.trim();
  if (!line) return "Consulta nutricional";
  return sanitizeTitle(line) || "Consulta nutricional";
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
        `Respuesta del asesor:\n${String(answer || "").slice(0, 1200)}`,
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

export function nutritionCoachApi(app: AppState) {
  const aiCfg = (): AIConfig => AIConfig.fromDict(AppConfig.get_ai_config());
  const store = (): ConversationStore =>
    new ConversationStore(AppConfig.get_nutrition_coach_conversations_dir());

  const streams = new Map<string, AbortController>();

  const emit = (data: Record<string, unknown>): void => {
    const win = app.window as
      | { webContents?: { send: (channel: string, payload: unknown) => void } }
      | undefined;
    try {
      win?.webContents?.send("nv-ai-stream", data);
    } catch {
      /* renderer cerrado */
    }
  };

  const getContextData = () => {
    const today = todayIso();
    const nm = app.mgrs().nutrition;
    const em = app.mgrs().exercise;

    const summary = nm.daySummary(today);
    const targets = nm.settings();
    const foods = nm.foods();
    const foodsSummary = foods.map(
      (f) => `${f.name} (${f.serving_size} ${f.serving_unit} = ${f.calories} kcal, ${f.protein}g P, ${f.carbs}g C, ${f.fat}g G)`,
    );

    const profile = em.getProfile();
    const weightHistory = profile.weight_history || [];
    const latestWeight = weightHistory.length > 0 ? weightHistory[weightHistory.length - 1]!.weight : null;
    const nutriProfile = nm.getProfile();

    return {
      date: today,
      summary,
      targets,
      foodsSummary,
      nutriProfile,
      exerciseProfile: {
        goal: profile.goal || "salud",
        goal_note: profile.goal_note,
        weight: latestWeight,
        gender: profile.gender,
        age: profile.age,
      },
    };
  };

  return {
    nutri_coach_context() {
      const data = getContextData();
      return {
        date: data.date,
        caloriesRemaining: data.targets.calories - data.summary.totals.calories,
        targetCalories: data.targets.calories,
        consumedCalories: data.summary.totals.calories,
        consumedProtein: data.summary.totals.protein,
        targetProtein: data.targets.protein_g,
        consumedWater: data.summary.totals.water_ml,
        targetWater: data.targets.water_ml,
        goal: data.nutriProfile.goal || data.exerciseProfile.goal,
        weight: data.nutriProfile.weight || data.exerciseProfile.weight,
        dietaryRestrictions: data.nutriProfile.dietary_restrictions,
        foodsCount: data.foodsSummary.length,
      };
    },

    async nutri_coach_chat_stream(answerId: unknown, history: unknown, question: unknown) {
      const id = String(answerId || "").trim();
      const q = String(question || "").trim();
      if (!id) throw new ApiError("ID de respuesta requerido.");
      if (!q) throw new ApiError("Pregunta requerida.");

      const cfg = aiCfg();
      const ctx = getContextData();
      const systemPrompt = buildNutritionCoachSystemPrompt(ctx);

      const msgs: ChatMessage[] = [{ role: "system", content: systemPrompt }];

      if (Array.isArray(history)) {
        for (const item of history.slice(-MAX_HISTORY)) {
          if (!item || typeof item !== "object") continue;
          const r = (item as any).role;
          const c = String((item as any).content || "").slice(0, MAX_TEXT);
          if ((r === "user" || r === "assistant") && c.trim()) {
            msgs.push({ role: r, content: c });
          }
        }
      }

      msgs.push({ role: "user", content: q.slice(0, MAX_TEXT) });

      if (cfg.is_bridge) {
        const url = BRIDGE_URLS[cfg.provider] || "https://chatgpt.com";
        const prompt = buildBridgePrompt(msgs);
        return {
          bridge: true,
          url,
          prompt,
          label: cfg.provider.toUpperCase(),
        };
      }

      const controller = new AbortController();
      streams.set(id, controller);
      emit({ id, type: "start" });

      try {
        const reply = await streamChat(cfg, msgs, {
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

    nutri_coach_chat_cancel(id: unknown) {
      const key = String(id || "");
      const c = streams.get(key);
      if (c) {
        c.abort();
        streams.delete(key);
        return { ok: true };
      }
      return { ok: false };
    },

    nutri_coach_conversations(): ConversationMeta[] {
      return store().list();
    },

    nutri_coach_conversation_get(id: unknown): Conversation | null {
      const key = String(id || "").trim();
      if (!key) return null;
      return store().get(key);
    },

    nutri_coach_conversation_save(
      id: unknown,
      messages: unknown,
      model: unknown,
      title: unknown,
    ): Conversation {
      const s = store();
      const existingId = id ? String(id).trim() : null;
      const cleanTitle = title ? String(title).trim() : undefined;
      const cleanModel = model ? String(model).trim() : undefined;
      const cleanMsgs = Array.isArray(messages) ? (messages as any[]) : [];

      return s.save(existingId, {
        title: cleanTitle,
        model: cleanModel,
        messages: cleanMsgs,
      });
    },

    nutri_coach_conversation_rename(id: unknown, title: unknown): { ok: boolean; title: string } {
      const key = String(id || "").trim();
      const t = sanitizeTitle(String(title || ""));
      if (!key) throw new ApiError("ID de conversación requerido.");
      if (!t) throw new ApiError("Título inválido.");
      const conv = store().rename(key, t);
      if (!conv) throw new ApiError("No se encontró la conversación.");
      return { ok: true, title: t };
    },

    nutri_coach_conversation_delete(id: unknown): { ok: boolean } {
      const key = String(id || "").trim();
      if (!key) throw new ApiError("ID de conversación requerido.");
      const ok = store().remove(key);
      return { ok };
    },

    async nutri_coach_ai_title(id: unknown, question: unknown, answer: unknown): Promise<{ title: string }> {
      const q = String(question || "").trim();
      const a = String(answer || "").trim();
      const key = String(id || "").trim();
      if (!key) throw new ApiError("ID de conversación requerido.");

      const cfg = aiCfg();
      if (!cfg.api_key || cfg.is_bridge) {
        return { title: titleFallback(q) };
      }

      for (const budget of TITLE_BUDGETS) {
        try {
          const t = await requestTitle(cfg, q, a, budget);
          if (t) {
            store().rename(key, t);
            return { title: t };
          }
        } catch {
          /* fallback al siguiente presupuesto */
        }
      }
      const fallback = titleFallback(q);
      store().rename(key, fallback);
      return { title: fallback };
    },

    /**
     * Estima calorías y macros de un plato en lenguaje natural utilizando el modelo de IA configurado.
     */
    async nutri_estimate_dish(description: unknown): Promise<EstimatedDishResult> {
      const text = String(description || "").trim();
      if (!text) {
        throw new ApiError("La descripción del plato o comida es obligatoria.");
      }

      const cfg = aiCfg();
      if (cfg.is_bridge) {
        throw new ApiError("La estimación automática de platos requiere un proveedor conectado (DeepSeek, OpenAI, Ollama, etc.), no en modo Puente.");
      }

      const messages: ChatMessage[] = [
        { role: "system", content: ESTIMATE_DISH_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Estima de forma realista este plato o comida:\n"${text.slice(0, 500)}"`,
        },
      ];

      const raw = await sendChat(
        new AIConfig({
          provider: cfg.provider,
          base_url: cfg.base_url,
          model: cfg.model,
          api_key: cfg.api_key,
          temperature: 0.2,
          max_tokens: 1500,
          include_note: false,
          claude_path: cfg.claude_path,
        }),
        messages,
      );

      return parseEstimatedDishResponse(raw, text);
    },

    /**
     * Escanea una fotografía de una etiqueta nutricional por visión multimodal,
     * extrae los macros y emite un veredicto personalizado según el perfil del usuario.
     */
    async nutri_scan_label(dataUrl: unknown): Promise<ScannedNutritionLabel> {
      const img = String(dataUrl || "").trim();
      if (!img) {
        throw new ApiError("La imagen de la etiqueta es obligatoria.");
      }

      const cfg = aiCfg();
      if (cfg.is_bridge) {
        throw new ApiError("El escáner visual requiere un proveedor conectado con visión (Gemini, OpenAI, etc.), no en modo Puente.");
      }

      const nm = app.mgrs().nutrition;
      const profile = nm.getProfile();
      const settings = nm.settings();

      let userContext = `PERFIL DEL USUARIO:\n`;
      userContext += `- Objetivo: ${profile.goal || "salud_general"}\n`;
      if (profile.weight) userContext += `- Peso: ${profile.weight} kg\n`;
      userContext += `- Restricciones / Alimentos contraindicados: ${profile.dietary_restrictions || "Ninguno"}\n`;
      userContext += `- Meta calórica diaria: ${settings.calories} kcal (Proteína: ${settings.protein_g}g)\n`;

      const messages: MultimodalChatMessage[] = [
        { role: "system", content: SCAN_LABEL_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `${userContext}\nLee la tabla nutricional de la imagen, extrae porción y macros, y dime con honestidad si le recomiendas este alimento al usuario para su perfil y objetivo:`,
            },
            { type: "image_url", image_url: { url: img } },
          ],
        },
      ];

      const raw = await sendMultimodalChat(
        new AIConfig({
          provider: cfg.provider,
          base_url: cfg.base_url,
          model: cfg.model,
          api_key: cfg.api_key,
          temperature: 0.1,
          max_tokens: 1500,
          include_note: false,
          claude_path: cfg.claude_path,
        }),
        messages,
      );

      return parseScannedLabelResponse(raw);
    },
  };
}
