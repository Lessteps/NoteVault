// Almacén del horario por área de un plan: `.notevault/mentor/area-times/<planId>.json`. Lo leen el calendario general (MentorCalendarSource) y la API;
// lo escriben el calendario y la página del área a través de la misma API, así que no hay dos copias que puedan discrepar.

import * as fs from "node:fs";
import * as path from "node:path";
import { sanitizeAreaTimes, type AreaTimes } from "../../lib/areaTimes.js";
import * as store from "../store.js";
import { PLAN_ID_RE } from "./plan.js";

export class AreaTimesStore {
  private dir: string;

  constructor(vaultRoot: string) {
    this.dir = path.join(path.resolve(vaultRoot), ".notevault", "mentor", "area-times");
  }

  private file(planId: string): string {
    if (!PLAN_ID_RE.test(planId)) throw new Error("Plan inválido.");
    return path.join(this.dir, `${planId}.json`);
  }

  load(planId: string): AreaTimes {
    const f = this.file(planId);
    if (!fs.existsSync(f)) return {};
    return sanitizeAreaTimes(store.loadJson(f, null));
  }

  save(planId: string, times: AreaTimes): AreaTimes {
    const clean = sanitizeAreaTimes(times);
    fs.mkdirSync(this.dir, { recursive: true });
    store.writeJson(this.file(planId), clean);
    return clean;
  }
}
