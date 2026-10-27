import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AppState } from "../appState.js";
import { PlanStore } from "../../core/mentor/plan.js";
import type { CatalogTopic } from "../../core/mentor/goalDraft.js";
import { mentorPlanFoldersApi } from "./mentorPlanFolders.js";

let dir: string;
let app: AppState;
let planStore: PlanStore;
const PLAN_ID = "2026-10-06_2026-12-20";

const BASE_PLAN = {
  id: PLAN_ID,
  start: "2026-10-06",
  end: "2026-12-20",
  hoursPerWeek: 15,
  structure: "areas" as const,
  areaMode: "phased" as const,
  subplans: [
    {
      id: "frontend",
      area: "Frontend",
      areaId: "frontend",
      objective: "UI",
      groups: [
        { id: "core", title: "Conocimientos de frontend", kind: "knowledge" as const, order: 100 },
      ],
      topics: [
        { folder: "Programación/5 Frontend/5.1 The browser", title: "5.1 The browser", estMinutes: 60, group: "core", targetWeek: 1 },
      ],
      weeks: [],
      requiredGoals: [],
    },
  ],
};

const cat = (folder: string, over: Partial<CatalogTopic> = {}): CatalogTopic => ({
  folder,
  title: folder.split("/").pop()!,
  subject: "Programación",
  skills: [],
  completenessPct: 0,
  estMinutes: 60,
  ...over,
});

describe("mentorPlanFoldersApi: API de gestión de carpetas, adición y revisión", () => {
  let mockTopics: CatalogTopic[];

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_plan_folders_"));
    app = new AppState(dir);
    planStore = new PlanStore(dir);
    planStore.save(BASE_PLAN as never);

    mockTopics = [
      cat("Programación/5 Frontend/5.1 The browser"), // ya en el plan
      cat("Programación/DevOps/Docker/01 Intro"),
      cat("Programación/DevOps/Docker/02 Compose"),
      cat("Programación/DevOps/Kubernetes/01 Pods"),
      cat("Programación/5 Frontend/HTML/01 Semantica"),
    ];
  });

  afterEach(() => {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("gestiona roles de carpeta (get, set, clear, autoAdd)", () => {
    const api = mentorPlanFoldersApi(app, { allTopics: () => mockTopics, today: () => "2026-10-06" });

    let roles = api.mentor_folder_roles_get();
    expect(roles.roles).toEqual({});
    expect(roles.autoAdd).toBe(false);

    roles = api.mentor_folder_role_set({
      folder: "Programación/DevOps",
      role: "area",
      objective: "Manejar infraestructura",
    });
    expect(roles.roles["Programación/DevOps"]).toMatchObject({
      role: "area",
      objective: "Manejar infraestructura",
    });

    roles = api.mentor_folder_auto_add_set({ enabled: true });
    expect(roles.autoAdd).toBe(true);

    roles = api.mentor_folder_role_clear({ folder: "Programación/DevOps" });
    expect(roles.roles["Programación/DevOps"]).toBeUndefined();
  });

  it("devuelve carpetas candidatas con temas pendientes excluyendo los ya planificados", () => {
    const api = mentorPlanFoldersApi(app, { allTopics: () => mockTopics, today: () => "2026-10-06" });
    api.mentor_folder_role_set({
      folder: "Programación/DevOps",
      role: "area",
      objective: "Infra",
    });

    const { candidates } = api.mentor_plan_folder_candidates({ planId: PLAN_ID });
    expect(candidates.some((c) => c.folder === "Programación/DevOps" && c.topicCount === 3)).toBe(true);
    expect(candidates.some((c) => c.folder === "Programación/5 Frontend/HTML" && c.topicCount === 1)).toBe(true);
    // El tema 5.1 que ya está en el plan no genera candidato
    expect(candidates.find((c) => c.folder === "Programación/5 Frontend")?.topicCount ?? 0).toBeLessThan(3);
  });

  it("previsualiza impacto de añadir área sin modificar el plan", () => {
    const api = mentorPlanFoldersApi(app, { allTopics: () => mockTopics, today: () => "2026-10-06" });
    const { preview } = api.mentor_plan_folder_preview({
      planId: PLAN_ID,
      folder: "Programación/DevOps",
      mode: "area",
      name: "DevOps",
    });

    expect(preview.impact.addedTopics).toBe(3);
    expect(preview.impact.addedMinutes).toBe(180);
    // El plan guardado en disco no cambió
    const loaded = planStore.load(PLAN_ID)!;
    expect(loaded.subplans).toHaveLength(1);
  });

  it("añade área al plan, registra historial y crea revisión pendiente", () => {
    const api = mentorPlanFoldersApi(app, { allTopics: () => mockTopics, today: () => "2026-10-06" });
    const r = api.mentor_plan_folder_add({
      planId: PLAN_ID,
      folder: "Programación/DevOps",
      mode: "area",
      name: "DevOps",
      objective: "Aprender DevOps",
    });

    expect(r.plan.subplans).toHaveLength(2);
    expect(r.review).toMatchObject({
      kind: "area",
      folder: "Programación/DevOps",
      state: "pending",
      subplanName: "DevOps",
    });

    // Lista de revisiones pendientes
    const list = api.mentor_plan_review_list({ planId: PLAN_ID });
    expect(list.reviews).toHaveLength(1);
    expect(list.reviews[0]!.id).toBe(r.review.id);
  });

  it("resuelve revisión: 'keep' la marca resuelta y 'remove' quita el área del plan sin tocar archivos", () => {
    const api = mentorPlanFoldersApi(app, { allTopics: () => mockTopics, today: () => "2026-10-06" });
    const added = api.mentor_plan_folder_add({
      planId: PLAN_ID,
      folder: "Programación/DevOps",
      mode: "area",
      name: "DevOps",
    });

    const revId = added.review.id;
    // Quitar del plan
    const removedRes = api.mentor_plan_review_resolve({
      planId: PLAN_ID,
      reviewId: revId,
      action: "remove",
    });

    expect(removedRes.resolved).toBe(true);
    expect(removedRes.plan?.subplans).toHaveLength(1);
    expect(removedRes.plan?.subplans.some((s) => s.area === "DevOps")).toBe(false);

    // No quedan revisiones pendientes
    const list = api.mentor_plan_review_list({ planId: PLAN_ID });
    expect(list.reviews).toHaveLength(0);
  });
});
