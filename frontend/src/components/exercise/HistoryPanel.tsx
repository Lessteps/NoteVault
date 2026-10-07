// La ficha de un ejercicio: sus sesiones, su PR y su curva de volumen.
//
// Se abre desde las filas de Tu programa. Los datos los da `ex_history` y los
// agrega `summarizeHistory`; aquí solo se cargan y se pintan.

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { api } from "../../lib/bridge";
import { summarizeHistory, type HistoryInput } from "../../lib/exerciseHistory";
import { LineChart } from "../common/charts";
import { GhostButton } from "../common/forms";

export function HistoryPanel({ exerciseId, name, onClose }: {
  exerciseId: string;
  name: string;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<HistoryInput[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    void api.exHistory(exerciseId)
      .then((r) => {
        if (alive && Array.isArray(r)) setRows(r);
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, [exerciseId]);

  const { sessions, pr } = summarizeHistory(rows);
  const shortLabel = (iso: string) => {
    const [, m, d] = iso.split("-");
    return `${Number(m)}/${Number(d)}`;
  };

  return (
    <div data-history-panel className="flex min-h-0 w-[360px] flex-none flex-col gap-2 overflow-y-auto rounded-xl border border-line bg-card p-3">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1 truncate text-[13px] font-semibold text-text">
          Historial · {name}
        </div>
        <button
          type="button"
          aria-label="Cerrar historial"
          onClick={onClose}
          className="grid h-6 w-6 place-items-center rounded-full border border-line bg-panel text-faint hover:text-text"
        >
          <X size={12} />
        </button>
      </div>
      {!loaded ? (
        <p className="text-[12px] text-faint">Cargando…</p>
      ) : !sessions.length ? (
        <p className="text-[12px] text-faint">Todavía sin sesiones hechas de este ejercicio.</p>
      ) : (
        <>
          {pr && (
            <p data-history-pr className="text-[12.5px] text-text">
              PR estimado: <b>{pr.weight} kg × {pr.reps}</b> ({Math.round(pr.e1rm ?? 0)} kg 1RM) · {pr.date}
            </p>
          )}
          <div data-history-chart>
            <LineChart
              series={[{ name: "volumen", values: sessions.map((s) => s.volume), colour: "#f97316" }]}
              labels={sessions.map((s) => shortLabel(s.date))}
            />
          </div>
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-faint">
                <th className="py-1 font-normal">Fecha</th>
                <th className="font-normal">kg×reps</th>
                <th className="font-normal">Volumen</th>
                <th className="font-normal">1RM</th>
              </tr>
            </thead>
            <tbody>
              {[...sessions].reverse().map((s) => (
                <tr key={s.date} data-history-row className="border-t border-line text-dim">
                  <td className="py-1 font-mono">{s.date}</td>
                  <td>{s.weight > 0 ? `${s.weight}×${s.reps}` : `${s.reps} reps`}</td>
                  <td className="font-mono">{s.volume}</td>
                  <td className="font-mono">{s.e1rm === null ? "—" : Math.round(s.e1rm)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <GhostButton onClick={onClose} className="self-start">Cerrar</GhostButton>
    </div>
  );
}
