import { describe, expect, it } from "vitest";
import { curriculumIdsOfScope, curriculumIdsOfText, reviewPrompt } from "./methodologyScope";

const ALL = ["html", "css", "atomic-design", "js-reference", "java"];

describe("methodologyScope", () => {
  it("reconoce HTML, CSS, JavaScript y Frontend por nombre", () => {
    expect(curriculumIdsOfText("HTML")).toEqual(["html"]);
    expect(curriculumIdsOfText("Lenguaje JavaScript")).toEqual(["js-reference"]);
    expect(curriculumIdsOfText("Frontend")).toEqual(["html", "css", "atomic-design", "js-reference"]);
    expect(curriculumIdsOfText("Python")).toEqual([]);
  });

  it("todas → todas; asignatura → la suya; área sin referencia → vacío", () => {
    expect(curriculumIdsOfScope({ kind: "all" }, ALL)).toEqual(ALL);
    expect(curriculumIdsOfScope({ kind: "group", groupId: "css", groupTitle: "CSS", areaName: "Frontend" }, ALL)).toEqual(["css"]);
    expect(curriculumIdsOfScope({ kind: "area", areaName: "Backend" }, ALL)).toEqual([]);
  });

  it("el prompt lleva las reglas, los temas y el formato de respuesta", () => {
    const p = reviewPrompt({ kind: "group", label: "CSS" }, [{ folder: "P/5/5.2 CSS", title: "CSS", group: "css" }]);
    expect(p).toContain("ONE topic per element");
    expect(p).toContain("- CSS [css] (P/5/5.2 CSS)");
    expect(p).toContain("Topics to split");
  });
});
