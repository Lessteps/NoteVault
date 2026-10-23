// Mentor — el interruptor global Planeación | Ejecución, justo encima del selector de plan en la barra lateral.

import { cn } from "../ui";
import { MODES, type MentorMode } from "./mentorNav";

export function MentorModeSwitch({ mode, onChange }: { mode: MentorMode; onChange: (m: MentorMode) => void }) {
  return (
    <div role="radiogroup" aria-label="Modo del Mentor" className="grid grid-cols-2 gap-0.5 rounded-lg border border-line bg-card p-0.5" data-testid="mentor-mode">
      {MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          role="radio"
          aria-checked={mode === m.id}
          title={m.hint}
          onClick={() => onChange(m.id)}
          data-testid={`mentor-mode-${m.id}`}
          className={cn("min-h-8 rounded-md px-2 text-[12.5px] font-semibold transition-colors", mode === m.id ? "bg-accent text-white" : "text-dim hover:bg-hover hover:text-text")}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
