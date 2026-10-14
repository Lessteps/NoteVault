// Ported from notevault_app/core/ai_client.py
//
// Two families of providers:
//   Conectados - the app talks to a model over HTTP (DeepSeek, LM Studio /
//                Ollama / OpenAI-compatible local server, or OpenAI /
//                Anthropic proper).
//   Puente     - no API: the app builds the full prompt, copies it to the
//                clipboard and opens Claude / ChatGPT / Antigravity.
//
// The Python original used the stdlib urllib so the frozen .exe stayed
// dependency free. In the Electron main process we use the global fetch.

import { CLAUDE_MODEL_ALIASES, DEFAULT_TIMEOUT_S, runClaudeCode } from "./claudeCode.js";
import { FILES_DIRECTIVE, FILES_MODE, VAULT_MODE_DIRECTIVES } from "./assistantModes.js";

// ── Provider catalogue ─────────────────────────────────────────────────────

export const DEEPSEEK = "deepseek";
export const LM_STUDIO = "lmstudio";
export const OLLAMA = "ollama";
export const OPENAI_COMPATIBLE = "openai_compatible";
export const OPENAI = "openai";
export const GEMINI = "gemini";
export const ANTHROPIC = "anthropic";
export const CLAUDE_CODE = "claude_code";
export const BRIDGE_CLAUDE = "bridge_claude";
export const BRIDGE_CHATGPT = "bridge_chatgpt";
export const BRIDGE_ANTIGRAVITY = "bridge_antigravity";

export const BRIDGE_PROVIDERS = new Set([BRIDGE_CLAUDE, BRIDGE_CHATGPT, BRIDGE_ANTIGRAVITY]);

export const BRIDGE_URLS: Record<string, string> = {
  [BRIDGE_CLAUDE]: "https://claude.ai/new",
  [BRIDGE_CHATGPT]: "https://chatgpt.com/",
  [BRIDGE_ANTIGRAVITY]: "https://antigravity.google/",
};

export interface ProviderInfo {
  key: string;
  label: string;
  hint: string;
  needs_key: boolean;
  needs_url: boolean;
  default_url: string;
  default_model: string;
  /** Offered in the model selector before (or instead of) asking the server. */
  default_models: string[];
  bridge: boolean;
}

function provider(
  key: string,
  label: string,
  hint: string,
  opts: Partial<ProviderInfo> = {},
): ProviderInfo {
  return {
    key,
    label,
    hint,
    needs_key: opts.needs_key ?? false,
    needs_url: opts.needs_url ?? false,
    default_url: opts.default_url ?? "",
    default_model: opts.default_model ?? "",
    default_models: opts.default_models ?? [],
    bridge: opts.bridge ?? false,
  };
}

export const PROVIDERS: ProviderInfo[] = [
  provider(
    DEEPSEEK,
    "DeepSeek (API key)",
    "API oficial de DeepSeek (compatible con OpenAI). Requiere una clave " +
      "sk-... y funciona con cualquier modelo de la cuenta " +
      "(GET /models los lista).",
    {
      needs_key: true,
      needs_url: true,
      default_url: "https://api.deepseek.com/v1",
      default_model: "deepseek-flash",
      default_models: ["deepseek-flash", "deepseek-v4-pro"],
    },
  ),
  provider(
    LM_STUDIO,
    "LM Studio (local)",
    "Servidor local de LM Studio. Sin API key: arranca el servidor en " +
      "LM Studio (pestaña Developer → Start Server).",
    { needs_url: true, default_url: "http://localhost:1234/v1", default_model: "local-model" },
  ),
  provider(
    OLLAMA,
    "Ollama (local)",
    "Servidor local de Ollama. Sin API key: ejecuta `ollama serve`.",
    { needs_url: true, default_url: "http://localhost:11434/v1", default_model: "llama3.1" },
  ),
  provider(
    OPENAI_COMPATIBLE,
    "Otro servidor compatible",
    "Cualquier endpoint que hable el formato OpenAI " +
      "(jan.ai, llama.cpp, vLLM, LiteLLM...).",
    { needs_url: true, default_url: "http://localhost:8000/v1", default_model: "local-model" },
  ),
  provider(
    OPENAI,
    "OpenAI (API key)",
    "API oficial de OpenAI. Requiere una clave que empieza por sk-...",
    {
      needs_key: true,
      needs_url: true,
      default_url: "https://api.openai.com/v1",
      default_model: "gpt-4o-mini",
      default_models: ["gpt-4o-mini", "gpt-4o"],
    },
  ),
  provider(
    GEMINI,
    "Google Gemini (API key)",
    "API oficial de Google Gemini (Google AI Studio). Requiere una clave que empieza por AIzaSy...",
    {
      needs_key: true,
      needs_url: true,
      default_url: "https://generativelanguage.googleapis.com/v1beta/openai",
      default_model: "models/gemini-3.5-flash-lite",
      default_models: [
        "models/gemini-3.5-flash-lite",
        "models/gemini-3.1-flash-lite",
        "models/gemini-3.5-flash",
        "models/gemini-3.8-flash",
      ],
    },
  ),
  provider(
    ANTHROPIC,
    "Claude (API key)",
    "API oficial de Anthropic. Requiere una clave sk-ant-...",
    {
      needs_key: true,
      needs_url: true,
      default_url: "https://api.anthropic.com/v1",
      default_model: "claude-sonnet-4-6",
      default_models: ["claude-sonnet-4-6", "claude-opus-4-6"],
    },
  ),
  provider(
    CLAUDE_CODE,
    "Claude Code (tu suscripción, sin API key)",
    "Usa tu sesión de Claude Code; no consume tokens de DeepSeek. Requiere tener Claude Code " +
      "instalado e iniciado sesión (ejecuta `claude` una vez y haz /login). Se usa como chat " +
      "puro: sin acceso a archivos ni comandos.",
    {
      default_model: "sonnet",
      default_models: [...CLAUDE_MODEL_ALIASES, "default"],
    },
  ),
  provider(
    BRIDGE_CLAUDE,
    "Claude web (sin API)",
    "Copia la pregunta con el contexto de la nota y abre claude.ai. " +
      "Pega la respuesta de vuelta en el panel.",
    { bridge: true },
  ),
  provider(
    BRIDGE_CHATGPT,
    "ChatGPT web (sin API)",
    "Copia la pregunta con el contexto de la nota y abre chatgpt.com. " +
      "Pega la respuesta de vuelta en el panel.",
    { bridge: true },
  ),
  provider(
    BRIDGE_ANTIGRAVITY,
    "Antigravity (sin API)",
    "Copia la pregunta con el contexto de la nota y abre Antigravity. " +
      "Pega la respuesta de vuelta en el panel.",
    { bridge: true },
  ),
];

export const PROVIDER_BY_KEY: Record<string, ProviderInfo> = Object.fromEntries(
  PROVIDERS.map((p) => [p.key, p]),
);

export const SYSTEM_PROMPT =
  "Eres el asistente de estudio y aprendizaje de NoteVault, una app de notas en " +
  "markdown. Respondes en español salvo que te pidan otro idioma. " +
  "Cuando generes contenido para una nota devuelve markdown limpio: " +
  "títulos con #, listas con -, negrita con **. No expliques lo que vas " +
  "a hacer, entrega directamente el contenido.";

export const AI_MODES: Record<string, string> = {
  tutor: "Modo Tutor: Explica con claridad pedagógica y sin jerga innecesaria. Prioriza la comprensión profunda.",
  socratic:
    "Modo Socrático: No des la respuesta directa inmediatamente. Guía mediante preguntas reflexivas y pistas progresivas para que el estudiante descubra la solución.",
  examiner:
    "Modo Examinador: Evalúa el conocimiento formulando preguntas rigurosas, desafiando supuestos y calificando la precisión de las respuestas.",
  evaluator:
    "Modo Evaluador: Analiza detalladamente el trabajo o respuesta entregada. Clasifica errores, evalúa criterios y proporciona retroalimentación constructiva.",
  generator:
    "Modo Generador: Crea ejercicios y problemas estructurados con restricciones estrictas de nivel, tema y objetivos formativos.",
  debugger:
    "Modo Depurador: Analiza fallos de código o razonamiento paso a paso, ayudando a aislar la causa raíz y verificar la corrección.",
};

export interface ChatMessage {
  role: string;
  content: string;
}

export class AIConfig {
  provider: string = DEEPSEEK;
  base_url: string = "https://api.deepseek.com/v1";
  model: string = "deepseek-flash";
  api_key: string = "";
  temperature: number = 0.7;
  max_tokens: number = 1500;
  include_note: boolean = true;
  /** Claude Code: ruta opcional de claude.exe y timeout (s) de cada llamada. */
  claude_path: string = "";
  claude_timeout_s: number = DEFAULT_TIMEOUT_S;

  constructor(init: Partial<AIConfig> = {}) {
    Object.assign(this, init);
  }

  get info(): ProviderInfo {
    return PROVIDER_BY_KEY[this.provider] ?? PROVIDERS[0]!;
  }

  get is_bridge(): boolean {
    return BRIDGE_PROVIDERS.has(this.provider);
  }

  toDict(): Record<string, unknown> {
    return {
      provider: this.provider,
      base_url: this.base_url,
      model: this.model,
      api_key: this.api_key,
      temperature: this.temperature,
      max_tokens: this.max_tokens,
      include_note: this.include_note,
      claude_path: this.claude_path,
      claude_timeout_s: this.claude_timeout_s,
    };
  }

  static fromDict(d: unknown): AIConfig {
    const cfg = new AIConfig();
    if (!d || typeof d !== "object") return cfg;
    for (const [k, v] of Object.entries(d as Record<string, unknown>)) {
      if (k in cfg) {
        (cfg as unknown as Record<string, unknown>)[k] = v;
      }
    }
    return cfg;
  }
}

export class AIError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AIError";
  }
}

// ── Transport ──────────────────────────────────────────────────────────────

/** Opciones de una llamada puntual: cancelarla de verdad (mata la petición o el proceso) y acotar su tiempo. */
export interface SendOpts {
  signal?: AbortSignal;
  /** tiempo máximo de esta llamada (por defecto el del proveedor) */
  timeoutMs?: number;
}

async function postJson(
  url: string,
  payload: unknown,
  headers: Record<string, string>,
  timeout = 120_000,
  signal?: AbortSignal,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const onAbort = (): void => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener("abort", onAbort, { once: true });
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new AIError(signal?.aborted ? "Cancelado." : "La petición tardó demasiado y se canceló.");
    }
    const reason = e instanceof Error ? e.message : String(e);
    throw new AIError(
      `No se pudo conectar con ${url}.\n${reason}\n\n` +
        "Si usas LM Studio u Ollama, comprueba que el servidor local esté encendido.",
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
  const text = await resp.text();
  if (!resp.ok) {
    throw new AIError(`HTTP ${resp.status}: ${text.slice(0, 400)}`);
  }
  return JSON.parse(text);
}

async function chatOpenAiStyle(cfg: AIConfig, messages: ChatMessage[], opts: SendOpts = {}): Promise<string> {
  const url = cfg.base_url.replace(/\/+$/, "") + "/chat/completions";
  const headers: Record<string, string> = {};
  if (cfg.api_key) headers["Authorization"] = `Bearer ${cfg.api_key}`;
  const payload = {
    model: cfg.model,
    messages,
    temperature: cfg.temperature,
    max_tokens: cfg.max_tokens,
    stream: false,
  };
  const data = (await postJson(url, payload, headers, opts.timeoutMs, opts.signal)) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new AIError(`Respuesta inesperada del servidor:\n${JSON.stringify(data).slice(0, 400)}`);
  }
  return content;
}

async function chatAnthropic(cfg: AIConfig, messages: ChatMessage[], opts: SendOpts = {}): Promise<string> {
  const url = cfg.base_url.replace(/\/+$/, "") + "/messages";
  if (!cfg.api_key) throw new AIError("Falta la API key de Anthropic.");
  const headers = { "x-api-key": cfg.api_key, "anthropic-version": "2023-06-01" };
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n");
  const convo = messages.filter((m) => m.role !== "system");
  const payload = {
    model: cfg.model,
    system,
    messages: convo,
    max_tokens: cfg.max_tokens,
    temperature: cfg.temperature,
  };
  const data = (await postJson(url, payload, headers, opts.timeoutMs, opts.signal)) as { content?: { text?: string }[] };
  const parts = data?.content;
  if (!Array.isArray(parts)) {
    throw new AIError(`Respuesta inesperada de Anthropic:\n${JSON.stringify(data).slice(0, 400)}`);
  }
  return parts.map((p) => p.text ?? "").join("");
}

export async function sendChat(cfg: AIConfig, messages: ChatMessage[], opts: SendOpts = {}): Promise<string> {
  if (cfg.is_bridge) {
    throw new AIError(
      "Este proveedor funciona en modo puente: copia el prompt y pega la respuesta manualmente.",
    );
  }
  if (opts.signal?.aborted) throw new AIError("Cancelado.");
  if (cfg.provider === CLAUDE_CODE) {
    // al cancelar o vencer el tiempo se MATA el proceso de Claude Code (no solo se descarta el resultado)
    const out = await runClaudeCode(
      opts.timeoutMs ? { model: cfg.model, claude_path: cfg.claude_path, claude_timeout_s: Math.max(1, Math.ceil(opts.timeoutMs / 1000)) } : cfg,
      messages,
      { signal: opts.signal },
    );
    if (opts.signal?.aborted) throw new AIError("Cancelado.");
    return out;
  }
  if (cfg.provider === ANTHROPIC) return chatAnthropic(cfg, messages, opts);
  return chatOpenAiStyle(cfg, messages, opts);
}

/** Ask an OpenAI-compatible server which models it has loaded. */
export async function listModels(cfg: AIConfig): Promise<string[]> {
  if (cfg.provider === CLAUDE_CODE) return [...CLAUDE_MODEL_ALIASES, "default"];
  if (cfg.is_bridge || cfg.provider === ANTHROPIC) return [];
  const url = cfg.base_url.replace(/\/+$/, "") + "/models";
  const headers: Record<string, string> = {};
  if (cfg.api_key) headers["Authorization"] = `Bearer ${cfg.api_key}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  let data: { data?: { id?: string }[] };
  try {
    const resp = await fetch(url, { headers, signal: controller.signal });
    const text = await resp.text();
    data = JSON.parse(text);
  } catch (e) {
    throw new AIError(e instanceof Error ? e.message : String(e));
  } finally {
    clearTimeout(timer);
  }
  const out: string[] = [];
  for (const item of data?.data ?? []) {
    if (item?.id) out.push(item.id);
  }
  return out.sort();
}

// ── Streaming ──────────────────────────────────────────────────────────────

export interface StreamHandlers {
  /** An answer token: what the user reads. */
  onDelta?: (text: string) => void;
  /** A reasoning token (DeepSeek's `reasoning_content`), shown collapsed. */
  onThinking?: (text: string) => void;
  /** Cancels the request; the promise resolves with the text received so far. */
  signal?: AbortSignal;
}

/** One SSE line -> the token it carries, or null when it carries none. */
function tokenFromSse(line: string): { text?: string; thinking?: string } | null {
  if (!line.startsWith("data:")) return null; // `event:`/`id:` lines and blanks
  const payload = line.slice(5).trim();
  if (!payload || payload === "[DONE]") return null;
  let obj: {
    choices?: { delta?: { content?: string | null; reasoning_content?: string | null } }[];
    type?: string;
    delta?: { text?: string; thinking?: string };
  };
  try {
    obj = JSON.parse(payload);
  } catch {
    return null; // a partial/keep-alive frame; the next read finishes it
  }
  const delta = obj.choices?.[0]?.delta;
  if (delta?.content) return { text: delta.content };
  if (delta?.reasoning_content) return { thinking: delta.reasoning_content };
  if (obj.type === "content_block_delta") {
    if (obj.delta?.text) return { text: obj.delta.text };
    if (obj.delta?.thinking) return { thinking: obj.delta.thinking };
  }
  return null;
}

/**
 * Chat with token-by-token delivery over SSE. Returns the whole answer; if the
 * caller aborts, it returns the part received before the abort instead of
 * throwing, so a stopped answer is still a usable answer.
 */
export async function streamChat(
  cfg: AIConfig,
  messages: ChatMessage[],
  handlers: StreamHandlers = {},
): Promise<string> {
  if (cfg.is_bridge) {
    throw new AIError(
      "Este proveedor funciona en modo puente: copia el prompt y pega la respuesta manualmente.",
    );
  }
  if (cfg.provider === CLAUDE_CODE) return runClaudeCode(cfg, messages, handlers);
  const anthropic = cfg.provider === ANTHROPIC;
  const base = cfg.base_url.replace(/\/+$/, "");
  const headers: Record<string, string> = { Accept: "text/event-stream" };
  let url: string;
  let payload: unknown;
  if (anthropic) {
    if (!cfg.api_key) throw new AIError("Falta la API key de Anthropic.");
    url = base + "/messages";
    headers["x-api-key"] = cfg.api_key;
    headers["anthropic-version"] = "2023-06-01";
    payload = {
      model: cfg.model,
      system: messages.filter((m) => m.role === "system").map((m) => m.content).join("\n"),
      messages: messages.filter((m) => m.role !== "system"),
      max_tokens: cfg.max_tokens,
      temperature: cfg.temperature,
      stream: true,
    };
  } else {
    if (cfg.api_key) headers["Authorization"] = `Bearer ${cfg.api_key}`;
    url = base + "/chat/completions";
    payload = {
      model: cfg.model,
      messages,
      temperature: cfg.temperature,
      max_tokens: cfg.max_tokens,
      stream: true,
    };
  }

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(payload),
      signal: handlers.signal,
    });
  } catch (e) {
    if (handlers.signal?.aborted) return "";
    const reason = e instanceof Error ? e.message : String(e);
    throw new AIError(
      `No se pudo conectar con ${url}.\n${reason}\n\n` +
        "Si usas LM Studio u Ollama, comprueba que el servidor local esté encendido.",
    );
  }
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new AIError(`HTTP ${resp.status}: ${text.slice(0, 400)}`);
  }
  if (!resp.body) throw new AIError("El servidor no devolvió un flujo de datos.");

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let answer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).replace(/\r$/, "");
        buffer = buffer.slice(nl + 1);
        if (line) {
          const token = tokenFromSse(line);
          if (token?.text) {
            answer += token.text;
            handlers.onDelta?.(token.text);
          } else if (token?.thinking) {
            handlers.onThinking?.(token.thinking);
          }
        }
      }
    }
  } catch (e) {
    // A cancel lands here as an AbortError on the reader: keep what we got.
    if (!handlers.signal?.aborted) {
      throw new AIError(e instanceof Error ? e.message : String(e));
    }
  }
  return answer;
}

// ── Prompt building ────────────────────────────────────────────────────────

export interface BuildMessagesOpts {
  note_title?: string;
  note_body?: string;
  selection?: string;
  mode?: string;
  workspace_prompt?: string;
}

/** history is a list of {role, content} already exchanged. */
export function buildMessages(
  cfg: AIConfig,
  history: ChatMessage[],
  question: string,
  opts: BuildMessagesOpts = {},
): ChatMessage[] {
  const noteTitle = opts.note_title ?? "";
  const noteBody = opts.note_body ?? "";
  const selection = opts.selection ?? "";
  const mode = opts.mode ?? "tutor";
  const workspacePrompt = opts.workspace_prompt ?? "";

  let sysContent = SYSTEM_PROMPT;
  if (workspacePrompt) sysContent += `\n\nContexto de disciplina:\n${workspacePrompt}`;
  // The vault modes (syllabus, canvas, new topic) carry the file-action protocol.
  const directive = AI_MODES[mode] ?? (VAULT_MODE_DIRECTIVES as Record<string, string>)[mode] ?? (mode === FILES_MODE ? FILES_DIRECTIVE : undefined);
  if (directive) sysContent += `\n\nDirectiva de modo activo:\n${directive}`;

  const messages: ChatMessage[] = [{ role: "system", content: sysContent }];

  let context = "";
  if (cfg.include_note && (noteTitle || noteBody)) {
    let body = noteBody.trim();
    if (body.length > 12000) body = body.slice(0, 12000) + "\n\n[...nota recortada...]";
    context = `Nota abierta: «${noteTitle}»\n\n\`\`\`markdown\n${body}\n\`\`\``;
  }
  if (selection.trim()) {
    context += `\n\nFragmento seleccionado:\n\`\`\`\n${selection.trim()}\n\`\`\``;
  }
  if (context) {
    messages.push({ role: "system", content: "Contexto de la app:\n" + context });
  }

  messages.push(...history);
  messages.push({ role: "user", content: question });
  return messages;
}

/** Flatten the conversation into one block for the clipboard. */
export function buildBridgePrompt(messages: ChatMessage[]): string {
  const parts: string[] = [];
  for (const m of messages) {
    if (m.role === "system") parts.push(m.content);
    else if (m.role === "user") parts.push(`[Usuario]\n${m.content}`);
    else parts.push(`[Asistente]\n${m.content}`);
  }
  return parts.join("\n\n---\n\n");
}

// snake_case aliases (parity with the Python API used across the app)
export const build_messages = buildMessages;
export const build_bridge_prompt = buildBridgePrompt;
export const send_chat = sendChat;
export const stream_chat = streamChat;
export const list_models = listModels;
