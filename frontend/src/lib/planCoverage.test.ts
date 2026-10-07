import { describe, expect, it } from "vitest";
import { computeCoverage, parseCoverageReply, sanitizeCoverageReview, type CoverageTopicIn } from "./planCoverage";

const vault: CoverageTopicIn[] = [
  { folder: "Programación/4 Backend/4.1 HTTP", title: "4.1 HTTP", theoryNotes: 2, exerciseCount: 5, completenessPct: 100 },
  { folder: "Programación/4 Backend/4.2 REST", title: "4.2 REST", theoryNotes: 1, exerciseCount: 0, completenessPct: 0 },
  { folder: "Programación/4 Backend/4.3 Auth", title: "4.3 Auth", theoryNotes: 0, exerciseCount: 2, planExercises: 6, completenessPct: 20 },
  { folder: "Programación/4 Backend/4.4 Message queues", title: "4.4 Message queues", theoryNotes: 1, exerciseCount: 1, completenessPct: 0 },
  { folder: "Programación/4 Backend/4.5 Done extra", title: "4.5 Done extra", theoryNotes: 1, exerciseCount: 1, completenessPct: 100 },
];
const plan = {
  subplans: [
    {
      id: "s1", areaId: "backend", area: "Backend",
      groups: [{ id: "core", title: "Conocimientos de backend", kind: "knowledge" as const, order: 100 }],
      topics: [
        { folder: vault[0]!.folder, title: "4.1 HTTP", group: "core" },
        { folder: vault[1]!.folder, title: "4.2 REST", group: "core" },
        { folder: vault[2]!.folder, title: "4.3 Auth", group: "core" },
        { folder: "Programación/4 Backend/4.9 Fantasma", title: "4.9 Fantasma", group: "core" },
      ],
    },
  ],
};

describe("computeCoverage", () => {
  it("cuenta teoría y práctica, faltantes, temas sin encontrar y temas de la rama fuera del plan", () => {
    const c = computeCoverage(plan, vault, { ppReady: true });
    const a = c.areas[0]!;
    expect(a).toMatchObject({ total: 4, theory: 2, practice: 2, notFound: 1, key: "backend" });
    const g = a.groups[0]!;
    expect(g.noPractice.map((t) => t.title)).toEqual(["4.2 REST"]);
    expect(g.noTheory.map((t) => t.title)).toEqual(["4.3 Auth"]);
    expect(g.shortPractice.map((t) => t.title)).toEqual(["4.3 Auth"]);
    expect(g.notFound.map((t) => t.title)).toEqual(["4.9 Fantasma"]);
    expect(a.branches).toEqual(["4 Backend"]);
    expect(a.outOfPlan.map((t) => [t.title, t.done])).toEqual([["4.4 Message queues", false], ["4.5 Done extra", true]]);
    expect(c.totals).toEqual({ topics: 4, theory: 2, practice: 2, outOfPlan: 1 });
    expect(c.ppReady).toBe(true);
  });
});

describe("parseCoverageReply", () => {
  const ctx = {
    areas: [{ key: "backend", area: "Backend", groups: plan.subplans[0]!.groups }, { key: "automation", area: "Automation" }],
    planTopics: plan.subplans[0]!.topics.map((t) => ({ ...t, key: "backend" })),
    vaultTitles: vault.map((v) => v.title),
  };
  const reply = (o: unknown) => "```json\n" + JSON.stringify(o) + "\n```";

  it("valida: descarta lo que ya existe, duplicados, áreas desconocidas y sobrantes inventados; normaliza área y grupo", () => {
    const r = parseCoverageReply(
      reply({
        summary: "Backend se queda corto para automatización.",
        areas: [
          { key: "Backend", assessment: "Corto.", missing: [{ title: "Job scheduling", why: "cron", group: "Conocimientos de backend" }, { title: "Job scheduling" }, { title: "Message queues" }, { title: "REST" }, { title: "Web scraping", why: "extraer datos" }], misplaced: [{ title: "4.2 REST", reason: "va en otra", suggestedArea: "Automation" }, { title: "Inventado" }] },
          { key: "marte", missing: [{ title: "X" }] },
        ],
      }),
      ctx,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const a = r.review.areas[0]!;
    expect(a.key).toBe("backend");
    expect(a.missing.map((m) => m.title)).toEqual(["Job scheduling", "Web scraping"]);
    expect(a.missing[0]!.groupId).toBe("core");
    expect(a.misplaced).toEqual([{ folder: vault[1]!.folder, title: "4.2 REST", reason: "va en otra", suggestedArea: "automation" }]);
    expect(r.review.areas).toHaveLength(1);
    expect(r.review.discarded).toBe(5);
  });

  it("una respuesta sin JSON o vacía no es válida", () => {
    expect(parseCoverageReply("hola", ctx).ok).toBe(false);
    expect(parseCoverageReply(reply({ areas: [] }), ctx).ok).toBe(false);
  });

  it("sanitizeCoverageReview ignora lo inválido y descarta áreas que ya no existen", () => {
    expect(sanitizeCoverageReview({ at: "no", summary: "x" })).toBeUndefined();
    const ok = sanitizeCoverageReview({ at: "2026-10-07T10:00:00Z", summary: "ok", areas: [{ key: "backend", missing: [{ title: "A", why: "b" }] }, { key: "viejo", missing: [{ title: "B" }] }] }, ["backend"])!;
    expect(ok.areas.map((a) => a.key)).toEqual(["backend"]);
    expect(ok.source).toBe("ai");
  });
});
