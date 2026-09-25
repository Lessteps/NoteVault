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
  type ChatMessage,
} from "../../core/aiClient.js";
import { parseFrontmatter } from "../../core/frontmatter.js";
import { WorkspaceManager } from "../../core/workspaceManager.js";
import { ApiError } from "../../core/errors.js";
import { AppConfig } from "../appConfig.js";
import type { AppState } from "../appState.js";
import { oneLine } from "../common.js";

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

  return {
    ai_settings(): Record<string, unknown> {
      const cfg = aiCfg();
      return {
        config: publicCfg(cfg),
        providers: PROVIDERS.map((p) => ({
          key: p.key,
          label: p.label,
          hint: p.hint,
          needs_key: p.needs_key,
          needs_url: p.needs_url,
          default_url: p.default_url,
          default_model: p.default_model,
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
      if (!Array.isArray(history)) throw new ApiError("Historial inválido.");
      const q = String(question || "").trim().slice(0, MAX_TEXT);
      if (!q) throw new ApiError("Escribe una pregunta.");
      const clean: ChatMessage[] = [];
      for (const m of history.slice(-MAX_HISTORY)) {
        if (m && typeof m === "object") {
          const role = (m as Record<string, unknown>).role;
          if (role === "user" || role === "assistant") {
            clean.push({ role, content: String((m as Record<string, unknown>).content || "").slice(0, MAX_TEXT) });
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
      const cfg = aiCfg();
      const messages = buildMessages(cfg, clean, q, {
        note_title: title,
        note_body: body,
        selection: String(selection || "").slice(0, MAX_TEXT),
        workspace_prompt: wsPrompt,
      });
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
  };
}
