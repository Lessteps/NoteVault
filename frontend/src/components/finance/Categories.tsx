// Categorías: expense and income categories with a monthly budget.

import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../lib/bridge";
import { formatMoney } from "../../lib/money";
import { todayIso } from "../../lib/tasks";
import type { FinCategory } from "../../lib/types";
import { useApp } from "../../store/app";
import { useFinance } from "../../store/finance";
import { BlockProgress } from "../common/charts";
import { ColourRow, Field, GhostButton, input, Modal, PrimaryButton } from "../common/forms";
import { cn } from "../ui";
import { MoneyInput } from "./parts";

const COLOURS = ["#f4511e", "#039be5", "#8e24aa", "#f6bf26", "#33b679", "#3f51b5", "#e67c73", "#7986cb", "#616161", "#0b8043"];

export function CategoryDialog() {
  const editing = useFinance((s) => s.categoryEditing);
  const setEditing = useFinance((s) => s.setCategoryEditing);
  const meta = useFinance((s) => s.meta);
  const changed = useFinance((s) => s.changed);
  const toast = useApp((s) => s.toast);
  const [f, setF] = useState<Partial<FinCategory>>({});
  useEffect(() => {
    if (!editing) return;
    const c = editing.id ? meta?.categories.find((x) => x.id === editing.id) : undefined;
    setF(c ? { ...c } : { name: "", icon: "", colour: COLOURS[0], kind: editing.kind, budget_month_cents: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);
  if (!editing) return null;
  const save = async (extra: Partial<FinCategory> = {}) => {
    try {
      await api.finCategorySave(editing.id, { ...f, ...extra });
      setEditing(null);
      await changed();
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };
  return (
    <Modal title={editing.id ? "Editar categoría" : "Nueva categoría"} onClose={() => setEditing(null)} width={460}
      footer={<>
        {editing.id && <GhostButton danger={!f.archived} onClick={() => void save({ archived: !f.archived })}>{f.archived ? "Reactivar" : "Archivar"}</GhostButton>}
        <span className="flex-1" /><GhostButton onClick={() => setEditing(null)}>Cancelar</GhostButton><PrimaryButton onClick={() => void save()}>Guardar</PrimaryButton></>}>
      <div className="grid grid-cols-[70px_1fr] gap-3">
        <Field label="Icono"><input className={input} value={f.icon ?? ""} placeholder="🐶" onChange={(e) => setF({ ...f, icon: e.target.value })} /></Field>
        <Field label="Nombre"><input autoFocus className={input} value={f.name ?? ""} placeholder="p. ej. Mascotas" onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      </div>
      <Field label="Color"><ColourRow colours={COLOURS} value={f.colour ?? COLOURS[0]!} onChange={(colour) => setF({ ...f, colour })} /></Field>
      {!editing.id && (
        <Field label="Tipo">
          <div className="flex gap-1.5">
            {(["gasto", "ingreso"] as const).map((k) => (
              <button key={k} type="button" onClick={() => setF({ ...f, kind: k })}
                aria-pressed={f.kind === k}
                className={cn("flex-1 rounded-lg border px-2 py-1.5 text-[12.5px]", f.kind === k ? "border-line-strong text-text" : "border-line text-dim hover:bg-hover")}>
                {k === "gasto" ? "Gasto" : "Ingreso"}
              </button>
            ))}
          </div>
        </Field>
      )}
      {f.kind === "gasto" && (
        <Field label="Presupuesto mensual"><MoneyInput label="Presupuesto mensual" value={f.budget_month_cents || null} onChange={(c) => setF({ ...f, budget_month_cents: c ?? 0 })} className="w-full" placeholder="Sin presupuesto" /></Field>
      )}
    </Modal>
  );
}

export function Categories() {
  const meta = useFinance((s) => s.meta);
  const version = useFinance((s) => s.version);
  const setEditing = useFinance((s) => s.setCategoryEditing);
  const [used, setUsed] = useState<Record<string, number>>({});
  useEffect(() => {
    const d = new Date();
    void api.finMonthExtras(d.getFullYear(), d.getMonth() + 1).then((x) => setUsed(Object.fromEntries(x.budgets.map((b) => [b.category.id, b.used])))).catch(() => undefined);
    // Income per category this month comes from the range.
    const first = `${todayIso().slice(0, 8)}01`;
    void api.finRange(first, todayIso()).then((ms) => {
      const inc: Record<string, number> = {};
      for (const m of ms) if (m.type === "ingreso" && m.category) inc[m.category] = (inc[m.category] ?? 0) + m.amount_cents;
      setUsed((u) => ({ ...u, ...inc }));
    }).catch(() => undefined);
  }, [version]);
  const groups: Array<["gasto" | "ingreso", string]> = [["gasto", "Gastos"], ["ingreso", "Ingresos"]];
  return (
    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-4">
      <div className="flex items-center gap-3">
        <h1 className="text-[21px] font-semibold text-text">Categorías</h1>
        <span className="flex-1" />
        <PrimaryButton onClick={() => setEditing({ id: "", kind: "gasto" })}><Plus size={14} /> Nueva categoría</PrimaryButton>
      </div>
      {groups.map(([kind, title]) => (
        <section key={kind}>
          <div className="mb-1.5 font-mono text-[10.5px] font-semibold uppercase tracking-wider text-faint">{title} · este mes</div>
          <div className="divide-y divide-line rounded-xl border border-line bg-card">
            {(meta?.categories ?? []).filter((c) => c.kind === kind).map((c) => {
              const u = used[c.id] ?? 0;
              return (
                <div key={c.id} className="flex items-center gap-3 px-3 py-2">
                  <span className="w-48 truncate text-[13px] font-semibold" style={{ color: c.colour, opacity: c.archived ? 0.5 : 1 }}>{c.icon} {c.name}{c.archived ? " (archivada)" : ""}</span>
                  {c.budget_month_cents ? (
                    <>
                      <BlockProgress value={Math.min(1, u / c.budget_month_cents)} colour={u > c.budget_month_cents ? "var(--nv-danger)" : c.colour} />
                      <span className="font-mono text-[12px]" style={{ color: u > c.budget_month_cents ? "var(--nv-danger)" : "var(--nv-dim)" }}>{formatMoney(u)} / {formatMoney(c.budget_month_cents)}</span>
                    </>
                  ) : <span className="font-mono text-[12px] text-dim">{formatMoney(u)}</span>}
                  <span className="flex-1" />
                  <GhostButton onClick={() => setEditing({ id: c.id, kind: c.kind })} className="py-0.5">Editar</GhostButton>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
