import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  convDir: "",
}));

vi.mock("../appConfig.js", () => ({
  AppConfig: {
    get_ai_config: () => ({}),
    get_nutrition_coach_conversations_dir: () => hoisted.convDir,
  },
}));

import { AppState } from "../appState.js";
import { nutritionCoachApi } from "./nutritionCoach.js";

describe("nutritionCoachApi", () => {
  let tmpDir: string;
  let convDir: string;
  let app: AppState;
  let api: ReturnType<typeof nutritionCoachApi>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nv-nutri-coach-test-"));
    convDir = fs.mkdtempSync(path.join(os.tmpdir(), "nv-nutri-convs-test-"));
    hoisted.convDir = convDir;
    app = new AppState(tmpDir);
    api = nutritionCoachApi(app);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.rmSync(convDir, { recursive: true, force: true });
  });

  it("nutri_coach_context retorna el contexto diario y perfil de entrenamiento", () => {
    const ctx = api.nutri_coach_context();
    expect(ctx.date).toBeTruthy();
    expect(ctx.targetCalories).toBeGreaterThan(1500);
    expect(ctx.consumedCalories).toBe(0);
    expect(ctx.goal).toBeDefined();
  });

  it("gestiona el ciclo de vida de conversaciones aisladas del coach nutricional", () => {
    expect(api.nutri_coach_conversations()).toEqual([]);

    // Crear conversación
    const conv = api.nutri_coach_conversation_save(null, [
      { id: "m1", role: "user", content: "¿Cómo llego a 160g de proteína?" },
      { id: "m2", role: "assistant", content: "Podés incorporar pechuga y yogur griego." },
    ], "gemini", "Proteínas del día");

    expect(conv.id).toBeTruthy();
    expect(conv.title).toBe("Proteínas del día");
    expect(api.nutri_coach_conversations()).toHaveLength(1);

    // Obtener
    const retrieved = api.nutri_coach_conversation_get(conv.id);
    expect(retrieved?.id).toBe(conv.id);
    expect(retrieved?.messages).toHaveLength(2);

    // Renombrar
    const renamed = api.nutri_coach_conversation_rename(conv.id, "Plan de proteínas");
    expect(renamed.ok).toBe(true);
    expect(renamed.title).toBe("Plan de proteínas");

    // Eliminar
    const del = api.nutri_coach_conversation_delete(conv.id);
    expect(del.ok).toBe(true);
    expect(api.nutri_coach_conversations()).toEqual([]);
  });

  it("valida entradas en nutri_coach_chat_stream", async () => {
    await expect(api.nutri_coach_chat_stream("", [], "hola")).rejects.toThrow();
    await expect(api.nutri_coach_chat_stream("id1", [], "")).rejects.toThrow();
  });

  it("valida entradas en nutri_estimate_dish", async () => {
    await expect(api.nutri_estimate_dish("")).rejects.toThrow(/obligatoria/);
  });

  it("valida entradas en nutri_scan_label", async () => {
    await expect(api.nutri_scan_label("")).rejects.toThrow(/obligatoria/);
  });
});
