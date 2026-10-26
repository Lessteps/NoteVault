import { describe, expect, it } from "vitest";
import {
  areaRows, filterTopics, joinPath, parsePath, planMembership, sortAreas, spaceRows, splitCode, topicRows, topicsOf, type IndexInput,
} from "./mentorAreasOverview";
import type { TopicDashboardItem } from "./types";

const item = (folder: string, pct: number, o: { attempts?: number; passes?: number; required?: number; complete?: boolean; notes?: number } = {}): TopicDashboardItem =>
  ({
    folder,
    area: "x",
    subject: "mathematics",
    manifest: { type: "topic", subject: "mathematics", title: folder.split("/").pop()!, skills: ["solve"], mastery: {} },
    progress: {
      completenessPct: pct,
      isComplete: !!o.complete,
      exerciseNotesCount: o.notes ?? 0,
      skills: {
        solve: {
          totalAttempts: o.attempts ?? 0,
          totalPasses: o.passes ?? 0,
          cells: { 1: { passes: o.passes ?? 0, attempts: o.attempts ?? 0, required: o.required } },
        },
      },
    },
  }) as unknown as TopicDashboardItem;

const input = (): IndexInput => ({
  items: [
    item("Programación/1 Backend/1.1 HTTP", 100, { attempts: 4, passes: 4, required: 4, complete: true }),
    item("Programación/1 Backend/1.10 REST", 40, { attempts: 2, passes: 1, required: 4 }),
    item("Programación/1 Backend/1.2 JSON", 0),
    item("Programación/2 Frontend/2.1 DOM", 0),
    item("Matemáticas/1 Álgebra/1.1 Sumas", 50, { attempts: 1, passes: 1, notes: 6 }),
  ],
  reviews: [{ topicPath: "Programación/1 Backend/1.10 REST", next: "2026-10-20", inDays: -2 }],
  lastByFolder: new Map([["Programación/1 Backend/1.1 HTTP", "2026-10-22"], ["Programación/1 Backend/1.10 REST", "2026-10-25"]]),
});

describe("mentorAreasOverview", () => {
  it("separa el código del título", () => {
    expect(splitCode("4.1 What the backend is")).toEqual({ code: "4.1", title: "What the backend is" });
    expect(splitCode("Intro")).toEqual({ code: "", title: "Intro" });
  });

  it("filas de tema: estado, ejercicios, repaso y última actividad", () => {
    const rows = topicRows(input());
    const http = rows.find((r) => r.code === "1.1" && r.space === "Programación")!;
    expect(http).toMatchObject({ state: "completo", exercisesDone: 4, exercisesTotal: 4, lastActivity: "2026-10-22", area: "Programación/1 Backend" });
    const rest = rows.find((r) => r.title === "REST")!;
    expect(rest).toMatchObject({ state: "en_curso", exercisesDone: 1, exercisesTotal: 4, reviewDue: true, nextReview: "2026-10-20" });
    expect(rows.find((r) => r.title === "JSON")!.state).toBe("sin_tratar");
    // sin plan: los ejercicios totales salen de las notas de ejercicio
    expect(rows.find((r) => r.title === "Sumas")).toMatchObject({ exercisesDone: 1, exercisesTotal: 6 });
  });

  it("espacios: una fila compacta por espacio con sus totales", () => {
    const sp = spaceRows(topicRows(input()));
    expect(sp.map((s) => s.space)).toEqual(["Matemáticas", "Programación"]);
    const prog = sp[1]!;
    expect(prog).toMatchObject({ areas: 2, topics: 4, completed: 1, started: 2, reviewsDue: 1, lastActivity: "2026-10-25", exercisesDone: 5 });
    expect(prog.pct).toBe(35);
  });

  it("áreas y temas de un espacio, en orden natural (1.2 antes de 1.10)", () => {
    const rows = topicRows(input());
    expect(areaRows(rows, "Programación").map((a) => [a.name, a.pct, a.state])).toEqual([["1 Backend", 47, "en_curso"], ["2 Frontend", 0, "sin_tratar"]]);
    expect(topicsOf(rows, "Programación", "Programación/1 Backend").map((t) => t.code)).toEqual(["1.1", "1.2", "1.10"]);
  });

  it("filtros de temas y orden de áreas", () => {
    const rows = topicsOf(topicRows(input()), "Programación", "Programación/1 Backend");
    expect(filterTopics(rows, "todos")).toHaveLength(3);
    expect(filterTopics(rows, "sin_tratar").map((r) => r.title)).toEqual(["JSON"]);
    expect(filterTopics(rows, "en_curso").map((r) => r.title)).toEqual(["REST"]);
    expect(filterTopics(rows, "completo").map((r) => r.title)).toEqual(["HTTP"]);
    expect(filterTopics(rows, "repaso").map((r) => r.title)).toEqual(["REST"]);
    expect(filterTopics(rows, "todos", "jso")).toHaveLength(1);
    expect(sortAreas([{ name: "B", pct: 10 }, { name: "A", pct: 5 }], "avance").map((a) => a.name)).toEqual(["B", "A"]);
    expect(sortAreas([{ name: "B", pct: 10 }, { name: "A", pct: 5 }], "nombre").map((a) => a.name)).toEqual(["A", "B"]);
  });

  it("la ruta del desglose se serializa y se lee", () => {
    expect(parsePath("")).toEqual({ space: "", area: "" });
    expect(parsePath(joinPath("Programación", "Programación/1 Backend"))).toEqual({ space: "Programación", area: "Programación/1 Backend" });
    expect(parsePath("|huérfana")).toEqual({ space: "", area: "" });
  });

  it("pertenencia al plan: temas y áreas de la ruta (sin los saltados)", () => {
    const m = planMembership("Mi plan", { subplans: [{ topics: [{ folder: "Programación/1 Backend/1.1 HTTP" }, { folder: "Programación/2 Frontend/2.1 DOM", route: "skipped" }] }] })!;
    expect(m.folders.has("Programación/1 Backend/1.1 HTTP")).toBe(true);
    expect(m.areas.has("Programación/1 Backend")).toBe(true);
    expect(m.areas.has("Programación/2 Frontend")).toBe(false);
    expect(planMembership("x", null)).toBeNull();
  });
});
