import { describe, expect, it } from "vitest";
import {
  AI_MODES,
  AIConfig,
  DEEPSEEK,
  PROVIDERS,
  buildBridgePrompt,
  buildMessages,
  streamChat,
} from "./aiClient.js";

describe("AI modes and prompt building", () => {
  it("defines exactly the 6 modes", () => {
    expect(new Set(Object.keys(AI_MODES))).toEqual(
      new Set(["tutor", "socratic", "examiner", "evaluator", "generator", "debugger"]),
    );
  });

  it("defaults to DeepSeek and offers its models", () => {
    expect(new AIConfig().provider).toBe(DEEPSEEK);
    expect(new AIConfig().base_url).toBe("https://api.deepseek.com/v1");
    expect(PROVIDERS[0]!.key).toBe(DEEPSEEK);
    expect(PROVIDERS[0]!.default_models).toContain("deepseek-flash");
    for (const p of PROVIDERS) {
      expect(Array.isArray(p.default_models)).toBe(true);
    }
  });

  it("builds messages with mode and workspace prompt", () => {
    const cfg = new AIConfig({ include_note: true });
    const messages = buildMessages(cfg, [], "¿Cómo resolver esta integral?", {
      note_title: "Cálculo 1",
      note_body: "f(x) = x^2",
      mode: "socratic",
      workspace_prompt: "Act as mathematics tutor.",
    });

    const sysMsg = messages[0]!.content;
    expect(sysMsg).toContain("Modo Socrático");
    expect(sysMsg).toContain("Act as mathematics tutor.");

    const ctxMsg = messages[1]!.content;
    expect(ctxMsg).toContain("Cálculo 1");
    expect(ctxMsg).toContain("f(x) = x^2");

    const userMsg = messages[2]!.content;
    expect(userMsg).toBe("¿Cómo resolver esta integral?");
  });

  it("omits the context message when the note is excluded", () => {
    const cfg = new AIConfig({ include_note: false });
    const messages = buildMessages(cfg, [], "hola", { note_title: "N", note_body: "body" });
    expect(messages).toHaveLength(2);
    expect(messages[1]!.role).toBe("user");
  });

  it("flattens a bridge prompt with role labels", () => {
    const prompt = buildBridgePrompt([
      { role: "system", content: "sys" },
      { role: "user", content: "q" },
      { role: "assistant", content: "a" },
    ]);
    expect(prompt).toBe("sys\n\n---\n\n[Usuario]\nq\n\n---\n\n[Asistente]\na");
  });

  it("round-trips config through dict", () => {
    const cfg = new AIConfig({ provider: "openai", api_key: "sk-x", max_tokens: 42 });
    const back = AIConfig.fromDict(cfg.toDict());
    expect(back.provider).toBe("openai");
    expect(back.api_key).toBe("sk-x");
    expect(back.max_tokens).toBe(42);
    expect(back.is_bridge).toBe(false);
  });
});

/** Serve a fixed list of SSE frames as one fetch response. */
function stubFetch(frames: string[]): () => void {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const frame of frames) controller.enqueue(encoder.encode(frame));
      controller.close();
    },
  });
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } })) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

describe("streaming", () => {
  it("delivers OpenAI-style deltas, reasoning and the whole answer", async () => {
    const restore = stubFetch([
      `data: {"choices":[{"delta":{"reasoning_content":"pienso"}}]}\n\n`,
      `data: {"choices":[{"delta":{"content":"Ho"}}]}\n\n`,
      `data: {"choices":[{"delta":{"content":"la"}}]}\n\n`,
      `data: [DONE]\n\n`,
    ]);
    const deltas: string[] = [];
    const thinking: string[] = [];
    try {
      const text = await streamChat(
        new AIConfig({ provider: DEEPSEEK, api_key: "sk-x" }),
        [{ role: "user", content: "hola" }],
        { onDelta: (t) => deltas.push(t), onThinking: (t) => thinking.push(t) },
      );
      expect(text).toBe("Hola");
      expect(deltas).toEqual(["Ho", "la"]);
      expect(thinking).toEqual(["pienso"]);
    } finally {
      restore();
    }
  });

  it("reassembles a frame split across two reads", async () => {
    const restore = stubFetch([`data: {"choices":[{"delta":{"content":"Ho`, `la"}}]}\n\n`, `data: [DONE]\n\n`]);
    try {
      const text = await streamChat(new AIConfig({ provider: DEEPSEEK }), [{ role: "user", content: "hi" }]);
      expect(text).toBe("Hola");
    } finally {
      restore();
    }
  });

  it("reads Anthropic content_block_delta frames", async () => {
    const restore = stubFetch([
      `event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Ho"}}\n\n`,
      `event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"la"}}\n\n`,
      `event: message_stop\ndata: {"type":"message_stop"}\n\n`,
    ]);
    try {
      const text = await streamChat(new AIConfig({ provider: "anthropic", api_key: "sk-ant-x" }), [
        { role: "user", content: "hi" },
      ]);
      expect(text).toBe("Hola");
    } finally {
      restore();
    }
  });

  it("keeps the partial answer when the caller aborts", async () => {
    const controller = new AbortController();
    // A real fetch rejects the pending read when its signal aborts; the stub
    // has to do the same or the reader would hang forever.
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode(`data: {"choices":[{"delta":{"content":"parcial"}}]}\n\n`));
        controller.signal.addEventListener("abort", () => c.error(new Error("aborted")));
      },
    });
    const original = globalThis.fetch;
    globalThis.fetch = (async () => new Response(body, { status: 200 })) as typeof fetch;
    try {
      const text = await streamChat(
        new AIConfig({ provider: DEEPSEEK }),
        [{ role: "user", content: "hi" }],
        {
          signal: controller.signal,
          onDelta: () => controller.abort(),
        },
      );
      expect(text).toBe("parcial");
    } finally {
      globalThis.fetch = original;
    }
  });
});
