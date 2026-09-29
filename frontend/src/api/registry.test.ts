import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { AppState } from "./appState.js";
import { buildRegistry } from "./registry.js";

// The IPC contract has two halves: `bridge.ts` sends a snake_case method name,
// and `registry.ts` is what actually answers it. A typo in either place only
// shows up at runtime inside Electron, never in the per-module unit tests
// (those call `xxxApi(app)` directly, so they never see the assembled map).
// This file closes that gap: every name the UI can send must exist in the
// registry, and the registry must not answer anything the UI cannot ask for.

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "lib", "bridge.ts");
const IPC_SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "electron", "ipc.ts");

/** Every `call<...>("name"` / `call("name"` literal in bridge.ts.
 *  The type argument may itself nest generics (`call<Array<{ date: string }>>`),
 *  so one level of `<...>` has to be matched separately. */
function bridgeMethodNames(): string[] {
  const src = readFileSync(SRC, "utf-8");
  const names = new Set<string>();
  const re = /\bcall(?:<(?:[^<>]|<[^<>]*>)*>)?\(\s*"([a-z][a-z0-9_]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) names.add(m[1]!);
  return [...names];
}

/** The window and browser methods are answered by the IPC handler itself, not
 *  by a registry entry (they need BrowserWindow, which the registry never sees). */
function ipcHandledNames(): Set<string> {
  const src = readFileSync(IPC_SRC, "utf-8");
  const names = new Set<string>();
  const re = /case\s+"([a-z][a-z0-9_]*)"\s*:/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) names.add(m[1]!);
  return names;
}

/** Registry entries the UI has no wrapper for, kept on purpose. Each one is
 *  exercised by its own module test; a new name must be added here on purpose. */
const INTERNAL_ONLY = new Set([
  "close_window", // app.ts: window teardown path, no UI trigger
  "web_check", // web.ts: dry-run of the restriction check
  "media_url", // media.ts: consumed by the media server URL builder
  "media_shutdown", // media.ts: lifecycle hook
  "_shutdown_media", // exercise.ts: lifecycle hook
]);

let dir = "";
let registry: Record<string, unknown>;
let bridgeNames: string[];
let handledInIpc: Set<string>;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "nv-registry-"));
  const app = new AppState(dir);
  registry = buildRegistry(app);
  bridgeNames = bridgeMethodNames();
  handledInIpc = ipcHandledNames();
});

afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe("contrato bridge <-> registry", () => {
  it("bridge.ts contiene métodos que enviar", () => {
    expect(bridgeNames.length).toBeGreaterThan(80);
  });

  it("todo método que el UI puede enviar lo responde alguien", () => {
    const orphanCalls = bridgeNames.filter((n) => !(n in registry) && !handledInIpc.has(n));
    expect(orphanCalls).toEqual([]);
  });

  it("los métodos del registry son invocables", () => {
    const notFn = bridgeNames.filter(
      (n) => n in registry && typeof registry[n] !== "function" && !handledInIpc.has(n),
    );
    expect(notFn).toEqual([]);
  });

  it("el registry no expone métodos que el UI no puede pedir", () => {
    // Methods the UI cannot call are dead weight at best; a leftover from a
    // renamed wrapper is a bug at worst, because nothing else would catch it.
    const known = new Set([...bridgeNames, ...handledInIpc, ...INTERNAL_ONLY]);
    const orphans = Object.keys(registry).filter((k) => !known.has(k));
    expect(orphans).toEqual([]);
  });

  it("la allowlist INTERNAL_ONLY no crece sin que exista en el registry", () => {
    // A stale entry here would silently exempt a real orphan forever.
    const stale = [...INTERNAL_ONLY].filter((n) => !(n in registry));
    expect(stale).toEqual([]);
  });
});
