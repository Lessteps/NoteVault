// Biblioteca: el catálogo workout-guide (302) dentro del módulo Ejercicio.
// Busca por texto, muestra detalle (frames, equipo, músculos guía → locales)
// y añade a la rutina del día con los músculos ya mapeados.

import { useMemo, useState } from "react";
import { api } from "../../lib/bridge";
import { muscleName } from "../../lib/muscles";
import { useExercise } from "../../store/exercise";
import { searchLibrary, type LibraryEntry } from "../../lib/exerciseLibrary";
import { GhostButton, input } from "../common/forms";
import { cn } from "../ui";
import { useFail } from "./parts";

function Detail({ entry }: { entry: LibraryEntry }) {
  return (
    <div className="space-y-2 rounded-xl border border-line bg-card p-3">
      <div className="text-[13px] font-semibold text-text">{entry.name}</div>
      {/* workout-guide no trae instrucciones paso a paso: esto es todo lo que
          el paquete ofrece (solo metadatos + 3 frames por ejercicio). */}
      <div className="flex gap-2">
        {entry.frames.map(
          (src, i) =>
            src && (
              <img
                key={i}
                src={src}
                alt={`${entry.name} frame ${i + 1}`}
                loading="lazy"
                className="h-20 w-20 rounded-lg border border-line object-contain"
                style={{ background: "#141414" }}
              />
            ),
        )}
      </div>
      <dl className="space-y-1 text-[12px] text-dim">
        <div className="flex gap-2">
          <dt className="w-24 flex-none text-faint">Equipo</dt>
          <dd>{entry.equipment}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-24 flex-none text-faint">Tipo</dt>
          <dd>{entry.exerciseType}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-24 flex-none text-faint">Principal</dt>
          <dd>{entry.guidePrimary}{entry.localPrimary.length ? ` → ${entry.localPrimary.map(muscleName).join(", ")}` : ""}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-24 flex-none text-faint">Secundarios</dt>
          <dd>{entry.guideSecondary.join(", ") || "—"}</dd>
        </div>
      </dl>
      <p className="text-[11px] text-faint">Ilustración: Bryl Lim / Everkinetic (CC BY-SA 4.0) · offline.</p>
    </div>
  );
}

export function Library() {
  const fail = useFail();
  const days = useExercise((s) => s.days);
  const refresh = useExercise((s) => s.refresh);
  const [q, setQ] = useState("bench press");
  const [day, setDay] = useState("lunes");
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<string>("bench-press");

  const rows = useMemo(() => searchLibrary(q).slice(0, 60), [q]);
  const current = rows.find((r) => r.slug === selected) ?? rows[0] ?? null;

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
        <span className="text-[12px] text-faint">302 ejercicios · workout-guide (CC BY-SA 4.0)</span>
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
      <div className="grid items-start gap-3" style={{ gridTemplateColumns: "minmax(0, 1fr) 340px" }}>
        <div className="grid grid-cols-1 gap-2">
          {rows.map((r) => (
            <div
              key={r.slug}
              data-selected={selected === r.slug}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-xl border border-line bg-card px-3 py-2",
                selected === r.slug && "border-accent",
              )}
              onClick={() => setSelected(r.slug)}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] text-text">{r.name}</div>
                <div className="truncate text-[11px] text-faint">{r.equipment} · {r.guidePrimary} · {r.exerciseType}</div>
              </div>
              <GhostButton
                onClick={() => void add(r.slug)}
              >
                Añadir
              </GhostButton>
            </div>
          ))}
        </div>
        {current && <Detail entry={current} />}
      </div>
      {!rows.length && <p className="py-8 text-center text-[13px] text-faint">Sin resultados.</p>}
    </div>
  );
}
