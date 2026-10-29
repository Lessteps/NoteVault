// Mentor — ORGANIZAR SOLO: si el plan tiene temas de referencia fuera de orden (o genéricos antiguos por jubilar), la app lo organiza una vez, por números e ids, sin que
// nadie lo pida. Se queda en el historial del plan y se puede deshacer. Una vez por versión del plan: si no cambia nada, no insiste.

import { useEffect, useRef } from "react";
import { api } from "../../lib/bridge";
import { planNeedsOrganize } from "../../lib/planOrganize";
import type { MentorPlan } from "../../lib/types";
import { useApp } from "../../store/app";

export function useAutoOrganize(plan: MentorPlan | null | undefined, onChanged: (p: MentorPlan) => void): void {
  const tried = useRef(new Set<string>());
  useEffect(() => {
    if (!plan || plan.archived || plan.proposed) return;
    const key = `${plan.id}:${plan.updatedAt ?? ""}`;
    if (tried.current.has(key) || !planNeedsOrganize(plan)) return;
    tried.current.add(key);
    let live = true;
    void (async () => {
      try {
        const body = { id: plan.id, ops: [{ op: "organize" }], label: "Organizar el plan automáticamente (por números e ids)" };
        let r = await api.mentorPlanChange(body);
        for (let i = 0; r.loading && i < 40 && live; i++) {
          await new Promise((ok) => setTimeout(ok, 1500));
          r = await api.mentorPlanChange(body);
        }
        if (!live || r.loading || !r.applied) return;
        tried.current.add(`${r.plan.id}:${r.plan.updatedAt ?? ""}`);
        onChanged(r.plan);
        useApp.getState().toast("info", "Organicé el plan por números e ids (el tema general y luego sus piezas, repartido en semanas). Puedes deshacerlo en «Preguntas y ajustes».");
      } catch {
        /* se puede lanzar a mano desde «Verificar metodología» */
      }
    })();
    return () => {
      live = false;
    };
  }, [plan, onChanged]);
}
