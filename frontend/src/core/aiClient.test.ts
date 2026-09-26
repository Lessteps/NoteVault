import { describe, expect, it } from "vitest";
import { AI_MODES, AIConfig, buildMessages, buildBridgePrompt } from "./aiClient.js";

describe("AI modes and prompt building", () => {
  it("defines exactly the 6 modes", () => {
    expect(new Set(Object.keys(AI_MODES))).toEqual(
      new Set(["tutor", "socratic", "examiner", "evaluator", "generator", "debugger"]),
    );
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
