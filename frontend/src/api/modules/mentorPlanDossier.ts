// «Preguntar y ajustar» con OTRA IA (Antigravity, un chat) sin la app abierta: `mentor_plan_dossier` escribe en la vault un archivo con TODO el plan (áreas, temas por
// semana, cadena de proyectos con su avance, cambios recientes) y la pregunta, y devuelve la frase corta para pegar. La IA responde en un archivo al lado; si propone
// cambios, los pone en un bloque json que la app valida al pegarlo (`lib/planDossier.ts`). No usa la IA de la app ni cambia el plan.

import * as fs from "node:fs";
import * as path from "node:path";
import { ApiError } from "../../core/errors.js";
import { PLAN_ID_RE, PlanStore } from "../../core/mentor/plan.js";
import { ChangeStore } from "../../core/mentor/planChange.js";
import { chainSignalsOf, planChain } from "../../lib/planChain.js";
import { buildDossier, type DossierPlan } from "../../lib/planDossier.js";
import { buildSchedule, progressPlan } from "../../lib/planSchedule.js";
import { localDateOf } from "../../core/mentor/practiceState.js";
import type { AppState } from "../appState.js";
import { dailyProjectDoneOf } from "./mentorProjects.js";

const slug = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "plan";
const stamp = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}_${String(d.getHours()).padStart(2, "0")}-${String(d.getMinutes()).padStart(2, "0")}`;

export function mentorPlanDossierApi(app: AppState, hooks: { now?: () => Date } = {}) {
  return {
    mentor_plan_dossier(opts: unknown): { rel: string; abs: string; answerRel: string; answerAbs: string; shortPrompt: string; topics: number } {
      const o = (opts && typeof opts === "object" ? opts : {}) as Record<string, unknown>;
      const id = String(o.id ?? o.planId ?? "");
      if (!PLAN_ID_RE.test(id)) throw new ApiError("Plan inválido.");
      const plan = new PlanStore(app.root).load(id);
      if (!plan) throw new ApiError("Ese plan ya no existe.");
      const question = String(o.question ?? "").replace(/\s+/g, " ").trim().slice(0, 1500);
      const now = (hooks.now ?? (() => new Date()))();
      const space = plan.subplans.flatMap((s) => s.topics)[0]?.folder.split("/")[0] ?? "Programación";
      const base = `${stamp(now)}_${slug(plan.name ?? plan.id)}`;
      const dir = path.join(app.root, space, "_handoff", "preguntas");
      const file = path.join(dir, `${base}.md`);
      const answer = path.join(dir, `${base}_respuesta.md`);
      const dossierPlan: DossierPlan = {
        id: plan.id,
        ...(plan.name ? { name: plan.name } : {}),
        start: plan.start,
        end: plan.end,
        ...(plan.hoursPerWeek ? { hoursPerWeek: plan.hoursPerWeek } : {}),
        ...(plan.preconditions?.minutesPerDay ? { minutesPerDay: plan.preconditions.minutesPerDay } : {}),
        ...(plan.preconditions?.studyDays ? { studyDays: plan.preconditions.studyDays as number[] } : {}),
        ...(plan.areaMode ? { areaMode: plan.areaMode } : {}),
        ...(plan.areaModeWhy ? { areaModeWhy: plan.areaModeWhy } : {}),
        areas: plan.subplans.map((s) => ({
          id: s.id,
          area: s.area,
          objective: s.objective,
          ...(s.phase ? { phase: s.phase } : {}),
          ...(s.groups ? { groups: s.groups.map((g) => ({ id: g.id, title: g.title })) } : {}),
          topics: s.topics.map((t) => ({ folder: t.folder, title: t.title, targetWeek: t.targetWeek, estMinutes: t.estMinutes, ...(t.group ? { group: t.group } : {}), ...(t.route ? { route: t.route } : {}), ...(t.completedAt ? { completedAt: t.completedAt } : {}) })),
        })),
        ...(plan.openQuestions?.length ? { openQuestions: plan.openQuestions.map((q) => ({ id: q.id, text: (q as { text?: string }).text ?? "" })) } : {}),
      };
      let chain: ReturnType<typeof planChain>["months"] = [];
      try {
        chain = planChain(plan as never, buildSchedule(progressPlan(plan as never, { today: localDateOf(new Date()) })), chainSignalsOf(null, dailyProjectDoneOf(app.root, plan))).months;
      } catch {
        /* planes sin cadena de proyectos: el dosier sigue siendo útil */
      }
      const changes = new ChangeStore(app.root).list(plan.id).map((c) => ({ n: c.n, at: c.at, comment: c.comment, summary: c.summary ?? "", status: c.status }));
      const md = buildDossier({ plan: dossierPlan, question, answerAbs: answer, chain, changes, today: now.toISOString().slice(0, 10) });
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, md, "utf-8");
      const rel = (p: string): string => path.relative(app.root, p).split(path.sep).join("/");
      const shortPrompt = `NEW TASK — ignore everything we discussed before in this conversation. Read \`${file}\` completely: it is a study plan dossier with a question. Answer the question using ONLY the data in that file and write your answer to \`${answer}\`. Do NOT modify the NoteVault app, the vault or any setting, and do not run commands other than reading files.`;
      return { rel: rel(file), abs: file, answerRel: rel(answer), answerAbs: answer, shortPrompt, topics: dossierPlan.areas.reduce((n, a) => n + a.topics.length, 0) };
    },
  };
}
