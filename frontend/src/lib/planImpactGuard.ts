// La guarda de las acciones ESTRUCTURALES del chat (ver `planImpact.ts`): antes de añadir temas / áreas / espacios mira los planes del
// Mentor y, si alguno cambia, pide una confirmación explícita (Cancelar / Continuar). Renombrar o quitar un tema de una ruta se bloquea.
// Al terminar la acción, `commit()` anota el cambio en el historial del plan y sube `planVersion` para que el Mentor se refresque.

import { api } from "./bridge";
import { changeNote, confirmMessage, isLivePlan, planImpact, type ImpactTarget, type PlanImpact, type PlanLike, type StructuralKind } from "./planImpact";
import { useApp } from "../store/app";
import { useMentor } from "../store/mentor";
import { confirmAction } from "../components/ui";

export interface GuardDeps {
  /** los planes vivos, con sus rutas */
  loadPlans: () => Promise<PlanLike[]>;
  confirm: (title: string, message: string, label: string) => Promise<boolean>;
  note: (planId: string, comment: string, summary: string) => Promise<void>;
  bump: () => void;
  toast: (kind: "info" | "error", message: string) => void;
}

const sleep = (ms: number): Promise<void> => new Promise((ok) => setTimeout(ok, ms));

/** Los planes no archivados ni terminados, con sus subplanes (el índice del vault puede estar frío: se reintenta un poco). */
export async function loadLivePlans(): Promise<PlanLike[]> {
  const rows = (await api.mentorPlanList()).filter((r) => !r.archived && r.status !== "terminado" && r.status !== "propuesto");
  const out: PlanLike[] = [];
  for (const r of rows) {
    for (let attempt = 0; attempt < 6; attempt++) {
      const got = await api.mentorPlanGet(r.id);
      if (got.loading) {
        await sleep(400);
        continue;
      }
      if (got.plan) out.push({ id: r.id, name: got.plan.name || r.name, archived: got.plan.archived, status: r.status, subplans: got.plan.subplans });
      break;
    }
  }
  return out.filter(isLivePlan);
}

export const defaultGuardDeps: GuardDeps = {
  loadPlans: loadLivePlans,
  confirm: (title, message, label) => confirmAction(title, message, label),
  note: async (planId, comment, summary) => void (await api.assistantPlanNote(planId, comment, summary)),
  bump: () => useMentor.setState((s) => ({ planVersion: s.planVersion + 1 })),
  toast: (kind, message) => useApp.getState().toast(kind, message),
};

export interface GuardResult {
  /** ¿se puede ejecutar la acción? */
  ok: boolean;
  /** los planes que cambian (vacío = ninguno) */
  impacted: PlanImpact[];
  /** Se llama cuando la acción SE HIZO: anota en cada plan afectado y sube `planVersion`. Nunca lanza. */
  commit: () => Promise<void>;
}

const NOTHING: GuardResult = { ok: true, impacted: [], commit: async () => undefined };

/**
 * Antes de una acción estructural. Sin planes afectados deja pasar sin preguntar. Con impacto:
 *  - renombrar / quitar / mover un tema de la ruta -> avisa y NO deja (ahí manda el Mentor);
 *  - añadir -> diálogo «Esta acción cambia la ruta del plan…», solo sigue con «Continuar».
 */
export async function guardStructural(kind: StructuralKind, target: ImpactTarget, label: string, deps: GuardDeps = defaultGuardDeps): Promise<GuardResult> {
  let plans: PlanLike[];
  try {
    plans = await deps.loadPlans();
  } catch {
    return NOTHING; // sin poder leer los planes no hay nada que proteger ni que anotar
  }
  const res = planImpact(kind, target, plans);
  if (!res.impacted.length) return NOTHING;
  if (res.blocked) {
    deps.toast("error", res.reason);
    return { ok: false, impacted: res.impacted, commit: async () => undefined };
  }
  const go = await deps.confirm("Esta acción cambia la ruta de tu plan", confirmMessage(kind, res.impacted), "Continuar");
  if (!go) return { ok: false, impacted: res.impacted, commit: async () => undefined };
  return {
    ok: true,
    impacted: res.impacted,
    commit: async () => {
      for (const i of res.impacted) {
        try {
          const n = changeNote(kind, label, i);
          await deps.note(i.planId, n.comment, n.summary);
        } catch {
          /* la bitácora es informativa: si falla, la acción ya se hizo */
        }
      }
      deps.bump();
    },
  };
}
