// Mentor — «Verificar áreas faltantes»: junto a «Analizar el plan». Compara las áreas del plan con las áreas estándar (Backend, Databases, Frontend…)
// y con las carpetas de tu vault que tienen temas y no están en el plan. Cada hueco se puede añadir con un clic (operación del plan, con historial y
// «Deshacer»); si no hay temas todavía, lo dice y deja el prompt para que cualquier IA lo proponga. Todo es a mano o con reglas: no requiere IA local.

import { ClipboardCopy, Layers, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/bridge";
import { copyText } from "../../lib/clipboard";
import { areasReviewPrompt } from "../../lib/methodologyScope";
import { AREA_DEFS } from "../../lib/planAreas";
import type { MentorPlan } from "../../lib/types";
import { useApp } from "../../store/app";
import { GhostButton, Modal } from "../common/forms";

interface Candidate { folder: string; label: string; topicCount: number; estMinutes: number }

export function AreasCheckButton({ plan, onPlan, announce, className }: { plan: MentorPlan; onPlan: (p: MentorPlan) => void; announce?: (m: string) => void; className?: string }) {
  const toast = useApp((s) => s.toast);
  const [open, setOpen] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");

  const inPlan = new Set(plan.subplans.map((s) => s.areaId).filter(Boolean));
  const missing = AREA_DEFS.filter((a) => !inPlan.has(a.id));

  const loadCandidates = useCallback(() => {
    api.mentorPlanFolderCandidates({ planId: plan.id }).then((r) => setCandidates((r.candidates as Candidate[]) ?? [])).catch(() => setCandidates([]));
  }, [plan.id]);
  useEffect(() => {
    if (open) loadCandidates();
  }, [open, loadCandidates]);

  const apply = async (key: string, op: Record<string, unknown>, label: string): Promise<void> => {
    setBusy(key);
    setNote("");
    try {
      const body = { id: plan.id, ops: [op], label };
      let r = await api.mentorPlanChange(body);
      for (let i = 0; r.loading && i < 40; i++) {
        await new Promise((ok) => setTimeout(ok, 1500));
        r = await api.mentorPlanChange(body);
      }
      if (r.loading) throw new Error("El índice de la vault tarda demasiado en estar listo. Inténtalo de nuevo en un momento.");
      if (!r.applied) {
        setNote(r.entry.summary || "No hay temas pendientes para añadir ahí: créalos primero (Verificar metodología) y vuelve.");
        return;
      }
      onPlan(r.plan);
      toast("info", `${label}. Puedes deshacerlo en «Preguntas y ajustes».`);
      announce?.(`${label}.`);
      loadCandidates();
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  const copy = async (): Promise<void> => {
    const ok = await copyText(areasReviewPrompt(plan.subplans.map((s) => ({ name: s.area, topics: s.topics.length })), candidates.map((c) => ({ label: c.label, topics: c.topicCount }))));
    toast(ok ? "info" : "error", ok ? "Prompt copiado: pégalo en tu IA." : "No se pudo copiar el prompt.");
  };

  return (
    <>
      <GhostButton large onClick={() => setOpen(true)} aria-expanded={open} data-testid="exec-areas-check" title="Qué áreas faltan en el plan frente a las áreas estándar y a tu vault">
        <Layers size={16} aria-hidden className={className ?? "flex-none"} /> Verificar áreas faltantes
      </GhostButton>
      {open && (
        <Modal title="Verificar áreas faltantes" onClose={() => setOpen(false)} width={680}>
          <p className="text-[14px] text-dim">El plan tiene {plan.subplans.length} {plan.subplans.length === 1 ? "área" : "áreas"}: {plan.subplans.map((s) => s.area).join(", ") || "ninguna"}. Esto es lo que falta.</p>
          {note && <p role="status" className="rounded-lg border border-line bg-surface px-3 py-2 text-[14px]" data-testid="areas-check-note">{note}</p>}

          <section aria-label="Áreas estándar que faltan" className="space-y-1.5" data-testid="areas-check-standard">
            <h4 className="text-[13px] font-semibold uppercase tracking-wider text-faint">Áreas estándar que no están en el plan</h4>
            {missing.length === 0 && <p className="text-[14px] text-dim">Todas las áreas estándar ya están en el plan.</p>}
            {missing.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line px-3 py-2" data-testid="areas-check-missing" data-area={a.id}>
                <span className="min-w-0 flex-1 basis-48">
                  <span className="block text-[14px] font-semibold text-text">{a.name}</span>
                  <span className="block text-[13px] text-dim">{a.objective}</span>
                </span>
                <GhostButton disabled={!!busy} onClick={() => void apply(`a:${a.id}`, { op: "add_area", areaId: a.id }, `Área ${a.name} añadida al plan`)} data-testid={`areas-check-add-${a.id}`}>
                  <Plus size={14} aria-hidden /> Añadir al plan
                </GhostButton>
              </div>
            ))}
          </section>

          <section aria-label="Carpetas de la vault fuera del plan" className="space-y-1.5" data-testid="areas-check-folders">
            <h4 className="text-[13px] font-semibold uppercase tracking-wider text-faint">Carpetas de tu vault con temas que no están en el plan</h4>
            {candidates.length === 0 && <p className="text-[14px] text-dim">No hay carpetas con temas pendientes fuera del plan.</p>}
            {candidates.map((c) => (
              <div key={c.folder} className="flex flex-wrap items-center gap-2 rounded-lg border border-line px-3 py-2" data-testid="areas-check-folder">
                <span className="min-w-0 flex-1 basis-48">
                  <span className="block break-words text-[14px] font-semibold text-text">{c.label}</span>
                  <span className="block text-[13px] text-dim">{c.topicCount} {c.topicCount === 1 ? "tema" : "temas"} · ≈ {c.estMinutes} min</span>
                </span>
                <GhostButton disabled={!!busy} onClick={() => void apply(`f:${c.folder}`, { op: "add_folder_area", folder: c.folder }, `«${c.label}» añadida como área`)}>
                  <Plus size={14} aria-hidden /> Añadir como área
                </GhostButton>
              </div>
            ))}
          </section>

          <div className="flex flex-wrap gap-2 border-t border-line pt-3">
            <GhostButton large="md" onClick={() => void copy()} data-testid="areas-check-copy">
              <ClipboardCopy size={15} aria-hidden /> Copiar prompt de revisión de áreas
            </GhostButton>
          </div>
          <p className="text-[12.5px] text-faint">Para ver qué temas faltan DENTRO de cada área (un tema por elemento o propiedad), usa «Verificar metodología» en la lista de temas.</p>
        </Modal>
      )}
    </>
  );
}
