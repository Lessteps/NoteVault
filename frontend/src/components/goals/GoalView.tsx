// An opened goal: header, tiles and the Submetas / Hoy / Historial / Notas tabs.

import { ChevronLeft, List, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/bridge";
import { shortDate } from "../../lib/tasks";
import { clearPending, markPending, useApp } from "../../store/app";
import { pct, useGoals, type GoalTab } from "../../store/goals";
import { BlockProgress, Columns } from "../common/charts";
import { Chip, GhostButton, input, Label, PrimaryButton, PRIORITY_COLOURS, PRIORITY_GLYPHS, PRIORITY_NAMES } from "../common/forms";
import { LinkedNotes } from "../common/LinkedNotes";
import { StatTile } from "../common/StatTile";
import { cn, confirmAction } from "../ui";
import { GoalSummary } from "./GoalSummary";
import { ItemEditor } from "./ItemEditor";
import { SubmetaBoard } from "./SubmetaBoard";
import { SubmetaList } from "./SubmetaList";
import { SubmetaCards, SubmetaTree } from "./Submetas";
import { ViewToggle } from "../common/SubmetaTable";
import { SubmetaDetail } from "./SubmetaDetail";
import { TransferDialog } from "./ItemTransfer";
import { TodayList } from "./TodayList";

const TABS: Array<[GoalTab, string]> = [["resumen", "Resumen"], ["submetas", "Submetas"], ["tablero", "Tablero"], ["hoy", "Hoy"], ["historial", "Historial"], ["notas", "Notas"]];

function History() {
  const d = useGoals((s) => s.detail)!;
  const h = d.history;
  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-line bg-card p-4">
        <Label>Submetas completadas por día (últimos 30 días)</Label>
        <Columns values={h.daily} labels={h.days.map((x) => x.slice(8))} colour={d.goal.colour} />
      </section>
      {h.repeating.length > 0 && (
        <section>
          <Label>Repetitivas · últimos 30 días</Label>
          <div className="space-y-1.5">
            {h.repeating.map((r) => (
              <div key={r.id} className="flex items-center gap-3">
                <span className="w-56 truncate text-[12.5px] text-text">{r.name}</span>
                <span className="flex gap-[2px]">
                  {r.cells.map((c, i) => (
                    <span key={i} title={h.days[i]} className="h-3.5 w-3.5 rounded-[3px]"
                      style={{ background: c === null ? "transparent" : c ? d.goal.colour : "var(--nv-elevated)", border: c === null ? "1px dashed var(--nv-line)" : undefined }} />
                  ))}
                </span>
                {r.streak > 0 && <span className="text-[11px] text-warn">🔥 {r.streak}</span>}
                <span className="text-[11px] text-faint">{Math.round(r.progress * 100)} % desde el inicio</span>
              </div>
            ))}
          </div>
        </section>
      )}
      <section>
        <Label>Completadas</Label>
        {!h.completed.length && <p className="text-[12.5px] text-faint">Todavía ninguna submeta única completada.</p>}
        <ul className="space-y-1">
          {h.completed.map((c) => (
            <li key={c.id} className="flex items-center gap-2 text-[12.5px]">
              <span className="text-mint">✓</span><span className="flex-1 text-dim">{c.name}</span><span className="text-[11px] text-faint">{shortDate(c.done_at)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Notes() {
  const d = useGoals((s) => s.detail)!;
  const refresh = useGoals((s) => s.refreshAfterWrite);
  const toast = useApp((s) => s.toast);
  const [text, setText] = useState(d.goal.description);
  const timer = useRef<number | undefined>(undefined);
  const pending = useRef<string | null>(null);
  const gid = d.goal.id;
  const flush = async () => {
    window.clearTimeout(timer.current);
    const t = pending.current;
    pending.current = null;
    clearPending("goal-notes");
    if (t === null) return;
    try {
      await api.goalsUpdate(gid, { description: t });
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => void flush(), [gid]);
  return (
    <div className="space-y-4">
      <div>
        <Label>Carpeta y notas vinculadas</Label>
        <LinkedNotes notes={d.goal.linked_notes} folder={d.goal.linked_folder}
          onChange={async (linked_notes, linked_folder) => {
            try {
              await api.goalsUpdate(gid, { linked_notes, linked_folder });
              await refresh();
            } catch (e) {
              toast("error", (e as Error).message);
            }
          }} />
      </div>
      <div>
        <Label>Descripción y notas de la meta</Label>
        <textarea rows={14} className={cn(input, "resize-y")} value={text} placeholder="Describe la meta, por qué importa y cómo sabrás que la lograste…"
          onChange={(e) => {
            setText(e.target.value);
            pending.current = e.target.value;
            markPending("goal-notes", flush);
            window.clearTimeout(timer.current);
            timer.current = window.setTimeout(() => void flush(), 800);
          }}
          onBlur={() => void flush()} />
      </div>
    </div>
  );
}

export function GoalView() {
  const detail = useGoals((s) => s.detail);
  const tab = useGoals((s) => s.tab);
  const setTab = useGoals((s) => s.setTab);
  const subView = useGoals((s) => s.subView);
  const setSubView = useGoals((s) => s.setSubView);
  const submetaId = useGoals((s) => s.submetaId);
  const open = useGoals((s) => s.open);
  const setEditing = useGoals((s) => s.setEditing);
  const setChecklistFor = useGoals((s) => s.setChecklistFor);
  const refresh = useGoals((s) => s.refreshAfterWrite);
  const openItem = useGoals((s) => s.openItem);
  const itemId = useGoals((s) => s.itemId);
  const areas = useGoals((s) => s.areas);
  const toast = useApp((s) => s.toast);
  const [name, setName] = useState("");
  const [demoting, setDemoting] = useState(false);
  useEffect(() => setName(detail?.goal.name ?? ""), [detail?.goal.id, detail?.goal.name]);

  if (!detail) return <div className="grid flex-1 place-items-center text-[13px] text-faint">Cargando meta…</div>;
  const g = detail.goal;
  const s = detail.stats;
  const area = areas.find((a) => a.id === g.area);
  const editing = itemId ? detail.items.find((i) => i.id === itemId) : undefined;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-3">
      <div className="flex items-center gap-2">
        <GhostButton onClick={() => void open(null)} className="border-transparent px-1.5"><ChevronLeft size={14} /> Metas</GhostButton>
        <span className="flex-1" />
        <GhostButton onClick={() => setEditing(g.id)}><Pencil size={13} /> Editar meta…</GhostButton>
        <GhostButton onClick={() => setDemoting(true)}>↩ Convertir en submeta de…</GhostButton>
        <GhostButton danger onClick={async () => {
          if (!(await confirmAction("Eliminar meta", `¿Eliminar «${g.name}» con todas sus submetas? Se mueve a la papelera de la vault. Si solo quieres ocultarla, márcala como Archivada.`, "Eliminar", true))) return;
          try {
            await api.goalsDelete(g.id);
            await open(null);
          } catch (e) {
            toast("error", (e as Error).message);
          }
        }}><Trash2 size={13} /> Eliminar</GhostButton>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <span className="text-[28px]">{g.icon || "🎯"}</span>
        <input aria-label="Nombre de la meta" value={name} onChange={(e) => setName(e.target.value)}
          onBlur={async () => {
            if (!name.trim() || name.trim() === g.name) return;
            try {
              await api.goalsUpdate(g.id, { name: name.trim() });
              await refresh();
            } catch (e) {
              toast("error", (e as Error).message);
            }
          }}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 text-[21px] font-semibold text-text outline-none hover:border-line focus:border-accent" />
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <Chip colour={g.status_colour}>{g.status}</Chip>
        <Chip colour={PRIORITY_COLOURS[g.priority]}>{PRIORITY_GLYPHS[g.priority]} {PRIORITY_NAMES[g.priority]}</Chip>
        {area && <Chip colour={area.colour}>{area.icon} {area.name}</Chip>}
        {(g.start || g.end) && <Chip colour={g.overdue ? "var(--nv-danger)" : undefined}>{g.start ? shortDate(g.start) : "…"} → {g.end ? shortDate(g.end) : "…"}</Chip>}
      </div>
      <div className="mt-3 grid grid-cols-6 gap-3">
        <StatTile value={pct(s.progress)} label="Progreso" colour="var(--nv-mint)" />
        <StatTile value={`${s.counts[0]}/${s.counts[1]}`} label="Submetas hechas" />
        <StatTile value={pct(s.adherence7)} label="Adherencia 7 días" />
        <StatTile value={pct(s.adherence30)} label="Adherencia 30 días" />
        <StatTile value={s.best_streak} label="Mejor racha activa" colour="var(--nv-warn)" />
        <StatTile value={s.days_left ?? "—"} label="Días restantes" colour={g.overdue ? "var(--nv-danger)" : undefined} />
      </div>
      <BlockProgress value={s.progress} colour={g.colour} blocks={40} className="mt-3" />
      <div className="mt-3 flex items-center gap-1 border-b border-line">
        {TABS.map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={cn("-mb-px border-b-2 px-3.5 py-2 text-[13px]", tab === k ? "border-accent font-semibold text-text" : "border-transparent text-dim hover:text-text")}>{l}</button>
        ))}
        {tab === "submetas" && !submetaId && (
          <span className="ml-auto flex items-center gap-1.5 pb-1">
            <ViewToggle value={subView === "tarjetas" ? "tarjetas" : "lista"} onChange={(v) => setSubView(v)} />
            <GhostButton onClick={() => setSubView("arbol")} className={cn(subView === "arbol" && "bg-accent-soft text-text")}><List size={13} /> Árbol</GhostButton>
            <GhostButton onClick={() => setChecklistFor("")}>📋 + Con checklist</GhostButton>
            <PrimaryButton onClick={async () => {
              try {
                const it = await api.goalItemCreate(g.id, "Nueva submeta");
                await refresh();
                openItem(it.id);
              } catch (e) {
                toast("error", (e as Error).message);
              }
            }}><Plus size={14} /> Submeta</PrimaryButton>
          </span>
        )}
      </div>
      <div className="py-4">
        {tab === "resumen" ? <GoalSummary />
          : tab === "submetas" ? (submetaId ? <SubmetaDetail /> : subView === "tarjetas" ? <SubmetaCards /> : subView === "lista" ? <SubmetaList /> : <SubmetaTree />)
          : tab === "tablero" ? <SubmetaBoard />
          : tab === "hoy" ? <TodayList goalId={g.id} title={false} />
            : tab === "historial" ? <History /> : <Notes />}
      </div>
      {itemId && editing && <ItemEditor item={editing} onClose={() => openItem(null)} />}
      {demoting && <TransferDialog mode="goal" gid={g.id} onClose={() => setDemoting(false)} />}
    </div>
  );
}
