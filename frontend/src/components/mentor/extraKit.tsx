// Mentor — piezas compartidas de los TEMAS Y LA PRÁCTICA EXTRA del día: subir `planVersion` (recarga el plan en las vistas), la marca «Extra» con su
// acción de quitar y el helper que calcula «hoy» y el avance real para el ritmo diario. Las usan las páginas de Planeación y la Ejecución.

import { X } from "lucide-react";
import { api } from "../../lib/bridge";
import type { MentorPlan } from "../../lib/types";
import { useApp } from "../../store/app";
import { useMentor } from "../../store/mentor";
import { Chip } from "../common/forms";

/** Un cambio en el plan (ritmo, temas o práctica extra): las vistas que leen `planVersion` lo recargan. */
export const bumpPlanVersion = (): void => useMentor.setState((s) => ({ planVersion: s.planVersion + 1 }));

/** Quita un tema extra de un día y avisa a quien lo pidió. */
export async function removeExtraTopic(planId: string, date: string, folder: string, onChanged: (p: MentorPlan) => void): Promise<void> {
  try {
    const plan = await api.mentorPlanExtraTopicRemove({ id: planId, folder, date });
    onChanged(plan);
    bumpPlanVersion();
  } catch (e) {
    useApp.getState().toast("error", (e as Error).message);
  }
}

/** La marca «Extra» de un tema añadido a mano, con la × que lo quita de ese día. */
export function ExtraTag({ title, onRemove }: { title: string; onRemove?: () => void }) {
  return (
    <span className="inline-flex flex-none items-center gap-0.5" data-testid="extra-tag">
      <Chip large colour="var(--nv-accent)">Extra</Chip>
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`Quitar el tema extra ${title}`} title="Quitar este tema extra del día" className="grid h-7 w-7 place-items-center rounded-md text-dim hover:bg-hover hover:text-danger focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent" data-testid="extra-remove">
          <X size={14} aria-hidden />
        </button>
      )}
    </span>
  );
}
