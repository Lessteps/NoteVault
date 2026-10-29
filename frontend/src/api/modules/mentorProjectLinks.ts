// El proyecto mensual del Mentor como PROYECTO REAL del módulo Proyectos. El plan ya tenía el «entregable del mes» (`mm:<mes>`) pero no existía un proyecto de verdad
// donde trabajarlo: aquí se crea uno por mes —con su descripción, sus hitos semanales como issues y sus piezas diarias como sub-issues con su fecha— y se enlaza por
// id en `.notevault/mentor/project-links/<planId>.json` (fuera del plan: `sanitizePlan` descartaría un campo desconocido). El avance de los issues sigue al de las
// piezas (las casillas de su carpeta); nada se marca a mano en el módulo. Idempotente: pedirlo otra vez devuelve el mismo proyecto.
//  - mentor_plan_project_links({ planId })   -> { links: { [monthId]: ProjectLink } }   (sincroniza el avance)
//  - mentor_plan_project_create({ planId, monthId }) -> { link, created }

import * as fs from "node:fs";
import * as path from "node:path";
import { ApiError } from "../../core/errors.js";
import { P_ACTIVE } from "../../core/projectManager.js";
import { PLAN_ID_RE, PlanStore, type Plan } from "../../core/mentor/plan.js";
import * as store from "../../core/store.js";
import { chainSignalsOf, planChain, type ChainMonth } from "../../lib/planChain.js";
import { buildSchedule } from "../../lib/planSchedule.js";
import type { AppState } from "../appState.js";
import { dailyProjectDoneOf } from "./mentorProjects.js";

export interface ProjectLink {
  projectId: string;
  name: string;
  /** issues del proyecto y cuántos están hechos */
  issues: { total: number; done: number };
  /** el mes del plan que consolida */
  monthId: string;
}

const list = (xs: readonly string[]): string => xs.map((x) => `- ${x}`).join("\n");

/** La descripción del proyecto real: producto, hitos (con los temas que aplica cada uno) y definición de «hecho». */
export function projectDescription(m: ChainMonth): string {
  return [
    m.goal,
    "",
    "## Hitos (uno por semana)",
    list(m.weeks.map((w) => `Semana ${w.week} · ${w.milestone?.title ?? w.title}${w.milestone?.topics.length ? ` — aplica: ${w.milestone.topics.join(", ")}` : ""}`)),
    "",
    "## Se considera hecho cuando",
    list(m.criteria),
    "",
    `_Creado por el Mentor desde el entregable «${m.title}». Su avance sigue al de las piezas diarias del plan._`,
  ].join("\n");
}

export function mentorProjectLinksApi(app: AppState) {
  const linksPath = (planId: string): string => path.join(path.resolve(app.root), ".notevault", "mentor", "project-links", `${planId}.json`);
  const loadLinks = (planId: string): Record<string, string> => {
    const f = linksPath(planId);
    if (!fs.existsSync(f)) return {};
    const raw = store.loadJson(f, null) as Record<string, unknown> | null;
    return Object.fromEntries(Object.entries(raw ?? {}).filter(([k, v]) => /^mm:[\d-]+$/.test(k) && typeof v === "string")) as Record<string, string>;
  };
  const saveLinks = (planId: string, links: Record<string, string>): void => {
    fs.mkdirSync(path.dirname(linksPath(planId)), { recursive: true });
    store.writeJson(linksPath(planId), links);
  };
  const planOf = (opts: unknown): Plan => {
    const o = (opts && typeof opts === "object" ? opts : {}) as Record<string, unknown>;
    const id = String(o.planId ?? o.id ?? "");
    if (!PLAN_ID_RE.test(id)) throw new ApiError("Plan inválido.");
    const plan = new PlanStore(app.root).load(id);
    if (!plan) throw new ApiError("Ese plan ya no existe.");
    return plan;
  };
  const chainOf = (plan: Plan) => planChain(plan as never, buildSchedule(plan as never), chainSignalsOf(null, dailyProjectDoneOf(app.root, plan)));

  /** Los issues del proyecto real siguen a las piezas: lo hecho en la carpeta del proyecto diario pasa a la columna final. */
  function sync(month: ChainMonth, pid: string): { total: number; done: number } {
    const pm = app.mgrs().projects;
    const project = pm.get(pid);
    if (!project) return { total: 0, done: 0 };
    const issues = pm.issues(pid);
    const byMarker = new Map(issues.map((i) => [String(i.extra?.["mentor_id"] ?? ""), i]));
    for (const w of month.weeks) {
      const wi = byMarker.get(w.id);
      for (const p of w.pieces) {
        const it = byMarker.get(p.id);
        if (it && p.done && it.status !== project.done_column) pm.setIssueStatus(pid, it.id, project.done_column);
      }
      if (wi && w.status === "hecho" && wi.status !== project.done_column) pm.setIssueStatus(pid, wi.id, project.done_column);
    }
    const now = pm.issues(pid);
    return { total: now.length, done: now.filter((i) => i.status === project.done_column).length };
  }

  return {
    mentor_plan_project_links(opts: unknown): { links: Record<string, ProjectLink> } {
      const plan = planOf(opts);
      const saved = loadLinks(plan.id);
      if (!Object.keys(saved).length) return { links: {} };
      const chain = chainOf(plan);
      const pm = app.mgrs().projects;
      const out: Record<string, ProjectLink> = {};
      for (const [monthId, pid] of Object.entries(saved)) {
        const month = chain.months.find((m) => m.id === monthId);
        const project = pm.get(pid);
        if (!month || !project) continue; // el mes ya no existe o borraron el proyecto: no se enseña
        out[monthId] = { projectId: pid, name: project.name, issues: sync(month, pid), monthId };
      }
      return { links: out };
    },

    mentor_plan_project_create(opts: unknown): { link: ProjectLink; created: boolean } {
      const plan = planOf(opts);
      const o = (opts && typeof opts === "object" ? opts : {}) as Record<string, unknown>;
      const monthId = String(o.monthId ?? "");
      const month = chainOf(plan).months.find((m) => m.id === monthId);
      if (!month) throw new ApiError("Ese mes ya no está en el plan.");
      const pm = app.mgrs().projects;
      const saved = loadLinks(plan.id);
      const existing = saved[monthId] ? pm.get(saved[monthId]!) : null;
      if (existing) return { link: { projectId: existing.id, name: existing.name, issues: sync(month, existing.id), monthId }, created: false };

      const project = pm.create(month.title, { description: projectDescription(month), start: month.start, deadline: month.dueDate, status: P_ACTIVE });
      for (const w of month.weeks) {
        const wi = pm.createIssue(project.id, `Semana ${w.week} · ${w.milestone?.title ?? w.title}`, { due: w.dueDate, description: `${w.description}\n\n${w.slice}`, extra: { mentor_id: w.id } });
        if (!wi) continue;
        for (const p of w.pieces) pm.createIssue(project.id, p.title, { parent: wi.id, due: p.date, estimate_min: 60, description: p.description, extra: { mentor_id: p.id } });
      }
      saveLinks(plan.id, { ...saved, [monthId]: project.id });
      return { link: { projectId: project.id, name: project.name, issues: sync(month, project.id), monthId }, created: true };
    },
  };
}
