import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { api } from "../../lib/bridge";
import { evaluateAreaMethodology, type SubjectMethodologyWarning } from "../../lib/planAreas";
import type { MentorPlan, MentorSubplan } from "../../lib/types";
import { PrimaryButton } from "../common/forms";
import { MethodologyCheckButton } from "./MethodologyCheck";

export function MethodologyWarningBanner({
  plan,
  subplan,
  onChanged,
  announce,
}: {
  plan: MentorPlan;
  subplan?: MentorSubplan | null;
  onChanged: (p: MentorPlan) => void;
  announce?: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [fixed, setFixed] = useState(false);

  // Evaluar metodología en el subplan actual (o en todos los subplans si no hay subplan específico)
  const targets = subplan ? [subplan] : plan.subplans;
  const warnings: Array<{ sub: MentorSubplan; w: SubjectMethodologyWarning }> = [];
  for (const s of targets) {
    const list = evaluateAreaMethodology(s);
    for (const w of list) warnings.push({ sub: s, w });
  }

  if (warnings.length === 0) return null;

  const handleFix = async (subId: string) => {
    setBusy(true);
    try {
      const res = await api.mentorPlanFixMethodology({ planId: plan.id, subplanId: subId });
      onChanged(res.plan);
      setFixed(true);
      announce?.("Metodología corregida: asignaturas y temas incorporados.");
    } catch (err: any) {
      announce?.(err?.message || "Error al corregir metodología.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="region"
      aria-label="Aviso metodológico"
      data-testid="methodology-warning-banner"
      className="space-y-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-text"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 flex-none text-amber-500" size={20} />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-[15px] font-bold text-amber-400">
              Aviso Metodológico en {subplan ? subplan.area : "el Plan de Estudio"}
            </h4>
            <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-300">
              {warnings.length} {warnings.length === 1 ? "observación" : "observaciones"}
            </span>
          </div>

          <div className="space-y-3">
            {warnings.map(({ sub, w }) => (
              <div
                key={`${sub.id}-${w.groupId}`}
                className="space-y-1.5 rounded-xl border border-line bg-card/60 p-3"
                data-testid={`methodology-warning-${w.groupId}`}
              >
                <div className="text-[14px] font-semibold text-text">{w.title}</div>
                <p className="text-[13px] text-dim">{w.description}</p>
                <div className="flex flex-wrap items-center gap-2 pt-2">
                  <MethodologyCheckButton
                    scope={{ kind: "group", label: w.groupTitle, areaName: sub.area, groupId: w.groupId, groupTitle: w.groupTitle }}
                    topics={sub.topics.filter((t) => t.group === w.groupId).map((t) => ({ folder: t.folder, title: t.title, group: t.group }))}
                    label={`Ver qué falta de ${w.groupTitle} y crearlo`}
                    testid={`btn-check-methodology-${w.groupId}`}
                    planId={plan.id}
                  />
                  <PrimaryButton
                    large
                    disabled={busy || fixed}
                    onClick={() => void handleFix(sub.id)}
                    data-testid={`btn-fix-methodology-${w.groupId}`}
                  >
                    {fixed ? (
                      <>
                        <CheckCircle2 size={15} /> Estructura preparada
                      </>
                    ) : (
                      `Preparar la asignatura ${w.groupTitle} (estructura)`
                    )}
                  </PrimaryButton>
                </div>
                <p className="text-[12.5px] text-faint">«Preparar» solo crea la asignatura y reordena lo que ya tienes: no genera contenido. Para crear un tema por elemento o propiedad, usa «Ver qué falta» (funciona con Antigravity, sin IA local).</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
