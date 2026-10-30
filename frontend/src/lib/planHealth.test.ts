import { describe, expect, it } from "vitest";
import { planHealth } from "./planHealth";

const INDEX = "# U\n\n## Foundations\n\n- [[6.0 Zero]]\n\n## Fundamentals\n\n- [[6.1 Model]]\n\n## Queries\n\n- [[6.4 CRUD]]\n";
const f = (n: string) => `Programación/6 Databases/${n}`;
const sub = (topics: Array<{ folder: string; group?: string }>, groups = [{ id: "core", title: "x", kind: "knowledge" }]) => ({ id: "s-db", area: "Databases", areaId: "databases", groups, topics });

describe("salud del plan: cada regla es un error que ya nos pasó", () => {
  it("detecta temas de la vault que el plan no tiene (y respeta los que la persona quitó)", () => {
    const plan = { subplans: [sub([{ folder: f("6.1 Model") }])] };
    const vault = [f("6.1 Model"), f("6.4 CRUD"), f("6.4.1 SELECT")].map((folder) => ({ folder, areaId: "databases" as string | null }));
    const issues = planHealth({ plan, vaultTopics: vault });
    expect(issues).toMatchObject([{ code: "missing-topics", items: ["6.4 CRUD", "6.4.1 SELECT"] }]);
    expect(planHealth({ plan, vaultTopics: vault, offered: new Set([f("6.4 CRUD"), f("6.4.1 SELECT")]) })).toEqual([]);
    // un área que el plan no tiene no se reclama
    expect(planHealth({ plan, vaultTopics: [{ folder: "Programación/3 Desktop/3.1 X", areaId: "desktop" }] })).toEqual([]);
  });

  it("detecta el área con todo en un solo grupo cuando la vault define asignaturas", () => {
    const topics = ["6.0 Zero", "6.0.1 A", "6.1 Model", "6.1.1 B", "6.4 CRUD", "6.4.1 C"].map((n) => ({ folder: f(n) }));
    const issues = planHealth({ plan: { subplans: [sub(topics)] }, vaultTopics: [], unitsIndexOf: () => INDEX });
    expect(issues.map((i) => i.code)).toContain("ungrouped");
  });

  it("detecta secciones con nombres que se confunden (Foundations / Fundamentals)", () => {
    const issues = planHealth({ plan: { subplans: [sub([])] }, vaultTopics: [], unitsIndexOf: () => INDEX });
    expect(issues).toMatchObject([{ code: "similar-sections", items: ["Foundations", "Fundamentals"] }]);
    const ok = INDEX.replace("Foundations", "Databases from zero").replace("Fundamentals", "Relational model and design");
    expect(planHealth({ plan: { subplans: [sub([])] }, vaultTopics: [], unitsIndexOf: () => ok })).toEqual([]);
  });

  it("detecta temas fuera del orden de sus números y el escaneo cortado", () => {
    const topics = ["6.4 CRUD", "6.0 Zero", "6.1 Model"].map((n) => ({ folder: f(n), group: "g" }));
    const issues = planHealth({ plan: { subplans: [sub(topics, [{ id: "g", title: "g", kind: "knowledge" }])] }, vaultTopics: [], scanTruncated: true });
    expect(issues.map((i) => i.code).sort()).toEqual(["out-of-order", "scan-truncated"]);
  });

  it("el orden pedagógico de un lenguaje (2.1.4 antes que 2.1.18 no es un fallo) no se marca", () => {
    const topics = ["2.1.18 Concurrency", "2.1.4 Functions"].map((n) => ({ folder: `Programación/2.1 Python/${n}`, group: "lang-python" }));
    const groups = [{ id: "lang-python", title: "Lenguaje: Python", kind: "language" }];
    expect(planHealth({ plan: { subplans: [{ ...sub(topics, groups), areaId: "backend", area: "Backend" }] }, vaultTopics: [] })).toEqual([]);
  });

  it("avisa cuando los temas no caben en el tiempo que queda (el plan crecía sin que nadie lo dijera)", () => {
    const plan = { subplans: [sub([])] };
    expect(planHealth({ plan, vaultTopics: [], capacity: { neededMin: 1800 * 60, availableMin: 900 * 60 } })).toMatchObject([{ code: "over-capacity", message: expect.stringContaining("Las fechas del plan no se mueven") }]);
    expect(planHealth({ plan, vaultTopics: [], capacity: { neededMin: 800 * 60, availableMin: 900 * 60 } })).toEqual([]);
  });

  it("un plan sano no tiene avisos", () => {
    const topics = [{ folder: f("6.0 Zero"), group: "a" }, { folder: f("6.1 Model"), group: "b" }, { folder: f("6.4 CRUD"), group: "c" }];
    const groups = ["a", "b", "c"].map((id) => ({ id, title: id, kind: "knowledge" }));
    const ok = "## One\n\n- [[6.0 Zero]]\n\n## Two\n\n- [[6.1 Model]]\n";
    expect(planHealth({ plan: { subplans: [sub(topics, groups)] }, vaultTopics: topics.map((t) => ({ folder: t.folder, areaId: "databases" })), unitsIndexOf: () => ok })).toEqual([]);
  });
});
