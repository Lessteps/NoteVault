// Pieces shared by the Finanzas views.

import { Paperclip, Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import { formatMoney, parseMoney } from "../../lib/money";
import { todayIso } from "../../lib/tasks";
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

export type TileKey = "gasto" | "ingreso" | "ahorro" | "balance" | "disponible";

const TILE_COLS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
};

/** Cuatro cifras o un subconjunto (el Diario solo enseña Gastos + Ahorro). */
export function Tiles({ t, daily, only }: { t: FinTotals; daily?: boolean; only?: TileKey[] }) {
  const meta = useFinance((s) => s.meta);
  const curr = meta?.currency;
  const keys = only ?? (["gasto", "ingreso", "ahorro", "balance"] as TileKey[]);
  const n = keys.length;
  const show = (k: TileKey) => keys.includes(k);
  const dispHint = t.ahorro > 0 || t.retiro > 0 ? `Caja disponible: ${formatMoney(t.disponible, curr, true)}` : undefined;
  return (
    <div className={cn("grid gap-3", TILE_COLS[n] ?? "grid-cols-4")}>
      {show("gasto") && <StatTile value={formatMoney(t.gasto, curr)} label="Gastos" colour={TYPE_COLOURS.gasto} />}
      {show("ingreso") && <StatTile value={formatMoney(t.ingreso, curr)} label="Ingresos" colour={TYPE_COLOURS.ingreso} />}
      {show("ahorro") && <StatTile value={formatMoney(t.ahorro - t.retiro, curr)} label={daily ? "Ahorro" : "Ahorro neto"} colour={TYPE_COLOURS.ahorro} />}
      {show("balance") && <StatTile value={formatMoney(t.balance, curr, true)} label={daily ? "Flujo neto del día" : "Flujo neto"} colour={t.balance >= 0 ? "var(--nv-mint)" : "var(--nv-danger)"} hint={dispHint} />}
      {show("disponible") && <StatTile value={formatMoney(t.disponible, curr, true)} label="Caja disponible" colour={t.disponible >= 0 ? "var(--nv-mint)" : "var(--nv-danger)"} />}
    </div>
  );
}

export function totals(ms: Movement[]): FinTotals {
  const t: FinTotals = { gasto: 0, ingreso: 0, ahorro: 0, retiro: 0, balance: 0, neto: 0, disponible: 0 };
  for (const m of ms) t[m.type] += m.amount_cents;
  t.neto = t.ingreso - t.gasto;
  t.disponible = t.neto - t.ahorro + t.retiro;
  t.balance = t.neto;
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

/** Movement table; groups (days) with subtotals and a final total when asked.
 * Cuatro columnas (Fecha·Detalle·Categoría·Importe): la hora y el tipo viven
 * en el desplegable de la fila. */
export function MovementTable({ rows, withDate }: { rows: GroupedRow[]; withDate?: boolean }) {
  const edit = useFinance((s) => s.edit);
  const meta = useFinance((s) => s.meta);
  const curr = meta?.currency;
  const [openId, setOpenId] = useState<string | null>(null);
  const cols = withDate
    ? "grid-cols-[88px_minmax(0,1fr)_150px_110px_30px_24px]"
    : "grid-cols-[minmax(0,1fr)_150px_110px_30px_24px]";
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-card">
      <div className={cn("grid border-b border-line px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-faint", cols)}>
        {withDate && <span>Fecha</span>}<span>Detalle</span><span>Categoría</span><span className="text-right">Importe</span><span>📎</span><span />
      </div>
      {rows.map((r, i) => {
        if (r.kind === "group") return <div key={i} className="bg-elevated/60 px-3 py-1 text-[11.5px] font-semibold text-dim">{r.label}</div>;
        if (r.kind !== "data") {
          return (
            <div key={i} className={cn("flex items-center border-b border-line px-3 py-1.5 text-[12px] last:border-b-0", r.kind === "total" ? "font-semibold text-text" : "text-faint")}>
              <span className="flex-1 truncate">{r.label}</span>
              <span className="font-mono" style={{ color: (r.amount ?? 0) >= 0 ? "var(--nv-mint)" : "var(--nv-danger)" }}>{formatMoney(r.amount ?? 0, curr, true)}</span>
            </div>
          );
        }
        const m = r.m!;
        const open = openId === m.id;
        const detail = [m.what, m.reason].filter(Boolean).join(" — ");
        return (
          <div key={m.id} className="border-b border-line last:border-b-0">
            <button type="button" aria-expanded={open}
              onClick={() => setOpenId(open ? null : m.id)}
              title="Ver detalle"
              className={cn("group grid w-full items-center px-3 py-1.5 text-left text-[12.5px] hover:bg-hover", cols)}>
              {withDate && <span className="text-[11.5px] text-faint">{m.date.slice(5)}</span>}
              <span className="truncate text-text"><span className="sr-only">{TYPE_LABELS[m.type]} </span>{detail || "—"}</span>
              <span className="truncate text-dim">{categoryText(m)}</span>
              <span className="text-right font-mono" style={{ color: TYPE_COLOURS[m.type] }}>{formatMoney(signed(m), curr, true)}</span>
              <span className="text-faint">{m.attachments.length ? <span className="flex items-center gap-0.5 text-[11px]"><Paperclip size={11} />{m.attachments.length}</span> : ""}</span>
              <span className="text-faint opacity-0 transition-opacity group-hover:opacity-100"><Pencil size={12} /></span>
            </button>
            {open && (
              <div className="space-y-1.5 px-3 pb-2.5 pt-0.5 text-[12px]">
                <div className="flex items-center gap-3 text-dim">
                  <span style={{ color: TYPE_COLOURS[m.type] }}>{TYPE_LABELS[m.type]}</span>
                  {m.time && <span className="font-mono">{m.time}</span>}
                  {m.reason && m.what && <span className="truncate text-faint">{m.what}</span>}
                </div>
                <div className="flex gap-1.5">
                  <button type="button" onClick={() => edit({ day: m.date, kind: m.type, movement: m })}
                    className="rounded-md border border-line px-1.5 py-0.5 text-[11px] text-dim hover:bg-hover hover:text-text">
                    Editar
                  </button>
                  <button type="button" title="Abrir una copia para hoy en el formulario"
                    onClick={() => edit({
                      day: todayIso(), kind: m.type,
                      preset: {
                        type: m.type, amount_cents: m.amount_cents, what: m.what, category: m.category,
                        goal: m.goal, reason: m.reason, time: m.time,
                      },
                    })}
                    className="rounded-md border border-line px-1.5 py-0.5 text-[11px] text-dim hover:bg-hover hover:text-text">
                    Duplicar
                  </button>
                </div>
              </div>
            )}
          </div>
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
