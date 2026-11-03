import { describe, expect, it } from "vitest";
import { shouldRefreshTree } from "./watchFlush.js";

describe("shouldRefreshTree", () => {
  const own = (set: string[]) => (rel: string) => set.includes(rel);
  it("no refresca el árbol cuando todo lo que cambió es un autoguardado propio", () => {
    expect(shouldRefreshTree(["a.md"], own(["a.md"]))).toBe(false);
    expect(shouldRefreshTree(["a.md", "b.md"], own(["a.md", "b.md"]))).toBe(false);
  });
  it("sí refresca si algo más cambió (un archivo nuevo, algo de fuera) o no se sabe qué", () => {
    expect(shouldRefreshTree(["a.md", "nueva.md"], own(["a.md"]))).toBe(true);
    expect(shouldRefreshTree(["x.md"], own([]))).toBe(true);
    expect(shouldRefreshTree([], own([]))).toBe(true);
  });
});
