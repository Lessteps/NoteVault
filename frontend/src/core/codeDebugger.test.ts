import { describe, expect, it } from "vitest";
import { availableRuntimes, findPython, normalizeLanguage, runCode, traceCode } from "./codeDebugger.js";

const hasPython = findPython() !== null;
const py = hasPython ? it : it.skip;

describe("code runner", () => {
  it("recognises the languages of the exercises", () => {
    expect(normalizeLanguage("Python")).toBe("python");
    expect(normalizeLanguage("ts")).toBe("typescript");
    expect(normalizeLanguage("postgresql")).toBe("sql");
    expect(normalizeLanguage("cobol")).toBeNull();
    expect(availableRuntimes().map((r) => r.id)).toEqual(["python", "javascript", "typescript", "sql"]);
  });

  it("runs JavaScript and feeds stdin", async () => {
    const out = await runCode("javascript", "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>console.log(s.trim().toUpperCase()));", { stdin: "hola" });
    expect(out.ok).toBe(true);
    expect(out.stdout.trim()).toBe("HOLA");
  });

  it("runs TypeScript with types, enums and reports errors", async () => {
    const ok = await runCode("typescript", "enum Color { Red, Green }\nconst n: number = Color.Green + 41;\nconsole.log(n);");
    expect(ok.stdout.trim()).toBe("42");
    const bad = await runCode("typescript", "const x: number = 1;\nthrow new Error('boom');");
    expect(bad.ok).toBe(false);
    expect(bad.stderr).toContain("boom");
  });

  it("stops an infinite loop with a clear message", async () => {
    const out = await runCode("javascript", "while (true) {}", { timeoutMs: 800 });
    expect(out.timed_out).toBe(true);
    expect(out.ok).toBe(false);
    expect(out.stderr).toContain("Tiempo excedido");
  });

  it("runs SQL on SQLite and prints the results as tables", async () => {
    const out = await runCode(
      "sql",
      "CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT);\nINSERT INTO t (name) VALUES ('ana'), ('luis');\n-- a comment; with a semicolon\nSELECT id, name FROM t ORDER BY id DESC;",
    );
    expect(out.ok).toBe(true);
    expect(out.stdout).toMatch(/2\s+\| luis/);
    expect(out.stdout).toContain("(2 rows)");
    const bad = await runCode("sql", "SELECT * FROM nothing;");
    expect(bad.ok).toBe(false);
    expect(bad.stderr).toContain("statement 1");
  });

  py("runs Python", async () => {
    const out = await runCode("python", "print(sum(range(5)))\nname = input()\nprint('hi', name)", { stdin: "Ana\n" });
    expect(out.ok).toBe(true);
    expect(out.stdout.split(/\r?\n/).filter(Boolean)).toEqual(["10", "hi Ana"]);
  });
});

describe("step debugger", { timeout: 40000 }, () => {
  py("traces Python line by line with variables and returns", async () => {
    const t = await traceCode("python", "def add(a, b):\n    total = a + b\n    return total\n\nx = add(2, 3)\nprint(x)\n");
    expect(t.ok).toBe(true);
    expect(t.stdout.trim()).toBe("5");
    const lines = t.steps.map((s) => s.line);
    expect(lines).toContain(2);
    expect(lines.indexOf(5)).toBeLessThan(lines.indexOf(2));
    const inside = t.steps.find((s) => s.line === 3)!;
    expect(Object.fromEntries(inside.vars)).toMatchObject({ a: "2", b: "3", total: "5" });
    expect(inside.depth).toBe(2);
    expect(t.steps.find((s) => s.ret !== undefined)!.ret).toBe("5");
    expect(t.steps.every((s) => s.out <= t.stdout.length)).toBe(true);
    expect(t.steps[0]!.out).toBe(0);
  });

  py("reports a Python error without the harness in the traceback", async () => {
    const t = await traceCode("python", "a = [1]\nprint(a[3])\n");
    expect(t.ok).toBe(false);
    expect(t.stderr).toContain("IndexError");
    expect(t.stderr).not.toContain("nv_tracer");
    expect(t.steps.length).toBeGreaterThan(0);
  });

  it("traces JavaScript with the values of the variables at every line", async () => {
    const t = await traceCode("javascript", "function twice(n) {\n  const r = n * 2;\n  return r;\n}\nlet total = 0;\nfor (const k of [1, 2]) {\n  total += twice(k);\n}\nconsole.log(total, { a: [1, 2] });\n");
    expect(t.stderr).toBe("");
    expect(t.stdout.trim()).toBe("6 { a: [ 1, 2 ] }");
    const lines = t.steps.map((s) => s.line);
    expect(lines).toContain(2);
    expect(lines).toContain(9);
    const inside = t.steps.find((s) => s.line === 3)!;
    expect(Object.fromEntries(inside.vars)).toMatchObject({ n: "1", r: "2" });
    expect(inside.depth).toBe(2);
    const afterLoop = t.steps.find((s) => s.line === 9)!;
    expect(Object.fromEntries(afterLoop.vars).total).toBe("6");
    expect(t.steps.every((s) => s.vars.every(([name]) => name !== "require" && name !== "module"))).toBe(true);
    expect(t.steps[t.steps.length - 1]!.out).toBeGreaterThanOrEqual(0);
  });

  it("traces TypeScript keeping the line numbers", async () => {
    const t = await traceCode("typescript", "interface P { x: number }\nconst p: P = { x: 1 };\nconst y: number = p.x + 1;\nconsole.log(y);\n");
    expect(t.stdout.trim()).toBe("2");
    expect(t.steps.map((s) => s.line)).toEqual(expect.arrayContaining([2, 3, 4]));
    expect(Object.fromEntries(t.steps.find((s) => s.line === 4)!.vars).y).toBe("2");
  });

  it("caps the steps of a long loop and still finishes the program", async () => {
    const t = await traceCode("javascript", "let n = 0;\nfor (let i = 0; i < 5000; i++) { n += i; }\nconsole.log(n);\n");
    expect(t.steps_truncated).toBe(true);
    expect(t.steps.length).toBeLessThanOrEqual(400);
    expect(t.stdout.trim()).toBe("12497500");
  });

  it("says why an enum cannot be stepped, but still runs it", async () => {
    const t = await traceCode("typescript", "enum C { A }\nconsole.log(C.A);");
    expect(t.ok).toBe(false);
    expect(t.stderr).toContain("enum");
    expect((await runCode("typescript", "enum C { A }\nconsole.log(C.A);")).stdout.trim()).toBe("0");
  });

  it("explains that SQL has no step mode", async () => {
    const t = await traceCode("sql", "SELECT 1;");
    expect(t.ok).toBe(false);
    expect(t.steps).toEqual([]);
  });
});
