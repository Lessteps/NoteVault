// Box-free values for the Center Peek: the app's own menus and popovers standing
// in for the native <select> and <input type=date|time|datetime-local>, which look
// wrong on a dark theme.
//
// Purely presentational. Each control writes back exactly what the native one did
// — "YYYY-MM-DD", "HH:MM", "YYYY-MM-DDTHH:MM" — through the same onChange, so no
// field, format, validation or handler changes anywhere else.

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type Ref } from "react";
import { createPortal } from "react-dom";
import { normalizeMinutes } from "../../lib/peek";
import { nowLocal, shortDate, todayIso } from "../../lib/tasks";
import { MiniMonth } from "../calendar/MiniMonth";
import { cn } from "../ui";

/** The peek's palette: grey labels, near-white values. */
export const PEEK_LABEL = "#8a8a8a";
export const PEEK_TEXT = "#e6e6e6";
/** The row hover wash (no borders anywhere in the property list). */
const ROW_HOVER = "hover:bg-white/[0.04]";

export interface PeekOption {
  value: string;
  label: string;
  /** A dot in the menu and, when `chip`, the chip tint. */
  colour?: string;
}

// ── Layout ────────────────────────────────────────────────────────────────

/**
 * One property line: an icon and a grey label in a fixed 160px column, the value
 * beside it. `wide` makes the line span both columns of the property grid.
 */
export function PeekRow({ icon, label, children, wide }: {
  icon: ReactNode; label: string; children: ReactNode; wide?: boolean;
}) {
  return (
    <div className={cn("group flex min-h-8 items-center gap-2 rounded-md px-2", ROW_HOVER, wide && "col-span-2")}>
      <span className="flex w-[160px] flex-none items-center gap-2 text-[13px]" style={{ color: PEEK_LABEL }}>
        <span className="flex h-4 w-4 flex-none items-center justify-center text-faint [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
        <span className="truncate">{label}</span>
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-1 text-[14px]" style={{ color: PEEK_TEXT }}>{children}</div>
    </div>
  );
}

/** A borderless value that opens something on click. */
export function PeekValue({ ref, children, chip, colour, className, title, muted, onClick }: {
  ref?: Ref<HTMLButtonElement>;
  children: ReactNode;
  chip?: boolean;
  colour?: string;
  className?: string;
  title?: string;
  /** No value yet: shown in the placeholder grey. */
  muted?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      ref={ref}
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={cn("inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md px-1.5 py-0.5 text-left text-[14px] outline-none hover:bg-white/[0.06] focus-visible:ring-1 focus-visible:ring-accent", className)}
      style={chip
        ? { color: colour ?? "var(--nv-dim)", background: `color-mix(in srgb, ${colour ?? "var(--nv-dim)"} 16%, transparent)` }
        : muted ? { color: PEEK_LABEL } : undefined}
    >
      {children}
    </button>
  );
}

/** Borderless text value; writes on every keystroke, exactly like the old input. */
export function PeekText({ value, onChange, placeholder, ariaLabel, digits, mono, className }: {
  value: string; onChange: (v: string) => void; placeholder?: string; ariaLabel: string;
  /** Only digits, as <input type=number min=0> allowed. */
  digits?: boolean;
  mono?: boolean;
  className?: string;
}) {
  return (
    <input
      aria-label={ariaLabel}
      value={value}
      placeholder={placeholder}
      inputMode={digits ? "numeric" : undefined}
      onChange={(e) => onChange(digits ? e.target.value.replace(/[^\d]/g, "") : e.target.value)}
      className={cn(
        "w-full min-w-0 rounded-md bg-transparent px-1.5 py-0.5 text-[14px] outline-none placeholder:text-faint focus:bg-white/[0.06]",
        ROW_HOVER, mono && "font-mono text-[12.5px]",
        className,
      )}
      style={{ color: PEEK_TEXT }}
    />
  );
}

/** The app's own checkbox: a real one, only restyled. */
export function PeekCheck({ checked, onChange, ariaLabel }: {
  checked: boolean; onChange: (v: boolean) => void; ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      className={cn("inline-flex items-center gap-2 rounded-md px-1.5 py-0.5 text-[14px]", "hover:bg-white/[0.06]")}
      style={{ color: checked ? PEEK_TEXT : PEEK_LABEL }}
    >
      <span className={cn("grid h-4 w-4 flex-none place-items-center rounded-[4px] border",
        checked ? "border-accent bg-accent text-white" : "border-line-strong")}>
        {checked && <Check size={12} strokeWidth={3} />}
      </span>
      {checked ? "Sí" : "No"}
    </button>
  );
}

/** A list of short strings as chips; adding and removing writes the same array. */
export function PeekTags({ value, onChange, ariaLabel, placeholder = "Añadir etiqueta…" }: {
  value: string[];
  onChange: (v: string[]) => void;
  ariaLabel: string;
  placeholder?: string;
}) {
  const [text, setText] = useState("");
  const add = (raw: string) => {
    const parts = raw.split(",").map((s) => s.trim()).filter(Boolean).filter((s) => !value.includes(s));
    if (!parts.length) return;
    onChange([...value, ...parts]);
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {value.map((t) => (
        <span key={t} className="inline-flex items-center gap-1 rounded-md py-0.5 pl-1.5 pr-1 text-[12.5px]" style={{ color: PEEK_TEXT, background: "rgb(255 255 255 / 0.06)" }}>
          {t}
          <button type="button" title={`Quitar ${t}`} aria-label={`Quitar ${t}`} onClick={() => onChange(value.filter((x) => x !== t))}
            className="text-faint hover:text-danger">×</button>
        </span>
      ))}
      <input
        aria-label={ariaLabel}
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          if (e.target.value.includes(",")) {
            add(e.target.value);
            setText("");
            return;
          }
          setText(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            add(text);
            setText("");
          }
          if (e.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={() => {
          add(text);
          setText("");
        }}
        className="min-w-24 flex-1 rounded-md bg-transparent px-1 py-0.5 text-[13px] outline-none placeholder:text-faint focus:bg-white/[0.06]"
        style={{ color: PEEK_TEXT }}
      />
    </div>
  );
}

// ── The popover layer ─────────────────────────────────────────────────────

/**
 * A floating panel anchored to an element. It lives in a portal so the modal's
 * own scroll area can never clip it; it closes on an outside click, on Esc (which
 * it swallows, so Esc still closes the popover before the peek) and on scroll.
 */
function Panel({ anchor, width, onClose, listbox, children }: {
  anchor: HTMLElement; width: number; onClose: () => void; listbox?: boolean; children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const r = anchor.getBoundingClientRect();
    const h = el.offsetHeight;
    const w = el.offsetWidth || width;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
    const below = r.bottom + 4;
    const top = below + h <= window.innerHeight - 8 ? below : Math.max(8, r.top - h - 4);
    setPos({ left, top });
  }, [anchor, width]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (box.current?.contains(t) || anchor.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      onClose();
    };
    const onScroll = (e: Event) => {
      if (box.current?.contains(e.target as Node)) return;
      onClose();
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onClose);
    };
  }, [anchor, onClose]);

  return createPortal(
    <div
      ref={box}
      role={listbox ? "listbox" : undefined}
      onMouseDown={(e) => e.stopPropagation()}
      className="fixed z-[60] overflow-hidden rounded-lg border border-line-strong bg-card p-1 shadow-2xl"
      style={{ width, left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}
    >
      {children}
    </div>,
    document.body,
  );
}

function PanelButton({ children, onClick, selected, danger }: {
  children: ReactNode; onClick: () => void; selected?: boolean; danger?: boolean;
}) {
  return (
    <button type="button" role="option" aria-selected={Boolean(selected)} onClick={onClick}
      className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px]",
        danger ? "text-danger hover:bg-danger-soft" : selected ? "text-text hover:bg-hover" : "text-dim hover:bg-hover hover:text-text")}>
      {children}
    </button>
  );
}

// ── Menus and pickers ─────────────────────────────────────────────────────

/** The app's own select: same options, same values, the app's own dark menu. */
export function PeekMenu({ value, options, onChange, chip, ariaLabel, placeholder = "—", menuWidth = 240 }: {
  value: string;
  options: PeekOption[];
  onChange: (v: string) => void;
  /** Show the value as a tinted chip (status, priority). */
  chip?: boolean;
  ariaLabel: string;
  placeholder?: string;
  menuWidth?: number;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <>
      <PeekValue ref={trigger} chip={chip} colour={current?.colour} title={ariaLabel} muted={!current}
        onClick={() => setOpen((v) => !v)}>
        <span className="truncate">{current ? current.label : placeholder}</span>
        <ChevronDown size={13} className="flex-none text-faint" />
      </PeekValue>
      {open && trigger.current && (
        <Panel anchor={trigger.current} width={menuWidth} listbox onClose={() => setOpen(false)}>
          {options.map((o) => (
            <PanelButton key={o.value} selected={o.value === value} onClick={() => { onChange(o.value); setOpen(false); }}>
              {o.colour && <span className="h-2 w-2 flex-none rounded-full" style={{ background: o.colour }} />}
              <span className="min-w-0 flex-1 truncate">{o.label}</span>
              {o.value === value && <Check size={13} className="flex-none text-accent-text" />}
            </PanelButton>
          ))}
        </Panel>
      )}
    </>
  );
}

/** Hours on the left, minutes on the right; hands back "HH:MM". */
function ClockPanel({ hour, minute, onPick }: { hour: string; minute: string; onPick: (v: string) => void }) {
  const [mm, setMm] = useState(minute);
  useEffect(() => setMm(minute), [minute]);
  const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
  const commit = (h: string, m: string) => {
    const mins = normalizeMinutes(m);
    if (mins !== null) onPick(`${h}:${mins}`);
  };
  return (
    <div className="flex gap-1 p-1">
      <div className="grid max-h-52 w-16 flex-none auto-rows-min overflow-y-auto rounded-md border border-line p-0.5">
        {hours.map((h) => (
          <button key={h} type="button" onClick={() => commit(h, mm)} aria-label={`Hora ${h}`}
            className={cn("rounded px-2 py-0.5 text-left font-mono text-[12.5px]",
              h === hour ? "bg-accent-soft text-accent-text" : "text-dim hover:bg-hover hover:text-text")}>
            {h}
          </button>
        ))}
      </div>
      <div className="min-w-0 flex-1 space-y-1.5 p-1">
        <label className="block space-y-1">
          <span className="text-[11px]" style={{ color: PEEK_LABEL }}>Minutos</span>
          <input value={mm} aria-label="Minutos" placeholder="00" maxLength={2} inputMode="numeric" autoFocus
            onChange={(e) => setMm(e.target.value.replace(/[^\d]/g, "").slice(0, 2))}
            onKeyDown={(e) => e.key === "Enter" && commit(hour, mm)}
            onBlur={() => commit(hour, mm)}
            className="w-full rounded-md border border-line bg-surface px-2 py-0.5 font-mono text-[12.5px] text-text outline-none focus:border-accent" />
        </label>
        <div className="flex flex-wrap gap-1">
          {["00", "15", "30", "45"].map((m) => (
            <button key={m} type="button" onClick={() => commit(hour, m)}
              className="rounded-md border border-line px-1.5 py-0.5 font-mono text-[11.5px] text-dim hover:bg-hover hover:text-text">{m}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

function PanelActions({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-1 border-t border-line px-2 pb-0.5 pt-1.5">{children}</div>;
}

function PanelAction({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="rounded-md px-1.5 py-0.5 text-[12px] text-dim hover:bg-hover hover:text-text">{children}</button>
  );
}

/** The app's own date popover (the calendar module's MiniMonth), "YYYY-MM-DD". */
export function PeekDate({ value, onChange, ariaLabel, placeholder = "Sin fecha", clearable = true }: {
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
  placeholder?: string;
  clearable?: boolean;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
  };
  return (
    <>
      <PeekValue ref={trigger} title={ariaLabel} muted={!value} onClick={() => setOpen((v) => !v)}>
        <span className={cn("truncate", !value && "italic")}>{value ? shortDate(value) : placeholder}</span>
      </PeekValue>
      {open && trigger.current && (
        <Panel anchor={trigger.current} width={268} onClose={() => setOpen(false)}>
          <MiniMonth value={value || todayIso()} onPick={pick} />
          <PanelActions>
            <PanelAction onClick={() => pick(todayIso())}>Hoy</PanelAction>
            {clearable && value && <PanelAction onClick={() => pick("")}>Quitar</PanelAction>}
          </PanelActions>
        </Panel>
      )}
    </>
  );
}

/** The app's own time popover; writes "HH:MM". */
export function PeekTime({ value, onChange, ariaLabel, placeholder = "Sin hora" }: {
  value: string; onChange: (v: string) => void; ariaLabel: string; placeholder?: string;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [hour = "", minute = ""] = value.split(":");
  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
  };
  return (
    <>
      <PeekValue ref={trigger} title={ariaLabel} muted={!value} onClick={() => setOpen((v) => !v)}>
        <span className={cn("truncate font-mono", !value && "font-sans italic")}>{value || placeholder}</span>
      </PeekValue>
      {open && trigger.current && (
        <Panel anchor={trigger.current} width={252} onClose={() => setOpen(false)}>
          <ClockPanel hour={hour} minute={minute || "00"} onPick={pick} />
          {value && <PanelActions><PanelAction onClick={() => pick("")}>Quitar</PanelAction></PanelActions>}
        </Panel>
      )}
    </>
  );
}

/** The app's own reminder popover (date + time in one); writes "YYYY-MM-DDTHH:MM". */
export function PeekDateTime({ value, onChange, ariaLabel, placeholder = "Sin recordatorio" }: {
  value: string; onChange: (v: string) => void; ariaLabel: string; placeholder?: string;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [date = "", time = ""] = value.split("T");
  const [hour = "", minute = ""] = time.split(":");
  const write = (d: string, t: string) => onChange(`${d || todayIso()}T${t || "09:00"}`);
  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
  };
  return (
    <>
      <PeekValue ref={trigger} title={ariaLabel} muted={!value} onClick={() => setOpen((v) => !v)}>
        <span className={cn("truncate", !value && "italic")}>
          {value ? `${shortDate(date)} · ${time}` : placeholder}
        </span>
      </PeekValue>
      {open && trigger.current && (
        <Panel anchor={trigger.current} width={300} onClose={() => setOpen(false)}>
          <MiniMonth value={date || todayIso()} onPick={(d) => write(d, time)} />
          <div className="border-t border-line">
            <ClockPanel hour={hour} minute={minute || "00"} onPick={(t) => write(date, t)} />
          </div>
          <PanelActions>
            <PanelAction onClick={() => pick(nowLocal())}>Ahora</PanelAction>
            {value && <PanelAction onClick={() => pick("")}>Quitar</PanelAction>}
          </PanelActions>
        </Panel>
      )}
    </>
  );
}
