import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppState } from "../appState.js";
import { AppConfig } from "../appConfig.js";
import { mentorAskApi } from "./mentorAsk.js";

let dir: string;
let app: AppState;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_meth_"));
  app = new AppState(dir);
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const deps = (send: (m: unknown) => Promise<string>) => ({
  withJob: (async (_k: string, _l: string, fn: (job: { send: typeof send }) => Promise<unknown>) => fn({ send })) as never,
  guarded: (async (_i: string, _k: string, fn: () => Promise<unknown>) => fn()) as never,
  cancelMode: () => undefined,
  today: () => "2026-10-29",
});

describe("mentor_methodology_review", () => {
  it("sin IA configurada no falla ni llama a nadie: lo dice", async () => {
    vi.spyOn(AppConfig, "get_ai_config").mockReturnValue({} as never);
    const send = vi.fn(async () => "x");
    const r = await mentorAskApi(app, deps(send)).mentor_methodology_review({ prompt: "revisa" });
    expect(r).toEqual({ aiConfigured: false, text: "" });
    expect(send).not.toHaveBeenCalled();
  });

  it("rechaza un prompt vacío", async () => {
    await expect(mentorAskApi(app, deps(async () => "")).mentor_methodology_review({ prompt: "  " })).rejects.toThrow(/nada que revisar/);
  });
});
