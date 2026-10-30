import { describe, expect, it } from "vitest";
import { COARSE_MIN_MINUTES, coarseChaptersOf, depthGaps, MIN_PIECES_PER_CHAPTER } from "./areaDepth";
import { buildDepthTask } from "./depthPrompt";

const t = (n: string, estMinutes = 120, group = "core") => ({ folder: `Programación/4 Backend/${n}`, title: n, estMinutes, group });

describe("profundidad: un capítulo sin piezas es demasiado grueso", () => {
  it("marca los capítulos sin las piezas mínimas y deja pasar los desglosados", () => {
    const topics = [t("4.1 HTTP"), t("4.2 REST"), t("4.2.1 Verbs"), t("4.2.2 Status"), t("4.2.3 Idempotency"), t("4.3 Auth")];
    const r = coarseChaptersOf(topics);
    expect(r.chapters).toBe(3);
    expect(r.coarse.map((c) => c.title)).toEqual(["4.1 HTTP", "4.3 Auth"]);
    expect(MIN_PIECES_PER_CHAPTER).toBe(3);
  });

  it("un capítulo corto es una sola cosa y no se exige desglosarlo; lo omitido no cuenta", () => {
    expect(coarseChaptersOf([t("4.1 Intro", COARSE_MIN_MINUTES - 5)]).coarse).toEqual([]);
    expect(coarseChaptersOf([{ ...t("4.1 HTTP"), route: "skipped" }]).chapters).toBe(0);
    expect(coarseChaptersOf([{ ...t("4.1 HTTP"), route: "optional" }]).chapters).toBe(0);
  });

  it("detecta la profundidad por grupo (los lenguajes tienen capítulos de 3 números)", () => {
    const py = ["2.1.1 Syntax", "2.1.2 Types"].map((n) => ({ folder: `Programación/2.1 Python/${n}`, title: n, estMinutes: 90, group: "lang-python" }));
    const gaps = depthGaps([{ id: "s", area: "Backend", areaId: "backend", groups: [{ id: "lang-python", title: "Lenguaje: Python", kind: "language" }], topics: py }]);
    expect(gaps).toMatchObject([{ groupId: "lang-python", chapters: 2, missingPieces: 6 }]);
  });

  it("un área atómica (HTML con piezas) sale limpia y la de lógica no se exige", () => {
    const html = [{ folder: "Programación/5 Frontend/HTML/5.18.4 Skeleton", title: "a", estMinutes: 60, group: "html" }, ...[1, 2, 3].map((i) => ({ folder: `Programación/5 Frontend/HTML/5.18.4.${i} p`, title: "p", estMinutes: 30, group: "html" }))];
    expect(depthGaps([{ id: "f", area: "Frontend", areaId: "frontend", groups: [{ id: "html", title: "HTML" }], topics: html }])).toEqual([]);
    expect(depthGaps([{ id: "l", area: "Lógica", areaId: "logic", topics: [t("10.1 Kata")] }])).toEqual([]);
  });

  it("el prompt nombra cada capítulo, pide hacerlo todo de una vez y los comprobadores", () => {
    const gap = depthGaps([{ id: "s", area: "Backend", areaId: "backend", groups: [{ id: "core", title: "Backend fundamentals", kind: "knowledge" }], topics: [t("4.1 HTTP"), t("4.2 REST")] }])[0]!;
    const task = buildDepthTask(gap, { taskAbs: "/v/_handoff/desglosar/x.md", space: "Programación", vaultAbs: "/v", notevaultAbs: "" });
    expect(task.markdown).toContain("`4.1 HTTP`");
    expect(task.markdown).toContain("check_format.mjs");
    expect(task.shortPrompt).toMatch(/Do ALL of it in one run, WITHOUT stopping/);
    expect(task.shortPrompt).toContain("/v/_handoff/desglosar/x.md");
  });
});
