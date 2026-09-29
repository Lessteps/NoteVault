import { describe, expect, it } from "vitest";
import { VAULT_MODE_DIRECTIVES, VAULT_MODE_IDS as CORE_IDS } from "../core/assistantModes";
import { VAULT_MODE_IDS, VAULT_MODES, splitAction } from "./assistantModes";

describe("assistant vault modes", () => {
  it("knows the same modes as the core, each with a directive carrying the action protocol", () => {
    expect([...VAULT_MODE_IDS].sort()).toEqual([...CORE_IDS].sort());
    expect(VAULT_MODES.map((m) => m.id).sort()).toEqual([...CORE_IDS].sort());
    for (const id of CORE_IDS) expect(VAULT_MODE_DIRECTIVES[id]).toContain("nv-action");
  });

  it("splits the visible reply from the action block", () => {
    const reply = 'Listo.\n\n```nv-action\n{"action":"create_note","args":{"path":"A","content":"x"}}\n```';
    const { text, action } = splitAction(reply);
    expect(text).toBe("Listo.");
    expect(action).toEqual({ action: "create_note", args: { path: "A", content: "x" } });
  });

  it("hides a block that is still streaming and ignores a malformed one", () => {
    expect(splitAction('Hola\n```nv-action\n{"action":"cre')).toEqual({ text: "Hola", action: null });
    expect(splitAction("Hola\n```nv-action\n{no json}\n```").action).toBeNull();
    expect(splitAction("solo texto")).toEqual({ text: "solo texto", action: null });
  });
});

describe("splitAction tolerance", () => {
  it("accepts the fields beside `action` when the model forgets `args`", () => {
    const reply = 'ok\n```nv-action\n{"action":"create_syllabus","subject":"JS","areas":[]}\n```';
    expect(splitAction(reply).action).toEqual({ action: "create_syllabus", args: { subject: "JS", areas: [] } });
  });
});
