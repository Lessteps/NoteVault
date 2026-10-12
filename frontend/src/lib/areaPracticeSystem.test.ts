// Sistema de práctica por área: tablas, plantillas de kata deterministas y por nivel, calendario de katas del plan.

import { describe, expect, it } from "vitest";
import { AREA_SKILLS, areaKataSkillId } from "./planAreaPractice";
import {
  areaFiles,
  areaKataDates,
  areaStartDate,
  areaPracticeFor,
  areaPracticeSystem,
  declaredLevelOf,
  kataDatesOfPlan,
  kataForDay,
  kataIndexOn,
  kataLevel,
  kataNote,
  levelFromDeclared,
  PRACTICE_AREA_IDS,
  practiceAreasOf,
  skillOfDay,
  type KataPlanLike,
} from "./areaPracticeSystem";
import { parseExercise } from "../core/practice/exerciseNote";

const plan = (over: Partial<KataPlanLike> = {}): KataPlanLike => ({
  start: "2026-10-05", // lunes
  end: "2026-10-18",
  programmingPractice: { kata: { days: [1, 2, 3, 4, 5], minutesPerDay: 25 } },
  preconditions: { blockedDates: ["2026-10-07"], levels: { Programación: "intermedio" } },
  subplans: [{ area: "Backend", areaId: "backend" }, { area: "Frontend", areaId: "frontend" }, { area: "Otra", areaId: "x" }, { area: "Backend 2", areaId: "backend" }],
  ...over,
});

describe("AREA_SKILLS y estructura de cada área", () => {
  it("cada área tiene 6 habilidades con 3 niveles, plantilla de kata y carpeta propia", () => {
    for (const id of PRACTICE_AREA_IDS) {
      const skills = AREA_SKILLS[id]!;
      expect(skills.length, id).toBeGreaterThanOrEqual(5);
      for (const s of skills) {
        expect(s.levels, `${id}.${s.id}`).toHaveLength(3);
        expect(s.measure.length).toBeGreaterThan(10);
      }
      expect(new Set(skills.map((s) => s.id)).size).toBe(skills.length);
      const sys = areaPracticeSystem(id)!;
      expect(sys.structure.map((x) => x.path)).toEqual([`${sys.folder}/README.md`, `${sys.folder}/skills.md`, `${sys.folder}/katas/`, `${sys.folder}/projects/`]);
      expect(sys.ledgerSkill).toBe(areaKataSkillId(id));
      // todas las habilidades producen un kata en todos los niveles
      skills.forEach((_s, i) => {
        for (const lvl of [1, 2, 3]) expect(kataForDay(id, i + 1, lvl), `${id} día ${i + 1} nivel ${lvl}`).not.toBeNull();
      });
    }
    expect(areaPracticeSystem("nope")).toBeNull();
    expect(kataForDay("nope", 1, 1)).toBeNull();
  });
});

describe("kataForDay", () => {
  it("es determinista: mismo área, día y nivel dan siempre el mismo kata", () => {
    expect(kataForDay("backend", 12, 2)).toEqual(kataForDay("backend", 12, 2));
    expect(kataNote(kataForDay("frontend", 5, 1)!)).toBe(kataNote(kataForDay("frontend", 5, 1)!));
  });
  it("rota por todas las habilidades del área y no repite el título dos días seguidos", () => {
    const skills = AREA_SKILLS.backend!;
    const days = Array.from({ length: skills.length * 3 }, (_, i) => kataForDay("backend", i + 1, 1)!);
    expect(new Set(days.slice(0, skills.length).map((k) => k.skillId)).size).toBe(skills.length);
    for (let i = 1; i < days.length; i++) expect(days[i]!.title).not.toBe(days[i - 1]!.title);
    expect(skillOfDay("backend", skills.length + 1)!.id).toBe(skills[0]!.id);
  });
  it("la dificultad sube con el nivel y cada 7.º kata es un reto de un nivel más", () => {
    const a = kataForDay("databases", 1, 1)!;
    const c = kataForDay("databases", 1, 3)!;
    expect(a.level).toBe(1);
    expect(c.level).toBe(3);
    expect(a.minutes).toBe(20);
    expect(c.minutes).toBe(30);
    expect(a.statement).toContain(AREA_SKILLS.databases![0]!.levels[0]);
    expect(c.statement).toContain(AREA_SKILLS.databases![0]!.levels[2]);
    expect(a.statement).not.toBe(c.statement);
    expect(kataForDay("databases", 7, 1)!.level).toBe(2);
    expect(kataForDay("databases", 7, 3)!.level).toBe(3);
    expect(kataForDay("databases", 7, 1)!.statement).toContain("Stretch");
  });
  it("no deja marcadores sin sustituir y la lógica es propia del área", () => {
    for (const id of PRACTICE_AREA_IDS) {
      for (let d = 1; d <= AREA_SKILLS[id]!.length * 2; d++) {
        const k = kataForDay(id, d, 2)!;
        const text = kataNote(k);
        expect(text, `${id} ${d}`).not.toMatch(/\{(noun|plural|fields|rule|context|Noun)\}/);
        expect(k.criteria.length).toBeGreaterThanOrEqual(4);
        expect(k.hints).toHaveLength(2);
      }
    }
    expect(kataForDay("backend", 1, 1)!.statement.toLowerCase()).toMatch(/endpoint|http|status/);
    expect(kataForDay("databases", 2, 1)!.statement.toLowerCase()).toMatch(/query|join/);
    expect(kataForDay("frontend", 4, 1)!.statement.toLowerCase()).toMatch(/atom|molecule|organism/);
  });
  it("la nota del kata es un ejercicio que la app entiende y la solución va en su sección aparte", () => {
    const k = kataForDay("backend", 3, 2)!;
    const ex = parseExercise(kataNote(k), "backend/katas/003.md");
    expect(ex.skill).toBe("pp_kata");
    expect(ex.mode).toBe("pp_kata");
    expect(ex.difficulty).toBe(2);
    expect(ex.minutes).toBe(25);
    expect(ex.frontmatter.area).toBe("backend");
    expect(ex.frontmatter.kata_skill).toBe("pp_kata:backend");
    expect(ex.statement).toContain("Task");
    expect(ex.statement).not.toContain(k.solution);
    expect(ex.solution).toContain(k.solution.slice(0, 20));
    expect(ex.hints).toHaveLength(2);
    expect(ex.rubric.length).toBe(4);
    expect(ex.typical_errors).toHaveLength(2);
  });
});

describe("niveles", () => {
  it("el nivel declarado se interpreta y sube cada 40 katas hechos hasta 3", () => {
    expect([levelFromDeclared("basico"), levelFromDeclared("Intermedio"), levelFromDeclared("avanzado"), levelFromDeclared(undefined)]).toEqual([1, 2, 3, 1]);
    expect([kataLevel("basico", 0), kataLevel("basico", 40), kataLevel("basico", 80), kataLevel("basico", 400), kataLevel("intermedio", 40)]).toEqual([1, 2, 3, 3, 3]);
    expect(declaredLevelOf({ Programación: "intermedio" }, "backend")).toBe("intermedio");
    expect(declaredLevelOf({ Backend: "avanzado", Programación: "basico" }, "backend")).toBe("avanzado");
    expect(declaredLevelOf(undefined, "backend")).toBeUndefined();
  });
});

describe("archivos de la carpeta de un área", () => {
  it("README, .practica.md, skills.md, katas/README, projects/README y los katas pedidos, con rutas bajo la carpeta del área", () => {
    const files = areaFiles("tooling", { katasPerArea: 3 });
    expect(files.map((f) => f.rel)).toEqual([
      "tooling-and-quality/README.md",
      "tooling-and-quality/tooling-and-quality.practica.md",
      "tooling-and-quality/skills.md",
      "tooling-and-quality/katas/README.md",
      "tooling-and-quality/projects/README.md",
      ...[1, 2, 3].map((d) => `tooling-and-quality/katas/${kataForDay("tooling", d, 1)!.file}`),
    ]);
    expect(files[0]!.content).toContain("## How to practise");
    // la vista de práctica del área (como kata/kata.practica.md): sus habilidades esenciales y cómo se practica a diario
    expect(files[1]!.kind).toBe("practica");
    expect(files[1]!.content).toContain("type: practica");
    expect(files[1]!.content).toContain('skills: ["pp_kata:tooling"]');
    expect(files[1]!.content).toContain("Linting and code quality");
    expect(files[2]!.content).toContain("| Skill | Why it matters | How it is measured |");
    expect(areaFiles("tooling", { katasPerArea: 2, fromDay: 5 }).filter((f) => f.kind === "kata").map((f) => f.day)).toEqual([5, 6]);
    expect(areaFiles("nope")).toEqual([]);
  });
});

describe("calendario de katas del plan", () => {
  it("los días de kata saltan fines de semana y fechas bloqueadas, y se numeran desde 1", () => {
    const dates = kataDatesOfPlan(plan());
    expect(dates).toEqual(["2026-10-05", "2026-10-06", "2026-10-08", "2026-10-09", "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"]);
    expect(kataIndexOn(plan(), "2026-10-08")).toBe(3);
    expect(kataIndexOn(plan(), "2026-10-10")).toBe(0);
    expect(kataIndexOn(plan(), "2026-10-07")).toBe(0);
    expect(kataDatesOfPlan(plan({ programmingPractice: undefined }))).toEqual([]);
  });
  it("areaPracticeFor: un kata por área del plan (sin repetir ni áreas desconocidas), con el nivel declarado", () => {
    expect(practiceAreasOf(plan()).map((a) => a.areaId)).toEqual(["backend", "frontend"]);
    const day = areaPracticeFor(plan(), "2026-10-08");
    expect(day.map((d) => d.areaId)).toEqual(["backend", "frontend"]);
    expect(day[0]!.day).toBe(3);
    expect(day[0]!.kata.level).toBe(2); // intermedio
    expect(day[0]!.rel).toBe(`backend/katas/${day[0]!.kata.file}`);
    expect(areaPracticeFor(plan(), "2026-10-10")).toEqual([]);
    expect(areaPracticeFor(plan(), "2026-10-08", { backend: 3 })[0]!.kata.level).toBe(3);
  });
});

describe("todas las áreas desde el día 1 (solo Automation puede empezar más tarde)", () => {
  const p = (): KataPlanLike =>
    plan({
      end: "2026-12-31",
      preconditions: { blockedDates: [], levels: {} },
      subplans: [
        { area: "Backend", areaId: "backend", phase: { fromWeek: 1 } },
        { area: "Frontend", areaId: "frontend", phase: { fromWeek: 18 } },
        { area: "Automation", areaId: "automation", phase: { fromWeek: 3 } },
        { area: "Tooling", areaId: "tooling", phase: { fromWeek: 24 } },
      ],
    });
  it("Frontend (fase en la semana 18) y Tooling tienen su kata nº 1 el primer día del plan; Automation, en su semana", () => {
    const first = areaPracticeFor(p(), "2026-10-05");
    expect(first.map((d) => [d.areaId, d.day])).toEqual([["backend", 1], ["frontend", 1], ["tooling", 1]]);
    expect(areaStartDate(p(), "frontend")).toBe("2026-10-05");
    expect(areaStartDate(p(), "automation")).toBe("2026-10-19");
    expect(areaKataDates(p(), "automation")[0]).toBe("2026-10-19");
    const wk3 = areaPracticeFor(p(), "2026-10-19");
    expect(wk3.find((d) => d.areaId === "automation")!.day).toBe(1);
    expect(wk3.find((d) => d.areaId === "frontend")!.day).toBe(11);
  });
});

describe("área de lógica de programación: problemas de entrevista por nivel", () => {
  const ids = ["problem_framing", "arrays_strings", "hashing_counting", "two_pointers_window", "sorting_searching", "recursion_backtracking", "stacks_queues", "trees_graphs", "dynamic_programming", "complexity_analysis"];

  it("tiene sus diez habilidades y cada día de kata rota por ellas, sin depender de un lenguaje", () => {
    const sys = areaPracticeSystem("logic")!;
    expect(sys.skills.map((x) => x.id)).toEqual(ids);
    expect(sys.folder).toBe("programming-logic");
    expect(sys.languages).toEqual(["Cualquier lenguaje"]);
    expect(Array.from({ length: 10 }, (_, i) => kataForDay("logic", i + 1, 1)!.skillId)).toEqual(ids);
    expect(kataForDay("logic", 11, 1)!.skillId).toBe("problem_framing");
  });

  it("el MISMO día cambia el problema según el nivel: fácil, medio y difícil", () => {
    for (let d = 1; d <= 10; d++) {
      const [e, m, h] = [1, 2, 3].map((l) => kataForDay("logic", d, l)!);
      if (d % 7 === 0) {
        // cada 7.º kata es un reto: un nivel por encima del habitual (el difícil no puede subir más)
        expect([e!.level, m!.level, h!.level]).toEqual([2, 3, 3]);
        expect(e!.statement).toContain("Stretch kata");
        continue;
      }
      expect(new Set([e!.statement, m!.statement, h!.statement]).size).toBe(3);
      expect([e!.level, m!.level, h!.level]).toEqual([1, 2, 3]);
      expect([e!.minutes, m!.minutes, h!.minutes]).toEqual([20, 25, 30]);
      // todos traen enunciado, solución, pistas y errores típicos
      expect(e!.solution.length).toBeGreaterThan(40);
      expect(e!.hints).toHaveLength(2);
      expect(e!.typicalErrors).toHaveLength(2);
    }
  });

  it("los katas de las demás áreas siguen igual para los tres niveles (misma tarea, cambia solo lo que pide el nivel)", () => {
    const [a, b] = [1, 3].map((l) => kataForDay("backend", 1, l)!);
    expect(a!.statement.split("**This level asks you to:**")[0]!.replace(/\(\w+\)/, "")).toBe(b!.statement.split("**This level asks you to:**")[0]!.replace(/\(\w+\)/, ""));
  });

  it("su carpeta lleva README, programming-logic.practica.md con las habilidades y los katas bajo katas/", () => {
    const files = areaFiles("logic", { katasPerArea: 2 });
    expect(files.map((f) => f.rel).slice(0, 2)).toEqual(["programming-logic/README.md", "programming-logic/programming-logic.practica.md"]);
    const practica = files.find((f) => f.kind === "practica")!;
    expect(practica.content).toContain('skills: ["pp_kata:logic"]');
    expect(practica.content).toContain("Dynamic programming");
    expect(files.filter((f) => f.kind === "kata")).toHaveLength(2);
  });
});
