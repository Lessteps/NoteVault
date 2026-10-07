import { describe, expect, test } from "vitest";
import { parseRestSecs } from "./parseRest";

describe("parseRestSecs", () => {
  test("número solo son segundos", () => {
    expect(parseRestSecs("90")).toBe(90);
  });

  test("con s son segundos", () => {
    expect(parseRestSecs("90s")).toBe(90);
    expect(parseRestSecs("90 s")).toBe(90);
  });

  test("m:ss son minutos y segundos", () => {
    expect(parseRestSecs("1:30")).toBe(90);
  });

  test("min son minutos", () => {
    expect(parseRestSecs("2 min")).toBe(120);
  });

  test("un rango usa la cota alta", () => {
    expect(parseRestSecs("60-90s")).toBe(90);
    expect(parseRestSecs("2-3 min")).toBe(180);
  });

  test("vacío o ilegible no propone nada", () => {
    expect(parseRestSecs("")).toBeNull();
    expect(parseRestSecs("cuando puedas")).toBeNull();
  });
});
