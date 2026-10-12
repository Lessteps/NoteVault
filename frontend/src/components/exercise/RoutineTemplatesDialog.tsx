// Diálogo selector de plantillas de rutina clásicas predefinidas.

import { Dumbbell } from "lucide-react";
import { Modal, PrimaryButton, GhostButton } from "../common/forms";
import { ROUTINE_TEMPLATES, type RoutineTemplate } from "../../lib/routineTemplates";

export function RoutineTemplatesDialog({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (template: RoutineTemplate) => void;
}) {
  if (!open) return null;

  return (
    <Modal title="Plantillas de rutina predefinidas" onClose={onClose} width={580}>
      <p className="mb-3 text-[12.5px] text-faint">
        Carga una división clásica probada con ejercicios, series y descansos ya configurados.
      </p>
      <div className="space-y-3">
        {ROUTINE_TEMPLATES.map((t) => (
          <div
            key={t.id}
            data-template-card={t.id}
            className="flex flex-col gap-2 rounded-xl border border-line bg-card p-3.5 transition-colors hover:border-line-strong"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 text-[14px] font-semibold text-text">
                  <Dumbbell size={15} className="text-amber-500" /> {t.name}
                </div>
                <span className="mt-0.5 inline-block rounded-full bg-elevated px-2 py-0.5 text-[10.5px] font-medium text-dim">
                  {t.badge}
                </span>
              </div>
              <PrimaryButton
                data-load-template={t.id}
                className="flex-none px-3 py-1 text-[12px]"
                onClick={() => {
                  onSelect(t);
                  onClose();
                }}
              >
                Cargar plantilla
              </PrimaryButton>
            </div>
            <p className="text-[12px] leading-relaxed text-dim">{t.description}</p>
            <div className="flex flex-wrap gap-1.5 border-t border-line/60 pt-1.5">
              {Object.entries(t.days).map(([day, exs]) => (
                <span
                  key={day}
                  className="rounded-md border border-line/50 bg-surface px-1.5 py-0.5 text-[10.5px] font-mono text-faint"
                >
                  <b className="font-semibold capitalize text-dim">{day}</b>: {exs.map((e) => e.name).slice(0, 3).join(", ")}
                  {exs.length > 3 ? ` +${exs.length - 3}` : ""}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex justify-end">
        <GhostButton onClick={onClose}>Cerrar</GhostButton>
      </div>
    </Modal>
  );
}
