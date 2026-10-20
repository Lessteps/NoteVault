// Tarjeta de acción interactiva del Coach Financiero.
//
// Permite registrar gastos, ingresos o ahorros propuestos por el Coach,
// o ajustar el presupuesto mensual, con un solo clic a través de `api.finAdd` y `api.finBudgetSet`.

import { ArrowUpRight, Check, Loader2, PiggyBank, Plus, Repeat, Tag, Target, Trash2, TrendingDown, TrendingUp } from "lucide-react";
import { useState } from "react";
import type { FinanceAction } from "../../lib/financeCoachActions";
import { api } from "../../lib/bridge";
import { formatMoney } from "../../lib/money";
import { todayIso } from "../../lib/tasks";
import { useApp } from "../../store/app";
import { useFinance } from "../../store/finance";
import { cn } from "../ui";

const EMPTY_CATEGORIES: any[] = [];

export function FinanceActionCard({
  action,
  onApplied,
}: {
  action: FinanceAction;
  onApplied?: () => void;
}) {
  const toast = useApp((s) => s.toast);
  const categories = useFinance((s) => s.meta?.categories) ?? EMPTY_CATEGORIES;
  const changed = useFinance((s) => s.changed);

  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const [discarded, setDiscarded] = useState(false);

  const handleApply = async () => {
    if (applying || applied || discarded) return;
    setApplying(true);

    try {
      if (action.action === "add_movement") {
        const m = action.movement;
        const targetDate = m.date || todayIso();
        const amountCents = Math.round(m.amount * 100);

        // Resolver id de categoría si coincide por nombre
        let catId = m.category || "";
        if (catId) {
          const norm = catId.toLowerCase().trim();
          const found = categories.find(
            (c) => c.name.toLowerCase().trim() === norm || c.id === catId,
          );
          if (found) catId = found.id;
        }

        await api.finAdd(targetDate, {
          type: m.type,
          amount_cents: amountCents,
          what: m.what,
          category: catId,
          reason: "",
          goal: m.goal || undefined,
        });

        await changed();
        setApplied(true);
        toast("info", `${m.type === "gasto" ? "Gasto" : m.type === "ingreso" ? "Ingreso" : "Ahorro"} registrado: ${formatMoney(amountCents)}`);
      } else if (action.action === "set_budget") {
        const budgetCents = Math.round(action.budget * 100);
        await api.finBudgetSet(budgetCents);
        await changed();
        setApplied(true);
        toast("info", `Presupuesto mensual actualizado a ${formatMoney(budgetCents)}`);
      } else if (action.action === "create_category") {
        const c = action.category;
        await api.finCategorySave("", {
          name: c.name,
          kind: c.kind,
          icon: c.icon || "🏷️",
          colour: c.colour || "#4f46e5",
          budget_month_cents: c.budget ? Math.round(c.budget * 100) : 0,
        });
        await changed();
        setApplied(true);
        toast("info", `Categoría «${c.name}» creada en Finanzas`);
      } else if (action.action === "add_saving") {
        const s = action.saving;
        const targetDate = s.date || todayIso();
        const amountCents = Math.round(s.amount * 100);

        let goalId = s.goal_id || "";
        if (!goalId) {
          const res = await api.finGoals();
          const goals = res?.goals ?? [];
          const norm = s.goal_name.toLowerCase().trim();
          const found = goals.find(
            (g) => g.name.toLowerCase().trim() === norm || g.name.toLowerCase().includes(norm) || norm.includes(g.name.toLowerCase()),
          );
          if (found) goalId = found.id;
        }

        if (!goalId) {
          throw new Error(`No se encontró la meta de ahorro «${s.goal_name}».`);
        }

        await api.finAdd(targetDate, {
          type: "ahorro",
          amount_cents: amountCents,
          what: `Ahorro ${s.goal_name}`,
          category: "",
          reason: "",
          goal: goalId,
        });

        await changed();
        setApplied(true);
        toast("info", `Ahorro de ${formatMoney(amountCents)} asignado a «${s.goal_name}»`);
      } else if (action.action === "remove_movement") {
        const m = action.movement;
        const targetDate = m.day || todayIso();
        let targetId = m.movement_id;
        if (!targetId) {
          const dayMovs = await api.finRange(targetDate, targetDate);
          const targetWhat = m.what ? m.what.toLowerCase().trim() : "";
          const found = dayMovs.find((item) => {
            const itemWhat = String(item.what || "").toLowerCase();
            const matchWhat = targetWhat
              ? itemWhat.includes(targetWhat) || targetWhat.includes(itemWhat)
              : true;
            const matchAmount = m.amount ? Math.abs(item.amount_cents - m.amount * 100) < 50 : true;
            return matchWhat && matchAmount;
          });
          targetId = found?.id;
        }

        if (!targetId) {
          throw new Error(`No se encontró el movimiento para eliminar en la fecha ${targetDate}.`);
        }

        await api.finDelete(targetDate, targetId);
        await changed();
        setApplied(true);
        toast("info", "Movimiento eliminado de tu Diario");
      } else if (action.action === "create_recurring") {
        const r = action.recurring;
        const amountCents = Math.round(r.amount * 100);
        let catId = r.category || "";
        if (catId) {
          const norm = catId.toLowerCase().trim();
          const found = categories.find((c) => c.name.toLowerCase().trim() === norm || c.id === catId);
          if (found) catId = found.id;
        }
        const freqMap: Record<string, string> = {
          diaria: "daily",
          semanal: "weekly",
          mensual: "monthly",
          anual: "yearly",
        };
        const rule = freqMap[r.frequency || "mensual"] || "monthly";
        await api.finRecurringSave("", {
          type: r.type || "gasto",
          amount_cents: amountCents,
          what: r.what,
          category: catId,
          rule,
          start: todayIso(),
        });
        await changed();
        setApplied(true);
        toast("info", `Recurrente «${r.what}» programado (${formatMoney(amountCents)}/${r.frequency || "mes"})`);
      }
      onApplied?.();
    } catch (e) {
      toast("error", `Error al ejecutar acción: ${(e as Error).message}`);
    } finally {
      setApplying(false);
    }
  };

  if (discarded) {
    return (
      <div className="mt-2.5 rounded-lg border border-line bg-surface/40 p-2 text-[11px] text-faint">
        Acción financiera descartada.
      </div>
    );
  }

  if (action.action === "remove_movement") {
    const m = action.movement;
    const amountCents = m.amount ? Math.round(m.amount * 100) : null;
    return (
      <div className="mt-2.5 rounded-lg border border-danger/30 bg-surface p-3 shadow-sm">
        <div className="flex items-center justify-between border-b border-line/60 pb-2">
          <div className="flex items-center gap-1.5 text-danger">
            <Trash2 size={14} />
            <span className="text-[12px] font-semibold">
              Eliminar Movimiento del Diario
            </span>
          </div>
          {applied && (
            <span className="flex items-center gap-1 text-[11px] font-medium text-mint">
              <Check size={12} /> Movimiento eliminado
            </span>
          )}
        </div>

        <div className="my-2.5 rounded bg-panel/70 p-2.5 text-[12px]">
          <p className="text-text">
            ¿Deseas eliminar este registro de tu Diario?
          </p>
          <div className="mt-1.5 flex items-center justify-between font-medium">
            <span className="text-text">{m.what || "Movimiento"}</span>
            {amountCents !== null && (
              <span className="font-mono font-bold text-danger">{formatMoney(amountCents)}</span>
            )}
          </div>
          <div className="text-[10.5px] text-faint">
            Fecha: {m.day || "Hoy"}
          </div>
        </div>

        {!applied && (
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setDiscarded(true)}
              disabled={applying}
              className="flex items-center gap-1 rounded px-2.5 py-1 text-[11px] text-faint hover:bg-hover hover:text-text disabled:opacity-50 transition-colors"
            >
              Conservar
            </button>
            <button
              type="button"
              onClick={() => void handleApply()}
              disabled={applying}
              className={cn(
                "flex items-center gap-1 rounded bg-danger px-2.5 py-1 text-[11.5px] font-medium text-white hover:bg-danger/80 disabled:opacity-60 transition-colors",
              )}
            >
              {applying ? (
                <>
                  <Loader2 size={12} className="animate-spin" /> Eliminando…
                </>
              ) : (
                <>
                  <Trash2 size={12} /> Eliminar de mi Diario
                </>
              )}
            </button>
          </div>
        )}
      </div>
    );
  }

  if (action.action === "create_recurring") {
    const r = action.recurring;
    const amountCents = Math.round(r.amount * 100);
    return (
      <div className="mt-2.5 rounded-lg border border-accent/40 bg-surface p-3 shadow-sm">
        <div className="flex items-center justify-between border-b border-line/60 pb-2">
          <div className="flex items-center gap-1.5 text-accent-text">
            <Repeat size={14} />
            <span className="text-[12px] font-semibold text-text">
              Programar Recurrente ({r.frequency || "mensual"})
            </span>
          </div>
          {applied && (
            <span className="flex items-center gap-1 text-[11px] font-medium text-mint">
              <Check size={12} /> Recurrente programado
            </span>
          )}
        </div>

        <div className="my-2.5 rounded bg-panel/70 p-2.5 text-[12px] space-y-1">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-text">{r.what}</span>
            <span className="font-mono font-bold text-text">{formatMoney(amountCents)}</span>
          </div>
          <div className="flex items-center gap-2 text-[10.5px] text-faint">
            <span className="capitalize">{r.type || "gasto"} {r.frequency || "mensual"}</span>
            {r.category && <span>· Categoría: {r.category}</span>}
          </div>
        </div>

        {!applied && (
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setDiscarded(true)}
              disabled={applying}
              className="flex items-center gap-1 rounded px-2.5 py-1 text-[11px] text-faint hover:bg-hover hover:text-text disabled:opacity-50 transition-colors"
            >
              Descartar
            </button>
            <button
              type="button"
              onClick={() => void handleApply()}
              disabled={applying}
              className={cn(
                "flex items-center gap-1 rounded bg-accent px-2.5 py-1 text-[11.5px] font-medium text-white hover:bg-accent-strong disabled:opacity-60 transition-colors",
              )}
            >
              {applying ? (
                <>
                  <Loader2 size={12} className="animate-spin" /> Programando…
                </>
              ) : (
                <>
                  <Plus size={12} /> Programar {formatMoney(amountCents)}/{r.frequency || "mes"}
                </>
              )}
            </button>
          </div>
        )}
      </div>
    );
  }

  if (action.action === "add_saving") {
    const s = action.saving;
    const amountCents = Math.round(s.amount * 100);
    return (
      <div className="mt-2.5 rounded-lg border border-accent/40 bg-surface p-3 shadow-sm">
        <div className="flex items-center justify-between border-b border-line/60 pb-2">
          <div className="flex items-center gap-1.5 text-accent-text">
            <PiggyBank size={14} />
            <span className="text-[12px] font-semibold text-text">
              Aporte a Meta de Ahorro
            </span>
          </div>
          {applied && (
            <span className="flex items-center gap-1 text-[11px] font-medium text-mint">
              <Check size={12} /> Ahorro registrado
            </span>
          )}
        </div>

        <div className="my-2.5 rounded bg-panel/70 p-2.5 text-[12px] space-y-1">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-text">{s.goal_name}</span>
            <span className="font-mono font-bold text-accent-text">{formatMoney(amountCents)}</span>
          </div>
          <div className="text-[10.5px] text-faint">
            Fecha de aporte: {s.date || "Hoy"}
          </div>
        </div>

        {!applied && (
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setDiscarded(true)}
              disabled={applying}
              className="flex items-center gap-1 rounded px-2.5 py-1 text-[11px] text-faint hover:bg-hover hover:text-text disabled:opacity-50 transition-colors"
            >
              Descartar
            </button>
            <button
              type="button"
              onClick={() => void handleApply()}
              disabled={applying}
              className={cn(
                "flex items-center gap-1 rounded bg-accent px-2.5 py-1 text-[11.5px] font-medium text-white hover:bg-accent-strong disabled:opacity-60 transition-colors",
              )}
            >
              {applying ? (
                <>
                  <Loader2 size={12} className="animate-spin" /> Guardando…
                </>
              ) : (
                <>
                  <Plus size={12} /> Aportar {formatMoney(amountCents)} a «{s.goal_name}»
                </>
              )}
            </button>
          </div>
        )}
      </div>
    );
  }

  if (action.action === "create_category") {
    const c = action.category;
    return (
      <div className="mt-2.5 rounded-lg border border-accent/40 bg-surface p-3 shadow-sm">
        <div className="flex items-center justify-between border-b border-line/60 pb-2">
          <div className="flex items-center gap-1.5 text-accent-text">
            <Tag size={14} />
            <span className="text-[12px] font-semibold text-text">
              Nueva Categoría de {c.kind === "ingreso" ? "Ingreso" : "Gasto"}
            </span>
          </div>
          {applied && (
            <span className="flex items-center gap-1 text-[11px] font-medium text-mint">
              <Check size={12} /> Categoría creada
            </span>
          )}
        </div>

        <div className="my-2.5 rounded bg-panel/70 p-2.5 text-[12px]">
          <div className="flex items-center gap-2">
            <span className="text-[16px]">{c.icon || "🏷️"}</span>
            <span className="font-semibold text-text">{c.name}</span>
            <span className="rounded bg-hover px-1.5 py-0.5 text-[10px] text-dim capitalize">
              {c.kind}
            </span>
            {c.budget ? (
              <span className="text-[11px] text-dim">
                · Presupuesto: {formatMoney(Math.round(c.budget * 100))}
              </span>
            ) : null}
          </div>
        </div>

        {!applied && (
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setDiscarded(true)}
              disabled={applying}
              className="flex items-center gap-1 rounded px-2.5 py-1 text-[11px] text-faint hover:bg-hover hover:text-text disabled:opacity-50 transition-colors"
            >
              Descartar
            </button>
            <button
              type="button"
              onClick={() => void handleApply()}
              disabled={applying}
              className={cn(
                "flex items-center gap-1 rounded bg-accent px-2.5 py-1 text-[11.5px] font-medium text-white hover:bg-accent-strong disabled:opacity-60 transition-colors",
              )}
            >
              {applying ? (
                <>
                  <Loader2 size={12} className="animate-spin" /> Creando…
                </>
              ) : (
                <>
                  <Plus size={12} /> Crear categoría «{c.name}»
                </>
              )}
            </button>
          </div>
        )}
      </div>
    );
  }

  if (action.action === "set_budget") {
    const budgetCents = Math.round(action.budget * 100);
    return (
      <div className="mt-2.5 rounded-lg border border-accent/40 bg-surface p-3 shadow-sm">
        <div className="flex items-center justify-between border-b border-line/60 pb-2">
          <div className="flex items-center gap-1.5 text-accent-text">
            <Target size={14} />
            <span className="text-[12px] font-semibold text-text">
              Ajuste de Presupuesto Mensual
            </span>
          </div>
          {applied && (
            <span className="flex items-center gap-1 text-[11px] font-medium text-mint">
              <Check size={12} /> Presupuesto guardado
            </span>
          )}
        </div>

        <div className="my-2.5 rounded bg-panel/70 p-2.5 text-[12px]">
          <p className="text-text">
            ¿Deseas fijar el presupuesto total del mes en{" "}
            <strong className="font-bold text-accent-text">{formatMoney(budgetCents)}</strong>?
          </p>
        </div>

        {!applied && (
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setDiscarded(true)}
              disabled={applying}
              className="flex items-center gap-1 rounded px-2.5 py-1 text-[11px] text-faint hover:bg-hover hover:text-text disabled:opacity-50 transition-colors"
            >
              Descartar
            </button>
            <button
              type="button"
              onClick={() => void handleApply()}
              disabled={applying}
              className={cn(
                "flex items-center gap-1 rounded bg-accent px-2.5 py-1 text-[11.5px] font-medium text-white hover:bg-accent-strong disabled:opacity-60 transition-colors",
              )}
            >
              {applying ? (
                <>
                  <Loader2 size={12} className="animate-spin" /> Guardando…
                </>
              ) : (
                <>
                  <Plus size={12} /> Establecer presupuesto de {formatMoney(budgetCents)}
                </>
              )}
            </button>
          </div>
        )}
      </div>
    );
  }

  const m = action.movement;
  const amountCents = Math.round(m.amount * 100);
  const isGasto = m.type === "gasto";
  const isIngreso = m.type === "ingreso";
  const isRetiro = m.type === "retiro";

  return (
    <div className="mt-2.5 rounded-lg border border-line-strong bg-surface p-3 shadow-sm">
      <div className="flex items-center justify-between border-b border-line/60 pb-2">
        <div className="flex items-center gap-1.5">
          {isGasto ? (
            <TrendingDown size={14} className="text-danger" />
          ) : isIngreso ? (
            <TrendingUp size={14} className="text-mint" />
          ) : isRetiro ? (
            <ArrowUpRight size={14} className="text-amber-500" />
          ) : (
            <PiggyBank size={14} className="text-accent-text" />
          )}
          <span className="text-[12px] font-semibold text-text capitalize">
            {m.type}: {formatMoney(amountCents)}
          </span>
        </div>
        {applied && (
          <span className="flex items-center gap-1 text-[11px] font-medium text-mint">
            <Check size={12} /> Registrado en tu Diario
          </span>
        )}
      </div>

      <div className="my-2.5 rounded bg-panel/70 p-2.5 text-[12px] space-y-1">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-text">{m.what}</span>
          <span className="font-mono font-bold text-text">{formatMoney(amountCents)}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[10.5px] text-faint">
          {m.category && (
            <span className="inline-flex items-center gap-1 rounded bg-hover px-1.5 py-0.5 text-dim">
              <Tag size={10} /> {m.category}
            </span>
          )}
          <span>Fecha: {m.date || "Hoy"}</span>
        </div>
      </div>

      {!applied && (
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => setDiscarded(true)}
            disabled={applying}
            className="flex items-center gap-1 rounded px-2.5 py-1 text-[11px] text-faint hover:bg-hover hover:text-text disabled:opacity-50 transition-colors"
          >
            Descartar
          </button>
          <button
            type="button"
            onClick={() => void handleApply()}
            disabled={applying}
            className={cn(
              "flex items-center gap-1 rounded px-2.5 py-1 text-[11.5px] font-medium text-white disabled:opacity-60 transition-colors",
              isGasto
                ? "bg-danger hover:bg-danger/80"
                : isIngreso
                  ? "bg-mint hover:bg-mint/80 text-black font-semibold"
                  : isRetiro
                    ? "bg-amber-600 hover:bg-amber-700 text-white font-medium"
                    : "bg-accent hover:bg-accent-strong",
            )}
          >
            {applying ? (
              <>
                <Loader2 size={12} className="animate-spin" /> Registrando…
              </>
            ) : (
              <>
                <Plus size={12} /> Registrar {m.type} de {formatMoney(amountCents)}
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
