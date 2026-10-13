import { describe, expect, it } from "vitest";
import type { ExecTask } from "./planExecution";
import { applyAiScheme, buildScheme, packageMarkdown, promptFor, topicsFromTasks, totalsOf } from "./handoffPlan";

const task = (over: Partial<ExecTask>): ExecTask => ({ id: "x", kind: "practice", areaKey: "backend", area: "Backend", folder: "Programación/4 Backend/4.1 Uno", title: "4.1 Uno", week: 1, required: true, aiCalls: 1, files: 4, label: "", dependsOn: [], ...over });
const cells = (...c: Array<[string, number]>) => ({ args: { cells: c.map(([skill, difficulty]) => ({ skill, difficulty })) } });
const areas = [{ key: "backend", area: "Backend" }, { key: "frontend", area: "Frontend" }];

describe("esquema de traspaso", () => {
  const tasks: ExecTask[] = [
    task({ id: "t1", kind: "theory", folder: "P/4 Backend/4.1 Uno", title: "4.1 Uno" }),
    task({ id: "p1", folder: "P/4 Backend/4.1 Uno", title: "4.1 Uno", week: 1, ...cells(["explain", 1], ["implement", 1]) }),
    task({ id: "p2", folder: "P/4 Backend/4.2 Dos", title: "4.2 Dos", week: 2, ...cells(["explain", 1], ["debug", 1], ["test", 2]) }),
    task({ id: "p3", folder: "P/5 Frontend/5.1 Tres", title: "5.1 Tres", areaKey: "frontend", area: "Frontend", week: 1, ...cells(["trace", 1]) }),
  ];

  it("saca de las tareas del informe qué teoría y qué celdas faltan por tema, con cuántos ejercicios escribir", () => {
    const m = topicsFromTasks(tasks, 3);
    expect(m.size).toBe(3);
    expect(m.get("P/4 Backend/4.1 Uno")!.topic).toMatchObject({ theory: true, cells: [{ skill: "explain", difficulty: 1, write: 3 }, { skill: "implement", difficulty: 1, write: 3 }] });
    expect(m.get("P/4 Backend/4.2 Dos")!.topic.theory).toBe(false);
    expect(topicsFromTasks(tasks, 1).get("P/4 Backend/4.2 Dos")!.topic.cells.every((c) => c.write === 1)).toBe(true);
  });

  it("primero toda la teoría y luego los ejercicios por área; ids estables y orden 1..n", () => {
    const ps = buildScheme(topicsFromTasks(tasks, 3), areas, { maxFiles: 150 });
    expect(ps.map((p) => p.id)).toEqual(["theory-backend-1", "exercises-backend-1", "exercises-frontend-1"]);
    expect(ps.map((p) => p.order)).toEqual([1, 2, 3]);
    expect(ps[0]!.files).toBe(2);
    expect(ps[1]!.files).toBe(2 * 3 + 3 * 3);
    expect(totalsOf(ps)).toEqual({ packages: 3, files: 2 + 15 + 3, topics: 3 });
  });

  it("parte los ejercicios en planes del tamaño pedido sin partir un tema por la mitad", () => {
    const ps = buildScheme(topicsFromTasks(tasks, 3), areas, { maxFiles: 10 });
    const ex = ps.filter((p) => p.kind === "exercises" && p.areaKey === "backend");
    expect(ex).toHaveLength(2);
    expect(ex.map((p) => p.topics.map((t) => t.title))).toEqual([["4.1 Uno"], ["4.2 Dos"]]);
    expect(ex[0]!.id).toBe("exercises-backend-1");
    expect(ex[1]!.title).toBe("Ejercicios · Backend (2/2)");
  });

  it("la IA solo ordena y nombra: ids inventados fuera, nada se pierde y un JSON roto se rechaza", () => {
    const ps = buildScheme(topicsFromTasks(tasks, 3), areas);
    const r = applyAiScheme(ps, JSON.stringify({ order: ["exercises-frontend-1", "inventado", "theory-backend-1"], packages: [{ id: "exercises-frontend-1", title: "Lo primero", why: "porque sí" }, { id: "zzz", title: "x" }] }))!;
    expect(r.map((p) => p.id)).toEqual(["exercises-frontend-1", "theory-backend-1", "exercises-backend-1"]);
    expect(r[0]!.title).toBe("Lo primero");
    expect(r.map((p) => p.order)).toEqual([1, 2, 3]);
    expect(applyAiScheme(ps, "nada")).toBeNull();
    expect(applyAiScheme(ps, "{}")).toBeNull();
  });

  it("el documento del plan (en inglés) lista los temas y celdas exactos y las órdenes con su filtro", () => {
    const ps = buildScheme(topicsFromTasks(tasks, 3), areas);
    const ctx = { vaultRoot: "C:\\V", space: "Programación", planName: "Full stack", masterDoc: "C:\\docs\\MASTER.md", toolsDir: "C:\\app\\frontend", total: ps.length };
    const ex = packageMarkdown(ps[1]!, ctx);
    expect(ex).toContain("# Antigravity plan 02/3 — Exercise notes · Backend");
    expect(ex).toContain("`P/4 Backend/4.1 Uno`");
    expect(ex).toContain("`implement` · d1 (easy) · ×3");
    expect(ex).toContain("`test` · d2 (medium) · ×3");
    expect(ex).toContain('exercises_check.mjs "^(4\\.1|4\\.2) "');
    expect(ex).toContain("C:\\docs\\MASTER.md");
    const th = packageMarkdown(ps[0]!, ctx);
    expect(th).toContain("Theory notes and maps");
    expect(th).toContain("finalize.mjs");
    expect(promptFor("C:\\V\\a.md")).toContain("execute it");
  });
});
