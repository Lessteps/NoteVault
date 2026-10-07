// Proveedor "Claude Code": ejecuta el CLI `claude` en modo no interactivo y usa
// la sesión local del usuario (suscripción), sin API key.
//
// Aislamiento (probado empíricamente con claude 2.1.267, ver informe):
//   --tools ""                chat puro: sin Read/Write/Bash ni ninguna herramienta.
//   --setting-sources ""      no carga settings de usuario/proyecto: ni hooks
//                             (SessionStart/UserPromptSubmit/Stop de engram...), ni
//                             plugins, ni el CLAUDE.md global. La autenticación por
//                             suscripción SIGUE funcionando (no depende de settings).
//   --strict-mcp-config       sin servidores MCP (codegraph, conectores claude.ai...).
//   --disable-slash-commands  sin skills.
//   --no-session-persistence  no deja sesiones en ~/.claude.
//   cwd neutro                os.tmpdir()/notevault-claude: no hay CLAUDE.md de proyecto.
// NO se usa --bare: exige API key y no usa la suscripción.
// Se elimina ANTHROPIC_API_KEY/AUTH_TOKEN del entorno para que cobre la suscripción
// y no una clave que el usuario tenga en variables de entorno.
//
// El prompt viaja por stdin y el system prompt por --system-prompt-file: nada
// largo va por la línea de comandos (límite de ~32 K en Windows).
// Se lanza el .exe real SIN shell: el shim `claude.cmd` de npm solo delega en
// node_modules/@anthropic-ai/claude-code/bin/claude.exe, así que lo resolvemos.

import { spawn as nodeSpawn, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { AIError, type ChatMessage, type StreamHandlers } from "./aiClient.js";

export const CLAUDE_MODEL_ALIASES = ["sonnet", "opus", "haiku"];
export const DEFAULT_TIMEOUT_S = 180;

export interface ClaudeCodeConfig {
  model: string;
  claude_path: string;
  claude_timeout_s: number;
}

export type SpawnFn = (cmd: string, args: string[], opts: Record<string, unknown>) => ChildProcess;

/** Dependencias sustituibles en tests. */
export interface ClaudeCodeDeps {
  spawn?: SpawnFn;
  exists?: (p: string) => boolean;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
}

const NOT_FOUND_MSG =
  "No se encontró Claude Code. Instálalo (npm i -g @anthropic-ai/claude-code) o indica la ruta de " +
  "claude.exe en Ajustes de IA > «Ruta de Claude Code».";

// ── Executable resolution ──────────────────────────────────────────────────

/** `claude.cmd`/`claude.ps1`/`claude` (shim de npm) -> el claude.exe que lanzan. */
function exeBehindShim(shim: string, exists: (p: string) => boolean): string | null {
  const exe = path.join(path.dirname(shim), "node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe");
  return exists(exe) ? exe : null;
}

export function resolveClaudeExecutable(configured: string, deps: ClaudeCodeDeps = {}): string {
  const exists = deps.exists ?? ((p: string) => { try { return fs.statSync(p).isFile(); } catch { return false; } });
  const env = deps.env ?? process.env;
  const win = (deps.platform ?? process.platform) === "win32";
  const pick = (p: string): string | null => {
    if (!exists(p)) return null;
    if (win && /\.(cmd|bat|ps1)$/i.test(p)) return exeBehindShim(p, exists);
    return p;
  };

  const cfgPath = configured.trim().replace(/^"|"$/g, "");
  if (cfgPath) {
    const hit = pick(cfgPath) ?? (win && !path.extname(cfgPath) ? pick(cfgPath + ".exe") ?? pick(cfgPath + ".cmd") : null);
    if (hit) return hit;
    throw new AIError(`La ruta de Claude Code configurada no existe o no es utilizable: ${cfgPath}\n${NOT_FOUND_MSG}`);
  }

  const dirs = (env.PATH ?? env.Path ?? "").split(win ? ";" : ":").filter(Boolean);
  const names = win ? ["claude.exe", "claude.cmd"] : ["claude"];
  for (const d of dirs) {
    for (const n of names) {
      const hit = pick(path.join(d.replace(/^"|"$/g, ""), n));
      if (hit) return hit;
    }
  }
  const extra: string[] = [];
  if (win) {
    if (env.APPDATA) extra.push(path.join(env.APPDATA, "npm", "claude.cmd"));
    if (env.USERPROFILE) extra.push(path.join(env.USERPROFILE, ".local", "bin", "claude.exe"));
  } else if (env.HOME) {
    extra.push(path.join(env.HOME, ".local", "bin", "claude"), path.join(env.HOME, ".claude", "local", "claude"));
  }
  for (const p of extra) {
    const hit = pick(p);
    if (hit) return hit;
  }
  throw new AIError(NOT_FOUND_MSG);
}

// ── Prompt / arguments ─────────────────────────────────────────────────────

/** El CLI recibe UN prompt: system aparte, el resto como transcript. */
export function serializeMessages(messages: ChatMessage[]): { system: string; prompt: string } {
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const turns = messages.filter((m) => m.role !== "system");
  if (turns.length === 1 && turns[0]!.role === "user") return { system, prompt: turns[0]!.content };
  const body = turns
    .map((m) => `[${m.role === "assistant" ? "Asistente" : "Usuario"}]\n${m.content}`)
    .join("\n\n");
  return {
    system,
    prompt:
      "Esta es la conversación hasta ahora. Responde únicamente al último mensaje del usuario, " +
      "como asistente y sin repetir las etiquetas [Usuario]/[Asistente].\n\n" + body,
  };
}

export function buildClaudeArgs(model: string, systemFile: string | null): string[] {
  const args = [
    "-p",
    "--output-format", "stream-json",
    "--verbose",
    "--include-partial-messages",
    "--tools", "",
    "--no-session-persistence",
    "--setting-sources", "",
    "--strict-mcp-config",
    "--disable-slash-commands",
  ];
  const m = model.trim();
  if (m && m !== "default" && m !== "por defecto") args.push("--model", m);
  if (systemFile) args.push("--system-prompt-file", systemFile);
  return args;
}

// ── Output parsing ─────────────────────────────────────────────────────────

export interface ParsedLine {
  text?: string;
  thinking?: string;
  /** Línea `result` final. */
  result?: { text: string; isError: boolean };
}

export function parseStreamLine(line: string): ParsedLine | null {
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(line);
  } catch {
    return null;
  }
  if (o.type === "stream_event") {
    const ev = o.event as { type?: string; delta?: { type?: string; text?: string; thinking?: string } } | undefined;
    if (ev?.type === "content_block_delta") {
      if (ev.delta?.type === "text_delta" && ev.delta.text) return { text: ev.delta.text };
      if (ev.delta?.type === "thinking_delta" && ev.delta.thinking) return { thinking: ev.delta.thinking };
    }
    return null;
  }
  if (o.type === "result") {
    return { result: { text: typeof o.result === "string" ? o.result : "", isError: o.is_error === true || (typeof o.subtype === "string" && o.subtype.startsWith("error")) } };
  }
  return null;
}

export function translateError(raw: string): string {
  const t = raw.trim();
  if (/not logged in|\/login|authenticat|invalid api key|oauth|credentials|401/i.test(t)) {
    return "Claude Code no tiene sesión iniciada: abre una terminal, ejecuta `claude` una vez y haz /login.";
  }
  if (/usage limit|rate limit|limit reached|quota|overloaded|429|resets? at/i.test(t)) {
    return `Se alcanzó el límite de uso de tu suscripción de Claude Code. ${t.slice(0, 300)}`;
  }
  return t ? `Claude Code falló: ${t.slice(0, 600)}` : "Claude Code falló sin dar detalles.";
}

// ── Run ────────────────────────────────────────────────────────────────────

export async function runClaudeCode(
  cfg: ClaudeCodeConfig,
  messages: ChatMessage[],
  handlers: StreamHandlers = {},
  deps: ClaudeCodeDeps = {},
): Promise<string> {
  const exe = resolveClaudeExecutable(cfg.claude_path, deps);
  const { system, prompt } = serializeMessages(messages);
  const spawnFn: SpawnFn = deps.spawn ?? (nodeSpawn as unknown as SpawnFn);

  const workDir = path.join(os.tmpdir(), "notevault-claude");
  let systemFile: string | null = null;
  try {
    fs.mkdirSync(workDir, { recursive: true });
    if (system.trim()) {
      systemFile = path.join(workDir, `system-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.txt`);
      fs.writeFileSync(systemFile, system, "utf-8");
    }
  } catch (e) {
    throw new AIError(`No se pudo preparar la carpeta temporal de Claude Code: ${e instanceof Error ? e.message : String(e)}`);
  }

  const env: NodeJS.ProcessEnv = { ...(deps.env ?? process.env) };
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_AUTH_TOKEN;
  const timeoutMs = (Number(cfg.claude_timeout_s) > 0 ? Number(cfg.claude_timeout_s) : DEFAULT_TIMEOUT_S) * 1000;

  try {
    return await new Promise<string>((resolve, reject) => {
      if (handlers.signal?.aborted) return resolve("");
      let child: ChildProcess;
      try {
        child = spawnFn(exe, buildClaudeArgs(cfg.model, systemFile), {
          cwd: workDir, env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true,
        });
      } catch (e) {
        return reject(new AIError(`No se pudo ejecutar Claude Code: ${e instanceof Error ? e.message : String(e)}`));
      }

      let answer = "";
      let resultText: { text: string; isError: boolean } | null = null;
      let stderr = "";
      let buffer = "";
      let settled = false;
      let timedOut = false;
      let aborted = false;
      const finish = (fn: () => void): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        handlers.signal?.removeEventListener("abort", onAbort);
        fn();
      };
      const kill = (): void => { try { child.kill(); } catch { /* ya terminó */ } };
      const timer = setTimeout(() => { timedOut = true; kill(); }, timeoutMs);
      const onAbort = (): void => { aborted = true; kill(); };
      handlers.signal?.addEventListener("abort", onAbort, { once: true });

      const handleLine = (line: string): void => {
        if (!line.trim()) return;
        const p = parseStreamLine(line);
        if (!p) return;
        if (p.text) { answer += p.text; handlers.onDelta?.(p.text); }
        else if (p.thinking) handlers.onThinking?.(p.thinking);
        else if (p.result) resultText = p.result;
      };

      child.stdout?.setEncoding?.("utf8");
      child.stdout?.on("data", (chunk: string | Buffer) => {
        buffer += chunk.toString();
        let nl: number;
        while ((nl = buffer.indexOf("\n")) >= 0) {
          handleLine(buffer.slice(0, nl).replace(/\r$/, ""));
          buffer = buffer.slice(nl + 1);
        }
      });
      child.stderr?.on("data", (chunk: string | Buffer) => { stderr = (stderr + chunk.toString()).slice(-4000); });
      child.stdin?.on("error", () => { /* el proceso murió antes de leer: lo explica 'close' */ });

      child.on("error", (err: NodeJS.ErrnoException) => finish(() => {
        if (err.code === "ENOENT") reject(new AIError(NOT_FOUND_MSG));
        else reject(new AIError(`No se pudo ejecutar Claude Code: ${err.message}`));
      }));
      child.on("close", (code: number | null) => finish(() => {
        if (buffer.trim()) handleLine(buffer);
        if (aborted) return resolve(answer);
        if (timedOut) {
          return reject(new AIError(`Claude Code tardó más de ${Math.round(timeoutMs / 1000)} s y se canceló.`));
        }
        const res = resultText as { text: string; isError: boolean } | null;
        if (res?.isError) return reject(new AIError(translateError(res.text || stderr)));
        if (code !== 0 && !answer && !res?.text) {
          return reject(new AIError(translateError(stderr || `código de salida ${code}`)));
        }
        resolve(answer || res?.text || "");
      }));

      try {
        child.stdin?.end(prompt, "utf8");
      } catch { /* lo cubre 'error'/'close' */ }
    });
  } finally {
    if (systemFile) fs.rm(systemFile, { force: true }, () => undefined);
  }
}
