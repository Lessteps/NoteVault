import { describe, expect, it } from "vitest";
import { buildMasterSyllabus, type PlanRef, type VaultTopic } from "./masterSyllabus.js";

const S = "Programación";
const vt = (folder: string, over: Partial<VaultTopic> = {}): VaultTopic => ({ folder: `${S}/${folder}`, title: folder.split("/").pop()!, skills: ["explain"], theory: true, map: true, practice: true, exercises: 0, ...over });

const topics: VaultTopic[] = [
  vt("2.1 Python/2.1.1 Project structure", { exercises: 4 }),
  vt("2.1 Python/2.1.1.1 venv", { exercises: 12 }),
  vt("2.1 Python/2.1.1.2 imports", { map: false }),
  vt("2.1 Python/2.1.2 Variables"),
  vt("2.1 Python/2.1.10 Classes"),
  vt("4 Backend/4.1 What the backend is"),
  vt("3 Desktop Apps (Electron)/3.1 What a desktop app is", { theory: false, map: false }),
];

const plan: PlanRef = {
  id: "2026-10-06_2027-04-05",
  name: "Full Stack",
  start: "2026-10-06",
  end: "2027-04-05",
  hoursPerWeek: 38.5,
  subplans: [
    {
      id: "s1",
      area: "Backend",
      objective: "Build APIs",
      groups: [
        { id: "lang-python", title: "Lenguaje: Python", kind: "language", order: 20 },
        { id: "backend-fundamentals", title: "Backend fundamentals", kind: "knowledge", order: 30 },
      ],
      topics: [
        { folder: `${S}/4 Backend/4.1 What the backend is`, title: "4.1", estMinutes: 90, targetWeek: 3, group: "backend-fundamentals" },
        { folder: `${S}/2.1 Python/2.1.10 Classes`, title: "2.1.10", estMinutes: 150, targetWeek: 2, group: "lang-python" },
        { folder: `${S}/2.1 Python/2.1.1.2 imports`, title: "2.1.1.2", estMinutes: 30, targetWeek: 1, group: "lang-python" },
        { folder: `${S}/2.1 Python/2.1.1 Project structure`, title: "2.1.1", estMinutes: 150, targetWeek: 1, group: "lang-python", completedAt: "2026-10-08" },
        { folder: `${S}/2.1 Python/2.1.1.1 venv`, title: "2.1.1.1", estMinutes: 45, targetWeek: 1, group: "lang-python" },
        { folder: `${S}/2.1 Python/2.1.2 Variables`, title: "2.1.2", estMinutes: 150, targetWeek: 1, group: "lang-python", route: "skipped" },
      ],
    },
  ],
};

describe("buildMasterSyllabus", () => {
  const { markdown, json } = buildMasterSyllabus({ space: S, topics, plans: [plan], indexFiles: ["00 Routes by role.md", "00 Temario.md"] });

  it("organizes route → area → subject → topic, in numeric order (2.1.2 before 2.1.10)", () => {
    expect(json.routes).toHaveLength(1);
    const area = json.routes[0]!.areas[0]!;
    expect(area).toMatchObject({ area: "Backend", objective: "Build APIs" });
    expect(area.subjects.map((s) => s.title)).toEqual(["Lenguaje: Python", "Backend fundamentals"]);
    expect(area.subjects[0]!.topics.map((t) => t.number)).toEqual(["2.1.1", "2.1.1.1", "2.1.1.2", "2.1.10"]);
  });

  it("links pieces to the chapter they hang from and carries minutes, week and state", () => {
    const py = json.routes[0]!.areas[0]!.subjects[0]!.topics;
    expect(py.find((t) => t.number === "2.1.1.1")).toMatchObject({ parent: `${S}/2.1 Python/2.1.1 Project structure`, estMinutes: 45, targetWeek: 1, theory: true, map: true, practice: true, exercises: 12 });
    expect(py.find((t) => t.number === "2.1.1")).toMatchObject({ parent: null, done: true, exercises: 4 });
    expect(py.find((t) => t.number === "2.1.1.2")).toMatchObject({ map: false });
    expect(json.routes[0]!.areas[0]!.subjects[0]!.minutes).toBe(150 + 45 + 30 + 150);
  });

  it("leaves skipped topics out of the route and puts them, with everything unscheduled, in the library", () => {
    const inRoute = json.routes[0]!.areas[0]!.subjects.flatMap((s) => s.topics.map((t) => t.folder));
    expect(inRoute).not.toContain(`${S}/2.1 Python/2.1.2 Variables`);
    const lib = json.library.flatMap((a) => a.topics.map((t) => t.number));
    expect(lib).toEqual(expect.arrayContaining(["2.1.2", "3.1"]));
    expect(json.library.map((a) => a.areaFolder)).toEqual([`${S}/2.1 Python`, `${S}/3 Desktop Apps (Electron)`]);
  });

  it("summarizes the whole vault", () => {
    expect(json.summary).toEqual({ topics: 7, withTheory: 6, withMap: 5, withPractice: 7, withExercises: 2, exercises: 16, plans: 1, topicsInPlans: 5, notInAnyPlan: 2 });
  });

  it("renders readable Markdown: legend, routes, subjects with totals, nested pieces and flags", () => {
    expect(markdown).toContain("# Master syllabus — Programación");
    expect(markdown).toContain("nv:master-syllabus");
    expect(markdown).toContain("## Route: Full Stack");
    expect(markdown).toContain("### Area: Backend");
    expect(markdown).toContain("#### Subject: Lenguaje: Python (language) — 4 topics · 6.3 h");
    expect(markdown).toContain("- `2.1.1` [[2.1.1 Project structure]] · 2.5 h · week 1 · TMP E4 ✓ done");
    expect(markdown).toContain("  - `2.1.1.1` [[2.1.1.1 venv]] · 45 min · week 1 · TMP E12");
    expect(markdown).toContain("  - `2.1.1.2` [[2.1.1.2 imports]] · 30 min · week 1 · T·P E0");
    expect(markdown).toContain("## Library: in the vault but not in any route");
    expect(markdown).toContain("`3.1` [[3.1 What a desktop app is]] · ··P E0");
    expect(markdown).toContain("`00 Routes by role.md` · `00 Temario.md`");
  });

  it("is deterministic: the same input gives the same bytes", () => {
    const again = buildMasterSyllabus({ space: S, topics: [...topics].reverse(), plans: [plan], indexFiles: ["00 Routes by role.md", "00 Temario.md"] });
    expect(again.markdown).toBe(markdown);
    expect(JSON.stringify(again.json)).toBe(JSON.stringify(json));
  });

  it("works without plans (everything is library) and without topics", () => {
    const none = buildMasterSyllabus({ space: S, topics, plans: [] });
    expect(none.json.routes).toEqual([]);
    expect(none.json.summary.notInAnyPlan).toBe(7);
    expect(none.markdown).not.toContain("## Route:");
    expect(buildMasterSyllabus({ space: S, topics: [], plans: [] }).markdown).toContain("| 0 | 0 | 0 |");
  });
});
