// Tablero: the project's workflow columns; drag cards between and within them.

import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { addDays, weekStart } from "../../lib/habits";
import { todayIso } from "../../lib/tasks";
import type { Issue } from "../../lib/types";
import { descendants, useProjects } from "../../store/projects";
import { Chip, inputBase, PRIORITY_NAMES } from "../common/forms";
import { cn, IconButton } from "../ui";
import { DueChip, PriorityMark } from "./IssueBits";

export function Kanban() {
  const detail = useProjects((s) => s.detail)!;
  const openIssue = useProjects((s) => s.openIssue);
  const moveIssue = useProjects((s) => s.moveIssue);
  const setCreating = useProjects((s) => s.setCreating);
  const goal = useProjects((s) => s.goalFilter);
  const setGoal = useProjects((s) => s.setGoalFilter);
  const [q, setQ] = useState("");
  const [prio, setPrio] = useState(0);
  const [label, setLabel] = useState("");
  const [overdue, setOverdue] = useState(false);
  const [week, setWeek] = useState(false);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<{ col: string; index: number } | null>(null);
  const p = detail.project;

  const labels = useMemo(() => [...new Set(detail.issues.flatMap((i) => i.labels))].sort(), [detail]);
  const goals = detail.issues.filter((i) => i.type === "Submeta");
  const inGoal = useMemo(() => (goal ? descendants(detail, goal) : null), [detail, goal]);
  const weekEnd = addDays(weekStart(todayIso()), 6);

  const shown = (i: Issue) => {
    // A sub-goal with children groups work; it is not a card itself.
    if (i.type === "Submeta" && i.children.length) return false;
    if (q && !`${i.key} ${i.title} ${i.labels.join(" ")} ${i.description}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (prio && i.priority !== prio) return false;
    if (label && !i.labels.includes(label)) return false;
    if (inGoal && !inGoal.has(i.id)) return false;
    if (overdue && !i.overdue) return false;
    if (week && !(i.due && !i.done && i.due <= weekEnd)) return false;
    return true;
  };

  const sel = cn(inputBase, "py-1 text-[12px]");
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-none flex-wrap items-center gap-2 px-5 py-2.5">
        <input className={cn(sel, "w-48")} placeholder="Buscar issues…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className={sel} value={prio} onChange={(e) => setPrio(Number(e.target.value))}>
          <option value={0}>Prioridad: todas</option>
          {[4, 3, 2, 1].map((n) => <option key={n} value={n}>{PRIORITY_NAMES[n]}</option>)}
        </select>
        <select className={sel} value={label} onChange={(e) => setLabel(e.target.value)}>
          <option value="">Etiqueta: todas</option>
          {labels.map((l) => <option key={l}>{l}</option>)}
        </select>
        <select className={sel} value={goal} onChange={(e) => setGoal(e.target.value)}>
          <option value="">Submeta: todas</option>
          {goals.map((g) => <option key={g.id} value={g.id}>{g.key} {g.title}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-[12px] text-dim"><input type="checkbox" checked={overdue} onChange={(e) => setOverdue(e.target.checked)} /> Vencidas</label>
        <label className="flex items-center gap-1.5 text-[12px] text-dim"><input type="checkbox" checked={week} onChange={(e) => setWeek(e.target.checked)} /> Vencen esta semana</label>
      </div>
      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto px-5 pb-4">
        {p.columns.map((col) => {
          const cards = detail.issues.filter((i) => i.status === col && shown(i)).sort((a, b) => a.order - b.order || a.number - b.number);
          return (
            <section
              key={col}
              data-column={col}
              className={cn("flex w-[280px] flex-none flex-col rounded-xl border bg-panel", over?.col === col ? "border-accent" : "border-line")}
              onDragOver={(e) => {
                if (!drag) return;
                e.preventDefault();
                const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("[data-card]"));
                const index = items.filter((el) => el.dataset.card !== drag && el.getBoundingClientRect().top + el.offsetHeight / 2 < e.clientY).length;
                setOver({ col, index });
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (drag && over) void moveIssue(drag, col, over.index);
                setDrag(null);
                setOver(null);
              }}
            >
              <header className="flex items-center gap-2 px-3 py-2.5">
                <span className="text-[12px] font-semibold uppercase tracking-wide text-dim">{col}</span>
                {col === p.done_column && <span className="text-mint">✓</span>}
                <span className="font-mono text-[11px] text-faint">{cards.length}</span>
                <IconButton title={`Crear en ${col}`} className="ml-auto" onClick={() => setCreating({ status: col })}><Plus size={14} /></IconButton>
              </header>
              <div className="min-h-[40px] flex-1 space-y-2 overflow-y-auto px-2 pb-2">
                {cards.map((i, n) => (
                  <div key={i.id}>
                    {over?.col === col && over.index === n && drag !== i.id && <div className="mb-2 h-0.5 rounded bg-accent" />}
                    <button
                      type="button"
                      data-card={i.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", i.id);
                        e.dataTransfer.effectAllowed = "move";
                        setDrag(i.id);
                      }}
                      onDragEnd={() => {
                        setDrag(null);
                        setOver(null);
                      }}
                      onClick={() => openIssue(i.id)}
                      className={cn("block w-full rounded-lg border border-line bg-card p-2.5 text-left hover:border-line-strong", drag === i.id && "opacity-40")}
                    >
                      <div className={cn("text-[13px] leading-snug", i.done ? "text-faint line-through" : "text-text")}>{i.title}</div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className="text-[12px]" style={{ color: i.type_colour }} title={i.type}>{i.icon}</span>
                        <span className="font-mono text-[11px] text-faint">{i.key}</span>
                        <PriorityMark p={i.priority} />
                        <DueChip issue={i} />
                        {i.labels.slice(0, 3).map((l) => <Chip key={l}>{l}</Chip>)}
                        {i.children.length > 0 && <span className="ml-auto font-mono text-[10.5px] text-faint">↳ {i.children.length}</span>}
                      </div>
                    </button>
                  </div>
                ))}
                {over?.col === col && over.index >= cards.filter((c) => c.id !== drag).length && <div className="h-0.5 rounded bg-accent" />}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
