// Create or edit a movement: type, amount, day, time, what, category or goal, invoices.

import { AlertCircle, AlertTriangle, CheckCircle2, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../lib/bridge";
import { formatMoney } from "../../lib/money";
import type { Movement, MovementType } from "../../lib/types";
import { useApp } from "../../store/app";
import { useFinance } from "../../store/finance";
import { Attachments } from "../common/Attachments";
import { Field, GhostButton, input, Modal, PrimaryButton } from "../common/forms";
import { cn, confirmAction } from "../ui";
import { MoneyInput, TYPE_COLOURS, TYPE_LABELS } from "./parts";

export function MovementDialog() {
  const e = useFinance((s) => s.editing);
  const close = useFinance((s) => s.edit);
  const meta = useFinance((s) => s.meta);
  const changed = useFinance((s) => s.changed);
  const toast = useApp((s) => s.toast);
  const [kind, setKind] = useState<MovementType>("gasto");
  const [amount, setAmount] = useState<number | null>(null);
  const [day, setDay] = useState("");
  const [time, setTime] = useState("");
  const [what, setWhat] = useState("");
  const [category, setCategory] = useState("");
  const [goal, setGoal] = useState("");
  const [reason, setReason] = useState("");
  const [refs, setRefs] = useState<string[]>([]);
  const [id, setId] = useState("");
  const [catBudgetInfo, setCatBudgetInfo] = useState<{ used: number; budget: number; name: string; icon: string } | null>(null);

  useEffect(() => {
    if (!e) return;
    const base: Partial<Movement> = e.movement ?? e.preset ?? {};
    setKind((base.type as MovementType) ?? e.kind);
    setAmount(base.amount_cents ?? null);
    setDay(e.movement?.date ?? e.day);
    setTime(base.time ?? "");
    setWhat(base.what ?? "");
    setCategory(base.category ?? "");
    setGoal(base.goal ?? "");
    setReason(base.reason ?? "");
    setRefs(base.attachments ?? []);
    if (e.movement) setId(e.movement.id);
    else api.finNewId().then((r) => setId(r.id)).catch(() => setId(""));
  }, [e]);

  // Consulta en segundo plano el presupuesto mensual de la categoría seleccionada
  useEffect(() => {
    if (kind !== "gasto" || !category || !day) {
      setCatBudgetInfo(null);
      return;
    }
    const d = new Date(`${day}T12:00:00`);
    if (isNaN(d.getTime())) return;
    api.finMonthExtras(d.getFullYear(), d.getMonth() + 1)
      .then((res) => {
        const found = res.budgets.find((b) => b.category.id === category);
        if (found && found.budget > 0) {
          setCatBudgetInfo({
            used: found.used,
            budget: found.budget,
            name: found.category.name,
            icon: found.category.icon,
          });
        } else {
          setCatBudgetInfo(null);
        }
      })
      .catch(() => setCatBudgetInfo(null));
  }, [category, kind, day]);

  if (!e) return null;
  const cancel = () => {
    e.onCancel?.();
    close(null);
  };
  const cats = (meta?.categories ?? []).filter((c) => c.kind === (kind === "ingreso" ? "ingreso" : "gasto") && (!c.archived || c.id === category));
  const save = async () => {
    if (!amount) {
      toast("error", "Escribe un importe: 12.500, 12500 o 12,5k");
      return;
    }
    const fields: Partial<Movement> = {
      type: kind, amount_cents: amount, time, what, reason, attachments: refs,
      category: kind === "gasto" || kind === "ingreso" ? category : "",
      goal: kind === "ahorro" || kind === "retiro" ? goal : "",
    };
    try {
      if (e.movement) await api.finUpdate(e.movement.date, e.movement.id, fields, day);
      else await api.finAdd(day, { ...fields, id });
      e.onSaved?.();
      close(null);
      await changed();
    } catch (err) {
      toast("error", (err as Error).message);
    }
  };

  return (
    <Modal title={e.movement ? "Editar movimiento" : `Nuevo ${TYPE_LABELS[kind].toLowerCase()}`} onClose={cancel} width={520}
      footer={<>
        {e.movement && <GhostButton danger onClick={async () => {
          if (!(await confirmAction("Eliminar movimiento", "Sus facturas van a la papelera de la vault.", "Eliminar", true))) return;
          try {
            await api.finDelete(e.movement!.date, e.movement!.id);
            close(null);
            await changed();
          } catch (err) {
            toast("error", (err as Error).message);
          }
        }}><Trash2 size={13} /> Eliminar</GhostButton>}
        <span className="flex-1" /><GhostButton onClick={cancel}>Cancelar</GhostButton>
        <PrimaryButton onClick={() => void save()}>Guardar</PrimaryButton></>}>
      <div className="flex gap-1.5">
        {(meta?.types ?? ["gasto", "ingreso", "ahorro", "retiro"]).map((t) => (
          <button key={t} type="button" onClick={() => setKind(t)}
            className={cn("flex-1 rounded-lg border px-2 py-1.5 text-[12.5px]", kind === t ? "text-text" : "border-line text-dim hover:bg-hover")}
            style={kind === t ? { borderColor: TYPE_COLOURS[t], background: `color-mix(in srgb, ${TYPE_COLOURS[t]} 15%, transparent)` } : undefined}>
            {TYPE_LABELS[t]}
          </button>
        ))}
      </div>
      <Field label="Importe"><MoneyInput value={amount} onChange={setAmount} autoFocus className="w-full text-[18px]" onEnter={() => void save()} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Fecha"><input type="date" className={input} value={day} onChange={(ev) => setDay(ev.target.value)} /></Field>
        <Field label="Hora"><input type="time" className={input} value={time} onChange={(ev) => setTime(ev.target.value)} /></Field>
      </div>
      <Field label="Detalle"><input className={input} value={what} placeholder="p. ej. Almuerzo" onChange={(ev) => setWhat(ev.target.value)} /></Field>
      {kind === "gasto" || kind === "ingreso" ? (
        <Field label="Categoría">
          <select className={input} value={category} onChange={(ev) => setCategory(ev.target.value)}>
            <option value="">Sin categoría</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
          </select>
          {(() => {
            if (kind !== "gasto" || !catBudgetInfo) return null;
            const draftCents = amount ?? 0;
            const originalAmt = (e.movement && e.movement.category === category) ? e.movement.amount_cents : 0;
            const totalProjected = catBudgetInfo.used - originalAmt + draftCents;
            const limit = catBudgetInfo.budget;
            const pct = limit > 0 ? totalProjected / limit : 0;
            const diff = limit - totalProjected;
            const isOver = totalProjected > limit;
            const isWarning = pct >= 0.8 && !isOver;

            if (isOver) {
              return (
                <div className="mt-1.5 flex items-center gap-1.5 rounded-lg bg-red-500/10 border border-red-500/30 px-2.5 py-1 text-[11px] text-red-400">
                  <AlertTriangle size={12} className="flex-none" />
                  <span>Supera el presupuesto de esta categoría por <b>{formatMoney(Math.abs(diff))}</b> ({formatMoney(totalProjected)} de {formatMoney(limit)})</span>
                </div>
              );
            }
            if (isWarning) {
              return (
                <div className="mt-1.5 flex items-center gap-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 text-[11px] text-amber-400">
                  <AlertCircle size={12} className="flex-none" />
                  <span>Cerca del límite ({Math.round(pct * 100)}%): {formatMoney(totalProjected)} de {formatMoney(limit)} · Quedan <b>{formatMoney(diff)}</b></span>
                </div>
              );
            }
            return (
              <div className="mt-1.5 flex items-center gap-1.5 rounded-lg bg-emerald-500/5 border border-emerald-500/20 px-2.5 py-1 text-[11px] text-emerald-400">
                <CheckCircle2 size={12} className="flex-none" />
                <span>Dentro del presupuesto ({Math.round(pct * 100)}%): {formatMoney(totalProjected)} de {formatMoney(limit)} · Quedan <b>{formatMoney(diff)}</b></span>
              </div>
            );
          })()}
        </Field>
      ) : (
        <Field label="Meta">
          <select className={input} value={goal} onChange={(ev) => setGoal(ev.target.value)}>
            <option value="">Ahorro general</option>
            {(meta?.goals ?? []).map((g) => <option key={g.id} value={g.id}>{g.icon} {g.name}</option>)}
          </select>
        </Field>
      )}
      {reason && <p className="text-[11.5px] text-faint">Nota guardada: {reason}</p>}
      <div>
        <span className="mb-1 block font-mono text-[10.5px] uppercase tracking-wider text-faint">Facturas</span>
        {id ? <Attachments module="finanzas" owner={id} refs={refs} onChange={setRefs} /> : <span className="text-[12px] text-faint">…</span>}
      </div>
    </Modal>
  );
}
