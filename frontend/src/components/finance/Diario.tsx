// Diario: one day's movements, quick entry and the savings checks due that day.

import { Paperclip } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../lib/bridge";
import { addDays } from "../../lib/habits";
import { formatMoney } from "../../lib/money";
import { shortDate, todayIso } from "../../lib/tasks";
import type { FinCheck, Movement, MovementType } from "../../lib/types";
import { useApp } from "../../store/app";
import { useFinance } from "../../store/finance";
import { GhostButton, inputBase } from "../common/forms";
import { cn, confirmAction } from "../ui";
import { MoneyInput, MovementTable, Tiles, totals, TYPE_LABELS, type GroupedRow } from "./parts";

const WEEKDAY = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

export function Diario() {
  const meta = useFinance((s) => s.meta);
  const version = useFinance((s) => s.version);
  const edit = useFinance((s) => s.edit);
  const changed = useFinance((s) => s.changed);
  const toast = useApp((s) => s.toast);
  const [day, setDay] = useState(todayIso());
  const [list, setList] = useState<Movement[]>([]);
  const [checks, setChecks] = useState<FinCheck[]>([]);
  const [q, setQ] = useState<{ type: MovementType; amount: number | null; what: string; category: string; reason: string }>({ type: "gasto", amount: null, what: "", category: "", reason: "" });
  const [hint, setHint] = useState("Escribe el importe, en qué y Enter");

  useEffect(() => {
    Promise.all([api.finRange(day, day), api.finDueChecks(day)])
      .then(([ms, cs]) => { setList(ms); setChecks(cs); })
      .catch((e) => toast("error", (e as Error).message));
  }, [day, version, toast]);

  const quickSave = async () => {
    if (!q.amount) {
      setHint("Escribe un importe: 12.500, 12500 o 12,5k");
      return;
    }
    try {
      await api.finAdd(day, { type: q.type, amount_cents: q.amount, what: q.what, category: q.type === "gasto" || q.type === "ingreso" ? q.category : "", reason: q.reason });
      setHint(`Guardado: ${formatMoney(q.amount)}${q.what ? ` · ${q.what}` : ""}`);
      setQ({ type: q.type, amount: null, what: "", category: q.category, reason: "" });
      await changed();
    } catch (e) {
      setHint((e as Error).message);
    }
  };

  const toggleSaving = async (c: FinCheck, on: boolean) => {
    if (on) {
      edit({ day, kind: "ahorro", preset: { type: "ahorro", goal: c.goal.id, amount_cents: c.goal.suggested_cents || undefined, what: `Ahorro ${c.goal.name}` } });
      return;
    }
    if (!(await confirmAction("Quitar ahorro", `¿Quitar el ahorro para «${c.goal.name}» registrado en este periodo?`, "Quitar", true))) return;
    try {
      const inRange = await api.finRange(c.first, c.last);
      await api.finDeleteMany(inRange.filter((m) => c.ids.includes(m.id)).map((m) => [m.date, m.id] as [string, string]));
      await changed();
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };

  const sorted = [...list].sort((a, b) => (a.time ?? "99").localeCompare(b.time ?? "99") || (a.created ?? "").localeCompare(b.created ?? ""));
  const t = totals(list);
  const rows: GroupedRow[] = sorted.map((m) => ({ kind: "data", m }));
  if (rows.length) rows.push({ kind: "total", label: "TOTAL DEL DÍA", amount: t.balance });
  const d = new Date(`${day}T12:00:00`);
  const expenseCats = (meta?.categories ?? []).filter((c) => c.kind === "gasto" && !c.archived);
  const incomeCats = (meta?.categories ?? []).filter((c) => c.kind === "ingreso" && !c.archived);
  const sel = cn(inputBase, "py-1.5");

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
      <div className="flex items-center gap-3">
        <h1 className="text-[21px] font-semibold text-text">Diario</h1>
        <span className="text-[14px] capitalize text-dim">{WEEKDAY[d.getDay()]} {shortDate(day)}</span>
        <span className="flex-1" />
        <GhostButton onClick={() => setDay(addDays(day, -1))}>‹</GhostButton>
        <GhostButton onClick={() => setDay(todayIso())}>Hoy</GhostButton>
        <GhostButton onClick={() => setDay(addDays(day, 1))}>›</GhostButton>
      </div>
      <div className="flex gap-2.5">
        <button type="button" onClick={() => edit({ day, kind: q.type })}
          className="rounded-xl border border-line bg-card px-6 py-2.5 text-[14px] font-semibold text-text hover:border-line-strong">
          + Nuevo movimiento</button>
      </div>
      <div className="rounded-xl border border-line bg-card p-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10.5px] font-semibold uppercase tracking-wider text-faint">Registro rápido</span>
          <select aria-label="Tipo rápido" className={cn(sel, "w-auto")} value={q.type}
            onChange={(e) => setQ({ ...q, type: e.target.value as MovementType, category: "" })}>
            {(["gasto", "ingreso", "ahorro", "retiro"] as const).map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
          </select>
          <MoneyInput label="Importe rápido" value={q.amount} onChange={(amount) => setQ({ ...q, amount })} className="w-32 py-1.5" onEnter={() => void quickSave()} />
          <input className={cn(sel, "min-w-0 flex-1")} placeholder="En qué" value={q.what} onChange={(e) => setQ({ ...q, what: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && void quickSave()} />
          {(q.type === "gasto" || q.type === "ingreso") && (
            <select className={sel} value={q.category} onChange={(e) => setQ({ ...q, category: e.target.value })}>
              <option value="">Sin categoría</option>
              {(q.type === "gasto" ? expenseCats : incomeCats).map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
            </select>
          )}
          <input className={cn(sel, "w-48")} placeholder="Razón (opcional)" value={q.reason} onChange={(e) => setQ({ ...q, reason: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && void quickSave()} />
          <GhostButton title="Abrir el formulario completo para adjuntar la factura"
            onClick={() => edit({ day, kind: q.type, preset: { type: q.type, amount_cents: q.amount ?? undefined, what: q.what, category: q.category, reason: q.reason },
              onSaved: () => setQ({ type: q.type, amount: null, what: "", category: q.category, reason: "" }) })}><Paperclip size={13} /></GhostButton>
          <GhostButton onClick={() => void quickSave()}>Guardar ↵</GhostButton>
        </div>
        <p className="mt-1.5 text-[11px] text-faint">{hint}</p>
      </div>
      <Tiles t={t} dayLabel="Balance del día" />
      {checks.length > 0 && (
        <section className="rounded-xl border border-line bg-card p-3">
          <div className="mb-2 font-mono text-[10.5px] font-semibold uppercase tracking-wider text-faint">Ahorros de hoy</div>
          {checks.map((c) => {
            const period = c.goal.cadence.mode === "period" ? (c.goal.cadence.period === "week" ? " (esta semana)" : " (este mes)") : "";
            const pct = c.goal.target_cents ? Math.round((100 * c.pace.saved) / c.goal.target_cents) : 0;
            return (
              <label key={c.goal.id} className="flex items-center gap-2.5 py-1 text-[13px]">
                <input type="checkbox" checked={c.checked} style={{ accentColor: c.goal.colour }} aria-label={`Ahorro ${c.goal.name}`}
                  onChange={(e) => void toggleSaving(c, e.target.checked)} />
                <span className={c.checked ? "text-faint" : "text-text"}>{c.goal.icon} Ahorro {c.goal.name}{period}</span>
                {c.goal.suggested_cents > 0 && <span className="text-[12px] text-dim">— {formatMoney(c.goal.suggested_cents)}</span>}
                <span className="ml-auto text-[11px] text-faint">llevas {formatMoney(c.pace.saved)} de {formatMoney(c.goal.target_cents)} ({pct} %)</span>
              </label>
            );
          })}
        </section>
      )}
      <MovementTable rows={rows} />
    </div>
  );
}
