import { describe, expect, it } from "vitest";
import { evaluateTopicDesign, type TopicDesign } from "./topicDesign";
import { branchesOf, buildPlanTopicRows, catalogCounters, filterCatalog, folderCompare, sortCatalog } from "./planTopicCatalog";

const F = (n: string) => `Programación/4 Backend/${n}`;
const des = (folder: string, o: Partial<Parameters<typeof evaluateTopicDesign>[0]> = {}): TopicDesign =>
  evaluateTopicDesign({ folder, title: folder.split("/").pop()!, subject: "programming", exists: true, files: [], exercises: [], ...o });
const THEORY = (folder: string) => `${folder.split("/").pop()}.md`;

const snaps = [
  { folder: F("4.10 Queues"), title: "4.10 Queues", theoryNotes: 1, exerciseCount: 0, skills: 0 },
  { folder: F("4.2 REST"), title: "4.2 REST", theoryNotes: 1, exerciseCount: 4, planExercises: 6, skills: 3 },
  { folder: "Databases/9 SQL/9.1 Select", title: "9.1 Select", theoryNotes: 0, exerciseCount: 0, skills: 0 },
];
const plan = [
  { folder: F("4.2 REST"), title: "4.2 REST", area: "Backend", targetWeek: 3, completedAt: "2026-10-01" },
  { folder: F("4.1 HTTP"), title: "4.1 HTTP", area: "Backend", targetWeek: 1, route: "optional" },
];
const designs = new Map<string, TopicDesign>([
  [F("4.2 REST"), des(F("4.2 REST"), { files: [THEORY(F("4.2 REST")), "REST — mapa.canvas"], manifest: { skills: ["implement"], topicType: "procedural" } })],
  [F("4.10 Queues"), des(F("4.10 Queues"), { files: [THEORY(F("4.10 Queues"))] })],
  [F("4.1 HTTP"), des(F("4.1 HTTP"), { exists: false })],
]);

describe("catálogo de temas del plan", () => {
  const rows = buildPlanTopicRows(snaps, plan, designs);
  const by = (f: string) => rows.find((r) => r.folder === f)!;

  it("junta TODOS los temas de la vault con los del plan (incluso los que aún no existen), con orden natural", () => {
    expect(rows.map((r) => r.folder)).toEqual([
      "Databases/9 SQL/9.1 Select",
      F("4.1 HTTP"),
      F("4.2 REST"),
      F("4.10 Queues"),
    ]);
    expect(folderCompare(F("4.2 REST"), F("4.10 Queues"))).toBeLessThan(0);
  });

  it("marca lo que existe de cada tema y el plan", () => {
    const rest = by(F("4.2 REST"));
    expect(rest).toMatchObject({ inPlan: true, area: "Backend", targetWeek: 3, completedAt: "2026-10-01", theory: true, canvas: true, manifest: true, skills: 3, exercises: 4, planExercises: 6, branch: "Backend", topicType: "procedural" });
    const queues = by(F("4.10 Queues"));
    expect(queues).toMatchObject({ inPlan: false, theory: true, canvas: false, manifest: false, exercises: 0 });
    expect(queues.area).toBeUndefined();
    // tema del plan que no está en la vault: nada creado
    expect(by(F("4.1 HTTP"))).toMatchObject({ inPlan: true, exists: false, theory: false, canvas: false, manifest: false, route: "optional", skills: 0, exercises: 0 });
    // sin diseño calculado: puntuación nula y la nota sale de las cuentas de la vault
    expect(by("Databases/9 SQL/9.1 Select")).toMatchObject({ score: null, theory: false, branch: "SQL" });
  });

  it("cuenta, filtra por rama, por lo que falta y por texto, y ordena", () => {
    const c = catalogCounters(rows);
    expect(c).toMatchObject({ topics: 4, withNote: 2, withCanvas: 1, withPractica: 1, withExercises: 1 });
    expect(branchesOf(rows)).toEqual(["SQL", "Backend"]);
    expect(filterCatalog(rows, { branch: "Backend", missing: ["sin-mapa"] }).map((r) => r.title)).toEqual(["4.1 HTTP", "4.10 Queues"]);
    expect(filterCatalog(rows, { query: "REST" }).map((r) => r.title)).toEqual(["4.2 REST"]);
    expect(filterCatalog(rows, { query: "backend", missing: ["sin-ejercicios", "sin-practica"] }).map((r) => r.title)).toEqual(["4.1 HTTP", "4.10 Queues"]);
    // plan: los del plan por semana, luego los de fuera por carpeta
    expect(sortCatalog(rows, "plan").map((r) => r.title)).toEqual(["4.1 HTTP", "4.2 REST", "9.1 Select", "4.10 Queues"]);
    expect(sortCatalog(rows, "folder").map((r) => r.title)).toEqual(["9.1 Select", "4.1 HTTP", "4.2 REST", "4.10 Queues"]);
  });
});
