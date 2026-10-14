import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  aiStore: {} as Record<string, unknown>,
  convDir: "",
}));

vi.mock("../appConfig.js", () => ({
  AppConfig: {
    get_ai_config: () => ({ ...hoisted.aiStore }),
    set_ai_config: (d: Record<string, unknown>) => Object.assign(hoisted.aiStore, d),
    get_finance_coach_conversations_dir: () => hoisted.convDir,
  },
}));

import { AppState } from "../appState.js";
import { financeCoachApi } from "./financeCoach.js";

let dir: string;
let convDir: string;
let api: ReturnType<typeof financeCoachApi>;

beforeEach(() => {
  for (const k of Object.keys(hoisted.aiStore)) delete hoisted.aiStore[k];
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_fin_vault_"));
  convDir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_fin_convs_"));
  hoisted.convDir = convDir;

  const appState = new AppState(dir);
  api = financeCoachApi(appState);
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(convDir, { recursive: true, force: true });
});

describe("financeCoachApi", () => {
  it("obtiene el contexto financiero del mes actual", () => {
    const ctx = api.fin_coach_context();
    expect(ctx.currency).toBeDefined();
    expect(ctx.monthLabel).toBeDefined();
    expect(ctx.monthTotals).toBeDefined();
    expect(Array.isArray(ctx.categories)).toBe(true);
    expect(Array.isArray(ctx.goals)).toBe(true);
    expect(Array.isArray(ctx.recurrents)).toBe(true);
  });

  it("gestiona el ciclo de vida de conversaciones del coach de forma aislada", () => {
    expect(api.fin_coach_conversations()).toEqual([]);

    const saved = api.fin_coach_conversation_save(null, [
      { role: "user", content: "¿Cómo puedo reducir gastos en delivery?" },
      { role: "assistant", content: "Planifica tus comidas y fija un tope semanal de $20.000." },
    ], "gemini-3.5-flash-lite", "Ahorro en delivery");

    expect(saved.id).toBeDefined();
    expect(saved.title).toBe("Ahorro en delivery");
    expect(saved.messages.length).toBe(2);

    const list = api.fin_coach_conversations();
    expect(list.length).toBe(1);
    expect(list[0]?.id).toBe(saved.id);

    const loaded = api.fin_coach_conversation_get(saved.id);
    expect(loaded?.title).toBe("Ahorro en delivery");

    const renamed = api.fin_coach_conversation_rename(saved.id, "Plan de ahorro en comidas");
    expect(renamed.title).toBe("Plan de ahorro en comidas");

    const del = api.fin_coach_conversation_delete(saved.id);
    expect(del.ok).toBe(true);
    expect(api.fin_coach_conversations().length).toBe(0);
  });
});
