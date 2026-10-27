// Mentor — Mi plan: oferta de AÑADIR el área «Lógica de programación» a un plan por áreas que aún no la tiene.
//
// Es un área aparte (no es lenguaje ni conocimiento): entrena la resolución de problemas y las habilidades de entrevista, sin importar el lenguaje,
// con su propio árbol de temas, sus habilidades, su ruta y un reto diario por niveles. Aplica la operación determinista `add_area` (queda en el
// historial de «Preguntas y ajustes» y se puede deshacer). No toca nada hasta pulsar el botón.

import { Brain, FolderPlus, Layers } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../lib/bridge";
import type { MentorPlan } from "../../lib/types";
import { useApp } from "../../store/app";
import { GhostButton, PrimaryButton } from "../common/forms";
import { AddToPlanDialog } from "./AddToPlanDialog";
import { cn } from "../ui";

export const LOGIC_AREA_ID = "logic";
const COLD_RETRY_MS = 1500;
const COLD_RETRY_MAX = 40;

export function AddAreaBar({ plan, onApplied, announce }: { plan: MentorPlan; onApplied: (plan: MentorPlan, changed: string[]) => void; announce: (msg: string) => void }) {
  const toast = useApp((s) => s.toast);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState<string | undefined>();
  const [candidates, setCandidates] = useState<Array<{ folder: string; label: string; topicCount: number; estMinutes: number }>>([]);

  useEffect(() => {
    if (plan.id) {
      api.mentorPlanFolderCandidates({ planId: plan.id })
        .then((res) => setCandidates(res.candidates || []))
        .catch(() => {});
    }
  }, [plan.id]);

  const logicOffered = plan.structure === "areas" && !plan.archived && !plan.proposed && !plan.subplans.some((s) => s.areaId === LOGIC_AREA_ID);
  const hasCandidates = candidates.length > 0;

  if (!logicOffered && !hasCandidates) return null;

  const addLogic = async (): Promise<void> => {
    setBusy(true);
    setNote("");
    try {
      const body = { id: plan.id, ops: [{ op: "add_area", areaId: LOGIC_AREA_ID }], label: "Añadir el área Lógica de programación" };
      let r = await api.mentorPlanChange(body);
      for (let i = 0; r.loading && i < COLD_RETRY_MAX; i++) {
        await new Promise((ok) => setTimeout(ok, COLD_RETRY_MS));
        r = await api.mentorPlanChange(body);
      }
      if (r.loading) throw new Error("El índice de la vault tarda demasiado en estar listo. Inténtalo de nuevo en un momento.");
      if (!r.applied) {
        setNote(r.entry.summary || "No hay temas de lógica de programación en tu vault todavía: crea la rama «Programming Logic» y vuelve a intentarlo.");
        return;
      }
      const msg = "Área añadida: Lógica de programación entra en el plan con su ruta y su práctica diaria. Puedes deshacerlo en «Preguntas y ajustes».";
      toast("info", msg);
      announce(msg);
      onApplied(r.plan, r.entry.changed);
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const openForCandidate = (folder: string) => {
    setSelectedFolder(folder);
    setDialogOpen(true);
  };

  return (
    <>
      <section aria-labelledby="add-area-bar-h" data-testid="add-area-bar" className="rounded-xl border border-line bg-card px-4 py-3 space-y-3">
        {logicOffered && (
          <div data-testid="add-logic-area" className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Brain size={20} aria-hidden className="flex-none text-accent-text" />
            <div className="min-w-0 flex-1 basis-72">
              <h2 id="add-area-bar-h" className="text-[16px] font-semibold">Área disponible: Lógica de programación</h2>
              <p className="text-[14px] text-dim">
                Entrena la resolución de problemas y las habilidades de entrevista sin importar el lenguaje: patrones (mapas, dos punteros, recursión, grafos, programación dinámica…),
                en tres niveles de dificultad y con un problema realista cada día.
              </p>
              {note && <p role="status" className="mt-1 text-[14px] text-warn" data-testid="add-logic-note">{note}</p>}
            </div>
            <PrimaryButton large onClick={() => void addLogic()} disabled={busy} data-testid="add-logic-btn">Añadir al plan</PrimaryButton>
          </div>
        )}

        {hasCandidates && (
          <div className={cn("space-y-2", logicOffered && "border-t border-line pt-3")}>
            <div className="flex items-center gap-2 text-[14px] font-medium text-text">
              <FolderPlus size={16} className="text-accent-text" />
              <span>Temas disponibles en tu vault fuera del plan:</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {candidates.slice(0, 3).map((c) => (
                <button
                  key={c.folder}
                  type="button"
                  onClick={() => openForCandidate(c.folder)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-[12.5px] hover:border-accent hover:text-text transition-colors"
                >
                  <Layers size={13} className="text-dim" />
                  <strong>{c.label}</strong> ({c.topicCount} temas)
                  <span className="text-accent-text ml-1">Añadir →</span>
                </button>
              ))}
              <GhostButton onClick={() => { setSelectedFolder(undefined); setDialogOpen(true); }}>
                Ver todas las carpetas…
              </GhostButton>
            </div>
          </div>
        )}
      </section>

      <AddToPlanDialog
        plan={plan}
        open={dialogOpen}
        initialFolder={selectedFolder}
        onClose={() => setDialogOpen(false)}
        onAdded={(updatedPlan) => {
          onApplied(updatedPlan, []);
          setDialogOpen(false);
        }}
      />
    </>
  );
}
