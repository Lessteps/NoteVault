// Submetas of a goal: cards (with categories) or the editable tree.

import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { api } from "../../lib/bridge";
import { todayIso } from "../../lib/tasks";
import type { GoalItem } from "../../lib/types";
import { useApp } from "../../store/app";
import { pct, useGoals } from "../../store/goals";
import { BlockProgress } from "../common/charts";
import { Chip, GhostButton, inputBase, PRIORITY_COLOURS, PRIORITY_GLYPHS, PRIORITY_NAMES } from "../common/forms";
import { cn, IconButton } from "../ui";
import { ItemEditor } from "./ItemEditor";

const CAT_COLOURS = ["#2383e2", "#a855f7", "#33b679", "#ff9632", "#f2555a", "#38bdf8", "#facc15", "#fb7185"];
export function catColour(c: string): string {
  let h = 0;
  for (const ch of c) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return CAT_COLOURS[h % CAT_COLOURS.length]!;
}

function useToggle() {
  const detail = useGoals((s) => s.detail)!;
  const refresh = useGoals((s) => s.refreshAfterWrite);
  const toast = useApp((s) => s.toast);
  return async (it: GoalItem, done: boolean) => {
    // Show the tick at once; the reload brings the real progress numbers.
    useGoals.setState((st) => (st.detail ? {
      detail: { ...st.detail, items: st.detail.items.map((x) => (x.id === it.id ? { ...x, done_today: done } : x)) },
    } : {}));
    try {
      await api.goalSetDone(detail.goal.id, it.id, todayIso(), done);
      await refresh();
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };
}

export function SubmetaCards() {
  const detail = useGoals((s) => s.detail)!;
  const openSubmeta = useGoals((s) => s.openSubmeta);
  const openItem = useGoals((s) => s.openItem);
  const setSubView = useGoals((s) => s.setSubView);
  const setChecklistFor = useGoals((s) => s.setChecklistFor);
  const toggle = useToggle();
  const [cat, setCat] = useState("");
  const [sort, setSort] = useState("manual");
  const roots = detail.items.filter((i) => !i.parent && (!cat || i.category === cat)).sort((a, b) => {
    if (sort === "priority") return b.priority - a.priority;
    if (sort === "progress") return b.progress - a.progress;
    if (sort === "name") return a.name.localeCompare(b.name);
    return a.order - b.order;
  });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] font-semibold text-faint">{roots.length} submetas</span>
        <select className={cn(inputBase, "py-1 text-[12px]")} value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="manual">Orden: manual</option><option value="priority">Orden: prioridad</option>
          <option value="progress">Orden: progreso</option><option value="name">Orden: nombre</option>
        </select>
        {detail.categories.length > 0 && (
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold text-faint">Categorías:</span>
            <button type="button" onClick={() => setCat("")} className={cn("rounded-full px-2 py-0.5 text-[11px]", !cat ? "bg-accent-soft text-accent-text" : "text-dim hover:bg-hover")}>Todas</button>
            {detail.categories.map((c) => (
              <button key={c} type="button" onClick={() => setCat(c)} className={cn("rounded-full px-2 py-0.5 text-[11px]", cat === c ? "text-text" : "text-dim hover:bg-hover")}
                style={cat === c ? { background: `color-mix(in srgb, ${catColour(c)} 25%, transparent)` } : undefined}>{c}</button>
            ))}
          </span>
        )}
      </div>
      {!roots.length && <p className="py-8 text-center text-[13px] text-faint">No se encontraron submetas con los filtros actuales.</p>}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(270px,1fr))] gap-3">
        {roots.map((it) => {
          const accent = it.category ? catColour(it.category) : detail.goal.colour;
          return (
            <div key={it.id} className="rounded-xl border border-line bg-card p-3.5" style={{ borderTop: `3px solid ${accent}` }}>
              <div className="flex items-start gap-2">
                <span>{it.is_priority ? "⭐" : !it.is_leaf ? "📁" : "•"}</span>
                <button type="button" onClick={() => (it.is_priority || !it.is_leaf ? openSubmeta(it.id) : (setSubView("arbol"), openItem(it.id)))}
                  className="min-w-0 flex-1 text-left text-[13px] font-semibold leading-snug text-text hover:underline">{it.name}</button>
                <Chip colour={PRIORITY_COLOURS[it.priority]}>{PRIORITY_GLYPHS[it.priority]} {PRIORITY_NAMES[it.priority]}</Chip>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {it.category && <Chip colour={catColour(it.category)}>{it.category}</Chip>}
                <Chip colour={it.status === "Hecha" ? "var(--nv-mint)" : it.status === "En curso" ? "var(--nv-info)" : undefined}>{it.status}</Chip>
                {it.is_priority && <Chip colour="#a855f7">Detallada</Chip>}
              </div>
              {it.schedule && <div className="mt-1.5 text-[11px] text-faint">📅 {it.schedule}</div>}
              <div className="mt-2 flex items-center gap-2">
                <BlockProgress value={it.progress} colour={accent} blocks={10} />
                <span className="ml-auto text-[11px] text-dim">{!it.is_leaf || it.counts[1] > 1 ? `${it.counts[0]}/${it.counts[1]} subtareas` : `${Math.round(it.progress * 100)} %`}</span>
              </div>
              <div className="mt-2 flex items-center gap-2 text-[10.5px]">
                {it.adherence7 !== null && <span style={{ color: it.adherence7 >= 0.8 ? "var(--nv-mint)" : "var(--nv-warn)" }}>Adherencia 7 d: {pct(it.adherence7)}</span>}
                {it.streak > 0 && <span className="text-warn">🔥 {it.streak} d racha</span>}
                <span className="flex-1" />
                {it.is_leaf ? (
                  <input type="checkbox" aria-label={`Hecha: ${it.name}`} checked={it.done_today} className="accent-[var(--nv-mint)]" onChange={(e) => void toggle(it, e.target.checked)} />
                ) : (
                  <button type="button" onClick={() => openSubmeta(it.id)} className="text-[11.5px] hover:underline" style={{ color: accent }}>Ver detalle ›</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <GhostButton onClick={() => setChecklistFor("")}><Plus size={13} /> Submeta con checklist</GhostButton>
    </div>
  );
}

export function SubmetaTree() {
  const detail = useGoals((s) => s.detail)!;
  const itemId = useGoals((s) => s.itemId);
  const openItem = useGoals((s) => s.openItem);
  const refresh = useGoals((s) => s.refreshAfterWrite);
  const toast = useApp((s) => s.toast);
  const toggle = useToggle();
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [habitNames, setHabitNames] = useState<Record<string, string>>({});
  const g = detail.goal;
  const byId = new Map(detail.items.map((i) => [i.id, i]));

  if (!Object.keys(habitNames).length) {
    void api.habitsList().then((hs) => setHabitNames(Object.fromEntries(hs.map((h) => [h.id, `${h.icon} ${h.name}`])))).catch(() => undefined);
  }
  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await refresh();
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };
  const rows: Array<[GoalItem, number, number, number]> = [];
  const walk = (parent: string, depth: number) => {
    const kids = detail.items.filter((i) => i.parent === parent).sort((a, b) => a.order - b.order);
    kids.forEach((it, n) => {
      rows.push([it, depth, n, kids.length]);
      if (!closed.has(it.id)) walk(it.id, depth + 1);
    });
  };
  walk("", 0);
  const editing = itemId ? byId.get(itemId) : undefined;

  return (
    <div className="flex min-h-0 gap-0">
      <div className="min-w-0 flex-1">
        <div className="overflow-hidden rounded-xl border border-line bg-card">
          <div className="grid grid-cols-[1fr_90px_150px_80px_120px_156px] border-b border-line px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-faint">
            <span>Submeta</span><span>Prioridad</span><span>Programación</span><span>Progreso</span><span>Hábitos</span><span />
          </div>
          {rows.map(([it, depth, n, count]) => (
            <div key={it.id} onClick={() => openItem(it.id)}
              className={cn("group grid cursor-pointer grid-cols-[1fr_90px_150px_80px_120px_156px] items-center border-b border-line px-3 py-1.5 text-[12.5px] last:border-b-0 hover:bg-hover", itemId === it.id && "bg-accent-soft")}>
              <span className="flex min-w-0 items-center gap-1.5" style={{ paddingLeft: depth * 18 }}>
                {it.children.length ? (
                  <button type="button" aria-label="Plegar" className="text-faint"
                    onClick={(e) => { e.stopPropagation(); const s = new Set(closed); if (s.has(it.id)) s.delete(it.id); else s.add(it.id); setClosed(s); }}>
                    {closed.has(it.id) ? "▸" : "▾"}
                  </button>
                ) : <span className="w-2" />}
                <input type="checkbox" checked={it.done_today} aria-label={`Hecha: ${it.name}`} className="accent-[var(--nv-mint)]"
                  onClick={(e) => e.stopPropagation()} onChange={(e) => void toggle(it, e.target.checked)} />
                <span className={cn("truncate", it.done_today ? "text-faint line-through" : "text-text")}>{it.is_priority ? "⭐ " : ""}{it.name}</span>
              </span>
              <span className="text-[11.5px]" style={{ color: PRIORITY_COLOURS[it.priority] }}>{PRIORITY_GLYPHS[it.priority]} {PRIORITY_NAMES[it.priority]}</span>
              <span className="truncate text-[11.5px] text-dim">{it.schedule || "—"}</span>
              <span className="flex items-center gap-1"><BlockProgress value={it.progress} colour={g.colour} blocks={6} /></span>
              <span className="truncate text-[11px] text-dim">{it.habit_links.map((h) => habitNames[h] ?? "").filter(Boolean).join(", ")}</span>
                <span className="flex justify-end gap-0.5 opacity-0 group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
                  <IconButton title="Subir" disabled={n === 0} onClick={() => void act(() => api.goalItemMove(g.id, it.id, it.parent, n - 1))}><ArrowUp size={12} /></IconButton>
                  <IconButton title="Bajar" disabled={n === count - 1} onClick={() => void act(() => api.goalItemMove(g.id, it.id, it.parent, n + 1))}><ArrowDown size={12} /></IconButton>
                  <IconButton title="Sacar un nivel" disabled={!it.parent} onClick={() => void act(() => api.goalItemIndent(g.id, it.id, -1))}><ChevronLeft size={12} /></IconButton>
                  <IconButton title="Meter dentro de la anterior" disabled={n === 0} onClick={() => void act(() => api.goalItemIndent(g.id, it.id, 1))}><ChevronRight size={12} /></IconButton>
                  <IconButton title="Añadir submeta hija" onClick={() => void act(() => api.goalItemCreate(g.id, "Nueva submeta", it.id))}><Plus size={12} /></IconButton>
                  <IconButton title="Eliminar" onClick={() => void act(() => api.goalItemDelete(g.id, it.id))}><Trash2 size={12} /></IconButton>
                </span>
            </div>
          ))}
          {!rows.length && <div className="p-6 text-center text-[13px] text-faint">Sin submetas. Crea la primera con «+ Submeta».</div>}
        </div>
      </div>
      {editing && <ItemEditor item={editing} onClose={() => openItem(null)} />}
    </div>
  );
}
