// The full view of a (priority) sub-goal: tiles, checklist, notes and links.

import { ChevronLeft, Pencil, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/bridge";
import { shortDate, todayIso } from "../../lib/tasks";
import { clearPending, markPending, useApp } from "../../store/app";
import { pct, useGoals } from "../../store/goals";
import { BlockProgress } from "../common/charts";
import { Chip, GhostButton, input, Label, PRIORITY_COLOURS, PRIORITY_GLYPHS, PRIORITY_NAMES } from "../common/forms";
import { LinkedNotes } from "../common/LinkedNotes";
import { StatTile } from "../common/StatTile";
import { cn, confirmAction, IconButton } from "../ui";
import { catColour } from "./Submetas";

export function SubmetaDetail() {
  const detail = useGoals((s) => s.detail)!;
  const id = useGoals((s) => s.submetaId)!;
  const openSubmeta = useGoals((s) => s.openSubmeta);
  const openItem = useGoals((s) => s.openItem);
  const setSubView = useGoals((s) => s.setSubView);
  const refresh = useGoals((s) => s.refreshAfterWrite);
  const toast = useApp((s) => s.toast);
  const item = detail.items.find((i) => i.id === id);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [add, setAdd] = useState("");
  const timer = useRef<number | undefined>(undefined);
  const pending = useRef<string | null>(null);
  const g = detail.goal;

  useEffect(() => {
    if (!item) return;
    setName(item.name);
    setNotes(item.notes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id]);

  const flushNotes = async () => {
    window.clearTimeout(timer.current);
    const text = pending.current;
    pending.current = null;
    clearPending("goal-item-notes");
    if (text === null || !item) return;
    try {
      await api.goalItemUpdate(g.id, item.id, { notes: text });
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => void flushNotes(), [id]);

  if (!item) return null;
  const kids = detail.items.filter((i) => i.parent === item.id).sort((a, b) => a.order - b.order);
  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await refresh();
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };
  const today = todayIso();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <GhostButton onClick={() => openSubmeta(null)} className="border-transparent px-1.5"><ChevronLeft size={14} /> Volver a la meta</GhostButton>
        <span className="flex-1" />
        <GhostButton onClick={() => { openSubmeta(null); setSubView("arbol"); openItem(item.id); }}><Pencil size={13} /> Editar propiedades…</GhostButton>
        <GhostButton danger onClick={async () => {
          if (!(await confirmAction("Eliminar submeta", `¿Eliminar «${item.name}» y sus ${kids.length} subtareas?`, "Eliminar", true))) return;
          openSubmeta(null);
          await act(() => api.goalItemDelete(g.id, item.id));
        }}><Trash2 size={13} /> Eliminar</GhostButton>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-[26px]">{item.is_priority ? "⭐" : "📁"}</span>
        <input aria-label="Nombre de la submeta" value={name} onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name.trim() !== item.name && void act(() => api.goalItemUpdate(g.id, item.id, { name: name.trim() }))}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 text-[20px] font-bold text-text outline-none hover:border-line focus:border-accent" />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {item.category && <Chip colour={catColour(item.category)}>{item.category}</Chip>}
        <Chip colour={item.status === "Hecha" ? "var(--nv-mint)" : item.status === "En curso" ? "var(--nv-info)" : undefined}>{item.status}</Chip>
        <Chip colour={PRIORITY_COLOURS[item.priority]}>{PRIORITY_GLYPHS[item.priority]} {PRIORITY_NAMES[item.priority]}</Chip>
        {item.schedule && <Chip>📅 {item.schedule}</Chip>}
      </div>
      <div className="grid grid-cols-6 gap-3">
        <StatTile value={pct(item.progress)} label="Progreso" colour="var(--nv-mint)" />
        <StatTile value={`${item.counts[0]}/${item.counts[1]}`} label="Completadas" />
        <StatTile value={pct(item.adherence7)} label="Adherencia 7d" />
        <StatTile value={pct(item.adherence30)} label="Adherencia 30d" />
        <StatTile value={item.streak} label="Racha" colour="var(--nv-warn)" />
        <StatTile value={item.due ? shortDate(item.due) : "—"} label="Fecha límite" />
      </div>
      <BlockProgress value={item.progress} colour="var(--nv-mint)" blocks={30} />
      <section className="rounded-xl border border-line bg-card p-4">
        <Label>Lista de subtareas y checklist</Label>
        <ul className="space-y-1">
          {kids.map((k) => (
            <li key={k.id} className="group flex items-center gap-2 rounded-md px-1 py-0.5 hover:bg-hover">
              <input type="checkbox" aria-label={`Hecha: ${k.name}`} checked={k.done_today} className="accent-[var(--nv-mint)]"
                onChange={(e) => {
                  const done = e.target.checked;
                  useGoals.setState((st) => (st.detail ? {
                    detail: { ...st.detail, items: st.detail.items.map((x) => (x.id === k.id ? { ...x, done_today: done } : x)) },
                  } : {}));
                  void act(() => api.goalSetDone(g.id, k.id, today, done));
                }} />
              <span className={cn("min-w-0 flex-1 truncate text-[13px]", k.done_today ? "text-faint line-through" : "text-text")}>{k.name}</span>
              {k.schedule && <span className="text-[11px] text-faint">{k.schedule}</span>}
              <IconButton title="Eliminar" className="opacity-0 group-hover:opacity-100" onClick={() => void act(() => api.goalItemDelete(g.id, k.id))}><X size={12} /></IconButton>
            </li>
          ))}
        </ul>
        <textarea rows={1} className={cn(input, "mt-2 resize-y")} value={add} placeholder="+ Añadir subtarea al checklist (Enter). Pega varias líneas para añadir varias."
          onChange={(e) => setAdd(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter" || e.shiftKey) return;
            e.preventDefault();
            const lines = add.split("\n").map((l) => l.replace(/^\s*[-*]\s*(\[[ xX]\]\s*)?/, "").trim()).filter(Boolean);
            if (!lines.length) return;
            setAdd("");
            void act(async () => {
              for (const l of lines) await api.goalItemCreate(g.id, l, item.id);
            });
          }} />
      </section>
      <section className="rounded-xl border border-line bg-card p-4">
        <Label>Notas, enlaces y resumen teórico</Label>
        <textarea rows={8} className={cn(input, "resize-y")} value={notes} placeholder="Escribe aquí resúmenes de teoría, enlaces a recursos o notas de esta submeta..."
          onChange={(e) => {
            setNotes(e.target.value);
            pending.current = e.target.value;
            markPending("goal-item-notes", flushNotes);
            window.clearTimeout(timer.current);
            timer.current = window.setTimeout(() => void flushNotes(), 800);
          }}
          onBlur={() => void flushNotes()} />
        <div className="mt-3">
          <Label>Carpeta y notas vinculadas</Label>
          <LinkedNotes notes={item.linked_notes} folder={item.linked_folder}
            onChange={(linked_notes, linked_folder) => void act(() => api.goalItemUpdate(g.id, item.id, { linked_notes, linked_folder }))} />
        </div>
      </section>
    </div>
  );
}
