// Semanal, Mensual and Anual: filters, tables, charts, CSV export and sums.

import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/bridge";
import { MONTHS_ES, WEEKDAYS_ES } from "../../lib/calendar";
import { addDays, daysBetween, monthBounds, parseIso, weekStart } from "../../lib/habits";
import { formatMoney } from "../../lib/money";
import { isoDate, todayIso } from "../../lib/tasks";
import type { FinCategory, FinTotals, Movement } from "../../lib/types";
import { useApp } from "../../store/app";
import { useFinance } from "../../store/finance";
import { BarList, Columns, Donut } from "../common/charts";
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

/** Expense categories × columns (days or months), with totals. */
function CategoryMatrix({ list, columns, keyOf, cats }: {
  list: Movement[]; columns: Array<[string, string]>; keyOf: (m: Movement) => string; cats: FinCategory[];
}) {
  const rows = new Map<string, Record<string, number>>();
  for (const m of list) {
    if (m.type !== "gasto") continue;
    const r = rows.get(m.category ?? "") ?? {};
    r[keyOf(m)] = (r[keyOf(m)] ?? 0) + m.amount_cents;
    r._total = (r._total ?? 0) + m.amount_cents;
    rows.set(m.category ?? "", r);
  }
  const sorted = [...rows.entries()].sort((a, b) => (b[1]._total ?? 0) - (a[1]._total ?? 0));
  const tpl = `180px repeat(${columns.length}, minmax(76px, 1fr)) 110px`;
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-card">
      <div className="grid min-w-max border-b border-line px-3 py-1.5 font-mono text-[10px] uppercase text-faint" style={{ gridTemplateColumns: tpl }}>
        <span>Categoría</span>{columns.map(([k, l]) => <span key={k} className="text-right">{l}</span>)}<span className="text-right">Total</span>
      </div>
      {sorted.map(([cid, r]) => {
        const c = cats.find((x) => x.id === cid);
        return (
          <div key={cid || "none"} className="grid min-w-max border-b border-line px-3 py-1.5 text-[12px]" style={{ gridTemplateColumns: tpl }}>
            <span className="truncate text-dim">{c ? `${c.icon} ${c.name}` : "Sin categoría"}</span>
            {columns.map(([k]) => <span key={k} className="text-right font-mono text-text">{r[k] ? formatMoney(r[k]) : ""}</span>)}
            <span className="text-right font-mono font-semibold text-text">{formatMoney(r._total ?? 0)}</span>
          </div>
        );
      })}
      {sorted.length > 0 && (
        <div className="grid min-w-max px-3 py-1.5 text-[12px] font-semibold" style={{ gridTemplateColumns: tpl }}>
          <span>TOTAL GASTOS</span>
          {columns.map(([k]) => <span key={k} className="text-right font-mono">{formatMoney(sorted.reduce((a, [, r]) => a + (r[k] ?? 0), 0))}</span>)}
          <span className="text-right font-mono">{formatMoney(sorted.reduce((a, [, r]) => a + (r._total ?? 0), 0))}</span>
        </div>
      )}
      {!sorted.length && <div className="p-6 text-center text-[13px] text-faint">Sin gastos en este periodo.</div>}
    </div>
  );
}

function MonthExtras({ first, list, cats }: { first: string; list: Movement[]; cats: FinCategory[] }) {
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
    return { name: `${c ? c.name : "Sin categoría"}: ${formatMoney(v)}`, value: v, colour: c?.colour ?? "#616161" };
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
            <ul className="min-w-0 space-y-0.5 text-[11.5px] text-dim">{parts.slice(0, 7).map((p) => <li key={p.name} className="flex items-center gap-1.5 truncate"><span className="h-2 w-2 flex-none rounded-sm" style={{ background: p.colour }} />{p.name}</li>)}</ul>
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

/** Comparación con el periodo anterior para semana y año. */
function PrevCompare({ kind, first, current }: { kind: Kind; first: string; current: FinTotals }) {
  const version = useFinance((s) => s.version);
  const [prev, setPrev] = useState<FinTotals | null>(null);
  useEffect(() => {
    const b = prevRange(kind, first);
    if (!b) return;
    api.finRange(b[0], b[1]).then((ms) => setPrev(totals(ms))).catch(() => setPrev(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, first, version]);
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
  const [first, last] = bounds(kind, anchor);
  const cats = meta?.categories ?? [];

  useEffect(() => {
    api.finRange(first, last).then(setAll).catch((e) => toast("error", (e as Error).message));
  }, [first, last, version, toast]);

  const list = useMemo(() => all.filter((m) => (!fKind || m.type === fKind) && (!fCat || m.category === fCat)
    && (!q || `${m.what ?? ""} ${m.reason ?? ""}`.toLowerCase().includes(q.toLowerCase()))), [all, fKind, fCat, q]);
  const t = totals(list);
  const sel = cn(inputBase, "py-1 text-[12px]");

  const csv = async () => {
    const rows = [...list].sort((a, b) => a.date.localeCompare(b.date)).map((m) => [
      m.date, m.time ?? "", TYPE_LABELS[m.type], categoryText(m), m.what ?? "", m.reason ?? "", (signed(m) / 100).toFixed(2)]);
    try {
      const r = await exportCsv(`finanzas_${first}_${last}.csv`, ["Fecha", "Hora", "Tipo", "Categoría", "En qué", "Razón", "Importe"], rows);
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
        <span className="flex-1" />
        <GhostButton onClick={() => void csv()}>Exportar CSV</GhostButton>
      </div>
      {kind === "mensual" && <MonthExtras first={first} list={list} cats={cats} />}
      {kind !== "mensual" && <PrevCompare kind={kind} first={first} current={totals(all)} />}
      {kind === "anual" ? (
        <>
          <Panel title="Gasto por mes">
            <Columns values={yearRows.map((r) => r.gasto)} labels={MONTHS_ES.map((m) => m.slice(0, 3))} colour={TYPE_COLOURS.gasto} format={formatMoney} />
          </Panel>
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
                <span className="text-right font-mono" style={{ color: r.balance >= 0 ? "var(--nv-mint)" : "var(--nv-danger)" }}>{formatMoney(r.balance, "COP", true)}</span>
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
    </div>
  );
}
