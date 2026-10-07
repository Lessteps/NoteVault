// The submeta panel of Metas and of Proyectos: one look, borrowed from the task
// table (mono header, rounded card, a row per item), and a switch between the
// table ("Lista") and cards. Presentational: each module maps its own data to
// `SubmetaRow` and decides what opening, ticking or the detail button do.

import { BarChart3, CalendarDays, ChevronDown, ChevronRight, LayoutGrid, List, Search } from "lucide-react";
import { useState, type ReactNode } from "react";
import { shortDate } from "../../lib/tasks";
import { DateInput, StatusSelect } from "../tasks/controls";
import { cn } from "../ui";
import { BlockProgress } from "./charts";
import { Chip, inputBase, PRIORITY_COLOURS, PRIORITY_GLYPHS, PRIORITY_NAMES } from "./forms";

export interface SubmetaRow {
  id: string;
  icon: ReactNode;
  name: string;
  /** A small code before the name (an issue key). */
  code?: string;
  status: string;
  statusColour?: string;
  priority: number;
  progress: number;
  done: number;
  total: number;
  start?: string | null;
  due?: string | null;
  overdue?: boolean;
  /** The row counts as finished (struck through). */
  finished: boolean;
  colour: string;
  /** A free line shown on the card (schedule, category…). */
  note?: string;
  /** The status is worked out from its children, so it cannot be picked by hand. */
  statusLocked?: boolean;
  /** Its tasks and sub-tasks, shown under it when the row is expanded. */
  children?: SubmetaRow[];
}

export type SubmetaView = "tarjetas" | "lista";

export function ViewToggle({ value, onChange }: { value: SubmetaView; onChange: (v: SubmetaView) => void }) {
  const cell = (on: boolean) => cn("flex h-8 items-center gap-1.5 px-2.5 text-[12px]", on ? "bg-accent-soft text-text" : "text-dim hover:bg-hover");
  return (
    <div className="flex overflow-hidden rounded-lg border border-line" role="group" aria-label="Vista">
      <button type="button" aria-pressed={value === "tarjetas"} onClick={() => onChange("tarjetas")} className={cell(value === "tarjetas")}>
        <LayoutGrid size={13} /> Tarjetas
      </button>
      <button type="button" aria-pressed={value === "lista"} onClick={() => onChange("lista")} className={cell(value === "lista")}>
        <List size={13} /> Lista
      </button>
    </div>
  );
}

/** Search box + status filter, the same strip the task table opens with. */
export function SubmetaFilters({ query, onQuery, status, onStatus, statuses, hideDone, onHideDone, children }: {
  query: string; onQuery: (v: string) => void;
  status: string; onStatus: (v: string) => void; statuses: string[];
  hideDone: boolean; onHideDone: (v: boolean) => void;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex h-8 w-60 items-center gap-2 rounded-lg border border-line bg-surface px-2.5 focus-within:border-accent">
        <Search size={13} className="text-faint" />
        <input value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Buscar submetas…"
          className="min-w-0 flex-1 bg-transparent text-[12.5px] text-text outline-none placeholder:text-faint" />
      </label>
      <select aria-label="Estado" className={cn(inputBase, "h-8 py-0 text-[12px] text-dim")} value={status} onChange={(e) => onStatus(e.target.value)}>
        <option value="">Estado (todos)</option>
        {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <label className="flex items-center gap-2 text-[12px] text-dim">
        <input type="checkbox" checked={hideDone} onChange={(e) => onHideDone(e.target.checked)} className="accent-[var(--nv-accent)]" />
        Ocultar completadas
      </label>
      {children}
    </div>
  );
}

export function filterRows(rows: SubmetaRow[], query: string, status: string, hideDone: boolean): SubmetaRow[] {
  const q = query.trim().toLowerCase();
  return rows.filter((r) =>
    (!q || r.name.toLowerCase().includes(q) || (r.code ?? "").toLowerCase().includes(q)) &&
    (!status || r.status === status) &&
    (!hideDone || !r.finished));
}

const COLS = "grid-cols-[40px_minmax(240px,1fr)_150px_130px_150px_140px_150px_80px_72px]";

/** What the list can change in place; a callback left out makes that column read-only. */
export interface SubmetaEdits {
  statuses: string[];
  onStatus?: (id: string, status: string) => void;
  onPriority?: (id: string, priority: number) => void;
  onStart?: (id: string, date: string | null) => void;
  onDue?: (id: string, date: string | null) => void;
}

/** Every field that can be changed in place wears this: a visible box and a caret or icon, so it reads as clickable. */
const FIELD = "rounded-md border border-line bg-surface/60 hover:border-accent hover:bg-hover";

function PrioritySelect({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <span className="relative inline-flex items-center" title="Cambiar la prioridad">
      <select aria-label="Prioridad" value={value} onChange={(e) => onChange(Number(e.target.value))} onClick={(e) => e.stopPropagation()}
        className={cn("cursor-pointer appearance-none py-0.5 pl-1.5 pr-5 text-[12px] outline-none", FIELD)}
        style={{ color: PRIORITY_COLOURS[value] }}>
        {[4, 3, 2, 1].map((n) => <option key={n} value={n} className="bg-card text-text">{PRIORITY_GLYPHS[n]} {PRIORITY_NAMES[n]}</option>)}
      </select>
      <ChevronDown size={11} className="pointer-events-none absolute right-1.5 text-faint" />
    </span>
  );
}

function StatusEdit({ value, statuses, onChange }: { value: string; statuses: string[]; onChange: (v: string) => void }) {
  return (
    <span className="relative inline-flex items-center" title="Cambiar el estado">
      <StatusSelect value={value} statuses={statuses} onChange={onChange} className="pr-5 hover:brightness-125" />
      <ChevronDown size={11} className="pointer-events-none absolute right-1.5 opacity-70" />
    </span>
  );
}

function DateEdit({ title, value, onChange, className }: { title: string; value: string | null; onChange: (v: string | null) => void; className?: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <CalendarDays size={12} className="flex-none text-faint" />
      <DateInput title={title} value={value} onChange={onChange} className={cn(FIELD, "min-w-[64px] text-center", className)} />
    </span>
  );
}

export function SubmetaTable({ rows, selectedId, onOpen, onToggle, onDetail, edits, empty }: {
  edits?: SubmetaEdits;
  rows: SubmetaRow[];
  selectedId?: string | null;
  onOpen: (id: string) => void;
  onToggle: (id: string, done: boolean) => void;
  /** Opens the submeta's own page with its statistics. */
  onDetail?: (id: string) => void;
  empty: string;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const flip = (id: string) => setExpanded((cur) => {
    const next = new Set(cur);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const renderRow = (r: SubmetaRow, depth: number): ReactNode => {
    const kids = r.children ?? [];
    const open = expanded.has(r.id);
    return (
      <div key={r.id}>
        <div onClick={() => onOpen(r.id)}
          className={cn("group/row grid cursor-pointer items-center border-b border-line px-2 py-1.5", COLS,
            selectedId === r.id ? "bg-accent-soft" : depth ? "bg-panel/40 hover:bg-hover/60" : "hover:bg-hover/60")}>
          <span className="flex justify-center" onClick={(e) => e.stopPropagation()}>
            <input type="checkbox" title="Marcar como completada" aria-label={`Hecha: ${r.name}`} checked={r.finished}
              onChange={(e) => onToggle(r.id, e.target.checked)} className="h-4 w-4 cursor-pointer accent-[var(--nv-accent)]" />
          </span>
          <span className={cn("flex min-w-0 items-center gap-1.5 text-[13px]", r.finished ? "text-faint line-through" : "text-text")}
            style={{ paddingLeft: depth * 20 }}>
            {depth > 0 && <span className="flex-none text-faint">↳</span>}
            <span className="flex-none" style={{ color: r.colour }}>{r.icon}</span>
            {r.code && <span className="flex-none font-mono text-[11px] text-faint">{r.code}</span>}
            <span className="truncate">{r.name}</span>
          </span>
          <span>
            {edits?.onStatus && !r.statusLocked
              ? <StatusEdit value={r.status} statuses={edits.statuses} onChange={(v) => edits.onStatus!(r.id, v)} />
              : <Chip colour={r.statusColour}>{r.status}</Chip>}
          </span>
          {edits?.onPriority
            ? <span><PrioritySelect value={r.priority} onChange={(n) => edits.onPriority!(r.id, n)} /></span>
            : <span className="text-[12px]" style={{ color: PRIORITY_COLOURS[r.priority] }}>{PRIORITY_GLYPHS[r.priority]} {PRIORITY_NAMES[r.priority]}</span>}
          <span className="flex items-center gap-2">
            <BlockProgress value={r.progress} colour={r.colour} blocks={8} />
            <span className="font-mono text-[10.5px] text-dim">{Math.round(r.progress * 100)}%</span>
          </span>
          {edits?.onStart
            ? <span><DateEdit title="Fecha de salida" value={r.start ?? null} onChange={(v) => edits.onStart!(r.id, v)} /></span>
            : <span className="text-[12px] text-dim">{r.start ? shortDate(r.start) : "—"}</span>}
          {edits?.onDue
            ? <span><DateEdit title="Fecha límite" value={r.due ?? null} onChange={(v) => edits.onDue!(r.id, v)} className={r.overdue ? "!text-danger" : ""} /></span>
            : <span className={cn("text-[12px]", r.overdue ? "text-danger" : "text-dim")}>{r.due ? shortDate(r.due) : "—"}</span>}
          <span className="font-mono text-[11px] text-dim">{r.done}/{r.total}</span>
          <span className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
            {onDetail && depth === 0 && (
              <button type="button" title="Abrir su interfaz con estadísticas" aria-label={`Estadísticas de ${r.name}`} onClick={() => onDetail(r.id)}
                className="grid h-7 w-7 place-items-center rounded-md text-faint hover:bg-hover hover:text-text">
                <BarChart3 size={14} />
              </button>
            )}
            {kids.length > 0 && (
              <button type="button" aria-expanded={open} aria-label={`${open ? "Ocultar" : "Mostrar"} las ${kids.length} subtareas de ${r.name}`}
                title={open ? "Ocultar las subtareas" : `Mostrar las ${kids.length} subtareas`} onClick={() => flip(r.id)}
                className="flex h-7 items-center gap-0.5 rounded-md px-1 text-faint hover:bg-hover hover:text-text">
                <ChevronRight size={15} className={cn("transition-transform", open && "rotate-90")} />
                <span className="font-mono text-[10px]">{kids.length}</span>
              </button>
            )}
          </span>
        </div>
        {open && kids.map((k) => renderRow(k, depth + 1))}
      </div>
    );
  };

  return (
    <div className="min-w-[1040px]">
      {edits && (
        <p className="mb-1.5 text-[11.5px] text-faint">
          Pulsa el <b className="font-semibold text-dim">estado</b>, la <b className="font-semibold text-dim">prioridad</b> o las <b className="font-semibold text-dim">fechas</b> de una fila para cambiarlos al momento. El botón <b className="font-semibold text-dim">›</b> despliega sus subtareas.
        </p>
      )}
      <div className="overflow-hidden rounded-xl border border-line bg-card">
        <div className={cn("grid items-center border-b border-line bg-panel px-2 font-mono text-[10.5px] font-semibold uppercase tracking-wider text-faint", COLS)}>
          <span className="py-2.5 text-center">✓</span>
          <span>Nombre</span>
          <span>Estado{edits?.onStatus ? " ▾" : ""}</span>
          <span>Prioridad{edits?.onPriority ? " ▾" : ""}</span>
          <span>Progreso</span>
          <span>Salida{edits?.onStart ? " ▾" : ""}</span>
          <span>Fecha límite{edits?.onDue ? " ▾" : ""}</span>
          <span>Tareas</span>
          <span />
        </div>
        {!rows.length && <div className="px-4 py-10 text-center text-[13px] text-faint">{empty}</div>}
        {rows.map((r) => renderRow(r, 0))}
      </div>
    </div>
  );
}

export function SubmetaCardGrid({ rows, onOpen, onDetail, empty }: {
  rows: SubmetaRow[]; onOpen: (id: string) => void; onDetail?: (id: string) => void; empty: string;
}) {
  if (!rows.length) return <p className="py-8 text-center text-[13px] text-faint">{empty}</p>;
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
      {rows.map((r) => (
        <div key={r.id} className="rounded-xl border border-line bg-card p-3.5" style={{ borderTop: `3px solid ${r.colour}` }}>
          <div className="flex items-start gap-2">
            <span style={{ color: r.colour }}>{r.icon}</span>
            <button type="button" onClick={() => onOpen(r.id)}
              className={cn("min-w-0 flex-1 text-left text-[13px] font-semibold leading-snug hover:underline", r.finished ? "text-faint line-through" : "text-text")}>
              {r.code && <span className="mr-1.5 font-mono text-[11px] font-normal text-faint">{r.code}</span>}{r.name}
            </button>
            <span className="text-[12px]" style={{ color: PRIORITY_COLOURS[r.priority] }} title={PRIORITY_NAMES[r.priority]}>{PRIORITY_GLYPHS[r.priority]}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Chip colour={r.statusColour}>{r.status}</Chip>
            {r.due && <Chip colour={r.overdue ? "var(--nv-danger)" : undefined}>⏰ {shortDate(r.due)}</Chip>}
          </div>
          {r.note && <div className="mt-1.5 text-[11px] text-faint">{r.note}</div>}
          <div className="mt-2 flex items-center gap-2">
            <BlockProgress value={r.progress} colour={r.colour} blocks={10} />
            <span className="ml-auto text-[11px] text-dim">{r.done}/{r.total} tareas · {Math.round(r.progress * 100)} %</span>
          </div>
          {onDetail && (
            <div className="mt-2 text-right">
              <button type="button" onClick={() => onDetail(r.id)} className="text-[11.5px] hover:underline" style={{ color: r.colour }}>Ver estadísticas ›</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
