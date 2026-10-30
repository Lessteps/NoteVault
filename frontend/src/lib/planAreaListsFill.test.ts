import { describe, expect, it } from "vitest";
import { fillSubjectRows, MIN_SUBJECT_TOPICS } from "./planAreaLists";

const row = (n: number, done = false) => ({ folder: `P/T${n}`, done });
const route = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => row(n, n === 2));

describe("mínimo de temas por asignatura en Ejecución", () => {
  it("el mínimo es 4", () => expect(MIN_SUBJECT_TOPICS).toBe(4));

  it("a los de hoy suma los siguientes pendientes de su ruta, en orden y sin repetir, hasta 4", () => {
    const group = new Set(["P/T1", "P/T2", "P/T3", "P/T4", "P/T5", "P/T6"]);
    // hoy toca el 1: faltan 3 → el 2 está hecho (se salta), siguen el 3, el 4 y el 5
    expect(fillSubjectRows(route, group, [{ folder: "P/T1" }]).map((r) => r.folder)).toEqual(["P/T3", "P/T4", "P/T5"]);
  });

  it("una asignatura sin nada hoy se llena con 4; con 4 o más hoy no se añade nada", () => {
    const group = new Set(["P/T1", "P/T3", "P/T4", "P/T5", "P/T6"]);
    expect(fillSubjectRows(route, group, [])).toHaveLength(4);
    expect(fillSubjectRows(route, group, [1, 3, 4, 5].map((n) => ({ folder: `P/T${n}` })))).toEqual([]);
  });

  it("no inventa temas: si la asignatura tiene menos pendientes, se enseñan solo esos", () => {
    expect(fillSubjectRows(route, new Set(["P/T7"]), [])).toHaveLength(1);
    expect(fillSubjectRows(route, new Set(["P/T2"]), [])).toEqual([]); // el único está hecho
  });
});
