// Resumen of an opened goal: the same idea as the project's — stat tiles, charts
// and one row per submeta — worked out from the goal's own items.

import { Plus } from "lucide-react";
import { api } from "../../lib/bridge";
import { shortDate } from "../../lib/tasks";
import { useApp } from "../../store/app";
import { pct, useGoals } from "../../store/goals";
import { BarList, BlockProgress, Columns, Donut } from "../common/charts";
import { Chip, GhostButton, PRIORITY_COLOURS, PRIORITY_NAMES } from "../common/forms";
import { Panel, StatTile } from "../common/StatTile";
import { catColour } from "./Submetas";

const STATUS_COLOURS: Record<string, string> = { Hecha: "#4ade80", "En curso": "#2383e2" };
const FALLBACK = ["#8b8b96", "#a78bfa", "#ff9632", "#38bdf8", "#facc15"];

export function GoalSummary() {
  const detail = useGoals((s) => s.detail)!;
  const setTab = useGoals((s) => s.setTab);
  const openItem = useGoals((s) => s.openItem);
  const openSubmeta = useGoals((s) => s.openSubmeta);
  const setSubView = useGoals((s) => s.setSubView);
  const refresh = useGoals((s) => s.refreshAfterWrite);
  const toast = useApp((s) => s.toast);
  const { goal: g, stats, items, history } = detail;

  const roots = items.filter((i) => !i.parent).sort((a, b) => a.order - b.order);
  const leaves = items.filter((i) => i.is_leaf);
  const count = (pred: (s: string) => boolean) => leaves.filter((i) => pred(i.status)).length;
  const inProgress = count((s) => s === "En curso");
  const late = leaves.filter((i) => i.late).length;

  const statusCounts = new Map<string, number>();
  for (const i of leaves) statusCounts.set(i.status, (statusCounts.get(i.status) ?? 0) + 1);
  const statusParts = [...statusCounts.entries()].map(([name, n], idx) => ({
    name: `${name}: ${n}`, value: n, colour: STATUS_COLOURS[name] ?? FALLBACK[idx % FALLBACK.length]!,
  }));

  const byPriority = [4, 3, 2, 1].map((p) => ({
    label: PRIORITY_NAMES[p]!, value: leaves.filter((i) => i.priority === p && i.status !== "Hecha").length, colour: PRIORITY_COLOURS[p],
  }));
  const categories = [...new Set(items.map((i) => i.category).filter(Boolean))];
  const byCategory = categories.map((c) => {
    const mine = leaves.filter((i) => i.category === c);
    const done = mine.filter((i) => i.status === "Hecha").length;
    return { label: c, value: mine.length, colour: catColour(c), hint: `${done}/${mine.length}` };
  });

  const create = async () => {
    try {
      const it = await api.goalItemCreate(g.id, "Nueva submeta");
      setTab("submetas");
      setSubView("lista");
      await refresh();
      openItem(it.id);
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-6 gap-3">
        <StatTile value={pct(stats.progress)} label="Progreso" colour="var(--nv-mint)" />
        <StatTile value={stats.counts[0] + "/" + stats.counts[1]} label="Submetas hechas" />
        <StatTile value={inProgress} label="En curso" colour="var(--nv-info)" />
        <StatTile value={late} label="Vencidas" colour={late ? "var(--nv-danger)" : undefined} />
        <StatTile value={pct(stats.adherence7)} label="Adherencia 7 días" />
        <StatTile value={stats.days_left ?? "—"} label="Días a la fecha final" colour={g.overdue ? "var(--nv-danger)" : undefined} />
      </div>

      <Panel title="◆  Submetas de la meta"
        action={<GhostButton onClick={() => void create()}><Plus size={13} /> Nueva submeta</GhostButton>}>
        {!roots.length && <p className="text-[12.5px] text-faint">Sin submetas todavía. Una submeta es un paso medible hacia la meta.</p>}
        <div className="space-y-2">
          {roots.map((it) => {
            const accent = it.category ? catColour(it.category) : g.colour;
            return (
              <div key={it.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line px-3 py-2">
                <span>{it.is_priority ? "⭐" : !it.is_leaf ? "📁" : "•"}</span>
                <button type="button" onClick={() => openItem(it.id)} className="min-w-0 truncate text-[13.5px] font-medium text-text hover:underline">{it.name}</button>
                {it.category && <Chip colour={accent}>{it.category}</Chip>}
                <Chip colour={STATUS_COLOURS[it.status]}>{it.status}</Chip>
                {it.due && <span className={`text-[11.5px] ${it.late ? "text-danger" : "text-faint"}`}>⏰ {shortDate(it.due)}</span>}
                <span className="ml-auto flex items-center gap-3">
                  {it.adherence7 !== null && <span className="text-[11px] text-dim">Adh. 7 d {pct(it.adherence7)}</span>}
                  {it.streak > 0 && <span className="text-[11px] text-warn">🔥 {it.streak}</span>}
                  <BlockProgress value={it.progress} colour={accent} />
                  <span className="font-mono text-[11px] text-dim">{it.counts[0]}/{it.counts[1]}</span>
                  <GhostButton onClick={() => openSubmeta(it.id)} className="py-0.5">Estadísticas</GhostButton>
                </span>
              </div>
            );
          })}
        </div>
      </Panel>

      <div className="grid grid-cols-2 gap-4">
        <Panel title="Por estado">
          <div className="flex items-center gap-6">
            <Donut parts={statusParts.length ? statusParts : [{ name: "Sin submetas", value: 1, colour: "var(--nv-elevated)" }]} size={150}
              label={`${stats.counts[0]}/${stats.counts[1]}`} />
            <ul className="space-y-1 text-[12px]">
              {statusParts.map((x) => (
                <li key={x.name} className="flex items-center gap-2 text-dim"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: x.colour }} />{x.name}</li>
              ))}
            </ul>
          </div>
        </Panel>
        <Panel title="Pendientes por prioridad">
          <BarList rows={byPriority} />
          {byCategory.length > 0 && (
            <div className="mt-4 border-t border-line pt-3">
              <BarList rows={byCategory} />
            </div>
          )}
        </Panel>
        <Panel title="Rendimiento · completadas por día (30 días)">
          <Columns values={history.daily} labels={history.days.map((d) => d.slice(8))} colour={g.colour} />
        </Panel>
        <Panel title="Constancia">
          <div className="grid grid-cols-3 gap-3">
            <StatTile value={pct(stats.adherence7)} label="Adherencia 7 días" />
            <StatTile value={pct(stats.adherence30)} label="Adherencia 30 días" />
            <StatTile value={stats.best_streak} label="Mejor racha activa" colour="var(--nv-warn)" />
          </div>
        </Panel>
      </div>
    </div>
  );
}
