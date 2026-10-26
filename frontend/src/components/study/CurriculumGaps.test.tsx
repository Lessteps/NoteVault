// @vitest-environment jsdom
//
// Temas por crear: marca de cobertura, tarjeta «Por crear», vista de huecos (agrupar / filtrar / seleccionar), barra con límites (25 avisa, 40 para),
// confirmación y el panel de la tarea para el agente (crear -> mirar avance cada 4 s -> validar bien o con problemas -> refrescar).

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { cover, row } from "../../lib/curriculumFixtures";
import { useCurriculum, curriculumApi, type CurriculumHandoffState } from "../../store/curriculum";
import { CoverageChip, PendingAreaCard } from "./CurriculumBadges";
import { CurriculumGaps } from "./CurriculumGaps";
import { useStudyVersion } from "./StudyPanel";

const many = Array.from({ length: 45 }, (_, i) => row(`m${i}`, "Muchos", "faltante", "recomendado"));
const CSS = cover("css", "CSS", "12 CSS", [
  row("1", "Layout", "faltante", "esencial", ["display", "flex", "grid"]),
  row("2", "Layout", "parcial", "recomendado"),
  row("3", "Color", "faltante", "opcional", ["color"]),
  row("4", "Color", "cubierto", "esencial"),
  ...many,
]);
const SMALL = cover("html", "HTML", "11 HTML", [row("h1", "Base", "faltante"), row("h2", "Base", "faltante", "opcional")]);

let host: HTMLDivElement;
let root: Root;
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
const byId = (id: string) => host.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const all = (id: string) => [...host.querySelectorAll(`[data-testid="${id}"]`)] as HTMLElement[];
const click = async (el: Element | null | undefined) => {
  expect(el).toBeTruthy();
  await act(async () => { el!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await flush();
};
const bodyBtn = (text: string) => [...document.body.querySelectorAll("button")].find((b) => b.textContent?.includes(text));

const entry = (id: string, over: Partial<CurriculumHandoffState["entries"][number]> = {}): CurriculumHandoffState["entries"][number] => ({
  entryId: id, title: `Tema ${id}`, category: "Base", importance: "esencial", number: "11.1", name: id, folder: `Programación/11 HTML/11.1 ${id}`, state: "pending", problems: [], warnings: [],
  progress: { folder: false, note: false, manifest: false, map: false, exercises: 0, temario: false }, ...over,
});
const state = (over: Partial<CurriculumHandoffState> = {}): CurriculumHandoffState => ({
  id: "h1", kind: "curriculum", areaId: "html", areaTitle: "HTML", space: "Programación", areaFolder: "11 HTML", withExercises: true, createdAt: "2026-10-26T10:00:00Z",
  taskPath: "_handoff/curriculum-html.md", taskAbs: "C:/v/_handoff/curriculum-html.md", folder: "_handoff", shortPrompt: "Lee _handoff/curriculum-html.md y haz lo que dice", prompt: "largo",
  status: "waiting", entries: [entry("h1"), entry("h2")], log: [], ready: { found: 0, expected: 2 }, ...over,
});

const capi = curriculumApi() as unknown as Record<string, unknown>;
let coverage: ReturnType<typeof vi.fn>;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  useCurriculum.setState({ areas: [], loaded: false, loading: false, error: "", pending: [], version: 0 });
  coverage = vi.fn(async () => ({ areas: [CSS, SMALL] }));
  capi.studyCurriculumCoverage = coverage;
  capi.studyCurriculumHandoffList = vi.fn(async () => []);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  for (const k of ["studyCurriculumCoverage", "studyCurriculumHandoff", "studyCurriculumHandoffStatus", "studyCurriculumHandoffValidate", "studyCurriculumHandoffList"]) delete capi[k];
  vi.useRealTimers();
  vi.restoreAllMocks();
});
const mount = async (areaId = "css", onBack?: () => void) => {
  await act(async () => { root.render(<CurriculumGaps areaId={areaId} onBack={onBack} />); });
  await flush();
};

describe("marca de cobertura y tarjeta «Por crear»", () => {
  const cases = [
    ["critico", cover("a", "CSS", "12 CSS", [row("1", "A", "faltante"), row("2", "A", "faltante")]), "Desarrollo insuficiente · 0 % · faltan 2"],
    ["bajo", cover("b", "CSS", "12 CSS", [row("1", "A", "cubierto"), row("2", "A", "faltante")]), "Desarrollo parcial · 50 % · faltan 1"],
  ] as const;
  for (const [level, c, text] of cases) {
    it(`nivel ${level}: texto y acción «Ver temas por crear»`, async () => {
      const open = vi.fn();
      await act(async () => { root.render(<CoverageChip coverage={c} onOpen={open} />); });
      expect(byId("coverage-chip")!.getAttribute("data-level")).toBe(level);
      expect(byId("coverage-chip")!.textContent).toContain(text);
      await click(byId("coverage-open"));
      expect(open).toHaveBeenCalledWith(c.areaId);
    });
  }
  it("nivel ok: no pinta nada", async () => {
    await act(async () => { root.render(<CoverageChip coverage={cover("c", "CSS", "12 CSS", [row("1", "A", "cubierto")])} onOpen={() => undefined} />); });
    expect(byId("coverage-chip")).toBeNull();
  });
  it("la tarjeta «Por crear» muestra la cobertura y abre la vista", async () => {
    const open = vi.fn();
    await act(async () => { root.render(<PendingAreaCard coverage={SMALL} onOpen={open} />); });
    const card = byId("pending-area-html")!;
    expect(card.textContent).toContain("11 HTML");
    expect(card.textContent).toContain("Por crear");
    expect(card.textContent).toContain("0 % cubierto");
    expect(card.className).toContain("border-dashed");
    await click(card);
    expect(open).toHaveBeenCalledWith("html");
  });
});

describe("vista «Temas por crear»", () => {
  it("cabecera con cobertura, nivel y cuentas; agrupa por categoría; arranca en faltantes", async () => {
    await mount();
    expect(byId("gaps-header")!.textContent).toContain("Desarrollo");
    expect(byId("gaps-counts")!.textContent).toContain("1 cubiertos · 1 parciales · 47 faltan");
    expect(all("gaps-group").map((g) => g.getAttribute("data-category"))).toEqual(["Layout", "Color", "Muchos"]);
    expect(all("gaps-row").filter((r) => r.getAttribute("data-status") === "cubierto")).toHaveLength(0);
  });

  it("filtros: estado, importancia, categoría y búsqueda", async () => {
    await mount();
    await click(byId("gaps-status-todos"));
    expect(all("gaps-row").some((r) => r.getAttribute("data-status") === "cubierto")).toBe(true);
    await click(byId("gaps-status-parcial"));
    expect(all("gaps-row").map((r) => r.getAttribute("data-id"))).toEqual(["2"]);
    await click(byId("gaps-status-todos"));
    const imp = byId("gaps-importance") as unknown as HTMLSelectElement;
    await act(async () => { imp.value = "opcional"; imp.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(all("gaps-row").map((r) => r.getAttribute("data-id"))).toEqual(["3"]);
    await act(async () => { imp.value = "todas"; imp.dispatchEvent(new Event("change", { bubbles: true })); });
    await click(byId("gaps-cat-Color"));
    expect(all("gaps-row").map((r) => r.getAttribute("data-id"))).toEqual(["3", "4"]);
    await click(byId("gaps-cat-Color"));
    const q = host.querySelector("input[aria-label='Buscar tema']") as HTMLInputElement;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(q, "flex"); q.dispatchEvent(new Event("input", { bubbles: true })); });
    expect(all("gaps-row").map((r) => r.getAttribute("data-id"))).toEqual(["1"]);
  });

  it("una categoría se pliega y los elementos de un tema se despliegan", async () => {
    await mount();
    const g = all("gaps-group")[0]!;
    await click(g.querySelector("[data-testid=gaps-group-toggle]"));
    expect(g.querySelectorAll("[data-testid=gaps-row]")).toHaveLength(0);
    await click(g.querySelector("[data-testid=gaps-group-toggle]"));
    const first = g.querySelector("[data-testid=gaps-row]")!;
    expect(first.querySelector("[data-testid=gaps-items-toggle]")!.textContent).toBe("3 elementos");
    await click(first.querySelector("[data-testid=gaps-items-toggle]"));
    expect(first.querySelector("[data-testid=gaps-items]")!.textContent).toBe("displayflexgrid");
  });

  it("ayudas de selección: esenciales faltantes, categoría, todo lo visible y limpiar", async () => {
    await mount();
    const count = () => byId("gaps-bar-count")!.textContent;
    expect(count()).toBe("0 temas seleccionados");
    expect((byId("gaps-create") as HTMLButtonElement).disabled).toBe(true);
    await click(byId("gaps-sel-essential"));
    expect(count()).toBe("1 tema seleccionado");
    await click(all("gaps-group")[1]!.querySelector("[data-testid=gaps-sel-category]"));
    expect(count()).toBe("2 temas seleccionados");
    await click(byId("gaps-sel-clear"));
    expect(count()).toBe("0 temas seleccionados");
    await click(byId("gaps-sel-visible"));
    expect(count()).toBe("47 temas seleccionados");
    await click(all("gaps-check")[0]);
    expect(count()).toBe("46 temas seleccionados");
  });

  it("barra: hasta 25 sin aviso; más de 25 avisa; más de 40 detiene", async () => {
    await mount();
    await click(byId("gaps-status-todos"));
    const checks = () => all("gaps-check").filter((c) => !(c as HTMLInputElement).disabled);
    for (const c of checks().slice(0, 25)) await click(c);
    expect(byId("gaps-bar")!.getAttribute("data-state")).toBe("ok");
    expect(byId("gaps-warn")).toBeNull();
    await click(checks()[25]);
    expect(byId("gaps-bar")!.getAttribute("data-state")).toBe("aviso");
    expect(byId("gaps-warn")!.textContent).toContain("divide en tandas de 25");
    expect((byId("gaps-create") as HTMLButtonElement).disabled).toBe(false);
    for (const c of checks().slice(26, 41)) await click(c);
    expect(byId("gaps-bar")!.getAttribute("data-state")).toBe("tope");
    expect(byId("gaps-stop")!.textContent).toContain("40");
    expect((byId("gaps-create") as HTMLButtonElement).disabled).toBe(true);
  });

  it("«Volver» y la lista de tareas pendientes se pueden reabrir", async () => {
    capi.studyCurriculumHandoffList = vi.fn(async () => [state({ areaId: "css", id: "p1" })]);
    const back = vi.fn();
    await mount("css", back);
    expect(byId("gaps-pending")!.textContent).toContain("Tareas pendientes (1)");
    await click(byId("gaps-pending-open"));
    expect(byId("curriculum-handoff-panel")).toBeTruthy();
    await click(byId("gaps-back"));
    expect(back).toHaveBeenCalled();
  });

  it("área desconocida: lo dice en vez de romper", async () => {
    await mount("nope");
    expect(byId("gaps-state")!.textContent).toContain("No encuentro");
  });
});

describe("crear con Antigravity", () => {
  it("confirmación (solo escribe un archivo, sin IA) -> tarea con las opciones -> panel", async () => {
    const create = vi.fn(async () => state());
    capi.studyCurriculumHandoff = create;
    await mount("html");
    await click(byId("gaps-sel-visible"));
    await click(byId("gaps-with-exercises"));
    await click(byId("gaps-create"));
    const text = document.body.textContent ?? "";
    expect(text).toContain("solo un archivo de tarea");
    expect(text).toContain("no crea nada");
    expect(text).toContain("no usa IA");
    expect(create).not.toHaveBeenCalled();
    await click(bodyBtn("Escribir la tarea"));
    expect(create).toHaveBeenCalledWith({ areaId: "html", entryIds: ["h1", "h2"], withExercises: false, confirm: true });
    expect(byId("curriculum-handoff-panel")!.textContent).toContain("Tarea para el agente");
    expect(byId("gaps-bar-count")!.textContent).toBe("0 temas seleccionados");
  });

  it("cancelar no escribe nada", async () => {
    const create = vi.fn(async () => state());
    capi.studyCurriculumHandoff = create;
    await mount("html");
    await click(byId("gaps-sel-visible"));
    await click(byId("gaps-create"));
    await click(byId("gaps-confirm-cancel"));
    expect(create).not.toHaveBeenCalled();
    expect(byId("gaps-confirm")).toBeNull();
  });

  it("panel: avance cada 4 s, validar con problemas y luego bien refresca cobertura y áreas", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const status = vi.fn(async () => state({ entries: [entry("h1", { progress: { folder: true, note: true, manifest: false, map: false, exercises: 0, temario: false } }), entry("h2")] }));
    const validate = vi.fn()
      .mockResolvedValueOnce(state({ status: "failed", entries: [entry("h1", { state: "created" }), entry("h2", { state: "error", problems: ["Falta _tema.md"] })] }))
      .mockResolvedValueOnce(state({ status: "validated", entries: [entry("h1", { state: "created" }), entry("h2", { state: "created" })] }));
    capi.studyCurriculumHandoff = vi.fn(async () => state());
    capi.studyCurriculumHandoffStatus = status;
    capi.studyCurriculumHandoffValidate = validate;
    await mount("html");
    await click(byId("gaps-sel-visible"));
    await click(byId("gaps-create"));
    await click(bodyBtn("Escribir la tarea"));
    expect(status).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(4000); });
    await flush();
    expect(status).toHaveBeenCalledWith("h1");
    expect(byId("curriculum-handoff-ready")!.textContent).toContain("carpeta 1/2");
    expect(byId("curriculum-handoff-ready")!.textContent).toContain("nota 1/2");
    expect(byId("curriculum-handoff-prompt")!.textContent).toContain("curriculum-html.md");

    const v0 = useStudyVersion.getState().v;
    await click(byId("curriculum-handoff-validate"));
    expect(byId("curriculum-handoff-panel")!.getAttribute("data-status")).toBe("failed");
    expect(host.textContent).toContain("Falta _tema.md");
    expect(all("curriculum-handoff-entry").map((e) => e.getAttribute("data-state"))).toEqual(["created", "error"]);
    expect(useStudyVersion.getState().v).toBe(v0);

    coverage.mockClear();
    await click(byId("curriculum-handoff-validate"));
    expect(byId("curriculum-handoff-panel")!.getAttribute("data-status")).toBe("validated");
    expect(host.textContent).toContain("se validaron 2 de 2");
    expect(coverage).toHaveBeenCalled();
    expect(useStudyVersion.getState().v).toBe(v0 + 1);
    expect(byId("curriculum-handoff-validate")).toBeNull();
    await click(byId("curriculum-handoff-close"));
    expect(byId("curriculum-handoff-panel")).toBeNull();
  });
});
