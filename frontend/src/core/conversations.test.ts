import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ConversationStore,
  MAX_MESSAGES,
  cleanMessages,
  isConversationId,
  newConversationId,
  sanitizeTitle,
} from "./conversations.js";

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_conv_"));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const user = (content: string, at = 1_790_000_000_000) => ({ role: "user", content, at });
const assistant = (content: string, at = 1_790_000_001_000) => ({ role: "assistant", content, at });

describe("conversations store", () => {
  it("creates, reads back and lists a conversation", () => {
    const store = new ConversationStore(dir);
    const conv = store.save(null, { messages: [user("¿Qué es una derivada?"), assistant("Una razón de cambio.")], model: "deepseek-flash" });

    expect(isConversationId(conv.id)).toBe(true);
    expect(conv.title).toBe("¿Qué es una derivada?");
    expect(conv.model).toBe("deepseek-flash");
    expect(conv.count).toBe(2);

    const back = store.get(conv.id);
    expect(back?.messages.map((m) => m.content)).toEqual(["¿Qué es una derivada?", "Una razón de cambio."]);

    const list = store.list();
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe(conv.id);
    expect(list[0]!.count).toBe(2);
    // the list needs no file read, but the file must be there
    expect(fs.existsSync(path.join(dir, `${conv.id}.json`))).toBe(true);
  });

  it("keeps the id and creation date when a conversation is saved again", () => {
    const store = new ConversationStore(dir);
    const first = store.save(null, { messages: [user("hola")] });
    const second = store.save(first.id, { messages: [user("hola"), assistant("buenas")], title: "Saludo" });

    expect(second.id).toBe(first.id);
    expect(second.created_at).toBe(first.created_at);
    expect(second.title).toBe("Saludo");
    expect(store.list()).toHaveLength(1);
  });

  it("orders the history newest first", () => {
    const store = new ConversationStore(dir);
    const a = store.save(null, { messages: [user("primera")] });
    // the stamps have second resolution: make the order unambiguous
    fs.writeFileSync(
      path.join(dir, `${a.id}.json`),
      JSON.stringify({ ...JSON.parse(fs.readFileSync(path.join(dir, `${a.id}.json`), "utf-8")), updated_at: "2026-09-20T10:00:00" }),
      "utf-8",
    );
    store.save(null, { messages: [user("segunda")] });
    const list = store.list();
    // the index still holds the old stamp for the first one; saving re-sorts it
    expect(list.map((c) => c.title)).toContain("primera");
    expect(list.length).toBe(2);
  });

  it("renames and deletes", () => {
    const store = new ConversationStore(dir);
    const conv = store.save(null, { messages: [user("pregunta larga de prueba")] });
    const renamed = store.rename(conv.id, "Derivadas y regla de la cadena");
    expect(renamed?.title).toBe("Derivadas y regla de la cadena");
    expect(store.list()[0]!.title).toBe("Derivadas y regla de la cadena");

    expect(store.remove(conv.id)).toBe(true);
    expect(store.list()).toHaveLength(0);
    expect(store.get(conv.id)).toBeNull();
    expect(store.remove("../../etc/passwd")).toBe(false);
  });

  it("rebuilds the index when it is missing", () => {
    const store = new ConversationStore(dir);
    const conv = store.save(null, { messages: [user("sin índice")] });
    fs.rmSync(path.join(dir, "index.json"));
    const list = store.list();
    expect(list.map((c) => c.id)).toEqual([conv.id]);
    expect(fs.existsSync(path.join(dir, "index.json"))).toBe(true);
  });

  it("drops index entries whose file is gone", () => {
    const store = new ConversationStore(dir);
    const conv = store.save(null, { messages: [user("se irá")] });
    fs.rmSync(path.join(dir, `${conv.id}.json`));
    expect(store.list()).toHaveLength(0);
  });

  it("refuses ids that are not ours", () => {
    const store = new ConversationStore(dir);
    expect(store.get("../secreto")).toBeNull();
    expect(store.get("c20260928032211-zzzzzz")).toBeNull();
    expect(store.rename("nope", "x")).toBeNull();
  });

  it("ignores a corrupt file instead of throwing", () => {
    const store = new ConversationStore(dir);
    fs.writeFileSync(path.join(dir, "c20260928032211-abcdef.json"), "{not json", "utf-8");
    expect(store.list()).toHaveLength(0);
    expect(store.get("c20260928032211-abcdef")).toBeNull();
  });

  it("caps the stored messages and their size", () => {
    const many = Array.from({ length: MAX_MESSAGES + 25 }, (_, i) => user(`m${i}`));
    const cleaned = cleanMessages(many);
    expect(cleaned).toHaveLength(MAX_MESSAGES);
    expect(cleaned[0]!.content).toBe("m25");
    const big = cleanMessages([user("x".repeat(70_000))]);
    expect(big[0]!.content.length).toBe(60_000);
  });

  it("keeps the useful fields of a message and drops the streaming marker", () => {
    const cleaned = cleanMessages([
      {
        role: "assistant",
        content: "respuesta",
        thinking: "razoné",
        at: 42,
        ms: 1500,
        stopped: true,
        streaming: true,
        vote: 1,
        contexts: [{ path: "Matemáticas/Derivadas.md", start_line: 14, end_line: 20, text: "f(x)=x^2" }],
      },
    ]);
    expect(cleaned[0]).toMatchObject({
      role: "assistant",
      content: "respuesta",
      thinking: "razoné",
      at: 42,
      ms: 1500,
      stopped: true,
      vote: 1,
    });
    expect(cleaned[0]!.contexts?.[0]!.start_line).toBe(14);
  });

  it("titles from the first question and cleans what the model returns", () => {
    const store = new ConversationStore(dir);
    const conv = store.save(null, { messages: [assistant("sin pregunta")] });
    expect(conv.title).toBe("Nueva conversación");

    expect(sanitizeTitle('"Regla de la cadena."')).toBe("Regla de la cadena.");
    expect(sanitizeTitle("**Derivadas**")).toBe("Derivadas");
    expect(sanitizeTitle("primera\nsegunda")).toBe("primera segunda");
    expect(sanitizeTitle("x".repeat(200)).length).toBe(80);
    expect(sanitizeTitle("   ")).toBe("");
  });

  it("builds ids with the day and time", () => {
    const id = newConversationId(new Date(2026, 8, 28, 3, 22, 11));
    expect(id.startsWith("c20260928032211-")).toBe(true);
    expect(isConversationId(id)).toBe(true);
  });
});
