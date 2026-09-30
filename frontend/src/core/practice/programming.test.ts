import { describe, expect, it } from "vitest";
import { PROGRAMMING_EXTRA_IDS } from "../../lib/programmingSkillData";
import { PROGRAMMING_SKILLS as CLIENT_PROGRAMMING_SKILLS } from "../../lib/skills";
import { DISCIPLINES, disciplineFor, programmingDisciplineOfPath } from "./disciplineCatalog";
import { MODES, modeFor } from "./modes";
import { buildProgrammingExercisePrompt, formatProgrammingExerciseNote, languageOfDiscipline } from "./programmingExercises";
import { buildExerciseGenerationPrompt, formatExerciseNote } from "./sessionBuilder";
import { PROGRAMMING_SKILLS, skillsForSubject } from "./skills";
import { createDefaultTopicManifest } from "./topic";

const topic = (folder: string, title = "Cola de trabajos") => ({ ...createDefaultTopicManifest(folder, title, "programming", []), folder });

describe("programming competencies", () => {
  it("has the original eight plus the seven new ones, in the core and in the client mirror", () => {
    expect(PROGRAMMING_SKILLS.map((s) => s.id)).toEqual(["implement", "debug", "refactor", "design", "commands", "explain", "cloze", "find_error", ...PROGRAMMING_EXTRA_IDS]);
    expect(PROGRAMMING_EXTRA_IDS).toEqual(["trace", "review", "test", "analyze", "decompose", "port", "query"]);
    expect(CLIENT_PROGRAMMING_SKILLS.map((s) => s.id)).toEqual(PROGRAMMING_SKILLS.map((s) => s.id));
    expect(skillsForSubject("programming")).toBe(PROGRAMMING_SKILLS);
  });

  it("every new skill is a mode of programming only, and the ones that need a code-reading base skip beginner", () => {
    for (const id of PROGRAMMING_EXTRA_IDS) {
      expect(MODES[id]!.subjects).toEqual(["programming"]);
      expect(MODES[id]!.description.length).toBeGreaterThan(10);
    }
    const by = Object.fromEntries(PROGRAMMING_SKILLS.map((s) => [s.id, s]));
    expect(by.review!.allowedDifficulties).toEqual([2, 3]);
    expect(by.analyze!.allowedDifficulties).toEqual([2, 3]);
    expect(by.port!.allowedDifficulties).toEqual([2, 3]);
    expect(by.trace!.allowedDifficulties).toEqual([1, 2, 3]);
    expect(by.test!.allowedDifficulties).toEqual([1, 2, 3]);
    // never shared with mathematics or english
    expect(skillsForSubject("mathematics").some((s) => PROGRAMMING_EXTRA_IDS.includes(s.id))).toBe(false);
    expect(() => modeFor({ subject: "english", mode: "trace" })).toThrow();
  });
});

describe("discipline by area of the Programación space", () => {
  it("maps each area folder to its discipline, whether the path is relative or absolute", () => {
    const cases: Array<[string, string]> = [
      ["Programación/1 Fundamentos/1.7 Variables", "programming_logic"],
      ["Programación/2.1 Python/2.1.4 Funciones", "python"],
      ["Programación/2.2 JavaScript/2.2.1 Tipos", "javascript"],
      ["Programación/2.3 TypeScript/2.3.2 Genéricos", "typescript"],
      ["Programación/3 Apps de escritorio (Electron)/3.5 IPC", "desktop"],
      ["Programación/4 Backend/4.9 Autenticación", "backend"],
      ["Programación/5 Frontend/5.7 Estado", "frontend"],
      ["Programación/6 Bases de datos/6.5 JOINs", "sql"],
      ["Programación/7 Automatización/7.6 n8n", "automation"],
      ["Programación/8 Móvil/8.3 React Native", "mobile"],
      ["Programación/9 Herramientas y calidad/9.7 Docker", "devtools"],
      ["C:/PROGRAMMING/Programación/4 Backend/4.9 Autenticación", "backend"],
      ["Otra cosa/sin numero", "programming_logic"],
    ];
    for (const [p, id] of cases) expect(programmingDisciplineOfPath(p), p).toBe(id);
    // Windows separators too
    expect(programmingDisciplineOfPath("Programación/5 Frontend/5.7 Estado".split("/").join(String.fromCharCode(92)))).toBe("frontend");
    for (const id of new Set(cases.map((c) => c[1]))) expect(DISCIPLINES[id], id).toBeDefined();
  });

  it("every discipline offers modes that exist, and its skills are unique and have failure modes", () => {
    for (const d of Object.values(DISCIPLINES).filter((x) => x.subject === "programming")) {
      for (const m of d.modes) expect(MODES[m], `${d.id}:${m}`).toBeDefined();
      expect(new Set(d.skills.map((s) => s.title)).size).toBe(d.skills.length);
      expect(d.skills.every((s) => s.anchors.length > 0)).toBe(true);
    }
  });
});

describe("programming exercises", () => {
  it("are asked for in programming terms (language by area, code blocks, behaviour) and never as maths", () => {
    const msgs = buildExerciseGenerationPrompt(topic("Programación/4 Backend/4.13 Webhooks"), [], "review", 2, "no_help", 3);
    const system = msgs[0]!.content;
    expect(system).toContain("PROGRAMMING");
    expect(system).toContain("Discipline: Backend");
    expect(system).toContain("Python 3.12 with FastAPI");
    expect(system).toContain("REAL planted problems");
    expect(system).toContain("N+1 queries");
    expect(system).not.toMatch(/theorem|LaTeX/i);
    expect(msgs[1]!.content).toContain("Skill: review");
    // mathematics keeps its own prompt
    const math = buildExerciseGenerationPrompt(createDefaultTopicManifest("Matemáticas/1 A/1.1 X", "X", "mathematics", []), [], "solve", 1, "helper", 2)[0]!.content;
    expect(math).toContain("theorems");
  });

  it("carry the language into the framing and the error record into the request", () => {
    expect(languageOfDiscipline("desktop")).toContain("Electron");
    const user = buildProgrammingExercisePrompt(topic("Programación/3 Apps de escritorio (Electron)/3.5 IPC", "IPC"), [], "debug", 3, "helper", 2, ["Fallo: confía en los argumentos"])[1]!.content;
    expect(user).toContain("REGISTRO DE ERRORES");
    expect(user).toContain("confía en los argumentos");
  });

  it("are written with their discipline so they are graded as programming, in the right area", () => {
    const note = formatExerciseNote(topic("Programación/2.1 Python/2.1.9 Decoradores", "Decoradores"), "trace", 2, "helper", { title: "Traza", statement: "```python\nprint(1)\n```", hints: ["a"], solution: "1", rubric: ["exacto"] });
    expect(note).toContain("subject: programming");
    expect(note).toContain("mode: trace");
    expect(note).toContain("discipline: python");
    expect(note).toContain("assistance: helper");
    expect(disciplineFor({ subject: "programming", discipline: "python" }).id).toBe("python");
    expect(formatProgrammingExerciseNote(topic("Programación/6 Bases de datos/6.5 JOINs"), "query", 1, "no_help", { title: "t", statement: "s", hints: [], solution: "x", rubric: [] })).toContain("discipline: sql");
  });
});
