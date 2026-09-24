// Small inline editors shared by the table, calendar and drawer.

import { Star } from "lucide-react";
import { useRef } from "react";
import { cn } from "../ui";

const STATUS_TONE: Record<string, string> = {
  "Sin empezar": "text-dim bg-elevated border-line-strong",
  "En progreso": "text-info bg-info-soft border-info/35",
  "Completado": "text-mint bg-mint-soft border-mint/35",
  "Bloqueado": "text-danger bg-danger-soft border-danger/35",
};

export function statusTone(status: string): string {
  return STATUS_TONE[status] ?? "text-dim bg-elevated border-line-strong";
}

export function StatusSelect({
  value, statuses, onChange, className,
}: {
  value: string;
  statuses: string[];
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "cursor-pointer appearance-none rounded-md border px-2 py-0.5 text-[11.5px] font-semibold outline-none",
        statusTone(value),
        className,
      )}
    >
      {statuses.map((s) => (
        <option key={s} value={s} className="bg-card text-text">
          {s}
        </option>
      ))}
    </select>
  );
}

export function PriorityStars({
  value, max = 3, onChange, size = 14,
}: {
  value: number;
  max?: number;
  onChange?: (v: number) => void;
  size?: number;
}) {
  return (
    <span className="inline-flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          title={`Prioridad ${n}`}
          disabled={!onChange}
          onClick={() => onChange?.(n)}
          className="text-faint transition-colors enabled:hover:text-warn"
        >
          <Star
            size={size}
            strokeWidth={1.8}
            className={n <= value ? "fill-warn text-warn" : ""}
          />
        </button>
      ))}
    </span>
  );
}

function label(value: string | null, type: "date" | "datetime-local" | "time"): string {
  if (!value) return "—";
  if (type === "time") return value;
  const [datePart = "", timePart] = value.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  let text = `${d} ${months[(m ?? 1) - 1]}`;
  if (y !== new Date().getFullYear()) text += ` ${y}`;
  if (timePart) text += ` · ${timePart.slice(0, 5)}`;
  return text;
}

/**
 * A date shown as plain text ("22 sep", "—"); clicking it opens the native
 * picker. Empty values are sent as null.
 */
export function DateInput({
  value, onChange, type = "date", className, title,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  type?: "date" | "datetime-local" | "time";
  className?: string;
  title?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <span className="relative inline-flex items-center" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        title={title}
        onClick={() => {
          const el = ref.current;
          if (!el) return;
          try {
            el.showPicker();
          } catch {
            el.focus();
          }
        }}
        className={cn(
          "rounded-md border border-transparent px-1.5 py-0.5 font-mono text-[11.5px] outline-none",
          value ? "text-dim" : "text-faint",
          "hover:border-line hover:text-text",
          className,
        )}
      >
        {label(value, type)}
      </button>
      {value && (
        <button
          type="button"
          title="Quitar"
          onClick={() => onChange(null)}
          className="ml-0.5 hidden text-[11px] text-faint hover:text-danger group-hover/row:inline"
        >
          ×
        </button>
      )}
      <input
        ref={ref}
        type={type}
        tabIndex={-1}
        aria-hidden
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="pointer-events-none absolute left-0 top-full h-0 w-0 opacity-0"
      />
    </span>
  );
}
