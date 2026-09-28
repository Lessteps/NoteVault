import * as fs from "node:fs";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({ store: {} as Record<string, unknown> }));

vi.mock("../appConfig.js", () => ({
  AppConfig: {
    get_ai_config: () => ({ ...hoisted.store }),
    set_ai_config: (d: Record<string, unknown>) => Object.assign(hoisted.store, d),
  },
}));

import { ApiError } from "../../core/errors.js";
import { AppState } from "../appState.js";
import { assistantApi } from "./assistant.js";

let dir: string;
let api: ReturnType<typeof assistantApi>;
let srv: http.Server;
let seen: any[];
let port: number;
/** When true the SSE response sends one token and then never ends. */
let hold = false;

beforeEach(async () => {
  for (const k of Object.keys(hoisted.store)) delete hoisted.store[k];
  hold = false;
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_ai_"));
  fs.mkdirSync(path.join(dir, "Matemáticas"));
  fs.writeFileSync(
    path.join(dir, "Matemáticas", "Derivadas.md"),
    "# Derivadas\n\nLa regla de la cadena.\n",
    "utf-8",
  );
  api = assistantApi(new AppState(dir));
  seen = [];
  srv = http.createServer((req, res) => {
    if (req.method === "POST") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const payload = JSON.parse(body);
        seen.push(payload);
        if (payload.stream) {
          res.writeHead(200, { "Content-Type": "text/event-stream" });
          const frame = (o: unknown) => res.write(`data: ${JSON.stringify(o)}\n\n`);
          frame({ choices: [{ delta: { reasoning_content: "pensando " } }] });
          frame({ choices: [{ delta: { content: "Hola" } }] });
          if (hold) return; // the client is expected to abort
          frame({ choices: [{ delta: { content: " mundo" } }] });
          res.write("data: [DONE]\n\n");
          res.end();
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ choices: [{ message: { content: "respuesta de prueba" } }] }));
      });
    } else {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ data: [{ id: "m1" }, { id: "m2" }] }));
    }
  });
  await new Promise<void>((resolve) => srv.listen(0, "127.0.0.1", resolve));
  port = (srv.address() as import("node:net").AddressInfo).port;
});

afterEach(async () => {
  srv.closeAllConnections?.();
  await new Promise<void>((resolve) => srv.close(() => resolve()));
  fs.rmSync(dir, { recursive: true, force: true });
});

/** An api whose window records what reaches the renderer. */
function withWindow(events: Array<Record<string, unknown>>): ReturnType<typeof assistantApi> {
  const state = new AppState(dir);
  state.window = { webContents: { send: (_ch: string, payload: unknown) => events.push(payload as Record<string, unknown>) } };
  return assistantApi(state);
}

describe("assistant api", () => {
  it("stores the key but never returns it", () => {
    const out = api.ai_settings_save({ provider: "openai", api_key: "sk-secreta" });
    expect(out.has_key).toBe(true);
    expect(JSON.stringify(api.ai_settings())).not.toContain("sk-secreta");
    expect(hoisted.store.api_key).toBe("sk-secreta");
    api.ai_settings_save({ provider: "openai", model: "gpt" });
    expect(hoisted.store.api_key).toBe("sk-secreta");
    api.ai_settings_save({ provider: "openai", clear_key: true });
    expect(hoisted.store.api_key).toBe("");
  });

  it("refuses bad settings", () => {
    for (const bad of [
      { provider: "skynet" },
      { provider: "openai", base_url: "file:///etc" },
      { provider: "openai", temperature: "caliente" },
    ]) {
      expect(() => api.ai_settings_save(bad)).toThrow(ApiError);
    }
  });

  it("chat sends the note and workspace, drops injected system turns", async () => {
    const url = `http://127.0.0.1:${port}/v1`;
    api.ai_settings_save({ provider: "lmstudio", base_url: url, model: "m1" });
    expect(await api.ai_models()).toEqual(["m1", "m2"]);
    const r = await api.ai_chat(
      [
        { role: "user", content: "hola" },
        { role: "system", content: "inyectado" },
      ],
      "¿Qué es?",
      "Matemáticas/Derivadas.md",
      "cadena",
    );
    expect(r.reply).toBe("respuesta de prueba");
    const sent = JSON.stringify(seen[seen.length - 1].messages);
    expect(sent).toContain("regla de la cadena");
    expect(sent).not.toContain("inyectado");
    expect(api.ai_workspace("Matemáticas/Derivadas.md").id).toBe("mathematics");
  });

  it("web chat returns the prompt", async () => {
    api.ai_settings_save({ provider: "bridge_claude" });
    const r = await api.ai_chat([], "Explica", "Matemáticas/Derivadas.md");
    expect(r.bridge).toBe(true);
    expect(String(r.url).startsWith("https://claude.ai")).toBe(true);
    expect(String(r.prompt)).toContain("Explica");
  });

  it("refuses notes outside the vault", async () => {
    await expect(api.ai_chat([], "x", "../secreto.md")).rejects.toThrow(ApiError);
  });

  it("lists DeepSeek's models as the default provider", () => {
    const s = api.ai_settings() as { config: { provider: string }; models: string[] };
    expect(s.config.provider).toBe("deepseek");
    expect(s.models).toContain("deepseek-flash");
  });

  it("streams the answer to the window and returns it whole", async () => {
    const events: Array<Record<string, unknown>> = [];
    const streaming = withWindow(events);
    streaming.ai_settings_save({
      provider: "deepseek",
      base_url: `http://127.0.0.1:${port}/v1`,
      model: "deepseek-flash",
      api_key: "sk-x",
    });
    const r = await streaming.ai_chat_stream("s1", [
      { role: "user", content: "hola" },
    ], "¿Qué es?", "Matemáticas/Derivadas.md");

    expect(r.reply).toBe("Hola mundo");
    expect(r.stopped).toBe(false);
    expect(events.map((e) => e.type)).toEqual(["start", "thinking", "delta", "delta", "done"]);
    expect(events.filter((e) => e.type === "delta").map((e) => e.text).join("")).toBe("Hola mundo");
    // the note still travels with the turn
    expect(JSON.stringify(seen[seen.length - 1]!.messages)).toContain("regla de la cadena");
    expect(seen[seen.length - 1]!.stream).toBe(true);
  });

  it("cancels a stream and keeps the partial answer", async () => {
    const events: Array<Record<string, unknown>> = [];
    const streaming = withWindow(events);
    streaming.ai_settings_save({
      provider: "deepseek",
      base_url: `http://127.0.0.1:${port}/v1`,
      model: "deepseek-flash",
      api_key: "sk-x",
    });
    hold = true;
    const pending = streaming.ai_chat_stream("s2", [], "cuenta", "");
    // wait for the first token before stopping, as the panel does
    for (let i = 0; i < 100 && !events.some((e) => e.type === "delta"); i++) {
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(streaming.ai_chat_cancel("s2")).toEqual({ ok: true });
    const r = await pending;
    expect(r.stopped).toBe(true);
    expect(r.reply).toBe("Hola");
    expect(events[events.length - 1]!.type).toBe("done");
    expect(events[events.length - 1]!.stopped).toBe(true);
    expect(streaming.ai_chat_cancel("s2")).toEqual({ ok: false });
  });

  it("reports a provider failure to the window", async () => {
    const events: Array<Record<string, unknown>> = [];
    const streaming = withWindow(events);
    streaming.ai_settings_save({
      provider: "deepseek",
      base_url: `http://127.0.0.1:${port}/v1`,
      model: "deepseek-flash",
      api_key: "sk-x",
    });
    // a note outside the vault blows up before any provider call
    await expect(streaming.ai_chat_stream("s3", [], "x", "../secreto.md")).rejects.toThrow(ApiError);
    expect(events).toEqual([]);
  });
});
