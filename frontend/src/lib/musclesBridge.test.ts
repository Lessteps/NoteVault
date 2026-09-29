import { describe, expect, it } from "vitest";
import { GRANULAR_MUSCLES, MUSCLES, expandMuscles, granularGroup, granularName, viewOfMuscle } from "./muscles";

/** The bridge between what the exercises store and what the asset can paint. */
describe("ids almacenados → ids del asset", () => {
  it("cada músculo guardado se expande a ids que el asset dibuja", () => {
    for (const m of MUSCLES) {
      const expanded = expandMuscles([m.id]);
      expect(expanded.length, m.id).toBeGreaterThan(0);
      for (const id of expanded) {
        expect(GRANULAR_MUSCLES.some((g) => g.id === id), `${m.id} → ${id}`).toBe(true);
      }
    }
  });

  it("los ids ya granulares pasan tal cual, sin duplicados", () => {
    expect(expandMuscles(["lats", "lats", "quads"])).toEqual(["lats", "quads-rectus-femoris"]);
    expect(expandMuscles(undefined)).toEqual([]);
  });

  it("cada id granular tiene nombre y grupo para la interfaz", () => {
    for (const m of GRANULAR_MUSCLES) {
      expect(granularName(m.id)).toBe(m.name_es);
      expect(granularGroup(m.id)).not.toBe("");
    }
  });

  it("la vista de cada id sale del asset: granulares incluidos", () => {
    expect(viewOfMuscle("chest-upper-left")).toBeNull();
    expect(viewOfMuscle("pectoral-upper")).toBe("front");
    expect(viewOfMuscle("lats")).toBe("back");
    expect(viewOfMuscle("quads-rectus-femoris")).toBe("front");
    expect(viewOfMuscle("soleus")).toBe("back");
  });
});
