// @vitest-environment jsdom
//
// Phase 0b · open every note of the real vault through the app's own components, to
// find the ones that crash the window:
//
//   NV_VAULT="C:/PROGRAMMING" npx vitest run src/lib/vaultOpenProfile.test.ts
//   NV_VAULT="C:/PROGRAMMING" NV_LIMIT=200 npx vitest run src/lib/vaultOpenProfile.test.ts
//
// Real vault, real core, real React: the renderer's bridge (`window.nv.invoke`) is
// wired straight to the registry built on `NV_VAULT`, so what runs here is what runs
// when you click a note in the app — including the view files (`type: practica`,
// `resumen`, `exercise`) that replace the editor with their own surface.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { getRegistry, initRegistry } from "../api/registry.js";
import { useApp } from "../store/app.js";

const vault = process.env.NV_VAULT ?? "";
const limit = Number(process.env.NV_LIMIT ?? 0);
/** read (default) | edit | split: the editor surfaces mount CodeMirror + the indexed view. */
const mode = (process.env.NV_MODE ?? "read") as "read" | "edit" | "split";

if (vault) {
  initRegistry(vault);
  const registry = getRegistry() as unknown as Record<string, (...args: unknown[]) => unknown>;
  (window as unknown as { nv: unknown }).nv = {
    invoke: (method: string, args: unknown[] = []) =>
      new Promise((resolve, reject) => {
        try {
          resolve(registry[method]?.(...(Array.isArray(args) ? args : [args])));
        } catch (e) {
          reject(e);
        }
      }),
    onVaultWatch: () => () => undefined,
    onAiStream: () => () => undefined,
    onWindowState: () => () => undefined,
    onMenu: () => () => undefined,
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
(vault ? describe : describe.skip)("profile · opening notes in the real app", () => {
  it("mounts every note without an uncaught error", async () => {
    const { EditorArea } = await import("../components/notes/EditorArea.js") as unknown as { EditorArea: () => unknown };
    const index = (await (getRegistry().note_index as (...a: unknown[]) => any)()) as Array<{ path: string; title: string }>;
    const paths = (limit ? index.slice(0, limit) : index).map((n) => n.path);
    const failures: string[] = [];
    const byType = new Map<string, number>();
    const started = Date.now();

    for (const rel of paths) {
      let raw = "";
      try {
        raw = (await (getRegistry().read_note as (...a: unknown[]) => any)(rel)).raw as string;
      } catch (e) {
        failures.push(`read · ${rel} · ${(e as Error).message}`);
        continue;
      }
      const type = /^\s*type:\s*(.+)$/m.exec(raw.slice(0, 2000))?.[1]?.trim() ?? "(sin type)";
      byType.set(type, (byType.get(type) ?? 0) + 1);

      const host = document.createElement("div");
      document.body.appendChild(host);
      const root = createRoot(host);
      const onError = (event: ErrorEvent) => failures.push(`window.onerror · ${rel} · ${event.message}`);
      window.addEventListener("error", onError);
      try {
        await act(async () => {
          await useApp.getState().openNote(rel);
        });
        await act(async () => {
          useApp.setState({ mode });
        });
        await act(async () => {
          root.render(createElement(EditorArea as never) as never);
        });
        await act(async () => {
          await new Promise((r) => setTimeout(r, 0));
        });
      } catch (e) {
        const err = e as Error;
        failures.push(`render · ${rel} [${type}] · ${err.name}: ${err.message}`);
      } finally {
        window.removeEventListener("error", onError);
        await act(async () => root.unmount());
        host.remove();
      }
      if (failures.length > 40) break;
    }

    const seconds = Math.round((Date.now() - started) / 1000);
    process.stdout.write(`\nnotas abiertas: ${paths.length} en ${seconds} s · modo ${mode}\n`);
    process.stdout.write(`tipos: ${[...byType.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t}=${n}`).join(" · ")}\n`);
    process.stdout.write(`fallos: ${failures.length}\n${failures.slice(0, 40).map((f) => `  ${f}`).join("\n")}\n`);
    expect(paths.length).toBeGreaterThan(0);
  }, 1_800_000);
});
