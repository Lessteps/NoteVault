// La biblioteca de 302 ejercicios.
//
// A la derecha, el detalle: tres frames, los datos y "Cómo hacerlo". Y si el
// ejercicio se acaba de añadir a la rutina, el mismo formulario de
// `ExerciseForm` para completar series, descanso y video sin cambiar de
// pantalla — que era el rodeo queJusto justificaba fusionar ambas vistas.

import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/bridge";
import { weekdayKeyOf } from "../../lib/exercise";
import { todayIso } from "../../lib/tasks";
import { useExercise } from "../../store/exercise";
import {
  filterLibrary,
  filterLibraryByLocalMuscle,
  libraryFingerprint,
  getInstructions,
  libraryEquipment,
  libraryMuscles,
  localMusclesInCatalog,
  type LibraryEntry,
} from "../../lib/exerciseLibrary";
import { GhostButton, input, PrimaryButton } from "../common/forms";
import { cn } from "../ui";
import type { Exercise } from "../../lib/types";
import type { LibraryUserEntry } from "../../lib/libraryTypes";
import { BodyPair } from "./BodyFigure";
import { Detail } from "./LibraryDetail";
import { ExerciseForm } from "./Routine";
import { useFail } from "./parts";

export function Library({ embedded = false }: { embedded?: boolean }) {
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
  // Las entradas que ha escrito la persona. Vacío hasta que se conecte la
  // biblioteca editable (Task 5); a partir de ahí la capa se mezcla sola.
  // Las entradas que ha escrito la persona. Se cargan del vault y se mezclan con
  // el catálogo, así que un ejercicio tuyo sale en la lista como cualquier otro.
  const [userEntries, setUserEntries] = useState<LibraryUserEntry[]>([]);
  useEffect(() => {
    let alive = true;
    void api.exLibraryList().then((e) => {
      // El puente devuelve lo que venga; si no es una lista, biblioteca vacía.
      const next = Array.isArray(e) ? e : [];
      if (alive && next.length) setUserEntries(next);
    }).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  // El ejercicio recién añadido: su formulario aparece en el detalle.
  const [added, setAdded] = useState<{ id: string; fields: Partial<Exercise> } | null>(null);
  const [editStatus, setEditStatus] = useState("");

  // La Biblioteca no pregunta el día: lo que se añade entra en la rutina del
  // día de hoy. Para moverlo de día, «Tu programa».
  const day = weekdayKeyOf(todayIso());
  const dayName = days.find((d) => d.key === day)?.name ?? day;

  // Al entrar se puede escribir sin clicar nada. Dentro de Ejercicios el foco
  // lo coge el buscador; suelto también.
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const rows = useMemo(
    () =>
      localMuscle
        ? filterLibraryByLocalMuscle(localMuscle, { query: q, equipment }, userEntries)
        : filterLibrary({ query: q, equipment, muscle }, userEntries),
    [q, equipment, muscle, localMuscle, userEntries],
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
    const fields: Partial<Exercise> = {
      day,
      name: found.name,
      how_to: steps.length
        ? steps.map((s, i) => `${i + 1}. ${s}`).join("\n")
        : `${found.equipment} · ${found.guidePrimary}`,
      series_reps: "",
      rest: "",
      muscles: { primary: found.localPrimary, secondary: found.localSecondary },
      // De qué entrada sale esta copia. Sin esto, «¿esto es de la Biblioteca?»
      // no tiene respuesta y no se puede avisar de copias desfasadas.
      source: found.slug,
      sourceFp: libraryFingerprint(found),
    };
    try {
      const created = await api.exSave("", fields);
      setAdded({ id: created.id ?? "", fields });
      setEditStatus("");
      setStatus(`«${found.name}» añadido al ${dayName} ✓`);
      void refresh();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const saveAdded = async (fields: Partial<Exercise>) => {
    if (!added) return;
    setAdded({ ...added, fields });
    try {
      await api.exSave(added.id, fields);
      setEditStatus("Guardado ✓");
      void refresh();
    } catch (e) {
      setEditStatus((e as Error).message);
    }
  };

  const body = (
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
          {localMusclesInCatalog(userEntries).map((id) => (
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
              onClick={() => {
                setSelected(r.slug);
                setAdded(null);
              }}
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
              <GhostButton
                data-library-add={r.slug}
                data-library-added={added?.fields.name === r.name ? "true" : undefined}
                onClick={() => void add(r.slug)}
              >
                {added?.fields.name === r.name ? "Añadido ✓" : "Añadir"}
              </GhostButton>
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
          added?.fields.name === current.name ? (
            // Recién añadido: a completar aquí mismo.
            <div className="flex flex-col gap-2 p-3">
              <div className="text-[13px] font-semibold text-text">{current.name}</div>
              <p className="text-[11.5px] text-dim">
                Añadido al {dayName.toLowerCase()}. Completa series y descanso:
              </p>
              <MiniForm
                fields={added.fields}
                status={editStatus}
                onChange={(fn) => setAdded({ ...added, fields: { ...added.fields, ...fn } })}
                onSave={() => void saveAdded(added.fields)}
              />
            </div>
          ) : (
            <Detail
              entry={current}
              routine={routine}
              dayName={dayName}
              busy={busy}
              onAdd={(slug) => void add(slug)}
              userEntries={userEntries}
            />
          )
        ) : (
          <div className="grid h-full place-items-center px-6 py-10 text-center text-[12.5px] text-faint">
            Elige un ejercicio de la lista para ver sus tres frames y cómo se hace.
          </div>
        )}
      </aside>
    </div>
  );

  if (embedded) return body;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <LibraryToolbar
        q={q}
        setQ={setQ}
        equipment={equipment}
        setEquipment={setEquipment}
        muscle={muscle}
        setMuscle={setMuscle}
        count={rows.length}
        dirty={Boolean(q || equipment || muscle || localMuscle)}
        onClear={clearAll}
        searchRef={searchRef}
        userEntries={userEntries}
      />
      {status && <p className="flex-none px-6 pt-2 text-[12px] text-dim">{status}</p>}
      {body}
    </div>
  );
}

function LibraryToolbar({
  q, setQ, equipment, setEquipment, muscle, setMuscle, count, dirty, onClear, searchRef, userEntries,
}: {
  q: string;
  setQ: (v: string) => void;
  equipment: string;
  setEquipment: (v: string) => void;
  muscle: string;
  setMuscle: (v: string) => void;
  count: number;
  dirty: boolean;
  onClear: () => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
  /** Para que un equipo o músculo que solo usen tus ejercicios salga en el desplegable. */
  userEntries: LibraryUserEntry[];
}) {
  return (
    <div
      data-library-toolbar
      className="flex flex-none flex-wrap items-center gap-2 border-b border-line px-6 py-3"
    >
      <h1 className="text-[15px] font-semibold text-text">Biblioteca</h1>
      <span className="font-mono text-[11.5px] text-faint">{count} de 302</span>
      <span className="flex-1" />
      <input
        ref={searchRef}
        className={cn(input, "w-56")}
        placeholder="Buscar ejercicios…"
        aria-label="Buscar ejercicios"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onInput={(e) => setQ((e.target as HTMLInputElement).value)}
        // Esc limpia solo el texto: los filtros de equipo y músculo se
        // conservan, porque suelen ser una decisión distinta.
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            setQ("");
          }
        }}
      />
      <select
        className={cn(input, "w-36")}
        value={equipment}
        aria-label="Filtrar por equipo"
        onChange={(e) => setEquipment(e.target.value)}
      >
        <option value="">Todo el equipo</option>
        {libraryEquipment(userEntries).map((x) => (
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
        {libraryMuscles(userEntries).map((x) => (
          <option key={x} value={x}>{x}</option>
        ))}
      </select>
      {dirty && <GhostButton onClick={onClear}>Limpiar</GhostButton>}
    </div>
  );
}

/** Lo justo para completar el ejercicio recién añadido: series y descanso. */
function MiniForm({
  fields,
  status,
  onChange,
  onSave,
}: {
  fields: Partial<Exercise>;
  status: string;
  onChange: (fn: Partial<Exercise>) => void;
  onSave: () => void;
}) {
  return (
    <div className="space-y-2">
      <label className="block">
        <span className="mb-1 block text-[11.5px] text-faint">Series × reps</span>
        <input
          aria-label="Series × reps"
          className={input}
          placeholder="4×8"
          value={fields.series_reps ?? ""}
          onChange={(e) => onChange({ series_reps: e.target.value })}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-[11.5px] text-faint">Descanso</span>
        <input
          aria-label="Descanso"
          className={input}
          placeholder="90 s"
          value={fields.rest ?? ""}
          onChange={(e) => onChange({ rest: e.target.value })}
        />
      </label>
      <PrimaryButton className="w-full justify-center" onClick={onSave}>
        Guardar cambios
      </PrimaryButton>
      {status && <p className="text-[12px] text-dim">{status}</p>}
    </div>
  );
}

export type { LibraryEntry };
export { ExerciseForm };