// Ported from notevault_app/webapp/modules/assistant.py
// Asistente: chat about the open note with a local server, an API, or a web
// chat through the clipboard. The API key is stored in AppConfig and never
// returned to the renderer: settings only report whether one is set.

import * as fs from "node:fs";
import * as path from "node:path";
import {
  AIConfig,
  AIError,
  BRIDGE_URLS,
  PROVIDER_BY_KEY,
  PROVIDERS,
  buildBridgePrompt,
  buildMessages,
  listModels,
  sendChat,
  streamChat,
  type ChatMessage,
} from "../../core/aiClient.js";
import { applyAssistantAction, planAssistantAction } from "../../core/assistantActions.js";
import { buildModeContext, isVaultMode } from "../../core/assistantModes.js";
import { parseFrontmatter } from "../../core/frontmatter.js";
import { clearExerciseIndexCache } from "../../core/practice/exerciseIndex.js";
import { readSkillTemplates } from "../../core/practice/skillTemplates.js";
import { findAncestorTopicManifest } from "../../core/practice/topic.js";
import { catalogFor } from "../../core/practice/skillSelection.js";
import { WorkspaceManager } from "../../core/workspaceManager.js";
import { ApiError } from "../../core/errors.js";
import { AppConfig } from "../appConfig.js";
import type { AppState } from "../appState.js";
import { oneLine } from "../common.js";
import { clearStudySnapshotCache } from "./study.js";

const MAX_HISTORY = 40;
const MAX_TEXT = 60_000;

function publicCfg(cfg: AIConfig): Record<string, unknown> {
  return {
    provider: cfg.provider,
    base_url: cfg.base_url,
    model: cfg.model,
    has_key: Boolean(cfg.api_key),
    temperature: cfg.temperature,
    max_tokens: cfg.max_tokens,
    include_note: cfg.include_note,
    is_bridge: cfg.is_bridge,
  };
}

function hasHost(url: string): boolean {
  try {
    return !!new URL(url).host;
  } catch {
    return false;
  }
}
function schemeOf(url: string): string {
  const m = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(url);
  return m ? m[1]!.toLowerCase() : "";
}

export function assistantApi(app: AppState) {
  const aiCfg = (): AIConfig => AIConfig.fromDict(AppConfig.get_ai_config());

  /** Cancels in-flight streamed answers, keyed by the id the renderer sent. */
  const streams = new Map<string, AbortController>();

  /** Push one stream event to the window (no-op when there is no window). */
  const emit = (data: Record<string, unknown>): void => {
    const win = app.window as
      | { webContents?: { send: (channel: string, payload: unknown) => void } }
      | null;
    win?.webContents?.send("nv-ai-stream", data);
  };

  /** Everything ai_chat and ai_chat_stream need before touching a provider. */
  const chatMessages = (
    history: unknown,
    question: string,
    noteRel: string,
    selection: string,
    mode = "",
    folders: string[] = [],
  ): ChatMessage[] => {
    if (!Array.isArray(history)) throw new ApiError("Historial inválido.");
    const q = String(question || "").trim().slice(0, MAX_TEXT);
    if (!q) throw new ApiError("Escribe una pregunta.");
    const clean: ChatMessage[] = [];
    for (const m of history.slice(-MAX_HISTORY)) {
      if (m && typeof m === "object") {
        const role = (m as Record<string, unknown>).role;
        if (role === "user" || role === "assistant") {
          clean.push({
            role,
            content: String((m as Record<string, unknown>).content || "").slice(0, MAX_TEXT),
          });
        }
      }
    }
    let title = "";
    let body = "";
    let wsPrompt = "";
    if (noteRel) {
      const p = app.resolve(noteRel);
      const raw = fs.readFileSync(p, "utf-8");
      const parsed = parseFrontmatter(raw);
      const fm = parsed[0];
      body = parsed[1];
      title = path.parse(p).name;
      const ws = new WorkspaceManager(app.root).detectForPath(
        noteRel,
        fm && typeof fm === "object" ? fm : {},
      );
      wsPrompt = ws.id !== "general" ? ws.system_prompt || "" : "";
    }
    const vaultMode = isVaultMode(mode) ? mode : "";
    return buildMessages(aiCfg(), clean, q, {
      note_title: title,
      note_body: body,
      selection: String(selection || "").slice(0, MAX_TEXT),
      workspace_prompt: [wsPrompt, vaultMode ? modeContext(vaultMode, noteRel, folders) : foldersContext(folders)].filter(Boolean).join("\n\n"),
      ...(vaultMode ? { mode: vaultMode } : {}),
    });
  };

  /** The open topic's competency matrix and the catalogue with what each skill suits. */
  const matrixContext = (noteRel: string): string => {
    if (!noteRel) return "No note is open, so there is no topic.";
    const found = findAncestorTopicManifest(app.resolve(noteRel), app.root);
    if (!found) return "The open note is not inside a topic.";
    const m = found.manifest;
    const current = m.plan
      ? Object.entries(m.plan).map(([skill, c]) => `${skill}=${c[0]}/${c[1]}/${c[2]}`).join(", ")
      : `${m.skills.join(", ")} (no AI plan yet: default requirement)`;
    const catalog = catalogFor(m.subject)
      .map((s) => `- ${s.id}: ${s.label} - suits ${s.topicTypes.join("/")}; difficulties ${s.allowedDifficulties.join(",")}`)
      .join("\n");
    return [
      `Topic folder: ${app.rel(found.topicFolder)}`,
      `Topic: ${m.title} (subject ${m.subject}${m.topic_type ? `, type ${m.topic_type}` : ""})`,
      `Current matrix (skill=easy/medium/hard): ${current}`,
      `Catalogue:\n${catalog}`,
    ].join("\n");
  };

  /** Folders the user pointed the chat at that really exist (vault-relative, POSIX). */
  const existingFolders = (folders: string[]): string[] =>
    folders
      .slice(0, 8)
      .map((f) => f.replace(/\\/g, "/").replace(/^\/+|\/+$/g, ""))
      .filter((f) => {
        try {
          return !!f && fs.statSync(app.resolve(f, { allowRoot: true })).isDirectory();
        } catch {
          return false;
        }
      });

  /** Plain (no mode) conversations still learn which folders "esta carpeta" means. */
  const foldersContext = (folders: string[]): string => {
    const list = existingFolders(folders);
    return list.length ? buildModeContext({ skills: [], folders: list }) : "";
  };

  /** The vault's skills and, for a new topic, the area being worked on. */
  const modeContext = (mode: string, noteRel: string, folders: string[] = []): string => {
    let areaFolder = "";
    let areaTopics: string[] = [];
    if (noteRel) {
      let dir = noteRel.includes("/") ? noteRel.slice(0, noteRel.lastIndexOf("/")) : "";
      const isTopicDir = (d: string): boolean => {
        try {
          return fs.readdirSync(app.resolve(d, { allowRoot: true })).some((f) => f.toLowerCase().endsWith(".practica.md"));
        } catch {
          return false;
        }
      };
      if (dir && isTopicDir(dir)) dir = dir.includes("/") ? dir.slice(0, dir.lastIndexOf("/")) : "";
      if (dir) {
        areaFolder = dir;
        try {
          areaTopics = fs
            .readdirSync(app.resolve(dir, { allowRoot: true }), { withFileTypes: true })
            .filter((e) => e.isDirectory() && !e.name.startsWith(".") && !e.name.startsWith("_"))
            .map((e) => e.name);
        } catch {
          areaTopics = [];
        }
      }
    }
    const noteFolder = noteRel.includes("/") ? noteRel.slice(0, noteRel.lastIndexOf("/")) : "";
    return buildModeContext({ skills: readSkillTemplates(app.root, noteRel), areaFolder, areaTopics, noteFolder, matrix: mode === "matriz" ? matrixContext(noteRel) : undefined, folders: existingFolders(folders) });
  };

  /** A structured reply (a whole syllabus as JSON) does not fit the chat's small token budget. */
  const configFor = (mode: string): AIConfig => {
    const cfg = aiCfg();
    return isVaultMode(mode) && cfg.max_tokens < 12_000
      ? new AIConfig({ ...cfg.toDict(), max_tokens: 12_000 })
      : cfg;
  };

  return {
    ai_settings(): Record<string, unknown> {
      const cfg = aiCfg();
      return {
        config: publicCfg(cfg),
        models: cfg.info.default_models,
        providers: PROVIDERS.map((p) => ({
          key: p.key,
          label: p.label,
          hint: p.hint,
          needs_key: p.needs_key,
          needs_url: p.needs_url,
          default_url: p.default_url,
          default_model: p.default_model,
          default_models: p.default_models,
          bridge: p.bridge,
        })),
      };
    },

    ai_settings_save(fields: unknown): Record<string, unknown> {
      if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
        throw new ApiError("Datos inválidos.");
      }
      const f = fields as Record<string, unknown>;
      const cfg = aiCfg();
      const provider = (f.provider as string) ?? cfg.provider;
      if (!(provider in PROVIDER_BY_KEY)) throw new ApiError("Proveedor desconocido.");
      cfg.provider = provider;
      if ("base_url" in f) {
        const url = oneLine(f.base_url, 300);
        if (url && (!["http", "https"].includes(schemeOf(url)) || !hasHost(url))) {
          throw new ApiError("La URL debe empezar por http:// o https://");
        }
        cfg.base_url = url || PROVIDER_BY_KEY[provider]!.default_url;
      }
      if ("model" in f) {
        cfg.model = oneLine(f.model, 200) || PROVIDER_BY_KEY[provider]!.default_model;
      }
      if (f.clear_key) {
        cfg.api_key = "";
      } else if (f.api_key) {
        cfg.api_key = oneLine(f.api_key, 400);
      }
      if ("temperature" in f) {
        const t = Number(f.temperature);
        if (!Number.isFinite(t)) throw new ApiError("Temperatura inválida.");
        cfg.temperature = Math.max(0, Math.min(2, t));
      }
      if ("max_tokens" in f) {
        const n = Number(f.max_tokens);
        if (!Number.isFinite(n)) throw new ApiError("Máximo de tokens inválido.");
        cfg.max_tokens = Math.max(64, Math.min(32_000, Math.trunc(n)));
      }
      if ("include_note" in f) cfg.include_note = Boolean(f.include_note);
      AppConfig.set_ai_config(cfg.toDict());
      return publicCfg(cfg);
    },

    async ai_models(): Promise<string[]> {
      try {
        return await listModels(aiCfg());
      } catch (e) {
        throw new ApiError(e instanceof AIError ? e.message : String(e));
      }
    },

    async ai_test(): Promise<Record<string, unknown>> {
      const cfg = aiCfg();
      if (cfg.is_bridge) return { ok: true, reply: "Modo web: no hay conexión que probar." };
      try {
        const reply = await sendChat(cfg, [{ role: "user", content: "Responde solo con: OK" }]);
        return { ok: true, reply: reply.slice(0, 200) };
      } catch (e) {
        throw new ApiError(e instanceof AIError ? e.message : String(e));
      }
    },

    ai_workspace(noteRel: string): Record<string, unknown> {
      const p = app.resolve(noteRel);
      const [fm] = parseFrontmatter(fs.readFileSync(p, "utf-8"));
      const ws = new WorkspaceManager(app.root).detectForPath(
        noteRel,
        fm && typeof fm === "object" ? fm : {},
      );
      return { id: ws.id ?? "general", name: ws.name ?? "General", icon: ws.icon ?? "" };
    },

    async ai_chat(
      history: unknown,
      question: string,
      noteRel = "",
      selection = "",
    ): Promise<Record<string, unknown>> {
      const messages = chatMessages(history, question, noteRel, selection);
      const cfg = aiCfg();
      if (cfg.is_bridge) {
        return {
          bridge: true,
          prompt: buildBridgePrompt(messages),
          url: BRIDGE_URLS[cfg.provider] ?? "",
          label: cfg.info.label,
        };
      }
      try {
        return { reply: await sendChat(cfg, messages) };
      } catch (e) {
        throw new ApiError(e instanceof AIError ? e.message : String(e));
      }
    },

    /**
     * Same conversation as ai_chat, delivered token by token over
     * `nv-ai-stream` events ({id, type: "delta"|"thinking"|"done"|"error"}).
     * Resolves with the whole answer once the stream ends; `stopped` says
     * whether the user cancelled it (the partial text is still returned).
     */
    async ai_chat_stream(
      streamId: string,
      history: unknown,
      question: string,
      noteRel = "",
      selection = "",
      mode = "",
      folders: unknown = [],
    ): Promise<Record<string, unknown>> {
      const id = String(streamId || "").slice(0, 64);
      if (!id) throw new ApiError("Falta el identificador del flujo.");
      const messages = chatMessages(history, question, noteRel, selection, mode, Array.isArray(folders) ? folders.map(String) : []);
      const cfg = configFor(mode);
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

    /** What an action from the chat would create, without writing anything. */
    assistant_action_preview(action: unknown): Record<string, unknown> {
      const plan = planAssistantAction(app.root, action as never);
      return {
        title: plan.title,
        warnings: plan.warnings,
        open: plan.open ?? "",
        ops: plan.ops.map((o) => ({ kind: o.kind, rel: o.rel, exists: o.exists, overwrite: Boolean(o.overwrite) })),
      };
    },

    /** Runs an action the user accepted. */
    assistant_action_apply(action: unknown): Record<string, unknown> {
      const res = applyAssistantAction(app.root, action as never);
      clearStudySnapshotCache();
      clearExerciseIndexCache();
      return { ok: true, written: res.written, skipped: res.skipped, open: res.open ?? "" };
    },

    ai_chat_cancel(streamId: string): Record<string, unknown> {
      const id = String(streamId || "");
      const controller = streams.get(id);
      if (!controller) return { ok: false };
      controller.abort();
      streams.delete(id);
      return { ok: true };
    },
  };
}
