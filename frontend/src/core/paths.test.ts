import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { insideVault, relPosix, toPosix } from "./paths";

describe("paths", () => {
  it("converts paths to posix format", () => {
    expect(toPosix("a\\b\\c")).toBe("a/b/c");
    expect(toPosix("a/b/c")).toBe("a/b/c");
  });

  it("calculates relative posix paths", () => {
    const root = path.resolve("/vault/root");
    const target = path.join(root, "notes", "daily.md");
    expect(relPosix(root, target)).toBe("notes/daily.md");
    expect(relPosix(root, root)).toBe("");
  });

  it("guards against path traversal outside the vault", () => {
    const root = path.resolve("/vault/root");
    expect(insideVault(root, path.join(root, "notes", "sub.md"))).toBe(true);
    expect(insideVault(root, root)).toBe(true);
    expect(insideVault(root, path.join(root, "..", "outside.txt"))).toBe(false);
  });
});
