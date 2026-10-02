// El formulario de un ejercicio: día, nombre, video, series, descanso, cómo
// hacerlo y músculos.
//
// Vive en su propio fichero, y no dentro de `Routine.tsx` como estaba, por dos
// razones. La primera es que `Library.tsx` lo importa para completar series,
// descanso y video justo después de añadir un ejercicio, así que ya era un
// componente con dos dueños y una vida propia. La segunda es que son casi todo
// JSX: unos 150 de las 168 líneas de este fichero, y esconderlos en medio del
// programa hacía que cualquier cambio en el formulario pareciera un cambio en el
// programa.

import { useMemo } from "react";
import type { Exercise } from "../../lib/types";
import type { LibraryUserEntry } from "../../lib/libraryTypes";
import { fieldsFromLibrary, libraryEntry } from "../../lib/exerciseLibrary";
import { useExercise } from "../../store/exercise";
import { Field, GhostButton, input, PrimaryButton } from "../common/forms";
import { cn } from "../ui";
import { LibraryPicker } from "./LibraryPicker";
import { MusclePicker } from "./MusclePicker";

export function ExerciseForm({
  editing,
  f,
  setF,
  status,
  onSave,
  onCancel,
  onPickVideo,
  onSaveToLibrary,
  libraryExists = false,
  libStatus = "",
  userEntriesProp,
  title,
  saveLabel = "Guardar ejercicio",
}: {
  editing: string;
  f: Partial<Exercise>;
  /** Se declara como updater de verdad y no como `(fn) => void`: el segundo
   *  mentía sobre lo que acepta —React también puede pasar una función— y esa
   *  diferencia se nota en cuanto alguien escribe `setF((x) => ...)`. */
  setF: React.Dispatch<React.SetStateAction<Partial<Exercise>>>;
  status: string;
  onSave: () => void;
  onCancel: () => void;
  onPickVideo?: () => void;
  /** Guarda en la biblioteca propia. Si no se pasa, el botón no aparece. */
  onSaveToLibrary?: () => Promise<void>;
  /** El nombre del formulario ya existe en la biblioteca: el botón avisa. */
  libraryExists?: boolean;
  libStatus?: string;
  title?: string;
  saveLabel?: string;
  /** Las entradas propias, bajadas desde `Routine`: el aviso de copias
   *  desfasadas y el buscador necesitan las mismas, y dos cargas distintas se
   *  desincronizan. */
  userEntriesProp?: LibraryUserEntry[];
}) {
  const days = useExercise((s) => s.days);
  const routine = useExercise((s) => s.list);
  /** Las entradas propias, cargadas por `Routine` y bajadas hasta aquí: el
   * aviso de copias desfasadas y el buscador necesitan las mismas, y dos
   * cargas distintas se desincronizan. */
  const userEntries = userEntriesProp ?? [];
  // Los slugs ya en el programa. Vacío para lo escrito a mano: eso no viene
  // de la biblioteca y no debe marcarse como duplicado de nada.
  const usedSlugs = useMemo(
    () => new Set(routine.filter((e) => e.source).map((e) => e.source!)),
    [routine],
  );

  /** Rellena el formulario desde la biblioteca: nombre, músculos e instrucción. */
  const pickFromLibrary = (slug: string) => {
    // Sin `userEntries` un ejercicio **tuyo** no se encuentra y el clic no
    // hace nada: el buscador sí lo lista, pero la búsqueda de detrás no lo conocía.
    const found = libraryEntry(slug, userEntries);
    if (!found) return;
    // Los campos que hereda de la biblioteca los monta `fieldsFromLibrary`, que
    // es el mismo que usa `Library` al añadir: estaban escritos dos veces.
    setF({ ...f, ...fieldsFromLibrary(found, userEntries) });
  };

  return (
    <aside className="w-[360px] flex-none space-y-3 overflow-y-auto rounded-xl border border-line bg-panel p-4">
      <div className="text-[14px] font-semibold text-text">
        {title ?? (editing ? "✎ Editar ejercicio" : "➕ Añadir ejercicio")}
      </div>
      {!editing && (
        <>
          <div className="text-[11px] uppercase tracking-[0.12em] text-faint">
            Desde la biblioteca
          </div>
          <LibraryPicker onPick={pickFromLibrary} usedSlugs={usedSlugs} userEntries={userEntries} />
          <div className="flex items-center gap-2 py-0.5 text-[11px] uppercase tracking-[0.12em] text-faint">
            <span className="h-px flex-1 bg-line" />
            o a mano
            <span className="h-px flex-1 bg-line" />
          </div>
        </>
      )}
      <Field label="Día">
        <select
          aria-label="Día"
          className={input}
          value={f.day}
          onChange={(e) => setF({ ...f, day: e.target.value })}
        >
          {days.map((d) => (
            <option key={d.key} value={d.key}>{d.name}</option>
          ))}
        </select>
      </Field>
      <Field label="Nombre">
        <input
          aria-label="Nombre"
          className={input}
          value={f.name ?? ""}
          onChange={(e) => setF({ ...f, name: e.target.value })}
        />
      </Field>
      <Field label="Video (ruta del archivo)">
        <input
          className={input}
          value={f.video_path ?? ""}
          placeholder="C:\Videos\press-banca.mp4"
          onChange={(e) => setF({ ...f, video_path: e.target.value })}
        />
      </Field>
      {editing && onPickVideo && (
        <GhostButton onClick={() => void onPickVideo()}>📂 Elegir video y copiarlo al vault</GhostButton>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Field label="Series × reps">
          <input
            aria-label="Series × reps"
            className={input}
            value={f.series_reps ?? ""}
            placeholder="4×8"
            onChange={(e) => setF({ ...f, series_reps: e.target.value })}
          />
        </Field>
        <Field label="Descanso">
          <input
            aria-label="Descanso"
            className={input}
            value={f.rest ?? ""}
            placeholder="90 s"
            onChange={(e) => setF({ ...f, rest: e.target.value })}
          />
        </Field>
      </div>
      <Field label="Cómo hacerlo">
        <textarea
          rows={4}
          className={cn(input, "resize-y")}
          value={f.how_to ?? ""}
          onChange={(e) => setF({ ...f, how_to: e.target.value })}
        />
      </Field>
      <Field label="Músculos">
        <MusclePicker value={f.muscles} onChange={(muscles) => setF({ ...f, muscles })} />
      </Field>
      <div className="flex gap-2">
        <PrimaryButton onClick={onSave}>{saveLabel}</PrimaryButton>
        {editing && (
          <GhostButton onClick={onCancel} title={status ? undefined : "Cancelar"}>Cancelar</GhostButton>
        )}
      </div>
      {/* Segundo destino, no otro nombre para el primero: guardar aquí deja el
          ejercicio en tu biblioteca de 302 para usarlo cualquier día, y **no**
          lo mete en el programa. */}
      {onSaveToLibrary && (
        <GhostButton data-library-save onClick={() => void onSaveToLibrary()}>
          {libraryExists ? "Actualizar en la Biblioteca" : "Guardar en la Biblioteca"}
        </GhostButton>
      )}
      {status && <p className="text-[12px] text-dim">{status}</p>}
      {/* El estado de la biblioteca va aparte: un fallo aquí no puede decir
          «Ejercicio añadido ✓», que es del programa. */}
      {libStatus && <p className="text-[12px] text-dim">{libStatus}</p>}
    </aside>
  );
}