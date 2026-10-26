// Con qué MOTOR se regenera un tema: la IA de la app, Claude (API key o conexión) o un agente externo (Antigravity / Claude Code) por «handoff».
// Puro: solo mira la configuración de IA que ya existe en los ajustes (no guarda claves en ningún sitio nuevo).

import { ANTHROPIC, CLAUDE_CODE, AIConfig, PROVIDER_BY_KEY } from "../../core/aiClient.js";

export type RegenEngine = "app" | "claude" | "handoff";
export const REGEN_ENGINES: readonly RegenEngine[] = ["app", "claude", "handoff"];

export interface RegenEngineInfo {
  id: RegenEngine;
  label: string;
  available: boolean;
  /** por qué no se puede ("" si se puede) */
  reason: string;
  /** qué hace, para el diálogo */
  detail: string;
}

export interface RegenEnginesView {
  /** modo de la IA de la app: «puente» (sin API), «conexión» (Claude Code) o «API» */
  mode: "bridge" | "connection" | "api";
  provider: string;
  providerLabel: string;
  model: string;
  hasKey: boolean;
  /** el proveedor configurado es de Claude */
  isClaude: boolean;
  engines: RegenEngineInfo[];
  /** el que se propone si la persona no ha elegido ninguno */
  recommended: RegenEngine;
}

const keyless = (cfg: AIConfig): boolean => !cfg.info.needs_key;

/** ¿Puede la app llamar ya a su proveedor? (no es puente y, si pide clave, la tiene) */
export function appAiReady(cfg: AIConfig): string {
  if (cfg.is_bridge) return "La IA de la app está en modo puente (sin API): no puede regenerar sola.";
  if (!keyless(cfg) && !cfg.api_key) return `Falta la API key de ${cfg.info.label} en los ajustes de IA.`;
  return "";
}

/** ¿Es Claude el proveedor configurado y está listo? ("" si sí; si no, el motivo) */
export function claudeReady(cfg: AIConfig): string {
  if (cfg.provider === CLAUDE_CODE) return "";
  if (cfg.provider === ANTHROPIC) return cfg.api_key ? "" : "Falta la API key de Claude en los ajustes de IA.";
  return "El proveedor de IA configurado no es Claude. En los ajustes de IA elige «Claude (API key)» o «Claude Code» y pon la clave.";
}

export function regenEngines(cfg: AIConfig): RegenEnginesView {
  const appWhy = appAiReady(cfg);
  const claudeWhy = appWhy && cfg.is_bridge ? appWhy : claudeReady(cfg);
  const info = PROVIDER_BY_KEY[cfg.provider] ?? cfg.info;
  const mode: RegenEnginesView["mode"] = cfg.is_bridge ? "bridge" : cfg.provider === CLAUDE_CODE ? "connection" : "api";
  const where = cfg.is_bridge ? "" : ` (${info.label}${cfg.model ? ` · ${cfg.model}` : ""})`;
  const engines: RegenEngineInfo[] = [
    {
      id: "app",
      label: "Con la app",
      available: !appWhy,
      reason: appWhy,
      detail: `La app llama a su proveedor de IA${where} y escribe el resultado. Cada llamada cuenta contra tu cuota o tus tokens.`,
    },
    {
      id: "claude",
      label: "Con Claude (API key)",
      available: !claudeWhy,
      reason: claudeWhy,
      detail: cfg.provider === CLAUDE_CODE
        ? `Igual que «Con la app», pero exige que el proveedor sea Claude: ${info.label}${cfg.model ? ` · ${cfg.model}` : ""} (tu suscripción, sin API key).`
        : `Igual que «Con la app», pero exige que el proveedor sea Claude (API): ${info.label}${cfg.model ? ` · ${cfg.model}` : ""}. Cada llamada consume tokens de tu API key.`,
    },
    {
      id: "handoff",
      label: "Con Antigravity / Claude Code",
      available: true,
      reason: "",
      detail: "La app NO llama a ninguna IA: escribe un archivo de tarea completo en la vault (con las skills y el formato exacto) que le pasas a Antigravity o a Claude Code; al terminar, la app valida el resultado y, si falla, devuelve lo anterior. Funciona también con la IA en modo puente.",
    },
  ];
  const recommended: RegenEngine = !appWhy ? "app" : "handoff";
  return { mode, provider: cfg.provider, providerLabel: info.label, model: cfg.model, hasKey: Boolean(cfg.api_key), isClaude: cfg.provider === ANTHROPIC || cfg.provider === CLAUDE_CODE, engines, recommended };
}

/** Errores de motor para `study_topic_regenerate`: "" si el motor elegido puede correr aquí. */
export function engineBlockedReason(cfg: AIConfig, engine: RegenEngine): string {
  // «Con la app» solo se niega en modo puente (una clave que falte la reporta el propio proveedor al llamar)
  if (engine === "app") return cfg.is_bridge ? "El proveedor de IA está en modo puente; no se puede regenerar automáticamente. Elige «Con Antigravity / Claude Code»." : "";
  if (engine === "claude") return cfg.is_bridge ? "El proveedor de IA está en modo puente; no se puede regenerar automáticamente." : claudeReady(cfg);
  return "";
}
