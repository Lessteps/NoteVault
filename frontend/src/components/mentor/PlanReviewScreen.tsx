// Pantalla de revisión de una nueva área o sub-asignatura añadida al plan.
// Muestra objetivo, temas añadidos, posibles duplicados, impacto en el ritmo y las tres salidas:
// 1. «Conservar» (marca resuelta)
// 2. «Ajustar» (opciones para ampliar fecha, ajustar tiempo o ruta)
// 3. «Quitar del plan» (elimina del plan sin tocar las notas de la vault)

import { AlertTriangle, ArrowLeft, Check, Copy, Trash2 } from "lucide-react";
import { useState } from "react";
import { api } from "../../lib/bridge";
import type { PlanReview, MentorPlan } from "../../lib/types";
import { useApp } from "../../store/app";
import { GhostButton, PrimaryButton } from "../common/forms";

export function PlanReviewScreen({
  plan,
  review,
  onResolved,
  onClose,
}: {
  plan: MentorPlan;
  review: PlanReview;
  onResolved: (updatedPlan: MentorPlan) => void;
  onClose: () => void;
}) {
  const toast = useApp((s) => s.toast);
  const [busy, setBusy] = useState(false);
  const [objective, setObjective] = useState(review.objective || "");
  const [showAdjust, setShowAdjust] = useState(false);

  const handleKeep = async () => {
    setBusy(true);
    try {
      const res = await api.mentorPlanReviewResolve({
        planId: plan.id,
        reviewId: review.id,
        action: "keep",
        objective: objective.trim() || undefined,
      });
      toast("info", "Revisión completada: se conserva en tu plan.");
      onResolved(res.plan || plan);
      onClose();
    } catch (err: any) {
      toast("error", err?.message || "Error al confirmar.");
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    const ok = window.confirm("Se quita del plan. Las notas siguen en tu vault: nada se borra. ¿Confirmas?");
    if (!ok) return;

    setBusy(true);
    try {
      const res = await api.mentorPlanReviewResolve({
        planId: plan.id,
        reviewId: review.id,
        action: "remove",
      });
      toast("info", "Se quitó del plan. Nada fue borrado de tu vault.");
      onResolved(res.plan || plan);
      onClose();
    } catch (err: any) {
      toast("error", err?.message || "Error al quitar del plan.");
    } finally {
      setBusy(false);
    }
  };

  const handleApplyFix = async (fix: any) => {
    setBusy(true);
    try {
      let ops: any[] = [];
      if (fix.kind === "extend_to" && fix.date) {
        ops = [{ op: "extend_to", date: fix.date }];
      } else if (fix.kind === "raise_minutes" && fix.minutes) {
        ops = [{ op: "raise_minutes", minutes: fix.minutes }];
      } else if (fix.kind === "trim_to_fit") {
        ops = [{ op: "trim_to_fit" }];
      }
      if (ops.length) {
        const changeRes = await api.mentorPlanChange({
          id: plan.id,
          ops,
          label: `Ajuste para dar cabida a ${review.subplanName}`,
        });
        if (!changeRes.loading && changeRes.applied) {
          await api.mentorPlanReviewResolve({
            planId: plan.id,
            reviewId: review.id,
            action: "keep",
          });
          toast("info", "Plan ajustado y revisión completada.");
          onResolved(changeRes.plan);
          onClose();
          return;
        }
      }
      toast("info", "Revisa la pestaña de ruta para afinar los temas.");
    } catch (err: any) {
      toast("error", err?.message || "Error al aplicar el ajuste.");
    } finally {
      setBusy(false);
    }
  };

  const impact = review.impact;

  return (
    <div className="flex h-full flex-col overflow-y-auto p-6" data-testid="plan-review-screen">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        {/* Cabecera */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line p-2 text-dim hover:bg-hover hover:text-text"
            title="Volver"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <span className="text-[12px] font-semibold uppercase tracking-wider text-accent-text">
              {review.kind === "area" ? "Revisar nueva área" : "Revisar asignatura"}
            </span>
            <h1 className="text-[20px] font-bold text-text">{review.subplanName}</h1>
          </div>
        </div>

        {/* Resumen de origen y objetivo */}
        <div className="rounded-xl border border-line bg-card p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-dim">
            <span>Carpeta: <strong className="text-text font-mono">{review.folder}</strong></span>
            <span>Origen: <strong>{review.source === "auto" ? "Detección automática" : "Añadido manual"}</strong></span>
          </div>

          <div>
            <label className="block text-[12px] font-mono uppercase tracking-wider text-faint mb-1">
              Para qué la añado (objetivo)
            </label>
            <input
              type="text"
              value={objective}
              onChange={(e) => setObjective(e.target.value.slice(0, 200))}
              placeholder="Escribe el objetivo para esta materia en tu plan"
              className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-[13.5px] text-text outline-none focus:border-accent"
              data-testid="review-objective-input"
            />
          </div>
        </div>

        {/* Impacto en el ritmo */}
        {impact && (
          <div className="rounded-xl border border-line bg-card p-4 space-y-2">
            <h2 className="text-[15px] font-semibold text-text">Impacto en tu ritmo</h2>
            <p className="text-[13.5px] text-dim">
              Suma {impact.addedTopics} temas ({Math.round(impact.addedMinutes / 60)} h). Tu plan termina el{" "}
              <strong className="text-text">{impact.endDate}</strong> y pasa de{" "}
              <strong className="text-text">{Math.round(impact.weeklyMinutesBefore / 60)} h</strong> a{" "}
              <strong className="text-text">{Math.round(impact.weeklyMinutesAfter / 60)} h</strong> por semana.
            </p>

            {!impact.fits && (
              <div className="rounded-lg border border-warn/30 bg-warn/10 p-3 text-[13px] text-warn space-y-1">
                <div className="flex items-center gap-1.5 font-semibold">
                  <AlertTriangle size={15} /> No cabe en el periodo actual con tu ritmo actual
                </div>
                <p className="opacity-90">
                  Opciones: ampliar hasta el {impact.suggestedEnd || "la fecha sugerida"}, subir el tiempo diario o
                  dejar temas fuera de la ruta.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Posibles duplicados */}
        {review.duplicates && review.duplicates.length > 0 && (
          <div className="rounded-xl border border-line bg-card p-4 space-y-2">
            <h2 className="text-[15px] font-semibold text-text flex items-center gap-1.5 text-warn">
              <Copy size={16} /> Posibles temas duplicados detectados ({review.duplicates.length})
            </h2>
            <div className="divide-y divide-line rounded-lg border border-line bg-surface">
              {review.duplicates.map((d, i) => (
                <div key={i} className="p-2.5 text-[12.5px] flex items-center justify-between">
                  <div>
                    <strong className="text-text">{d.title}</strong>
                    <div className="text-[11px] text-dim">Añadido: {d.addedTopic}</div>
                  </div>
                  <div className="text-right text-[11px] text-dim">
                    Coincide con: <span className="font-mono text-text">{d.matchedTopic}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Temas añadidos */}
        <div className="rounded-xl border border-line bg-card p-4 space-y-2">
          <h2 className="text-[15px] font-semibold text-text">Temas incluidos ({review.added.length})</h2>
          <div className="max-h-48 overflow-y-auto rounded-lg border border-line bg-surface p-2 text-[12.5px] font-mono text-dim space-y-1">
            {review.added.map((f, i) => (
              <div key={i} className="truncate">• {f}</div>
            ))}
          </div>
        </div>

        {/* Opciones de ajuste si se activa */}
        {showAdjust && impact && impact.fixOptions && impact.fixOptions.length > 0 && (
          <div className="rounded-xl border border-accent bg-accent-soft p-4 space-y-2.5">
            <h3 className="text-[14px] font-semibold text-accent-text">Ajustes recomendados para dar cabida:</h3>
            <div className="space-y-2">
              {impact.fixOptions.map((opt, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg bg-card p-2.5 border border-line text-[13px]">
                  <span>{opt.label || opt.reason || opt.id}</span>
                  <PrimaryButton onClick={() => handleApplyFix(opt)} disabled={busy}>
                    Aplicar este ajuste
                  </PrimaryButton>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Salidas de acción */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <button
            type="button"
            onClick={handleRemove}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-danger/30 bg-danger/10 px-3.5 py-2 text-[13.5px] font-medium text-danger hover:bg-danger/20 disabled:opacity-50"
            data-testid="btn-remove-review"
          >
            <Trash2 size={15} /> Quitar del plan
          </button>

          <div className="flex items-center gap-2">
            {!showAdjust && impact?.fixOptions && impact.fixOptions.length > 0 && (
              <GhostButton onClick={() => setShowAdjust(true)} disabled={busy} data-testid="btn-show-adjust">
                Ajustar
              </GhostButton>
            )}

            <PrimaryButton onClick={handleKeep} disabled={busy} data-testid="btn-keep-review">
              <Check size={15} className="mr-1" /> Conservar
            </PrimaryButton>
          </div>
        </div>
      </div>
    </div>
  );
}
