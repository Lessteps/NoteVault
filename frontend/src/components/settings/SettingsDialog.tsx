// Configuración dialog: Rendimiento (GPU, backend ANGLE, modo lite, reducción de movimiento)
// y Apariencia (tema claro / oscuro).

import { AlertCircle, Check, Moon, RefreshCw, Sparkles, Sun, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { create } from "zustand";
import { api } from "../../lib/bridge";
import type { AngleBackend, GpuStatus, RenderingMode, RenderingSettings } from "../../lib/types";
import { applyRenderingSettings, useApp } from "../../store/app";
import { GhostButton, input, Modal, PrimaryButton } from "../common/forms";
import { cn } from "../ui";

export const useSettingsDialog = create<{ open: boolean; set: (open: boolean) => void }>((set) => ({
  open: false,
  set: (open) => set({ open }),
}));

const ANGLE_OPTIONS: Array<{ value: AngleBackend; label: string }> = [
  { value: "default", label: "Automático (predeterminado)" },
  { value: "d3d11", label: "Direct3D 11" },
  { value: "d3d11on12", label: "D3D11on12" },
  { value: "gl", label: "OpenGL" },
  { value: "d3d9", label: "Direct3D 9" },
  { value: "vulkan", label: "Vulkan" },
];

const MODES: Array<{ id: RenderingMode; label: string; desc: string }> = [
  { id: "auto", label: "Auto", desc: "Elige la mejor opción del sistema" },
  { id: "hardware", label: "Hardware", desc: "Fuerza aceleración por GPU" },
  { id: "software", label: "Software", desc: "Renderizado puro por CPU" },
];

const DEFAULT_RENDERING: RenderingSettings = {
  mode: "auto",
  angle: "default",
  liteEffects: false,
  reduceMotion: false,
};

export function SettingsDialog() {
  const open = useSettingsDialog((s) => s.open);
  const setOpen = useSettingsDialog((s) => s.set);
  const theme = useApp((s) => s.theme);
  const setTheme = useApp((s) => s.setTheme);
  const toast = useApp((s) => s.toast);

  const [rendering, setRenderingState] = useState<RenderingSettings>(DEFAULT_RENDERING);
  const [initialLaunchSettings, setInitialLaunchSettings] = useState<RenderingSettings | null>(null);
  const [gpu, setGpu] = useState<GpuStatus | null>(null);
  const [loadingGpu, setLoadingGpu] = useState(false);
  const [relaunching, setRelaunching] = useState(false);

  useEffect(() => {
    if (!open) return;
    api.getRendering()
      .then((cfg) => {
        setRenderingState(cfg);
        setInitialLaunchSettings((prev) => prev ?? cfg);
      })
      .catch((e) => toast("error", (e as Error).message));

    setLoadingGpu(true);
    api.gpuStatus()
      .then((res) => setGpu(res))
      .catch(() => setGpu({ features: {}, active: [], angle: "" }))
      .finally(() => setLoadingGpu(false));
  }, [open, toast]);

  if (!open) return null;

  const updateSetting = async (patch: Partial<RenderingSettings>) => {
    const updated = { ...rendering, ...patch };
    setRenderingState(updated);
    applyRenderingSettings(updated);
    try {
      await api.setRendering(patch);
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };

  const restartNeeded = initialLaunchSettings != null &&
    (rendering.mode !== initialLaunchSettings.mode || rendering.angle !== initialLaunchSettings.angle);

  const handleRelaunch = async () => {
    setRelaunching(true);
    try {
      await api.relaunchApp();
    } catch (e) {
      setRelaunching(false);
      toast("error", (e as Error).message);
    }
  };

  const isHardwareActive =
    gpu?.features?.gpu_compositing === "enabled" ||
    gpu?.features?.["gpu compositing"] === "enabled";

  const gpuDeviceName =
    gpu?.active && gpu.active.length > 0
      ? gpu.active.join(", ")
      : "Ninguna — renderizado por software";

  return (
    <Modal title="Configuración" onClose={() => setOpen(false)} width={600}
      footer={<>
        {restartNeeded && (
          <PrimaryButton onClick={handleRelaunch} disabled={relaunching} className="bg-accent">
            <RefreshCw size={13} className={cn(relaunching && "animate-spin")} />
            {relaunching ? "Reiniciando…" : "Reiniciar para aplicar"}
          </PrimaryButton>
        )}
        <span className="flex-1" />
        <GhostButton onClick={() => setOpen(false)}>Cerrar</GhostButton>
      </>}>
      <div className="space-y-6">
        {/* Rendimiento */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 border-b border-line pb-2">
            <Zap size={16} className="text-accent-text" />
            <h2 className="text-[13.5px] font-semibold text-text">Rendimiento y gráficos</h2>
          </div>

          {/* Modo de renderizado */}
          <div className="space-y-1.5">
            <label className="block font-mono text-[10.5px] uppercase tracking-wider text-faint">
              Modo de renderizado
            </label>
            <div className="grid grid-cols-3 gap-1 rounded-xl border border-line bg-surface p-1">
              {MODES.map((m) => {
                const active = rendering.mode === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => void updateSetting({ mode: m.id })}
                    className={cn(
                      "flex flex-col items-center justify-center rounded-lg py-2 px-2 text-center transition-colors",
                      active
                        ? "bg-accent text-white shadow-sm"
                        : "text-dim hover:bg-hover hover:text-text",
                    )}
                  >
                    <span className="text-[12.5px] font-medium">{m.label}</span>
                    <span className={cn("text-[10px] line-clamp-1", active ? "text-white/80" : "text-faint")}>
                      {m.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Backend ANGLE */}
          <div className="space-y-1.5">
            <label className="block font-mono text-[10.5px] uppercase tracking-wider text-faint">
              Backend de gráficos (ANGLE)
            </label>
            <select
              className={cn(input, rendering.mode === "software" && "cursor-not-allowed opacity-50")}
              disabled={rendering.mode === "software"}
              value={rendering.angle}
              onChange={(e) => void updateSetting({ angle: e.target.value as AngleBackend })}
            >
              {ANGLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="text-[11.5px] text-faint">
              {rendering.mode === "software"
                ? "Deshabilitado cuando el modo de renderizado es Software."
                : "Controla qué API de gráficos usa Chromium para dibujar la interfaz."}
            </p>
          </div>

          {/* Toggles: Efectos visuales y animaciones */}
          <div className="space-y-2.5 pt-1">
            <label className="flex items-start gap-3 rounded-xl border border-line bg-surface p-3 cursor-pointer hover:border-line-strong transition-colors">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-line accent-[var(--nv-accent)]"
                checked={rendering.liteEffects}
                onChange={(e) => void updateSetting({ liteEffects: e.target.checked })}
              />
              <div className="flex-1 text-left">
                <span className="block text-[13px] font-medium text-text">Reducir efectos visuales</span>
                <span className="block text-[11.5px] text-dim">
                  Elimina transparencias, desenfoques complejos (blur) y sombras pesadas. Ideal para fluidez en CPU sin tarjeta gráfica.
                </span>
              </div>
            </label>

            <label className="flex items-start gap-3 rounded-xl border border-line bg-surface p-3 cursor-pointer hover:border-line-strong transition-colors">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-line accent-[var(--nv-accent)]"
                checked={rendering.reduceMotion}
                onChange={(e) => void updateSetting({ reduceMotion: e.target.checked })}
              />
              <div className="flex-1 text-left">
                <span className="block text-[13px] font-medium text-text">Reducir animaciones</span>
                <span className="block text-[11.5px] text-dim">
                  Desactiva transiciones y animaciones no esenciales para una respuesta inmediata.
                </span>
              </div>
            </label>
          </div>

          {/* Aviso de reinicio */}
          {restartNeeded && (
            <div className="flex items-center gap-2.5 rounded-xl border border-warn/40 bg-warn/10 p-3 text-[12px] text-text">
              <AlertCircle size={16} className="flex-none text-warn" />
              <span className="flex-1">
                Los cambios de modo de renderizado o backend ANGLE requieren reiniciar la aplicación para aplicarse.
              </span>
              <PrimaryButton onClick={handleRelaunch} disabled={relaunching} className="bg-warn text-black hover:bg-warn/90">
                {relaunching ? "Reiniciando…" : "Reiniciar ahora"}
              </PrimaryButton>
            </div>
          )}

          {/* Estado de GPU */}
          <div className="rounded-xl border border-line bg-surface p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] uppercase tracking-wider text-dim">Estado de GPU</span>
              {loadingGpu ? (
                <span className="text-[11px] text-faint">Consultando…</span>
              ) : isHardwareActive ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-mint/15 px-2 py-0.5 text-[11px] font-medium text-mint">
                  <Check size={12} /> Aceleración por hardware activa
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-md bg-warn/15 px-2 py-0.5 text-[11px] font-medium text-warn">
                  <AlertCircle size={12} /> Renderizado por software (CPU)
                </span>
              )}
            </div>

            <div className="space-y-1 font-mono text-[11.5px]">
              <div className="flex gap-2 text-dim">
                <span className="text-faint">Dispositivo:</span>
                <span className="text-text truncate">{gpuDeviceName}</span>
              </div>
              {gpu?.angle && (
                <div className="flex gap-2 text-dim">
                  <span className="text-faint">Backend:</span>
                  <span className="text-text truncate">{gpu.angle}</span>
                </div>
              )}
            </div>

            {!loadingGpu && !isHardwareActive && (
              <p className="rounded-lg bg-card/60 p-2 text-[12px] leading-relaxed text-dim border border-line">
                💡 <span className="font-medium text-text">Aviso:</span> La app está usando la CPU. Activa{" "}
                <strong className="text-accent-text font-medium">«Reducir efectos visuales»</strong> para más fluidez.
              </p>
            )}
          </div>
        </section>

        {/* Apariencia */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 border-b border-line pb-2">
            <Sparkles size={16} className="text-accent-text" />
            <h2 className="text-[13.5px] font-semibold text-text">Apariencia</h2>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <span className="block text-[13px] font-medium text-text">Tema</span>
              <span className="block text-[11.5px] text-dim">Selecciona la paleta de colores de NoteVault.</span>
            </div>
            <div className="flex rounded-lg border border-line bg-surface p-0.5">
              <button
                type="button"
                onClick={() => setTheme("light")}
                className={cn(
                  "flex h-7 items-center gap-1.5 rounded-md px-3 text-[12px] font-medium transition-colors",
                  theme === "light" ? "bg-accent text-white" : "text-dim hover:text-text",
                )}
              >
                <Sun size={14} /> Claro
              </button>
              <button
                type="button"
                onClick={() => setTheme("dark")}
                className={cn(
                  "flex h-7 items-center gap-1.5 rounded-md px-3 text-[12px] font-medium transition-colors",
                  theme === "dark" ? "bg-accent text-white" : "text-dim hover:text-text",
                )}
              >
                <Moon size={14} /> Oscuro
              </button>
            </div>
          </div>
        </section>
      </div>
    </Modal>
  );
}
