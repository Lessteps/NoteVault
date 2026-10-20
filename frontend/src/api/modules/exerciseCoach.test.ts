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
    get_exercise_coach_conversations_dir: () => hoisted.convDir,
  },
}));

import { AppState } from "../appState.js";
import { exerciseCoachApi } from "./exerciseCoach.js";

let dir: string;
let convDir: string;
let api: ReturnType<typeof exerciseCoachApi>;

beforeEach(() => {
  for (const k of Object.keys(hoisted.aiStore)) delete hoisted.aiStore[k];
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_coach_vault_"));
  convDir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_coach_convs_"));
  hoisted.convDir = convDir;

  const appState = new AppState(dir);
  api = exerciseCoachApi(appState);
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(convDir, { recursive: true, force: true });
});

describe("exerciseCoachApi", () => {
  it("obtiene el contexto del coach con perfil por defecto", () => {
    const ctx = api.ex_coach_context();
    expect(ctx.profile.goal).toBe("salud");
    expect(ctx.exercisesCount).toBe(0);
    expect(ctx.currentWeight).toBeNull();
  });

  it("gestiona el ciclo de vida de conversaciones del coach de forma aislada", () => {
    // Inicialmente vacío
    expect(api.ex_coach_conversations()).toEqual([]);

    // Guardar una conversación
    const saved = api.ex_coach_conversation_save(null, [
      { role: "user", content: "¿Cómo aumento masa muscular en piernas?" },
      { role: "assistant", content: "Prioriza sentadillas y sobrecarga progresiva." },
    ], "deepseek-flash", "Rutina de piernas");

    expect(saved.id).toBeDefined();
    expect(saved.title).toBe("Rutina de piernas");
    expect(saved.messages.length).toBe(2);

    // Listar conversaciones
    const list = api.ex_coach_conversations();
    expect(list.length).toBe(1);
    expect(list[0]?.id).toBe(saved.id);

    // Leer conversación
    const loaded = api.ex_coach_conversation_get(saved.id);
    expect(loaded?.title).toBe("Rutina de piernas");

    // Renombrar conversación
    const renamed = api.ex_coach_conversation_rename(saved.id, "Hipertrofia de piernas");
    expect(renamed.title).toBe("Hipertrofia de piernas");

    // Eliminar conversación
    const del = api.ex_coach_conversation_delete(saved.id);
    expect(del.ok).toBe(true);
    expect(api.ex_coach_conversations().length).toBe(0);
  });
});
