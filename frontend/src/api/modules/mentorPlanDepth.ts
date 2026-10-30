// PROFUNDIDAD del plan: `mentor_plan_depth` dice, sin IA, qué capítulos de qué áreas son demasiado gruesos (ver `lib/areaDepth.ts`) y
// `mentor_plan_depth_handoff` escribe en la vault el archivo de tarea para que otra IA los desglose en piezas y devuelve la frase corta que la persona pega.
// La app dice qué pedir; no hay que redactar nada ni depender de nadie para saberlo. Solo escribe el archivo de la tarea (nada en el plan).

import * as fs from "node:fs";
import * as path from "node:path";
import { ApiError } from "../../core/errors.js";
import { PLAN_ID_RE, PlanStore } from "../../core/mentor/plan.js";
import { COARSE_MIN_MINUTES, depthGaps, MIN_PIECES_PER_CHAPTER, type DepthGap } from "../../lib/areaDepth.js";
import { buildDepthTask } from "../../lib/depthPrompt.js";
import type { AppState } from "../appState.js";

const slug = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "area";
const stamp = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function loadPlan(app: AppState, opts: unknown) {
  const o = (opts && typeof opts === "object" ? opts : {}) as Record<string, unknown>;
  const id = String(o.planId ?? o.id ?? "");
  if (!PLAN_ID_RE.test(id)) throw new ApiError("Plan inválido.");
  const plan = new PlanStore(app.root).load(id);
  if (!plan) throw new ApiError("Ese plan ya no existe.");
  return { plan, o };
}

export function mentorPlanDepthApi(app: AppState, hooks: { now?: () => Date } = {}) {
  const gapsOf = (plan: ReturnType<typeof loadPlan>["plan"]): DepthGap[] => (plan.archived || plan.proposed ? [] : depthGaps(plan.subplans));
  return {
    mentor_plan_depth(opts: unknown): { gaps: Array<Omit<DepthGap, "coarse"> & { coarseCount: number; sample: string[] }>; standard: { minPieces: number; minMinutes: number } } {
      const { plan } = loadPlan(app, opts);
      return {
        gaps: gapsOf(plan).map(({ coarse, ...g }) => ({ ...g, coarseCount: coarse.length, sample: coarse.slice(0, 4).map((c) => c.title) })),
        standard: { minPieces: MIN_PIECES_PER_CHAPTER, minMinutes: COARSE_MIN_MINUTES },
      };
    },

    mentor_plan_depth_handoff(opts: unknown): { rel: string; abs: string; shortPrompt: string; chapters: number } {
      const { plan, o } = loadPlan(app, opts);
      const subplanId = String(o.subplanId ?? "");
      const groupId = String(o.groupId ?? "");
      const gap = gapsOf(plan).find((g) => g.subplanId === subplanId && g.groupId === groupId);
      if (!gap) throw new ApiError("Ese grupo ya está desglosado: no hay nada que pedir.");
      const space = gap.coarse[0]?.folder.split("/")[0] ?? "Programación";
      const now = (hooks.now ?? (() => new Date()))();
      const abs = path.join(app.root, space, "_handoff", "desglosar", `${stamp(now)}_${slug(gap.area)}_${slug(gap.groupTitle)}.md`);
      const task = buildDepthTask(gap, { taskAbs: abs, space, vaultAbs: app.root.replace(/\\/g, "/"), notevaultAbs: "" });
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, task.markdown, "utf-8");
      return { rel: path.relative(app.root, abs).replace(/\\/g, "/"), abs, shortPrompt: task.shortPrompt, chapters: gap.coarse.length };
    },
  };
}
