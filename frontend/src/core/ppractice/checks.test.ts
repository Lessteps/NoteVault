import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { detectChecks, runChecks, summarizeChecks, type CheckPlan } from "./checks";

const put = (root: string, rel: string, text: string) => {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "nv_ppchk_"));

describe("automatic checks", () => {
  it("finds test, build, lint and type-check scripts in every sub-project", () => {
    const root = tmp();
    put(root, "client/package.json", JSON.stringify({ scripts: { test: "vitest run", build: "vite build", lint: "eslint .", typecheck: "tsc -b" } }));
    fs.mkdirSync(path.join(root, "client/node_modules"));
    put(root, "server/package.json", JSON.stringify({ scripts: { test: "vitest run" } }));
    const plans = detectChecks(root);
    expect(plans.filter((p) => p.cwd === "client").map((p) => p.kind).sort()).toEqual(["build", "lint", "test", "typecheck"]);
    expect(plans.find((p) => p.cwd === "client" && p.kind === "test")!.skip).toBeUndefined();
    // dependencies are never installed for the learner: not installed means skipped, with the reason
    expect(plans.find((p) => p.cwd === "server")!.skip).toMatch(/not installed/);
  });

  it("does not count npm's placeholder test script as a failing test", () => {
    const root = tmp();
    put(root, "package.json", JSON.stringify({ scripts: { test: 'echo "Error: no test specified" && exit 1' } }));
    expect(detectChecks(root).filter((p) => p.kind === "test")).toEqual([]);
  });

  it("plans pytest only where there are Python tests", () => {
    const root = tmp();
    put(root, "api/requirements.txt", "fastapi\n");
    expect(detectChecks(root).filter((p) => p.id.endsWith("pytest"))).toEqual([]);
    put(root, "api/tests/test_a.py", "def test_a():\n    assert True\n");
    expect(detectChecks(root).filter((p) => p.id.endsWith("pytest"))).toHaveLength(1);
  });

  it("reports pass, fail, timeout and skip faithfully", async () => {
    const root = tmp();
    const node = process.execPath;
    const plan = (id: string, args: string[], skip?: string): CheckPlan => ({ id, kind: "test", label: id, cwd: "", command: node, args, ...(skip ? { skip } : {}) });
    const results = await runChecks(
      root,
      [
        plan("ok", ["-e", "console.log('all good')"]),
        plan("bad", ["-e", "console.error('boom'); process.exit(3)"]),
        plan("slow", ["-e", "setTimeout(() => {}, 5000)"]),
        plan("skipped", ["-e", "0"], "dependencies not installed"),
      ],
      700,
    );
    expect(results.map((r) => r.status)).toEqual(["passed", "failed", "timeout", "skipped"]);
    expect(results[0]!.output).toContain("all good");
    expect(results[1]).toMatchObject({ exitCode: 3 });
    expect(results[1]!.output).toContain("boom");
    const text = summarizeChecks(results);
    expect(text).toContain("PASS ok");
    expect(text).toContain("FAIL bad");
    expect(text).toContain("TIMEOUT slow");
    expect(text).toContain("SKIP skipped");
  });

  it("says plainly when there is nothing to run", () => {
    expect(summarizeChecks([])).toMatch(/No automatic checks applied/);
  });
});
