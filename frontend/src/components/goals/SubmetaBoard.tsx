// Tablero of a goal: one column per state (Pendiente, En curso, Hecha), the
// submetas as cards. Drag a card to another column to change its state.

import { useState } from "react";
import { api } from "../../lib/bridge";
import { shortDate } from "../../lib/tasks";
import type { GoalItem } from "../../lib/types";
import { useApp } from "../../store/app";
import { useGoals } from "../../store/goals";
import { Chip, inputBase, PRIORITY_COLOURS, PRIORITY_GLYPHS, PRIORITY_NAMES } from "../common/forms";
import { cn } from "../ui";
import { catColour } from "./Submetas";

const COLUMN_TONE: Record<string, string> = { Hecha: "var(--nv-mint)", "En curso": "var(--nv-info)" };

export function SubmetaBoard() {
  const detail = useGoals((s) => s.detail)!;
  const meta = useGoals((s) => s.meta);
  const openItem = useGoals((s) => s.openItem);
  const refresh = useGoals((s) => s.refreshAfterWrite);
  const toast = useApp((s) => s.toast);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const byId = new Map(detail.items.map((i) => [i.id, i]));
  const columns = meta?.item_statuses ?? ["Pendiente", "En curso", "Hecha"];

  // A submeta with children is finished by them: only the ones that do the work are cards.
  const cards = detail.items.filter((i) => i.is_leaf)
    .filter((i) => !q || i.name.toLowerCase().includes(q.toLowerCase()))
    .filter((i) => !cat || i.category === cat)
    .sort((a, b) => a.order - b.order);

  const move = async (id: string, status: string) => {
    const it = byId.get(id);
    if (!it || it.status === status) return;
    // Show the move at once; the reload brings the real numbers.
    useGoals.setState((st) => (st.detail ? {
      detail: { ...st.detail, items: st.detail.items.map((x) => (x.id === id ? { ...x, status } : x)) },
    } : {}));
    try {
      await api.goalItemUpdate(detail.goal.id, id, { status });
      await refresh();
    } catch (e) {
      toast("error", (e as Error).message);
      await refresh();
    }
  };

  const sel = cn(inputBase, "py-1 text-[12px]");
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input className={cn(sel, "w-48")} placeholder="Buscar submetas…" value={q} onChange={(e) => setQ(e.target.value)} />
        {detail.categories.length > 0 && (
          <select className={sel} value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">Categoría: todas</option>
            {detail.categories.map((c) => <option key={c}>{c}</option>)}
          </select>
        )}
        <span className="text-[11.5px] text-faint">{cards.length} submetas</span>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {columns.map((col) => {
          const list = cards.filter((i) => i.status === col);
          return (
            <section key={col} data-column={col}
              className={cn("flex min-h-[260px] w-[290px] flex-none flex-col rounded-xl border bg-panel", over === col ? "border-accent" : "border-line")}
              onDragOver={(e) => { if (drag) { e.preventDefault(); setOver(col); } }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null); }}
              onDrop={(e) => { e.preventDefault(); if (drag) void move(drag, col); setDrag(null); setOver(null); }}>
              <header className="flex items-center gap-2 px-3 py-2.5">
                <span className="text-[12px] font-semibold uppercase tracking-wide" style={{ color: COLUMN_TONE[col] ?? "var(--nv-dim)" }}>{col}</span>
                {col === "Hecha" && <span className="text-mint">✓</span>}
                <span className="font-mono text-[11px] text-faint">{list.length}</span>
              </header>
              <div className="flex-1 space-y-2 px-2 pb-2">
                {list.map((it: GoalItem) => {
                  const parent = it.parent ? byId.get(it.parent) : undefined;
                  return (
                    <button key={it.id} type="button" data-card={it.id} draggable onClick={() => openItem(it.id)}
                      onDragStart={(e) => { e.dataTransfer.setData("text/plain", it.id); e.dataTransfer.effectAllowed = "move"; setDrag(it.id); }}
                      onDragEnd={() => { setDrag(null); setOver(null); }}
                      className={cn("block w-full rounded-lg border border-line bg-card p-2.5 text-left hover:border-line-strong", drag === it.id && "opacity-40")}>
                      <div className={cn("text-[13px] leading-snug", it.status === "Hecha" ? "text-faint line-through" : "text-text")}>
                        {it.is_priority ? "⭐ " : ""}{it.name}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-[12px]" style={{ color: PRIORITY_COLOURS[it.priority] }} title={PRIORITY_NAMES[it.priority]}>{PRIORITY_GLYPHS[it.priority]}</span>
                        {it.category && <Chip colour={catColour(it.category)}>{it.category}</Chip>}
                        {it.due && <Chip colour={it.late ? "var(--nv-danger)" : undefined}>⏰ {shortDate(it.due)}</Chip>}
                        {it.schedule && !it.due && <span className="text-[11px] text-faint">📅 {it.schedule}</span>}
                        {parent && <span className="ml-auto max-w-[110px] truncate font-mono text-[10.5px] text-faint" title={parent.name}>↰ {parent.name}</span>}
                      </div>
                    </button>
                  );
                })}
                {!list.length && <p className="px-1 py-4 text-center text-[11.5px] text-faint">Arrastra una submeta aquí.</p>}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
