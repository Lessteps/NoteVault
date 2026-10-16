import { useState, useEffect } from "react";
import { FileText, Table, Check, Loader2, BookOpen } from "lucide-react";
import { useNutrition } from "../../store/nutrition";
import { useApp } from "../../store/app";
import { Modal, GhostButton } from "../common/forms";
import { exportCsv } from "../finance/parts";
import { api } from "../../lib/bridge";

export function ExportNutritionDialog() {
  const exportModalOpen = useNutrition((s) => s.exportModalOpen);
  const setExportModalOpen = useNutrition((s) => s.setExportModalOpen);
  const generateReport = useNutrition((s) => s.generateReport);
  const toast = useApp((s) => s.toast);

  const [daysRange, setDaysRange] = useState<number>(7);
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState<{
    markdown: string;
    csv: { header: string[]; rows: Array<Array<string | number>> };
  } | null>(null);

  const [savedToVault, setSavedToVault] = useState(false);

  useEffect(() => {
    if (exportModalOpen) {
      void fetchReport(daysRange);
      setSavedToVault(false);
    }
  }, [exportModalOpen, daysRange]);

  const fetchReport = async (days: number) => {
    setLoading(true);
    try {
      const data = await generateReport(days);
      setReportData(data);
    } catch (e) {
      toast("error", `Error al generar reporte: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  if (!exportModalOpen) return null;

  const handleDownloadMarkdown = async () => {
    if (!reportData) return;
    const filename = `Reporte-Nutricion-${daysRange}d-${new Date().toISOString().slice(0, 10)}.md`;
    try {
      const res = await api.saveTextAs(filename, reportData.markdown);
      if (res.fallback) {
        const url = URL.createObjectURL(new Blob([reportData.markdown], { type: "text/markdown;charset=utf-8" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      }
      toast("info", `Reporte descargado: ${filename}`);
    } catch (e) {
      toast("error", `Error al descargar: ${(e as Error).message}`);
    }
  };

  const handleDownloadCsv = async () => {
    if (!reportData) return;
    const filename = `Nutricion-Diario-${daysRange}d-${new Date().toISOString().slice(0, 10)}.csv`;
    try {
      await exportCsv(filename, reportData.csv.header, reportData.csv.rows);
      toast("info", `CSV descargado: ${filename}`);
    } catch (e) {
      toast("error", `Error al descargar CSV: ${(e as Error).message}`);
    }
  };

  const handleSaveToVaultNote = async () => {
    if (!reportData) return;
    const notePath = `Reportes/Nutricion-${new Date().toISOString().slice(0, 10)}.md`;
    try {
      await api.writeNote(notePath, reportData.markdown, null);
      setSavedToVault(true);
      toast("info", `Nota guardada con éxito en ${notePath}`);
      setTimeout(() => setSavedToVault(false), 3000);
    } catch (e) {
      toast("error", `Error al guardar en el Vault: ${(e as Error).message}`);
    }
  };

  return (
    <Modal
      title="Exportar Reporte y Resumen Nutricional"
      onClose={() => setExportModalOpen(false)}
      width={620}
    >
      <div className="space-y-4 text-main" data-testid="export-nutrition-dialog">
        {/* Selector de rango de días */}
        <div className="flex items-center justify-between border-b border-line pb-3">
          <div>
            <span className="text-[12.5px] font-semibold text-main block">Período del reporte:</span>
            <span className="text-[11px] text-faint">
              Incluye promedios calóricos, cumplimiento proteico, alimentos frecuentes y detalle diario.
            </span>
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-line bg-card/60 p-0.5 text-[12px]">
            {[7, 14, 30].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => setDaysRange(num)}
                className={`rounded-md px-3 py-1 font-medium transition-colors ${
                  daysRange === num ? "bg-accent text-white shadow-xs font-semibold" : "text-faint hover:text-dim"
                }`}
                data-testid={`export-range-${num}`}
              >
                {num} días
              </button>
            ))}
          </div>
        </div>

        {/* Vista previa / Contenido */}
        {loading ? (
          <div className="py-12 text-center text-[12.5px] text-faint flex items-center justify-center gap-2">
            <Loader2 size={16} className="animate-spin text-accent" />
            <span>Generando reporte y métricas...</span>
          </div>
        ) : reportData ? (
          <div className="space-y-3">
            <div className="max-h-56 overflow-y-auto rounded-xl border border-line bg-card/60 p-3 font-mono text-[11px] leading-relaxed text-dim selection:bg-accent/20">
              <pre className="whitespace-pre-wrap">{reportData.markdown}</pre>
            </div>

            {/* Opciones de exportación */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2">
              <button
                type="button"
                onClick={handleDownloadMarkdown}
                className="flex flex-col items-center justify-center rounded-xl border border-line bg-elevated/40 p-3 text-center transition-colors hover:border-accent hover:bg-accent/5 group"
                data-testid="export-md-btn"
              >
                <FileText size={20} className="text-accent mb-1 group-hover:scale-110 transition-transform" />
                <span className="text-[12px] font-semibold text-main">Descargar Markdown</span>
                <span className="text-[10.5px] text-faint">Formato estructurado .md</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadCsv}
                className="flex flex-col items-center justify-center rounded-xl border border-line bg-elevated/40 p-3 text-center transition-colors hover:border-emerald-500 hover:bg-emerald-500/5 group"
                data-testid="export-csv-btn"
              >
                <Table size={20} className="text-emerald-400 mb-1 group-hover:scale-110 transition-transform" />
                <span className="text-[12px] font-semibold text-main">Descargar CSV</span>
                <span className="text-[10.5px] text-faint">Para Excel o Calc</span>
              </button>

              <button
                type="button"
                onClick={handleSaveToVaultNote}
                className="flex flex-col items-center justify-center rounded-xl border border-line bg-elevated/40 p-3 text-center transition-colors hover:border-indigo-500 hover:bg-indigo-500/5 group"
                data-testid="export-vault-note-btn"
              >
                {savedToVault ? (
                  <Check size={20} className="text-emerald-400 mb-1" />
                ) : (
                  <BookOpen size={20} className="text-indigo-400 mb-1 group-hover:scale-110 transition-transform" />
                )}
                <span className="text-[12px] font-semibold text-main">
                  {savedToVault ? "¡Guardado!" : "Guardar en el Vault"}
                </span>
                <span className="text-[10.5px] text-faint">Crear nota en Reportes/</span>
              </button>
            </div>
          </div>
        ) : null}

        <div className="flex justify-end pt-2 border-t border-line">
          <GhostButton onClick={() => setExportModalOpen(false)} className="text-[12px]">
            Cerrar
          </GhostButton>
        </div>
      </div>
    </Modal>
  );
}
