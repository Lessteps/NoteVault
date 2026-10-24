// Selector del TIPO de trabajo de un bloque de estudio: Teoría / Práctica / Proyecto / Repaso (control segmentado). Sin elegir = «sin clasificar».

import { WORK_KINDS, WORK_LABEL, type WorkKind } from "../../lib/timeLog";
import { cn } from "../ui";

export function WorkPicker({ value, onChange, disabled = false, label = "¿Qué vas a trabajar?" }: { value: WorkKind | null; onChange: (w: WorkKind | null) => void; disabled?: boolean; label?: string }) {
  return (
    <div className="text-[13px] text-dim" data-testid="work-picker">
      <p className="mb-1.5">{label}</p>
      <div role="group" aria-label="Tipo de trabajo" className="grid grid-cols-4 gap-1 rounded-xl bg-surface p-1">
        {WORK_KINDS.map((w) => (
          <button
            key={w}
            type="button"
            disabled={disabled}
            aria-pressed={value === w}
            onClick={() => onChange(value === w ? null : w)}
            data-testid={`work-${w}`}
            className={cn("min-h-8 rounded-lg px-1 font-medium disabled:opacity-60", value === w ? "bg-accent-soft text-accent-text ring-1 ring-accent/40" : "hover:text-text")}
          >
            {WORK_LABEL[w]}
          </button>
        ))}
      </div>
    </div>
  );
}
