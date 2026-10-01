// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let status: Record<string, unknown>;
const idea = { title: "Link shortener", problem: "Short codes with visit counts", client: "web", focus: "backend", hours: 10, why: "fits" };
const estimate = { layers: [{ layer: "database", files: 1, left: 0, tokens: 90 }, { layer: "backend", files: 2, left: 0, tokens: 400 }, { layer: "client", files: 1, left: 0, tokens: 120 }], totalTokens: 1900, skipped: 3, changed: null, checks: [{ label: "test (pytest) in backend", skip: "" }], previousDefenses: 0 };
const defense = {
  n: 1, rel: "Programación/programming_practice/projects/P/DEFENSE-1.md", conversationId: "c20261001000000-aaaaaa",
  final: { functional: true, score: 72, summary: "Works with gaps.", mustFix: ["Validate the update payload"], questions: [{ id: "q1", question: "Why a repository layer?", why: "w" }] },
  layers: [{ layer: "backend", verdict: "partial", strengths: [], issues: [{ severity: "high", file: "app/routes.py", line: 41, problem: "No validation on PUT", why: "w", fix: "validate" }] }],
  checks: [{ label: "test (pytest) in backend", status: "passed", ms: 900 }],
};
const invoke = vi.fn(async (method: string, ..._args: unknown[]) => {
  switch (method) {
    case "conversation_get": return { id: "c20261001000000-bbbbbb", title: "t", messages: [] };
    case "pp_status": return status;
    case "pp_init": status = { ...status, ready: true }; return { ok: true, area: "x", created: [] };
    case "pp_ideas": return { ideas: [idea], focus: "backend", conversationId: "c20261001000000-bbbbbb" };
    case "pp_build": return { folder: "Link shortener with stats", rel: "Programación/programming_practice/projects/_specs/Link shortener with stats.md", conversationId: "c20261001000000-cccccc" };
    case "pp_defend_estimate": return estimate;
    case "pp_defend": return defense;
    default: return {};
  }
});
(window as unknown as { nv: unknown }).nv = { invoke: (m: string, a: unknown[]) => invoke(m, ...(a ?? [])) };

import { PracticeProjectDialog, PracticeProjectsView, isPracticePath, usePracticeDialog } from "./PracticeProjectDialog";

let container: HTMLDivElement;
let root: Root;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const button = (re: RegExp) => [...container.querySelectorAll("button")].find((b) => re.test(`${b.textContent} ${b.title}`));
const baseStatus = { space: "Programación", ready: true, kataReady: true, projects: [], weaknesses: [], suggestedFocus: null, summary: "" };

beforeEach(() => {
  invoke.mockClear();
  status = { ...baseStatus };
  usePracticeDialog.setState({ open: true });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("isPracticePath", () => {
  it("is true only inside the programming_practice folder", () => {
    expect(isPracticePath("Programación/programming_practice/projects/P/SPEC.md")).toBe(true);
    expect(isPracticePath("Programación\\programming_practice\\kata\\kata.practica.md")).toBe(true);
    expect(isPracticePath("programming_practice")).toBe(true);
    expect(isPracticePath("Programación/1 Fundamentals/1.1 What programming is/1.1 What programming is.md")).toBe(false);
    expect(isPracticePath("Matemáticas/not_programming_practice_here.md")).toBe(false);
    expect(isPracticePath(null)).toBe(false);
  });
});

describe("PracticeProjectDialog", () => {
  it("offers to create the area when it does not exist and creates nothing else", async () => {
    status = { ...baseStatus, ready: false, kataReady: false };
    act(() => root.render(<PracticeProjectDialog />));
    await flush();
    expect(container.textContent).toContain("todavía no existe");
    act(() => button(/Crear el área/)!.click());
    await flush();
    expect(invoke).toHaveBeenCalledWith("pp_init");
    expect(container.textContent).toContain("Proponer ideas");
  });

  it("states the full-stack rule and proposes ideas aimed at the chosen focus", async () => {
    act(() => root.render(<PracticeProjectDialog />));
    await flush();
    expect(container.textContent).toContain("base de datos, backend y cliente");
    act(() => button(/Proponer ideas/)!.click());
    await flush();
    expect(invoke).toHaveBeenCalledWith("pp_ideas", expect.objectContaining({ focus: "" }));
    expect(container.textContent).toContain("Link shortener");
    act(() => button(/^\s*Especificar\s*$/)!.click());
    await flush();
    expect(invoke).toHaveBeenCalledWith("pp_build", expect.objectContaining({ idea: expect.objectContaining({ title: "Link shortener" }) }));
  });

  it("shows the profile and the focus the next project will push", async () => {
    status = { ...baseStatus, weaknesses: [{ label: "No input validation", layer: "backend", count: 2, status: "open" }], suggestedFocus: "backend" };
    act(() => root.render(<PracticeProjectDialog />));
    await flush();
    expect(container.textContent).toContain("No input validation");
    expect(container.textContent).toContain("apuntará a backend");
  });

  it("lists a specified project with Construir, and a built one with Defender", async () => {
    status = { ...baseStatus, projects: [{ folder: "A", title: "Spec only", state: "spec", focus: "backend", client: "web" }, { folder: "B", title: "Being built", state: "building", focus: "desktop", client: "desktop" }] };
    act(() => root.render(<PracticeProjectDialog />));
    await flush();
    expect(button(/Construir/)).toBeTruthy();
    expect(button(/Defender/)).toBeTruthy();
    act(() => button(/Construir/)!.click());
    await flush();
    expect(invoke).toHaveBeenCalledWith("pp_construct", "A");
  });

  it("tells the cost before reviewing, then shows the review with its located issues and the questions", async () => {
    status = { ...baseStatus, projects: [{ folder: "B", title: "Being built", state: "building", focus: "desktop", client: "desktop" }] };
    act(() => root.render(<PracticeProjectDialog />));
    await flush();
    act(() => button(/Defender/)!.click());
    await flush();
    expect(invoke).toHaveBeenCalledWith("pp_defend_estimate", "B", false);
    expect(container.textContent).toContain("1900");
    expect(container.textContent).toContain("sin gastar tokens");
    act(() => button(/Revisar mi proyecto/)!.click());
    await flush();
    expect(invoke).toHaveBeenCalledWith("pp_defend", "B", { runChecks: true, onlyChanged: false });
    expect(container.textContent).toContain("Funcional");
    expect(container.textContent).toContain("app/routes.py:41");
    expect(container.textContent).toContain("Why a repository layer?");
    expect(button(/Calificar mi defensa/)).toBeTruthy();
  });
});

describe("PracticeProjectsView (the projects folder opens it, like the kata opens its practice view)", () => {
  it("is a full page with the four phases and how many projects are in each", async () => {
    status = {
      ...baseStatus,
      projects: [
        { folder: "A", title: "Only a spec", state: "spec", focus: "backend", client: "web" },
        { folder: "B", title: "Building", state: "building", focus: "desktop", client: "desktop" },
        { folder: "C", title: "Also building", state: "building", focus: "frontend", client: "web" },
        { folder: "D", title: "Closed", state: "done", focus: "databases", client: "web", score: 80 },
      ],
    };
    act(() => root.render(<PracticeProjectsView />));
    await flush();
    expect(container.querySelector("[data-testid=projects-view]")).toBeTruthy();
    expect(container.textContent).toContain("Proyectos semanales");
    const phases = [...container.querySelectorAll("ol[aria-label=Fases] li")].map((li) => li.textContent);
    expect(phases).toHaveLength(4);
    expect(phases[0]).toContain("Especificar");
    expect(phases[0]).toContain("1 proyecto");
    expect(phases[1]).toContain("2 proyectos");
    expect(phases[3]).toContain("Postmortem");
    // the creation tools and the project list are on the page itself, not behind a dialog
    expect(button(/Proponer ideas/)).toBeTruthy();
    expect(button(/Construir/)).toBeTruthy();
    expect(container.textContent).toContain("projects/_specs");
    expect(container.querySelector("[role=dialog]")).toBeNull();
  });

  it("offers to create the area from the page when it is missing", async () => {
    status = { ...baseStatus, ready: false, kataReady: false };
    act(() => root.render(<PracticeProjectsView />));
    await flush();
    expect(button(/Crear el área/)).toBeTruthy();
  });
});
