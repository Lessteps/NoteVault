import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import * as fs from "node:fs";
import { describe, expect, it } from "vitest";
import { AIConfig, AIError, CLAUDE_CODE, PROVIDER_BY_KEY, listModels, sendChat, streamChat } from "./aiClient.js";
import {
  buildClaudeArgs,
  parseStreamLine,
  resolveClaudeExecutable,
  runClaudeCode,
  serializeMessages,
  translateError,
  type SpawnFn,
} from "./claudeCode.js";

const delta = (t: string) =>
  JSON.stringify({ type: "stream_event", event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: t } } });
const result = (text: string, isError = false) => JSON.stringify({ type: "result", subtype: isError ? "error" : "success", is_error: isError, result: text });

interface Fake { spawn: SpawnFn; calls: { cmd: string; args: string[]; opts: Record<string, unknown>; stdin: string; systemFile?: string }[]; }

/** A spawn that plays back `lines` then closes with `code`; `hang` never closes. */
function fakeSpawn(opts: { lines?: string[]; code?: number; stderr?: string; error?: NodeJS.ErrnoException; hang?: boolean }): Fake {
  const calls: Fake["calls"] = [];
  const spawn: SpawnFn = (cmd, args, o) => {
    const child = new EventEmitter() as EventEmitter & Record<string, unknown>;
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const stdin = new PassThrough();
    let input = "";
    stdin.on("data", (d) => (input += d.toString()));
    const call: Fake["calls"][number] = { cmd, args, opts: o, stdin: "" };
    const i = args.indexOf("--system-prompt-file");
    if (i >= 0) call.systemFile = fs.readFileSync(args[i + 1]!, "utf-8");
    calls.push(call);
    child.stdout = stdout;
    child.stderr = stderr;
    child.stdin = stdin;
    child.kill = () => { setImmediate(() => child.emit("close", null)); return true; };
    stdin.on("end", () => {
      call.stdin = input;
      if (opts.error) return setImmediate(() => child.emit("error", opts.error));
      if (opts.hang) return;
      setImmediate(() => {
        for (const l of opts.lines ?? []) stdout.write(l + "\n");
        if (opts.stderr) stderr.write(opts.stderr);
        setImmediate(() => child.emit("close", opts.code ?? 0));
      });
    });
    return child as never;
  };
  return { spawn, calls };
}

const cfg = { model: "sonnet", claude_path: "C:\\x\\claude.exe", claude_timeout_s: 180 };
const deps = (f: Fake) => ({ spawn: f.spawn, exists: () => true, env: { ANTHROPIC_API_KEY: "sk-x", PATH: "" }, platform: "win32" as const });
const msgs = [{ role: "system", content: "SYS" }, { role: "user", content: "hola" }];

describe("claude code: pure helpers", () => {
  it("is a connected provider, not a bridge, with no key", () => {
    const p = PROVIDER_BY_KEY[CLAUDE_CODE]!;
    expect(p.bridge).toBe(false);
    expect(p.needs_key).toBe(false);
    expect(p.default_models).toEqual(["sonnet", "opus", "haiku", "default"]);
    const c = new AIConfig({ provider: CLAUDE_CODE });
    expect(c.is_bridge).toBe(false);
    expect(AIConfig.fromDict(new AIConfig({ provider: CLAUDE_CODE, claude_path: "C:\\c.exe" }).toDict()).claude_path).toBe("C:\\c.exe");
  });

  it("serializes a single turn raw and a conversation as a transcript", () => {
    expect(serializeMessages(msgs)).toEqual({ system: "SYS", prompt: "hola" });
    const s = serializeMessages([...msgs, { role: "assistant", content: "A" }, { role: "user", content: "otra" }]);
    expect(s.prompt).toContain("[Usuario]\nhola\n\n[Asistente]\nA\n\n[Usuario]\notra");
  });

  it("builds a chat-only, hook-free command", () => {
    const a = buildClaudeArgs("opus", "/tmp/s.txt");
    expect(a).toEqual(expect.arrayContaining(["-p", "--verbose", "--no-session-persistence", "--strict-mcp-config", "--disable-slash-commands"]));
    expect(a[a.indexOf("--tools") + 1]).toBe("");
    expect(a[a.indexOf("--setting-sources") + 1]).toBe("");
    expect(a[a.indexOf("--model") + 1]).toBe("opus");
    expect(a).not.toContain("--bare");
    expect(buildClaudeArgs("default", null)).not.toContain("--model");
    expect(buildClaudeArgs("sonnet", null)).not.toContain("--system-prompt-file");
  });

  it("parses stream-json lines", () => {
    expect(parseStreamLine(delta("ok"))).toEqual({ text: "ok" });
    expect(parseStreamLine(result("fin"))?.result).toEqual({ text: "fin", isError: false });
    expect(parseStreamLine("not json")).toBeNull();
    expect(parseStreamLine(JSON.stringify({ type: "system" }))).toBeNull();
  });

  it("translates errors", () => {
    expect(translateError("Not logged in · Please run /login")).toContain("/login");
    expect(translateError("Claude usage limit reached")).toContain("límite de uso");
  });
});

describe("claude code: executable resolution", () => {
  const exe = "C:\\Users\\u\\AppData\\Roaming\\npm\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe";
  it.skipIf(process.platform !== "win32")("maps the npm shim in %APPDATA%\\npm to the real exe", () => {
    const files = new Set([
      "C:\\Users\\u\\AppData\\Roaming\\npm\\claude.cmd",
      exe,
    ].map((p) => p.toLowerCase()));
    const r = resolveClaudeExecutable("", {
      platform: "win32",
      env: { PATH: "C:\\bin", APPDATA: "C:\\Users\\u\\AppData\\Roaming" },
      exists: (p) => files.has(p.toLowerCase()),
    });
    expect(r.toLowerCase()).toBe(exe.toLowerCase());
  });
  it("prefers the configured path and errors clearly when missing", () => {
    expect(resolveClaudeExecutable("D:\\c\\claude.exe", { platform: "win32", env: {}, exists: (p) => p === "D:\\c\\claude.exe" })).toBe("D:\\c\\claude.exe");
    expect(() => resolveClaudeExecutable("D:\\nope.exe", { platform: "win32", env: {}, exists: () => false })).toThrow(/Ruta de Claude Code/);
    expect(() => resolveClaudeExecutable("", { platform: "win32", env: {}, exists: () => false })).toThrow(/No se encontró Claude Code/);
  });
});

describe("claude code: running", () => {
  it("passes the prompt through stdin, system through a file, and streams deltas", async () => {
    const f = fakeSpawn({ lines: [delta("o"), delta("k"), result("ok")] });
    const got: string[] = [];
    const out = await runClaudeCode(cfg, msgs, { onDelta: (t) => got.push(t) }, deps(f));
    expect(out).toBe("ok");
    expect(got).toEqual(["o", "k"]);
    const c = f.calls[0]!;
    expect(c.cmd).toBe(cfg.claude_path);
    expect(c.stdin).toBe("hola");
    expect(c.systemFile).toBe("SYS");
    expect(c.args.join(" ")).not.toContain("hola");
    expect(c.opts.shell).toBeUndefined();
    expect((c.opts.env as Record<string, string>).ANTHROPIC_API_KEY).toBeUndefined();
    expect(String(c.opts.cwd)).toContain("notevault-claude");
  });

  it("falls back to the result line when there are no deltas", async () => {
    const f = fakeSpawn({ lines: [result("hola")] });
    expect(await runClaudeCode(cfg, msgs, {}, deps(f))).toBe("hola");
  });

  it("maps ENOENT, auth errors and non-zero exits to AIError", async () => {
    const enoent = Object.assign(new Error("spawn"), { code: "ENOENT" });
    await expect(runClaudeCode(cfg, msgs, {}, deps(fakeSpawn({ error: enoent })))).rejects.toThrow(/No se encontró Claude Code/);
    await expect(runClaudeCode(cfg, msgs, {}, deps(fakeSpawn({ lines: [result("Not logged in · Please run /login", true)], code: 1 })))).rejects.toThrow(/\/login/);
    await expect(runClaudeCode(cfg, msgs, {}, deps(fakeSpawn({ stderr: "boom", code: 2 })))).rejects.toThrow(/boom/);
    await expect(runClaudeCode(cfg, msgs, {}, deps(fakeSpawn({ stderr: "boom", code: 2 })))).rejects.toBeInstanceOf(AIError);
  });

  it("times out and cancels", async () => {
    await expect(runClaudeCode({ ...cfg, claude_timeout_s: 0.001 }, msgs, {}, deps(fakeSpawn({ hang: true })))).rejects.toThrow(/tardó más/);
    const ac = new AbortController();
    const f = fakeSpawn({ hang: true });
    const p = runClaudeCode(cfg, msgs, { signal: ac.signal }, deps(f));
    setTimeout(() => ac.abort(), 20);
    expect(await p).toBe("");
  });

  it("is wired into sendChat/streamChat/listModels without bridge behaviour", async () => {
    const c = new AIConfig({ provider: CLAUDE_CODE, claude_path: "Z:\\nope\\claude.exe" });
    await expect(sendChat(c, msgs)).rejects.toThrow(/Claude Code/);
    await expect(streamChat(c, msgs)).rejects.toThrow(/Claude Code/);
    expect(await listModels(c)).toEqual(["sonnet", "opus", "haiku", "default"]);
  });
});
