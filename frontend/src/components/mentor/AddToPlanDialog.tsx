// Diálogo para añadir una carpeta de la vault al plan como área o sub-asignatura.
// 3 pasos: selección de carpeta -> propiedades (rol y objetivo) -> impacto en el ritmo y confirmación.

import { AlertCircle, CheckCircle2, ChevronRight, Folder, Layers, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../lib/bridge";
import { ROLE_LABEL, type FolderRoleKind } from "../../lib/folderRoles";
import type { ReviewImpact, MentorPlan } from "../../lib/types";
import { useApp } from "../../store/app";
import { Field, GhostButton, input, Modal, PrimaryButton } from "../common/forms";
import { cn } from "../ui";

interface Candidate {
  folder: string;
  label: string;
  role?: FolderRoleKind;
  objective?: string;
  topicCount: number;
  estMinutes: number;
}

export function AddToPlanDialog({
  plan,
  open,
  onClose,
  onAdded,
  initialFolder,
}: {
  plan: MentorPlan;
  open: boolean;
  onClose: () => void;
  onAdded: (updatedPlan: MentorPlan) => void;
  initialFolder?: string;
}) {
  const toast = useApp((s) => s.toast);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);

  // Form state
  const [folder, setFolder] = useState(initialFolder || "");
  const [mode, setMode] = useState<"area" | "subject">("area");
  const [subplanId, setSubplanId] = useState<string>(plan.subplans[0]?.id || "");
  const [name, setName] = useState("");
  const [objective, setObjective] = useState("");

  // Impact preview state
  const [previewing, setPreviewing] = useState(false);
  const [impact, setImpact] = useState<ReviewImpact | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setStep(1);
      setFolder(initialFolder || "");
      setImpact(null);
      return;
    }
    setLoadingCandidates(true);
    api.mentorPlanFolderCandidates({ planId: plan.id })
      .then((res) => {
        setCandidates(res.candidates || []);
        if (initialFolder) {
          const match = res.candidates?.find((c) => c.folder === initialFolder);
          if (match) {
            setFolder(match.folder);
            setName(match.label);
            if (match.role === "subject") setMode("subject");
            if (match.objective) setObjective(match.objective);
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoadingCandidates(false));
  }, [open, plan.id, initialFolder]);

  if (!open) return null;

  const handleSelectCandidate = (c: Candidate) => {
    setFolder(c.folder);
    setName(c.label);
    if (c.role === "subject") setMode("subject");
    else setMode("area");
    if (c.objective) setObjective(c.objective);
    setStep(2);
  };

  const handleGoToImpact = async () => {
    if (!folder.trim()) {
      toast("error", "Elige o escribe una carpeta.");
      return;
    }
    setPreviewing(true);
    try {
      const res = await api.mentorPlanFolderPreview({
        planId: plan.id,
        folder: folder.trim(),
        mode,
        subplanId: mode === "subject" ? subplanId : undefined,
        name: name.trim() || undefined,
        objective: objective.trim() || undefined,
      });
      setImpact(res.preview.impact);
      setWarnings(res.preview.warnings || []);
      setStep(3);
    } catch (err: any) {
      toast("error", err?.message || "No se pudo calcular el impacto.");
    } finally {
      setPreviewing(false);
    }
  };

  const handleConfirmAdd = async () => {
    setSubmitting(true);
    try {
      const res = await api.mentorPlanFolderAdd({
        planId: plan.id,
        folder: folder.trim(),
        mode,
        subplanId: mode === "subject" ? subplanId : undefined,
        name: name.trim() || undefined,
        objective: objective.trim() || undefined,
        source: "manual",
      });
      toast("info", `${mode === "area" ? "Área" : "Sub-asignatura"} añadida al plan.`);
      onAdded(res.plan);
      onClose();
    } catch (err: any) {
      toast("error", err?.message || "Error al añadir al plan.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title="Añadir al plan" onClose={onClose} width={580}>
      <div className="space-y-4">
        {/* Pasos */}
        <div className="flex items-center justify-between border-b border-line pb-2 text-[12px] font-medium text-dim">
          <span className={cn(step === 1 && "font-bold text-text")}>1. Carpeta</span>
          <ChevronRight size={14} className="text-line" />
          <span className={cn(step === 2 && "font-bold text-text")}>2. Propiedades</span>
          <ChevronRight size={14} className="text-line" />
          <span className={cn(step === 3 && "font-bold text-text")}>3. Impacto</span>
        </div>

        {/* Paso 1: Carpeta */}
        {step === 1 && (
          <div className="space-y-3">
            <p className="text-[13.5px] text-dim">
              Selecciona una carpeta de tu vault con temas para incorporar a tu plan de estudio:
            </p>

            <Field label="Ruta de la carpeta">
              <input
                type="text"
                value={folder}
                onChange={(e) => setFolder(e.target.value)}
                placeholder="Ej: Programación/DevOps o 5 Frontend/HTML"
                className={input}
                data-testid="input-folder-path"
              />
            </Field>

            <div className="space-y-1.5">
              <span className="text-[12px] font-semibold text-dim uppercase tracking-wider">
                Sugerencias detectadas en tu vault:
              </span>
              {loadingCandidates ? (
                <p className="text-[12.5px] text-dim">Buscando temas en tu vault…</p>
              ) : candidates.length === 0 ? (
                <p className="text-[12.5px] text-dim">No hay temas pendientes fuera del plan.</p>
              ) : (
                <div className="max-h-48 overflow-y-auto space-y-1 rounded-lg border border-line p-1">
                  {candidates.map((c) => (
                    <button
                      key={c.folder}
                      type="button"
                      onClick={() => handleSelectCandidate(c)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-[13px] hover:bg-hover",
                        folder === c.folder ? "bg-accent-soft text-accent-text font-medium" : "text-text",
                      )}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <Folder size={15} className="text-dim flex-none" />
                        <span className="truncate">{c.folder}</span>
                        {c.role && (
                          <span className="rounded bg-surface px-1.5 py-0.2 text-[10.5px] text-dim border border-line">
                            {ROLE_LABEL[c.role]}
                          </span>
                        )}
                      </div>
                      <span className="text-[11.5px] text-dim flex-none ml-2">
                        {c.topicCount} temas ({Math.round(c.estMinutes / 60)} h)
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <GhostButton onClick={onClose}>Cancelar</GhostButton>
              <PrimaryButton onClick={() => setStep(2)} disabled={!folder.trim()} data-testid="btn-next-step">
                Siguiente
              </PrimaryButton>
            </div>
          </div>
        )}

        {/* Paso 2: Propiedades */}
        {step === 2 && (
          <div className="space-y-3.5">
            <div>
              <span className="mb-1 block font-mono text-[10.5px] uppercase tracking-wider text-faint">
                ¿Qué es esta carpeta?
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMode("area")}
                  className={cn(
                    "flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors",
                    mode === "area" ? "border-accent bg-accent-soft text-accent-text" : "border-line bg-surface hover:bg-hover",
                  )}
                  data-testid="mode-area-btn"
                >
                  <div className="flex items-center gap-1.5 font-semibold text-[13.5px]">
                    <Layers size={16} /> Área nueva
                  </div>
                  <span className="text-[12px] opacity-80">Materia completa con sus propias sub-asignaturas y ruta.</span>
                </button>

                <button
                  type="button"
                  onClick={() => setMode("subject")}
                  className={cn(
                    "flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors",
                    mode === "subject" ? "border-accent bg-accent-soft text-accent-text" : "border-line bg-surface hover:bg-hover",
                  )}
                  data-testid="mode-subject-btn"
                >
                  <div className="flex items-center gap-1.5 font-semibold text-[13.5px]">
                    <Sparkles size={16} /> Sub-asignatura
                  </div>
                  <span className="text-[12px] opacity-80">Bloque dentro de un área que ya está en el plan.</span>
                </button>
              </div>
            </div>

            {mode === "subject" && (
              <Field label="Área de destino">
                <select
                  value={subplanId}
                  onChange={(e) => setSubplanId(e.target.value)}
                  className={cn(input, "cursor-pointer")}
                  data-testid="select-target-subplan"
                >
                  {plan.subplans.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.area}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            <Field label="Nombre visible">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nombre para el plan (opcional)"
                className={input}
                data-testid="input-name"
              />
            </Field>

            <Field label="Para qué la añado (objetivo)">
              <div className="relative">
                <textarea
                  value={objective}
                  onChange={(e) => setObjective(e.target.value.slice(0, 200))}
                  placeholder="Ej: Dominar contenedores para desplegar mis aplicaciones (máx 200 caracteres)"
                  rows={2}
                  className={cn(input, "resize-none")}
                  data-testid="textarea-objective"
                />
                <span className="absolute bottom-1.5 right-2 text-[10.5px] text-faint">
                  {objective.length}/200
                </span>
              </div>
            </Field>

            <div className="flex justify-between gap-2 pt-2">
              <GhostButton onClick={() => setStep(1)}>Atrás</GhostButton>
              <PrimaryButton onClick={handleGoToImpact} disabled={previewing}>
                {previewing ? "Calculando impacto…" : "Calcular impacto"}
              </PrimaryButton>
            </div>
          </div>
        )}

        {/* Paso 3: Impacto y Confirmación */}
        {step === 3 && impact && (
          <div className="space-y-4">
            <div className="rounded-xl border border-line bg-surface p-3.5 space-y-2">
              <h3 className="text-[14px] font-semibold flex items-center gap-1.5 text-text">
                {impact.fits ? (
                  <CheckCircle2 size={16} className="text-mint" />
                ) : (
                  <AlertCircle size={16} className="text-warn" />
                )}
                Impacto en tu ritmo
              </h3>

              <p className="text-[13.5px] text-dim">
                Suma {impact.addedTopics} temas ({Math.round(impact.addedMinutes / 60)} h). Tu plan termina el{" "}
                <strong className="text-text">{impact.endDate}</strong> y pasa de{" "}
                <strong className="text-text">{Math.round(impact.weeklyMinutesBefore / 60)} h</strong> a{" "}
                <strong className="text-text">{Math.round(impact.weeklyMinutesAfter / 60)} h</strong> por semana.
              </p>

              {!impact.fits && (
                <div className="mt-2 rounded-lg border border-warn/20 bg-warn/10 p-2.5 text-[12.5px] text-warn">
                  <p className="font-medium">No cabe en el periodo actual.</p>
                  <p className="mt-0.5 opacity-90">
                    Opciones: ampliar hasta el {impact.suggestedEnd || "la fecha sugerida"}, subir el tiempo diario o
                    dejar temas fuera de la ruta en la pantalla de revisión.
                  </p>
                </div>
              )}
            </div>

            {warnings.length > 0 && (
              <div className="rounded-lg border border-line bg-card p-2.5 text-[12px] text-dim space-y-1">
                {warnings.map((w, i) => (
                  <p key={i}>• {w}</p>
                ))}
              </div>
            )}

            <div className="flex justify-between gap-2 pt-2">
              <GhostButton onClick={() => setStep(2)}>Atrás</GhostButton>
              <PrimaryButton onClick={handleConfirmAdd} disabled={submitting} data-testid="btn-confirm-add">
                {submitting ? "Añadiendo…" : "Añadir al plan"}
              </PrimaryButton>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
