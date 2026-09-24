import { describe, expect, it } from "vitest";
import { badgeFor, kindFor } from "./fileKinds";

describe("fileKinds", () => {
  it("classifies notes, canvas and code", () => {
    expect(kindFor("hello.md")).toBe("note");
    expect(kindFor("path/to/Note.MD")).toBe("note");
    expect(kindFor("diagram.canvas")).toBe("canvas");
    expect(kindFor("script.py")).toBe("code");
    expect(kindFor("app.tsx")).toBe("code");
    expect(kindFor("query.sql")).toBe("code");
    expect(kindFor("image.png")).toBe("");
    expect(kindFor("document.pdf")).toBe("");
    expect(kindFor("noext")).toBe("");
  });

  it("returns language badge and color", () => {
    expect(badgeFor("main.py")).toEqual(["PY", "#3776ab"]);
    expect(badgeFor("index.ts")).toEqual(["TS", "#3178c6"]);
    expect(badgeFor("component.jsx")).toEqual(["JSX", "#1f9fc2"]);
    expect(badgeFor("unknown.foo")).toEqual(["TXT", "#6b6b74"]);
  });
});
