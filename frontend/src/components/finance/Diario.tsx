// Diario: one day's movements, quick entry and the savings checks due that day.

import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  Paperclip,
  Plus,
  Upload,
} from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../lib/bridge";
import { MONTHS_ES } from "../../lib/calendar";
import { addDays } from "../../lib/habits";
import { formatMoney } from "../../lib/money";
import { shortDate, todayIso } from "../../lib/tasks";
import type { FinCategory, FinCheck, Movement, MovementType } from "../../lib/types";
import { useApp } from "../../store/app";
import { useFinance } from "../../store/finance";
import { BlockProgress } from "../common/charts";
import { GhostButton, inputBase, PrimaryButton } from "../common/forms";
import { cn, confirmAction } from "../ui";
import { MoneyInput, MovementTable, Tiles, totals, TYPE_LABELS, type GroupedRow } from "./parts";

const WEEKDAY = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

export function Diario() {
  const meta = useFinance((s) => s.meta);
  const version = useFinance((s) => s.version);
  const edit = useFinance((s) => s.edit);
  const setCategoryEditing = useFinance((s) => s.setCategoryEditing);
  const setImportOpen = useFinance((s) => s.setImportOpen);
  const setExportOpen = useFinance((s) => s.setExportOpen);
  const changed = useFinance((s) => s.changed);
  const toast = useApp((s) => s.toast);
  const [day, setDay] = useState(todayIso());
  const [list, setList] = useState<Movement[]>([]);
  const [checks, setChecks] = useState<FinCheck[]>([]);
  const [q, setQ] = useState<{ type: MovementType; amount: number | null; what: string; category: string }>({ type: "gasto", amount: null, what: "", category: "" });
  const [hint, setHint] = useState("Escribe el importe, en qué y Enter");
  const [month, setMonth] = useState<{ spent: number; budget: number; label: string } | null>(null);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [budgetDraft, setBudgetDraft] = useState<number | null>(null);
  const [categoryBudgets, setCategoryBudgets] = useState<Array<{ category: FinCategory; used: number; budget: number }>>([]);
  const [showCategoryBudgets, setShowCategoryBudgets] = useState(false);

  useEffect(() => {
    api.finDiarioBundle(day)
      .then((b) => {
        setList(b.movements);
        setChecks(b.checks);
        setCategoryBudgets(b.budgets ?? []);
        const d = new Date(`${day}T12:00:00`);
        setMonth({
          spent: b.month.gasto,
          budget: b.budget,
          label: `${MONTHS_ES[d.getMonth()]!.charAt(0).toUpperCase()}${MONTHS_ES[d.getMonth()]!.slice(1)}`,
        });
      })
      .catch((e) => {
        toast("error", (e as Error).message);
        setMonth(null);
      });
  }, [day, version, toast]);

  const handleWhatChange = (val: string) => {
    let nextCat = q.category;
    if (!nextCat && val.trim().length >= 3) {
      const norm = val.toLowerCase().trim();
      const available = q.type === "gasto" ? expenseCats : incomeCats;
      const found = available.find((c) =>
        norm.includes(c.name.toLowerCase().trim()) || c.name.toLowerCase().trim().includes(norm),
      );
      if (found) nextCat = found.id;
    }
    setQ({ ...q, what: val, category: nextCat });
  };

  const quickSave = async () => {
    if (!q.amount) {
      setHint("Escribe un importe: 12.500, 12500 o 12,5k");
      return;
    }
    try {
      await api.finAdd(day, {
        type: q.type,
        amount_cents: q.amount,
        what: q.what.trim(),
        category: q.type === "gasto" || q.type === "ingreso" ? q.category : "",
        reason: "",
      });
      const savedMsg = `${TYPE_LABELS[q.type] || "Movimiento"} registrado: ${formatMoney(q.amount)}${q.what.trim() ? ` · ${q.what.trim()}` : ""}`;
      setHint(`✓ ${savedMsg}`);
      toast("info", savedMsg);
      setQ({ type: q.type, amount: null, what: "", category: q.category });
      await changed();
    } catch (e) {
      setHint((e as Error).message);
    }
  };

  const saveBudget = async () => {
    try {
      await api.finBudgetSet(budgetDraft ?? 0);
      setBudgetOpen(false);
      setBudgetDraft(null);
      await changed();
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };

  const toggleSaving = async (c: FinCheck, on: boolean) => {
    if (on) {
      edit({ day, kind: "ahorro", preset: { type: "ahorro", goal: c.goal.id, amount_cents: c.goal.suggested_cents || undefined, what: `Ahorro ${c.goal.name}` } });
      return;
    }
    if (!(await confirmAction("Quitar ahorro", `¿Quitar el ahorro para «${c.goal.name}» registrado en este periodo? Se eliminarán ${c.ids.length} movimiento${c.ids.length === 1 ? "" : "s"}.`, "Quitar", true))) return;
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
  if (rows.length) rows.push({ kind: "total", label: "GASTOS DEL DÍA", amount: -t.gasto });
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
      {month && month.budget > 0 && (() => {
        const pct = month.spent / month.budget;
        const over = pct >= 1;
        const hot = pct >= 0.8;
        const catsWithBudget = categoryBudgets.filter((b) => b.budget > 0);
        return (
          <div className="rounded-xl border border-line bg-card p-3 space-y-2.5">
            <div className="flex items-center gap-3">
              <span className="text-[12px] text-dim">{month.label}: <b className="font-mono text-text">{formatMoney(month.spent)}</b> de {formatMoney(month.budget)}</span>
              <BlockProgress value={pct} colour={over ? "var(--nv-danger)" : hot ? "#ff9632" : "var(--nv-mint)"} blocks={20} className="flex-1" />
              <span className="font-mono text-[12px]" style={{ color: over ? "var(--nv-danger)" : hot ? "#ff9632" : "var(--nv-dim)" }}>
                {Math.round(pct * 100)} %
              </span>
              <button type="button" onClick={() => { setBudgetDraft(month.budget); setBudgetOpen(true); }}
                className="text-[11px] text-faint hover:text-text">cambiar</button>
              {catsWithBudget.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowCategoryBudgets(!showCategoryBudgets)}
                  className="flex items-center gap-1 text-[11.5px] text-dim hover:text-text rounded-md px-1.5 py-0.5 hover:bg-hover transition-colors"
                >
                  {showCategoryBudgets ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  <span>{catsWithBudget.length} categorías con tope</span>
                </button>
              )}
            </div>

            {/* Expandable category budgets grid */}
            {showCategoryBudgets && catsWithBudget.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 pt-2 border-t border-line/60">
                {catsWithBudget.map((b) => {
                  const bPct = b.budget > 0 ? b.used / b.budget : 0;
                  const bOver = bPct >= 1;
                  const bHot = bPct >= 0.8 && !bOver;
                  return (
                    <div key={b.category.id} className="rounded-lg bg-surface/70 border border-line/50 p-2 space-y-1">
                      <div className="flex items-center justify-between text-[11.5px]">
                        <span className="truncate font-medium text-text">{b.category.icon} {b.category.name}</span>
                        <span className="font-mono text-[10.5px]" style={{ color: bOver ? "var(--nv-danger)" : bHot ? "#ff9632" : "var(--nv-dim)" }}>
                          {Math.round(bPct * 100)}%
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-surface overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${Math.min(100, Math.round(bPct * 100))}%`,
                            backgroundColor: bOver ? "#f2555a" : bHot ? "#ff9632" : "#4ade80",
                          }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] text-faint font-mono">
                        <span>{formatMoney(b.used)}</span>
                        <span>de {formatMoney(b.budget)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}
      {month && month.budget <= 0 && !budgetOpen && (
        <div>
          <button type="button" onClick={() => setBudgetOpen(true)} className="text-[12px] text-faint hover:text-text">
            Define tu presupuesto mensual →
          </button>
        </div>
      )}
      {budgetOpen && (
        <div className="flex items-center gap-2 rounded-xl border border-line bg-card px-4 py-2.5">
          <span className="text-[12px] text-dim">Tope mensual de gasto</span>
          <MoneyInput label="Presupuesto mensual" value={budgetDraft} onChange={setBudgetDraft} className="w-40 py-1.5" onEnter={() => void saveBudget()} />
          <GhostButton onClick={() => void saveBudget()}>Guardar</GhostButton>
          <GhostButton onClick={() => setBudgetOpen(false)}>Cancelar</GhostButton>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2.5">
        <button type="button" onClick={() => edit({ day, kind: q.type })}
          className="rounded-xl border border-line bg-card px-5 py-2 text-[13.5px] font-semibold text-text hover:border-line-strong">
          + Nuevo movimiento</button>
        <button type="button" onClick={() => setImportOpen(true)}
          className="flex items-center gap-1.5 rounded-xl border border-line bg-card px-4 py-2 text-[13px] font-medium text-dim hover:text-text hover:border-line-strong transition-colors">
          <Upload size={14} /> Importar extracto (CSV)
        </button>
        <button type="button" onClick={() => setExportOpen(true, "month")}
          className="flex items-center gap-1.5 rounded-xl border border-line bg-card px-4 py-2 text-[13px] font-medium text-dim hover:text-text hover:border-line-strong transition-colors">
          <Download size={14} /> Exportar / Reporte
        </button>
      </div>
      <div className="rounded-xl border border-line bg-card p-3 shadow-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[10.5px] font-semibold uppercase tracking-wider text-faint">Registro rápido</span>
          <select aria-label="Tipo rápido" className={cn(sel, "w-auto")} value={q.type}
            onChange={(e) => setQ({ ...q, type: e.target.value as MovementType, category: "" })}>
            {(["gasto", "ingreso", "ahorro", "retiro"] as const).map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
          </select>
          <MoneyInput label="Importe rápido" value={q.amount} onChange={(amount) => setQ({ ...q, amount })} className="w-32 py-1.5" onEnter={() => void quickSave()} />
          <input className={cn(sel, "min-w-[140px] flex-1")} placeholder="Detalle" value={q.what} onChange={(e) => handleWhatChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void quickSave()} />
          {(q.type === "gasto" || q.type === "ingreso") && (
            <div className="flex items-center gap-1">
              <select className={cn(sel, "max-w-[150px]")} value={q.category} onChange={(e) => setQ({ ...q, category: e.target.value })}>
                <option value="">Sin categoría</option>
                {(q.type === "gasto" ? expenseCats : incomeCats).map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              </select>
              {/* El vault nace sin categorías: sin este enlace, todo movimiento
                  caía en «Sin categoría» y no había forma de arreglarlo aquí. */}
              <GhostButton title="Crear categoría" onClick={() => setCategoryEditing({ id: "", kind: q.type === "ingreso" ? "ingreso" : "gasto" })}>
                <Plus size={13} />
              </GhostButton>
            </div>
          )}
          <GhostButton title="Abrir el formulario completo para adjuntar la factura"
            onClick={() => edit({ day, kind: q.type, preset: { type: q.type, amount_cents: q.amount ?? undefined, what: q.what, category: q.category },
              onSaved: () => setQ({ type: q.type, amount: null, what: "", category: q.category }) })}><Paperclip size={13} /></GhostButton>
          <PrimaryButton className="py-1 px-3 text-[12.5px]" onClick={() => void quickSave()}>Guardar ↵</PrimaryButton>
        </div>

        {/* Real-time category budget warning / feedback */}
        {(() => {
          if (q.type !== "gasto" || !q.category) return null;
          const bg = categoryBudgets.find((b) => b.category.id === q.category);
          if (!bg || bg.budget <= 0) return null;
          const draftCents = q.amount ?? 0;
          const totalProjected = bg.used + draftCents;
          const limit = bg.budget;
          const pct = limit > 0 ? totalProjected / limit : 0;
          const diff = limit - totalProjected;
          const isOver = totalProjected > limit;
          const isWarning = pct >= 0.8 && !isOver;

          if (isOver) {
            return (
              <div className="mt-2.5 flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-1.5 text-[11.5px] text-red-400">
                <AlertTriangle size={14} className="flex-none text-red-400" />
                <span>
                  <b>{bg.category.icon} {bg.category.name}:</b> Este gasto supera tu tope mensual por <b className="font-mono text-red-300">{formatMoney(Math.abs(diff))}</b> (Total: {formatMoney(totalProjected)} de {formatMoney(limit)})
                </span>
              </div>
            );
          }
          if (isWarning) {
            return (
              <div className="mt-2.5 flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-1.5 text-[11.5px] text-amber-400">
                <AlertCircle size={14} className="flex-none text-amber-400" />
                <span>
                  <b>{bg.category.icon} {bg.category.name}:</b> Cerca del tope mensual ({Math.round(pct * 100)}%): llevas {formatMoney(totalProjected)} de {formatMoney(limit)} · Solo te quedan <b className="font-mono">{formatMoney(diff)}</b>
                </span>
              </div>
            );
          }
          return (
            <div className="mt-2.5 flex items-center gap-2 rounded-lg bg-emerald-500/5 border border-emerald-500/20 px-3 py-1.5 text-[11.5px] text-emerald-400">
              <CheckCircle2 size={14} className="flex-none text-emerald-400" />
              <span>
                <b>{bg.category.icon} {bg.category.name}:</b> Dentro de presupuesto ({Math.round(pct * 100)}%): {formatMoney(totalProjected)} de {formatMoney(limit)} · Quedan <b className="font-mono">{formatMoney(diff)}</b>
              </span>
            </div>
          );
        })()}

        <p className={cn("mt-1.5 text-[11px]", hint.startsWith("✓") ? "text-mint font-medium" : "text-faint")}>{hint}</p>
      </div>
      <Tiles t={t} daily only={["gasto", "ahorro"]} />
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
