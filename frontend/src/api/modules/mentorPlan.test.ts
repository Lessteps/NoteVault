import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({ store: {} as Record<string, unknown> }));

vi.mock("../appConfig.js", () => ({
  AppConfig: {
    get_ai_config: () => ({ ...hoisted.store }),
    set_ai_config: (d: Record<string, unknown>) => Object.assign(hoisted.store, d),
  },
}));

import { ApiError } from "../../core/errors.js";
import { StudySRSManager } from "../../core/studySrsManager.js";
import * as store from "../../core/store.js";
import { AppState } from "../appState.js";
import { vaultScan } from "../vaultScan.js";
import { mentorApi } from "./mentor.js";

let dir: string;
let app: AppState;

beforeEach(() => {
  for (const k of Object.keys(hoisted.store)) delete hoisted.store[k];
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_mentor_plan_"));
  app = new AppState(dir);
  const srs = new StudySRSManager(dir);
  const item = srs.registerItem("c1", "concept", "mathematics", "limits");
  store.writeJson(path.join(srs.dir, `${item.id}.json`), { ...item, next_review: "2020-01-01" });
  app.mgrs().tasks.create("Entrega", { due: new Date(), subject: "Historia", priority: 3 });
  vaultScan(app); // índice caliente: si no, la API responde `loading`
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("mentor plan API", () => {
  it("sin IA configurada propone el plan automático y no escribe nada", async () => {
    const api = mentorApi(app, vi.fn());
    const res: any = await api.mentor_plan_propose({ availableMinutes: 60 });
    expect(res).toMatchObject({ loading: false, source: "fallback" });
    expect(res.error).toMatch(/no está configurada/);
    expect(res.plan.blocks.length).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(dir, ".notevault", "mentor"))).toBe(false);
  });

  it("con IA, respeta excludeSubjects y solo devuelve candidatos", async () => {
    Object.assign(hoisted.store, { provider: "deepseek", api_key: "sk-test", model: "m" });
    const send = vi.fn(async () => JSON.stringify({ summary: "ok", blocks: [{ candidateId: "task:x", minutes: 30, reason: "inventado" }, { candidateId: "srs:mathematics", minutes: 20, reason: "repasos" }] }));
    const api = mentorApi(app, send);
    const res: any = await api.mentor_plan_propose({ availableMinutes: 60, excludeSubjects: ["historia"], userNote: "sin historia" });
    expect(send).toHaveBeenCalledTimes(1);
    expect(res.source).toBe("ai");
    expect(res.plan.blocks.map((b: any) => b.candidateId)).toEqual(["srs:mathematics"]);
    expect(res.candidates.every((c: any) => c.subject !== "historia")).toBe(true);
  });

  it("aceptar guarda la sesión con acceptedAt; re-aceptar conserva el estado; marcar funciona", async () => {
    const api = mentorApi(app, vi.fn());
    const plan: any = ((await api.mentor_plan_propose({ availableMinutes: 60 })) as any).plan;
    const rec = api.mentor_plan_accept({ date: "2026-10-05", availableMinutes: 60, objective: "repasar", blocks: plan.blocks });
    expect(rec.acceptedAt).toBeTruthy();
    expect(rec.blocks.every((b) => b.status === "planned")).toBe(true);
    expect(rec.blocks[0]!.reason).toBeTruthy();
    const id = rec.blocks[0]!.candidateId;
    expect(api.mentor_block_status("2026-10-05", id, "done").blocks[0]!.status).toBe("done");
    const again = api.mentor_plan_accept({ date: "2026-10-05", availableMinutes: 90, blocks: plan.blocks });
    expect(again.blocks.find((b) => b.candidateId === id)!.status).toBe("done");
    expect(again.createdAt).toBe(rec.createdAt);
    expect(() => api.mentor_plan_accept({ date: "2026-10-05", blocks: [] })).toThrow(ApiError);
  });

  it("mentor_overview devuelve señales en texto y adherencia", () => {
    const res: any = mentorApi(app).mentor_overview();
    expect(res.loading).toBe(false);
    expect(res.sections.length).toBeGreaterThan(0);
    expect(res.adherence.sessions).toBe(0);
    expect(res.aiConfigured).toBe(false);
  });
});
