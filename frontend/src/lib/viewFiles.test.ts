// The renderer mirrors the view-file convention (it cannot import src/core, see
// tsconfig.app.json); this keeps both copies in step.

import { describe, expect, it } from "vitest";
import { VIEW_FILE_KINDS as CORE_KINDS } from "../core/practice/viewFiles";
import { VIEW_FILE_KINDS, siblingTheoryPath, viewFileKind, viewFileName } from "./viewFiles";

describe("view files (renderer side)", () => {
  it("knows exactly the same kinds as the core", () => {
    expect([...VIEW_FILE_KINDS].sort()).toEqual([...CORE_KINDS].sort());
  });

  it("maps a frontmatter type to the view it opens", () => {
    expect(viewFileKind({ type: "practica" })).toBe("practica");
    expect(viewFileKind({ type: " teorica " })).toBe("teorica");
    expect(viewFileKind({ type: "concept" })).toBeNull();
    expect(viewFileKind(null)).toBeNull();
  });

  it("names a view file after its folder", () => {
    expect(viewFileName("1.1 Números naturales", "practica")).toBe("1.1 Números naturales.practica.md");
  });

  it("resolves the theory note of a teorica view file", () => {
    expect(siblingTheoryPath("Matemáticas/1 Aritmética/1.1 X/1.1 X.teorica.md"))
      .toBe("Matemáticas/1 Aritmética/1.1 X/1.1 X.md");
    expect(siblingTheoryPath("1.1 X.teorica.md")).toBe("1.1 X.md");
  });
});
