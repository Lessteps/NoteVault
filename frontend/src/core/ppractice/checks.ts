/**
 * `programming_practice` — the checks a defence runs BEFORE any model is called.
 *
 * Whether a project compiles, its tests pass and its type check is clean is a fact, not an opinion: it costs no tokens and a
 * model cannot get it wrong. The review that follows then spends the tokens on what needs judgement. These are the learner's
 * own projects, so their scripts run on this machine; it only happens when the learner asks for it, and dependencies are
 * never installed automatically (a project whose `node_modules` is missing reports "not installed", it does not fetch code).
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { findPython } from "../codeDebugger.js";

export type CheckKind = "test" | "build" | "lint" | "typecheck";

export interface CheckPlan {
  id: string;
  kind: CheckKind;
  label: string;
  /** Folder it runs in, relative to the project ("" = the project folder). */
  cwd: string;
  command: string;
  args: string[];
  /** Why it will not run (nothing installed, no runtime). */
  skip?: string;
}

export interface CheckResult {
  id: string;
  kind: CheckKind;
  label: string;
  cwd: string;
  command: string;
  status: "passed" | "failed" | "skipped" | "timeout";
  exitCode?: number;
  output: string;
  ms: number;
}

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".venv", "venv", "__pycache__", "release", "out", "target"]);
const SCRIPT_KINDS: Array<[CheckKind, string[]]> = [
  ["test", ["test"]],
  ["build", ["build"]],
  ["lint", ["lint"]],
  ["typecheck", ["typecheck", "type-check", "tsc"]],
];

/** Folders (the project itself and up to two levels down) that hold a package.json or a Python project. */
function projectRoots(dir: string): string[] {
  const roots: string[] = [];
  const walk = (abs: string, depth: number): void => {
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    const names = new Set(entries.filter((e) => e.isFile()).map((e) => e.name));
    if (names.has("package.json") || names.has("pyproject.toml") || names.has("requirements.txt") || names.has("pytest.ini")) roots.push(abs);
    if (depth >= 2) return;
    for (const e of entries) if (e.isDirectory() && !e.name.startsWith(".") && !SKIP_DIRS.has(e.name)) walk(path.join(abs, e.name), depth + 1);
  };
  walk(path.resolve(dir), 0);
  return roots;
}

const hasPyTests = (abs: string): boolean => {
  try {
    return fs.readdirSync(abs, { withFileTypes: true }).some((e) => (e.isFile() && /^(test_.*|.*_test)\.py$/.test(e.name)) || (e.isDirectory() && /^tests?$/.test(e.name)));
  } catch {
    return false;
  }
};

/** The checks that apply to this project, each marked as runnable or with the reason it is not. */
export function detectChecks(dir: string): CheckPlan[] {
  const base = path.resolve(dir);
  const plans: CheckPlan[] = [];
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  for (const root of projectRoots(base)) {
    const rel = path.relative(base, root).replace(/\\/g, "/");
    const where = rel || ".";
    const pkgFile = path.join(root, "package.json");
    if (fs.existsSync(pkgFile)) {
      let scripts: Record<string, string> = {};
      try {
        scripts = JSON.parse(fs.readFileSync(pkgFile, "utf-8")).scripts ?? {};
      } catch {
        /* a broken package.json is itself a finding; nothing to run */
      }
      const installed = fs.existsSync(path.join(root, "node_modules"));
      for (const [kind, names] of SCRIPT_KINDS) {
        const script = names.find((n) => typeof scripts[n] === "string");
        if (!script) continue;
        // npm's placeholder script `echo "Error: no test specified" && exit 1` is "no tests", not a failing test.
        if (kind === "test" && /no test specified/i.test(scripts[script]!)) continue;
        plans.push({
          id: `${where}:npm:${script}`,
          kind,
          label: `${kind} (npm run ${script}) in ${where}`,
          cwd: rel,
          command: npm,
          args: ["run", script, "--silent"],
          ...(installed ? {} : { skip: "dependencies not installed (run npm install first)" }),
        });
      }
      if (!scripts.typecheck && !scripts["type-check"] && !scripts.tsc && fs.existsSync(path.join(root, "tsconfig.json")) && installed) {
        plans.push({ id: `${where}:tsc`, kind: "typecheck", label: `typecheck (tsc --noEmit) in ${where}`, cwd: rel, command: npm, args: ["exec", "--", "tsc", "--noEmit"] });
      }
    }
    if (fs.existsSync(path.join(root, "pyproject.toml")) || fs.existsSync(path.join(root, "requirements.txt")) || fs.existsSync(path.join(root, "pytest.ini"))) {
      if (hasPyTests(root)) {
        const py = findPython();
        plans.push({
          id: `${where}:pytest`,
          kind: "test",
          label: `test (pytest) in ${where}`,
          cwd: rel,
          command: py?.command ?? "python",
          args: [...(py?.prefix ?? []), "-m", "pytest", "-q", "-x"],
          ...(py ? {} : { skip: "Python 3 not found" }),
        });
      }
    }
  }
  return plans;
}

const TAIL = 2200;
const tail = (text: string): string => (text.length > TAIL ? `…${text.slice(text.length - TAIL)}` : text);

function runOne(base: string, plan: CheckPlan, timeoutMs: number): Promise<CheckResult> {
  const started = Date.now();
  const done = (status: CheckResult["status"], output: string, exitCode?: number): CheckResult => ({
    id: plan.id, kind: plan.kind, label: plan.label, cwd: plan.cwd, command: `${plan.command} ${plan.args.join(" ")}`.trim(), status, output: tail(output.trim()), ms: Date.now() - started, ...(exitCode === undefined ? {} : { exitCode }),
  });
  if (plan.skip) return Promise.resolve(done("skipped", plan.skip));
  return new Promise((resolve) => {
    let out = "";
    let finished = false;
    const child = spawn(plan.command, plan.args, { cwd: path.join(base, plan.cwd), shell: process.platform === "win32" && /\.(cmd|bat)$/i.test(plan.command), windowsHide: true, env: { ...process.env, CI: "1", FORCE_COLOR: "0" } });
    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      child.kill();
      resolve(done("timeout", `${out}\n[stopped after ${Math.round(timeoutMs / 1000)} s]`));
    }, timeoutMs);
    const take = (d: Buffer) => {
      out += d.toString("utf-8");
      if (out.length > 60_000) out = out.slice(-30_000);
    };
    child.stdout?.on("data", take);
    child.stderr?.on("data", take);
    child.on("error", (e) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve(done("skipped", `could not start: ${e.message}`));
    });
    child.on("close", (code) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve(done(code === 0 ? "passed" : "failed", out, code ?? undefined));
    });
  });
}

/** Runs the plans one after another (a project's checks share ports, caches and disk). */
export async function runChecks(dir: string, plans: readonly CheckPlan[], timeoutMs = 120_000): Promise<CheckResult[]> {
  const base = path.resolve(dir);
  const results: CheckResult[] = [];
  for (const plan of plans) results.push(await runOne(base, plan, timeoutMs));
  return results;
}

/** The checks as text for a prompt or a report. */
export function summarizeChecks(results: readonly CheckResult[]): string {
  if (!results.length) return "No automatic checks applied (no test, build, lint or type-check script was found).";
  return results
    .map((r) => {
      const mark = r.status === "passed" ? "PASS" : r.status === "failed" ? "FAIL" : r.status === "timeout" ? "TIMEOUT" : "SKIP";
      const detail = r.status === "passed" ? "" : `\n${r.output.split("\n").slice(-12).join("\n")}`;
      return `- ${mark} ${r.label} (${r.ms} ms)${detail}`;
    })
    .join("\n");
}
