import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { changedSince, classify, estimateTokens, readProject, redact, renderFiles, selectFiles, truncateMiddle } from "./reader";

const put = (root: string, rel: string, text: string | Buffer) => {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};

function project(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nv_ppread_"));
  put(root, "backend/app/main.py", "from fastapi import FastAPI\napp = FastAPI()\n");
  put(root, "backend/app/services/links.py", "def shorten(url):\n    return url[:6]\n");
  put(root, "backend/tests/test_links.py", "def test_ok():\n    assert True\n");
  put(root, "backend/migrations/001_init.sql", "CREATE TABLE links (id INTEGER PRIMARY KEY);\n");
  put(root, "client/src/components/atoms/Button.tsx", "export const Button = () => null;\n");
  put(root, "client/package.json", '{"scripts":{"build":"vite build"}}');
  put(root, "client/package-lock.json", "{}".repeat(5000));
  put(root, "client/node_modules/react/index.js", "module.exports = {};");
  put(root, "client/dist/bundle.js", "x".repeat(100));
  put(root, ".env", "API_KEY=sk-abcdefghijklmnopqrstuvwxyz123456");
  put(root, "logo.png", Buffer.from([137, 80, 78, 71, 0, 0, 0]));
  put(root, "README.md", "# Project\n");
  put(root, "SPEC.md", "the spec the app wrote");
  put(root, "DEFENSE-1.md", "a previous report");
  return root;
}

describe("project reader", () => {
  it("classifies files by layer", () => {
    expect(classify("backend/tests/test_links.py")).toBe("tests");
    expect(classify("src/Button.test.tsx")).toBe("tests");
    expect(classify("db/migrations/001.sql")).toBe("database");
    expect(classify("client/src/App.tsx")).toBe("client");
    expect(classify("src/components/atoms/Button.ts")).toBe("client");
    expect(classify("backend/app/main.py")).toBe("backend");
    expect(classify("package.json")).toBe("config");
    expect(classify("README.md")).toBe("docs");
  });

  it("skips dependencies, build output, lockfiles, binaries, secrets and the app's own files", () => {
    const pack = readProject(project());
    const names = pack.files.map((f) => f.rel);
    expect(names).toContain("backend/app/main.py");
    expect(names).toContain("client/src/components/atoms/Button.tsx");
    for (const gone of ["client/package-lock.json", "client/node_modules/react/index.js", "client/dist/bundle.js", ".env", "logo.png", "SPEC.md", "DEFENSE-1.md"]) expect(names).not.toContain(gone);
    const reasons = Object.fromEntries(pack.skipped.map((s) => [s.rel, s.reason]));
    expect(reasons[".env"]).toMatch(/secrets/);
    expect(reasons["client/package-lock.json"]).toBe("lockfile");
    expect(reasons["logo.png"]).toBe("binary");
    expect(reasons["client/node_modules/"]).toMatch(/dependencies/);
  });

  it("redacts credentials that appear in code before anything is sent", () => {
    expect(redact('const key = "sk-abcdefghijklmnopqrstuvwxyz123456";')).toContain("[redacted-key]");
    expect(redact('password = "hunter2hunter2"')).toContain("[redacted]");
    expect(redact("ghp_abcdefghijklmnopqrstuvwxyz0123456789")).toBe("[redacted-token]");
    expect(redact("const total = items.length;")).toBe("const total = items.length;");
  });

  it("fills a byte budget per layer with the most informative files first and truncates long ones", () => {
    const pack = readProject(project());
    const sel = selectFiles(pack, { groups: ["backend"], budget: 10_000 });
    expect(sel.files[0]!.rel).toBe("backend/app/main.py");
    expect(sel.files.every((f) => f.group === "backend")).toBe(true);
    const cut = truncateMiddle("a".repeat(100), 40);
    expect(cut.truncated).toBe(true);
    expect(cut.text).toContain("characters omitted");
    expect(selectFiles(pack, { groups: ["backend"], budget: 20 }).left.length).toBeGreaterThan(0);
    expect(renderFiles(sel.files)).toContain("### backend/app/main.py");
  });

  it("finds only what changed since the last defence", () => {
    const root = project();
    const first = readProject(root);
    expect(changedSince(first, null).changed.length).toBe(first.files.length);
    put(root, "backend/app/main.py", "from fastapi import FastAPI\napp = FastAPI(title='x')\n");
    fs.rmSync(path.join(root, "README.md"));
    const second = readProject(root);
    const diff = changedSince(second, first.manifest);
    expect(diff.changed.map((f) => f.rel)).toEqual(["backend/app/main.py"]);
    expect(diff.removed).toEqual(["README.md"]);
  });

  it("estimates tokens from characters", () => {
    expect(estimateTokens(3600)).toBe(1000);
    expect(estimateTokens(0)).toBe(0);
  });
});
