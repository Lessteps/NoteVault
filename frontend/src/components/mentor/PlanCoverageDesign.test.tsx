// @vitest-environment jsdom
//
// Mentor — la cobertura mide cada tema contra el sistema de diseño de la vault: la tarjeta del plan y la de cada área enseñan la puntuación de
// diseño, los faltantes concretos de cada tema y el juicio de la IA (bien diseñado / incompleto / pobre y qué crear).

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(window as unknown as { nv: unknown }).nv = { invoke: async () => ({}) };

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { computeCoverage, type CoverageReview } from "../../lib/planCoverage";
import { evaluateTopicDesign } from "../../lib/topicDesign";
import type { MentorPlan } from "../../lib/types";
import { AreaCoverageDetail, CoverageLine, CoveragePanel, type CoverageState } from "./PlanCoverage";

const READING = "## Requires\n## Explanation\n### What it is\n### Mental model\n## Examples\n### Example 1\n### Example 2\n### Example 3\n## Common mistakes\n### Mistake 1\n### Mistake 2\n### Mistake 3\n### Mistake 4\n## Connections\n## Cards\n### 1 · a\n### 2 · a\n### 3 · a\n### 4 · a\n### 5 · a\n### 6 · a\n";
const A = "Programación/4 Backend/4.1 Listo";
const B = "Programación/4 Backend/4.2 SinCanvas";
const C = "Programación/4 Backend/4.3 SinTeoria";
const man = { topicType: "mixed", skills: ["implement", "pg_true_false"] };
const dsn = (folder: string, files: string[], extra: object = {}) => evaluateTopicDesign({ folder, title: folder.split("/").pop()!, subject: "programming", exists: true, files, exercises: [], ...extra });
const designs = {
  [A]: dsn(A, ["a.md", "a — mapa.canvas", "a.practica.md"], { theoryText: READING, manifest: man, exercises: [1, 2, 3].flatMap((difficulty) => ["implement", "pg_true_false"].map((skill) => ({ skill, difficulty }))) }),
  [B]: dsn(B, ["b.md", "b.practica.md"], { theoryText: READING, manifest: man }),
  [C]: dsn(C, [], {}),
};
const plan = { id: "p", updatedAt: "2026-10-01T00:00:00Z", subplans: [{ id: "s1", area: "Backend", areaId: "backend", objective: "", topics: [A, B, C].map((folder) => ({ folder, title: folder.split("/").pop()!, group: "core" })), groups: [{ id: "core", title: "Conocimientos", kind: "knowledge", order: 1 }] }] };
const coverage = computeCoverage(plan as never, Object.entries(designs).map(([folder, design]) => ({ folder, title: folder.split("/").pop()!, theoryNotes: design.items.find((i) => i.id === "theory")?.ok ? 1 : 0, exerciseCount: folder === A ? 3 : 0, completenessPct: 0, design })), { ppReady: true });
const review: CoverageReview = {
  at: "2026-10-09T10:00:00.000Z", source: "ai", summary: "Backend flojo.", designSummary: "Casi ningún tema tiene práctica completa.", discarded: 0,
  areas: [{ key: "backend", area: "Backend", assessment: "Falta diseño.", missing: [], misplaced: [], design: { summary: "Faltan canvas y práctica.", topics: [
    { folder: B, title: "4.2 SinCanvas", verdict: "incomplete", create: ["canvas", "practice_basic"], note: "Falta el mapa del tema." },
    { folder: C, title: "4.3 SinTeoria", verdict: "poor", create: ["theory", "manifest"], note: "No existe nada." },
    { folder: A, title: "4.1 Listo", verdict: "good", create: [], note: "" },
  ] } }],
};

let host: HTMLDivElement;
let root: Root;
const flush = () => act(async () => { await Promise.resolve(); });
const mountEl = async (el: React.ReactNode) => { await act(async () => { root.render(el); }); await flush(); await flush(); };
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

describe("diseño de temas en la cobertura", () => {
  it("la cobertura calcula el diseño por grupo y por área: media, completos y los temas incompletos con sus faltantes", () => {
    const a = coverage.areas[0]!;
    expect(a.design).toMatchObject({ topics: 3, complete: 1, incomplete: 2 });
    expect(a.groups[0]!.designTopics!.map((t) => t.title)).toEqual(["4.3 SinTeoria", "4.2 SinCanvas"]); // los de menor puntuación primero
    expect(coverage.totals.design).toMatchObject({ topics: 3, complete: 1 });
  });

  it("la línea de cobertura y la tarjeta del área muestran la puntuación y los faltantes concretos", async () => {
    const area = coverage.areas[0]!;
    await mountEl(
      <>
        <CoverageLine area={area} />
        <AreaCoverageDetail area={area} review={review.areas[0]} reviewAt={review.at} groupTitle={() => "Conocimientos"} areaName={(k) => k} />
      </>,
    );
    expect(host.querySelector("[data-testid=area-design-line]")!.textContent).toMatch(/diseño \d+ % \(1\/3 completos\)/);
    const list = host.querySelector("[data-testid=area-design-list]")!;
    const topics = [...list.querySelectorAll("[data-testid=design-topic]")];
    expect(topics).toHaveLength(2);
    expect(topics[0]!.textContent).toContain("4.3 SinTeoria");
    expect(topics[0]!.textContent).toContain("Falta la nota de teoría");
    expect(topics[1]!.textContent).toContain("4.2 SinCanvas");
    expect(topics[1]!.textContent).toContain("Falta el canvas del tema");
    expect(topics[1]!.textContent).toContain("Sin práctica en la skill implement");
    expect(host.querySelector("[data-testid=area-coverage]")!.textContent).toContain("sistema de diseño de la vault");
  });

  it("el juicio de la IA: veredicto de diseño por tema (con texto y glifo) y qué hay que crear", async () => {
    await mountEl(<AreaCoverageDetail area={coverage.areas[0]!} review={review.areas[0]} reviewAt={review.at} groupTitle={() => ""} areaName={(k) => k} />);
    const ai = host.querySelector("[data-testid=area-ai-design]")!;
    expect(ai.textContent).toContain("Faltan canvas y práctica.");
    const rows = [...ai.querySelectorAll("[data-testid=ai-design-topic]")].map((r) => r.textContent!);
    expect(rows[0]).toContain("Incompleto");
    expect(rows[0]).toContain("crear: Mapa (canvas) del tema · Práctica: al menos un ejercicio por skill");
    expect(rows[1]).toContain("Pobre");
    expect(rows[1]).toContain("crear: Nota de teoría · Manifiesto de práctica con skills");
    expect(rows[2]).toContain("Bien diseñado");
  });

  it("la tarjeta del plan: total de diseño y el resumen de la revisión; una revisión antigua sin diseño se pinta igual", async () => {
    const cov: CoverageState = { coverage, review, aiConfigured: true, loading: false, error: "", reload: vi.fn(), setReview: vi.fn() };
    await mountEl(<CoveragePanel plan={{ id: "p", updatedAt: "2026-10-01T00:00:00Z", subplans: [] } as unknown as MentorPlan} cov={cov} onPlan={vi.fn()} announce={vi.fn()} />);
    const t = host.querySelector("[data-testid=coverage-design-total]")!.textContent!;
    expect(t).toMatch(/Diseño de temas/);
    expect(t).toContain("1/3 completos");
    expect(t).toMatch(/\d+ faltantes obligatorios/);
    expect(host.querySelector("[data-testid=review-design-summary]")!.textContent).toContain("Casi ningún tema tiene práctica completa.");
    act(() => root.unmount());
    root = createRoot(host);
    const old: CoverageReview = { at: review.at, source: "ai", summary: "Antigua", discarded: 0, areas: [{ key: "backend", area: "Backend", assessment: "", missing: [], misplaced: [] }] };
    const bare = computeCoverage(plan as never, [], { ppReady: true });
    await mountEl(<CoveragePanel plan={{ id: "p", updatedAt: "2026-10-01T00:00:00Z", subplans: [] } as unknown as MentorPlan} cov={{ ...cov, coverage: bare, review: old }} onPlan={vi.fn()} announce={vi.fn()} />);
    expect(host.querySelector("[data-testid=coverage-design-total]")).toBeNull();
    expect(host.querySelector("[data-testid=review-design-summary]")).toBeNull();
    expect(host.textContent).toContain("Antigua");
  });
});
