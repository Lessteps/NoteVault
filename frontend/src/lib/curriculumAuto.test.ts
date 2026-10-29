import { describe, expect, it } from "vitest";
import { appendTemarioLine, autoFixMessage, autoNoteMessages, cleanNoteReply } from "./curriculumAuto";
import { planEntries } from "./curriculumPrompt";
import type { CurriculumArea } from "./curriculum";

const AREA: CurriculumArea = { id: "css", title: "CSS", space: "Programación", areaFolder: "5 Frontend/CSS", prefix: "5.19", entries: [] };
const planned = (parentId?: string) => planEntries(AREA, [{ entry: { id: "css.flex-wrap", category: "Flex container properties", title: "flex-wrap", importance: "esencial", items: ["flex-wrap"], keywords: ["flex-wrap"], ...(parentId ? { parentId } : {}) }, suggestedFolder: "Programación/5 Frontend/CSS/5.19.7.2 flex-wrap" }])[0]!;

describe("autoNoteMessages", () => {
  it("lleva el tema, sus elementos, la skill y el contrato", () => {
    const [sys, user] = autoNoteMessages(planned(), "CSS", { skills: { resumenTeorico: "THEORY SKILL" }, linkable: ["5.19.7 Flex container properties"] });
    expect(sys!.role).toBe("system");
    expect(user!.content).toContain("`5.19.7.2 flex-wrap`");
    expect(user!.content).toContain("THEORY SKILL");
    expect(user!.content).toContain("## Cards");
    expect(user!.content).toContain("5.19.7 Flex container properties");
    expect(user!.content).not.toContain("ATOMIC TOPIC");
  });
  it("un subtema atómico pide ir a fondo en UNA pieza", () => {
    expect(autoNoteMessages(planned("css.flex-container"), "CSS", { skills: {}, linkable: [] })[1]!.content).toContain("ATOMIC TOPIC");
  });
  it("el mensaje de corrección lista los problemas", () => {
    expect(autoFixMessage(["falta Cards"], "5.19.7.2 flex-wrap")).toContain("- falta Cards");
  });
});

describe("cleanNoteReply", () => {
  it("quita la valla y un frontmatter propio", () => {
    expect(cleanNoteReply("```markdown\n---\nid: x\n---\n# T\n\nbody\n```")).toBe("# T\n\nbody");
  });
});

describe("appendTemarioLine", () => {
  const T = "# Syllabus\n\n## 4 Backend\n- [[4.1 HTTP]]\n\n## 5 Frontend/CSS\n- [[5.19.1 A]]\n\n## 6 Databases\n- [[6.1 SQL]]\n";
  it("añade al final de SU sección y no a otra", () => {
    const out = appendTemarioLine(T, "## 5 Frontend/CSS", "- [[5.19.2 B]]");
    expect(out.indexOf("- [[5.19.2 B]]")).toBeGreaterThan(out.indexOf("- [[5.19.1 A]]"));
    expect(out.indexOf("- [[5.19.2 B]]")).toBeLessThan(out.indexOf("## 6 Databases"));
  });
  it("crea la sección si no existe y es idempotente", () => {
    const out = appendTemarioLine(T, "## 5 Frontend/HTML", "- [[5.18.1 X]]");
    expect(out).toContain("## 5 Frontend/HTML\n- [[5.18.1 X]]");
    expect(appendTemarioLine(out, "## 5 Frontend/HTML", "- [[5.18.1 X]]")).toBe(out);
  });
});
