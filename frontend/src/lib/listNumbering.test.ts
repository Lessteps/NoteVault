import { describe, expect, it } from "vitest";
import { numberLines } from "./listNumbering";

const labels = (lines: string[]) => numberLines(lines).map((l) => l?.label ?? null);

describe("numberLines", () => {
  it("numbers a flat list 1. 2. 3.", () => {
    expect(labels(["1. a", "2. b", "3. c"])).toEqual(["1.", "2.", "3."]);
  });

  it("nests by indentation: 1. / 1.1 / 1.1.1", () => {
    expect(labels(["1. a", "    1. b", "        1. c", "        2. d", "    2. e", "2. f"]))
      .toEqual(["1.", "1.1", "1.1.1", "1.1.2", "1.2", "2."]);
  });

  it("stops after five numbers", () => {
    const deep = ["1. a", "  1. b", "    1. c", "      1. d", "        1. e", "          1. f"];
    expect(labels(deep)[4]).toBe("1.1.1.1.1");
    expect(labels(deep)[5]).toBe("1");
  });

  it("restarts under a bullet and after prose", () => {
    expect(labels(["- x", "  1. a", "text", "1. b"])).toEqual([null, "1.", null, "1."]);
  });

  it("keeps the number going across blank lines", () => {
    expect(labels(["1. a", "", "2. b"])).toEqual(["1.", null, "2."]);
  });
});
