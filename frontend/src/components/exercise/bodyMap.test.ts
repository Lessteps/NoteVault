// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { MUSCLES, expandMuscles } from "../../lib/muscles";
import { shapesForMuscle, unassignedShapes } from "../../lib/bodyMuscleMap";

/**
 * El mapa corporal solo sirve si, al elegir un músculo, se enciende algo.
 *
 * El fallo que motivó esto: `abductors` estaba en el selector, el asset no tiene
 * forma de abductor, y nadie se dio cuenta. Elegirlo no encendía nada y la app
 * no daba ninguna señal.
 */
describe("el mapa enciende lo que eliges", () => {
  it("todo músculo del selector enciende al menos una forma", () => {
    const mudos = MUSCLES.filter((m) => expandMuscles([m.id]).flatMap((g) => shapesForMuscle(g)).length === 0).map(
      (m) => `${m.name_es} (${m.id})`,
    );
    expect(mudos).toEqual([]);
  });

  it("no queda ninguna forma interactiva sin músculo", () => {
    expect(unassignedShapes()).toEqual([]);
  });

  it("un músculo se enciende en el sitio que le toca", () => {
    // Muestreo a ojo: si esto se rompe, el mapa pinta una cosa por otra.
    const formaDe = (id: string) =>
      expandMuscles([id]).flatMap((g) => shapesForMuscle(g)).map((f) => f.shape.id);
    expect(formaDe("pectoral")).toContain("chest-upper-left");
    expect(formaDe("lats")).toContain("lats-upper-left");
    expect(formaDe("quads")).toContain("quads-left");
    expect(formaDe("calves")).toContain("calves-gastroc-medial-left");
    expect(formaDe("trapezius")).toContain("traps-upper-left");
    // Y cada músculo se enciende en su propia vista.
    const vista = (id: string) => expandMuscles([id]).flatMap((g) => shapesForMuscle(g)).map((f) => f.view);
    expect(vista("pectoral").every((v) => v === "front")).toBe(true);
    expect(vista("lats").every((v) => v === "back")).toBe(true);
  });
});
