// Small pieces shared by the Hábitos views.

import { Check } from "lucide-react";
import type { Habit } from "../../lib/types";
import { cn } from "../ui";

export function habitColour(h: Habit | undefined): string {
  return h?.colour || "var(--nv-accent)";
}

/** The square check a habit gets on a given day. */
export function HabitCheck({
  habit, done, active, onToggle, size = 22, label, disabled,
}: {
  habit: Habit;
  done: boolean;
  active: boolean;
  onToggle: (done: boolean) => void;
  size?: number;
  label: string;
  disabled?: boolean;
}) {
  if (!active) {
    return (
      <span
        title={`${label} · no toca`}
        className="grid place-items-center text-faint/50"
        style={{ width: size, height: size }}
      >
        ·
      </span>
    );
  }
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={() => onToggle(!done)}
      className={cn(
        "grid place-items-center rounded-md border transition-colors disabled:opacity-35 disabled:hover:border-line-strong",
        done ? "border-transparent text-white" : "border-line-strong hover:border-accent",
      )}
      style={{ width: size, height: size, background: done ? habitColour(habit) : undefined }}
    >
      {done && <Check size={Math.round(size * 0.62)} strokeWidth={3} />}
    </button>
  );
}

export function Bar({ value, colour }: { value: number | null; colour?: string }) {
  const v = value ?? 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-elevated">
      <div
        className="h-full rounded-full transition-[width]"
        style={{ width: `${Math.round(v * 100)}%`, background: colour ?? "var(--nv-accent)", opacity: value === null ? 0 : 1 }}
      />
    </div>
  );
}

export function Empty({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="grid flex-1 place-items-center">
      <div className="text-center">
        <p className="mb-3 text-[13px] text-faint">Todavía no tienes hábitos.</p>
        <button
          type="button"
          onClick={onAdd}
          className="rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-accent-strong"
        >
          Crear el primero
        </button>
      </div>
    </div>
  );
}

export function Header({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex h-12 flex-none items-center gap-3 border-b border-line px-6">
      <h1 className="text-[15px] font-semibold text-text">{title}</h1>
      <div className="ml-auto flex items-center gap-2">{children}</div>
    </div>
  );
}

export function NavButtons({ onPrev, onNext, onToday, label }: {
  onPrev: () => void; onNext: () => void; onToday: () => void; label: string;
}) {
  const btn = "rounded-md border border-line px-2 py-1 text-[12px] text-dim hover:bg-hover hover:text-text";
  return (
    <>
      <span className="mr-1 font-mono text-[12px] text-dim">{label}</span>
      <button type="button" className={btn} onClick={onPrev} aria-label="Anterior">‹</button>
      <button type="button" className={btn} onClick={onToday}>Hoy</button>
      <button type="button" className={btn} onClick={onNext} aria-label="Siguiente">›</button>
    </>
  );
}
