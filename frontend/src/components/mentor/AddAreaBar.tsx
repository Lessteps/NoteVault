// Mentor — Mi plan: oferta de AÑADIR el área «Lógica de programación» a un plan por áreas que aún no la tiene.
//
// Es un área aparte (no es lenguaje ni conocimiento): entrena la resolución de problemas y las habilidades de entrevista, sin importar el lenguaje,
// con su propio árbol de temas, sus habilidades, su ruta y un reto diario por niveles. Aplica la operación determinista `add_area` (queda en el
// historial de «Preguntas y ajustes» y se puede deshacer). No toca nada hasta pulsar el botón.

import { Brain } from "lucide-react";
import { useState } from "react";
import { api } from "../../lib/bridge";
import type { MentorPlan } from "../../lib/types";
import { useApp } from "../../store/app";
import { GhostButton, PrimaryButton } from "../common/forms";

export const LOGIC_AREA_ID = "logic";
const COLD_RETRY_MS = 1500;
const COLD_RETRY_MAX = 40;

export function AddAreaBar({ plan, onApplied, announce }: { plan: MentorPlan; onApplied: (plan: MentorPlan, changed: string[]) => void; announce: (msg: string) => void }) {
  const toast = useApp((s) => s.toast);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const offered = plan.structure === "areas" && !plan.archived && !plan.proposed && !plan.subplans.some((s) => s.areaId === LOGIC_AREA_ID);
  if (!offered) return null;

  const add = async (): Promise<void> => {
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

  return (
    <section aria-labelledby="add-logic-h" data-testid="add-logic-area" className="rounded-xl border border-line bg-card px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Brain size={20} aria-hidden className="flex-none text-accent-text" />
        <div className="min-w-0 flex-1 basis-72">
          <h2 id="add-logic-h" className="text-[16px] font-semibold">Área disponible: Lógica de programación</h2>
          <p className="text-[14px] text-dim">
            Entrena la resolución de problemas y las habilidades de entrevista sin importar el lenguaje: patrones (mapas, dos punteros, recursión, grafos, programación dinámica…),
            en tres niveles de dificultad y con un problema realista cada día. Tiene su propia ruta, sus habilidades y su práctica diaria.
          </p>
          {note && <p role="status" className="mt-1 text-[14px] text-warn" data-testid="add-logic-note">{note}</p>}
        </div>
        <PrimaryButton large onClick={() => void add()} disabled={busy} data-testid="add-logic-btn">Añadir al plan</PrimaryButton>
        <GhostButton large onClick={() => announce("Puedes añadirla cuando quieras desde esta misma tarjeta.")} aria-label="Ahora no">Ahora no</GhostButton>
      </div>
    </section>
  );
}
