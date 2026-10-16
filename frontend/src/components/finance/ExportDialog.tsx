// Modal for exporting financial reports and data in CSV and JSON formats.

import { FileSpreadsheet, FileText } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/bridge";
import { formatMoney } from "../../lib/money";
import { todayIso } from "../../lib/tasks";
import type { FinCategory, FinGoal, Movement } from "../../lib/types";
import { useApp } from "../../store/app";
import { useFinance } from "../../store/finance";
import { GhostButton, Modal } from "../common/forms";
import { cn } from "../ui";
import { categoryText, exportCsv, exportJson, signed, totals, TYPE_COLOURS, TYPE_LABELS } from "./parts";

export interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  initialScope?: "month" | "year" | "all";
}

type Scope = "month" | "year" | "all";

export function ExportDialog({ isOpen, onClose, initialScope = "month" }: ExportDialogProps) {
  const meta = useFinance((s) => s.meta);
  const toast = useApp((s) => s.toast);

  const [scope, setScope] = useState<Scope>(initialScope);
  const [allMovements, setAllMovements] = useState<Movement[]>([]);
  const [categories, setCategories] = useState<FinCategory[]>([]);
  const [goals, setGoals] = useState<FinGoal[]>([]);
  const [currency, setCurrency] = useState("USD");
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<"csv" | "json" | null>(null);

  const today = todayIso();
  const currentYear = today.slice(0, 4);
  const currentMonth = today.slice(0, 7);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    api.finExportAll()
      .then((data) => {
        setAllMovements((data.movements as Movement[]) ?? []);
        setCategories((data.categories as FinCategory[]) ?? []);
        setGoals((data.goals as FinGoal[]) ?? []);
        setCurrency(data.currency || meta?.currency || "USD");
      })
      .catch((err) => {
        toast("error", `Error al cargar datos para exportar: ${(err as Error).message}`);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [isOpen, meta?.currency, toast]);

  const filteredMovements = useMemo(() => {
    if (scope === "month") {
      return allMovements.filter((m) => m.date.startsWith(currentMonth));
    }
    if (scope === "year") {
      return allMovements.filter((m) => m.date.startsWith(currentYear));
    }
    return allMovements;
  }, [allMovements, scope, currentMonth, currentYear]);

  const summary = useMemo(() => {
    return totals(filteredMovements);
  }, [filteredMovements]);

  if (!isOpen) return null;

  const handleExportCsv = async () => {
    setExporting("csv");
    try {
      const sorted = [...filteredMovements].sort((a, b) => a.date.localeCompare(b.date));
      const rows = sorted.map((m) => [
        m.date,
        m.time ?? "",
        TYPE_LABELS[m.type] ?? m.type,
        categoryText(m),
        m.what ?? "",
        m.reason ?? "",
        (signed(m) / 100).toFixed(2),
        m.currency || currency,
      ]);

      const filename =
        scope === "month"
          ? `finanzas_${currentMonth}.csv`
          : scope === "year"
            ? `finanzas_${currentYear}.csv`
            : `finanzas_historico_${today}.csv`;

      const header = ["Fecha", "Hora", "Tipo", "Categoría", "Detalle", "Motivo", "Importe", "Moneda"];
      const res = await exportCsv(filename, header, rows);
      if (res.ok) {
        toast("info", `✓ Exportado exitosamente: ${res.path || filename}`);
        onClose();
      }
    } catch (err) {
      toast("error", `Error al exportar CSV: ${(err as Error).message}`);
    } finally {
      setExporting(null);
    }
  };

  const handleExportJson = async () => {
    setExporting("json");
    try {
      const payload = {
        exported_at: new Date().toISOString(),
        scope,
        currency,
        summary: {
          total_gasto_cents: summary.gasto,
          total_ingreso_cents: summary.ingreso,
          total_ahorro_cents: summary.ahorro,
          total_retiro_cents: summary.retiro,
          balance_neto_cents: summary.neto,
          caja_disponible_cents: summary.disponible,
        },
        categories: categories.map((c) => ({
          id: c.id,
          name: c.name,
          kind: c.kind,
          budget_month_cents: c.budget_month_cents,
        })),
        goals: goals.map((g) => ({
          id: g.id,
          name: g.name,
          target_cents: g.target_cents,
          start: g.start,
          deadline: g.deadline,
        })),
        movements: filteredMovements.map((m) => ({
          id: m.id,
          date: m.date,
          time: m.time,
          type: m.type,
          amount_cents: m.amount_cents,
          currency: m.currency || currency,
          category: m.category,
          goal: m.goal,
          what: m.what,
          reason: m.reason,
        })),
      };

      const filename =
        scope === "month"
          ? `finanzas_${currentMonth}.json`
          : scope === "year"
            ? `finanzas_${currentYear}.json`
            : `finanzas_historico_${today}.json`;

      const res = await exportJson(filename, payload);
      if (res.ok) {
        toast("info", `✓ Exportado exitosamente: ${res.path || filename}`);
        onClose();
      }
    } catch (err) {
      toast("error", `Error al exportar JSON: ${(err as Error).message}`);
    } finally {
      setExporting(null);
    }
  };

  return (
    <Modal title="Exportación y Reportes de Finanzas" onClose={onClose} width={580}>
      <div className="space-y-4 text-[13px]">
        {/* Scope selector */}
        <div>
          <span className="nv-label mb-2 block font-mono text-[10.5px] uppercase tracking-wider text-faint">
            Alcance del reporte
          </span>
          <div className="grid grid-cols-3 gap-2" role="group" aria-label="Alcance">
            <button
              type="button"
              aria-pressed={scope === "month"}
              onClick={() => setScope("month")}
              className={cn(
                "flex flex-col items-start rounded-xl border p-3 text-left transition-colors",
                scope === "month"
                  ? "border-accent bg-accent/10 text-text"
                  : "border-line bg-card text-dim hover:border-line-strong",
              )}
            >
              <span className="font-semibold text-text">Mes actual</span>
              <span className="mt-0.5 font-mono text-[11px] text-faint">{currentMonth}</span>
            </button>
            <button
              type="button"
              aria-pressed={scope === "year"}
              onClick={() => setScope("year")}
              className={cn(
                "flex flex-col items-start rounded-xl border p-3 text-left transition-colors",
                scope === "year"
                  ? "border-accent bg-accent/10 text-text"
                  : "border-line bg-card text-dim hover:border-line-strong",
              )}
            >
              <span className="font-semibold text-text">Año completo</span>
              <span className="mt-0.5 font-mono text-[11px] text-faint">{currentYear}</span>
            </button>
            <button
              type="button"
              aria-pressed={scope === "all"}
              onClick={() => setScope("all")}
              className={cn(
                "flex flex-col items-start rounded-xl border p-3 text-left transition-colors",
                scope === "all"
                  ? "border-accent bg-accent/10 text-text"
                  : "border-line bg-card text-dim hover:border-line-strong",
              )}
            >
              <span className="font-semibold text-text">Todo el Vault</span>
              <span className="mt-0.5 text-[11px] text-faint">Histórico total</span>
            </button>
          </div>
        </div>

        {/* Live Metrics preview */}
        <div className="rounded-xl border border-line bg-card p-3.5 space-y-2">
          <div className="flex items-center justify-between text-[12px]">
            <span className="font-mono text-[10.5px] font-semibold uppercase tracking-wider text-faint">
              Resumen de registros ({loading ? "cargando…" : `${filteredMovements.length} movimientos`})
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 pt-1">
            <div className="rounded-lg bg-surface p-2">
              <span className="block text-[11px] text-faint">Ingresos</span>
              <span className="font-mono text-[13px] font-semibold" style={{ color: TYPE_COLOURS.ingreso }}>
                {formatMoney(summary.ingreso)}
              </span>
            </div>
            <div className="rounded-lg bg-surface p-2">
              <span className="block text-[11px] text-faint">Gastos</span>
              <span className="font-mono text-[13px] font-semibold" style={{ color: TYPE_COLOURS.gasto }}>
                {formatMoney(summary.gasto)}
              </span>
            </div>
            <div className="rounded-lg bg-surface p-2">
              <span className="block text-[11px] text-faint">Ahorro neto</span>
              <span className="font-mono text-[13px] font-semibold" style={{ color: TYPE_COLOURS.ahorro }}>
                {formatMoney(summary.ahorro - summary.retiro)}
              </span>
            </div>
            <div className="rounded-lg bg-surface p-2">
              <span className="block text-[11px] text-faint">Flujo neto</span>
              <span className="font-mono text-[13px] font-semibold text-text">
                {formatMoney(summary.neto)}
              </span>
            </div>
          </div>
        </div>

        {/* Format actions */}
        <div className="space-y-2.5 pt-1">
          <span className="nv-label block font-mono text-[10.5px] uppercase tracking-wider text-faint">
            Selecciona el formato de descarga
          </span>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <button
              type="button"
              disabled={loading || exporting !== null || filteredMovements.length === 0}
              onClick={() => void handleExportCsv()}
              className="flex items-center gap-3 rounded-xl border border-line bg-card p-3.5 text-left transition hover:border-line-strong hover:bg-hover disabled:opacity-50"
            >
              <div className="grid h-10 w-10 flex-none place-items-center rounded-lg bg-emerald-500/10 text-emerald-500">
                <FileSpreadsheet size={20} />
              </div>
              <div>
                <span className="block font-semibold text-text">Descargar CSV</span>
                <span className="block text-[11px] text-faint">
                  Compatible con Excel, Calc y Google Sheets (UTF-8)
                </span>
              </div>
            </button>

            <button
              type="button"
              disabled={loading || exporting !== null || filteredMovements.length === 0}
              onClick={() => void handleExportJson()}
              className="flex items-center gap-3 rounded-xl border border-line bg-card p-3.5 text-left transition hover:border-line-strong hover:bg-hover disabled:opacity-50"
            >
              <div className="grid h-10 w-10 flex-none place-items-center rounded-lg bg-sky-500/10 text-sky-500">
                <FileText size={20} />
              </div>
              <div>
                <span className="block font-semibold text-text">Descargar JSON</span>
                <span className="block text-[11px] text-faint">
                  Copia de seguridad estructurada con metadatos y categorías
                </span>
              </div>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
          <GhostButton onClick={onClose} disabled={exporting !== null}>
            Cerrar
          </GhostButton>
        </div>
      </div>
    </Modal>
  );
}
