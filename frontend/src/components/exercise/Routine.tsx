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
  catalogNames,
  libraryEntry,
  libraryFingerprint,
  staleCopies,
} from "../../lib/exerciseLibrary";
import { normalizeLibraryName, type LibraryUserEntry } from "../../lib/libraryTypes";
import type { Exercise } from "../../lib/types";
import { confirmAction, IconButton } from "../ui";
import { GhostButton } from "../common/forms";
import { cn } from "../ui";
import { MuscleCount } from "./MusclePicker";
import { ExerciseForm } from "./ExerciseForm";
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

  // Las entradas propias se cargan **aquí**, una sola vez, y se pasan al
  // formulario: el aviso de copias desfasadas y el buscador necesitan las
  // mismas, y dos cargas distintas se desincronizan.
  useEffect(() => {
    let alive = true;
    void api.exLibraryList().then((e) => {
      // El puente devuelve lo que venga; si no es una lista, se trata como
      // vacía. Un ejercicio de biblioteca no puede impedir abrir el programa.
      const next = Array.isArray(e) ? e : [];
      // Se repinta también cuando **queda vacía**: si no, borrar la última
      // entrada dejaría un fantasma en la lista, en los filtros y en el aviso.
      if (alive && next.length !== libraryEntries.length) setLibraryEntries(next);
    }).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [list.length]);

  /**
   * Ya hay algo con ese nombre? Entonces el botón avisa antes de pisarlo.
   *
   * Se mira **también el catálogo**, no solo tus entradas: si escribes
   * «Bench Press» estás a punto de editar uno de los 302, y eso hay que decirlo
   * aunque todavía no tengas ninguna entrada propia con ese nombre.
   */
  const libraryExists = (name: string | undefined) => {
    const key = normalizeLibraryName(name ?? "");
    if (!key) return false;
    if (libraryEntries.some((e) => normalizeLibraryName(e.name) === key)) return true;
    return catalogNames().some((n) => normalizeLibraryName(n) === key);
  };

  /**
   * Las copias que se quedaron atrás. Solo avisa; **nunca** actualiza solo: si
   * reescribiste la instrucción en tu copia a propósito, un sincronizado
   * automático te lo pisaría sin preguntar.
   */
  const stale = useMemo(
    () => staleCopies(list, libraryEntries),
    [list, libraryEntries],
  );
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
          // Avisar **antes** de escribir encima de una entrada del catálogo o de
          // una tuya: es la única red antes de pisar 302 ejercicios redactados.
          if (libraryExists(f.name)) {
            const ok = await confirmAction(
              "Actualizar en la biblioteca",
              `«${f.name}» ya está en la biblioteca. Se actualizará con lo que hayas escrito.`,
              "Actualizar",
              true,
            );
            if (!ok) return;
          }
          try {
            const r = await api.exLibrarySave({
              name: f.name ?? "",
              // El slug viaja para que renombrar edite en vez de crear. Sin él,
              // escribir el nombre de otra entrada la duplicaría.
              slug: f.source,
              muscles: f.muscles,
              how_to: f.how_to ?? "",
            });
            setLibStatus(
              !r.wrote
                ? `«${r.entry.name}» no tenía cambios: se queda como está.`
                : r.created
                  ? `«${r.entry.name}» guardado en la biblioteca ✓`
                  : `«${r.entry.name}» actualizado en la biblioteca ✓`,
            );
            // Un fallo al releer **no** puede vaciar tu biblioteca de la
            // pantalla: se conserva lo que ya había.
            setLibraryEntries(await api.exLibraryList().catch(() => libraryEntries));
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
    </div>
  );
}
