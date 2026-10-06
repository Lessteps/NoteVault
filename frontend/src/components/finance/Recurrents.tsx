// Recurrentes: gastos e ingresos que se materializan solos cada día.

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../lib/bridge";
import { formatMoney } from "../../lib/money";
import { parseRepeat, todayIso } from "../../lib/tasks";
import type { FinRecurring, MovementType } from "../../lib/types";
import { useApp } from "../../store/app";
import { useFinance } from "../../store/finance";
import { Field, GhostButton, input, Modal, PrimaryButton } from "../common/forms";
import { RepeatPicker } from "../common/RepeatPicker";
import { cn, confirmAction } from "../ui";
import { MoneyInput, TYPE_COLOURS, TYPE_LABELS } from "./parts";

export function ruleText(rule: string): string {
  const r = parseRepeat(rule);
  if (r.kind === "daily") return "Todos los días";
  if (r.kind === "every") return `Cada ${r.every} días`;
  if (r.kind === "monthly" && r.monthDays.length) return `Cada mes el día ${r.monthDays.join(", ")}`;
  const names = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
  if (r.kind === "weekly" && r.weekdays.length) return `Cada ${r.weekdays.map((d) => names[d]).join(", ")}`;
  if (r.kind === "workdays") return "Días hábiles";
  return "Sin repetición";
}

export function RecurringDialog() {
  const editing = useFinance((s) => s.recurringEditing);
  const setEditing = useFinance((s) => s.setRecurringEditing);
  const meta = useFinance((s) => s.meta);
  const changed = useFinance((s) => s.changed);
  const toast = useApp((s) => s.toast);
  const [f, setF] = useState<Partial<FinRecurring>>({});
  useEffect(() => {
    if (!editing) return;
    const cur: Partial<FinRecurring> = { type: "gasto", amount_cents: 0, what: "", rule: "daily", start: todayIso(), end: "", archived: false };
    setF(cur);
    if (editing.id) {
      api.finRecurringList()
        .then((list) => {
          const r = list.find((x) => x.id === editing.id);
          if (r) setF({ ...r });
          else {
            toast("error", "Ese recurrente ya no existe.");
            setEditing(null);
          }
        })
        .catch((e) => {
          toast("error", (e as Error).message);
          setEditing(null);
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);
  if (!editing) return null;
  const set = (p: Partial<FinRecurring>) => setF((x) => ({ ...x, ...p }));
  const kind = (f.type ?? "gasto") as MovementType;
  const cats = (meta?.categories ?? []).filter((c) => c.kind === (kind === "ingreso" ? "ingreso" : "gasto") && !c.archived);
  const save = async () => {
    if (!f.amount_cents) return toast("error", "Escribe un importe mayor que cero.");
    try {
      await api.finRecurringSave(editing.id, {
        type: kind, amount_cents: f.amount_cents, what: f.what ?? "", category: kind === "gasto" || kind === "ingreso" ? f.category ?? "" : "",
        goal: kind === "ahorro" || kind === "retiro" ? f.goal ?? "" : "", rule: f.rule ?? "daily",
        start: f.start ?? todayIso(), end: f.end ?? "", archived: Boolean(f.archived),
      });
      setEditing(null);
      await changed();
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };
  return (
    <Modal title={editing.id ? "Editar recurrente" : "Nuevo recurrente"} onClose={() => setEditing(null)} width={520}
      footer={<>
        {editing.id && <GhostButton danger onClick={async () => {
          if (!(await confirmAction("Eliminar recurrente", "No borra los movimientos ya creados, solo deja de generar.", "Eliminar", true))) return;
          try {
            await api.finRecurringDelete(editing.id);
            setEditing(null);
            await changed();
          } catch (e) {
            toast("error", (e as Error).message);
          }
        }}><Trash2 size={13} /> Eliminar</GhostButton>}
        <span className="flex-1" /><GhostButton onClick={() => setEditing(null)}>Cancelar</GhostButton>
        <PrimaryButton onClick={() => void save()}>Guardar</PrimaryButton></>}>
      <div className="flex gap-1.5">
        {(["gasto", "ingreso", "ahorro", "retiro"] as const).map((t) => (
          <button key={t} type="button" onClick={() => set({ type: t })}
            className={cn("flex-1 rounded-lg border px-2 py-1.5 text-[12.5px]", kind === t ? "text-text" : "border-line text-dim hover:bg-hover")}
            style={kind === t ? { borderColor: TYPE_COLOURS[t], background: `color-mix(in srgb, ${TYPE_COLOURS[t]} 15%, transparent)` } : undefined}>
            {TYPE_LABELS[t]}
          </button>
        ))}
      </div>
      <Field label="Importe"><MoneyInput label="Importe" value={f.amount_cents || null} onChange={(c) => set({ amount_cents: c ?? 0 })} autoFocus className="w-full text-[18px]" onEnter={() => void save()} /></Field>
      <Field label="En qué"><input className={input} value={f.what ?? ""} placeholder="p. ej. Arriendo" onChange={(e) => set({ what: e.target.value })} /></Field>
      {kind === "gasto" || kind === "ingreso" ? (
        <Field label="Categoría">
          <select className={input} value={f.category ?? ""} onChange={(e) => set({ category: e.target.value })}>
            <option value="">Sin categoría</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
          </select>
        </Field>
      ) : (
        <Field label="Meta">
          <select className={input} value={f.goal ?? ""} onChange={(e) => set({ goal: e.target.value })}>
            <option value="">Ahorro general</option>
            {(meta?.goals ?? []).map((g) => <option key={g.id} value={g.id}>{g.icon} {g.name}</option>)}
          </select>
        </Field>
      )}
      <Field label="Se repite"><RepeatPicker value={f.rule ?? "daily"} onChange={(rule) => set({ rule: rule || "daily" })} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Desde"><input type="date" aria-label="Desde" className={input} value={f.start ?? ""} onChange={(e) => set({ start: e.target.value })} /></Field>
        <Field label="Hasta (opcional)"><input type="date" aria-label="Hasta" className={input} value={f.end ?? ""} onChange={(e) => set({ end: e.target.value })} /></Field>
      </div>
      {editing.id && (
        <label className="flex items-center gap-2 text-[12.5px] text-dim">
          <input type="checkbox" checked={Boolean(f.archived)} onChange={(e) => set({ archived: e.target.checked })} />
          Pausado (no genera, se conserva)
        </label>
      )}
      <p className="text-[11.5px] text-faint">Se crea solo al abrir Finanzas. Los movimientos generados dicen «Automático» y se editan como cualquiera.</p>
    </Modal>
  );
}

export function Recurrents() {
  const setEditing = useFinance((s) => s.setRecurringEditing);
  const version = useFinance((s) => s.version);
  const toast = useApp((s) => s.toast);
  const [list, setList] = useState<FinRecurring[] | null>(null);
  useEffect(() => {
    api.finRecurringList().then(setList).catch((e) => toast("error", (e as Error).message));
  }, [version, toast]);
  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
      <div className="flex items-center gap-3">
        <h1 className="text-[21px] font-semibold text-text">Recurrentes</h1>
        <span className="flex-1" />
        <PrimaryButton onClick={() => setEditing({ id: "" })}><Plus size={14} /> Nuevo recurrente</PrimaryButton>
      </div>
      <p className="text-[12px] text-faint">Arriendo, salario, suscripciones: se materializan solos al abrir Finanzas.</p>
      {!list?.length && <p className="py-10 text-center text-[13px] text-faint">Nada que se repita. Crea el arriendo, por ejemplo.</p>}
      <div className="divide-y divide-line rounded-xl border border-line bg-card">
        {(list ?? []).map((r) => (
          <button key={r.id} type="button" onClick={() => setEditing({ id: r.id })}
            className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-hover" style={{ opacity: r.archived ? 0.55 : 1 }}>
            <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: TYPE_COLOURS[r.type] }} />
            <span className="min-w-0 flex-1 truncate text-[13px] text-text">{r.what || "—"}</span>
            <span className="text-[11.5px] text-faint">{ruleText(r.rule)}</span>
            <span className="font-mono text-[12.5px] text-text">{formatMoney(r.amount_cents, "COP", true)}</span>
            {r.archived && <span className="text-[11px] text-faint">pausado</span>}
            <span className="text-faint"><Pencil size={12} /></span>
          </button>
        ))}
      </div>
    </div>
  );
}
