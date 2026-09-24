// Pieces shared by the Finanzas views.

import { Paperclip } from "lucide-react";
import { useEffect, useState } from "react";
import { formatMoney, parseMoney } from "../../lib/money";
import type { FinTotals, Movement } from "../../lib/types";
import { categoryOf, goalOf, useFinance } from "../../store/finance";
import { StatTile } from "../common/StatTile";
import { cn } from "../ui";
import { inputBase } from "../common/forms";

export const TYPE_COLOURS = { gasto: "#f2555a", ingreso: "#4ade80", ahorro: "#eab308", retiro: "#ff9632" } as const;
export const TYPE_LABELS = { gasto: "Gasto", ingreso: "Ingreso", ahorro: "Ahorro", retiro: "Retiro" } as const;

/** Amount field: accepts 12.500, 12500 or 12,5k and shows $ 12.500. */
export function MoneyInput({ value, onChange, className, placeholder = "$ 0", autoFocus, onEnter, label }: {
  value: number | null; onChange: (cents: number | null) => void; className?: string; placeholder?: string;
  autoFocus?: boolean; onEnter?: () => void; label?: string;
}) {
  const [text, setText] = useState(value ? formatMoney(value) : "");
  const [bad, setBad] = useState(false);
  useEffect(() => {
    // Reflect outside changes (a reset, a preset) unless the user is typing a different value.
    if (value === null) setText("");
    else if (parseMoney(text) !== value) setText(formatMoney(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const commit = (t: string) => {
    const cents = parseMoney(t);
    setBad(Boolean(t.trim()) && cents === null);
    onChange(cents);
    return cents;
  };
  return (
    <input
      aria-label={label ?? "Importe"}
      autoFocus={autoFocus}
      value={text}
      placeholder={placeholder}
      onChange={(e) => {
        setText(e.target.value);
        commit(e.target.value);
      }}
      onBlur={() => {
        const c = commit(text);
        if (c !== null) setText(formatMoney(c));
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && onEnter) {
          commit(text);
          onEnter();
        }
      }}
      className={cn(inputBase, "text-right font-mono", bad && "border-danger", className)}
    />
  );
}

export function Tiles({ t, dayLabel }: { t: FinTotals; dayLabel?: string }) {
  return (
    <div className="grid grid-cols-4 gap-3">
      <StatTile value={formatMoney(t.gasto)} label="Gastos" colour={TYPE_COLOURS.gasto} />
      <StatTile value={formatMoney(t.ingreso)} label="Ingresos" colour={TYPE_COLOURS.ingreso} />
      <StatTile value={formatMoney(t.ahorro - t.retiro)} label={dayLabel ? "Ahorro" : "Ahorro neto"} colour={TYPE_COLOURS.ahorro} />
      <StatTile value={formatMoney(t.balance, "COP", true)} label={dayLabel ?? "Balance"} colour={t.balance >= 0 ? "var(--nv-mint)" : "var(--nv-danger)"} />
    </div>
  );
}

export function totals(ms: Movement[]): FinTotals {
  const t: FinTotals = { gasto: 0, ingreso: 0, ahorro: 0, retiro: 0, balance: 0 };
  for (const m of ms) t[m.type] += m.amount_cents;
  t.balance = t.ingreso - t.gasto - t.ahorro + t.retiro;
  return t;
}

export function signed(m: Movement): number {
  return m.type === "gasto" || m.type === "ahorro" ? -m.amount_cents : m.amount_cents;
}

export function categoryText(m: Movement): string {
  const meta = useFinance.getState().meta;
  if (m.goal) {
    const g = goalOf(meta, m.goal);
    return g ? `${g.icon} ${g.name}` : "Meta";
  }
  const c = categoryOf(meta, m.category);
  if (c) return `${c.icon} ${c.name}`.trim();
  return m.type === "gasto" || m.type === "ingreso" ? "—" : "Ahorro general";
}

export interface GroupedRow { kind: "group" | "data" | "subtotal" | "total"; label?: string; m?: Movement; amount?: number }

/** Movement table; groups (days) with subtotals and a final total when asked. */
export function MovementTable({ rows, withDate }: { rows: GroupedRow[]; withDate?: boolean }) {
  const edit = useFinance((s) => s.edit);
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-card">
      <div className={cn("grid border-b border-line px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-faint",
        withDate ? "grid-cols-[90px_56px_76px_160px_1fr_180px_120px_30px]" : "grid-cols-[56px_76px_160px_1fr_180px_120px_30px]")}>
        {withDate && <span>Día</span>}<span>Hora</span><span>Tipo</span><span>Categoría</span><span>En qué</span><span>Razón</span><span className="text-right">Importe</span><span>📎</span>
      </div>
      {rows.map((r, i) => {
        if (r.kind === "group") return <div key={i} className="bg-elevated/60 px-3 py-1 text-[11.5px] font-semibold text-dim">{r.label}</div>;
        if (r.kind !== "data") {
          return (
            <div key={i} className={cn("flex items-center border-b border-line px-3 py-1.5 text-[12px] last:border-b-0", r.kind === "total" ? "font-semibold text-text" : "text-faint")}>
              <span className="flex-1 truncate">{r.label}</span>
              <span className="font-mono" style={{ color: (r.amount ?? 0) >= 0 ? "var(--nv-mint)" : "var(--nv-danger)" }}>{formatMoney(r.amount ?? 0, "COP", true)}</span>
            </div>
          );
        }
        const m = r.m!;
        return (
          <button key={m.id} type="button" onDoubleClick={() => edit({ day: m.date, kind: m.type, movement: m })}
            onClick={() => edit({ day: m.date, kind: m.type, movement: m })}
            title="Clic para editar o adjuntar facturas"
            className={cn("grid w-full items-center border-b border-line px-3 py-1.5 text-left text-[12.5px] last:border-b-0 hover:bg-hover",
              withDate ? "grid-cols-[90px_56px_76px_160px_1fr_180px_120px_30px]" : "grid-cols-[56px_76px_160px_1fr_180px_120px_30px]")}>
            {withDate && <span className="text-[11.5px] text-faint">{m.date.slice(5)}</span>}
            <span className="font-mono text-[11.5px] text-faint">{m.time ?? ""}</span>
            <span style={{ color: TYPE_COLOURS[m.type] }}>{TYPE_LABELS[m.type]}</span>
            <span className="truncate text-dim">{categoryText(m)}</span>
            <span className="truncate text-text">{m.what ?? ""}</span>
            <span className="truncate text-faint">{m.reason ?? ""}</span>
            <span className="text-right font-mono" style={{ color: TYPE_COLOURS[m.type] }}>{formatMoney(signed(m), "COP", true)}</span>
            <span className="text-faint">{m.attachments.length ? <span className="flex items-center gap-0.5 text-[11px]"><Paperclip size={11} />{m.attachments.length}</span> : ""}</span>
          </button>
        );
      })}
      {!rows.length && <div className="p-6 text-center text-[13px] text-faint">Sin movimientos.</div>}
    </div>
  );
}

export async function exportCsv(name: string, header: string[], rows: Array<Array<string | number>>) {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const text = [header, ...rows].map((r) => r.map(esc).join(",")).join("\r\n") + "\r\n";
  const { api } = await import("../../lib/bridge");
  const res = await api.saveTextAs(name, text);
  if (res.fallback) {
    const url = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }
  return res;
}
