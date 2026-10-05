// El cumplimiento derivado de las submetas con `topic_links` debe verse en calendario y
// home sin haber pasado antes por `goalsApi`: el resolutor de temas se inyecta al
// construir los managers (AppState.mgrs), no al usar Metas. Este archivo NO importa
// modules/goals a propósito.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { formatIsoDate } from "../core/dates.js";
import { ITEM_DONE } from "../core/goalManager.js";
import { AppState } from "./appState.js";
import { calendarApi } from "./modules/calendar.js";
import { homeApi } from "./modules/home.js";

let dir: string;
let app: AppState;
const TODAY = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_lookup_"));
  app = new AppState(dir);
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

/** Una meta con dos submetas de hoy, ambas marcadas como hechas a mano; una enlazada a un tema que no existe. */
function seed(): void {
  const gm = app.mgrs().goals;
  const goal = gm.createGoal("Meta", { in_overview: true });
  gm.createItem(goal.id, "Manual", "", { due: TODAY, status: ITEM_DONE, in_calendar: true });
  gm.createItem(goal.id, "Enlazada", "", { due: TODAY, status: ITEM_DONE, in_calendar: true, topic_links: ["Mates/No existe"] });
}

describe("topic lookup injection", () => {
  it("managers get the lookup as soon as they are built", () => {
    expect(app.mgrs().goals.topicLookup).toBeTypeOf("function");
    app.open(dir); // reabrir la vault reconstruye los managers
    expect(app.mgrs().goals.topicLookup).toBeTypeOf("function");
  });

  it("home derives the linked item's completion without going through goalsApi", () => {
    seed();
    const res = homeApi(app).home_overview() as Record<string, any>;
    const done = Object.fromEntries(res.goals.items.map((r: any) => [r.item.name, r.done]));
    expect(done).toEqual({ Manual: true, Enlazada: false }); // el tema enlazado no existe: no se cumple solo
  });

  it("calendar derives it too", () => {
    seed();
    const day = formatIsoDate(TODAY);
    const rows = calendarApi(app).cal_range(day, day) as Record<string, any[]>;
    const goals = (rows[day] || []).filter((o) => o.source === "metas");
    const done = Object.fromEntries(goals.map((o) => [o.title, o.done]));
    expect(done).toEqual({ Manual: true, Enlazada: false });
  });
});
