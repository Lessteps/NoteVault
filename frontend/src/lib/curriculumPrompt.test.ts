import { describe, expect, it } from "vitest";
import type { CurriculumArea, CurriculumEntry } from "./curriculum";
import { buildCurriculumTask, isValidTopicFolderName, itemCovered, noteFrontmatter, planEntries, practicaManifest, SKILL_LIMITS, temarioLine, topicFolderName } from "./curriculumPrompt";

const entry = (id: string, title: string, items: string[], importance: CurriculumEntry["importance"] = "esencial"): CurriculumEntry => ({ id, category: "Layout", title, importance, items, keywords: ["flex"] });
const AREA: CurriculumArea = {
  id: "css",
  title: "CSS",
  space: "Programación",
  areaFolder: "12 CSS",
  entries: [entry("css.flex-container", "Flexbox container", ["display: flex", "flex-direction", "justify-content"]), entry("css.grid", "Grid container", ["display: grid", "grid-template-columns"], "recomendado")],
};
const SELECTED = [
  { entry: AREA.entries[0]!, suggestedFolder: "Programación/12 CSS/12.7 Flexbox container" },
  { entry: AREA.entries[1]!, suggestedFolder: "Programación/12 CSS/12.8 Grid container" },
];
const base = {
  vaultRoot: "C:\\PROGRAMMING",
  space: "Programación",
  area: AREA,
  entries: SELECTED,
  skills: { resumenTeorico: "THEORY SKILL TEXT", practica: "PRACTICE SKILL TEXT", temario: "SYLLABUS SKILL", mapa: "MAP SKILL", ejercicios: "EXERCISE SKILL" },
  today: "2026-10-26",
  id: "crear_x",
  taskAbs: "C:\\PROGRAMMING\\Programación\\_handoff\\crear\\2026-10-26_12-00-00_css.md",
  existingFolders: ["12.1 Selectors", "12.6 Colors"],
};

describe("folder names", () => {
  it("validates N.M Name, length and forbidden characters", () => {
    expect(isValidTopicFolderName("12.7 Flexbox container")).toBe(true);
    expect(isValidTopicFolderName("Flexbox")).toBe(false);
    expect(isValidTopicFolderName("12.7 a:b")).toBe(false);
    expect(isValidTopicFolderName(`12.7 ${"x".repeat(80)}`)).toBe(false);
  });
  it("builds a name cut at the colon, clean and at most 72 characters", () => {
    expect(topicFolderName("12.7", "Selectors: type, class and id")).toBe("12.7 Selectors");
    expect(topicFolderName("12.7", 'A "quoted" <thing>/path')).toBe("12.7 A quoted thing path");
    expect(topicFolderName("12.7", "y".repeat(100)).length).toBeLessThanOrEqual(72);
  });
});

describe("planEntries", () => {
  it("derives number, ids, type, skills and files from the suggested folder", () => {
    const [a] = planEntries(AREA, SELECTED);
    expect(a).toMatchObject({ number: "12.7", name: "12.7 Flexbox container", title: "Flexbox container", noteId: "programming.12-7-flexbox-container", topicType: "mixed", language: "css", discipline: "frontend" });
    expect(a!.skills.length).toBeLessThanOrEqual(6);
    expect(a!.practicaRel).toBe("Programación/12 CSS/12.7 Flexbox container/12.7 Flexbox container.practica.md");
  });
  it("rejects bad or repeated folders", () => {
    expect(() => planEntries(AREA, [{ entry: AREA.entries[0]!, suggestedFolder: "Programación/12.7 Flexbox" }])).toThrow(/dos niveles/);
    expect(() => planEntries(AREA, [{ entry: AREA.entries[0]!, suggestedFolder: "Programación/12 CSS/Flexbox" }])).toThrow(/no es un nombre/);
    expect(() => planEntries(AREA, [SELECTED[0]!, SELECTED[0]!])).toThrow(/repetida/);
  });
});

describe("contracts", () => {
  const [p] = planEntries(AREA, SELECTED);
  it("frontmatter has every field the app expects, incl. curriculum_id", () => {
    const fm = noteFrontmatter(p!, AREA, "12 CSS");
    for (const k of ["id: programming.12-7-flexbox-container", 'title: "Flexbox container"', 'number: "12.7"', 'area: "12 CSS"', 'topic: "12.7 Flexbox container"', "type: teorica", "topic_type: mixed", "difficulty: 1", "subject: programming", "language: css", "prerequisites: []", "status: draft", "verified: false", "sources: []", "curriculum_id: css.flex-container"]) expect(fm).toContain(k);
  });
  it("manifest keeps the fixed Spanish two-line body", () => {
    const m = practicaManifest(p!);
    expect(m).toContain("# Práctica — 12.7 Flexbox container");
    expect(m).toContain("Vista de práctica del tema: elige competencia, dificultad, cantidad y ayuda,\no consulta el resumen de progreso (matriz competencia × dificultad).");
    expect(m).toMatch(/skills: \["pg_true_false", "explain"/);
    expect(m).toContain("exam: required");
  });
  it("covers items ignoring case, backticks and spacing", () => {
    expect(itemCovered("1. `Display:   Flex` — x", "display: flex")).toBe(true);
    expect(itemCovered("nothing", "gap")).toBe(false);
  });
});

describe("buildCurriculumTask", () => {
  const t = buildCurriculumTask(base);
  it("names the vault, the folders (absolute) and the collision list", () => {
    expect(t.markdown).toContain("`C:\\PROGRAMMING`");
    expect(t.markdown).toContain("C:\\PROGRAMMING\\Programación\\12 CSS\\12.7 Flexbox container");
    expect(t.markdown).toContain("C:\\PROGRAMMING\\Programación\\12 CSS\\12.8 Grid container");
    expect(t.markdown).toContain("- 12.1 Selectors");
    expect(t.markdown).toMatch(/Never rename, move, delete or edit an existing folder/);
  });
  it("gives per entry the frontmatter, the items, the manifest and the Temario line", () => {
    expect(t.markdown).toContain("curriculum_id: css.flex-container");
    expect(t.markdown).toContain("curriculum_id: css.grid");
    expect(t.markdown).toContain("`display: flex`, `flex-direction`, `justify-content`");
    expect(t.markdown).toContain("12.7 Flexbox container.practica.md");
    expect(t.markdown).toContain("- [[12.7 Flexbox container]]");
    expect(t.markdown).toContain("Append, do not regenerate");
    expect(t.markdown).toContain("## 12 CSS");
    expect(t.markdown).toContain("<!-- nv:generated -->");
  });
  it("describes the reference block and the 4-bullet examples", () => {
    expect(t.markdown).toContain("**Reference — N items.**");
    expect(t.markdown).toContain("`- **Context:** …`");
    expect(t.markdown).toContain("**Why it works:**");
    expect(t.markdown).toContain("exactly 3 mistakes");
    expect(t.markdown).toMatch(/between 6 and 9 in total/);
  });
  it("inlines the skills and the map commands", () => {
    for (const s of ["THEORY SKILL TEXT", "PRACTICE SKILL TEXT", "SYLLABUS SKILL", "MAP SKILL"]) expect(t.markdown).toContain(s);
    expect(t.markdown).toContain('node tools/programming_kb/finalize.mjs "^12\\.7 "');
    expect(t.markdown).not.toContain("EXERCISE SKILL");
  });
  it("truncates a skill at its limit", () => {
    const long = buildCurriculumTask({ ...base, skills: { resumenTeorico: "x".repeat(SKILL_LIMITS.resumenTeorico + 500) + "TAILMARK" } });
    expect(long.markdown).not.toContain("TAILMARK");
  });
  it("short prompt points at the task file", () => {
    expect(t.shortPrompt).toBe(`Read \`${base.taskAbs}\` and execute it. Create only the folders and files that file lists, change nothing else, and tell me when you are done.`);
    expect(t.markdown).toContain(`> ${t.shortPrompt}`);
  });
  it("skips exercises by default and asks for 12-16 per topic with the flag", () => {
    expect(t.markdown).toContain("Skip exercises: the app generates them on demand");
    const w = buildCurriculumTask({ ...base, withExercises: true });
    expect(w.markdown).toContain("between 12 and 16 per topic");
    expect(w.markdown).toContain("Ejercicios/<skill>/ej_<skill>_d<difficulty>_<ts>_<i>.md");
    expect(w.markdown).toContain("EXERCISE SKILL");
    expect(w.markdown).toContain("12.7 → `frontend`");
  });
  it("asks to create the area folder only when it is new", () => {
    expect(buildCurriculumTask({ ...base, areaFolderExists: false }).markdown).toContain("12 CSS.resumen.md");
    expect(t.markdown).not.toContain("12 CSS.resumen.md");
  });
  it("is deterministic", () => {
    expect(buildCurriculumTask(base).markdown).toBe(t.markdown);
    expect(temarioLine({ name: "x" })).toBe("- [[x]]");
  });
  it("refuses an empty selection", () => {
    expect(() => buildCurriculumTask({ ...base, entries: [] })).toThrow(/al menos/);
  });
});
