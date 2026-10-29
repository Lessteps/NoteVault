// Mentor — LO NUEVO DE LA VAULT ENTRA SOLO: al abrir un plan, al cambiar la vault por fuera (Antigravity, git…) o al cambiar el plan, la app mira si hay temas de las
// áreas de referencia (HTML, CSS, JavaScript Reference → Frontend; Java → Java) que no están en el plan y los añade con su asignatura, ya organizados; Ejecución y
// Planeación los enseñan sin que nadie lo pida. Lo que la persona quitó a mano no vuelve (el servidor recuerda lo ya ofrecido). No depende de ninguna IA.

import { useEffect, useRef } from "react";
import { api } from "../../lib/bridge";
import type { MentorPlan } from "../../lib/types";
import { useApp } from "../../store/app";
import { useMentor } from "../../store/mentor";

export function useAutoSync(plan: MentorPlan | null | undefined, onChanged: (p: MentorPlan) => void): void {
  const tried = useRef(new Set<string>());
  const version = useMentor((s) => s.planVersion);
  useEffect(() => {
    if (!plan || plan.archived || plan.proposed) return;
    const key = `${plan.id}:${plan.updatedAt ?? ""}:${version}`;
    if (tried.current.has(key)) return;
    tried.current.add(key);
    let live = true;
    void (async () => {
      try {
        let r = await api.mentorPlanSyncReference({ planId: plan.id });
        for (let i = 0; r.loading && i < 40 && live; i++) {
          await new Promise((ok) => setTimeout(ok, 1500));
          r = await api.mentorPlanSyncReference({ planId: plan.id });
        }
        if (!live || r.loading) return;
        if (!r.added.length) {
          // nada nuevo, pero la app ordenó lo que ya había (asignaturas del índice y orden por números)
          if (r.tidied && r.plan) {
            tried.current.add(`${r.plan.id}:${r.plan.updatedAt ?? ""}:${version}`);
            onChanged(r.plan);
            useApp.getState().toast("info", "Se ordenaron los temas del plan en sus asignaturas, por números.");
            useMentor.setState((st) => ({ planVersion: st.planVersion + 1 }));
          }
          return;
        }
        if (r.plan) {
          tried.current.add(`${r.plan.id}:${r.plan.updatedAt ?? ""}:${version}`);
          onChanged(r.plan);
        }
        useApp.getState().toast("info", `${r.added.length === 1 ? "Entró 1 tema nuevo" : `Entraron ${r.added.length} temas nuevos`} de la vault al plan (en su asignatura y ya organizados).`);
        useMentor.setState((st) => ({ planVersion: st.planVersion + 1 }));
      } catch {
        /* «Verificar áreas faltantes» y «Agregar nuevos temas» siguen ahí para hacerlo a mano */
      }
    })();
    return () => {
      live = false;
    };
  }, [plan, version, onChanged]);
}
