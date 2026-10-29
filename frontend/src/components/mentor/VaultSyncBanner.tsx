import { AlertCircle, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../lib/bridge";
import { useApp } from "../../store/app";
import { useMentor } from "../../store/mentor";
import { PrimaryButton } from "../common/forms";

export function VaultSyncBanner({ planId }: { planId: string }) {
  const [syncStatus, setSyncStatus] = useState<{
    needsSync: boolean;
    relocatedCount: number;
    missingCanvasCount: number;
  } | null>(null);
  const [running, setRunning] = useState(false);
  const planVersion = useMentor((s) => s.planVersion);

  useEffect(() => {
    let alive = true;
    void api.mentorPlanVaultCheck(planId)
      .then((res) => {
        if (alive) {
          setSyncStatus({
            needsSync: res.needsSync,
            relocatedCount: res.relocatedCount,
            missingCanvasCount: res.missingCanvasCount,
          });
        }
      })
      .catch(() => {
        // En caso de error o inicialización fría, no bloquear la vista
      });
    return () => {
      alive = false;
    };
  }, [planId, planVersion]);

  if (!syncStatus || !syncStatus.needsSync) return null;

  const handleReconcile = async () => {
    setRunning(true);
    try {
      const res = await api.mentorPlanVaultReconcile(planId, true);
      useApp.getState().toast(
        "info",
        `Sincronización completa: ${res.relocatedCount} temas revinculados, ${res.generatedCanvases} mapas generados.`,
      );
      useMentor.setState((s) => ({ planVersion: s.planVersion + 1 }));
      setSyncStatus({ needsSync: false, relocatedCount: 0, missingCanvasCount: 0 });
    } catch (err: any) {
      useApp.getState().toast("error", err?.message || "No se pudo sincronizar la vault");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div
      role="alert"
      className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-[13.5px] text-amber-200"
      data-testid="vault-sync-banner"
    >
      <div className="flex items-center gap-2.5">
        <AlertCircle className="h-5 w-5 shrink-0 text-amber-400" />
        <div>
          <p className="font-medium text-amber-300">
            Se detectó un cambio en la estructura de carpetas o faltan archivos del plan en la vault
          </p>
          <p className="text-dim">
            {syncStatus.relocatedCount > 0 && `${syncStatus.relocatedCount} temas reubicados. `}
            {syncStatus.missingCanvasCount > 0 && `${syncStatus.missingCanvasCount} canvas explicativos por generar. `}
            Para estudiar a través del Mentor, escanea los IDs de la vault para revincular automáticamente todos los archivos.
          </p>
        </div>
      </div>
      <PrimaryButton
        onClick={handleReconcile}
        disabled={running}
        data-testid="btn-vault-reconcile"
        className="flex items-center gap-1.5 py-1.5 text-xs"
      >
        <RefreshCw className={running ? "animate-spin" : ""} size={14} />
        {running ? "Sincronizando..." : "Escanear IDs y sincronizar archivos"}
      </PrimaryButton>
    </div>
  );
}

