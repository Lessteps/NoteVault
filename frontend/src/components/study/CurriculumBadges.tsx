// Currículo de referencia — piezas pequeñas que se repiten en las páginas de espacio y de área (Notas y Mentor): el anillo de cobertura, la marca
// de «falta de desarrollo» y la tarjeta «Por crear» de un área del currículo que aún no existe en la vault.

import { AlertTriangle, ChevronRight, Plus } from "lucide-react";
import type { AreaCoverage, CoverageLevel } from "../../lib/curriculum";
import { coverageBadge } from "../../lib/curriculum";
import { cn } from "../ui";

export const LEVEL_COLOUR: Record<CoverageLevel, string> = { ok: "var(--nv-mint)", bajo: "var(--nv-warn)", critico: "var(--nv-danger)" };
export const LEVEL_LABEL: Record<CoverageLevel, string> = { ok: "Bien cubierta", bajo: "Desarrollo parcial", critico: "Desarrollo insuficiente" };

export function CoverageRing({ pct, level, size = 56 }: { pct: number; level: CoverageLevel; size?: number }) {
  const t = Math.max(4, Math.round(size / 11));
  const r = (size - t) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${pct} % del currículo cubierto`} className="flex-none" data-testid="coverage-ring">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--nv-elevated)" strokeWidth={t} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={LEVEL_COLOUR[level]} strokeWidth={t} strokeLinecap="round" strokeDasharray={`${(pct / 100) * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fontSize={size > 48 ? 13 : 10} fontWeight={600} fill="var(--nv-text)">{pct}%</text>
    </svg>
  );
}

/** Marca de «falta de desarrollo»: texto ámbar/rojo («Desarrollo insuficiente · 12 % · faltan 98») y la acción «Ver temas por crear». No pinta nada si el área está bien. */
export function CoverageChip({ coverage, onOpen, showTitle = false, className }: { coverage: AreaCoverage; onOpen: (areaId: string) => void; showTitle?: boolean; className?: string }) {
  const text = coverageBadge(coverage);
  if (!text) return null;
  const colour = LEVEL_COLOUR[coverage.level];
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-x-2 gap-y-1", className)} data-testid="coverage-chip" data-level={coverage.level} data-area={coverage.areaId}>
      <span
        className="inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-[11.5px] font-medium break-words"
        style={{ color: `color-mix(in srgb, ${colour} 75%, var(--nv-text))`, background: `color-mix(in srgb, ${colour} 16%, transparent)` }}
      >
        <AlertTriangle size={11} aria-hidden className="flex-none" />
        {showTitle ? `${coverage.title}: ` : ""}
        {text}
      </span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpen(coverage.areaId);
        }}
        aria-label={`Ver temas por crear de ${coverage.title}`}
        data-testid="coverage-open"
        className="min-h-6 rounded text-[12px] font-medium text-accent-text hover:underline"
      >
        Ver temas por crear
      </button>
    </span>
  );
}

/** Tarjeta «Por crear»: un área del currículo (11 HTML, 12 CSS…) que todavía no existe en la vault. Borde discontinuo; abre la vista de temas por crear. */
export function PendingAreaCard({ coverage, onOpen }: { coverage: AreaCoverage; onOpen: (areaId: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(coverage.areaId)}
      data-testid={`pending-area-${coverage.areaId}`}
      aria-label={`${coverage.areaFolder}: área por crear, ${coverage.pct} % cubierto, faltan ${coverage.missing} temas. Abrir temas por crear`}
      className="flex w-full items-center gap-3 rounded-xl border border-dashed border-line-strong bg-card/60 p-4 text-left hover:bg-hover"
    >
      <CoverageRing pct={coverage.pct} level={coverage.level} size={52} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-[14px] font-semibold text-text">{coverage.areaFolder}</span>
          <span className="rounded-md border border-dashed border-line-strong px-1.5 py-0.5 text-[10.5px] font-medium text-dim">Por crear</span>
        </span>
        <span className="block text-[12px] text-dim">{coverage.total} temas de referencia · {coverage.pct} % cubierto</span>
        <span className="mt-0.5 inline-flex items-center gap-1 text-[12px] font-medium text-accent-text">
          <Plus size={12} aria-hidden /> Ver temas por crear
        </span>
      </span>
      <ChevronRight size={16} className="flex-none text-faint" aria-hidden />
    </button>
  );
}
