// Semanal, Mensual and Anual: filters, tables, charts, CSV export and sums.

import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/bridge";
import { MONTHS_ES, WEEKDAYS_ES } from "../../lib/calendar";
import { parseRepeat } from "../../lib/tasks";
import { addDays, daysBetween, monthBounds, parseIso, weekStart } from "../../lib/habits";
import { formatMoney } from "../../lib/money";
import { isoDate, todayIso } from "../../lib/tasks";
import type { FinCategory, FinTotals, Movement } from "../../lib/types";
import { useApp } from "../../store/app";
import { useFinance } from "../../store/finance";
import { BarList, Columns, Donut, LineChart } from "../common/charts";
import { GhostButton, inputBase } from "../common/forms";
import { Panel } from "../common/StatTile";
import { cn } from "../ui";
import { categoryText, exportCsv, MovementTable, signed, Tiles, totals, TYPE_COLOURS, TYPE_LABELS, type GroupedRow } from "./parts";

type Kind = "semanal" | "mensual" | "anual";

function bounds(kind: Kind, anchor: string): [string, string] {
  if (kind === "semanal") return [weekStart(anchor), addDays(weekStart(anchor), 6)];
  const d = parseIso(anchor);
  if (kind === "mensual") return monthBounds(d.getFullYear(), d.getMonth());
  return [`${d.getFullYear()}-01-01`, `${d.getFullYear()}-12-31`];
}

function step(kind: Kind, anchor: string, delta: number): string {
  if (delta === 0) return todayIso();
  if (kind === "semanal") return addDays(anchor, 7 * delta);
  const d = parseIso(anchor);
  if (kind === "mensual") return isoDate(new Date(d.getFullYear(), d.getMonth() + delta, 1));
  return `${d.getFullYear() + delta}-01-01`;
}

function periodLabel(kind: Kind, a: string, b: string): string {
  const A = parseIso(a);
  const B = parseIso(b);
  if (kind === "semanal") return `${A.getDate()} ${MONTHS_ES[A.getMonth()]!.slice(0, 3)} – ${B.getDate()} ${MONTHS_ES[B.getMonth()]!.slice(0, 3)} ${B.getFullYear()}`;
  if (kind === "mensual") return `${MONTHS_ES[A.getMonth()]!.charAt(0).toUpperCase()}${MONTHS_ES[A.getMonth()]!.slice(1)} de ${A.getFullYear()}`;
  return String(A.getFullYear());
}

function dayLabel(iso: string): string {
  const d = parseIso(iso);
  const w = WEEKDAYS_ES[(d.getDay() + 6) % 7]!;
  return `${w.charAt(0).toUpperCase()}${w.slice(1)} ${d.getDate()} de ${MONTHS_ES[d.getMonth()]}`;
}

function groupedRows(list: Movement[]): GroupedRow[] {
  const by = new Map<string, Movement[]>();
  for (const m of list) by.set(m.date, [...(by.get(m.date) ?? []), m]);
  const rows: GroupedRow[] = [];
  for (const d of [...by.keys()].sort()) {
    const ms = by.get(d)!.sort((a, b) => (a.time ?? "99").localeCompare(b.time ?? "99") || (a.created ?? "").localeCompare(b.created ?? ""));
    rows.push({ kind: "group", label: dayLabel(d) });
    rows.push(...ms.map((m) => ({ kind: "data" as const, m })));
    const t = totals(ms);
    rows.push({ kind: "subtotal", label: `Subtotal · gastos ${formatMoney(t.gasto)} · ingresos ${formatMoney(t.ingreso)}`, amount: t.balance });
  }
  if (list.length) rows.push({ kind: "total", label: "TOTAL", amount: totals(list).balance });
  return rows;
}

/** Categorías × columnas (días o meses), con totales. Respeta el filtro de tipo.
 * Las celdas guardan importe con signo (gasto/ahorro restan) para que el
 * TOTAL sea neto y no una suma bruta de gastos + ingresos. */
export function CategoryMatrix({ list, columns, keyOf, cats }: {
  list: Movement[]; columns: Array<[string, string]>; keyOf: (m: Movement) => string; cats: FinCategory[];
}) {
  const curr = useFinance((s) => s.meta?.currency);
  const rows = new Map<string, { type: string; category: string; cells: Record<string, number> }>();
  for (const m of list) {
    const k = `${m.type}:${m.category ?? ""}`;
    const r = rows.get(k) ?? { type: m.type, category: m.category ?? "", cells: {} };
    const v = (m.type === "gasto" || m.type === "ahorro" ? -1 : 1) * m.amount_cents;
    r.cells[keyOf(m)] = (r.cells[keyOf(m)] ?? 0) + v;
    r.cells._total = (r.cells._total ?? 0) + v;
    rows.set(k, r);
  }
  const sorted = [...rows.entries()].sort((a, b) => Math.abs(b[1].cells._total ?? 0) - Math.abs(a[1].cells._total ?? 0));
  const tpl = `180px repeat(${columns.length}, minmax(76px, 1fr)) 110px`;
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-card">
      <div className="grid min-w-max border-b border-line px-3 py-1.5 font-mono text-[10px] uppercase text-faint" style={{ gridTemplateColumns: tpl }}>
        <span>Categoría</span>{columns.map(([k, l]) => <span key={k} className="text-right">{l}</span>)}<span className="text-right">Total</span>
      </div>
      {sorted.map(([k, r]) => {
        const c = cats.find((x) => x.id === r.category);
        return (
          <div key={k} className="grid min-w-max border-b border-line px-3 py-1.5 text-[12px]" style={{ gridTemplateColumns: tpl }}>
            <span className="truncate text-dim">{c ? `${c.icon} ${c.name}` : "Sin categoría"} <span className="text-faint">· {TYPE_LABELS[r.type as keyof typeof TYPE_LABELS]}</span></span>
            {columns.map(([col]) => <span key={col} className="text-right font-mono text-text">{r.cells[col] ? formatMoney(Math.abs(r.cells[col]!)) : ""}</span>)}
            <span className="text-right font-mono font-semibold text-text">{formatMoney(Math.abs(r.cells._total ?? 0))}</span>
          </div>
        );
      })}
      {sorted.length > 0 && (() => {
        const colNet = (col: string) => sorted.reduce((a, [, r]) => a + (r.cells[col] ?? 0), 0);
        const grand = sorted.reduce((a, [, r]) => a + (r.cells._total ?? 0), 0);
        return (
          <div className="grid min-w-max px-3 py-1.5 text-[12px] font-semibold" style={{ gridTemplateColumns: tpl }}>
            <span>NETO</span>
            {columns.map(([k]) => {
              const v = colNet(k);
              return <span key={k} className="text-right font-mono" style={{ color: v >= 0 ? "var(--nv-mint)" : "var(--nv-danger)" }}>{formatMoney(v, curr, true)}</span>;
            })}
            <span className="text-right font-mono" style={{ color: grand >= 0 ? "var(--nv-mint)" : "var(--nv-danger)" }}>{formatMoney(grand, curr, true)}</span>
          </div>
        );
      })()}
      {!sorted.length && <div className="p-6 text-center text-[13px] text-faint">Sin movimientos en este periodo.</div>}
    </div>
  );
}

function MonthExtras({ first, list, cats, onSelectCat }: {
  first: string; list: Movement[]; cats: FinCategory[]; onSelectCat?: (id: string) => void;
}) {
  const version = useFinance((s) => s.version);
  const [extras, setExtras] = useState<Awaited<ReturnType<typeof api.finMonthExtras>> | null>(null);
  const d = parseIso(first);
  useEffect(() => {
    api.finMonthExtras(d.getFullYear(), d.getMonth() + 1).then(setExtras).catch(() => setExtras(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [first, version]);
  const days = daysBetween(first, monthBounds(d.getFullYear(), d.getMonth())[1]);
  const spent = days.map((day) => list.filter((m) => m.date === day && m.type === "gasto").reduce((a, m) => a + m.amount_cents, 0));
  const byCat = new Map<string, number>();
  for (const m of list) if (m.type === "gasto") byCat.set(m.category ?? "", (byCat.get(m.category ?? "") ?? 0) + m.amount_cents);
  const parts = [...byCat.entries()].sort((a, b) => b[1] - a[1]).map(([cid, v]) => {
    const c = cats.find((x) => x.id === cid);
    return { id: cid, name: `${c ? c.name : "Sin categoría"}: ${formatMoney(v)}`, value: v, colour: c?.colour ?? "#616161" };
  });
  const cmp = (key: keyof FinTotals, label: string) => {
    if (!extras) return null;
    const a = extras.this[key];
    const b = extras.prev[key];
    const diff = a - b;
    return (
      <div key={key} className="flex items-center gap-2 text-[12.5px]">
        <span className="w-20 text-dim">{label}</span>
        <span className="font-mono text-text">{formatMoney(a)}</span>
        <span className="text-[11px] text-faint">antes {formatMoney(b)}</span>
        {b !== 0 && <span className="ml-auto font-mono text-[11px]" style={{ color: (key === "gasto" ? diff <= 0 : diff >= 0) ? "var(--nv-mint)" : "var(--nv-danger)" }}>
          {diff >= 0 ? "+" : ""}{Math.round((diff / Math.abs(b)) * 100)} %</span>}
      </div>
    );
  };
  return (
    <>
      <div className="grid grid-cols-[3fr_2fr] gap-4">
        <Panel title="Gasto por día"><Columns values={spent} labels={days.map((x) => String(Number(x.slice(8))))} colour={TYPE_COLOURS.gasto} format={formatMoney} /></Panel>
        <Panel title="Gasto por categoría">
          <div className="flex items-center gap-4">
            <Donut parts={parts} size={140} label={formatMoney([...byCat.values()].reduce((a, b) => a + b, 0))} />
            <ul className="min-w-0 space-y-0.5 text-[11.5px] text-dim">
              {parts.slice(0, 7).map((p) => (
                <li key={p.name} className="flex items-center gap-1.5 truncate">
                  <button type="button" onClick={() => p.id && onSelectCat?.(p.id)} title="Ver evolución"
                    className="flex items-center gap-1.5 truncate text-left hover:text-text">
                    <span className="h-2 w-2 flex-none rounded-sm" style={{ background: p.colour }} />
                    {p.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </Panel>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Panel title="Presupuesto por categoría">
          {!extras?.budgets.length && <p className="text-[12px] text-faint">Define presupuestos mensuales en Categorías.</p>}
          <BarList rows={(extras?.budgets ?? []).filter((b) => b.budget).map((b) => ({
            label: `${b.category.icon} ${b.category.name}`, value: Math.min(1, b.used / b.budget), colour: b.used > b.budget ? "var(--nv-danger)" : b.category.colour,
            hint: `${formatMoney(b.used)} / ${formatMoney(b.budget)}`,
          }))} max={1} />
          {(extras?.budgets ?? []).filter((b) => !b.budget).map((b) => (
            <div key={b.category.id} className="mt-1 flex text-[12px] text-dim"><span className="flex-1">{b.category.icon} {b.category.name}</span><span className="font-mono">{formatMoney(b.used)}</span></div>
          ))}
        </Panel>
        <Panel title="Comparación con el mes anterior">
          <div className="space-y-1.5">{cmp("gasto", "Gastos")}{cmp("ingreso", "Ingresos")}{cmp("ahorro", "Ahorro")}{cmp("balance", "Balance")}</div>
        </Panel>
      </div>
      <FixedVsVariable monthGasto={extras?.this.gasto ?? 0} monthIngreso={extras?.this.ingreso ?? 0} firstDay={first} />
    </>
  );
}

/** Rango del periodo anterior (semana/año; el mes lo cubre MonthExtras). */
function prevRange(kind: Kind, first: string): [string, string] | null {
  if (kind === "semanal") return [addDays(first, -7), addDays(first, -1)];
  if (kind === "anual") {
    const y = parseIso(first).getFullYear();
    return [`${y - 1}-01-01`, `${y - 1}-12-31`];
  }
  return null;
}

/** Comparación con el periodo anterior para semana y año, con los filtros vigentes. */
function PrevCompare({ kind, first, current, fKind, fCat }: {
  kind: Kind; first: string; current: FinTotals; fKind: string; fCat: string;
}) {
  const version = useFinance((s) => s.version);
  const [prev, setPrev] = useState<FinTotals | null>(null);
  useEffect(() => {
    const b = prevRange(kind, first);
    if (!b) return;
    const match = (m: Movement) => (!fKind || m.type === fKind) && (!fCat || m.category === fCat);
    api.finRange(b[0], b[1]).then((ms) => setPrev(totals(ms.filter(match)))).catch(() => setPrev(null));
  }, [kind, first, fKind, fCat, version]);
  if (!prev) return null;
  const rows: Array<[keyof FinTotals, string]> = [["gasto", "Gastos"], ["ingreso", "Ingresos"], ["ahorro", "Ahorro"], ["balance", "Balance"]];
  return (
    <Panel title={`Comparación con ${kind === "semanal" ? "la semana anterior" : "el año anterior"}`}>
      <div className="space-y-1.5">
        {rows.map(([key, label]) => {
          const a = current[key];
          const b = prev[key];
          const diff = a - b;
          return (
            <div key={key} className="flex items-center gap-2 text-[12.5px]">
              <span className="w-20 text-dim">{label}</span>
              <span className="font-mono text-text">{formatMoney(a)}</span>
              <span className="text-[11px] text-faint">antes {formatMoney(b)}</span>
              {b !== 0 && <span className="ml-auto font-mono text-[11px]" style={{ color: (key === "gasto" ? diff <= 0 : diff >= 0) ? "var(--nv-mint)" : "var(--nv-danger)" }}>
                {diff >= 0 ? "+" : ""}{Math.round((diff / Math.abs(b)) * 100)} %</span>}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

/** Balance acumulado mes a mes (la primera gráfica del módulo que no es de gastos). */
export function BalanceAccumulated({ yearRows }: { yearRows: FinTotals[] }) {
  let acc = 0;
  const cumulative = yearRows.map((r) => (acc += r.balance));
  const last = cumulative[cumulative.length - 1] ?? 0;
  return (
    <Panel title="Balance acumulado">
      <LineChart
        labels={MONTHS_ES.map((m) => m.slice(0, 3))}
        series={[{ name: "Balance", values: cumulative, colour: last >= 0 ? "var(--nv-mint)" : "var(--nv-danger)" }]}
        format={formatMoney}
      />
    </Panel>
  );
}

/** Equivalente mensual con signo (gasto/ahorro restan) de una regla. */
export function monthlySigned(rule: string, type: string, amount_cents: number): number {
  const r = parseRepeat(rule);
  const per = r.kind === "daily" ? 30
    : r.kind === "every" ? 30 / Math.max(2, r.every)
    : r.kind === "weekly" || r.kind === "workdays" ? (r.weekdays.length * 30) / 7
    : r.kind === "monthly" ? Math.max(1, r.monthDays.length)
    : 0;
  const sign = type === "gasto" || type === "ahorro" ? -1 : 1;
  return Math.round(sign * amount_cents * per) || 0;
}

/** Promedio mensual sobre los meses con datos (no siempre 3). */
export function monthlyAverages(ms: Movement[]): { n: number; gasto: number; ingreso: number } {
  const byMonth = new Map<string, FinTotals>();
  for (const m of ms) {
    const k = m.date.slice(0, 7);
    const acc = byMonth.get(k) ?? { gasto: 0, ingreso: 0, ahorro: 0, retiro: 0, balance: 0, neto: 0, disponible: 0 };
    const tt = totals([m]);
    acc.gasto += tt.gasto;
    acc.ingreso += tt.ingreso;
    byMonth.set(k, acc);
  }
  const months = [...byMonth.values()];
  const n = Math.max(1, months.length);
  return {
    n,
    gasto: Math.round(months.reduce((a, r) => a + r.gasto, 0) / n),
    ingreso: Math.round(months.reduce((a, r) => a + r.ingreso, 0) / n),
  };
}

/** Estructura mensual de gastos: Fijos (recurrentes) vs Variables (% de ingresos). */
export function FixedVsVariable({ monthGasto, monthIngreso, firstDay }: {
  monthGasto: number; monthIngreso: number; firstDay: string;
}) {
  const version = useFinance((s) => s.version);
  const curr = useFinance((s) => s.meta?.currency);
  const [fixedAmount, setFixedAmount] = useState<number | null>(null);

  useEffect(() => {
    api.finRecurringList()
      .then((recs) => {
        const live = recs.filter((r) => !r.archived && r.type === "gasto");
        const sum = live.reduce((acc, r) => acc + Math.abs(monthlySigned(r.rule, r.type, r.amount_cents)), 0);
        setFixedAmount(sum);
      })
      .catch(() => setFixedAmount(0));
  }, [version, firstDay]);

  if (fixedAmount === null) return null;

  const fijos = fixedAmount;
  const variables = Math.max(0, monthGasto - fijos);
  const totalIngreso = monthIngreso;
  const libre = Math.max(0, totalIngreso - monthGasto);

  const pctFijos = totalIngreso > 0 ? Math.min(100, Math.round((fijos / totalIngreso) * 100)) : 0;
  const pctVars = totalIngreso > 0 ? Math.min(100 - pctFijos, Math.round((variables / totalIngreso) * 100)) : 0;
  const pctLibre = totalIngreso > 0 ? Math.max(0, 100 - pctFijos - pctVars) : 0;

  return (
    <Panel title="Estructura de gastos · Fijos vs Variables">
      <div className="space-y-3">
        {totalIngreso > 0 ? (
          <>
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-elevated">
              {pctFijos > 0 && <div style={{ width: `${pctFijos}%`, background: "#ff9632" }} title={`Fijos: ${formatMoney(fijos, curr)} (${pctFijos}%)`} />}
              {pctVars > 0 && <div style={{ width: `${pctVars}%`, background: "var(--nv-danger)" }} title={`Variables: ${formatMoney(variables, curr)} (${pctVars}%)`} />}
              {pctLibre > 0 && <div style={{ width: `${pctLibre}%`, background: "var(--nv-mint)" }} title={`Libre / Ahorro: ${formatMoney(libre, curr)} (${pctLibre}%)`} />}
            </div>
            <div className="grid grid-cols-3 gap-2 text-[12px]">
              <div>
                <div className="flex items-center gap-1.5 font-medium text-faint">
                  <span className="h-2 w-2 rounded-full" style={{ background: "#ff9632" }} /> Fijos
                </div>
                <div className="font-mono font-semibold text-text">{formatMoney(fijos, curr)}</div>
                <div className="text-[11px] text-faint">{pctFijos}% del ingreso</div>
              </div>
              <div>
                <div className="flex items-center gap-1.5 font-medium text-faint">
                  <span className="h-2 w-2 rounded-full" style={{ background: "var(--nv-danger)" }} /> Variables
                </div>
                <div className="font-mono font-semibold text-text">{formatMoney(variables, curr)}</div>
                <div className="text-[11px] text-faint">{pctVars}% del ingreso</div>
              </div>
              <div>
                <div className="flex items-center gap-1.5 font-medium text-faint">
                  <span className="h-2 w-2 rounded-full" style={{ background: "var(--nv-mint)" }} /> Libre
                </div>
                <div className="font-mono font-semibold text-text">{formatMoney(libre, curr)}</div>
                <div className="text-[11px] text-faint">{pctLibre}% del ingreso</div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-between text-[12px]">
            <div>
              <span className="text-faint">Fijos estimados: </span>
              <b className="font-mono text-text">{formatMoney(fijos, curr)}</b>
            </div>
            <div>
              <span className="text-faint">Variables del mes: </span>
              <b className="font-mono text-text">{formatMoney(variables, curr)}</b>
            </div>
            <span className="text-[11px] text-faint">Sin ingresos registrados en el mes</span>
          </div>
        )}
      </div>
    </Panel>
  );
}

/** Evolución temporal de una categoría específica en los últimos 6 meses. */
export function CategoryTrend({ category, anchor }: { category: FinCategory; anchor: string }) {
  const version = useFinance((s) => s.version);
  const curr = useFinance((s) => s.meta?.currency);
  const [history, setHistory] = useState<Movement[]>([]);
  const d = parseIso(anchor);

  useEffect(() => {
    const first = isoDate(new Date(d.getFullYear(), d.getMonth() - 5, 1));
    const last = monthBounds(d.getFullYear(), d.getMonth())[1];
    api.finRange(first, last)
      .then(setHistory)
      .catch(() => setHistory([]));
  }, [anchor, category.id, version]);

  const catMovements = history.filter((m) => m.category === category.id && m.type === "gasto");
  const monthsData = [5, 4, 3, 2, 1, 0].map((offset) => {
    const dt = new Date(d.getFullYear(), d.getMonth() - offset, 1);
    const key = isoDate(dt).slice(0, 7);
    const label = MONTHS_ES[dt.getMonth()]!.slice(0, 3);
    const spent = catMovements.filter((m) => m.date.startsWith(key)).reduce((acc, m) => acc + m.amount_cents, 0);
    return { key, label, spent };
  });

  const values = monthsData.map((m) => m.spent);
  const labels = monthsData.map((m) => m.label);
  const total = values.reduce((a, b) => a + b, 0);
  const activeMonths = monthsData.filter((m) => m.spent > 0).length || 1;
  const avg = Math.round(total / activeMonths);
  const maxItem = monthsData.reduce((prev, cur) => (cur.spent > prev.spent ? cur : prev), monthsData[0]!);
  const currentMonthSpent = values[5] ?? 0;
  const diffPct = avg > 0 && currentMonthSpent > 0 ? Math.round(((currentMonthSpent - avg) / avg) * 100) : null;

  return (
    <Panel title={`Evolución de ${category.icon} ${category.name} · Últimos 6 meses`}>
      <div className="space-y-3">
        <Columns values={values} labels={labels} colour={category.colour || TYPE_COLOURS.gasto} format={(v) => formatMoney(v, curr)} height={100} />
        <div className="grid grid-cols-3 gap-3 border-t border-line pt-2 text-[12px]">
          <div>
            <div className="text-[11px] text-faint">Promedio mensual</div>
            <div className="font-mono font-semibold text-text">{formatMoney(avg, curr)}</div>
          </div>
          <div>
            <div className="text-[11px] text-faint">Mes pico ({maxItem?.label})</div>
            <div className="font-mono font-semibold text-text">{formatMoney(maxItem?.spent ?? 0, curr)}</div>
          </div>
          <div>
            <div className="text-[11px] text-faint">Este mes vs promedio</div>
            <div className="font-mono font-semibold" style={{ color: diffPct === null ? "var(--nv-dim)" : diffPct > 0 ? "var(--nv-danger)" : "var(--nv-mint)" }}>
              {diffPct !== null ? `${diffPct >= 0 ? "+" : ""}${diffPct}%` : "—"}
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}

/** Proyección a 3 meses: promedio de los meses cerrados con datos + recurrentes activos. */
export function Projection3m() {
  const version = useFinance((s) => s.version);
  const curr = useFinance((s) => s.meta?.currency);
  const [proj, setProj] = useState<{
    baseGasto: number; baseIngreso: number; basis: number; hasRec: boolean;
    recFor: (firstDay: string, lastDay: string) => { rg: number; ri: number; ro: number };
  } | null>(null);
  useEffect(() => {
    const t = new Date();
    const first = isoDate(new Date(t.getFullYear(), t.getMonth() - 3, 1));
    const last = isoDate(new Date(t.getFullYear(), t.getMonth(), 0));
    Promise.all([api.finRange(first, last), api.finRecurringList()])
      .then(([ms, recs]) => {
        const avg = monthlyAverages(ms);
        const live = recs.filter((x) => !x.archived);
        // Aporte de recurrentes por mes: los terminados no proyectan.
        const recFor = (firstDay: string, lastDay: string) => {
          let rg = 0;
          let ri = 0;
          let ro = 0;
          for (const r of live) {
            if (r.start > lastDay) continue;
            if (r.end && r.end < firstDay) continue;
            const v = monthlySigned(r.rule, r.type, r.amount_cents);
            if (r.type === "gasto") rg += -v;
            else if (r.type === "ingreso") ri += v;
            else ro += v;
          }
          return { rg, ri, ro };
        };
        setProj({
          baseGasto: avg.gasto, baseIngreso: avg.ingreso, basis: avg.n, hasRec: live.length > 0, recFor,
        });
      })
      .catch(() => setProj(null));
  }, [version]);
  const t = new Date();
  const next = [1, 2, 3].map((i) => new Date(t.getFullYear(), t.getMonth() + i, 1));
  const empty = !proj || (proj.baseGasto === 0 && proj.baseIngreso === 0 && !proj.hasRec);
  return (
    <Panel title="Proyección 3 meses">
      {empty ? (
        <p className="text-[12px] text-faint">Sin datos suficientes para proyectar.</p>
      ) : (
        <>
          <div className="space-y-1.5">
            {next.map((d) => {
              const firstDay = isoDate(new Date(d.getFullYear(), d.getMonth(), 1));
              const lastDay = isoDate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
              const rec = proj!.recFor(firstDay, lastDay);
              const gasto = proj!.baseGasto + rec.rg;
              const ingreso = proj!.baseIngreso + rec.ri;
              const net = ingreso - gasto + rec.ro;
              return (
                <div key={d.toISOString()} className="flex items-center gap-2 text-[12.5px]">
                  <span className="w-24 capitalize text-dim">{MONTHS_ES[d.getMonth()]}</span>
                  <span className="font-mono text-text">{formatMoney(net, curr, true)}</span>
                  <span className="text-[11px] text-faint">≈ {formatMoney(ingreso)} − {formatMoney(gasto)}</span>
                </div>
              );
            })}
          </div>
          <p className="mt-1.5 text-[11px] text-faint">
            Promedio de {proj!.basis >= 3 ? "los últimos 3 meses cerrados" : `${proj!.basis} ${proj!.basis === 1 ? "mes con datos" : "meses con datos"}`} + recurrentes activos ese mes.
          </p>
        </>
      )}
    </Panel>
  );
}

export function Sheet() {
  const meta = useFinance((s) => s.meta);
  const version = useFinance((s) => s.version);
  const toast = useApp((s) => s.toast);
  const [kind, setKind] = useState<Kind>("mensual");
  const [anchor, setAnchor] = useState(todayIso());
  const [all, setAll] = useState<Movement[]>([]);
  const [fKind, setFKind] = useState("");
  const [fCat, setFCat] = useState("");
  const [q, setQ] = useState("");
  const [mode, setMode] = useState<"mov" | "cat">("mov");
  const [history, setHistory] = useState(false);
  const [found, setFound] = useState<{ total: number; movements: Movement[] } | null>(null);
  const [first, last] = bounds(kind, anchor);
  const cats = meta?.categories ?? [];

  useEffect(() => {
    api.finRange(first, last).then(setAll).catch((e) => toast("error", (e as Error).message));
  }, [first, last, version, toast]);

  // Búsqueda global: el filtro local solo ve el rango cargado.
  useEffect(() => {
    if (!history || !q.trim()) {
      setFound(null);
      return;
    }
    api.finSearch(q.trim(), fKind, fCat, 0)
      .then(setFound)
      .catch((e) => {
        toast("error", (e as Error).message);
        setFound(null);
      });
  }, [history, q, fKind, fCat, version, toast]);

  const moreResults = () => {
    if (!found || found.movements.length >= found.total) return;
    api.finSearch(q.trim(), fKind, fCat, found.movements.length)
      .then((r) => setFound((prev) => prev ? { total: r.total, movements: [...prev.movements, ...r.movements] } : r))
      .catch((e) => toast("error", (e as Error).message));
  };

  const list = useMemo(() => all.filter((m) => (!fKind || m.type === fKind) && (!fCat || m.category === fCat)
    && (!q || `${m.what ?? ""} ${m.reason ?? ""}`.toLowerCase().includes(q.toLowerCase()))), [all, fKind, fCat, q]);
  const t = totals(list);
  const sel = cn(inputBase, "py-1 text-[12px]");

  const csv = async () => {
    // Exporta lo visible: el historial trae lo cargado con "Mostrar más".
    const global = history && q.trim() && found ? found.movements : null;
    const source = global ?? list;
    const rows = [...source].sort((a, b) => a.date.localeCompare(b.date)).map((m) => [
      m.date, m.time ?? "", TYPE_LABELS[m.type], categoryText(m),
      [m.what, m.reason].filter(Boolean).join(" — "), (signed(m) / 100).toFixed(2)]);
    try {
      const r = await exportCsv(global ? `finanzas_busqueda_${q.trim()}.csv` : `finanzas_${first}_${last}.csv`,
        ["Fecha", "Hora", "Tipo", "Categoría", "Detalle", "Importe"], rows);
      if (r.ok) toast("info", `Exportado: ${r.path}`);
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };

  const months = Array.from({ length: 12 }, (_, i) => i);
  const yearRows = months.map((m) => totals(list.filter((x) => parseIso(x.date).getMonth() === m)));

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
      <div className="flex items-center gap-3">
        <h1 className="text-[21px] font-semibold text-text">Periodo</h1>
        <div className="flex gap-1" role="group" aria-label="Rango del periodo">
          {(["semanal", "mensual", "anual"] as const).map((k) => (
            <button key={k} type="button" aria-pressed={kind === k}
              onClick={() => setKind(k)}
              className={cn("rounded-lg border px-2.5 py-1 text-[12.5px]",
                kind === k ? "border-line-strong bg-elevated text-text" : "border-line text-dim hover:bg-hover")}>
              {k === "semanal" ? "Semana" : k === "mensual" ? "Mes" : "Año"}
            </button>
          ))}
        </div>
        <span className="text-[15px] font-semibold text-dim">{periodLabel(kind, first, last)}</span>
        <span className="flex-1" />
        <GhostButton onClick={() => setAnchor(step(kind, anchor, -1))}>‹</GhostButton>
        <GhostButton onClick={() => setAnchor(step(kind, anchor, 0))}>Hoy</GhostButton>
        <GhostButton onClick={() => setAnchor(step(kind, anchor, 1))}>›</GhostButton>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {kind !== "anual" && (
          <select className={sel} value={mode} onChange={(e) => setMode(e.target.value as "mov" | "cat")}>
            <option value="mov">Por movimiento</option><option value="cat">Por categoría</option>
          </select>
        )}
        <select className={sel} value={fKind} onChange={(e) => setFKind(e.target.value)}>
          <option value="">Tipo: todos</option>{(meta?.types ?? []).map((k) => <option key={k} value={k}>{TYPE_LABELS[k]}</option>)}
        </select>
        <select className={sel} value={fCat} onChange={(e) => setFCat(e.target.value)}>
          <option value="">Categoría: todas</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
        </select>
        <input className={cn(sel, "w-60")} placeholder="🔎 Buscar en qué o razón…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="button" aria-pressed={history} title="Buscar en todo el historial, no solo este periodo"
          onClick={() => setHistory((v) => !v)}
          className={cn("rounded-lg border px-2.5 py-1 text-[12px]",
            history ? "border-line-strong bg-elevated text-text" : "border-line text-dim hover:bg-hover")}>
          Historial
        </button>
        <span className="flex-1" />
        <GhostButton onClick={() => void csv()}>Exportar CSV</GhostButton>
      </div>
      {history && q.trim() ? (
        <>
          <p className="text-[12.5px] text-dim">
            {found ? <><b className="font-mono text-text">{found.total}</b> resultados en todo el historial · mostrando {found.movements.length}</> : "Buscando…"}
          </p>
          <MovementTable withDate rows={groupedRows(found?.movements ?? [])} />
          {found && found.movements.length < found.total && (
            <div>
              <GhostButton onClick={moreResults}>Mostrar más ({found.movements.length} de {found.total})</GhostButton>
            </div>
          )}
        </>
      ) : (
        <>
          {kind === "mensual" && <MonthExtras first={first} list={list} cats={cats} onSelectCat={setFCat} />}
          {kind !== "mensual" && <PrevCompare kind={kind} first={first} current={t} fKind={fKind} fCat={fCat} />}
          {fCat && cats.find((c) => c.id === fCat) && (
            <CategoryTrend category={cats.find((c) => c.id === fCat)!} anchor={anchor} />
          )}
          {kind === "anual" ? (
            <>
              <Panel title="Gasto por mes">
                <Columns values={yearRows.map((r) => r.gasto)} labels={MONTHS_ES.map((m) => m.slice(0, 3))} colour={TYPE_COLOURS.gasto} format={formatMoney} />
              </Panel>
              <BalanceAccumulated yearRows={yearRows} />
              <Projection3m />
              <div className="overflow-hidden rounded-xl border border-line bg-card">
                <div className="grid grid-cols-[140px_repeat(5,1fr)] border-b border-line px-3 py-1.5 font-mono text-[10px] uppercase text-faint">
                  <span>Mes</span><span className="text-right">Gastos</span><span className="text-right">Ingresos</span><span className="text-right">Ahorro</span><span className="text-right">Retiros</span><span className="text-right">Balance</span>
                </div>
                {[...yearRows, t].map((r, i) => (
                  <div key={i} className={cn("grid grid-cols-[140px_repeat(5,1fr)] border-b border-line px-3 py-1.5 text-[12.5px] last:border-b-0", i === 12 && "font-semibold")}>
                    <span className="capitalize text-dim">{i === 12 ? `TOTAL ${parseIso(first).getFullYear()}` : MONTHS_ES[i]}</span>
                    <span className="text-right font-mono" style={{ color: TYPE_COLOURS.gasto }}>{formatMoney(r.gasto)}</span>
                    <span className="text-right font-mono" style={{ color: TYPE_COLOURS.ingreso }}>{formatMoney(r.ingreso)}</span>
                    <span className="text-right font-mono" style={{ color: TYPE_COLOURS.ahorro }}>{formatMoney(r.ahorro)}</span>
                    <span className="text-right font-mono" style={{ color: TYPE_COLOURS.retiro }}>{formatMoney(r.retiro)}</span>
                    <span className="text-right font-mono" style={{ color: r.balance >= 0 ? "var(--nv-mint)" : "var(--nv-danger)" }}>{formatMoney(r.balance, meta?.currency, true)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : mode === "cat" ? (
            <CategoryMatrix list={list} cats={cats}
              columns={kind === "semanal"
                ? daysBetween(first, last).map((d) => [d, `${WEEKDAYS_ES[(parseIso(d).getDay() + 6) % 7]!.slice(0, 3)} ${Number(d.slice(8))}`])
                : daysBetween(first, last).map((d) => [d, String(Number(d.slice(8)))])}
              keyOf={(m) => m.date} />
          ) : (
            <MovementTable rows={groupedRows(list)} />
          )}
          <Tiles t={t} />
        </>
      )}
    </div>
  );
}
