import { describe, expect, it } from "vitest";
import { cover, row } from "./curriculumFixtures";
import {
  addAll, DEFAULT_FILTERS, essentialMissing, filterRows, groupByCategory, idsOf, pendingAreas, relatedCoverage, selectionState, toggleId,
} from "./curriculumView";

const css = cover("css", "CSS", "12 CSS", [
  row("1", "Layout", "faltante", "esencial", ["display", "flex"]),
  row("2", "Layout", "parcial", "recomendado"),
  row("3", "Color", "faltante", "opcional", ["color"]),
  row("4", "Color", "cubierto", "esencial", [], ["Programación/5 Frontend/5.1 Colores"]),
  row("5", "Layout", "faltante", "esencial", ["grid"], ["Programación/5 Frontend/5.2 Grid"]),
]);
const html = cover("html", "HTML", "11 HTML", [row("h1", "Base", "faltante")]);
const ok = cover("js", "JS", "13 JavaScript Reference", [row("j1", "A", "cubierto"), row("j2", "A", "cubierto")]);

describe("curriculumView", () => {
  it("agrupa por categoría en orden de catálogo", () => {
    expect(groupByCategory(css.rows).map((g) => [g.category, g.rows.length])).toEqual([["Layout", 3], ["Color", 2]]);
  });
  it("filtra por estado, importancia, categoría y texto (sin acentos)", () => {
    expect(filterRows(css.rows, { ...DEFAULT_FILTERS, status: "todos" })).toHaveLength(5);
    expect(filterRows(css.rows, DEFAULT_FILTERS).map((r) => r.entry.id)).toEqual(["1", "3", "5"]);
    expect(filterRows(css.rows, { ...DEFAULT_FILTERS, status: "todos", importance: "esencial" }).map((r) => r.entry.id)).toEqual(["1", "4", "5"]);
    expect(filterRows(css.rows, { ...DEFAULT_FILTERS, status: "todos", categories: ["Color"] })).toHaveLength(2);
    expect(filterRows(css.rows, { ...DEFAULT_FILTERS, status: "todos", query: "FLEX" }).map((r) => r.entry.id)).toEqual(["1"]);
  });
  it("las ayudas de selección ignoran lo cubierto y no duplican", () => {
    expect(essentialMissing(css.rows)).toEqual(["1", "5"]);
    expect(idsOf(css.rows)).toEqual(["1", "2", "3", "5"]);
    expect(addAll(["1"], ["1", "5"])).toEqual(["1", "5"]);
    expect(toggleId(["1"], "1")).toEqual([]);
    expect(toggleId([], "2")).toEqual(["2"]);
  });
  it("límites: 25 avisa, 40 es el tope", () => {
    expect([0, 1, 25, 26, 40, 41].map(selectionState)).toEqual(["vacio", "ok", "ok", "aviso", "aviso", "tope"]);
  });
  it("relaciona áreas existentes por carpetas cubiertas y detecta las que faltan por crear", () => {
    const all = [css, html, ok];
    expect(relatedCoverage(all, "Programación", "Programación/5 Frontend").map((c) => c.areaId)).toEqual(["css"]);
    expect(relatedCoverage(all, "Programación", "Programación/2.2 JavaScript")).toEqual([]);
    expect(relatedCoverage(all, "Programación", "").map((c) => c.areaId)).toEqual(["css", "html"]);
    expect(pendingAreas(all, "Programación", ["Programación/5 Frontend", "Programación/12 CSS"]).map((c) => c.areaId)).toEqual(["html", "js"]);
  });
});
