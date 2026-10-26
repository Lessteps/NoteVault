// @vitest-environment jsdom
//
// Mentor — «Áreas» con el currículo de referencia: marca de falta de desarrollo en espacios y áreas, tarjeta «Por crear» y el enlace «Temas por crear»
// que abre la vista de huecos dentro de la misma ruta (y «Volver» regresa donde estabas).

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { api } from "../../lib/bridge";
import { cover, row } from "../../lib/curriculumFixtures";
import { curriculumApi, useCurriculum } from "../../store/curriculum";
import { useMentor } from "../../store/mentor";
import { useNavState } from "../../store/navState";
import { MentorModule } from "./MentorModule";

const SPACES = [{ space: "Programación", areas: 2, pct: 60, topics: 10, completed: 4, started: 6, exercisesDone: 30, exercisesTotal: 50, reviewsDue: 0, lastActivity: "" }];
const AREAS = [
  { space: "Programación", area: "Programación/5 Frontend", name: "5 Frontend", pct: 70, topics: 6, completed: 3, started: 5, exercisesDone: 20, exercisesTotal: 30, reviewsDue: 0, lastActivity: "", state: "en_curso" },
  { space: "Programación", area: "Programación/2.2 JavaScript", name: "2.2 JavaScript", pct: 10, topics: 4, completed: 0, started: 1, exercisesDone: 1, exercisesTotal: 20, reviewsDue: 0, lastActivity: "", state: "en_curso" },
];
const CSS = cover("css", "CSS", "12 CSS", [
  row("1", "Color", "parcial", "esencial", ["color"], ["Programación/5 Frontend/5.1 Colores"]),
  row("2", "Layout", "faltante"),
  row("3", "Layout", "faltante"),
]);
const HTML = cover("html", "HTML", "11 HTML", [row("h1", "Base", "faltante")]);

let host: HTMLDivElement;
let root: Root;
const capi = curriculumApi() as unknown as Record<string, unknown>;
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
const byId = (id: string) => host.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const click = async (el: Element | null | undefined) => {
  expect(el).toBeTruthy();
  await act(async () => { el!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await flush();
};
async function mount(path = "", tab = "areas") {
  useNavState.setState({ values: { "mentor.view": "areas", "mentor.areas.tab": tab, ...(path ? { "mentor.areas.path": path } : {}) } });
  await act(async () => { root.render(<MentorModule />); });
  await flush();
  await flush();
}

beforeEach(() => {
  localStorage.clear();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  useMentor.setState({ plans: [], plansLoaded: true, builds: [] });
  useCurriculum.setState({ areas: [], loaded: false, loading: false, error: "", pending: [], version: 0 });
  vi.spyOn(api, "mentorPlanList").mockResolvedValue([]);
  vi.spyOn(api, "mentorPlanBuildList").mockResolvedValue([] as never);
  vi.spyOn(api, "mentorAreasOverview").mockImplementation((async (o: { level?: string }) =>
    o.level === "areas" ? { level: "areas", rows: AREAS } : o.level === "topics" ? { level: "topics", rows: [] } : { level: "spaces", rows: SPACES, areas: AREAS }) as never);
  capi.studyCurriculumCoverage = vi.fn(async () => ({ areas: [CSS, HTML] }));
  capi.studyCurriculumHandoffList = vi.fn(async () => []);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  delete capi.studyCurriculumCoverage;
  delete capi.studyCurriculumHandoffList;
  vi.restoreAllMocks();
});

describe("Áreas del Mentor con el currículo", () => {
  it("la tarjeta del espacio lleva la marca de las áreas del currículo con poco desarrollo", async () => {
    await mount();
    const chips = [...host.querySelectorAll("[data-testid=coverage-chip]")];
    expect(chips.map((c) => c.getAttribute("data-area")).sort()).toEqual(["css", "html"]);
    expect(byId("lacking-chips")!.textContent).toContain("Desarrollo insuficiente");
  });

  it("en las áreas: marca solo en la relacionada (5 Frontend) y tarjeta «Por crear» para HTML y CSS inexistentes", async () => {
    await mount("Programación");
    const front = byId("area-5 Frontend")!.parentElement!;
    expect(front.querySelector("[data-testid=coverage-chip]")!.textContent).toContain("Desarrollo insuficiente · 17 % · faltan 2");
    const js = byId("area-2.2 JavaScript")!.parentElement!;
    expect(js.querySelector("[data-testid=coverage-chip]")).toBeNull();
    const pend = host.querySelector("[data-testid=pending-area-html]")!;
    expect(pend.textContent).toContain("Por crear");
    expect(pend.className).toContain("border-dashed");
    expect(host.querySelector("[data-testid=pending-area-css]")).toBeTruthy();
  });

  it("«Ver temas por crear» abre la vista de huecos y «Volver» regresa a las áreas", async () => {
    await mount("Programación");
    await click(byId("area-5 Frontend")!.parentElement!.querySelector("[data-testid=coverage-open]"));
    expect(byId("curriculum-gaps")!.getAttribute("data-area")).toBe("css");
    expect(byId("areas-overview")!.getAttribute("data-view")).toBe("gaps");
    await click(byId("gaps-back"));
    expect(byId("area-5 Frontend")).toBeTruthy();
  });

  it("la tarjeta «Por crear» también abre la vista", async () => {
    await mount("Programación");
    await click(byId("pending-area-html"));
    expect(byId("curriculum-gaps")!.getAttribute("data-area")).toBe("html");
  });

  it("la página de un área muestra la marca con su enlace", async () => {
    await mount("Programación|Programación/5 Frontend");
    await click(byId("area-page")!.querySelector("[data-testid=coverage-open]"));
    expect(byId("curriculum-gaps")!.getAttribute("data-area")).toBe("css");
  });
});
