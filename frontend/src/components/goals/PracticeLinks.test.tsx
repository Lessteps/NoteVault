// @vitest-environment jsdom
//
// Metas — enlaces a «Programming practice» de una submeta: sección «Práctica» (selector con aria-pressed, chips con el
// avance derivado, enlace roto / sin datos en rojo, quitar) y la vista de detalle de una submeta como meta de primera clase.

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(window as unknown as { nv: unknown }).nv = { invoke: async () => ({}) };

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { api } from "../../lib/bridge";
import type { GoalDetail, GoalItem, PracticeLinkProgress } from "../../lib/types";
import { useGoals } from "../../store/goals";

const ui = vi.hoisted(() => ({ confirmAction: vi.fn() }));
vi.mock("../ui", async (orig) => ({ ...(await orig<typeof import("../ui")>()), confirmAction: ui.confirmAction }));
vi.mock("./TopicLinks", () => ({ TopicLinks: () => <div data-testid="topic-links" /> }));

import { PracticeChips, PracticeLinks } from "./PracticeLinks";
import { SubmetaDetail } from "./SubmetaDetail";

const progress = (over: Partial<PracticeLinkProgress> = {}): PracticeLinkProgress => ({
  done: false, pct: 40, noData: false,
  links: [{ link: "kata:daily", kind: "kata", label: "Kata diario · 5 días/semana", detail: "2 de 5 días esta semana", noData: false, broken: false, done: false, pct: 40 }],
  ...over,
});

let host: HTMLDivElement;
let root: Root;
const flush = () => act(async () => { await Promise.resolve(); });
const mountEl = async (el: React.ReactNode) => { await act(async () => { root.render(el); }); await flush(); await flush(); };
const click = async (el: Element | null | undefined) => { await act(async () => { (el as HTMLElement).click(); }); await flush(); };
const button = (name: RegExp | string) =>
  [...host.querySelectorAll("button")].find((b) => (typeof name === "string" ? b.textContent === name || b.getAttribute("aria-label") === name : name.test(b.textContent ?? "") || name.test(b.getAttribute("aria-label") ?? "")));

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  vi.spyOn(api, "goalsPracticeCatalog").mockResolvedValue({ ready: true, projects: [{ folder: "shop", title: "Shop", state: "building", focus: "backend", date: "2026-10-06" }] });
  vi.spyOn(api, "goalsPracticeLinksProgress").mockImplementation(async (links) => progress({
    links: links.map((l) => ({ link: l, kind: l.startsWith("kata") ? "kata" : "project", label: l, detail: "d", noData: false, broken: l.includes("gone"), done: false, pct: 40 })),
  }));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  ui.confirmAction.mockReset();
});

function Harness({ start = [] as string[] }) {
  const [v, setV] = useState(start);
  return (
    <>
      <PracticeLinks value={v} onChange={setV} />
      <output data-testid="value">{v.join("|")}</output>
    </>
  );
}

describe("PracticeLinks", () => {
  it("shows the empty state and the real selector with aria-pressed toggles", async () => {
    await mountEl(<Harness />);
    expect(host.textContent).toContain("Sin enlaces a práctica.");
    const open = button("＋ Enlazar práctica")!;
    expect(open.getAttribute("aria-expanded")).toBe("false");
    await click(open);
    expect(open.getAttribute("aria-expanded")).toBe("true");

    const three = button("3 días/semana")!;
    expect(three.getAttribute("aria-pressed")).toBe("false");
    await click(three);
    expect(host.querySelector("[data-testid=value]")!.textContent).toBe("kata:daily#week=3");
    expect(button("3 días/semana")!.getAttribute("aria-pressed")).toBe("true");
    // only one daily kata per submeta: another target replaces it
    await click(button("Racha de 7"));
    expect(host.querySelector("[data-testid=value]")!.textContent).toBe("kata:daily#streak=7");

    // project weekly with a focus, and a concrete project from the catalogue
    await act(async () => {
      const sel = host.querySelector("select[aria-label='Foco del proyecto']") as HTMLSelectElement;
      const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!;
      set.call(sel, "backend");
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await click(button("Semanal"));
    await click(button("Shop"));
    expect(host.querySelector("[data-testid=value]")!.textContent).toBe("kata:daily#streak=7|project:weekly#backend|project:folder:shop");
    expect(button("Shop")!.getAttribute("aria-pressed")).toBe("true");
  });

  it("chips carry the derived percentage, broken links are red and each has an accessible remove button", async () => {
    await mountEl(<Harness start={["kata:daily", "project:folder:gone"]} />);
    const chips = [...host.querySelectorAll("[data-testid=practice-chip]")];
    expect(chips).toHaveLength(2);
    expect(chips[0]!.textContent).toContain("40%");
    expect(chips[1]!.textContent).toContain("roto");
    expect(chips[1]!.className).toContain("text-[#e5484d]");
    await click(button("Quitar project:folder:gone"));
    expect(host.querySelector("[data-testid=value]")!.textContent).toBe("kata:daily");
  });

  it("says there is no practice data when the module is missing", async () => {
    vi.spyOn(api, "goalsPracticeLinksProgress").mockResolvedValue({
      done: false, pct: 0, noData: true,
      links: [{ link: "kata:daily", kind: "kata", label: "Kata diario · 5 días/semana", detail: "sin datos de práctica", noData: true, broken: false, done: false, pct: 0 }],
    });
    vi.spyOn(api, "goalsPracticeCatalog").mockResolvedValue({ ready: false, projects: [] });
    await mountEl(<Harness start={["kata:daily"]} />);
    expect(host.textContent).toContain("sin datos");
    expect(host.textContent).toContain("Sin datos de práctica: esta vault no tiene el módulo Programming practice.");
    await click(button("＋ Enlazar práctica"));
    expect(host.textContent).toContain("falta el módulo Programming practice");
  });

  it("PracticeChips renders read-only chips and nothing without links", async () => {
    await mountEl(<PracticeChips item={{ practice_progress: null }} />);
    expect(host.querySelector("[data-testid=practice-chips]")).toBeNull();
    await mountEl(<PracticeChips item={{ practice_progress: progress() }} />);
    expect(host.querySelector("[data-testid=practice-chips]")!.textContent).toContain("Kata diario · 5 días/semana · 40%");
  });
});

const item = (over: Partial<GoalItem> = {}): GoalItem => ({
  id: "i1", goal: "g1", parent: "", name: "Backend sólido", status: "En curso", priority: 3, order: 1, start: "2026-10-01", due: "2026-12-01", due_time: "",
  duration_min: null, repeat: "", repeat_until: null, in_calendar: false, reminder_min: null, target: null, unit: "", value: null, habit_links: [],
  topic_links: [], topic_progress: null, practice_links: ["kata:daily"], practice_progress: progress(), done_at: null, created: "2026-10-01", notes: "",
  category: "", is_priority: false, children: ["i2"], is_leaf: false, measurable: false, schedule: "", progress: 0.4, counts: [1, 3], adherence7: null,
  adherence30: null, streak: 0, done_today: false, value_today: null, late: false, linked_folder: "", linked_notes: [], ...over,
});

describe("SubmetaDetail as a first-class goal view", () => {
  const detailOf = (): GoalDetail => ({
    goal: { id: "g1", name: "Ser backend", icon: "🛠", colour: "#112233", status: "Activa", priority: 3, area: "", overdue: false, days_left: null } as never,
    items: [
      item({ id: "p0", name: "Madre", children: ["i1"], practice_links: [], practice_progress: null }),
      item({ parent: "p0" }),
      item({ id: "i2", parent: "i1", name: "Hija", is_leaf: false, children: ["i3"], practice_links: [], practice_progress: null, progress: 0 }),
      item({ id: "i3", parent: "i2", name: "Nieta", is_leaf: true, children: [], practice_links: [], practice_progress: null, progress: 0 }),
    ],
    categories: [],
    stats: { progress: 0, counts: [0, 0], adherence7: null, adherence30: null, best_streak: 0, days_left: null },
    history: { days: [], daily: [], repeating: [], completed: [] },
  });

  it("has breadcrumb, editable properties, Práctica section and the promote / move actions", async () => {
    vi.spyOn(api, "habitsList").mockResolvedValue([]);
    vi.spyOn(api, "goalsList").mockResolvedValue([{ id: "g1", name: "Ser backend", icon: "🛠" }] as never);
    const upd = vi.spyOn(api, "goalItemUpdate").mockResolvedValue(item());
    const promote = vi.spyOn(api, "goalItemPromote").mockResolvedValue({ id: "g9", name: "Backend sólido" } as never);
    vi.spyOn(api, "goalsGet").mockResolvedValue(detailOf());
    vi.spyOn(api, "goalsSidebar").mockResolvedValue({} as never);
    ui.confirmAction.mockResolvedValue(true);
    useGoals.setState({ detail: detailOf(), submetaId: "i1", openId: "g1", open: vi.fn(async () => undefined) });
    await mountEl(<SubmetaDetail />);

    const crumbs = host.querySelector("nav[aria-label='Ruta de la submeta']")!;
    expect(crumbs.textContent).toContain("Ser backend");
    expect(crumbs.textContent).toContain("Madre");
    expect(crumbs.querySelector("[aria-current=page]")!.textContent).toBe("Backend sólido");
    expect(host.textContent).toContain("Días restantes");
    expect(host.textContent).toContain("Submetas anidadas");
    expect(host.textContent).toContain("Práctica");
    expect(host.querySelector("[data-testid=topic-links]")).not.toBeNull();
    expect(host.querySelector("[data-testid=practice-chip]")).not.toBeNull();

    const prio = host.querySelector("select[aria-label='Prioridad']") as HTMLSelectElement;
    expect(prio).not.toBeNull();
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(prio, "4");
      prio.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(upd).toHaveBeenCalledWith("g1", "i1", { priority: 4 });

    await click(button(/Promover a meta/));
    expect(promote).toHaveBeenCalledWith("g1", "i1");

    await click(button(/Mover a…/));
    expect(document.querySelector("[role=dialog][aria-label='Mover submeta a…']") ?? host.querySelector("[role=dialog]")).not.toBeNull();
  });
});
