/**
 * Local code runner and step debugger for the programming exercises.
 *
 * - Python runs with the interpreter installed on the machine; JavaScript and TypeScript run on Node itself (the
 *   Electron binary in "run as node" mode, so nothing has to be installed); SQL runs on the SQLite built into Node.
 * - "Trace" mode records, for every executed line, the variables alive at that moment and how much output had been
 *   printed: Python through `sys.settrace`, JavaScript/TypeScript through the V8 inspector (Debugger.stepInto).
 * - Everything runs in a temporary folder, with a timeout and capped output. It executes the learner's own code on
 *   their own machine, exactly as a terminal would: there is no sandbox.
 */

import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export type CodeLanguage = "python" | "javascript" | "typescript" | "sql";

export const CODE_LANGUAGES: ReadonlyArray<{ id: CodeLanguage; label: string; ext: string }> = [
  { id: "python", label: "Python", ext: ".py" },
  { id: "javascript", label: "JavaScript", ext: ".js" },
  { id: "typescript", label: "TypeScript", ext: ".ts" },
  { id: "sql", label: "SQL (SQLite)", ext: ".sql" },
];

export interface RunResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exit_code: number | null;
  ms: number;
  timed_out: boolean;
  /** The output was cut because it was too long. */
  truncated: boolean;
  runtime: string;
}

export interface TraceStep {
  line: number;
  fn: string;
  depth: number;
  vars: Array<[string, string]>;
  /** Characters of standard output printed when this step was reached. */
  out: number;
  ret?: string;
  exc?: string;
}

export interface TraceResult extends RunResult {
  steps: TraceStep[];
  steps_truncated: boolean;
}

export interface RunOptions {
  stdin?: string;
  timeoutMs?: number;
}

const MAX_OUTPUT = 200_000;
const MAX_STEPS = 400;
/** Share of the trace timeout spent recording steps; the rest lets the program run to its end. */
const STEP_BUDGET = 0.6;
const DEFAULT_TIMEOUT = 10_000;
const TRACE_TIMEOUT = 20_000;

export function normalizeLanguage(raw: string): CodeLanguage | null {
  const l = raw.toLowerCase().trim();
  if (["python", "py", "python3"].includes(l)) return "python";
  if (["javascript", "js", "node", "mjs"].includes(l)) return "javascript";
  if (["typescript", "ts"].includes(l)) return "typescript";
  if (["sql", "sqlite", "postgresql", "postgres"].includes(l)) return "sql";
  return null;
}

/**
 * The language the code of a programming exercise runs in, from its discipline ("" when it is not code that can run
 * here: shell commands, architecture, explanations). A language written in the exercise itself wins.
 */
export function runLanguageFor(subject: string, discipline: string, codeLang = ""): CodeLanguage | "" {
  if (subject !== "programming") return "";
  const own = normalizeLanguage(codeLang);
  if (own) return own;
  switch (discipline) {
    case "python": case "programming_logic": case "backend": case "automation": return "python";
    case "javascript": return "javascript";
    case "typescript": case "desktop": case "frontend": case "mobile": return "typescript";
    case "sql": return "sql";
    default: return "";
  }
}

/* ─────────────────────────────  runtimes  ───────────────────────────── */

interface Runtime {
  command: string;
  prefix: string[];
  env: Record<string, string>;
  label: string;
}

let pythonCache: Runtime | null | undefined;

/** The Python 3 of this machine (the Windows Store stub and Python 2 do not count), or null. */
export function findPython(): Runtime | null {
  if (pythonCache !== undefined) return pythonCache;
  const candidates: Array<[string, string[]]> = [["py", ["-3"]], ["python", []], ["python3", []]];
  for (const [command, prefix] of candidates) {
    try {
      const r = spawnSync(command, [...prefix, "--version"], { encoding: "utf-8", timeout: 4000, windowsHide: true });
      const text = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();
      if (r.status === 0 && /^Python 3/.test(text)) {
        pythonCache = { command, prefix, env: { PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" }, label: text };
        return pythonCache;
      }
    } catch {
      /* try the next one */
    }
  }
  pythonCache = null;
  return null;
}

/** Node itself: inside Electron the app binary runs as a plain Node when asked to. */
export function nodeRuntime(): Runtime {
  return { command: process.execPath, prefix: [], env: { ELECTRON_RUN_AS_NODE: "1" }, label: `Node ${process.versions.node}` };
}

export function availableRuntimes(): Array<{ id: CodeLanguage; label: string; available: boolean; runtime: string }> {
  const py = findPython();
  const node = nodeRuntime();
  return CODE_LANGUAGES.map((l) => ({
    id: l.id,
    label: l.label,
    available: l.id === "python" ? py !== null : true,
    runtime: l.id === "python" ? (py?.label ?? "Python 3 no está instalado") : node.label,
  }));
}

/* ─────────────────────────────  scripts  ───────────────────────────── */

/** Runs the learner's Python under sys.settrace and writes the steps to a JSON file. */
const PY_TRACER = String.raw`import sys, json, types, traceback

user_path, trace_path, max_steps = sys.argv[1], sys.argv[2], int(sys.argv[3])

class Tee:
    def __init__(self, real):
        self.real = real
        self.n = 0
    def write(self, s):
        self.n += len(s)
        return self.real.write(s)
    def flush(self):
        self.real.flush()
    def __getattr__(self, name):
        return getattr(self.real, name)

sys.stdout.reconfigure(encoding="utf-8", newline="\n")
out = Tee(sys.stdout)
sys.stdout = out
steps = []
state = {"truncated": False}

def show(v):
    try:
        r = repr(v)
    except Exception:
        r = "<" + type(v).__name__ + ">"
    return r if len(r) <= 80 else r[:77] + "..."

def snapshot(frame):
    items = []
    for k, v in list(frame.f_locals.items()):
        if k.startswith("__") or isinstance(v, (types.ModuleType, types.FunctionType, type)):
            continue
        items.append([k, show(v)])
        if len(items) >= 16:
            break
    return items

def depth_of(frame):
    d = 0
    while frame is not None:
        if frame.f_code.co_filename == user_path:
            d += 1
        frame = frame.f_back
    return d

def tracer(frame, event, arg):
    if frame.f_code.co_filename != user_path:
        return None
    if event == "call":
        return tracer
    if len(steps) >= max_steps:
        state["truncated"] = True
        sys.settrace(None)
        return None
    step = {"line": frame.f_lineno, "fn": frame.f_code.co_name, "depth": depth_of(frame), "vars": snapshot(frame), "out": out.n}
    if event == "return":
        if frame.f_code.co_name == "<module>":
            return tracer
        step["ret"] = show(arg)
    elif event == "exception":
        step["exc"] = show(arg[1])
    steps.append(step)
    return tracer

with open(user_path, encoding="utf-8") as f:
    source = f.read()
code = compile(source, user_path, "exec")
scope = {"__name__": "__main__", "__file__": user_path}
sys.settrace(tracer)
try:
    exec(code, scope)
except SystemExit:
    pass
except BaseException as e:
    sys.settrace(None)
    traceback.print_exception(type(e), e, e.__traceback__.tb_next if e.__traceback__ else None)
    state["failed"] = True
finally:
    sys.settrace(None)
    sys.stdout.flush()
    with open(trace_path, "w", encoding="utf-8") as f:
        json.dump({"steps": steps, "truncated": state["truncated"]}, f)
if state.get("failed"):
    sys.exit(1)
`;

/** Counts what the program prints, so each debugger step knows how much output existed. */
const JS_PRELOAD = String.raw`globalThis.__nvOut = 0;
const write = process.stdout.write.bind(process.stdout);
process.stdout.write = function (chunk, ...rest) {
  globalThis.__nvOut += String(chunk).length;
  return write(chunk, ...rest);
};
`;

/** Runs the statements of a .sql file on an in-memory SQLite and prints each result as a table. */
const SQL_RUNNER = String.raw`const { DatabaseSync } = require("node:sqlite");
const fs = require("node:fs");
const sql = fs.readFileSync(process.argv[2], "utf-8");

function split(text) {
  const out = [];
  let cur = "", q = "", i = 0;
  while (i < text.length) {
    const c = text[i], n = text[i + 1];
    if (q) {
      cur += c;
      if (c === q) { if (n === q) { cur += n; i++; } else q = ""; }
    } else if (c === "'" || c === '"' || c === "` + "`" + String.raw`") {
      q = c; cur += c;
    } else if (c === "-" && n === "-") {
      while (i < text.length && text[i] !== "\n") i++;
      continue;
    } else if (c === "/" && n === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i += 2;
      continue;
    } else if (c === ";") {
      if (cur.trim()) out.push(cur.trim());
      cur = "";
    } else cur += c;
    i++;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function cell(v) { return v === null ? "NULL" : typeof v === "bigint" ? String(v) : String(v); }

function table(cols, rows) {
  const data = rows.map((r) => cols.map((c) => cell(r[c])));
  const widths = cols.map((c, k) => Math.max(c.length, ...data.map((r) => r[k].length)));
  const line = (cells) => cells.map((s, k) => s.padEnd(widths[k])).join(" | ");
  return [line(cols), widths.map((w) => "-".repeat(w)).join("-+-"), ...data.map(line)].join("\n");
}

const db = new DatabaseSync(":memory:");
const statements = split(sql);
let n = 0;
for (const text of statements) {
  n++;
  try {
    const st = db.prepare(text);
    const cols = st.columns().map((c) => c.name);
    if (cols.length > 0) {
      const rows = st.all();
      console.log(table(cols, rows));
      console.log("(" + rows.length + (rows.length === 1 ? " row)" : " rows)") + "\n");
    } else {
      const r = st.run();
      console.log("OK (" + r.changes + (Number(r.changes) === 1 ? " row" : " rows") + " affected)\n");
    }
  } catch (e) {
    console.error("Error in statement " + n + ": " + e.message + "\n  " + text.split("\n")[0]);
    process.exit(1);
  }
}
if (statements.length === 0) console.log("(nothing to run)");
`;

/* ─────────────────────────────  process helpers  ───────────────────────────── */

interface Spawned {
  stdout: string;
  stderr: string;
  code: number | null;
  timedOut: boolean;
  truncated: boolean;
  ms: number;
}

/** Captures a child's output with a cap and kills it when the time is up. */
function collect(child: ChildProcessWithoutNullStreams, stdin: string, timeoutMs: number): Promise<Spawned> {
  return new Promise((resolve) => {
    const started = Date.now();
    let stdout = "";
    let stderr = "";
    let truncated = false;
    let timedOut = false;
    const take = (cur: string, chunk: Buffer): string => {
      if (cur.length >= MAX_OUTPUT) {
        truncated = true;
        return cur;
      }
      return cur + chunk.toString("utf-8");
    };
    child.stdout.on("data", (d: Buffer) => { stdout = take(stdout, d); });
    child.stderr.on("data", (d: Buffer) => { stderr = take(stderr, d); });
    child.stdin.on("error", () => undefined);
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    const done = (code: number | null): void => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code, timedOut, truncated, ms: Date.now() - started });
    };
    child.on("error", (e) => {
      stderr += String(e.message);
      done(null);
    });
    child.on("close", (code) => done(code));
    child.stdin.end(stdin);
  });
}

function limit(text: string): string {
  const plain = text.replace(/\r\n/g, "\n");
  return plain.length > MAX_OUTPUT ? `${plain.slice(0, MAX_OUTPUT)}\n… (salida recortada)` : plain;
}

function result(sp: Spawned, runtime: string, timeoutMs: number): RunResult {
  const stderr = sp.timedOut ? `${sp.stderr}\nTiempo excedido: el programa tardó más de ${Math.round(timeoutMs / 1000)} s y se detuvo (¿un bucle infinito?).`.trim() : sp.stderr;
  return {
    ok: sp.code === 0 && !sp.timedOut,
    stdout: limit(sp.stdout),
    stderr: limit(stderr),
    exit_code: sp.code,
    ms: sp.ms,
    timed_out: sp.timedOut,
    truncated: sp.truncated,
    runtime,
  };
}

const failed = (message: string, runtime = ""): RunResult => ({
  ok: false, stdout: "", stderr: message, exit_code: null, ms: 0, timed_out: false, truncated: false, runtime,
});

function workDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "notevault-code-"));
}

function cleanUp(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* the temp folder is cleaned by the OS eventually */
  }
}

function launch(rt: Runtime, args: string[], cwd: string): ChildProcessWithoutNullStreams {
  return spawn(rt.command, [...rt.prefix, ...args], {
    cwd,
    env: { ...process.env, ...rt.env },
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  });
}

/**
 * Node erases the types of a .ts file keeping every line where it was, which is what the step debugger needs.
 * Enums, namespaces and constructor parameter properties are not just types: they need a real transform, which
 * moves lines around. Such code still runs, but cannot be stepped.
 */
export function needsTransform(code: string): boolean {
  return /^\s*(export\s+)?(declare\s+)?(const\s+)?(enum|namespace)\s+\w/m.test(code) || /constructor\s*\([^)]*\b(public|private|protected|readonly)\s+\w/.test(code);
}

/* ─────────────────────────────  run  ───────────────────────────── */

export async function runCode(languageRaw: string, code: string, opts: RunOptions = {}): Promise<RunResult> {
  const language = normalizeLanguage(languageRaw);
  if (language === null) return failed(`No se puede ejecutar «${languageRaw}» aquí. Puedes ejecutar Python, JavaScript, TypeScript y SQL.`);
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT;
  const dir = workDir();
  try {
    const ext = CODE_LANGUAGES.find((l) => l.id === language)!.ext;
    const file = path.join(dir, `main${ext}`);
    fs.writeFileSync(file, code, "utf-8");
    if (language === "python") {
      const py = findPython();
      if (py === null) return failed("No se encontró Python 3 en este equipo. Instálalo desde python.org para poder ejecutar código Python.");
      return result(await collect(launch(py, ["-u", "-X", "utf8", file], dir), opts.stdin ?? "", timeoutMs), py.label, timeoutMs);
    }
    const node = nodeRuntime();
    if (language === "sql") {
      const runner = path.join(dir, "sql_runner.cjs");
      fs.writeFileSync(runner, SQL_RUNNER, "utf-8");
      return result(await collect(launch(node, ["--disable-warning=ExperimentalWarning", runner, file], dir), "", timeoutMs), "SQLite (memoria)", timeoutMs);
    }
    const args = language === "typescript" ? [...(needsTransform(code) ? ["--experimental-transform-types"] : []), "--disable-warning=ExperimentalWarning", file] : [file];
    return result(await collect(launch(node, args, dir), opts.stdin ?? "", timeoutMs), language === "typescript" ? `${node.label} (TypeScript)` : node.label, timeoutMs);
  } finally {
    cleanUp(dir);
  }
}

/* ─────────────────────────────  trace  ───────────────────────────── */

const emptyTrace = (run: RunResult): TraceResult => ({ ...run, steps: [], steps_truncated: false });

export async function traceCode(languageRaw: string, code: string, opts: RunOptions = {}): Promise<TraceResult> {
  const language = normalizeLanguage(languageRaw);
  if (language === null) return emptyTrace(failed(`No se puede depurar «${languageRaw}» aquí.`));
  if (language === "sql") return emptyTrace(failed("El paso a paso no existe para SQL: ejecuta las sentencias y compara cada resultado con lo que esperabas."));
  const timeoutMs = opts.timeoutMs ?? TRACE_TIMEOUT;
  const dir = workDir();
  try {
    const ext = CODE_LANGUAGES.find((l) => l.id === language)!.ext;
    const file = path.join(dir, `main${ext}`);
    fs.writeFileSync(file, code, "utf-8");
    if (language === "typescript" && needsTransform(code)) {
      return emptyTrace(failed("El paso a paso de TypeScript necesita que el código solo tenga tipos que borrar. Este usa enum, namespace o propiedades en el constructor: puedes ejecutarlo, pero para recorrerlo cámbialos por un objeto «as const», una unión de literales o asignaciones en el cuerpo del constructor."));
    }
    const traced = language === "python"
      ? await tracePython(file, dir, opts.stdin ?? "", timeoutMs)
      : await traceScript(file, dir, opts.stdin ?? "", timeoutMs, language === "typescript");
    // Node appends a source-map comment to a stripped .ts file: a step there is not a line of the learner's code.
    const lineCount = code.split("\n").length;
    return { ...traced, steps: traced.steps.filter((s) => s.line <= lineCount) };
  } finally {
    cleanUp(dir);
  }
}

async function tracePython(file: string, dir: string, stdin: string, timeoutMs: number): Promise<TraceResult> {
  const py = findPython();
  if (py === null) return emptyTrace(failed("No se encontró Python 3 en este equipo. Instálalo desde python.org para poder depurar código Python."));
  const tracer = path.join(dir, "nv_tracer.py");
  const out = path.join(dir, "trace.json");
  fs.writeFileSync(tracer, PY_TRACER, "utf-8");
  const sp = await collect(launch(py, ["-u", "-X", "utf8", tracer, file, out, String(MAX_STEPS)], dir), stdin, timeoutMs);
  let steps: TraceStep[] = [];
  let truncated = false;
  try {
    const data = JSON.parse(fs.readFileSync(out, "utf-8")) as { steps: TraceStep[]; truncated: boolean };
    steps = data.steps;
    truncated = data.truncated;
  } catch {
    /* the program died before writing the trace (a syntax error, a timeout): the error is in stderr */
  }
  // A syntax error never reaches the harness's own code: report the learner's file name, not the temp one.
  const run = result(sp, py.label, timeoutMs);
  return { ...run, stderr: run.stderr.split(file).join("main.py"), steps, steps_truncated: truncated };
}

interface Cdp {
  send: (method: string, params?: Record<string, unknown>) => Promise<any>;
  on: (method: string, fn: (params: any) => void) => void;
  close: () => void;
}

function connectCdp(url: string): Promise<Cdp> {
  return new Promise((resolve, reject) => {
    const WS = (globalThis as unknown as { WebSocket?: new (u: string) => any }).WebSocket;
    if (!WS) {
      reject(new Error("Este entorno no trae WebSocket: no se puede depurar JavaScript."));
      return;
    }
    const ws = new WS(url);
    let seq = 0;
    const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
    const handlers = new Map<string, Array<(p: any) => void>>();
    ws.onopen = () =>
      resolve({
        send: (method, params = {}) =>
          new Promise((res, rej) => {
            const id = ++seq;
            pending.set(id, { resolve: res, reject: rej });
            ws.send(JSON.stringify({ id, method, params }));
          }),
        on: (method, fn) => handlers.set(method, [...(handlers.get(method) ?? []), fn]),
        close: () => {
          try { ws.close(); } catch { /* already closed */ }
        },
      });
    ws.onerror = () => reject(new Error("No se pudo conectar con el depurador de Node."));
    ws.onclose = () => {
      for (const p of pending.values()) p.reject(new Error("closed"));
      pending.clear();
    };
    ws.onmessage = (ev: { data: unknown }) => {
      const msg = JSON.parse(String(ev.data)) as { id?: number; result?: unknown; error?: { message: string }; method?: string; params?: unknown };
      if (msg.id !== undefined) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        if (p) msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
      } else if (msg.method) {
        for (const fn of handlers.get(msg.method) ?? []) fn(msg.params);
      }
    };
  });
}

const HIDDEN_NAMES = new Set(["exports", "require", "module", "__filename", "__dirname", "arguments"]);
const STRINGIFY =
  "function(){try{const s=JSON.stringify(this,(k,v)=>v instanceof Map?{Map:[...v]}:v instanceof Set?{Set:[...v]}:typeof v==='bigint'?String(v):v);return s===undefined?String(this):s}catch(e){return String(this)}}";

const clip = (s: string): string => (s.length <= 80 ? s : `${s.slice(0, 77)}...`);

/** JavaScript / TypeScript: spawn Node with the inspector, step into every line of the learner's file and read its scope. */
async function traceScript(file: string, dir: string, stdin: string, timeoutMs: number, ts: boolean): Promise<TraceResult> {
  const node = nodeRuntime();
  const preload = path.join(dir, "nv_preload.cjs");
  fs.writeFileSync(preload, JS_PRELOAD, "utf-8");
  const args = ["--inspect-brk=127.0.0.1:0", "--disable-warning=ExperimentalWarning", "-r", preload, file];
  const child = launch(node, args, dir);
  const started = Date.now();
  const steps: TraceStep[] = [];
  let stepsTruncated = false;
  let stdout = "";
  let stderr = "";
  let truncated = false;
  child.stdout.on("data", (d: Buffer) => {
    if (stdout.length < MAX_OUTPUT) stdout += d.toString("utf-8");
    else truncated = true;
  });
  let announced!: (url: string) => void;
  const wsUrl = new Promise<string>((res) => { announced = res; });
  let closeCdp: () => void = () => undefined;
  child.stderr.on("data", (d: Buffer) => {
    const text = d.toString("utf-8");
    const m = /ws:\/\/[^\s]+/.exec(text);
    if (m) announced(m[0]);
    else if (stderr.length < MAX_OUTPUT) stderr += text;
    // When the program ends, Node waits for the debugger to leave before it exits.
    if (text.includes("Waiting for the debugger to disconnect")) closeCdp();
  });
  child.stdin.on("error", () => undefined);
  child.stdin.end(stdin);
  const exited = new Promise<number | null>((res) => {
    child.on("close", (code) => res(code));
    child.on("error", (e) => {
      stderr += String(e.message);
      res(null);
    });
  });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, timeoutMs);

  try {
    const url = await Promise.race([wsUrl, exited.then(() => "")]);
    if (url) {
      const cdp = await connectCdp(url);
      closeCdp = cdp.close;
      const base = path.basename(file);
      let lastPause = Promise.resolve();
      const scripts = new Map<string, string>();
      cdp.on("Debugger.scriptParsed", (p) => scripts.set(String(p.scriptId), String(p.url ?? "")));
      const inUser = (cf: any): boolean => decodeURIComponent(scripts.get(String(cf.location?.scriptId)) ?? "").endsWith(base);

      const scopeVars = async (cf: any): Promise<Array<[string, string]>> => {
        const vars: Array<[string, string]> = [];
        for (const scope of cf.scopeChain ?? []) {
          if (!["local", "block", "module", "catch"].includes(scope.type) || !scope.object?.objectId) continue;
          const props = await cdp.send("Runtime.getProperties", { objectId: scope.object.objectId, ownProperties: true });
          for (const p of props.result ?? []) {
            const v = p.value;
            if (!v || HIDDEN_NAMES.has(p.name) || v.type === "function") continue;
            let text: string;
            if (v.type === "object" && v.subtype !== "null" && v.objectId) {
              try {
                const r = await cdp.send("Runtime.callFunctionOn", { objectId: v.objectId, functionDeclaration: STRINGIFY, returnByValue: true });
                text = String(r.result?.value ?? v.description ?? "");
              } catch {
                text = String(v.description ?? "");
              }
            } else if (v.type === "string") text = JSON.stringify(v.value);
            else if (v.type === "undefined") text = "undefined";
            else if (v.subtype === "null") text = "null";
            else text = String(v.value ?? v.unserializableValue ?? v.description ?? "");
            vars.push([p.name, clip(text)]);
            if (vars.length >= 16) return vars;
          }
        }
        return vars;
      };

      const onPaused = async (params: any): Promise<void> => {
        const cf = params.callFrames?.[0];
        try {
          if (!cf) {
            await cdp.send("Debugger.resume");
          } else if (!inUser(cf)) {
            await cdp.send("Debugger.stepOut");
          } else if (steps.length >= MAX_STEPS || Date.now() - started > timeoutMs * STEP_BUDGET) {
            // Over the step cap, or out of time budget on a slow machine: stop recording and let the program finish.
            stepsTruncated = true;
            await cdp.send("Debugger.disable");
            await cdp.send("Debugger.resume").catch(() => undefined);
          } else {
            const out = await cdp.send("Debugger.evaluateOnCallFrame", { callFrameId: cf.callFrameId, expression: "globalThis.__nvOut", returnByValue: true }).catch(() => null);
            const depth = (params.callFrames as any[]).filter(inUser).length;
            steps.push({
              line: cf.location.lineNumber + 1,
              fn: cf.functionName || "<module>",
              depth,
              vars: await scopeVars(cf),
              out: Number(out?.result?.value ?? 0),
            });
            await cdp.send("Debugger.stepInto");
          }
        } catch {
          /* the process ended while we were talking to it */
        }
      };
      cdp.on("Debugger.paused", (params) => {
        lastPause = lastPause.then(() => onPaused(params));
      });
      await cdp.send("Debugger.enable");
      await cdp.send("Debugger.setBlackboxPatterns", { patterns: ["^node:", "^internal/", "nv_preload"] }).catch(() => undefined);
      await cdp.send("Runtime.enable");
      await cdp.send("Runtime.runIfWaitingForDebugger");
      await exited;
      cdp.close();
    }
  } catch (e) {
    stderr += `\n${(e as Error).message}`;
    child.kill();
  }
  clearTimeout(timer);
  const code = await exited;
  // The inspector announces itself on stderr; hide that line from the learner.
  const cleanErr = stderr.split("\n").filter((l) => !/^Debugger (listening|attached)|^For help, see|^Waiting for the debugger/.test(l.trim())).join("\n").trim();
  const sp: Spawned = { stdout, stderr: cleanErr.split(file).join(path.basename(file)), code, timedOut, truncated, ms: Date.now() - started };
  return { ...result(sp, ts ? `${node.label} (TypeScript)` : node.label, timeoutMs), steps, steps_truncated: stepsTruncated };
}
