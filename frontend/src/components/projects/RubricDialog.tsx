// Rúbrica: score an issue against weighted criteria (as in the classic app,
// the result is shown, not stored).

import { useState } from "react";
import { Modal, PrimaryButton, GhostButton } from "../common/forms";

const CRITERIA: Array<[string, string, number]> = [
  ["Corrección", "El resultado es correcto y cumple los requisitos.", 3],
  ["Diseño", "La solución está bien estructurada y es legible.", 2],
  ["Pruebas", "Se probaron los casos principales y los límites.", 2],
  ["Documentación", "El código o entregable está documentado con claridad.", 1],
  ["Eficiencia", "Se consideraron alternativas y se eligió la más óptima.", 2],
];

export interface RubricResult { total: number; max: number; pct: number; scores: Record<string, number> }

export function RubricDialog({ title, initial, onClose, onDone }: {
  title: string; initial: Record<string, number> | null; onClose: () => void; onDone: (r: RubricResult) => void;
}) {
  const [scores, setScores] = useState<Record<string, number>>(initial ?? {});
  const max = CRITERIA.reduce((a, [, , m]) => a + m, 0);
  const total = CRITERIA.reduce((a, [n]) => a + (scores[n] ?? 0), 0);
  const pct = Math.round((total / max) * 100);
  const colour = pct >= 80 ? "var(--nv-mint)" : pct >= 50 ? "var(--nv-warn)" : "var(--nv-danger)";
  return (
    <Modal title={`Rúbrica — ${title}`} onClose={onClose} width={560}
      footer={<><span className="font-mono text-[13px]" style={{ color: colour }}>{total}/{max} · {pct}%</span><span className="flex-1" />
        <GhostButton onClick={onClose}>Cancelar</GhostButton>
        <PrimaryButton onClick={() => onDone({ total, max, pct, scores })}>Aplicar</PrimaryButton></>}>
      {CRITERIA.map(([name, hint, m]) => (
        <div key={name} className="flex items-center gap-3 rounded-lg border border-line p-3">
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium text-text">{name}</div>
            <div className="text-[11.5px] text-faint">{hint}</div>
          </div>
          <div className="flex">
            {Array.from({ length: m }, (_, i) => (
              <button key={i} type="button" aria-label={`${name} ${i + 1}`}
                onClick={() => setScores({ ...scores, [name]: scores[name] === i + 1 ? i : i + 1 })}
                className="px-0.5 text-[18px]" style={{ color: (scores[name] ?? 0) > i ? "var(--nv-accent)" : "var(--nv-faint)" }}>
                {(scores[name] ?? 0) > i ? "★" : "☆"}
              </button>
            ))}
          </div>
        </div>
      ))}
    </Modal>
  );
}
