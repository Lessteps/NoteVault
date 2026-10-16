// Modal for importing bank statement CSVs with auto-detection, column mapping, duplicate detection and smart rules.

import { AlertCircle, AlertTriangle, Check, CheckSquare, FileText, Sparkles, Square, Upload, Zap } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { api } from "../../lib/bridge";
import {
  buildMovementRows,
  detectColumns,
  parseCsvRows,
  type ColumnMapping,
  type ParsedCsvRow,
  type RuleSuggestion,
} from "../../lib/csvParser";
import { formatMoney } from "../../lib/money";
import type { FinImportItem, FinRule, MovementType } from "../../lib/types";
import { useApp } from "../../store/app";
import { useFinance } from "../../store/finance";
import { GhostButton, inputBase, Modal, PrimaryButton } from "../common/forms";
import { cn } from "../ui";
import { TYPE_COLOURS, TYPE_LABELS } from "./parts";

export interface CsvImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CsvImportDialog({ isOpen, onClose }: CsvImportDialogProps) {
  const meta = useFinance((s) => s.meta);
  const changed = useFinance((s) => s.changed);
  const toast = useApp((s) => s.toast);
  const fileInputId = useId();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string>("");
  const [csvText, setCsvText] = useState<string>("");
  const [delimiter, setDelimiter] = useState<string>(",");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({ dateCol: 0, descCol: 1, amountCol: 2 });
  const [rows, setRows] = useState<ParsedCsvRow[]>([]);
  const [userRules, setUserRules] = useState<FinRule[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saveRulesOnImport, setSaveRulesOnImport] = useState(true);
  const [filterMode, setFilterMode] = useState<"all" | "selected" | "duplicates" | "errors">("all");

  const categories = useMemo(() => {
    return (meta?.categories ?? []).map((c) => ({ id: c.id, name: c.name, kind: c.kind, icon: c.icon }));
  }, [meta?.categories]);

  // Load existing categorization rules
  useEffect(() => {
    if (!isOpen) return;
    api.finRulesGet()
      .then((res) => setUserRules(res.rules ?? []))
      .catch(() => setUserRules([]));
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFile = (file: File) => {
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = String(e.target?.result ?? "");
      setCsvText(text);
      processCsv(text, userRules);
    };
    reader.readAsText(file, "UTF-8");
  };

  const processCsv = async (text: string, rulesList: FinRule[]) => {
    const parsed = parseCsvRows(text);
    setDelimiter(parsed.delimiter);
    setHeaders(parsed.headers);
    setRawRows(parsed.rows);

    const detected = detectColumns(parsed.headers, parsed.rows.slice(0, 5));
    const initMapping: ColumnMapping = {
      dateCol: detected.dateCol,
      descCol: detected.descCol,
      amountCol: detected.amountCol,
      debitCol: detected.debitCol !== -1 ? detected.debitCol : undefined,
      creditCol: detected.creditCol !== -1 ? detected.creditCol : undefined,
    };
    setMapping(initMapping);

    const ruleSuggestions: RuleSuggestion[] = rulesList.map((r) => ({
      pattern: r.pattern,
      category: r.category,
      type: r.type,
    }));

    const built = buildMovementRows(parsed.rows, initMapping, categories, ruleSuggestions);

    // Check duplicates against the Vault
    try {
      const candidates = built.map((r) => ({
        date: r.date,
        amount_cents: r.amount_cents,
        what: r.what,
        type: r.type,
      }));
      const dupRes = await api.finFindDuplicates(candidates);
      const dupMap = new Map<number, string>();
      for (const d of dupRes.duplicates) {
        dupMap.set(d.index, d.reason);
      }

      setRows(
        built.map((r, idx) => {
          const reason = dupMap.get(idx);
          if (reason) {
            return {
              ...r,
              isDuplicate: true,
              duplicateReason: reason,
              selected: false, // Deselect duplicate by default to protect from double accounting
            };
          }
          return r;
        }),
      );
    } catch {
      setRows(built);
    }
  };

  const updateMapping = async (partial: Partial<ColumnMapping>) => {
    const nextMapping = { ...mapping, ...partial };
    setMapping(nextMapping);
    if (rawRows.length > 0) {
      const ruleSuggestions: RuleSuggestion[] = userRules.map((r) => ({
        pattern: r.pattern,
        category: r.category,
        type: r.type,
      }));
      const built = buildMovementRows(rawRows, nextMapping, categories, ruleSuggestions);
      try {
        const candidates = built.map((r) => ({
          date: r.date,
          amount_cents: r.amount_cents,
          what: r.what,
          type: r.type,
        }));
        const dupRes = await api.finFindDuplicates(candidates);
        const dupMap = new Map<number, string>();
        for (const d of dupRes.duplicates) dupMap.set(d.index, d.reason);
        setRows(
          built.map((r, idx) => {
            const reason = dupMap.get(idx);
            return reason ? { ...r, isDuplicate: true, duplicateReason: reason, selected: false } : r;
          }),
        );
      } catch {
        setRows(built);
      }
    }
  };

  const toggleRowSelected = (rowId: string) => {
    setRows((prev) =>
      prev.map((r) => (r.rowId === rowId ? { ...r, selected: !r.selected } : r)),
    );
  };

  const toggleSelectAll = (select: boolean) => {
    setRows((prev) =>
      prev.map((r) => (r.error ? r : { ...r, selected: select })),
    );
  };

  const updateRowType = (rowId: string, nextType: MovementType) => {
    setRows((prev) =>
      prev.map((r) => (r.rowId === rowId ? { ...r, type: nextType } : r)),
    );
  };

  const updateRowCategory = (rowId: string, nextCat: string) => {
    setRows((prev) =>
      prev.map((r) => (r.rowId === rowId ? { ...r, category: nextCat } : r)),
    );
  };

  const setAllTypes = (type: MovementType) => {
    setRows((prev) => prev.map((r) => ({ ...r, type })));
  };

  const saveRuleForPattern = async (pattern: string, category: string, type?: MovementType) => {
    if (!pattern.trim() || !category) return;
    try {
      const saved = await api.finRulesSave({ pattern: pattern.trim(), category, type });
      setUserRules((prev) => {
        const idx = prev.findIndex((r) => r.pattern.toLowerCase() === pattern.toLowerCase());
        if (idx !== -1) {
          const next = [...prev];
          next[idx] = saved;
          return next;
        }
        return [...prev, saved];
      });
      toast("info", `✓ Regla guardada: "${pattern}" → ${categories.find((c) => c.id === category)?.name || category}`);
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };

  const selectedRows = rows.filter((r) => r.selected && !r.error);
  const duplicateRows = rows.filter((r) => r.isDuplicate);
  const totalExpense = selectedRows
    .filter((r) => r.type === "gasto")
    .reduce((acc, r) => acc + r.amount_cents, 0);
  const totalIncome = selectedRows
    .filter((r) => r.type === "ingreso")
    .reduce((acc, r) => acc + r.amount_cents, 0);

  const displayedRows = rows.filter((r) => {
    if (filterMode === "selected") return r.selected && !r.error;
    if (filterMode === "duplicates") return Boolean(r.isDuplicate);
    if (filterMode === "errors") return Boolean(r.error);
    return true;
  });

  const handleImport = async () => {
    if (selectedRows.length === 0) {
      toast("error", "No hay movimientos seleccionados para importar.");
      return;
    }

    setIsSubmitting(true);
    try {
      const items: FinImportItem[] = selectedRows.map((r) => ({
        date: r.date,
        type: r.type,
        amount_cents: r.amount_cents,
        what: r.what,
        category: r.category || undefined,
        currency: meta?.currency || "USD",
      }));

      // Automatically learn rules for assigned categories if enabled
      if (saveRulesOnImport) {
        for (const r of selectedRows) {
          if (r.category && !r.matchedRule && r.what.length >= 3) {
            // Extract the most representative word or short phrase
            const clean = r.what.split(/[\s*#_-]/)[0] || r.what;
            if (clean.length >= 3) {
              void api.finRulesSave({ pattern: clean, category: r.category, type: r.type }).catch(() => undefined);
            }
          }
        }
      }

      const res = await api.finImportBatch(items);
      toast(
        "info",
        `✓ Se importaron ${res.imported} movimientos exitosamente al Diario.`,
      );
      await changed();
      onClose();
    } catch (err) {
      toast("error", `Error al importar: ${(err as Error).message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetState = () => {
    setFileName("");
    setCsvText("");
    setHeaders([]);
    setRawRows([]);
    setRows([]);
  };

  return (
    <Modal title="Importar extracto bancario (CSV)" onClose={onClose} width={920}>
      <div className="space-y-4">
        {!csvText ? (
          // Drag and drop zone
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              const file = e.dataTransfer.files[0];
              if (file) handleFile(file);
            }}
            className={cn(
              "flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-10 text-center transition-colors",
              isDragging
                ? "border-accent bg-accent/5"
                : "border-line hover:border-line-strong bg-surface/50",
            )}
          >
            <div className="mb-3 grid h-12 w-12 place-items-center rounded-xl bg-elevated text-dim">
              <Upload size={24} />
            </div>
            <h3 className="text-[15px] font-semibold text-text">
              Arrastra tu extracto bancario (.csv)
            </h3>
            <p className="mt-1 max-w-sm text-[12.5px] text-faint">
              Compatible con exportaciones de bancos, billeteras y homebanking (delimitados por coma, punto y coma o tabulación).
            </p>
            <div className="mt-4">
              <input
                id={fileInputId}
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv,text/plain"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                }}
              />
              <PrimaryButton onClick={() => fileInputRef.current?.click()}>
                Seleccionar archivo local
              </PrimaryButton>
            </div>
          </div>
        ) : (
          <>
            {/* Header file bar & mapping */}
            <div className="rounded-xl border border-line bg-card p-3 text-[12px]">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2.5">
                <div className="flex items-center gap-2">
                  <FileText size={16} className="text-dim" />
                  <span className="font-semibold text-text">{fileName}</span>
                  <span className="rounded bg-elevated px-1.5 py-0.5 font-mono text-[11px] text-faint">
                    {rawRows.length} filas · separador &quot;{delimiter}&quot;
                  </span>
                  {duplicateRows.length > 0 && (
                    <span className="flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-500">
                      <AlertTriangle size={12} /> {duplicateRows.length} posibles duplicados detectados
                    </span>
                  )}
                </div>
                <GhostButton className="text-[11px]" onClick={resetState}>
                  Cambiar archivo
                </GhostButton>
              </div>

              {/* Column mapping controls */}
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label htmlFor={`${fileInputId}-col-date`} className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-faint">
                    Columna Fecha
                  </label>
                  <select
                    id={`${fileInputId}-col-date`}
                    aria-label="Columna Fecha"
                    className={cn(inputBase, "w-full py-1 text-[12px]")}
                    value={mapping.dateCol}
                    onChange={(e) => void updateMapping({ dateCol: Number(e.target.value) })}
                  >
                    {headers.map((h, i) => (
                      <option key={i} value={i}>
                        Columna {i + 1}: {h || `(Sin título)`}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor={`${fileInputId}-col-desc`} className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-faint">
                    Columna Concepto / Detalle
                  </label>
                  <select
                    id={`${fileInputId}-col-desc`}
                    aria-label="Columna Concepto"
                    className={cn(inputBase, "w-full py-1 text-[12px]")}
                    value={mapping.descCol}
                    onChange={(e) => void updateMapping({ descCol: Number(e.target.value) })}
                  >
                    {headers.map((h, i) => (
                      <option key={i} value={i}>
                        Columna {i + 1}: {h || `(Sin título)`}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor={`${fileInputId}-col-amount`} className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-faint">
                    Columna Importe / Monto
                  </label>
                  <select
                    id={`${fileInputId}-col-amount`}
                    aria-label="Columna Importe"
                    className={cn(inputBase, "w-full py-1 text-[12px]")}
                    value={mapping.amountCol}
                    onChange={(e) => void updateMapping({ amountCol: Number(e.target.value) })}
                  >
                    {headers.map((h, i) => (
                      <option key={i} value={i}>
                        Columna {i + 1}: {h || `(Sin título)`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Quick bulk actions and filter toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-[12px]">
              <div className="flex items-center gap-2">
                <GhostButton
                  className="py-1 text-[11px]"
                  onClick={() => toggleSelectAll(true)}
                >
                  <CheckSquare size={13} /> Seleccionar todo
                </GhostButton>
                <GhostButton
                  className="py-1 text-[11px]"
                  onClick={() => toggleSelectAll(false)}
                >
                  <Square size={13} /> Deseleccionar todo
                </GhostButton>
                <span className="text-line">|</span>
                <span className="text-faint">Tipo:</span>
                <GhostButton
                  className="py-1 text-[11px]"
                  onClick={() => setAllTypes("gasto")}
                >
                  Todos Gasto
                </GhostButton>
                <GhostButton
                  className="py-1 text-[11px]"
                  onClick={() => setAllTypes("ingreso")}
                >
                  Todos Ingreso
                </GhostButton>
              </div>

              <div className="flex gap-1" role="group" aria-label="Filtro de previsualización">
                {(["all", "selected", "duplicates", "errors"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={filterMode === m}
                    onClick={() => setFilterMode(m)}
                    className={cn(
                      "rounded-lg border px-2 py-0.5 text-[11px]",
                      filterMode === m
                        ? "border-line-strong bg-elevated text-text font-medium"
                        : "border-line text-dim hover:bg-hover",
                    )}
                  >
                    {m === "all"
                      ? `Todos (${rows.length})`
                      : m === "selected"
                        ? `Seleccionados (${selectedRows.length})`
                        : m === "duplicates"
                          ? `Duplicados (${duplicateRows.length})`
                          : `Con error (${rows.filter((r) => r.error).length})`}
                  </button>
                ))}
              </div>
            </div>

            {/* Data Preview Table */}
            <div className="max-h-72 overflow-y-auto rounded-xl border border-line bg-card">
              <table className="w-full text-left text-[12px]">
                <thead className="sticky top-0 z-10 border-b border-line bg-elevated/90 backdrop-blur-xs font-mono text-[10px] uppercase text-faint">
                  <tr>
                    <th className="w-8 p-2 text-center">✓</th>
                    <th className="w-24 p-2">Fecha</th>
                    <th className="p-2">Concepto</th>
                    <th className="w-24 p-2">Tipo</th>
                    <th className="w-48 p-2">Categoría</th>
                    <th className="w-28 p-2 text-right">Importe</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {displayedRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-faint">
                        No hay filas en este filtro.
                      </td>
                    </tr>
                  ) : (
                    displayedRows.map((r) => (
                      <tr
                        key={r.rowId}
                        className={cn(
                          "hover:bg-hover/50 transition-colors",
                          !r.selected && "opacity-60",
                          r.isDuplicate && "bg-amber-500/5",
                          r.error && "bg-red-500/5",
                        )}
                      >
                        <td className="p-2 text-center">
                          <input
                            type="checkbox"
                            checked={r.selected}
                            disabled={Boolean(r.error)}
                            onChange={() => toggleRowSelected(r.rowId)}
                            aria-label={`Seleccionar fila ${r.originalIndex + 1}`}
                            className="rounded accent-accent"
                          />
                        </td>
                        <td className="p-2 font-mono text-[11.5px] text-text">
                          {r.date || (
                            <span className="flex items-center gap-1 text-red-400">
                              <AlertCircle size={12} /> Error
                            </span>
                          )}
                        </td>
                        <td className="p-2 text-text">
                          <div className="flex items-center gap-1.5 max-w-[260px]">
                            <span className="truncate" title={r.what}>{r.what}</span>
                            {r.matchedRule && (
                              <span title="Categorizado automáticamente por regla guardada" className="inline-flex items-center gap-0.5 rounded bg-sky-500/10 px-1 py-0.2 text-[9.5px] font-mono text-sky-400 flex-none">
                                <Zap size={10} /> regla
                              </span>
                            )}
                          </div>
                          {r.isDuplicate && (
                            <span title={r.duplicateReason} className="flex items-center gap-1 text-[10.5px] font-medium text-amber-500">
                              <AlertTriangle size={11} /> {r.duplicateReason}
                            </span>
                          )}
                          {r.error && (
                            <span className="text-[10px] text-red-400">
                              {r.error}
                            </span>
                          )}
                        </td>
                        <td className="p-2">
                          <select
                            value={r.type}
                            onChange={(e) =>
                              updateRowType(r.rowId, e.target.value as MovementType)
                            }
                            className={cn(
                              inputBase,
                              "py-0.5 px-1.5 text-[11px] w-full",
                            )}
                            style={{ color: TYPE_COLOURS[r.type] }}
                          >
                            {(["gasto", "ingreso", "ahorro", "retiro"] as const).map(
                              (t) => (
                                <option key={t} value={t}>
                                  {TYPE_LABELS[t]}
                                </option>
                              ),
                            )}
                          </select>
                        </td>
                        <td className="p-2">
                          <div className="flex items-center gap-1">
                            <select
                              value={r.category}
                              onChange={(e) =>
                                updateRowCategory(r.rowId, e.target.value)
                              }
                              className={cn(
                                inputBase,
                                "py-0.5 px-1.5 text-[11px] flex-1",
                              )}
                            >
                              <option value="">Sin categoría</option>
                              {categories
                                .filter((c) => c.kind === r.type)
                                .map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.icon} {c.name}
                                  </option>
                                ))}
                            </select>
                            {r.category && !r.matchedRule && (
                              <button
                                type="button"
                                title="Guardar como regla permanente para este concepto"
                                onClick={() => void saveRuleForPattern(r.what, r.category, r.type)}
                                className="grid h-6 w-6 flex-none place-items-center rounded border border-line bg-surface text-faint hover:text-accent hover:border-accent transition-colors"
                              >
                                <Sparkles size={12} />
                              </button>
                            )}
                          </div>
                        </td>
                        <td
                          className="p-2 text-right font-mono font-medium"
                          style={{ color: TYPE_COLOURS[r.type] }}
                        >
                          {r.type === "gasto" ? "- " : "+ "}
                          {formatMoney(r.amount_cents)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Bottom summary and submit */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-card p-3">
              <div className="space-y-1 text-[12px] text-dim">
                <div>
                  <span className="font-semibold text-text">
                    {selectedRows.length}
                  </span>{" "}
                  movimientos seleccionados · Gastos:{" "}
                  <b className="font-mono text-red-400">
                    {formatMoney(totalExpense)}
                  </b>{" "}
                  · Ingresos:{" "}
                  <b className="font-mono text-green-400">
                    {formatMoney(totalIncome)}
                  </b>
                </div>
                <label className="flex items-center gap-1.5 text-[11px] text-faint cursor-pointer">
                  <input
                    type="checkbox"
                    checked={saveRulesOnImport}
                    onChange={(e) => setSaveRulesOnImport(e.target.checked)}
                    className="rounded accent-accent"
                  />
                  <span>Recordar categorizaciones nuevas como reglas para futuras importaciones</span>
                </label>
              </div>

              <div className="flex items-center gap-2">
                <GhostButton onClick={onClose} disabled={isSubmitting}>
                  Cancelar
                </GhostButton>
                <PrimaryButton
                  onClick={() => void handleImport()}
                  disabled={selectedRows.length === 0 || isSubmitting}
                >
                  <Check size={14} />
                  {isSubmitting
                    ? "Importando…"
                    : `Importar ${selectedRows.length} movimientos`}
                </PrimaryButton>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
