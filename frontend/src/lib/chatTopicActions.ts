// Acciones de CONTENIDO del chat de notas («Generar tema completo»): usan el MISMO proceso seguro que los botones de «Temas por área»
// del Mentor (`study_topic_regenerate`: copia en `.trash/regenerar`, se devuelve si falla, turno de generación compartido) en vez de
// escribir a mano. Nunca cambian la carpeta, el nombre ni la posición del tema, así que la ruta del plan y su progreso siguen valiendo.
//
// Motor: el que se elige en el diálogo (RegenEngineChoice). «Con la app» / «Con Claude» → `api.studyTopicRegenerate(folder, what, true, engine)` + estado;
// «Antigravity / Claude Code» (o el modo puente) → una tarea por `study_topic_regenerate_handoff` que se enseña en el chat.

import { api } from "./bridge";
import { BUSY_MESSAGE } from "./planImpact";
import type { RegenEngineId, RegenHandoff, TopicRegenerateJob } from "./types";
import { useApp } from "../store/app";
import { useAssistant } from "../store/assistant";
import { useRegenEngine } from "../store/regenEngine";
import { useChatTopic } from "../store/chatTopic";

export type RegenStep = "theory" | "practice";
/** «Tema completo» = teoría + mapa (los rehace la teoría) y después la matriz de práctica. Los ejercicios se generan al practicar. */
export const FULL_TOPIC_STEPS: readonly RegenStep[] = ["theory", "practice"];

export interface TopicActionDeps {
  busy: () => Promise<boolean>;
  /** Pide confirmar (con el selector de motor). Tras un «sí», `engine()` dice con qué motor se hará. */
  confirm: (title: string, message: string, label: string) => Promise<boolean>;
  /** El motor elegido en el diálogo (por defecto, la IA de la app). */
  engine?: () => RegenEngineId;
  start: (folder: string, what: RegenStep, engine?: "app" | "claude") => Promise<{ jobId: string }>;
  /** Con el motor «agente externo»: crea la tarea en la vault (teoría + práctica + ejercicios, en una sola). */
  handoff?: (folder: string) => Promise<RegenHandoff>;
  /** Enseña la tarea en el chat (la frase para copiar y «Ya terminó — validar»). */
  showHandoff?: (h: RegenHandoff) => void;
  status: (jobId: string) => Promise<TopicRegenerateJob>;
  say: (text: string) => Promise<void>;
  toast: (kind: "info" | "error", message: string) => void;
  refresh: () => void;
  sleep: (ms: number) => Promise<void>;
  pollMs: number;
}

export const defaultTopicActionDeps: TopicActionDeps = {
  busy: () => api.assistantGenerationBusy().catch(() => false),
  confirm: (title, message, label) => useChatTopic.getState().ask(title, message, label),
  engine: () => useRegenEngine.getState().effective,
  start: (folder, what, engine = "app") => api.studyTopicRegenerate(folder, what, true, engine),
  handoff: (folder) => api.studyTopicRegenerateHandoff(folder, "all", true),
  showHandoff: (h) => {
    useRegenEngine.getState().putHandoff(h);
    useChatTopic.getState().showHandoff(h.id);
  },
  status: (jobId) => api.studyTopicRegenerateStatus(jobId),
  say: (text) => useAssistant.getState().addMessage("system", text),
  toast: (kind, message) => useApp.getState().toast(kind, message),
  refresh: () => useApp.getState().refreshTree(),
  sleep: (ms) => new Promise((ok) => setTimeout(ok, ms)),
  pollMs: 1500,
};

const STEP_NAME: Record<RegenStep, string> = { theory: "teoría y mapa", practice: "matriz de práctica" };

/** Espera a que termine un trabajo de regeneración. */
async function waitFor(jobId: string, deps: TopicActionDeps): Promise<TopicRegenerateJob> {
  for (;;) {
    const job = await deps.status(jobId);
    if (job.done) return job;
    await deps.sleep(deps.pollMs);
  }
}

/**
 * «Generar tema completo» desde el chat. Pide confirmación (lo que ya existe se reemplaza, con copia de seguridad), y si hay una
 * generación del Mentor en curso no compite: avisa. Devuelve `true` si todo salió bien.
 */
export async function generateTopicFromChat(folder: string, deps: TopicActionDeps = defaultTopicActionDeps): Promise<boolean> {
  const name = folder.split("/").pop() ?? folder;
  if (await deps.busy()) {
    deps.toast("error", BUSY_MESSAGE);
    return false;
  }
  const ok = await deps.confirm(
    `Generar «${name}»`,
    `Se genera la ${STEP_NAME.theory} y la ${STEP_NAME.practice} de «${name}» con el mismo proceso seguro del Mentor: lo que ya exista se copia a .trash/regenerar y se devuelve si algo falla. ` +
      "La carpeta, el nombre y el lugar del tema en tu plan no cambian.",
    "Generar",
  );
  if (!ok) return false;
  const engine = deps.engine?.() ?? "app";
  if (engine === "handoff") {
    if (!deps.handoff) return false;
    try {
      const h = await deps.handoff(folder);
      deps.showHandoff?.(h);
      await deps.say(`Tarea para tu agente creada para «${name}» (teoría, práctica y ejercicios). Pega la instrucción en Antigravity o Claude Code y, cuando termine, pulsa «Ya terminó — validar». Lo anterior quedó respaldado en .trash/regenerar.`);
      deps.toast("info", "Tarea creada: pásasela a tu agente.");
      return true;
    } catch (e) {
      deps.toast("error", (e as Error).message);
      await deps.say(`✗ No pude crear la tarea de «${name}»: ${(e as Error).message}`);
      return false;
    }
  }
  for (const step of FULL_TOPIC_STEPS) {
    let jobId: string;
    try {
      jobId = (await deps.start(folder, step, engine)).jobId;
    } catch (e) {
      deps.toast("error", (e as Error).message);
      await deps.say(`✗ No pude generar la ${STEP_NAME[step]} de «${name}»: ${(e as Error).message}`);
      return false;
    }
    await deps.say(`Generando la ${STEP_NAME[step]} de «${name}»…`);
    const job = await waitFor(jobId, deps);
    deps.refresh();
    if (job.error) {
      await deps.say(`✗ ${job.error}${job.backup ? ` (copia en ${job.backup})` : ""}`);
      deps.toast("error", job.error);
      return false;
    }
    await deps.say(`✓ ${STEP_NAME[step][0]!.toUpperCase()}${STEP_NAME[step].slice(1)} de «${name}» lista${job.backup && job.archived.length ? `; lo anterior quedó en ${job.backup}` : ""}.`);
  }
  deps.toast("info", `«${name}» generado.`);
  return true;
}
