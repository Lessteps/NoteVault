// Metas financieras: savings goals kept apart from Metas; board and detail.

import { ChevronLeft, Minus, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../lib/bridge";
import { formatMoney } from "../../lib/money";
import { parseRepeat, shortDate, todayIso } from "../../lib/tasks";
import type { FinGoal, FinPace, Movement } from "../../lib/types";
import { useApp } from "../../store/app";
import { useFinance } from "../../store/finance";
import { BlockProgress, LineChart } from "../common/charts";
import { Chip, ColourRow, Field, GhostButton, input, Label, Modal, PrimaryButton } from "../common/forms";
import { RepeatPicker } from "../common/RepeatPicker";
import { StatTile } from "../common/StatTile";
import { cn, confirmAction } from "../ui";
import { MoneyInput, MovementTable } from "./parts";

const GOAL_COLOURS = ["#33b679", "#039be5", "#8e24aa", "#f6bf26", "#e67c73", "#3f51b5", "#f4511e", "#0b8043"];
const STATUS_COLOURS: Record<string, string> = { Activa: "#2383e2", "En pausa": "#ff9632", Cumplida: "#4ade80" };

export function cadenceText(g: FinGoal): string {
  if (g.cadence.mode === "period") return g.cadence.period === "week" ? "Una vez por semana" : "Una vez por mes";
  const r = parseRepeat(g.cadence.rule);
  if (r.kind === "daily") return "Todos los días";
  if (r.kind === "every") return `Cada ${r.every} días`;
  if (r.kind === "monthly") return `Cada mes el día ${r.monthDays.join(", ")}`;
  const names = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
  return `Cada ${r.weekdays.map((d) => names[d]).join(", ")}`;
}

function paceLine(p: FinPace): string {
  return p.per_day ? `Ritmo necesario: ${formatMoney(p.per_day)}/día · ${formatMoney(p.per_week)}/semana · ${formatMoney(p.per_month)}/mes` : "";
}

export function FinGoalDialog() {
  const editing = useFinance((s) => s.goalEditing);
  const setEditing = useFinance((s) => s.setGoalEditing);
  const meta = useFinance((s) => s.meta);
  const changed = useFinance((s) => s.changed);
  const toast = useApp((s) => s.toast);
  const [f, setF] = useState<Partial<FinGoal>>({});
  useEffect(() => {
    if (editing === null) return;
    const g = editing ? meta?.goals.find((x) => x.id === editing) : undefined;
    setF(g ? { ...g } : { name: "", icon: "💰", target_cents: 0, suggested_cents: 0, start: todayIso(), deadline: "",
      colour: GOAL_COLOURS[0], show_in_daily: true, cadence: { mode: "rule", rule: "daily" }, status: "Activa", notes: "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);
  if (editing === null) return null;
  const set = (p: Partial<FinGoal>) => setF((x) => ({ ...x, ...p }));
  const save = async () => {
    if (!f.name?.trim()) return toast("error", "La meta necesita un nombre.");
    if (!f.target_cents) return toast("error", "Escribe el objetivo.");
    try {
      await api.finGoalSave(editing, f);
      setEditing(null);
      await changed();
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };
  const mode = f.cadence?.mode === "period" ? f.cadence.period : "rule";
  return (
    <Modal title={editing ? "Editar meta de ahorro" : "Nueva meta de ahorro"} onClose={() => setEditing(null)} width={560}
      footer={<><span className="flex-1" /><GhostButton onClick={() => setEditing(null)}>Cancelar</GhostButton><PrimaryButton onClick={() => void save()}>Guardar</PrimaryButton></>}>
      <div className="grid grid-cols-[70px_1fr] gap-3">
        <Field label="Icono"><input className={input} value={f.icon ?? ""} onChange={(e) => set({ icon: e.target.value })} /></Field>
        <Field label="Nombre"><input autoFocus className={input} value={f.name ?? ""} placeholder="p. ej. Moto" onChange={(e) => set({ name: e.target.value })} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Objetivo"><MoneyInput label="Objetivo" value={f.target_cents || null} onChange={(c) => set({ target_cents: c ?? 0 })} className="w-full" /></Field>
        <Field label="Aporte sugerido"><MoneyInput label="Aporte sugerido" value={f.suggested_cents || null} onChange={(c) => set({ suggested_cents: c ?? 0 })} className="w-full" /></Field>
        <Field label="Inicio"><input type="date" className={input} value={f.start ?? ""} onChange={(e) => set({ start: e.target.value })} /></Field>
        <Field label="Fecha límite"><input type="date" className={input} value={f.deadline ?? ""} onChange={(e) => set({ deadline: e.target.value })} /></Field>
      </div>
      <Field label="Color"><ColourRow colours={GOAL_COLOURS} value={f.colour ?? GOAL_COLOURS[0]!} onChange={(colour) => set({ colour })} /></Field>
      <label className="flex items-center gap-2 text-[12.5px] text-dim">
        <input type="checkbox" checked={Boolean(f.show_in_daily)} onChange={(e) => set({ show_in_daily: e.target.checked })} />
        Mostrar en Diario (aparece «Ahorro …» con casilla)
      </label>
      <Field label="Casilla">
        <select className={input} value={mode} onChange={(e) => set({ cadence: e.target.value === "rule" ? { mode: "rule", rule: "daily" } : { mode: "period", period: e.target.value as "week" | "month" } })}>
          <option value="rule">Días concretos (regla)</option><option value="week">Una vez por semana</option><option value="month">Una vez por mes</option>
        </select>
      </Field>
      {f.cadence?.mode === "rule" && <RepeatPicker value={f.cadence.rule} onChange={(rule) => set({ cadence: { mode: "rule", rule: rule || "daily" } })} />}
      <Field label="Estado">
        <select className={input} value={f.status} onChange={(e) => set({ status: e.target.value })}>
          {(meta?.goal_statuses ?? []).map((s) => <option key={s}>{s}</option>)}
        </select>
      </Field>
      <Field label="Notas"><textarea rows={3} className={cn(input, "resize-y")} value={f.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} /></Field>
    </Modal>
  );
}

function GoalDetail({ id }: { id: string }) {
  const openGoal = useFinance((s) => s.openGoal);
  const edit = useFinance((s) => s.edit);
  const setEditing = useFinance((s) => s.setGoalEditing);
  const changed = useFinance((s) => s.changed);
  const version = useFinance((s) => s.version);
  const toast = useApp((s) => s.toast);
  const [data, setData] = useState<Awaited<ReturnType<typeof api.finGoal>> | null>(null);
  useEffect(() => {
    api.finGoal(id).then(setData).catch((e) => { toast("error", (e as Error).message); openGoal(null); });
  }, [id, version, toast, openGoal]);
  if (!data) return <div className="grid flex-1 place-items-center text-[13px] text-faint">Cargando…</div>;
  const { goal: g, pace: p } = data;
  let acc = 0;
  const cumulative = data.days.map((d) => (acc += d.net));
  const refs = data.movements.flatMap((m: Movement) => m.attachments);
  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
      <div className="flex items-center gap-2">
        <GhostButton onClick={() => openGoal(null)} className="border-transparent px-1.5"><ChevronLeft size={14} /> Metas financieras</GhostButton>
        <span className="flex-1" />
        <PrimaryButton onClick={() => edit({ day: todayIso(), kind: "ahorro", preset: { type: "ahorro", goal: g.id, amount_cents: g.suggested_cents || undefined, what: `Ahorro ${g.name}` } })}><Plus size={14} /> Ahorro</PrimaryButton>
        <GhostButton onClick={() => edit({ day: todayIso(), kind: "retiro", preset: { type: "retiro", goal: g.id, what: `Retiro ${g.name}` } })}><Minus size={13} /> Retiro</GhostButton>
        <GhostButton onClick={() => setEditing(g.id)}><Pencil size={13} /> Editar…</GhostButton>
        <GhostButton danger onClick={async () => {
          if (!(await confirmAction("Eliminar meta", `¿Eliminar «${g.name}»? Sus ahorros registrados se conservan como movimientos.`, "Eliminar", true))) return;
          try {
            await api.finGoalDelete(g.id);
            openGoal(null);
            await changed();
          } catch (e) {
            toast("error", (e as Error).message);
          }
        }}><Trash2 size={13} /> Eliminar</GhostButton>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-[30px]">{g.icon}</span>
        <h1 className="text-[23px] font-semibold text-text">{g.name}</h1>
        <Chip colour={STATUS_COLOURS[g.status]}>{g.status}</Chip>
        <span className="text-[12px] text-faint">{cadenceText(g)}</span>
      </div>
      <BlockProgress value={g.target_cents ? p.saved / g.target_cents : 0} colour={g.colour} blocks={40} />
      <div className="grid grid-cols-4 gap-3">
        <StatTile value={formatMoney(p.saved)} label={`Llevas · ${g.target_cents ? Math.round((100 * p.saved) / g.target_cents) : 0} %`} colour="var(--nv-mint)" />
        <StatTile value={formatMoney(p.remaining)} label="Falta" />
        <StatTile value={p.per_week ? formatMoney(p.per_week) : "—"} label="Por semana para llegar" />
        <StatTile value={data.projection ? shortDate(data.projection) : "—"} label="Proyección (ritmo 30 días)" />
      </div>
      {paceLine(p) && <p className="text-[12px] text-dim">{paceLine(p)}{p.days_left !== null ? ` · faltan ${p.days_left} días` : ""}</p>}
      {data.days.length > 1 && (
        <section className="rounded-xl border border-line bg-card p-4">
          <Label>Ahorro acumulado</Label>
          <LineChart labels={data.days.map((d) => shortDate(d.date))} series={[{ name: "Acumulado", values: cumulative, colour: g.colour }]} format={formatMoney} />
        </section>
      )}
      <Label>Registro de ahorros</Label>
      <MovementTable withDate rows={[...data.movements].reverse().map((m) => ({ kind: "data" as const, m }))} />
      {refs.length > 0 && <p className="text-[11.5px] text-faint">{refs.length} capturas o facturas en estos movimientos (ábrelas desde cada fila).</p>}
      {g.notes && <p className="whitespace-pre-wrap text-[12.5px] text-dim">{g.notes}</p>}
    </div>
  );
}

export function FinGoals() {
  const goalId = useFinance((s) => s.goalId);
  const openGoal = useFinance((s) => s.openGoal);
  const setEditing = useFinance((s) => s.setGoalEditing);
  const version = useFinance((s) => s.version);
  const toast = useApp((s) => s.toast);
  const [data, setData] = useState<Awaited<ReturnType<typeof api.finGoals>> | null>(null);
  useEffect(() => {
    api.finGoals().then(setData).catch((e) => toast("error", (e as Error).message));
  }, [version, toast]);
  if (goalId) return <GoalDetail id={goalId} />;
  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
      <div className="flex items-center gap-3">
        <h1 className="text-[21px] font-semibold text-text">Metas financieras</h1>
        <span className="flex-1" />
        <PrimaryButton onClick={() => setEditing("")}><Plus size={14} /> Nueva meta</PrimaryButton>
      </div>
      <p className="text-[12px] text-faint">Separadas de las metas generales. Actívalas en Diario para ver su casilla «Ahorro …» cada día, semana o mes.</p>
      {data && !data.goals.length && <p className="py-10 text-center text-[13px] text-faint">Aún no hay metas de ahorro. Crea una, por ejemplo «Moto».</p>}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3.5">
        {data?.goals.map((g) => (
          <button key={g.id} type="button" onClick={() => openGoal(g.id)} className="rounded-xl border border-line bg-card p-4 text-left hover:border-line-strong" style={{ borderTop: `3px solid ${g.colour}` }}>
            <div className="flex items-center gap-2.5">
              <span className="text-[22px]">{g.icon}</span>
              <span className="flex-1 text-[15px] font-semibold text-text">{g.name}</span>
              <Chip colour={STATUS_COLOURS[g.status]}>{g.status}</Chip>
            </div>
            <BlockProgress value={g.target_cents ? g.pace.saved / g.target_cents : 0} colour={g.colour} blocks={16} className="mt-3" />
            <div className="mt-2 text-[12.5px] text-text">Llevas {formatMoney(g.pace.saved)} de {formatMoney(g.target_cents)} ({g.target_cents ? Math.round((100 * g.pace.saved) / g.target_cents) : 0} %)</div>
            <div className="text-[12px] text-dim">Falta {formatMoney(g.pace.remaining)}</div>
            {paceLine(g.pace) && <div className="mt-1 text-[11px] text-dim">{paceLine(g.pace)}</div>}
            <div className="mt-1 text-[11px] text-faint">{g.projection ? `Proyección: ${shortDate(g.projection)}` : "Sin ritmo reciente para proyectar"}</div>
            <div className="mt-2 flex text-[11px] text-faint"><span>{cadenceText(g)}</span>{g.deadline && <span className="ml-auto">⏰ {shortDate(g.deadline)}</span>}</div>
          </button>
        ))}
      </div>
      {data && <p className="text-[12.5px] text-dim">Ahorro general (sin meta): {formatMoney(data.general)}</p>}
    </div>
  );
}
