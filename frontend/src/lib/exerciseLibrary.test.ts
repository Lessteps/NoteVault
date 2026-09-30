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

  test("sin match devuelve null (nordic-hamstring-curl)", () => {
    expect(getInstructions("nordic-hamstring-curl")).toBeNull();
  });

  test("estima 1RM con Epley", () => {
    expect(estimate1RM(100, 5)).toBeCloseTo(116.7, 1);
  });
});
