import { describe, expect, it } from "vitest";
import { stampOf, withStamp } from "./skillStamp";

describe("marca de versión de la skill", () => {
  it("se añade al frontmatter, se lee y se cambia sin duplicarse", () => {
    const note = '---\ntitle: "X"\nstatus: draft\n---\n\n# X\n';
    expect(stampOf(note)).toBeNull();
    const a = withStamp(note, "abcdef12");
    expect(stampOf(a)).toBe("abcdef12");
    expect(a.endsWith("\n\n# X\n")).toBe(true);
    const b = withStamp(a, "01234567");
    expect(stampOf(b)).toBe("01234567");
    expect(b.match(/skill_version/g)).toHaveLength(1);
  });
  it("sin frontmatter no inventa uno", () => {
    expect(withStamp("# solo cuerpo\n", "abcdef12")).toBe("# solo cuerpo\n");
    expect(stampOf("# solo cuerpo\n")).toBeNull();
  });
});
