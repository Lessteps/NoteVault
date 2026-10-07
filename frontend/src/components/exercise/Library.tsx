// La biblioteca de 302 ejercicios.
//
// A la derecha, el detalle: tres frames, los datos y "Cómo hacerlo". Y si el
// ejercicio se acaba de añadir a la rutina, el mismo formulario de
// `ExerciseForm` para completar series, descanso y video sin cambiar de
// pantalla — que era el rodeo queJusto justificaba fusionar ambas vistas.

import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { api } from "../../lib/bridge";
import { weekdayKeyOf } from "../../lib/exercise";
import { todayIso } from "../../lib/tasks";
import { useExercise } from "../../store/exercise";
import {
  filterLibrary,
  filterLibraryByLocalMuscle,
  fieldsFromLibrary,
  libraryEquipment,
  libraryMuscles,
  localMusclesInCatalog,
  type LibraryEntry,
} from "../../lib/exerciseLibrary";
import { GhostButton, input, PrimaryButton } from "../common/forms";
import { confirmAction } from "../ui";
import { cn } from "../ui";
import type { Exercise } from "../../lib/types";
import type { LibraryUserEntry } from "../../lib/libraryTypes";
import { BodyPair } from "./BodyFigure";
import { Detail } from "./LibraryDetail";
import { ExerciseForm } from "./ExerciseForm";
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
  const [favorites, setFavorites] = useState<string[]>([]);
  const [onlyFavs, setOnlyFavs] = useState(false);
  useEffect(() => {
    let alive = true;
    void api.exLibraryList().then((e) => {
      // El puente devuelve lo que venga; si no es una lista, biblioteca vacía.
      const next = Array.isArray(e) ? e : [];
      if (alive && next.length) setUserEntries(next);
    }).catch(() => undefined);
    void api.exFavorites().then((f) => {
      if (alive && Array.isArray(f)) setFavorites(f);
    }).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  // El ejercicio recién añadido: su formulario aparece en el detalle.
  const [added, setAdded] = useState<{ id: string; fields: Partial<Exercise> } | null>(null);
  const [editStatus, setEditStatus] = useState("");
  /** URL servida del video propio, por slug. Vacío = sin video o sin resolver. */
  const [videoUrls, setVideoUrls] = useState<Record<string, string>>({});

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

  const rows = useMemo(() => {
    const base = localMuscle
      ? filterLibraryByLocalMuscle(localMuscle, { query: q, equipment }, userEntries)
      : filterLibrary({ query: q, equipment, muscle }, userEntries);
    if (!onlyFavs) return base;
    const favs = new Set(favorites);
    return base.filter((r) => favs.has(r.slug));
  }, [q, equipment, muscle, localMuscle, userEntries, favorites, onlyFavs]);
  // Nada seleccionado al entrar: el panel muestra un aviso, no el primer
  // ejercicio de la lista por sorpresa.
  const current = rows.find((r) => r.slug === selected) ?? null;
  // El video propio se sirve por http para poder verlo en el detalle.
  useEffect(() => {
    if (!current?.video_path) return;
    let alive = true;
    void api.exLibraryVideoUrl(current.slug)
      .then((r) => {
        if (alive && r?.url) setVideoUrls((prev) => ({ ...prev, [current.slug]: r.url }));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [current?.slug, current?.video_path]);

  const toggleMuscle = (id: string) => setLocalMuscle((m) => (m === id ? "" : id));

  const toggleFavorite = async (slug: string) => {
    try {
      const r = await api.exFavoriteToggle(slug);
      setFavorites((prev) => {
        const next = new Set(prev);
        if (r.on) next.add(r.slug);
        else next.delete(r.slug);
        return [...next].sort();
      });
    } catch (e) {
      fail(e);
    }
  };

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
    const fields: Partial<Exercise> = {
      // El día, las series y el descanso son de quien añade: la biblioteca no
      // tiene prescripción. Los campos que sí heredan —nombre, instrucción,
      // músculos, origen y huella— los monta `fieldsFromLibrary`, el mismo que
      // usa el buscador del programa. Antes estaban escritos dos veces, y un
      // campo nuevo obligaba a acordarse de los dos sitios.
      day,
      ...fieldsFromLibrary(found, userEntries),
      series_reps: "",
      rest: "",
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

  /**
 * Quita tu entrada de la biblioteca. Es el «deshacer» de una edición: si
 * escribiste encima de Bench Press y te arrepientes, quitando tu entrada vuelve
 * a mandar el catálogo, con sus imágenes y su redacción.
 *
 * Los ejercicios del catálogo no ofrecen esto: no están en tu fichero, y
 * borrarlos no sería deshacer.
 */
  const pickVideo = async (slug: string, name: string) => {
    try {
      const picked = await api.exLibraryPickVideo();
      if (!picked?.ok || !picked.video_path) return;
      await api.exLibrarySave({ name, slug, video_path: picked.video_path });
      setStatus(`Video añadido a «${name}» ✓`);
      setUserEntries(await api.exLibraryList().catch(() => userEntries));
    } catch (e) {
      fail(e);
    }
  };

  const removeVideo = async (slug: string, name: string) => {
    try {
      await api.exLibrarySave({ name, slug, video_path: "" });
      setStatus(`Video quitado de «${name}» ✓`);
      setVideoUrls((prev) => {
        const next = { ...prev };
        delete next[slug];
        return next;
      });
      setUserEntries(await api.exLibraryList().catch(() => userEntries));
    } catch (e) {
      fail(e);
    }
  };

const removeFromLibrary = async (slug: string, name: string) => {  const ok = await confirmAction(
    "Quitar de la biblioteca",
    `¿Quitar «${name}» de tu biblioteca? Volverá a estar como está en el catálogo. Los ejercicios que ya lo usan en tu programa no se tocan.`,
    "Quitar",
    true,
  );
  if (!ok) return;
  try {
    await api.exLibraryRemove(slug);
    setStatus(`«${name}» quitado de la biblioteca ✓`);
    setUserEntries(await api.exLibraryList().catch(() => userEntries));
    setSelected(null);
  } catch (e) {
    fail(e);
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
              <button
                type="button"
                data-favorite={r.slug}
                aria-pressed={favorites.includes(r.slug)}
                aria-label={favorites.includes(r.slug) ? `Quitar ${r.name} de favoritos` : `Guardar ${r.name} en favoritos`}
                title={favorites.includes(r.slug) ? "Quitar de favoritos" : "Guardar en favoritos"}
                onClick={(e) => { e.stopPropagation(); void toggleFavorite(r.slug); }}
                className={cn(
                  "grid h-7 w-7 flex-none place-items-center rounded-lg text-[15px] transition-colors",
                  favorites.includes(r.slug) ? "text-amber-400" : "text-faint hover:text-dim",
                )}
              >
                {favorites.includes(r.slug) ? "★" : "☆"}
              </button>
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
              videoUrl={videoUrls[current.slug]}
              onPickVideo={
                userEntries.some((u) => u.slug === current.slug)
                  ? () => void pickVideo(current.slug, current.name)
                  : undefined
              }
              onRemoveVideo={
                current.video_path
                  ? () => void removeVideo(current.slug, current.name)
                  : undefined
              }
              onRemove={
                current && userEntries.some((u) => u.slug === current.slug)
                  ? () => void removeFromLibrary(current.slug, current.name)
                  : undefined
              }
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

  if (embedded)
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div
          data-library-toolbar
          className="flex flex-none flex-wrap items-center gap-2 px-6 py-2"
        >
          <span className="font-mono text-[11.5px] text-faint">{rows.length} de 302</span>
          <button
            type="button"
            data-favorites-only={onlyFavs ? "true" : "false"}
            aria-pressed={onlyFavs}
            onClick={() => setOnlyFavs((v) => !v)}
            title="Ver solo mis favoritos"
            className={cn(
              "rounded-lg border px-2.5 py-1 text-[12px] transition-colors",
              onlyFavs
                ? "border-accent bg-accent-soft text-text"
                : "border-line text-dim hover:bg-hover hover:text-text",
            )}
          >
            ★ Favoritos{favorites.length ? ` (${favorites.length})` : ""}
          </button>
          <span className="flex-1" />
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
          <div className="relative">
            <input
              ref={searchRef}
              className={cn(input, "w-56 pr-8")}
              placeholder="Buscar ejercicios…"
              aria-label="Buscar ejercicios"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onInput={(e) => setQ((e.target as HTMLInputElement).value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  setQ("");
                }
              }}
            />
            {q && (
              <button
                type="button"
                aria-label="Limpiar búsqueda"
                title="Limpiar búsqueda"
                onClick={() => setQ("")}
                className="absolute right-2 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded text-faint hover:bg-hover hover:text-text"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>
        {body}
      </div>
    );

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