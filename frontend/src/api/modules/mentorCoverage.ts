// Mentor — acciones sobre la REVISIÓN de cobertura guardada en el plan. (La ruta vive en mentor.ts: mentor_route, mentor_plan_route_set y mentor_plan_reduce.)
//  - mentor_plan_coverage_accept({ id, areaKey, title, accepted? }) -> { review }: marca (o desmarca) un faltante sugerido por la revisión como
//    PROPUESTA añadida al plan. No crea ninguna nota ni cambia los temas del plan.

import { ApiError } from "../../core/errors.js";
import { PLAN_ID_RE, PlanStore } from "../../core/mentor/plan.js";
import type { AppState } from "../appState.js";

const clean = (v: unknown, max: number): string => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export function mentorCoverageApi(app: AppState) {
  const planOf = (id: string) => {
    if (!PLAN_ID_RE.test(id)) throw new ApiError("Plan inválido.");
    const st = new PlanStore(app.root);
    const plan = st.load(id);
    if (!plan) throw new ApiError("Ese plan ya no existe.");
    return { st, plan };
  };

  return {
    mentor_plan_coverage_accept(opts: unknown) {
      const o = (opts && typeof opts === "object" ? opts : {}) as Record<string, any>;
      const { st, plan } = planOf(String(o.id ?? ""));
      const review = plan.coverageReview;
      if (!review) throw new ApiError("Este plan no tiene una revisión de cobertura.");
      const key = clean(o.areaKey, 60);
      const title = clean(o.title, 120);
      const accepted = o.accepted !== false;
      let found = false;
      const next = {
        ...review,
        areas: review.areas.map((a) =>
          a.key !== key
            ? a
            : {
                ...a,
                missing: a.missing.map((m) => {
                  if (m.title !== title) return m;
                  found = true;
                  const { accepted: _a, ...rest } = m;
                  return accepted ? { ...rest, accepted: true as const } : rest;
                }),
              },
        ),
      };
      if (!found) throw new ApiError("Ese faltante ya no está en la revisión.");
      const saved = st.save({ ...plan, coverageReview: next });
      return { review: saved.coverageReview ?? next };
    },
  };
}
