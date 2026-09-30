// Biblioteca: el catálogo workout-guide (302) dentro del módulo Ejercicio.
//
// Sirve para las dos cosas que se hacen aquí: consultar cómo se hace un
// ejercicio y poblar la rutina del día de hoy.
//
// La pantalla son tres columnas con scroll propio: el cuerpo (filtro por
// músculo), la lista y el detalle. La barra de arriba no se desplaza, así que
// los filtros siguen a mano con 302 filas debajo.

import { useMemo, useState } from "react";
import { api } from "../../lib/bridge";
import { weekdayKeyOf } from "../../lib/exercise";
import { todayIso } from "../../lib/tasks";
import { useExercise } from "../../store/exercise";
import {
  filterLibrary,
  filterLibraryByLocalMuscle,
  getInstructions,
  LIBRARY_EQUIPMENT,
  LIBRARY_MUSCLES,
  localMusclesInCatalog,
  type LibraryEntry,
} from "../../lib/exerciseLibrary";
import { GhostButton, input } from "../common/forms";
import { cn } from "../ui";
import { BodyPair } from "./BodyFigure";
import { Detail } from "./LibraryDetail";
import { useFail } from "./parts";

export function Library() {
  const fail = useFail();
  const days = useExercise((s) => s.days);
  const routine = useExercise((s) => s.list);
  const refresh = useExercise((s) => s.refresh);

  const [q, setQ] = useState("");
  const [equipment, setEquipment] = useState("");
  const [muscle, setMuscle] = useState("");
  const [localMuscle, setLocalMuscle] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  // La Biblioteca no pregunta el día: lo que se añade entra en la rutina del
  // día de hoy. Para moverlo de día, Gestionar ejercicios.
  const day = weekdayKeyOf(todayIso());
  const dayName = days.find((d) => d.key === day)?.name ?? day;

  const rows = useMemo(
    () =>
      localMuscle
        ? filterLibraryByLocalMuscle(localMuscle, { query: q, equipment })
        : filterLibrary({ query: q, equipment, muscle }),
    [q, equipment, muscle, localMuscle],
  );
  // Nada seleccionado al entrar: el panel muestra un aviso, no el primer
  // ejercicio de la lista por sorpresa.
  const current = rows.find((r) => r.slug === selected) ?? null;

  const toggleMuscle = (id: string) => setLocalMuscle((m) => (m === id ? "" : id));

  const clearAll = () => {
    setQ("");
    setEquipment("");
    setMuscle("");
    setLocalMuscle("");
  };

  const add = async (slug: string) => {
    const found = rows.find((r) => r.slug === slug);
    if (!found || busy) return;
    setBusy(true);
    setSelected(slug);
    const steps = getInstructions(slug)?.steps_es ?? [];
    try {
      await api.exSave("", {
        day,
        name: found.name,
        how_to: steps.length
          ? steps.map((s, i) => `${i + 1}. ${s}`).join("\n")
          : `${found.equipment} · ${found.guidePrimary}`,
        series_reps: "",
        rest: "",
        muscles: { primary: found.localPrimary, secondary: found.localSecondary },
      });
      setStatus(`«${found.name}» añadido al ${dayName} ✓`);
      void refresh();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Barra fija: con 302 filas, los filtros no pueden irse con el scroll. */}
      <div
        data-library-toolbar
        className="flex flex-none flex-wrap items-center gap-2 border-b border-line px-6 py-3"
      >
        <h1 className="text-[15px] font-semibold text-text">Biblioteca</h1>
        <span className="font-mono text-[11.5px] text-faint">{rows.length} de 302</span>
        <span className="flex-1" />
        <input
          className={cn(input, "w-56")}
          placeholder="Buscar ejercicios…"
          aria-label="Buscar ejercicios"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onInput={(e) => setQ((e.target as HTMLInputElement).value)}
        />
        <select
          className={cn(input, "w-36")}
          value={equipment}
          aria-label="Filtrar por equipo"
          onChange={(e) => setEquipment(e.target.value)}
        >
          <option value="">Todo el equipo</option>
          {LIBRARY_EQUIPMENT.map((x) => (
            <option key={x} value={x}>{x}</option>
          ))}
        </select>
        <select
          className={cn(input, "w-36")}
          value={muscle}
          aria-label="Filtrar por músculo"
          onChange={(e) => setMuscle(e.target.value)}
        >
          <option value="">Todos los músculos</option>
          {LIBRARY_MUSCLES.map((x) => (
            <option key={x} value={x}>{x}</option>
          ))}
        </select>
        {(q || equipment || muscle || localMuscle) && (
          <GhostButton onClick={clearAll}>Limpiar</GhostButton>
        )}
      </div>

      {status && (
        <p className="flex-none px-6 pt-2 text-[12px] text-dim">{status}</p>
      )}

      <div className="flex min-h-0 flex-1 gap-3 overflow-hidden p-6 pt-3">
        {/* Filtro por músculo: el mismo cuerpo que usa el mapa del módulo. */}
        <section
          data-library-body
          className="w-[124px] flex-none rounded-xl border border-line bg-card p-2"
        >
          <div className="mb-1 text-center text-[10px] uppercase tracking-[0.14em] text-faint">
            Músculo
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <BodyPair
              width={40}
              gap={6}
              caption={false}
              interactive
              active={localMuscle || null}
              onMuscle={(id) => toggleMuscle(id)}
            />
          </div>
          <div className="mt-2 flex flex-wrap justify-center gap-1">
            {localMusclesInCatalog().map((id) => (
              <button
                key={id}
                type="button"
                data-library-muscle={id}
                onClick={() => toggleMuscle(id)}
                className={cn(
                  "rounded-full border px-1.5 py-0.5 text-[9.5px] transition-colors",
                  localMuscle === id
                    ? "border-accent text-text"
                    : "border-line text-faint hover:text-dim",
                )}
              >
                {id}
              </button>
            ))}
          </div>
        </section>

        {/* Lista: su propio scroll. */}
        <div data-library-scroll className="min-w-0 flex-1 overflow-y-auto pr-1">
          <div className="grid grid-cols-1 gap-2">
            {rows.map((r) => (
              <div
                key={r.slug}
                data-slug={r.slug}
                data-selected={selected === r.slug}
                className={cn(
                  "flex cursor-pointer items-center gap-2.5 rounded-xl border border-line bg-card px-2.5 py-1.5",
                  selected === r.slug && "border-accent",
                )}
                onClick={() => setSelected(r.slug)}
              >
                {r.frame1 && (
                  <img
                    src={r.frame1}
                    alt=""
                    loading="lazy"
                    className="h-9 w-9 flex-none rounded-md border border-line object-contain"
                    style={{ background: "#141414" }}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] text-text">{r.name}</div>
                  <div className="truncate text-[11px] text-faint">
                    {r.equipment} · {r.guidePrimary}
                  </div>
                </div>
                <GhostButton onClick={() => void add(r.slug)}>Añadir</GhostButton>
              </div>
            ))}
          </div>
          {!rows.length && (
            <p className="py-10 text-center text-[13px] text-faint">
              Nada coincide con los filtros.
            </p>
          )}
        </div>

        {/* Detalle: fijo, para poder leerlo con la lista al lado. */}
        <aside
          data-library-scroll
          data-library-detail
          className="w-[340px] flex-none overflow-y-auto rounded-xl border border-line bg-card"
        >
          {current ? (
            <Detail
              entry={current}
              routine={routine}
              dayName={dayName}
              busy={busy}
              onAdd={(slug) => void add(slug)}
            />
          ) : (
            <div className="grid h-full place-items-center px-6 py-10 text-center text-[12.5px] text-faint">
              Elige un ejercicio de la lista para ver sus tres frames y cómo se hace.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

export type { LibraryEntry };