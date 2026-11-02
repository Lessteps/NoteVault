import { describe, expect, it } from "vitest";
import { buildExternalPlanDoc, externalPlanChatPrompt, externalPlanShortPrompt } from "./planExternal";

const input = { system: "REGLAS DEL MENTOR\nHECHOS FIJOS\nfolder=Programación/A", request: "Quiero un plan del 2027-01-01 al 2027-03-01.", answerAbs: "/v/Programación/_handoff/planes/x_plan_respuesta.json", today: "2026-11-02", topics: 12 };

describe("buildExternalPlanDoc", () => {
  const doc = buildExternalPlanDoc(input);
  it("incluye las reglas del Mentor, la petición y la ruta absoluta de la respuesta", () => {
    expect(doc).toContain("REGLAS DEL MENTOR");
    expect(doc).toContain("Quiero un plan del 2027-01-01 al 2027-03-01.");
    expect(doc).toContain("/v/Programación/_handoff/planes/x_plan_respuesta.json");
    expect(doc).toContain("12 topics");
  });
  it("exige un solo objeto json y solo temas del catálogo, y no deja tocar la app", () => {
    expect(doc).toContain('"type": "plan_draft"');
    expect(doc).toMatch(/only from the catalog/i);
    expect(doc).toMatch(/Do not modify the NoteVault app/);
    expect(doc).toMatch(/```json/);
  });
});

describe("frases para pegar", () => {
  it("la corta apunta al archivo y a la respuesta, y empieza una tarea nueva", () => {
    const p = externalPlanShortPrompt("/v/a.md", "/v/r.json");
    expect(p).toMatch(/^NEW TASK/);
    expect(p).toContain("/v/a.md");
    expect(p).toContain("/v/r.json");
  });
  it("la de chat web incluye el documento entero y pide la respuesta en el chat", () => {
    const p = externalPlanChatPrompt("DOC");
    expect(p.startsWith("DOC")).toBe(true);
    expect(p).toMatch(/inside a ```json block/);
  });
});
