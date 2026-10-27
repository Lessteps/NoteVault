import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CatalogTopic } from "./goalDraft.js";
import type { Plan } from "./plan.js";
import type { ApplyResult } from "./planChange.js";
import {
  buildReview,
  cleanTitle,
  findDuplicates,
  impactOf,
  pendingReviews,
  PlanReviewStore,
  type PlanReview,
} from "./planReview.js";

const START = "2026-10-06";
const END = "2027-04-05";

const mockPlan = (over: Partial<Plan> = {}): Plan => ({
  id: "test-plan",
  start: START,
  end: END,
  hoursPerWeek: 15,
  structure: "areas",
  areaMode: "phased",
  subplans: [
    {
      id: "sub-fe",
      area: "Frontend",
      areaId: "frontend",
      objective: "Aprender Frontend",
      weeks: [],
      requiredGoals: [],
      groups: [{ id: "bases", title: "Bases", kind: "knowledge", order: 10 }],
      topics: [
        {
          folder: "Programación/5 Frontend/01 HTML",
          title: "1. Fundamentos de HTML",
          targetWeek: 1,
          estMinutes: 60,
        },
      ],
    },
  ],
  createdAt: "2026-10-06T00:00:00Z",
  updatedAt: "2026-10-06T00:00:00Z",
  ...over,
});

describe("planReview: funciones puras", () => {
  it("cleanTitle limpia prefijos numéricos, acentos y mayúsculas", () => {
    expect(cleanTitle("01. Introducción a HTML")).toBe("introduccion a html");
    expect(cleanTitle("2.1 - CSS Avanzado")).toBe("css avanzado");
    expect(cleanTitle("Algoritmos")).toBe("algoritmos");
  });

  it("findDuplicates detecta colisiones de título sin importar numeración ni mayúsculas", () => {
    const existing = [
      { folder: "Programación/5 Frontend/01 HTML", title: "01. Introducción a HTML" },
    ];
    const all: CatalogTopic[] = [
      {
        folder: "Programación/Nuevo/HTML Intro",
        title: "Introducción a HTML",
        subject: "Programación",
        skills: [],
        completenessPct: 0,
        estMinutes: 60,
      },
      {
        folder: "Programación/Nuevo/CSS Intro",
        title: "Introducción a CSS",
        subject: "Programación",
        skills: [],
        completenessPct: 0,
        estMinutes: 60,
      },
    ];

    const dupes = findDuplicates(["Programación/Nuevo/HTML Intro", "Programación/Nuevo/CSS Intro"], existing, all);
    expect(dupes).toHaveLength(1);
    expect(dupes[0]!.addedTopic).toBe("Programación/Nuevo/HTML Intro");
    expect(dupes[0]!.matchedTopic).toBe("Programación/5 Frontend/01 HTML");
  });

  it("impactOf calcula las diferencias semanales y detecta sugerencias de ajuste", () => {
    const before = mockPlan({ hoursPerWeek: 10 });
    const after = mockPlan({ hoursPerWeek: 14 });
    const applyResult: ApplyResult = {
      plan: after,
      delta: { added: 2, removed: 0, moved: 0, deliverables: 0 },
      changed: [],
      warnings: [],
      fixOptions: [{ id: "extend", label: "Extender fecha", op: { op: "extend_to", date: "2027-05-01" } }],
      applied: 1,
      fits: false,
    };

    const impact = impactOf(before, applyResult, ["Programación/5 Frontend/01 HTML"]);
    expect(impact.addedTopics).toBe(1);
    expect(impact.weeklyMinutesBefore).toBe(600);
    expect(impact.weeklyMinutesAfter).toBe(840);
    expect(impact.fits).toBe(false);
    expect(impact.suggestedEnd).toBe("2027-05-01");
  });

  it("buildReview genera un objeto PlanReview bien estructurado", () => {
    const r = buildReview({
      kind: "area",
      subplanId: "sub-1",
      subplanName: "DevOps",
      folder: "Programación/DevOps",
      objective: "Aprender infraestructura",
      added: ["Programación/DevOps/Docker"],
      impact: {
        addedTopics: 1,
        addedMinutes: 60,
        weeklyMinutesBefore: 300,
        weeklyMinutesAfter: 360,
        fits: true,
        endDate: END,
        fixOptions: [],
      },
    });

    expect(r.id).toMatch(/^rev-/);
    expect(r.state).toBe("pending");
    expect(r.source).toBe("manual");
    expect(r.folder).toBe("Programación/DevOps");
    expect(r.objective).toBe("Aprender infraestructura");
  });

  it("pendingReviews descarta revisiones que ya no existen en el plan tras un Deshacer", () => {
    const plan = mockPlan();
    const reviews: PlanReview[] = [
      buildReview({
        id: "r1",
        kind: "area",
        subplanId: "sub-fe",
        subplanName: "Frontend",
        folder: "Programación/Frontend",
        added: [],
        impact: {} as any,
      }),
      buildReview({
        id: "r2",
        kind: "area",
        subplanId: "sub-inexistente",
        subplanName: "Borrado",
        folder: "Programación/Borrado",
        added: [],
        impact: {} as any,
      }),
      {
        ...buildReview({
          id: "r3",
          kind: "area",
          subplanId: "sub-fe",
          subplanName: "Frontend",
          folder: "Programación/Frontend",
          added: [],
          impact: {} as any,
        }),
        state: "kept",
      },
    ];

    const pending = pendingReviews(reviews, plan);
    expect(pending.map((p) => p.id)).toEqual(["r1"]);
  });
});

describe("PlanReviewStore: persistencia en vault", () => {
  let tmpVault: string;

  beforeEach(() => {
    tmpVault = fs.mkdtempSync(path.join(os.tmpdir(), "nv-rev-test-"));
  });

  afterEach(() => {
    if (fs.existsSync(tmpVault)) {
      fs.rmSync(tmpVault, { recursive: true, force: true });
    }
  });

  it("guarda y carga revisiones por planId", () => {
    const store = new PlanReviewStore(tmpVault);
    expect(store.load("plan-1")).toEqual([]);

    const sampleReview = buildReview({
      kind: "area",
      subplanId: "sub-1",
      subplanName: "DevOps",
      folder: "Programación/DevOps",
      added: ["Programación/DevOps/T01"],
      impact: {
        addedTopics: 1,
        addedMinutes: 60,
        weeklyMinutesBefore: 300,
        weeklyMinutesAfter: 360,
        fits: true,
        endDate: END,
        fixOptions: [],
      },
    });

    store.save("plan-1", [sampleReview]);
    const loaded = store.load("plan-1");
    expect(loaded).toHaveLength(1);
    expect(loaded[0]!.id).toBe(sampleReview.id);
    expect(loaded[0]!.subplanName).toBe("DevOps");
  });
});
