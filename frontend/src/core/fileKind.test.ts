import { describe, expect, it } from "vitest";
import { detectFileKind } from "./fileKind";

describe("detectFileKind", () => {
  it("tells the canvases apart and switches on the canvas and map skills", () => {
    expect(detectFileKind("Mat 1/00 Mapa de Mat 1.canvas").kind).toBe("space-map");
    expect(detectFileKind("Mat 1/1 Aritmética/00 Mapa — 1 Aritmética.canvas").kind).toBe("area-map");
    expect(detectFileKind("Mat 1/1 A/1.1 Tema/1.1 Tema — mapa.canvas").kind).toBe("topic-map");
    expect(detectFileKind("Mat 1/otro.canvas")).toMatchObject({ kind: "canvas", skills: ["canvas_skill"] });
    expect(detectFileKind("Mat 1/00 Mapa de Mat 1.canvas").skills).toEqual(["mapa_skill", "canvas_skill"]);
  });

  it("tells theory, practice and overview apart", () => {
    expect(detectFileKind("A/1.1 T/1.1 T.practica.md").skills).toEqual(["practica_skill"]);
    expect(detectFileKind("Mat/Mat.resumen.md").skills).toEqual(["temario_skill", "subtemas_skill"]);
    expect(detectFileKind("A/1.1 T/1.1 T.md", "---\ntype: teorica\n---\n# x").kind).toBe("theory");
    expect(detectFileKind("A/e.md", "---\ntype: exercise\n---\n").kind).toBe("exercise");
    expect(detectFileKind("A/nota.md", "# solo texto")).toMatchObject({ kind: "note", skills: [] });
  });
});
