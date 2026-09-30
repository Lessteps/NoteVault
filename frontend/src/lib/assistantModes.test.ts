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
    expect(splitAction('Hola\n```nv-action\n{"action":"cre')).toEqual({ text: "Hola", action: null, ask: null, skills: null });
    expect(splitAction("Hola\n```nv-action\n{no json}\n```").action).toBeNull();
    expect(splitAction("solo texto")).toEqual({ text: "solo texto", action: null, ask: null, skills: null });
  });

  it("reads a question with options and a competency checklist", () => {
    const ask = splitAction('¿Cuál?\n```nv-ask\n{"question":"¿Qué competencias?","options":["Cálculo rápido",{"label":"Problemas","value":"solve"}]}\n```');
    expect(ask.text).toBe("¿Cuál?");
    expect(ask.ask).toEqual({
      question: "¿Qué competencias?",
      options: [{ label: "Cálculo rápido", value: "Cálculo rápido" }, { label: "Problemas", value: "solve" }],
      multiple: false,
    });
    const sk = splitAction('```nv-skills\n{"topic":"A/B","title":"T","skills":[{"skill":"drill","label":"Cálculo rápido","recommended":true,"levels":[3,3,2],"why":"x","how":"y"}]}\n```');
    expect(sk.skills?.skills[0]?.skill).toBe("drill");
    expect(sk.text).toBe("");
  });
});

describe("splitAction tolerance", () => {
  it("accepts the fields beside `action` when the model forgets `args`", () => {
    const reply = 'ok\n```nv-action\n{"action":"create_syllabus","subject":"JS","areas":[]}\n```';
    expect(splitAction(reply).action).toEqual({ action: "create_syllabus", args: { subject: "JS", areas: [] } });
  });
});
