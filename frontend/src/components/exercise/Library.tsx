// Biblioteca: el catálogo workout-guide (302, offline) dentro del módulo
// Ejercicio. Busca por texto, filtra por músculo local y añade a la rutina
// del día con los músculos ya mapeados.

import { useMemo, useState } from "react";
import { api } from "../../lib/bridge";
import { useExercise } from "../../store/exercise";
import { searchLibrary } from "../../lib/exerciseLibrary";
import { GhostButton, input } from "../common/forms";
import { cn } from "../ui";
import { useFail } from "./parts";

export function Library() {
  const fail = useFail();
  const days = useExercise((s) => s.days);
  const refresh = useExercise((s) => s.refresh);
  const [q, setQ] = useState("bench press");
  const [day, setDay] = useState("lunes");
  const [status, setStatus] = useState("");

  const rows = useMemo(() => searchLibrary(q).slice(0, 60), [q]);

  const add = async (slug: string) => {
    const found = searchLibrary("").find((r) => r.slug === slug);
    if (!found) return;
    try {
      await api.exSave("", {
        day,
        name: found.name,
        how_to: `${found.equipment} · ${found.guidePrimary}`,
        series_reps: "",
        rest: "",
        muscles: { primary: found.localPrimary, secondary: found.localSecondary },
      });
      setStatus(`«${found.name}» añadido al ${day} ✓`);
      void refresh();
    } catch (e) {
      fail(e);
    }
  };

  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-6">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-[15px] font-semibold text-text">Biblioteca</h1>
        <span className="text-[12px] text-faint">302 ejercicios offline · workout-guide (CC BY-SA 4.0)</span>
        <span className="flex-1" />
        <select className={cn(input, "w-36")} value={day} onChange={(e) => setDay(e.target.value)} aria-label="Día destino">
          {days.map((d) => (
            <option key={d.key} value={d.key}>{d.name}</option>
          ))}
        </select>
        <input
          className={cn(input, "w-64")}
          placeholder="Buscar ejercicios…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onInput={(e) => setQ((e.target as HTMLInputElement).value)}
        />
      </div>
      {status && <p className="text-[12px] text-dim">{status}</p>}
      <div className="grid grid-cols-2 gap-2">
        {rows.map((r) => (
          <div key={r.slug} className="flex items-center gap-2 rounded-xl border border-line bg-card px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] text-text">{r.name}</div>
              <div className="truncate text-[11px] text-faint">{r.equipment} · {r.guidePrimary}</div>
            </div>
            <GhostButton onClick={() => void add(r.slug)}>Añadir</GhostButton>
          </div>
        ))}
      </div>
      {!rows.length && <p className="py-8 text-center text-[13px] text-faint">Sin resultados.</p>}
    </div>
  );
}
