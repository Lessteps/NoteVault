/**
 * Fuente de calendario para el Mentor:
 * Integra las sesiones de estudio y temas del plan activo en el módulo global de Calendario.
 */

import * as path from "node:path";
import { Occurrence } from "../scheduleManager.js";
import { PlanStore } from "./plan.js";
import { buildSchedule } from "../../lib/planSchedule.js";
import { dayByArea } from "../../lib/planTopicsByArea.js";
import { placeBlocks } from "../../lib/areaTimes.js";
import { AreaTimesStore } from "./areaTimesStore.js";

const AREA_COLOURS: Record<string, string> = {
  backend: "#38bdf8",
  frontend: "#34d399",
  databases: "#a78bfa",
  logic: "#2dd4bf",
  tooling: "#fb7185",
  automation: "#fbbf24",
  desktop: "#818cf8",
  mobile: "#f472b6",
  bases: "#7c5af0",
};

export class MentorCalendarSource {
  prefix = "mentor:";
  prefixes = ["mentor:"] as const;
  vaultRoot: string;

  constructor(vaultRoot: string) {
    this.vaultRoot = path.resolve(vaultRoot);
  }

  occurrences(first: Date, last: Date): Record<string, Occurrence[]> {
    const out: Record<string, Occurrence[]> = {};
    const st = new PlanStore(this.vaultRoot);
    const plans = st.list();
    const activePlan = plans.find((p) => !p.archived && !p.proposed);
    if (!activePlan) return out;

    const firstIso = first.toISOString().slice(0, 10);
    const lastIso = last.toISOString().slice(0, 10);

    const times = new AreaTimesStore(this.vaultRoot).load(activePlan.id);
    const sch = buildSchedule(activePlan as any);
    for (const [dateStr, day] of sch.byDate.entries()) {
      if (dateStr < firstIso || dateStr > lastIso) continue;
      if (!day.study) continue;

      const entries = dayByArea(activePlan, day, []);
      if (!entries.length) continue;

      out[dateStr] = out[dateStr] || [];
      // la hora que el estudiante fijó a un área manda; el resto se apila desde las 09:00 (ver `placeBlocks`)
      const placed = placeBlocks(entries.map((e) => ({ key: e.subplanId, minutes: e.theoryMinutes + e.practiceMinutes })), times);

      for (const e of entries) {
        const areaColor = AREA_COLOURS[e.areaId ?? e.subplanId] ?? "#38bdf8";
        const dayTopics = day.topics.filter((t) => t.subplanId === e.subplanId);
        const topicTitles = dayTopics.map((t) => t.title).join(", ");
        const slot = placed.find((p) => p.key === e.subplanId)!;
        const title = `📚 ${e.area}: ${topicTitles || `${e.theoryTopics} temas`} (${slot.durationMin}m)`;
        const occ = new Occurrence(
          `mentor:${activePlan.id}:${dateStr}:${e.subplanId}`,
          title,
          "mentor_study",
          new Date(dateStr + "T00:00:00"),
          slot.start,
          slot.durationMin,
          areaColor,
          [{ type: "mentor_day", id: activePlan.id, date: dateStr, subplanId: e.subplanId }],
          false,
          "mentor",
          false
        );
        out[dateStr].push(occ);
      }
    }

    return out;
  }
}
