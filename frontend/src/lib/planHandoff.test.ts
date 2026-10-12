// «Plan para otra IA»: el Markdown que se le da a otra IA con lo que falta crear.

import { describe, expect, it } from "vitest";
import { areaFiles } from "./areaPracticeSystem";
import { buildExecutionReport, type ReportInput } from "./planExecution";
import { buildHandoffMarkdown } from "./planHandoff";
import { evaluateTopicDesign, type TopicDesign, type TopicDesignInput } from "./topicDesign";
import type { CoverageReview } from "./planCoverage";

const READING_OK = "---\ntopic_type: mixed\n---\n## Requires\n## Explanation\n### What it is\n### Mental model\n## Examples\n### Example 1\n### Example 2\n### Example 3\n## Common mistakes\n### Mistake 1\n### Mistake 2\n### Mistake 3\n### Mistake 4\n## Connections\n## Cards\n### 1 · a\n### 2 · a\n### 3 · a\n### 4 · a\n### 5 · a\n### 6 · a\n";
const f = (n: string) => `Programación/4 Backend/${n}`;
const design = (folder: string, o: Partial<TopicDesignInput>): TopicDesign =>
  evaluateTopicDesign({ folder, title: folder.split("/").pop()!, subject: "programming", exists: true, files: [], exercises: [], ...o });
const man = { topicType: "mixed", skills: ["implement", "pg_true_false"] };
const complete = (folder: string) =>
  design(folder, { files: ["T.md", "T — mapa.canvas", "T.practica.md"], theoryText: READING_OK, manifest: man, exercises: [1, 2, 3].flatMap((d) => ["implement", "pg_true_false"].map((skill) => ({ skill, difficulty: d }))) });

const topics = [
  { folder: f("4.1 Listo"), title: "4.1 Listo", areaKey: "backend", area: "Backend", week: 1 },
  { folder: f("4.2 SinCanvas"), title: "4.2 SinCanvas", areaKey: "backend", area: "Backend", week: 1 },
  { folder: f("4.3 SinTeoria"), title: "4.3 SinTeoria", areaKey: "backend", area: "Backend", week: 3 },
  { folder: f("4.4 NoExiste"), title: "4.4 NoExiste", areaKey: "backend", area: "Backend", week: 2 },
  { folder: "Programación/5 Frontend/5.1 Botones", title: "5.1 Botones", areaKey: "frontend", area: "Frontend", week: 1 },
  { folder: f("4.5 Hecho"), title: "4.5 Hecho", areaKey: "backend", area: "Backend", week: 1, completed: true },
  { folder: f("4.6 Fuera"), title: "4.6 Fuera", areaKey: "backend", area: "Backend", week: 1, skipped: true },
];
const designs = new Map<string, TopicDesign>([
  [f("4.1 Listo"), complete(f("4.1 Listo"))],
  // teoría y manifiesto, sin canvas ni ejercicios
  [f("4.2 SinCanvas"), design(f("4.2 SinCanvas"), { files: ["T.md", "T.practica.md"], theoryText: READING_OK, manifest: man })],
  // solo manifiesto (y una nota con defectos en otro tema)
  [f("4.3 SinTeoria"), design(f("4.3 SinTeoria"), { files: ["T.practica.md"], manifest: man })],
  [f("4.4 NoExiste"), design(f("4.4 NoExiste"), { exists: false })],
  ["Programación/5 Frontend/5.1 Botones", design("Programación/5 Frontend/5.1 Botones", { files: ["B.md"], theoryText: "# B\n\n## Requires\n" })],
  [f("4.5 Hecho"), design(f("4.5 Hecho"), { files: [] })],
  [f("4.6 Fuera"), design(f("4.6 Fuera"), { files: [] })],
]);

const kataWeeks = [1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5];
const input = (o: Partial<ReportInput> = {}): ReportInput => ({
  planId: "p",
  topics,
  areas: [{ key: "backend", area: "Backend", areaId: "backend" }, { key: "frontend", area: "Frontend", areaId: "frontend" }],
  designs,
  review: null,
  ppReady: true,
  areaFiles: (areaId, katas, fromDay) => areaFiles(areaId, { katasPerArea: katas, fromDay }).map((x) => ({ rel: x.rel, exists: false })),
  kataWeeks,
  aiConfigured: true,
  now: "2026-10-09T10:00:00.000Z",
  ...o,
});


describe("plan para otra IA", () => {
  const report = buildExecutionReport(input());
  const md = buildHandoffMarkdown(report, { planName: "Full stack", start: "2026-10-06", end: "2027-04-05", contracts: ["Programación/00 Temario.md"], toolsDir: "C:/x/frontend" });

  it("lista cada tema con lo que falta y deja fuera lo completo, lo hecho y lo fuera de ruta", () => {
    expect(md).toContain(`\`${f("4.2 SinCanvas")}\``);
    expect(md).toContain(`\`${f("4.3 SinTeoria")}\``);
    expect(md).toContain(`\`${f("4.4 NoExiste")}\``);
    expect(md).not.toContain(f("4.1 Listo"));
    expect(md).not.toContain(f("4.5 Hecho"));
    expect(md).not.toContain(f("4.6 Fuera"));
  });

  it("separa lo que hace la app (programming_practice) de lo que hace la otra IA", () => {
    expect(md).toContain("NOT for you");
    expect(md).not.toMatch(/- \[ \] `Programación\/[^`]*programming_practice/);
  });

  it("incluye los contratos, las herramientas y la definición de terminado", () => {
    expect(md).toContain("`Programación/00 Temario.md`");
    expect(md).toContain("exercises_check.mjs");
    expect(md).toContain("Done definition");
  });

  it("sin herramientas no las menciona y sin contratos lo dice", () => {
    const bare = buildHandoffMarkdown(report, { planName: "P", start: "a", end: "b", contracts: [] });
    expect(bare).not.toContain("exercises_check.mjs");
    expect(bare).toContain("No contract documents were found");
  });

  it("un alcance vacío dice que no hay nada que crear", () => {
    const empty = buildHandoffMarkdown(buildExecutionReport(input({ topics: [], designs: new Map() }), { includeAreaPractice: false }), { planName: "P", start: "a", end: "b", contracts: [] });
    expect(empty).toContain("Nothing to create with this scope.");
  });
});
