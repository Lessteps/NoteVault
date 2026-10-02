// Tu programa: los ejercicios que tienes, agrupados por día, con el formulario
// de edición al lado. Es la mitad "lo que ya está" del apartado Ejercicios.
//
// Se llama programa y no rutina porque es el molde, no la sesión: aquí se decide
// qué haces cada día; entrenarlo es la pantalla Diaria, a la que se va con el
// botón «Ir a hoy». La otra mitad del apartado es la Biblioteca (`Library.tsx`).

import { useEffect, useMemo, useState } from "react";
import { Film, Library, Link2, Pencil, Sun, X } from "lucide-react";
import { api } from "../../lib/bridge";
import { useApp } from "../../store/app";
import { useExercise } from "../../store/exercise";
import {
  getInstructions,
  libraryEntry,
  libraryFingerprint,
  searchLibrary,
  staleCopies,
} from "../../lib/exerciseLibrary";
import { normalizeLibraryName, type LibraryUserEntry } from "../../lib/libraryTypes";
import type { Exercise } from "../../lib/types";
import { confirmAction, IconButton } from "../ui";
import { Field, GhostButton, input, PrimaryButton } from "../common/forms";
import { cn } from "../ui";
import { MuscleCount } from "./MusclePicker";
import { MusclePicker } from "./MusclePicker";
import { MuscleMapDebug } from "./MuscleMapDebug";
import { ORANGE, useFail } from "./parts";

const EMPTY: Partial<Exercise> = {
  day: "lunes",
  name: "",
  video_path: "",
  series_reps: "",
  rest: "",
  how_to: "",
  muscles: { primary: [], secondary: [] },
};

export function Routine({ onGoToday, onGoBiblioteca }: { onGoToday: () => void; onGoBiblioteca: () => void }) {
  const fail = useFail();
  const toast = useApp((s) => s.toast);
  const days = useExercise((s) => s.days);
  const list = useExercise((s) => s.list);
  const refresh = useExercise((s) => s.refresh);
  const [editing, setEditing] = useState<string>("");
  const [f, setF] = useState<Partial<Exercise>>(EMPTY);
  const [status, setStatus] = useState("");
  // El estado de la biblioteca va aparte del del programa: son dos destinos
  // distintos y un fallo en uno no puede confirmar el otro.
  const [libStatus, setLibStatus] = useState("");
  const [libraryEntries, setLibraryEntries] = useState<LibraryUserEntry[]>([]);
  const [debug, setDebug] = useState(false);

  // Las entradas propias se cargan **aquí**, una sola vez, y se pasan al
  // formulario: el aviso de copias desfasadas y el buscador necesitan las
  // mismas, y dos cargas distintas se desincronizan.
  useEffect(() => {
    let alive = true;
    void api.exLibraryList().then((e) => {
      // El puente devuelve lo que venga; si no es una lista, se trata como
      // vacía. Un ejercicio de biblioteca no puede impedir abrir el programa.
      const next = Array.isArray(e) ? e : [];
      // Solo se repinta si hay algo que cambiar: un setState con el mismo array
      // provocaba un render de más en cada montaje.
      if (alive && next.length) setLibraryEntries(next);
    }).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [list.length]);

  /** Ya hay una entrada con ese nombre? Entonces el botón avisa antes de pisarla. */
  const libraryExists = (name: string | undefined) => {
    const key = normalizeLibraryName(name ?? "");
    if (!key) return false;
    return libraryEntries.some((e) => normalizeLibraryName(e.name) === key);
  };

  /**
   * Las copias que se quedaron atrás. Solo avisa; **nunca** actualiza solo: si
   * reescribiste la instrucción en tu copia a propósito, un sincronizado
   * automático te lo pisaría sin preguntar.
   */
  const stale = staleCopies(list, libraryEntries);
  const [dismissed, setDismissed] = useState(false);
  const mostrarAviso = stale.length > 0 && !dismissed;

  const save = async () => {
    if (!f.name?.trim()) return setStatus("El ejercicio necesita un nombre.");
    try {
      await api.exSave(editing, f);
      setStatus(editing ? "Ejercicio actualizado ✓" : "Ejercicio añadido ✓");
      setEditing("");
      setF({ ...EMPTY, day: f.day });
      void refresh();
    } catch (e) {
      setStatus((e as Error).message);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 gap-4 overflow-hidden px-6 py-4">
      <div className="min-w-0 flex-1 space-y-3 overflow-y-auto pr-1">
        <div className="flex items-center gap-2">
          <h1 className="text-[21px] font-semibold text-text">Tu programa</h1>
          <span className="text-[12px] text-faint">{list.length} ejercicios</span>
          <span className="flex-1" />
          {/* El programa es el molde; aquí se entrena. El botón evita tener que
              saber que Diaria existe para pasar de uno a otro. */}
          <GhostButton data-go-today onClick={onGoToday}>
            <Sun size={13} /> Ir a hoy
          </GhostButton>
          {/* TEMPORAL: verificación visual del mapeo forma → músculo. Se borra
              cuando el mapeo esté aprobado (aquí y en MuscleMapDebug.tsx). */}
          <GhostButton onClick={() => setDebug(true)}>🔎 Verificación del mapeo</GhostButton>
          <GhostButton
            onClick={async () => {
              try {
                const r = await api.exLinkVideos();
                toast(
                  "info",
                  `Vinculados: ${r.linked.length} · ya estaban: ${r.already.length} · sin video: ${r.missing.length}`,
                );
                void refresh();
              } catch (e) {
                fail(e);
              }
            }}
          >
            <Link2 size={13} /> Vincular videos automáticamente
          </GhostButton>
        </div>
        {mostrarAviso && (
          <div
            data-stale-banner
            className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-card px-3 py-2 text-[12.5px] text-dim"
          >
            <span>
              «{stale[0]!.source}» cambió en la Biblioteca. Lo usas en{" "}
              {stale.length === 1 ? "un día" : `${stale.length} días`}.
            </span>
            <span className="flex-1" />
            <GhostButton
              data-stale-update
              onClick={async () => {
                for (const ex of stale) {
                  const entry = libraryEntry(ex.source!, libraryEntries);
                  if (!entry) continue;
                  // Solo los campos que vienen de la biblioteca. Tus series, tu
                  // descanso y tu video no se mandan: ex_save conserva lo que no
                  // llega, así que no se tocan.
                  await api.exSave(ex.id, {
                    name: entry.name,
                    how_to: entry.how_toPropia ?? "",
                    muscles: {
                      primary: entry.localPrimary,
                      secondary: entry.localSecondary,
                    },
                    sourceFp: libraryFingerprint(entry),
                  });
                }
                setLibStatus(`${stale.length === 1 ? "Copia actualizada" : `${stale.length} copias actualizadas`} ✓`);
                setLibraryEntries(await api.exLibraryList().catch(() => libraryEntries));
                void refresh();
              }}
            >
              Actualizar
            </GhostButton>
            <GhostButton data-stale-dismiss onClick={() => setDismissed(true)}>
              Ahora no
            </GhostButton>
          </div>
        )}
        {/* El programa nace vacío. Con los siete días en «Sin ejercicios» al
            prinicipio, no se entiende qué hay que hacer, y el formulario —que
            sí sabe— queda enterrado abajo. */}
        {!list.length && (
          <div
            data-program-empty
            className="space-y-2 rounded-xl border border-line bg-card px-4 py-6 text-center"
          >
            <p className="text-[13.5px] text-text">
              Todavía no hay ejercicios en tu programa. Elige los que quieras
              de la biblioteca y colócalos en el día que te toque.
            </p>
            <p className="text-[12px] text-faint">
              302 ejercicios de catálogo, con sus músculos y sus instrucciones.
            </p>
            <GhostButton data-go-biblioteca onClick={onGoBiblioteca} className="mt-1">
              <Library size={13} /> Ir a la biblioteca
            </GhostButton>
          </div>
        )}
        {days.map((d) => {
          const exs = list.filter((e) => e.day === d.key);
          return (
            <section key={d.key}>
              <div className="mb-1 text-[12.5px] font-semibold" style={{ color: ORANGE }}>
                {d.glyph} {d.name} <span className="font-normal text-faint">· {d.subtitle}</span>
              </div>
              <div className="divide-y divide-line rounded-xl border border-line bg-card">
                {exs.map((e) => (
                  <div
                    key={e.id}
                    data-routine-exercise={e.id}
                    className={cn(
                      "group flex items-center gap-2 px-3 py-1.5 text-[12.5px]",
                      editing === e.id && "bg-accent-soft",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate text-text">{e.name}</span>
                    <span className="text-[11.5px] text-dim">{e.series_reps}</span>
                    <MuscleCount muscles={e.muscles} />
                    <span
                      title={e.has_video ? e.video_name : "Sin video"}
                      className={e.has_video ? "text-mint" : "text-faint"}
                    >
                      <Film size={13} />
                    </span>
                    <IconButton
                      title="Editar"
                      onClick={() => {
                        setEditing(e.id);
                        setF({ ...e });
                        setStatus("");
                      }}
                    >
                      <Pencil size={12} />
                    </IconButton>
                    <IconButton
                      title="Quitar"
                      onClick={async () => {
                        if (
                          !(await confirmAction(
                            "Quitar ejercicio",
                            `¿Quitar «${e.name}» de la rutina? Los registros pasados se conservan.`,
                            "Quitar",
                            true,
                          ))
                        )
                          return;
                        try {
                          await api.exRemove(e.id);
                          void refresh();
                        } catch (err) {
                          fail(err);
                        }
                      }}
                    >
                      <X size={12} />
                    </IconButton>
                  </div>
                ))}
                {!exs.length && (
                  <div className="px-3 py-2 text-[12px] text-faint">Sin ejercicios.</div>
                )}
              </div>
            </section>
          );
        })}
      </div>
      <ExerciseForm
        editing={editing}
        f={f}
        setF={setF}
        status={status}
        onSave={() => void save()}
        libraryExists={libraryExists(f.name)}
        libStatus={libStatus}
        userEntriesProp={libraryEntries}
        onSaveToLibrary={async () => {
          try {
            const r = await api.exLibrarySave({
              name: f.name ?? "",
              muscles: f.muscles,
              how_to: f.how_to ?? "",
            });
            setLibStatus(
              r.created
                ? `«${r.entry.name}» guardado en la biblioteca ✓`
                : `«${r.entry.name}» actualizado en la biblioteca ✓`,
            );
            setLibraryEntries(await api.exLibraryList().catch(() => []));
          } catch (e) {
            setLibStatus((e as Error).message);
          }
        }}
        onCancel={() => {
          setEditing("");
          setF({ ...EMPTY, day: f.day });
          setStatus("");
        }}
        onPickVideo={async () => {
          try {
            const r = await api.exPickVideo(editing);
            if (r.ok) {
              setStatus("Video copiado al vault ✓");
              void refresh();
            }
          } catch (e) {
            setStatus((e as Error).message);
          }
        }}
      />
      {debug && <MuscleMapDebug onClose={() => setDebug(false)} />}
    </div>
  );
}

/**
 * El formulario de un ejercicio. Vive aparte porque la Biblioteca lo reutiliza
 * para completar series y descanso justo después de añadir.
 */
/**
 * Buscador sobre la biblioteca, dentro del formulario del programa. Escribe,
 * elige uno y el formulario se rellena con su nombre, sus músculos y su
 * "cómo hacerlo"; el día lo elige quien añade.
 *
 * Lo que ya tienes en la rutina sale marcado: son duplicados, no candidatos.
 */
function LibraryPicker({
  onPick,
  usedSlugs,
  userEntries,
}: {
  onPick: (slug: string) => void;
  /** Slugs que ya usas. Dato, no comparación de nombres: «Mi press» con
   * `source: bench-press` cuenta como bench-press aunque el nombre no coincida. */
  usedSlugs: Set<string>;
  /** Tus propias entradas: para que aparezcan al buscar. */
  userEntries: LibraryUserEntry[];
}) {
  const [q, setQ] = useState("");
  const rows = useMemo(
    () => (q.trim() ? searchLibrary(q, userEntries).slice(0, 8) : []),
    [q, userEntries],
  );
  return (
    <div data-library-picker className="space-y-1.5">
      <input
        className={input}
        placeholder="Buscar en la biblioteca…"
        aria-label="Buscar en la biblioteca"
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
      {rows.length > 0 && (
        <div className="max-h-[188px] space-y-0.5 overflow-y-auto">
          {rows.map((r) => {
            const already = usedSlugs.has(r.slug);
            return (
              <button
                key={r.slug}
                type="button"
                data-library-pick={r.slug}
                data-in-routine={already ? "true" : undefined}
                onClick={() => onPick(r.slug)}
                className={cn(
                  "flex w-full items-center gap-1.5 rounded-lg border border-line px-2 py-1 text-left text-[12px]",
                  "text-dim hover:border-accent hover:text-text",
                )}
              >
                <span className="min-w-0 flex-1 truncate">
                  {r.name}
                  <span className="ml-1 text-[10.5px] text-faint">· {r.guidePrimary}</span>
                </span>
                {already && (
                  <span className="flex-none text-[10px]" style={{ color: "var(--nv-mint)" }}>
                    ya en tu rutina
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

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
  setF: (fn: Partial<Exercise>) => void;
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
    const found = libraryEntry(slug);
    if (!found) return;
    const steps = getInstructions(slug)?.steps_es ?? [];
    setF({
      ...f,
      name: found.name,
      muscles: { primary: found.localPrimary, secondary: found.localSecondary },
      how_to: steps.length
        ? steps.map((s, i) => `${i + 1}. ${s}`).join("\n")
        : `${found.equipment} · ${found.guidePrimary}`,
    });
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