// Pruebas unitarias de gestión manual de sub-asignaturas/grupos en el plan y reasignación de temas.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppState } from "../appState.js";
import { PlanStore } from "../../core/mentor/plan.js";
import { mentorApi } from "./mentor.js";

let dir: string;
let app: AppState;
let planStore: PlanStore;
const PLAN_ID = "2026-10-06_2026-12-20";

const BASE_PLAN = {
  id: PLAN_ID,
  start: "2026-10-06",
  end: "2026-12-20",
  structure: "areas" as const,
  subplans: [
    {
      id: "frontend",
      area: "Frontend",
      areaId: "frontend",
      objective: "UI",
      groups: [
        { id: "core", title: "Conocimientos de frontend", kind: "knowledge" as const, order: 100 },
        { id: "lang-javascript", title: "Lenguaje: JavaScript", kind: "language" as const, order: 10 },
      ],
      topics: [
        { folder: "Programación/5 Frontend/5.1 The browser", title: "5.1 The browser", estMinutes: 60, group: "core", targetWeek: 1 },
        { folder: "Programación/5 Frontend/5.2 CSS", title: "5.2 CSS", estMinutes: 60, group: "core", targetWeek: 1 },
        { folder: "Programación/2.2 JavaScript/2.2.1 Intro", title: "2.2.1 Intro", estMinutes: 45, group: "lang-javascript", targetWeek: 2 },
      ],
      weeks: [],
      requiredGoals: [],
    },
  ],
};

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_plan_groups_"));
  app = new AppState(dir);
  planStore = new PlanStore(dir);
  planStore.save(BASE_PLAN as never);
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("Gestión de sub-asignaturas y reasignación de temas en el plan", () => {
  it("crea una nueva sub-asignatura / grupo en el subplan", () => {
    const api = mentorApi(app, vi.fn());
    const r = api.mentor_plan_group_create({
      planId: PLAN_ID,
      subplanId: "frontend",
      title: "HTML y Semántica",
    });
    expect(r.group).toMatchObject({
      title: "HTML y Semántica",
      id: "html-y-semantica",
      kind: "knowledge",
    });
    const loaded = planStore.load(PLAN_ID)!;
    const sub = loaded.subplans.find((s) => s.id === "frontend")!;
    expect(sub.groups?.some((g) => g.id === "html-y-semantica")).toBe(true);
  });

  it("mueve temas individualmente o en lote a otra sub-asignatura", () => {
    const api = mentorApi(app, vi.fn());
    // Mover 5.2 CSS a un nuevo grupo "CSS"
    const r = api.mentor_plan_topics_move_group({
      planId: PLAN_ID,
      subplanId: "frontend",
      folders: ["Programación/5 Frontend/5.2 CSS"],
      newGroupTitle: "CSS",
    });
    expect(r.changed).toBe(1);
    expect(r.targetGroupId).toBe("css");

    const loaded = planStore.load(PLAN_ID)!;
    const sub = loaded.subplans.find((s) => s.id === "frontend")!;
    expect(sub.groups?.some((g) => g.id === "css" && g.title === "CSS")).toBe(true);
    const cssTopic = sub.topics.find((t) => t.folder === "Programación/5 Frontend/5.2 CSS")!;
    expect(cssTopic.group).toBe("css");
    // El otro tema sigue en core
    expect(sub.topics.find((t) => t.folder === "Programación/5 Frontend/5.1 The browser")!.group).toBe("core");
  });

  it("renombra una sub-asignatura", () => {
    const api = mentorApi(app, vi.fn());
    const r = api.mentor_plan_group_rename({
      planId: PLAN_ID,
      subplanId: "frontend",
      groupId: "core",
      title: "Fundamentos Web",
    });
    expect(r.group.title).toBe("Fundamentos Web");
    const loaded = planStore.load(PLAN_ID)!;
    const sub = loaded.subplans.find((s) => s.id === "frontend")!;
    expect(sub.groups?.find((g) => g.id === "core")?.title).toBe("Fundamentos Web");
  });

  it("elimina una sub-asignatura y reubica sus temas al grupo de respaldo", () => {
    const api = mentorApi(app, vi.fn());
    // Primero crear un grupo "Testing" y mover un tema allí
    api.mentor_plan_topics_move_group({
      planId: PLAN_ID,
      subplanId: "frontend",
      folders: ["Programación/5 Frontend/5.1 The browser"],
      newGroupTitle: "Testing",
    });

    let loaded = planStore.load(PLAN_ID)!;
    let sub = loaded.subplans.find((s) => s.id === "frontend")!;
    expect(sub.topics.find((t) => t.folder === "Programación/5 Frontend/5.1 The browser")!.group).toBe("testing");

    // Ahora eliminar "testing"
    const del = api.mentor_plan_group_delete({
      planId: PLAN_ID,
      subplanId: "frontend",
      groupId: "testing",
      fallbackGroupId: "core",
    });
    expect(del.moved).toBe(1);

    loaded = planStore.load(PLAN_ID)!;
    sub = loaded.subplans.find((s) => s.id === "frontend")!;
    expect(sub.groups?.some((g) => g.id === "testing")).toBe(false);
    expect(sub.topics.find((t) => t.folder === "Programación/5 Frontend/5.1 The browser")!.group).toBe("core");
  });
});
