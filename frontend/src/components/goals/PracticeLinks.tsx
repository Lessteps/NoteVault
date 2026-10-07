// «Práctica» de una submeta: enlaces al sistema Programming practice (kata diario, proyectos de práctica) y chips
// con el avance derivado de cada uno. Igual que «Temas de estudio»: con enlaces la submeta se cumple sola.

import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../lib/bridge";
import { formatPracticeLink, parsePracticeLink, practiceLinkLabel, PRACTICE_FOCUS_IDS, type PracticeLink } from "../../lib/practiceLinks";
import type { PracticeCatalog, PracticeLinkProgress } from "../../lib/types";
import { cn } from "../ui";

const chip = "rounded-full border px-2 py-0.5 text-[11.5px]";
const KATA_PRESETS: Array<{ label: string; link: PracticeLink }> = [
  { label: "5 días/semana", link: { kind: "kata" } },
  { label: "3 días/semana", link: { kind: "kata", week: 3 } },
  { label: "Todos los días", link: { kind: "kata", week: 7 } },
  { label: "Racha de 7", link: { kind: "kata", streak: 7 } },
  { label: "Racha de 30", link: { kind: "kata", streak: 30 } },
];

export function PracticeLinks({ value, onChange }: { value: string[]; onChange: (links: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState("");
  const [catalog, setCatalog] = useState<PracticeCatalog | null>(null);
  const [progress, setProgress] = useState<PracticeLinkProgress | null>(null);

  useEffect(() => {
    if (!open || catalog) return;
    let alive = true;
    api.goalsPracticeCatalog().then((c) => alive && setCatalog(c)).catch(() => alive && setCatalog({ ready: false, projects: [] }));
    return () => { alive = false; };
  }, [open, catalog]);

  const key = value.join("\n");
  useEffect(() => {
    let alive = true;
    if (!value.length) { setProgress(null); return; }
    api.goalsPracticeLinksProgress(value).then((p) => alive && setProgress(p)).catch(() => alive && setProgress(null));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const has = (l: PracticeLink) => value.includes(formatPracticeLink(l));
  const toggle = (l: PracticeLink) => {
    const s = formatPracticeLink(l);
    // Un solo kata diario por submeta: otro objetivo sustituye al anterior.
    const rest = value.filter((v) => v !== s && !(l.kind === "kata" && parsePracticeLink(v)?.kind === "kata"));
    onChange(value.includes(s) ? value.filter((v) => v !== s) : [...rest, s]);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {value.map((v) => {
          const p = progress?.links.find((l) => l.link === v);
          const parsed = parsePracticeLink(v);
          const label = p?.label ?? (parsed ? practiceLinkLabel(parsed) : v);
          const bad = Boolean(p?.broken || p?.noData || !parsed);
          return (
            <span key={v} data-testid="practice-chip" title={p?.detail ?? ""}
              className={cn(chip, "flex items-center gap-1", bad ? "border-[#e5484d] text-[#e5484d]" : p?.done ? "border-[var(--nv-mint)] text-text" : "border-[#7c5af0] bg-[#7c5af0]/20 text-text")}>
              🏋 {label}
              <span className="font-mono text-[10.5px] text-dim">{!p ? "" : p.broken ? "roto" : p.noData ? "sin datos" : `${p.pct}%`}</span>
              <button type="button" aria-label={`Quitar ${label}`} onClick={() => onChange(value.filter((x) => x !== v))}><X size={11} /></button>
            </span>
          );
        })}
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className={cn(chip, "border-line text-dim hover:bg-hover")}>
          {open ? "Cerrar" : "＋ Enlazar práctica"}
        </button>
        {!value.length && !open && <span className="text-[11.5px] text-faint">Sin enlaces a práctica.</span>}
      </div>
      {progress?.noData && <p className="text-[11.5px] text-[#e5484d]">Sin datos de práctica: esta vault no tiene el módulo Programming practice.</p>}
      {open && (
        <div className="space-y-2 rounded-lg border border-line bg-card p-2 text-[12px]">
          <div role="group" aria-label="Kata diario">
            <div className="mb-1 font-mono text-[10px] uppercase text-faint">Kata diario</div>
            <div className="flex flex-wrap gap-1.5">
              {KATA_PRESETS.map((p) => {
                const on = has(p.link);
                return (
                  <button key={p.label} type="button" aria-pressed={on} onClick={() => toggle(p.link)}
                    className={cn(chip, on ? "border-[#7c5af0] bg-[#7c5af0]/20 text-text" : "border-line text-dim hover:bg-hover")}>{p.label}</button>
                );
              })}
            </div>
          </div>
          <div role="group" aria-label="Proyecto de práctica">
            <div className="mb-1 font-mono text-[10px] uppercase text-faint">Proyecto de práctica</div>
            <div className="flex flex-wrap items-center gap-1.5">
              <label className="flex items-center gap-1 text-dim">
                Foco
                <select aria-label="Foco del proyecto" value={focus} onChange={(e) => setFocus(e.target.value)}
                  className="rounded-md border border-line bg-card px-1 py-0.5 text-text">
                  <option value="">Cualquiera</option>
                  {PRACTICE_FOCUS_IDS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </label>
              {(["weekly", "monthly"] as const).map((scope) => {
                const l: PracticeLink = { kind: "project", scope, ...(focus ? { focus } : {}) };
                const on = has(l);
                return (
                  <button key={scope} type="button" aria-pressed={on} onClick={() => toggle(l)}
                    className={cn(chip, on ? "border-[#7c5af0] bg-[#7c5af0]/20 text-text" : "border-line text-dim hover:bg-hover")}>
                    {scope === "weekly" ? "Semanal" : "Mensual"}
                  </button>
                );
              })}
            </div>
          </div>
          <div role="group" aria-label="Proyecto concreto">
            <div className="mb-1 font-mono text-[10px] uppercase text-faint">Proyecto concreto</div>
            {!catalog && <span className="text-faint">Cargando…</span>}
            {catalog && !catalog.ready && <span className="text-[#e5484d]">Sin datos de práctica: falta el módulo Programming practice.</span>}
            {catalog?.ready && !catalog.projects.length && <span className="text-faint">Aún no hay proyectos de práctica.</span>}
            <div className="flex flex-wrap gap-1.5">
              {catalog?.projects.map((p) => {
                const l: PracticeLink = { kind: "project", scope: "folder", folder: p.folder };
                const on = has(l);
                return (
                  <button key={p.folder} type="button" aria-pressed={on} onClick={() => toggle(l)}
                    className={cn(chip, on ? "border-[#7c5af0] bg-[#7c5af0]/20 text-text" : "border-line text-dim hover:bg-hover")}>{p.title}</button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Chips de solo lectura con el avance de las prácticas enlazadas de una submeta (listas, tarjetas, detalle). */
export function PracticeChips({ item }: { item: { practice_progress: PracticeLinkProgress | null } }) {
  const links = item.practice_progress?.links ?? [];
  if (!links.length) return null;
  return (
    <span className="flex flex-wrap gap-1" data-testid="practice-chips">
      {links.map((l) => {
        const bad = l.broken || l.noData;
        return (
          <span key={l.link} title={l.detail}
            className={cn("whitespace-nowrap rounded-full border px-1.5 py-px text-[10.5px]", bad ? "border-[#e5484d] text-[#e5484d]" : l.done ? "border-[var(--nv-mint)] text-text" : "border-[#7c5af0] text-text")}>
            🏋 {l.label} · {l.broken ? "roto" : l.noData ? "sin datos" : `${l.pct}%`}
          </span>
        );
      })}
    </span>
  );
}
