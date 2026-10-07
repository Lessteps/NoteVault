// The full view of a (priority) sub-goal: tiles, checklist, notes and links.

import { ArrowUpRight, ChevronLeft, Move, Pencil, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/bridge";
import { todayIso } from "../../lib/tasks";
import { clearPending, markPending, useApp } from "../../store/app";
import { pct, useGoals } from "../../store/goals";
import { BlockProgress } from "../common/charts";
import { Chip, GhostButton, input, inputBase, Label, PRIORITY_COLOURS, PRIORITY_GLYPHS, PRIORITY_NAMES } from "../common/forms";
import { DateInput } from "../tasks/controls";
import { LinkedNotes } from "../common/LinkedNotes";
import { StatTile } from "../common/StatTile";
import { cn, confirmAction, IconButton } from "../ui";
import { promoteItem, TransferDialog } from "./ItemTransfer";
import { PracticeLinks } from "./PracticeLinks";
import { catColour } from "./Submetas";
import { TopicLinks } from "./TopicLinks";

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
  const [moving, setMoving] = useState(false);
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
  // Ancestros (de la raíz hacia esta) y todos los niveles de subtareas, para navegar por la jerarquía.
  const trail: typeof detail.items = [];
  for (let p = item.parent ? detail.items.find((i) => i.id === item.parent) : undefined; p; p = p.parent ? detail.items.find((i) => i.id === p!.parent) : undefined) trail.unshift(p);
  const nested: Array<{ k: typeof kids[number]; depth: number }> = [];
  const walk = (parent: string, depth: number) => {
    for (const k of detail.items.filter((i) => i.parent === parent).sort((a, b) => a.order - b.order)) {
      nested.push({ k, depth });
      walk(k.id, depth + 1);
    }
  };
  walk(item.id, 0);
  const daysLeft = item.due ? Math.round((new Date(`${item.due}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86400000) : null;
  const patch = (fields: Partial<typeof item>) => void act(() => api.goalItemUpdate(g.id, item.id, fields));

  return (
    <div className="space-y-4">
      <nav aria-label="Ruta de la submeta" className="flex flex-wrap items-center gap-1 text-[12px] text-dim">
        <button type="button" onClick={() => openSubmeta(null)} className="hover:text-text hover:underline">{g.icon} {g.name}</button>
        {trail.map((t) => (
          <span key={t.id} className="flex items-center gap-1">› <button type="button" onClick={() => openSubmeta(t.id)} className="hover:text-text hover:underline">{t.name}</button></span>
        ))}
        <span className="flex items-center gap-1">› <span aria-current="page" className="text-text">{item.name}</span></span>
      </nav>
      <div className="flex items-center gap-2">
        <GhostButton onClick={() => openSubmeta(item.parent || null)} className="border-transparent px-1.5"><ChevronLeft size={14} /> {item.parent ? "Volver a la submeta madre" : "Volver a la meta"}</GhostButton>
        <span className="flex-1" />
        <GhostButton onClick={async () => {
          if (!(await confirmAction("Promover a meta", `«${item.name}» pasará a ser una meta principal con sus submetas.`, "Promover"))) return;
          await promoteItem(g.id, item);
        }}><ArrowUpRight size={13} /> Promover a meta</GhostButton>
        <GhostButton onClick={() => setMoving(true)}><Move size={13} /> Mover a…</GhostButton>
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
      <div className="flex flex-wrap items-center gap-3 text-[12px] text-dim" role="group" aria-label="Propiedades de la submeta">
        {item.is_leaf && (
          <label className="flex items-center gap-1.5">Estado
            <select aria-label="Estado" className={cn(inputBase, "h-8 py-0 text-[12px]")} value={item.status} onChange={(e) => patch({ status: e.target.value })}>
              {["Pendiente", "En curso", "Hecha"].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        )}
        <label className="flex items-center gap-1.5">Prioridad
          <select aria-label="Prioridad" className={cn(inputBase, "h-8 py-0 text-[12px]")} value={item.priority} onChange={(e) => patch({ priority: Number(e.target.value) })}>
            {[4, 3, 2, 1].map((n) => <option key={n} value={n}>{PRIORITY_GLYPHS[n]} {PRIORITY_NAMES[n]}</option>)}
          </select>
        </label>
        <span className="flex items-center gap-1.5">Salida <DateInput title="Fecha de salida" value={item.start} onChange={(start) => patch({ start })} /></span>
        <span className="flex items-center gap-1.5">Fecha límite <DateInput title="Fecha límite" value={item.due} onChange={(due) => patch({ due })} /></span>
      </div>
      <div className="grid grid-cols-6 gap-3">
        <StatTile value={pct(item.progress)} label="Progreso" colour="var(--nv-mint)" />
        <StatTile value={`${item.counts[0]}/${item.counts[1]}`} label="Completadas" />
        <StatTile value={pct(item.adherence7)} label="Adherencia 7d" />
        <StatTile value={pct(item.adherence30)} label="Adherencia 30d" />
        <StatTile value={item.streak} label="Racha" colour="var(--nv-warn)" />
        <StatTile value={daysLeft === null ? "—" : daysLeft} label="Días restantes" colour={daysLeft !== null && daysLeft < 0 && item.status !== "Hecha" ? "var(--nv-danger)" : undefined} />
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
      {nested.some(({ depth }) => depth > 0) && (
        <section className="rounded-xl border border-line bg-card p-4">
          <Label>Submetas anidadas</Label>
          <ul className="space-y-0.5">
            {nested.map(({ k, depth }) => (
              <li key={k.id} className="flex items-center gap-2 text-[12.5px]" style={{ paddingLeft: depth * 18 }}>
                <button type="button" onClick={() => openSubmeta(k.id)} className="min-w-0 flex-1 truncate text-left text-text hover:underline">{k.is_leaf ? "•" : "📁"} {k.name}</button>
                <span className="font-mono text-[11px] text-dim">{Math.round(k.progress * 100)}%</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="rounded-xl border border-line bg-card p-4">
        <Label>Temas de estudio</Label>
        <TopicLinks value={item.topic_links} onChange={(topic_links) => patch({ topic_links })} />
      </section>
      <section className="rounded-xl border border-line bg-card p-4">
        <Label>Práctica</Label>
        <PracticeLinks value={item.practice_links} onChange={(practice_links) => patch({ practice_links })} />
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
      {moving && <TransferDialog mode="item" gid={g.id} item={item} onClose={() => setMoving(false)} />}
    </div>
  );
}
