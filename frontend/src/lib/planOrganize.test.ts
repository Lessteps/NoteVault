import { describe, expect, it } from "vitest";
import { buildPlan, type Plan } from "../core/mentor/plan.js";
import { applyOps } from "../core/mentor/planChange.js";
import { compareKeys, numberKey, organizeTopics } from "./planOrganize.js";
import { addDays } from "./planTime.js";

const P = "Programación/5 Frontend";
const html = (n: string, t: string) => `${P}/HTML/${n} ${t}`;

describe("numberKey / compareKeys", () => {
  it("lee la jerarquía del nombre de la carpeta y ordena el general antes que sus piezas", () => {
    expect(numberKey(html("5.18.11.1", "p element"))).toEqual([5, 18, 11, 1]);
    expect(numberKey("Programación/x/Sin número")).toBeNull();
    expect(compareKeys([5, 18, 4], [5, 18, 4, 1])).toBeLessThan(0);
    expect(compareKeys([5, 18, 10], [5, 18, 4, 9])).toBeGreaterThan(0); // numérico, no alfabético
  });
});

describe("organizeTopics", () => {
  const groups = [{ id: "core", title: "Conocimientos", kind: "knowledge" as const, order: 100 }, { id: "html", title: "HTML", kind: "knowledge" as const, order: 110 }];
  it("ordena las asignaturas de referencia por número y respeta el orden de las demás", () => {
    const topics = [
      { folder: `${P}/5.3 B`, group: "core" },
      { folder: `${P}/5.1 A`, group: "core" },
      { folder: html("5.18.10", "Headings"), group: "html" },
      { folder: html("5.18.4.1", "html element"), group: "html" },
      { folder: html("5.18.4", "Skeleton"), group: "html" },
    ];
    const r = organizeTopics(topics, groups);
    expect(r.topics.map((t) => t.folder.split("/").pop())).toEqual(["5.3 B", "5.1 A", "5.18.4 Skeleton", "5.18.4.1 html element", "5.18.10 Headings"]);
  });

  it("el orden que propone una IA manda; lo que no nombra se queda detrás, en su orden", () => {
    const topics = [{ folder: html("5.18.4", "S"), group: "html" }, { folder: html("5.18.5", "M"), group: "html" }, { folder: html("5.18.6", "Z"), group: "html" }];
    const r = organizeTopics(topics, groups, { order: [html("5.18.5", "M"), html("5.18.4", "S")] });
    expect(r.topics.map((t) => t.folder.split("/").pop())).toEqual(["5.18.5 M", "5.18.4 S", "5.18.6 Z"]);
  });

  it("los genéricos antiguos pasan a opcionales solo cuando ya hay piezas de verdad", () => {
    const stubs: Array<{ folder: string; group: string; route?: "core" | "optional" | "skipped" }> = [1, 2, 3].map((n) => ({ folder: html(`5.18.${n}`, `HTML practicar con cosas ${n}`), group: "html" }));
    const few = organizeTopics([...stubs, { folder: html("5.18.4", "S"), group: "html" }], groups);
    expect(few.demoted).toEqual([]);
    const pieces: Array<{ folder: string; group: string; route?: "core" | "optional" | "skipped" }> = Array.from({ length: 25 }, (_, i) => ({ folder: html(`5.18.4.${i + 1}`, `p${i}`), group: "html" }));
    const many = organizeTopics([...stubs, ...pieces], groups);
    expect(many.demoted.length).toBe(3);
    expect(many.topics.filter((t) => t.route === "skipped").length).toBe(3);
    // los que ya estaban como opcionales (versiones anteriores) también salen de la ruta
    const old = many.topics.map((t) => (t.route === "skipped" ? { ...t, route: "optional" as const } : t));
    expect(organizeTopics(old, undefined).demoted.length).toBe(3);
  });
});

describe("applyOps organize", () => {
  const start = "2026-10-06";
  const end = addDays(start, 26 * 7);
  const make = (): Plan => {
    const groups = [{ id: "core", title: "Conocimientos de frontend", kind: "knowledge" as const, order: 100 }, { id: "html", title: "HTML", kind: "knowledge" as const, order: 110 }];
    const pieces = Array.from({ length: 60 }, (_, i) => ({ folder: html(`5.18.4.${60 - i}`, `piece ${60 - i}`), title: `piece ${60 - i}`, estMinutes: 45, group: "html" }));
    const built = buildPlan(
      [{ area: "Frontend", areaId: "frontend", objective: "UI", groups, topics: [{ folder: `${P}/5.1 DOM`, title: "DOM", estMinutes: 60, group: "core" }, { folder: html("5.18.4", "Skeleton"), title: "Skeleton", estMinutes: 45, group: "html" }, ...pieces] }],
      { id: `${start}_${end}`, start, end, minutesPerDay: 240, studyDays: [1, 2, 3, 4, 5, 6, 7], pace: "intenso", from: start, name: "t" },
    ).plan;
    return { ...built, structure: "areas", areaMode: "together" };
  };

  it("deja los temas en el orden de sus números y repartidos en semanas, no apilados en una", () => {
    const plan = make();
    // el desorden de partida: piezas al revés
    const before = plan.subplans[0]!.topics.filter((t) => t.group === "html").map((t) => t.folder.split("/").pop());
    expect(before[1]).toBe("5.18.4.60 piece 60");
    const r = applyOps(plan, [{ op: "organize" }], { today: start, all: [] });
    expect(r.applied).toBe(1);
    const topics = r.plan.subplans[0]!.topics.filter((t) => t.group === "html");
    const names = topics.map((t) => t.folder.split("/").pop());
    expect(names.slice(0, 3)).toEqual(["5.18.4 Skeleton", "5.18.4.1 piece 1", "5.18.4.2 piece 2"]);
    // semanas no decrecientes (el orden de aprendizaje se respeta) y repartidas
    const weeks = topics.map((t) => t.targetWeek);
    expect([...weeks].sort((a, b) => a - b)).toEqual(weeks);
    // empieza al principio del plan y NO se amontona en la última semana (lo que hacía «añadir al final»)
    expect(weeks[0]).toBeLessThanOrEqual(2);
    expect(weeks.filter((w) => w === Math.max(...weeks) && w >= 26).length).toBe(0);
  });

  it("una segunda vez no cambia nada (idempotente) y el orden de una IA se valida contra el plan", () => {
    const r1 = applyOps(make(), [{ op: "organize" }], { today: start, all: [] });
    const r2 = applyOps(r1.plan, [{ op: "organize" }], { today: start, all: [] });
    expect(r2.applied).toBe(0);
    const ai = applyOps(make(), [{ op: "organize", order: ["no/existe", html("5.18.4.3", "piece 3"), html("5.18.4.1", "piece 1")] }], { today: start, all: [] });
    const html1 = ai.plan.subplans[0]!.topics.filter((t) => t.group === "html").map((t) => t.folder.split("/").pop());
    expect(html1.slice(0, 2)).toEqual(["5.18.4.3 piece 3", "5.18.4.1 piece 1"]);
  });
});
