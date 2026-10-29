import { describe, expect, it } from "vitest";
import { curriculumAreas } from "./catalog";

const RANGES: Record<string, [number, number]> = { html: [40, 55], css: [110, 150], "atomic-design": [12, 25], "js-reference": [100, 140], java: [80, 100] };

describe("catálogo de currículo de referencia", () => {
  const areas = curriculumAreas();

  it("tiene las áreas con su carpeta correspondiente (HTML, CSS y Atomic Design bajo 5 Frontend)", () => {
    expect(areas.map((a) => [a.id, a.areaFolder])).toEqual([
      ["html", "5 Frontend/HTML"],
      ["css", "5 Frontend/CSS"],
      ["atomic-design", "5 Frontend/Atomic Design"],
      ["js-reference", "13 JavaScript Reference"],
      ["java", "14 Java"],
    ]);
    expect(new Set(areas.map((a) => a.space))).toEqual(new Set(["Programación"]));
  });

  for (const full of curriculumAreas()) {
    const area = { ...full, entries: full.entries.filter((e) => !e.parentId) };
    describe(area.id, () => {
      it("el número de entradas está en el rango previsto", () => {
        const [lo, hi] = RANGES[area.id]!;
        expect(area.entries.length).toBeGreaterThanOrEqual(lo);
        expect(area.entries.length).toBeLessThanOrEqual(hi);
      });

      it("ids únicos con el prefijo del área y títulos válidos como nombre de carpeta", () => {
        const ids = area.entries.map((e) => e.id);
        expect(new Set(ids).size).toBe(ids.length);
        const titles = area.entries.map((e) => e.title.toLowerCase());
        expect(new Set(titles).size).toBe(titles.length);
        for (const e of area.entries) {
          expect(e.title.length, e.id).toBeLessThanOrEqual(72);
          expect(e.title, e.id).not.toMatch(/[/\\:*?"<>|]/);
          expect(e.title.trim(), e.id).toBe(e.title);
          expect(e.items.length, e.id).toBeGreaterThanOrEqual(2);
          expect(e.keywords.length, e.id).toBeGreaterThan(0);
          expect(e.keywords.every((k) => k === k.toLowerCase()), e.id).toBe(true);
          expect(["esencial", "recomendado", "opcional"]).toContain(e.importance);
        }
      });

      it("todas las categorías tienen entradas y están agrupadas", () => {
        const order: string[] = [];
        for (const e of area.entries) if (order[order.length - 1] !== e.category) order.push(e.category);
        expect(new Set(order).size).toBe(order.length); // una categoría no reaparece más tarde
        expect(order.length).toBeGreaterThanOrEqual(5);
        for (const c of order) expect(area.entries.filter((e) => e.category === c).length).toBeGreaterThan(0);
      });

      it("hay entradas esenciales y no todo es esencial", () => {
        const es = area.entries.filter((e) => e.importance === "esencial").length;
        expect(es).toBeGreaterThan(5);
        expect(es).toBeLessThan(area.entries.length);
      });
    });
  }

  describe("granularidad atómica (una nota por propiedad / elemento / método)", () => {
    const atomic = areas.filter((a) => a.atomic);

    it("HTML, CSS y JavaScript Reference son atómicos; Atomic Design y Java no", () => {
      expect(atomic.map((a) => a.id)).toEqual(["html", "css", "js-reference"]);
    });

    for (const area of atomic) {
      it(`${area.id}: cada subtema cuelga de su grupo, con ids y títulos únicos dentro del grupo`, () => {
        const byId = new Map(area.entries.map((e) => [e.id, e]));
        const kids = area.entries.filter((e) => e.parentId);
        expect(kids.length).toBeGreaterThan(area.entries.length / 2);
        expect(new Set(area.entries.map((e) => e.id)).size).toBe(area.entries.length);
        for (const k of kids) {
          const parent = byId.get(k.parentId!);
          expect(parent, k.id).toBeDefined();
          expect(k.category, k.id).toBe(parent!.title);
          expect(k.importance, k.id).not.toBe("opcional");
          expect(k.title.length, k.id).toBeLessThanOrEqual(72);
          expect(k.title, k.id).not.toMatch(/[/\\:*?"<>|]/);
        }
      });
    }

    it("CSS tiene flex-wrap y gap como notas propias bajo «Flex container properties»", () => {
      const css = areas.find((a) => a.id === "css")!;
      const titles = css.entries.filter((e) => e.parentId === "css.flex-container").map((e) => e.title);
      expect(titles).toEqual(expect.arrayContaining(["flex-direction", "flex-wrap", "gap"]));
    });

    it("HTML tiene un tema por elemento de estructura (header, nav, main, footer, aside)", () => {
      const html = areas.find((a) => a.id === "html")!;
      const titles = html.entries.filter((e) => e.parentId === "html.landmarks").map((e) => e.title);
      expect(titles).toEqual(expect.arrayContaining(["header element", "nav element", "main element", "footer element", "aside element"]));
    });
  });
});
