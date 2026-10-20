// Coach de Entrenamiento IA para el módulo de Ejercicio.
//
// Mantiene conversaciones 100% aisladas del asistente de Notas en su propio
// directorio de almacenamiento, e inyecta dinámicamente el perfil corporal,
// rutinas y pesajes del vault en el System Prompt.

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
import { addDays, todayIso, weekday } from "../../core/dates.js";
import { ApiError } from "../../core/errors.js";
import { buildCoachSystemPrompt, type ExercisePerformanceEntry } from "../../core/exerciseCoachPrompt.js";
import type { BodyProfile, ExerciseGoal } from "../../lib/exerciseTypes.js";
import type { LibraryUserEntry } from "../../lib/libraryTypes.js";
import { AppConfig } from "../appConfig.js";
import type { AppState } from "../appState.js";
import { DAY_KEYS } from "./exercise.js";

export interface CoachContextResult {
  profile: BodyProfile;
  exercisesCount: number;
  currentWeight: number | null;
  goal: ExerciseGoal;
  recentSessionsCount?: number;
  customLibraryCount?: number;
}

const MAX_HISTORY = 40;
const MAX_TEXT = 60_000;
const TITLE_PROMPT =
  "Eres quien titula conversaciones con el Coach de Entrenamiento en NoteVault. " +
  "Devuelve SOLO un título de 3 a 6 palabras, en español, sin comillas, sin puntuación final " +
  "y sin la palabra «conversación». Debe describir el tema o consulta de entrenamiento.";

const TITLE_BUDGETS = [1500, 2500];

function titleFallback(question: string): string {
  const line = String(question || "")
    .trim()
    .split(/[\r\n]+/)[0]
    ?.trim();
  if (!line) return "Consulta de entrenamiento";
  return sanitizeTitle(line) || "Consulta de entrenamiento";
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

export function exerciseCoachApi(app: AppState) {
  const aiCfg = (): AIConfig => AIConfig.fromDict(AppConfig.get_ai_config());
  const store = (): ConversationStore =>
    new ConversationStore(AppConfig.get_exercise_coach_conversations_dir());

  const streams = new Map<string, AbortController>();

  const emit = (data: Record<string, unknown>): void => {
    const win = app.window as
      | { webContents?: { send: (channel: string, payload: unknown) => void } }
      | null;
    win?.webContents?.send("nv-ai-stream", data);
  };

  return {
    ex_coach_context(): CoachContextResult {
      const mgr = app.mgrs().exercise;
      const profile = mgr.getProfile();
      const exercises = mgr.exercises();
      const history = [...profile.weight_history].sort((a, b) => a.date.localeCompare(b.date));
      const lastWeight = history.length ? history[history.length - 1]!.weight : null;

      let recentSessionsCount = 0;
      const today = new Date();
      try {
        for (let i = 0; i < 14; i++) {
          const d = addDays(today, -i);
          const log = mgr.getLog(d);
          const hasDone = Object.values(log.entries).some((e: any) => e?.done || (e?.weight > 0 && e?.reps > 0));
          if (hasDone) recentSessionsCount += 1;
        }
      } catch {
        /* sin logs */
      }

      let customLibraryCount = 0;
      try {
        customLibraryCount = app.mgrs().library.entries().length;
      } catch {
        /* sin biblioteca propia */
      }

      return {
        profile,
        exercisesCount: exercises.length,
        currentWeight: lastWeight,
        goal: profile.goal,
        recentSessionsCount,
        customLibraryCount,
      };
    },

    ex_coach_conversations(): ConversationMeta[] {
      return store().list();
    },

    ex_coach_conversation_get(id: string): Conversation | null {
      return store().get(String(id || ""));
    },

    ex_coach_conversation_save(
      id: string | null,
      messages: unknown,
      model = "",
      title = "",
    ): Conversation {
      return store().save(id ? String(id) : null, { messages, model, title });
    },

    ex_coach_conversation_rename(id: string, title: string): Conversation {
      const conv = store().rename(String(id || ""), String(title || ""));
      if (!conv) throw new ApiError("Esa conversación del coach ya no existe.");
      return conv;
    },

    ex_coach_conversation_delete(id: string): Record<string, unknown> {
      return { ok: store().remove(String(id || "")) };
    },

    async ex_coach_ai_title(
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

    async ex_coach_chat_stream(
      streamId: string,
      history: unknown,
      question: string,
    ): Promise<Record<string, unknown>> {
      const id = String(streamId || "");
      if (!id) throw new ApiError("ID de stream requerido.");
      if (!Array.isArray(history)) throw new ApiError("Historial inválido.");
      const q = String(question || "").trim().slice(0, MAX_TEXT);
      if (!q) throw new ApiError("Escribe una consulta de entrenamiento.");

      const mgr = app.mgrs().exercise;
      const profile = mgr.getProfile();
      const exercises = mgr.exercises();
      let streak = 0;
      const today = new Date();
      try {
        const dueIds = (d: Date) => mgr.exercisesForDay(DAY_KEYS[weekday(d)]!).map((e) => e.id);
        for (let i = 0; i < 30; i++) {
          const d = addDays(today, -i);
          const due = dueIds(d);
          if (!due.length) continue;
          const log = mgr.getLog(d);
          const done = due.filter((id) => log.isDone(id)).length;
          if (done > 0) streak += 1;
          else if (i > 0) break;
        }
      } catch {
        /* sin racha calculada */
      }

      // Progreso profundo: recopilar últimas cargas levantadas por ejercicio y sesiones recientes
      const recentPerformances: ExercisePerformanceEntry[] = [];
      const seenExercises = new Set<string>();
      let recentCompletedSessions = 0;

      try {
        for (let i = 0; i < 30; i++) {
          const d = addDays(today, -i);
          const log = mgr.getLog(d);
          const entries = log.entries;
          let dayHasDone = false;

          for (const [exId, entry] of Object.entries(entries)) {
            const e = entry as { done?: boolean; weight?: number; reps?: number };
            if (e && (e.done || (Number(e.weight) > 0 && Number(e.reps) > 0))) {
              dayHasDone = true;
              if (!seenExercises.has(exId)) {
                seenExercises.add(exId);
                const exDef = exercises.find((item) => item.id === exId);
                const name = String(exDef?.name || exId);
                const weight = Number(e.weight) || 0;
                const reps = Number(e.reps) || 0;
                const e1rm = weight > 0 && reps > 0 ? Math.round(weight * (1 + reps / 30) * 10) / 10 : undefined;
                recentPerformances.push({
                  exerciseId: exId,
                  name,
                  date: todayIso(d),
                  weight,
                  reps,
                  e1rm,
                });
              }
            }
          }
          if (dayHasDone && i < 14) {
            recentCompletedSessions += 1;
          }
        }
      } catch {
        /* sin historial de cargas */
      }

      // Biblioteca: catálogo Workout Guide + biblioteca propia
      const librarySummary: string[] = [
        "Catálogo Workout Guide: 302 ejercicios con biomecánica, músculos (pecho, espalda, hombros, bíceps, tríceps, cuádriceps, isquiotibiales, glúteos, gemelos, core) y equipo (barra, mancuernas, polea, máquina, peso corporal).",
      ];
      try {
        const customLib: LibraryUserEntry[] = app.mgrs().library.entries();
        if (customLib.length > 0) {
          const sample = customLib.slice(0, 8).map((c: LibraryUserEntry) => c.name).join(", ");
          librarySummary.push(`Ejercicios personalizados en tu biblioteca (${customLib.length}): ${sample}.`);
        }
      } catch {
        /* sin biblioteca propia */
      }

      // Volumen muscular semanal de la rutina y cumplimiento
      const weeklyVolume: import("../../core/exerciseCoachPrompt.js").WeeklyVolumeReportItem[] = [];
      try {
        const todayObj = new Date();
        const mondayOffset = weekday(todayObj);
        const monday = addDays(todayObj, -mondayOffset);
        const doneExIds = new Set<string>();

        for (let i = 0; i <= 6; i++) {
          const dayDate = addDays(monday, i);
          const log = mgr.getLog(dayDate);
          if (log && log.entries) {
            for (const [id, e] of Object.entries(log.entries)) {
              if ((e as any)?.done) doneExIds.add(id);
            }
          }
        }

        const buckets: Record<string, { planned: number; done: number }> = {
          Pecho: { planned: 0, done: 0 },
          Espalda: { planned: 0, done: 0 },
          Piernas: { planned: 0, done: 0 },
          Hombros: { planned: 0, done: 0 },
          Brazos: { planned: 0, done: 0 },
          Core: { planned: 0, done: 0 },
        };

        const inferGroups = (name: string, muscles?: any): string[] => {
          const res = new Set<string>();
          const mList: string[] = [];
          if (Array.isArray(muscles)) mList.push(...muscles);
          else if (muscles && typeof muscles === "object") {
            if (Array.isArray(muscles.primary)) mList.push(...muscles.primary);
            if (Array.isArray(muscles.secondary)) mList.push(...muscles.secondary);
          }
          for (const m of mList) {
            if (m === "pectoral") res.add("Pecho");
            if (["lats", "trapezius", "lower-back"].includes(m)) res.add("Espalda");
            if (["quads", "hamstrings", "glutes", "calves", "adductors", "abductors"].includes(m)) res.add("Piernas");
            if (["deltoid-front", "deltoid-rear", "neck"].includes(m)) res.add("Hombros");
            if (["biceps", "triceps", "forearm"].includes(m)) res.add("Brazos");
            if (["abs", "obliques"].includes(m)) res.add("Core");
          }
          if (res.size > 0) return Array.from(res);
          const n = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          if (/banca|pecho|fondos|apertura|flexion/.test(n)) res.add("Pecho");
          if (/espalda|remo|dominada|jalon|dorsal|peso muerto/.test(n)) res.add("Espalda");
          if (/sentadilla|prensa|cuadricep|femoral|pierna|gemelo|zancada|gluteo|hip thrust/.test(n)) res.add("Piernas");
          if (/hombro|militar|elevacion|deltoide/.test(n)) res.add("Hombros");
          if (/bicep|tricep|curl|martillo|frances/.test(n)) res.add("Brazos");
          if (/abdomen|abs|plancha|crunch|core/.test(n)) res.add("Core");
          if (res.size === 0) res.add("Pecho");
          return Array.from(res);
        };

        for (const ex of exercises) {
          const sr = String(ex.series_reps || "");
          const match = sr.match(/^(\d+)\s*[*xX×]\s*\d+/) || sr.match(/^(\d+)/);
          const sets = match ? Number(match[1]) : 3;
          const grps = inferGroups(String(ex.name || ""), (ex as any).muscles);
          const isDone = doneExIds.has(ex.id);
          for (const g of grps) {
            if (buckets[g]) {
              buckets[g]!.planned += sets;
              if (isDone) buckets[g]!.done += sets;
            }
          }
        }

        for (const [group, b] of Object.entries(buckets)) {
          let levelLabel = "Mantenimiento (<6 series)";
          if (b.planned >= 20) levelLabel = "Volumen alto (>20 series)";
          else if (b.planned >= 10) levelLabel = "Óptimo hipertrofia (10-20 series)";
          else if (b.planned >= 6) levelLabel = "Estímulo base (6-9 series)";

          weeklyVolume.push({
            group,
            plannedSets: b.planned,
            completedSets: b.done,
            levelLabel,
          });
        }
      } catch {
        /* sin volumen */
      }

      const systemPrompt = buildCoachSystemPrompt({
        profile,
        exercises: exercises.map((e) => ({
          day: String(e.day || ""),
          name: String(e.name || ""),
          series_reps: String(e.series_reps || ""),
          rest: String(e.rest || ""),
        })),
        streak,
        recentPerformances,
        recentCompletedSessions,
        librarySummary,
        weeklyVolume,
      });

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

    ex_coach_chat_cancel(streamId: string): Record<string, unknown> {
      const id = String(streamId || "");
      const controller = streams.get(id);
      if (!controller) return { ok: false };
      controller.abort();
      streams.delete(id);
      return { ok: true };
    },
  };
}
