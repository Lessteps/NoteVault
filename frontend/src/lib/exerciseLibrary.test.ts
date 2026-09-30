import { describe, expect, test } from "vitest";
import {
  estimate1RM,
  filterByLocalMuscle,
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

  test("estima 1RM con Epley", () => {
    expect(estimate1RM(100, 5)).toBeCloseTo(116.7, 1);
  });
});
