import { describe, expect, it } from "vitest";
import { atomsOf, atomTitle, expandAtomic, mergeParens } from "./atomic";
import { curriculumAreas } from "./catalog";
import { computeAreaCoverage } from "./coverage";
import type { CurriculumEntry } from "../../lib/curriculum";

const entry = (over: Partial<CurriculumEntry> = {}): CurriculumEntry => ({ id: "css.flex-container", category: "Flexbox", title: "Flex container properties", importance: "esencial", items: ["display: flex | inline-flex", "flex-direction", "flex-wrap", "gap"], keywords: ["flexbox"], ...over });

describe("atomic", () => {
  it("une los trozos partidos dentro de un paréntesis", () => {
    expect(mergeParens(["specificity weights (inline", "id", "class)", "!important"])).toEqual(["specificity weights (inline, id, class)", "!important"]);
  });

  it("da título de carpeta válido a elementos y propiedades", () => {
    expect(atomTitle("<img src alt>")).toBe("img element");
    expect(atomTitle(":nth-child()")).toBe(":nth-child".replace(":", ""));
    expect(atomTitle("flex-wrap")).toBe("flex-wrap");
  });

  it("descarta la prosa y lo repetido del título", () => {
    const e = entry({ title: "Margin", items: ["margin", "margin-top", "shorthand order", "when to use semantic vs generic containers every time"] });
    expect(atomsOf(e)).toEqual(["margin-top", "shorthand order"]);
  });

  it("las entradas opcionales o con una sola pieza se quedan agrupadas", () => {
    const area = { id: "css", title: "CSS", space: "P", areaFolder: "5 Frontend/CSS", prefix: "5.19", atomic: true, entries: [entry({ importance: "opcional" }), entry({ id: "css.x", title: "X", items: ["x"] })] };
    expect(expandAtomic(area).entries).toHaveLength(2);
  });

  it("numera los subtemas bajo el grupo, planos en la carpeta del área, y la cobertura baja si solo está la nota del grupo", () => {
    const area = expandAtomic({ id: "css", title: "CSS", space: "Programación", areaFolder: "5 Frontend/CSS", prefix: "5.19", atomic: true, entries: [entry()] });
    const cov = computeAreaCoverage(area, [{ folder: "Programación/5 Frontend/CSS/5.19.1 Flex container properties", title: "Flex container properties" }]);
    expect(cov.rows[0]!.status).toBe("cubierto");
    expect(cov.pct).toBeLessThan(40);
    expect(cov.rows.filter((r) => r.status === "faltante").map((r) => r.suggestedFolder)).toEqual([
      "Programación/5 Frontend/CSS/5.19.1.1 display flex inline-flex",
      "Programación/5 Frontend/CSS/5.19.1.2 flex-direction",
      "Programación/5 Frontend/CSS/5.19.1.3 flex-wrap",
      "Programación/5 Frontend/CSS/5.19.1.4 gap",
    ]);
  });

  it("el catálogo real expande CSS, HTML y JavaScript", () => {
    for (const a of curriculumAreas().filter((x) => x.atomic)) expect(a.entries.some((e) => e.parentId), a.id).toBe(true);
  });
});
