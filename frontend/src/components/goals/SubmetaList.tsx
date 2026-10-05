// Submetas of a goal as a table, the same look as the task table.

import { useMemo, useState } from "react";
import { api } from "../../lib/bridge";
import type { GoalItem } from "../../lib/types";
import { useApp } from "../../store/app";
import { useGoals } from "../../store/goals";
import { filterRows, SubmetaFilters, SubmetaTable, type SubmetaRow } from "../common/SubmetaTable";
import { catColour, useToggle } from "./Submetas";

const STATUS_COLOURS: Record<string, string> = { Hecha: "var(--nv-mint)", "En curso": "var(--nv-info)" };

export function SubmetaList() {
  const detail = useGoals((s) => s.detail)!;
  const meta = useGoals((s) => s.meta);
  const itemId = useGoals((s) => s.itemId);
  const openItem = useGoals((s) => s.openItem);
  const refresh = useGoals((s) => s.refreshAfterWrite);
  const toast = useApp((s) => s.toast);
  const toggle = useToggle();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [hideDone, setHideDone] = useState(false);

  const all = useMemo<SubmetaRow[]>(() => {
    const byId = new Map(detail.items.map((i) => [i.id, i]));
    /** A submeta with all its sub-submetas nested, so the list can unfold them. */
    const rowOf = (it: GoalItem): SubmetaRow => ({
    id: it.id,
    icon: it.is_priority ? "⭐" : !it.is_leaf ? "📁" : "•",
    name: it.name,
    status: it.status,
    statusColour: STATUS_COLOURS[it.status],
    priority: it.priority,
    progress: it.progress,
    done: it.counts[0],
    total: it.counts[1],
    start: it.start,
    due: it.due,
    overdue: it.late,
    statusLocked: !it.is_leaf,
    finished: it.is_leaf ? it.status === "Hecha" || it.done_today : it.progress >= 1,
    colour: it.category ? catColour(it.category) : detail.goal.colour,
    children: it.children.map((c) => byId.get(c)).filter((k): k is GoalItem => Boolean(k)).sort((a, b) => a.order - b.order).map(rowOf),
    });
    return detail.items.filter((i) => !i.parent).sort((a, b) => a.order - b.order).map(rowOf);
  }, [detail]);
  const rows = filterRows(all, query, status, hideDone);
  /** One field of one submeta, written in place; the reload brings the real numbers. */
  const edit = async (id: string, fields: Partial<GoalItem>) => {
    try {
      await api.goalItemUpdate(detail.goal.id, id, fields);
      await refresh();
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };

  return (
    <div className="space-y-3">
      <SubmetaFilters query={query} onQuery={setQuery} status={status} onStatus={setStatus}
        statuses={meta?.item_statuses ?? []} hideDone={hideDone} onHideDone={setHideDone} />
      <div className="overflow-x-auto">
        <SubmetaTable rows={rows} selectedId={itemId} onOpen={openItem}
          onToggle={(id, done) => {
            const it = detail.items.find((x) => x.id === id);
            if (!it) return;
            // A submeta with children is finished by its children: open it instead.
            if (it.is_leaf) void toggle(it, done);
            else openItem(id);
          }}
          onDetail={(id) => useGoals.getState().openSubmeta(id)}
          edits={{
            statuses: meta?.item_statuses ?? [],
            onStatus: (id, st) => void edit(id, { status: st }),
            onPriority: (id, priority) => void edit(id, { priority }),
            onStart: (id, start) => void edit(id, { start }),
            onDue: (id, due) => void edit(id, { due }),
          }}
          empty={all.length ? "No hay submetas que coincidan con los filtros." : "Sin submetas. Crea la primera con «+ Submeta»."} />
      </div>
      <div className="font-mono text-[10.5px] text-faint">{rows.length} de {all.length} submetas</div>
    </div>
  );
}
