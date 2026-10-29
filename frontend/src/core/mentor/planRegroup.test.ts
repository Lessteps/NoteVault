import { describe, expect, it } from "vitest";
import { parseUnitsIndex, sectionOfTopic } from "../../lib/planUnits";
import { organizeTopics } from "../../lib/planOrganize";
import { regroupByUnits } from "./planRegroup";
import type { Plan } from "./plan";

const INDEX = `---\ntitle: x\n---\n# Units\n\nintro\n\n## Foundations\n\n- [[6.0 Zero]]\n- [[6.0.1 Data]]\n\n## Queries\n\n- [[6.4 CRUD]]\n  - [[6.4.1 SELECT]]\n\n## Engines\n\n- [[6.15 PostgreSQL]]\n`;
const f = (n: string) => `Programación/6 Databases/${n}/`.replace(/\/$/, "");
const CORE = [{ id: "core", title: "Conocimientos de bases de datos", kind: "knowledge" as const, order: 100 }];
const topic = (n: string) => ({ folder: f(n), title: n, targetWeek: 4, estMinutes: 45, group: "core" });
const planOf = (names: string[]): Plan => ({ subplans: [{ id: "s-db", area: "Databases", areaId: "databases", objective: "", topics: names.map(topic), weeks: [], requiredGoals: [], groups: CORE }] } as unknown as Plan);

describe("asignaturas desde el índice de la vault", () => {
  it("cada ## es una asignatura y reconoce las piezas por nombre y por capítulo", () => {
    const idx = parseUnitsIndex(INDEX);
    expect(idx.sections.map((s) => s.title)).toEqual(["Foundations", "Queries", "Engines"]);
    expect(sectionOfTopic(idx, f("6.4.1 SELECT"))).toBe(1);
    expect(sectionOfTopic(idx, f("6.15.3 Extensions"))).toBe(2); // no está listado: va por su capítulo
    expect(sectionOfTopic(idx, f("7.1 Otro"))).toBe(-1);
  });

  it("reparte los temas sueltos en sus asignaturas, quita el grupo vacío y es idempotente", () => {
    const plan = planOf(["6.4 CRUD", "6.0 Zero", "6.4.1 SELECT", "6.15 PostgreSQL"]);
    const out = regroupByUnits(plan, () => INDEX);
    const sub = out.subplans[0]!;
    expect(sub.groups!.map((g) => g.title)).toEqual(["Foundations", "Queries", "Engines"]);
    expect(sub.topics.map((t) => t.group)).toEqual(["queries", "foundations", "queries", "engines"]);
    expect(regroupByUnits(out, () => INDEX)).toBe(out);
    // sin índice no toca nada
    expect(regroupByUnits(plan, () => null)).toBe(plan);
  });

  it("organizar ordena Databases por número dentro de cada asignatura y las asignaturas por su orden", () => {
    const out = regroupByUnits(planOf(["6.4.1 SELECT", "6.4 CRUD", "6.0.1 Data", "6.0 Zero", "6.15 PostgreSQL"]), () => INDEX).subplans[0]!;
    const r = organizeTopics(out.topics, out.groups);
    expect(r.topics.map((t) => t.folder.split("/").pop())).toEqual(["6.0 Zero", "6.0.1 Data", "6.4 CRUD", "6.4.1 SELECT", "6.15 PostgreSQL"]);
  });
});
