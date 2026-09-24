// Vista General: today across every module, with the checks at hand.

import { CalendarDays, Dumbbell, FileText, Flag, Kanban, SquareCheck, Wallet, CircleCheck } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { api } from "../../lib/bridge";
import { MONTHS_ES, WEEKDAYS_ES } from "../../lib/calendar";
import { formatMoney } from "../../lib/money";
import { shortDate, todayIso } from "../../lib/tasks";
import type { HomeOverview, MovementType } from "../../lib/types";
import { useApp, type ModuleId } from "../../store/app";
import { useGoals } from "../../store/goals";
import { BlockProgress } from "../common/charts";
import { Chip, GhostButton, inputBase } from "../common/forms";
import { cn } from "../ui";
import { MoneyInput } from "../finance/parts";

const GREEN = "#4ade80";
const BLUE = "#2383e2";
const ORANGE = "#ff9632";
const RED = "#f2555a";

function Card({ icon, title, accent, subtitle, children, className }: {
  icon: string; title: string; accent: string; subtitle?: string; children: ReactNode; className?: string;
}) {
  return (
    <section className={cn("flex flex-col rounded-xl border border-line bg-card p-4", className ?? "min-h-[220px]")} style={{ borderTop: `2px solid ${accent}` }}>
      <header className="mb-2 flex items-center gap-2">
        <span className="text-[14px] font-semibold text-text">{icon} {title}</span>
        {subtitle && <span className="ml-auto text-[11.5px]" style={{ color: accent }}>{subtitle}</span>}
      </header>
      {children}
    </section>
  );
}

const Empty = ({ children }: { children: ReactNode }) => <p className="text-[12px] text-faint">{children}</p>;

function Row({ checked, onChange, colour, label, children, title }: {
  checked: boolean; onChange: (v: boolean) => void; colour: string; label: string; children?: ReactNode; title?: string;
}) {
  return (
    <label className="flex items-center gap-2.5 py-[3px] text-[12.5px]" title={title}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ accentColor: colour }} aria-label={label} />
      <span className={cn("min-w-0 flex-1 truncate", checked ? "text-faint line-through" : "text-text")}>{label}</span>
      {children}
    </label>
  );
}

export function HomeModule() {
  const toast = useApp((s) => s.toast);
  const setModule = useApp((s) => s.setModule);
  const [data, setData] = useState<HomeOverview | null>(null);
  const [doneStatus, setDoneStatus] = useState("Completado");
  const [todoStatus, setTodoStatus] = useState("Por hacer");
  const [q, setQ] = useState<{ type: MovementType; amount: number | null; what: string }>({ type: "gasto", amount: null, what: "" });

  const load = useCallback(() => api.homeOverview().then(setData).catch((e) => toast("error", (e as Error).message)), [toast]);
  useEffect(() => {
    void load();
    api.tasksMeta().then((m) => { setDoneStatus(m.done_status); setTodoStatus(m.statuses[0] ?? "Por hacer"); }).catch(() => undefined);
  }, [load]);

  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await load();
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };
  // Show the tick at once; the reload confirms it.
  const optimistic = (patch: (d: HomeOverview) => HomeOverview) => setData((d) => (d ? patch(structuredClone(d)) : d));

  if (!data) return <div className="grid flex-1 place-items-center bg-surface text-[13px] text-faint">Cargando…</div>;
  const today = data.today;
  const d = new Date(`${today}T12:00:00`);
  const weekday = WEEKDAYS_ES[(d.getDay() + 6) % 7]!;
  const hDone = data.habits.filter((h) => h.done).length;
  const eDone = data.exercise.rows.filter((r) => r.entry.done).length;
  const late = data.projects.issues.filter((i) => i.due < today).length;
  const f = data.finance;
  const quickSave = async () => {
    if (!q.amount || !q.what.trim()) return toast("error", "Escribe el importe y en qué.");
    const now = new Date();
    await act(() => api.finAdd(today, { type: q.type, amount_cents: q.amount!, what: q.what.trim(),
      time: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}` }));
    setQ({ ...q, amount: null, what: "" });
  };
  const openGoal = (gid: string) => {
    setModule("metas");
    void useGoals.getState().open(gid);
  };

  const cells: Array<[string, string, string]> = [
    ["Hábitos", `${hDone}/${data.habits.length}`, data.habits.length && hDone === data.habits.length ? GREEN : BLUE],
    ["Ejercicio", `${eDone}/${data.exercise.rows.length}`, data.exercise.rows.length && eDone === data.exercise.rows.length ? GREEN : ORANGE],
    ["Tareas hoy", String(data.tasks.today.length), data.tasks.today.length ? BLUE : "var(--nv-dim)"],
    ["Atrasadas", String(data.tasks.overdue.length), data.tasks.overdue.length ? RED : "var(--nv-dim)"],
    ["Proyectos hoy", String(data.projects.issues.length), data.projects.issues.length ? "#a78bfa" : "var(--nv-dim)"],
  ];
  const quick: Array<[ModuleId, string, ReactNode]> = [
    ["calendario", "Calendario", <CalendarDays size={14} />], ["habits", "Hábitos", <CircleCheck size={14} />],
    ["ejercicio", "Ejercicio", <Dumbbell size={14} />], ["tareas", "Tareas", <SquareCheck size={14} />],
    ["proyectos", "Proyectos", <Kanban size={14} />], ["metas", "Metas", <Flag size={14} />],
    ["finanzas", "Finanzas", <Wallet size={14} />], ["notas", "Notas", <FileText size={14} />],
  ];

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-surface px-6 py-5">
      <div className="flex items-baseline gap-3">
        <h1 className="text-[22px] font-semibold text-text">◎ Vista General</h1>
        <span className="ml-auto text-[13px] text-dim">{weekday.charAt(0).toUpperCase()}{weekday.slice(1)}, {d.getDate()} de {MONTHS_ES[d.getMonth()]} de {d.getFullYear()}</span>
      </div>
      <div className="flex justify-between rounded-xl border border-line bg-card px-6 py-3">
        {cells.map(([l, v, c]) => (
          <div key={l}>
            <div className="text-[20px] font-semibold" style={{ color: c }}>{v}</div>
            <div className="text-[10.5px] uppercase tracking-wider text-faint">{l}</div>
          </div>
        ))}
      </div>

      <Card icon="🎯" title="Metas" accent="#33b679" subtitle={`${data.goals.items.filter((i) => i.done).length}/${data.goals.items.length} hoy`} className="min-h-0">
        {!data.goals.any ? <Empty>Aún no hay metas en la Vista General. Créalas en el módulo Metas y marca «Mostrar en la Vista General».</Empty> : (
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-1">
              {data.goals.list.map((g) => (
                <button key={g.id} type="button" onClick={() => openGoal(g.id)} title={`Abrir «${g.name}»`} className="flex w-full items-center gap-2 text-left text-[12.5px] text-text hover:underline">
                  <span className="min-w-0 flex-1 truncate">{g.icon} {g.name}</span><BlockProgress value={g.progress} colour={g.colour} blocks={10} />
                </button>
              ))}
            </div>
            <div>
              <div className="mb-1 text-[11.5px] text-faint">Submetas de hoy</div>
              {!data.goals.items.length && <Empty>Nada programado hoy.</Empty>}
              {data.goals.items.slice(0, 7).map((r) => (
                <Row key={`${r.goal.id}/${r.item.id}`} checked={r.done} colour={r.goal.colour} label={r.item.name} title={`${r.goal.name} → ${r.item.name}`}
                  onChange={(v) => { optimistic((x) => { x.goals.items.find((i) => i.item.id === r.item.id && i.goal.id === r.goal.id)!.done = v; return x; }); void act(() => api.goalSetDone(r.goal.id, r.item.id, today, v)); }}>
                  {r.item.due_time && <span className="font-mono text-[11px] text-faint">{r.item.due_time}</span>}
                  <Chip colour={r.goal.colour}>{r.goal.icon}</Chip>
                </Row>
              ))}
            </div>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-4">
        <Card icon="⊙" title="Hábitos de hoy" accent={GREEN} subtitle={`${hDone}/${data.habits.length}`}>
          {!data.habits.length && <Empty>No hay hábitos programados para hoy.</Empty>}
          {data.habits.map((h) => (
            <Row key={h.id} checked={h.done} colour={GREEN} label={`${h.icon} ${h.name}`}
              onChange={(v) => { optimistic((x) => { x.habits.find((i) => i.id === h.id)!.done = v; return x; }); void act(() => api.habitsSetDone(today, h.id, v)); }}>
              {h.subs[1] > 0 && <span className="text-[10.5px]" style={{ color: h.subs[0] === h.subs[1] ? GREEN : "var(--nv-faint)" }}>{h.subs[0]}/{h.subs[1]}</span>}
            </Row>
          ))}
        </Card>
        <Card icon="🏋" title={`Ejercicio — ${weekday}`} accent={ORANGE} subtitle={`${eDone}/${data.exercise.rows.length}`}>
          {!data.exercise.rows.length && <Empty>Hoy no hay rutina programada.</Empty>}
          {data.exercise.rows.map((e) => (
            <Row key={e.id} checked={Boolean(e.entry.done)} colour={ORANGE} label={e.name} title={e.how_to || e.name}
              onChange={(v) => { optimistic((x) => { x.exercise.rows.find((i) => i.id === e.id)!.entry.done = v; return x; });
                void act(() => api.exMark(today, e.id, v, e.entry.weight ?? 0, e.entry.reps ?? 0, e.entry.notes ?? "")); }}>
              <span className="text-[11px] text-faint">{e.series_reps}</span>
            </Row>
          ))}
        </Card>
        <Card icon="☑" title="Tareas para hoy" accent={BLUE} subtitle={`${data.tasks.today.length} hoy`}>
          {!data.tasks.today.length && !data.tasks.overdue.length && <Empty>Nada pendiente para hoy. 🎉</Empty>}
          {[...data.tasks.overdue.slice(0, 4).map((t) => [t, true] as const), ...data.tasks.today.slice(0, 6).map((t) => [t, false] as const)].map(([t, isLate]) => (
            <Row key={t.id} checked={t.done} colour={BLUE} label={t.name} title={`${t.name} — ${t.status}`}
              onChange={(v) => void act(() => api.tasksUpdate(t.id, { status: v ? doneStatus : todoStatus }))}>
              {t.subject && <Chip colour={BLUE}>{t.subject}</Chip>}
              <span className="text-[10px] text-[#e0a13a]">{"★".repeat(Math.max(1, Math.min(3, t.priority)))}</span>
              {isLate && t.due && <span className="text-[10.5px] text-danger">⚠ {shortDate(t.due)}</span>}
            </Row>
          ))}
          {data.tasks.today.length + data.tasks.overdue.length > 10 && <Empty>+{Math.max(0, data.tasks.today.length - 6) + Math.max(0, data.tasks.overdue.length - 4)} tarea(s) más en el módulo Tareas.</Empty>}
        </Card>
        <Card icon="◫" title="Proyectos — issues de hoy" accent="#a78bfa" subtitle={`${data.projects.issues.length - late} hoy${late ? ` · ${late} vencidos` : ""}`}>
          {data.projects.issues.slice(0, 7).map((i) => (
            <Row key={i.id} checked={i.done} colour={i.project.colour} label={`${i.key} ${i.title}`} title={`${i.project.name} → ${i.title}`}
              onChange={(v) => void act(() => api.issueMove(i.project.id, i.id, v ? i.project.done_column : i.project.first_column, 10 ** 6))}>
              {i.due < today && <span className="text-[10.5px] text-danger">⚠ {shortDate(i.due)}</span>}
              <Chip colour={i.project.colour}>{i.project.name}</Chip>
            </Row>
          ))}
          {data.projects.issues.length > 7 && <Empty>+{data.projects.issues.length - 7} issue(s) más en Proyectos.</Empty>}
          {data.projects.active.length > 0 ? (
            <div className="mt-2 space-y-1">
              <Empty>{data.projects.issues.length ? "Proyectos en curso:" : "Ningún issue vence hoy. Proyectos en curso:"}</Empty>
              {data.projects.active.map((p) => (
                <div key={p.id} className="flex items-center gap-2 text-[12.5px] text-text">
                  <span className="min-w-0 flex-1 truncate">{p.icon || "●"} {p.name}</span><BlockProgress value={p.progress} colour={p.colour} blocks={10} />
                </div>
              ))}
            </div>
          ) : !data.projects.issues.length && <Empty>Aún no hay proyectos. Créalos en el módulo Proyectos y sus issues del día aparecerán aquí.</Empty>}
        </Card>
        <Card icon="💰" title="Finanzas" accent="#eab308" subtitle={`hoy ${formatMoney(f.day.gasto)}`}>
          <div className="space-y-1 text-[12.5px]">
            <div className="flex"><span className="text-dim">Gasto de hoy</span><span className="ml-auto font-mono" style={{ color: f.day.gasto ? RED : "var(--nv-dim)" }}>{formatMoney(f.day.gasto)}</span></div>
            <div className="flex"><span className="text-dim">Gasto del mes</span><span className="ml-auto font-mono text-text">{formatMoney(f.month.gasto)}</span></div>
            {f.prev.gasto > 0 && (() => {
              const diff = f.month.gasto - f.prev.gasto;
              const pct = Math.round((100 * diff) / f.prev.gasto);
              return <div className="flex"><span className="text-dim">vs mes anterior</span><span className="ml-auto font-mono" style={{ color: diff > 0 ? RED : GREEN }}>{formatMoney(f.prev.gasto)} ({pct >= 0 ? "+" : ""}{pct} %)</span></div>;
            })()}
            <div className="flex"><span className="text-dim">Balance del mes</span><span className="ml-auto font-mono" style={{ color: f.month.balance >= 0 ? GREEN : RED }}>{formatMoney(f.month.balance, "COP", true)}</span></div>
          </div>
          {f.checks.length > 0 && <div className="mt-2"><Empty>Ahorros de hoy:</Empty></div>}
          {f.checks.map((c) => (
            <Row key={c.goal.id} checked={c.checked} colour={c.goal.colour} label={`${c.goal.icon} Ahorro ${c.goal.name}${c.goal.suggested_cents ? ` — ${formatMoney(c.goal.suggested_cents)}` : ""}`}
              onChange={(v) => void act(() => api.calSetDone(today, `saving:${c.goal.id}`, v))} />
          ))}
          <div className="mt-auto flex gap-1.5 border-t border-line pt-3">
            <select aria-label="Tipo" className={cn(inputBase, "py-1 text-[12px]")} value={q.type} onChange={(e) => setQ({ ...q, type: e.target.value as MovementType })}
              style={{ borderColor: q.type === "gasto" ? RED : q.type === "ingreso" ? GREEN : "#eab308" }}>
              <option value="gasto">Gasto</option><option value="ingreso">Ingreso</option><option value="ahorro">Ahorro</option>
            </select>
            <MoneyInput label="Importe" value={q.amount} onChange={(amount) => setQ((x) => ({ ...x, amount }))} className="w-28 py-1" onEnter={() => void quickSave()} />
            <input className={cn(inputBase, "min-w-0 flex-1 py-1")} placeholder="En qué" value={q.what} onChange={(e) => setQ({ ...q, what: e.target.value })} onKeyDown={(e) => e.key === "Enter" && void quickSave()} />
            <GhostButton onClick={() => void quickSave()} className="py-1">↵ Guardar</GhostButton>
          </div>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-card px-4 py-3">
        <span className="mr-2 text-[11.5px] text-faint">Acceso rápido</span>
        {quick.map(([id, label, icon]) => <GhostButton key={id} onClick={() => setModule(id)}>{icon} {label}</GhostButton>)}
      </div>
      <p className="text-[10.5px] text-faint">Actualizado {todayIso() === today ? "hoy" : today}.</p>
    </div>
  );
}
