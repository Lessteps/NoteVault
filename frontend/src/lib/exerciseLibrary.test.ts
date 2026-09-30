import { describe, expect, test } from "vitest";
import {
  estimate1RM,
  filterByLocalMuscle,
  getInstructions,
  mapGuideMuscle,
  searchLibrary,
} from "./exerciseLibrary";

describe("exerciseLibrary (workout-guide)", () => {
  test("mapea Chest al pectoral local", () => {
    expect(mapGuideMuscle("Chest")).toContain("pectoral");
  });

  test("la búsqueda encuentra press de banca", () => {
    const rows = searchLibrary("bench press");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].slug).toBe("bench-press");
  });

  test("filtrar por pectoral devuelve ejercicios", () => {
    const rows = filterByLocalMuscle("pectoral");
    expect(rows.length).toBeGreaterThan(10);
    expect(rows.every((r) => r.localPrimary.includes("pectoral"))).toBe(true);
  });

  test("los frames son locales (offline, respetan el CSP)", () => {
    const rows = searchLibrary("bench press");
    expect(rows[0].frame1).toContain("workout-guide-assets/bench-press/frame-1.png");
    expect(rows[0].frame1).not.toContain("http");
  });

  test("bench-press tiene instrucciones en español", () => {
    const ins = getInstructions("bench-press");
    expect(ins).not.toBeNull();
    expect(ins!.steps_es.length).toBeGreaterThan(0);
    expect(ins!.steps_es.join(" ")).toMatch(/pecho|banco|barra/i);
  });

  test("un alias curado también resuelve (rope pushdown)", () => {
    const ins = getInstructions("rope-tricep-pushdown");
    expect(ins).not.toBeNull();
    expect(ins!.steps_es.length).toBeGreaterThan(0);
  });

  test("lote propio: face-pull redactado en español", () => {
    const ins = getInstructions("face-pull");
    expect(ins).not.toBeNull();
    expect(ins!.steps_es.length).toBeGreaterThanOrEqual(4);
    expect(ins!.steps_es.join(" ")).toMatch(/cuerda|cara/i);
  });

  test("grupo pecho redactado a mano (bench-press, push-up)", () => {
    const press = getInstructions("bench-press");
    expect(press!.source).toBe("propia");
    expect(press!.steps_es.join(" ")).toMatch(/barra|banco/i);
    expect(press!.steps_es.length).toBeGreaterThanOrEqual(5);
    // push-up no puede venir del dataset: ese slug está cubierto por el
    // alias automático, así que exigimos fuente propia explícita.
    expect(getInstructions("push-up")!.source).toBe("propia");
  });

  test("lote propio 3: bandas, core y movilidad (banded-row, bird-dog)", () => {
    expect(getInstructions("banded-row")!.steps_es.length).toBeGreaterThanOrEqual(4);
    expect(getInstructions("bird-dog")!.steps_es.join(" ")).toMatch(/columna|espina/i);
  });

  test("cobertura completa: los 302 de workout-guide tienen instrucciones ES", async () => {
    const { exercises } = await import("@bryllim/workout-guide");
    const gaps = exercises.filter((e) => !getInstructions(e.slug)?.steps_es.length);
    expect(gaps.map((g) => g.slug)).toEqual([]);
  });

  test("lote propio 2: tren inferior (hip-thrust, clamshell)", () => {
    expect(getInstructions("hip-thrust")!.steps_es.length).toBeGreaterThanOrEqual(4);
    expect(getInstructions("clamshell")!.steps_es.join(" ")).toMatch(/cadera|rodilla|clamshell/i);
  });

  test("un slug fuera del catálogo devuelve null", () => {
    expect(getInstructions("no-existe-en-workout-guide")).toBeNull();
  });

  test("estima 1RM con Epley", () => {
    expect(estimate1RM(100, 5)).toBeCloseTo(116.7, 1);
  });
});
