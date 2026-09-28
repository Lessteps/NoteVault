import * as fs from "node:fs";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({ store: {} as Record<string, unknown>, dir: "" }));

vi.mock("../appConfig.js", () => ({
  AppConfig: {
    get_ai_config: () => ({ ...hoisted.store }),
    set_ai_config: (d: Record<string, unknown>) => Object.assign(hoisted.store, d),
    get_conversations_dir: () => hoisted.dir,
  },
}));

import { AppState } from "../appState.js";
import { conversationsApi, titleFallback } from "./conversations.js";

let dir: string;
let vault: string;
let api: ReturnType<typeof conversationsApi>;
let srv: http.Server;
let port: number;
let reply: string;
let failNext = false;
/** How many provider calls the fake server has answered. */
let calls = 0;
let emptyFirst = false;
let emptyAlways = false;

beforeEach(async () => {
  for (const k of Object.keys(hoisted.store)) delete hoisted.store[k];
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_hist_"));
  vault = fs.mkdtempSync(path.join(os.tmpdir(), "nv_vault_"));
  hoisted.dir = dir;
  reply = "Derivadas y regla de la cadena";
  failNext = false;
  calls = 0;
  emptyFirst = false;
  emptyAlways = false;
  api = conversationsApi(new AppState(vault));

  srv = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      calls += 1;
      if (failNext) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "boom" }));
        return;
      }
      const content = emptyAlways || (emptyFirst && calls === 1) ? "" : reply;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { content } }] }));
    });
  });
  await new Promise<void>((resolve) => srv.listen(0, "127.0.0.1", resolve));
  port = (srv.address() as import("node:net").AddressInfo).port;
});

afterEach(async () => {
  srv.closeAllConnections?.();
  await new Promise<void>((resolve) => srv.close(() => resolve()));
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(vault, { recursive: true, force: true });
});

const messages = [
  { role: "user", content: "¿Qué es la regla de la cadena?", at: 1 },
  { role: "assistant", content: "Es la derivada de una composición.", at: 2 },
];

describe("conversations api", () => {
  it("saves, lists and reads back a conversation", () => {
    const saved = api.conversation_save(null, messages, "deepseek-flash", "");
    expect(saved.messages).toHaveLength(2);
    expect(api.conversation_list().map((c) => c.id)).toEqual([saved.id]);
    expect(api.conversation_get(saved.id).messages[1]!.content).toContain("composición");
  });

  it("writes the history outside the vault", () => {
    const saved = api.conversation_save(null, messages);
    expect(fs.existsSync(path.join(dir, `${saved.id}.json`))).toBe(true);
    expect(fs.readdirSync(vault)).toEqual([]);
  });

  it("refuses a conversation that is not there", () => {
    expect(() => api.conversation_get("c20260928032211-abcdef")).toThrow(/ya no existe/);
    expect(() => api.conversation_rename("nope", "x")).toThrow(/ya no existe/);
  });

  it("renames and deletes", () => {
    const saved = api.conversation_save(null, messages, "", "Nombre viejo");
    expect(api.conversation_rename(saved.id, "Nombre nuevo").title).toBe("Nombre nuevo");
    expect(api.conversation_delete(saved.id)).toEqual({ ok: true });
    expect(api.conversation_list()).toHaveLength(0);
  });

  it("names the conversation with the model", async () => {
    hoisted.store.provider = "deepseek";
    hoisted.store.base_url = `http://127.0.0.1:${port}/v1`;
    hoisted.store.model = "deepseek-flash";
    hoisted.store.api_key = "sk-x";
    const saved = api.conversation_save(null, messages, "deepseek-flash", "pregunta larga de la que no se saca nada");

    const out = await api.ai_title(saved.id, "¿Qué es la regla de la cadena?", "Es la derivada de una composición.");
    expect(out.title).toBe("Derivadas y regla de la cadena");
    expect(out.fallback).toBe(false);
    expect(api.conversation_get(saved.id).title).toBe("Derivadas y regla de la cadena");
  });

  it("falls back to the question when the provider fails", async () => {
    hoisted.store.provider = "deepseek";
    hoisted.store.base_url = `http://127.0.0.1:${port}/v1`;
    hoisted.store.model = "deepseek-flash";
    hoisted.store.api_key = "sk-x";
    failNext = true;
    const saved = api.conversation_save(null, messages, "", "sin título");

    const out = await api.ai_title(saved.id, "Resume el teorema de Pitágoras", "");
    expect(out.fallback).toBe(true);
    expect(out.title).toBe("Resume el teorema de Pitágoras");
    expect(api.conversation_get(saved.id).title).toBe("Resume el teorema de Pitágoras");
  });

  it("retries when the model answers with nothing (reasoning ate the budget)", async () => {
    hoisted.store.provider = "deepseek";
    hoisted.store.base_url = `http://127.0.0.1:${port}/v1`;
    hoisted.store.model = "deepseek-flash";
    hoisted.store.api_key = "sk-x";
    const saved = api.conversation_save(null, messages, "");
    // first call comes back empty (finish_reason "length"), the second answers
    emptyFirst = true;
    const out = await api.ai_title(saved.id, "¿Para qué sirve la regla de la cadena?", "Es la derivada de una composición.");
    expect(calls).toBe(2);
    expect(out.fallback).toBe(false);
    expect(out.title).toBe("Derivadas y regla de la cadena");
  });

  it("falls back to the question when every attempt comes back empty", async () => {
    hoisted.store.provider = "deepseek";
    hoisted.store.base_url = `http://127.0.0.1:${port}/v1`;
    hoisted.store.model = "deepseek-flash";
    hoisted.store.api_key = "sk-x";
    const saved = api.conversation_save(null, messages, "");
    reply = "";
    emptyAlways = true;
    const out = await api.ai_title(saved.id, "Resume el teorema de Pitágoras", "");
    expect(out.fallback).toBe(true);
    expect(out.error).toBe("respuesta vacía");
    expect(out.title).toBe("Resume el teorema de Pitágoras");
    expect(calls).toBe(2);
  });

  it("falls back when the model answers with nothing usable", async () => {
    hoisted.store.provider = "deepseek";
    hoisted.store.base_url = `http://127.0.0.1:${port}/v1`;
    hoisted.store.model = "deepseek-flash";
    hoisted.store.api_key = "sk-x";
    reply = '""';
    const saved = api.conversation_save(null, messages, "");
    const out = await api.ai_title(saved.id, "¿Cómo se integra por partes?", "");
    expect(out.title).toBe("¿Cómo se integra por partes?");
  });

  it("never asks the model in bridge mode", async () => {
    hoisted.store.provider = "bridge_claude";
    const saved = api.conversation_save(null, messages, "");
    const out = await api.ai_title(saved.id, "Explica la fotosíntesis", "");
    expect(out.fallback).toBe(true);
    expect(out.title).toBe("Explica la fotosíntesis");
  });

  it("shortens a long question for the fallback title", () => {
    const long = "a".repeat(200);
    expect(titleFallback(long).length).toBeLessThanOrEqual(60);
    expect(titleFallback(long).endsWith("…")).toBe(true);
    expect(titleFallback("")).toBe("Nueva conversación");
  });
});
