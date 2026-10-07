// `practice_links` de punta a punta con una vault real en un directorio temporal: el lookup se inyecta al construir los
// managers (calendario/home derivan sin pasar por Metas), la API expone enlaces + progreso derivado, la jerarquía
// completa para el Plan (`goals_tree`) y promover / convertir / mover.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { formatIsoDate } from "../core/dates.js";
import { ITEM_DONE } from "../core/goalManager.js";
import { AppState } from "./appState.js";
import { calendarApi } from "./modules/calendar.js";
import { goalsApi } from "./modules/goals.js";
import { homeApi } from "./modules/home.js";
import { resetPracticeLookupCache } from "./practiceLookup.js";

let dir: string;
let app: AppState;
const TODAY = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
const ISO = formatIsoDate(TODAY);

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_pl_"));
  app = new AppState(dir);
  resetPracticeLookupCache();
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

/** Crea el módulo `programming_practice` con un intento de kata hoy y un proyecto en construcción. */
function seedPractice(opts: { kata?: boolean; project?: boolean } = { kata: true, project: true }): void {
  const area = path.join(dir, "Programación", "programming_practice");
  fs.mkdirSync(path.join(area, "projects", "_specs"), { recursive: true });
  if (opts.kata) {
    const f = path.join(dir, ".notevault", "estudio", "intentos");
    fs.mkdirSync(f, { recursive: true });
    fs.writeFileSync(path.join(f, "kata.json"), JSON.stringify({ note_id: "kata-1", attempts: [{ skill: "pp_kata", at: `${ISO}T09:00:00` }] }));
  }
  if (opts.project) {
    const p = path.join(area, "projects", "shop");
    fs.mkdirSync(p, { recursive: true });
    fs.writeFileSync(path.join(p, ".pp.json"), JSON.stringify({ version: 1, state: "building", createdAt: `${ISO}T08:00:00`, spec: { title: "Shop", focus: "backend" } }));
  }
  resetPracticeLookupCache();
}

describe("practice lookup injection", () => {
  it("managers get the practice lookup as soon as they are built, also after reopening the vault", () => {
    expect(app.mgrs().goals.practiceLookup).toBeTypeOf("function");
    app.open(dir);
    expect(app.mgrs().goals.practiceLookup).toBeTypeOf("function");
  });

  it("home and calendar derive the linked item's completion without going through goalsApi", () => {
    seedPractice({ kata: false, project: false }); // el módulo existe pero sin intentos
    const gm = app.mgrs().goals;
    const goal = gm.createGoal("Meta", { in_overview: true });
    gm.createItem(goal.id, "Manual", "", { due: TODAY, status: ITEM_DONE, in_calendar: true });
    gm.createItem(goal.id, "Kata", "", { due: TODAY, status: ITEM_DONE, in_calendar: true, practice_links: ["kata:daily#week=1"] });

    const rows = (homeApi(app).home_overview() as Record<string, any>).goals.items;
    expect(Object.fromEntries(rows.map((r: any) => [r.item.name, r.done]))).toEqual({ Manual: true, Kata: false });

    seedPractice(); // ahora sí hay un intento hoy
    const rows2 = (homeApi(app).home_overview() as Record<string, any>).goals.items;
    expect(Object.fromEntries(rows2.map((r: any) => [r.item.name, r.done]))).toEqual({ Manual: true, Kata: true });
    const cal = (calendarApi(app).cal_range(ISO, ISO) as Record<string, any[]>)[ISO]!.filter((o) => o.source === "metas");
    expect(Object.fromEntries(cal.map((o) => [o.title, o.done]))).toEqual({ Manual: true, Kata: true });
  });
});

describe("goals API with practice_links", () => {
  it("creates, updates and returns links with their derived progress; invalid strings are dropped", () => {
    seedPractice();
    const api = goalsApi(app);
    const g = api.goals_create({ name: "Constancia" }) as { id: string };
    const it = api.goals_item_create(g.id, "Hábito de código", "", { practice_links: ["kata:daily#week=2", "project:weekly#backend", "skill:x"] }) as any;
    expect(it.practice_links).toEqual(["kata:daily#week=2", "project:weekly#backend"]);
    expect(it.practice_progress.links.map((l: any) => [l.kind, l.pct, l.done])).toEqual([["kata", 50, false], ["project", 38, false]]);
    expect(it.progress).toBeCloseTo(0.44, 2); // media de los dos enlaces
    const up = api.goals_item_update(g.id, it.id, { practice_links: ["kata:daily#week=1"] }) as any;
    expect(up.practice_progress.done).toBe(true);
    expect(up.done_today).toBe(true);
    expect(() => api.goals_item_update(g.id, it.id, { practice_links: "kata:daily" })).toThrow();
    expect((api.goals_practice_links_progress(["kata:daily#week=1"]) as any).done).toBe(true);
    const cat = api.goals_practice_catalog() as any;
    expect(cat.ready).toBe(true);
    expect(cat.projects).toEqual([expect.objectContaining({ folder: "shop", title: "Shop", focus: "backend", state: "building" })]);
  });

  it("without the module the item reports no data instead of failing", () => {
    const api = goalsApi(app);
    const g = api.goals_create({ name: "Sin pp" }) as { id: string };
    const it = api.goals_item_create(g.id, "Kata", "", { practice_links: ["kata:daily", "project:monthly"] }) as any;
    expect(it.practice_progress).toMatchObject({ noData: true, done: false, pct: 0 });
    expect(it.progress).toBe(0);
    expect((api.goals_practice_catalog() as any)).toEqual({ ready: false, projects: [] });
  });

  it("goals_tree returns the full nested hierarchy with links and progress for the Plan", () => {
    seedPractice();
    const api = goalsApi(app);
    const g = api.goals_create({ name: "Backend", area: "programacion" }) as { id: string };
    const a = api.goals_item_create(g.id, "APIs") as any;
    const a1 = api.goals_item_create(g.id, "REST", a.id, { topic_links: ["Programación/No existe"] }) as any;
    api.goals_item_create(g.id, "Kata", a1.id, { practice_links: ["kata:daily#week=1"] });
    api.goals_item_create(g.id, "Otra", "", {});
    const all = api.goals_tree() as any[];
    expect(all).toHaveLength(1);
    expect(all[0].goal.id).toBe(g.id);
    const one = (api.goals_tree({ goalId: g.id }) as any[])[0];
    expect(one.items.map((i: any) => i.name)).toEqual(["APIs", "Otra"]);
    const rest = one.items[0].children[0];
    expect(rest.name).toBe("REST");
    expect(rest.topic_progress.broken).toEqual(["Programación/No existe"]);
    const kata = rest.children[0];
    expect(kata).toMatchObject({ name: "Kata", is_leaf: true, done: true, progress: 1, practice_links: ["kata:daily#week=1"] });
    expect(kata.practice_progress.links[0].done).toBe(true);
    expect(rest.progress).toBeCloseTo(0.5, 5); // REST: Kata 1 + enlace roto 0 (sus propios temas = un miembro más)
    expect(() => api.goals_tree({ goalId: "nope" })).toThrow();
  });

  it("promotes, converts and moves through the API", () => {
    const api = goalsApi(app);
    const g = api.goals_create({ name: "Raíz", area: "programacion", icon: "🛠" }) as { id: string };
    const a = api.goals_item_create(g.id, "Rama") as any;
    api.goals_item_create(g.id, "Hija", a.id);
    const promoted = api.goals_item_promote(g.id, a.id) as any;
    expect(promoted).toMatchObject({ name: "Rama", area: "programacion", icon: "🛠" });
    expect((api.goals_get(promoted.id) as any).items.map((i: any) => i.name)).toEqual(["Hija"]);
    expect((api.goals_get(g.id) as any).items).toEqual([]);

    const back = api.goals_goal_demote(promoted.id, g.id) as any;
    expect(back).toMatchObject({ name: "Rama", goal: g.id, parent: "" });
    expect((api.goals_get(g.id) as any).items.map((i: any) => i.name).sort()).toEqual(["Hija", "Rama"]);
    expect(() => api.goals_get(promoted.id)).toThrow();
    expect(() => api.goals_goal_demote(g.id, g.id)).toThrow();

    const other = api.goals_create({ name: "Otra" }) as { id: string };
    const moved = api.goals_item_move_to(g.id, back.id, other.id) as any;
    expect(moved.goal).toBe(other.id);
    expect((api.goals_get(other.id) as any).items.map((i: any) => i.name).sort()).toEqual(["Hija", "Rama"]);
  });
});
