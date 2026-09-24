// The goals board: cards grouped by area.

import { Plus } from "lucide-react";
import { useState } from "react";
import { api } from "../../lib/bridge";
import { shortDate, todayIso } from "../../lib/tasks";
import type { GoalCard } from "../../lib/types";
import { useApp } from "../../store/app";
import { pct, useGoals } from "../../store/goals";
import { BlockProgress, Sparkline } from "../common/charts";
import { Chip, inputBase, PrimaryButton, PRIORITY_COLOURS, PRIORITY_GLYPHS, PRIORITY_NAMES } from "../common/forms";
import { cn, openMenu } from "../ui";

const SORTS: Array<[string, string]> = [["priority", "Prioridad"], ["end", "Fecha de fin"], ["progress", "Progreso"], ["name", "Nombre"], ["manual", "Manual"]];
const FILTER_TITLES: Record<string, string> = { activas: "activas", pausa: "en pausa", completadas: "completadas", vencidas: "vencidas", archivadas: "archivadas" };

export function dateLine(g: GoalCard): [string, string] {
  const today = todayIso();
  if (!g.start && !g.end) return ["Sin fechas", "var(--nv-faint)"];
  const span = `${g.start ? shortDate(g.start) : "…"} → ${g.end ? shortDate(g.end) : "…"}`;
  if (!g.end) return [span, "var(--nv-faint)"];
  if (g.overdue) return [`${span} · vencida`, "var(--nv-danger)"];
  if (g.end === today) return [`${span} · termina hoy`, "var(--nv-warn)"];
  const left = g.days_left ?? 0;
  return [`${span} · faltan ${left} días`, left <= 7 ? "var(--nv-warn)" : "var(--nv-faint)"];
}

export function GoalsBoard() {
  const cards = useGoals((s) => s.cards);
  const areas = useGoals((s) => s.areas);
  const filter = useGoals((s) => s.filter);
  const meta = useGoals((s) => s.meta);
  const open = useGoals((s) => s.open);
  const setEditing = useGoals((s) => s.setEditing);
  const loadAll = useGoals((s) => s.loadAll);
  const toast = useApp((s) => s.toast);
  const [sort, setSort] = useState("priority");

  const sorted = (gs: GoalCard[]) => [...gs].sort((a, b) => {
    if (sort === "end") return (a.end ?? "9999").localeCompare(b.end ?? "9999");
    if (sort === "progress") return b.progress - a.progress;
    if (sort === "name") return a.name.localeCompare(b.name);
    if (sort === "manual") return (a.order ?? 1e9) - (b.order ?? 1e9) || a.name.localeCompare(b.name);
    return b.priority - a.priority || (a.end ?? "9999").localeCompare(b.end ?? "9999");
  });
  const groups: Array<[string, string, GoalCard[]]> = [];
  for (const a of areas) {
    const gs = cards.filter((g) => g.area === a.id);
    if (gs.length) groups.push([`${a.icon} ${a.name}`, a.colour, sorted(gs)]);
  }
  const rest = cards.filter((g) => !areas.some((a) => a.id === g.area));
  if (rest.length) groups.push(["Sin área", "var(--nv-dim)", sorted(rest)]);

  const setStatus = async (g: GoalCard, status: string) => {
    try {
      await api.goalsUpdate(g.id, { status });
      await loadAll();
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };
  const shift = async (g: GoalCard, step: number) => {
    const list = sorted(cards.filter((c) => c.area === g.area));
    const i = list.findIndex((c) => c.id === g.id);
    const j = Math.max(0, Math.min(list.length - 1, i + step));
    list.splice(j, 0, list.splice(i, 1)[0]!);
    try {
      await Promise.all(list.map((c, n) => (c.order !== n + 1 ? api.goalsUpdate(c.id, { order: n + 1 }) : null)));
      await loadAll();
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
      <div className="mb-1 flex items-center gap-2">
        <h1 className="mr-3 text-[21px] font-semibold text-text">🎯 Metas</h1>
        <select className={cn(inputBase, "py-1 text-[12px]")} value={sort} onChange={(e) => setSort(e.target.value)}>
          {SORTS.map(([k, l]) => <option key={k} value={k}>Ordenar: {l}</option>)}
        </select>
        <span className="flex-1" />
        <PrimaryButton onClick={() => setEditing("")}><Plus size={14} /> Nueva meta</PrimaryButton>
      </div>
      <p className="mb-4 text-[11.5px] text-faint">{cards.length} meta{cards.length !== 1 ? "s" : ""}{FILTER_TITLES[filter] ? ` · ${FILTER_TITLES[filter]}` : ""}</p>
      {!cards.length && (
        <p className="mx-auto mt-16 max-w-md text-center text-[13px] leading-relaxed text-faint">
          No hay metas aquí todavía. Crea una con «+ Nueva meta»; divídela en submetas y conéctala a tus hábitos.
        </p>
      )}
      <div className="space-y-6">
        {groups.map(([title, colour, gs]) => {
          const avg = gs.reduce((a, g) => a + g.progress, 0) / gs.length;
          return (
            <section key={title}>
              <h2 className="mb-2.5 flex items-center gap-3 text-[14px] font-semibold" style={{ color: colour }}>
                {title} <BlockProgress value={avg} colour={colour} blocks={10} />
                <span className="text-[11.5px] font-normal text-faint">{gs.length} meta{gs.length !== 1 ? "s" : ""}</span>
              </h2>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(290px,1fr))] gap-3.5">
                {gs.map((g) => {
                  const [line, lineColour] = dateLine(g);
                  return (
                    <button key={g.id} type="button" onClick={() => void open(g.id)}
                      onContextMenu={(e) => openMenu(e, [
                        { label: "Abrir", onSelect: () => void open(g.id) },
                        { label: "Editar…", onSelect: () => setEditing(g.id) },
                        ...(meta?.statuses ?? []).filter((s) => s !== g.status).map((s) => ({ label: `Marcar «${s}»`, onSelect: () => void setStatus(g, s) })),
                        ...(sort === "manual" ? [
                          { label: "Mover antes", onSelect: () => void shift(g, -1) },
                          { label: "Mover después", onSelect: () => void shift(g, 1) },
                        ] : []),
                      ])}
                      className="rounded-xl border border-line bg-card p-4 text-left hover:border-line-strong"
                      style={{ borderTop: `3px solid ${g.colour}` }}>
                      <div className="flex items-start gap-2.5">
                        <span className="text-[20px] leading-none">{g.icon || "🎯"}</span>
                        <span className="min-w-0 flex-1 text-[14px] font-semibold leading-snug text-text">{g.name}</span>
                        <Chip colour={PRIORITY_COLOURS[g.priority]}>{PRIORITY_GLYPHS[g.priority]} {PRIORITY_NAMES[g.priority]}</Chip>
                      </div>
                      <div className="mt-1.5 text-[11px]" style={{ color: lineColour }}>{g.status !== "Activa" ? `${g.status} · ` : ""}{line}</div>
                      <div className="mt-2.5 flex items-center gap-2">
                        <BlockProgress value={g.progress} colour={g.colour} />
                        <span className="ml-auto text-[11px] text-dim">{g.counts[0]}/{g.counts[1]} submetas</span>
                      </div>
                      <div className="mt-2 flex items-center text-[11px] text-faint">
                        Adherencia 7 d: {pct(g.adherence7)}
                        <span className="ml-auto"><Sparkline values={g.daily} colour={g.colour} /></span>
                      </div>
                      {g.next && (
                        <div className={cn("mt-1.5 truncate text-[11px]", g.next.date < todayIso() ? "text-danger" : "text-dim")}>
                          Siguiente: {g.next.name} · {g.next.date === todayIso() ? "hoy" : g.next.date < todayIso() ? "vencida" : shortDate(g.next.date)}
                        </div>
                      )}
                      {(g.overdue_items > 0 || g.habits.length > 0) && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {g.overdue_items > 0 && <Chip colour="var(--nv-danger)">⚠ {g.overdue_items} vencida{g.overdue_items !== 1 ? "s" : ""}</Chip>}
                          {g.habits.map((h) => <Chip key={h.id} colour="#7c5af0">{h.icon} {h.name}</Chip>)}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
