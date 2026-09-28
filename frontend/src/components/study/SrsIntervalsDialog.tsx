// "Configurar intervalos": the spacing ladder the SRS actually uses.
//
// There is no interval setting to edit — the ladder is computed by the algorithm
// (1 → 6 → interval × facilidad) — so this dialog shows, per skill, the real
// state the ledger already carries: interval, due date and best score.

import { Clock, X } from "lucide-react";
import { useMemo } from "react";
import type { StudySnapshot } from "../../lib/types";
import { cn } from "../ui";

export function SrsIntervalsDialog({ snap, onClose }: { snap: StudySnapshot; onClose: () => void }) {
  const rows = useMemo(() => {
    const out: Array<{ skill: string; label: string; interval: number | null; due: string; due_: boolean; best: number | null }> = [];
    for (const ledger of snap.ledgers ?? []) {
      for (const skill of ledger.skills ?? []) {
        out.push({
          skill: `${ledger.title} · ${skill.code}`,
          label: skill.label || skill.title,
          interval: skill.interval_days ?? null,
          due: skill.due || "",
          due_: Boolean(skill.is_due),
          best: skill.best ?? null,
        });
      }
    }
    return out;
  }, [snap]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="srs-intervals-title">
      <div className="flex max-h-[80vh] w-full max-w-[560px] flex-col overflow-hidden rounded-2xl border border-line-strong bg-card shadow-2xl">
        <header className="flex items-center gap-2 border-b border-line px-5 py-3">
          <Clock size={15} className="text-accent-text" />
          <h2 id="srs-intervals-title" className="flex-1 text-[14px] font-bold text-text">
            Intervalos de repaso (SRS)
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="grid h-7 w-7 place-items-center rounded-md text-faint hover:bg-hover hover:text-text"
          >
            <X size={14} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <p className="text-[11.5px] text-dim">
            El algoritmo espacia cada repaso: primer intervalo de <b className="text-text">1 día</b>, después{" "}
            <b className="text-text">6 días</b> y a partir de ahí el intervalo se multiplica por la facilidad de la
            tarjeta. No hay intervalos que fijar a mano; esto es lo que toca ahora.
          </p>

          {rows.length === 0 ? (
            <p className="mt-4 rounded-xl border border-line bg-panel px-3 py-3 text-[11.5px] text-faint">
              Este tema todavía no tiene competencias con repasos programados.
            </p>
          ) : (
            <table className="mt-4 w-full border-collapse text-left text-[11.5px]">
              <thead>
                <tr className="border-b border-line font-mono text-[9.5px] uppercase tracking-wider text-faint">
                  <th className="py-2 pr-2 font-semibold">Competencia</th>
                  <th className="px-2 py-2 text-center font-semibold">Intervalo</th>
                  <th className="px-2 py-2 text-center font-semibold">Próximo</th>
                  <th className="py-2 pl-2 text-right font-semibold">Mejor</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.skill} className="border-b border-line/60 last:border-none">
                    <td className="py-2 pr-2 text-text">{row.label}</td>
                    <td className="px-2 py-2 text-center font-mono text-dim">
                      {row.interval === null ? "—" : `${row.interval} d`}
                    </td>
                    <td className={cn("px-2 py-2 text-center font-mono", row.due_ ? "text-warn" : "text-faint")}>
                      {row.due_ ? "pendiente" : row.due || "al día"}
                    </td>
                    <td className="py-2 pl-2 text-right font-mono text-dim">{row.best ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
