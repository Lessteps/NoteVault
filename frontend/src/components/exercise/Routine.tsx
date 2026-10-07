// Tu programa: los ejercicios que tienes, agrupados por día plegable, con el
// formulario en un panel que solo se abre al añadir o editar.
//
// Se llama programa y no rutina porque es el molde, no la sesión: aquí se decide
// qué haces cada día; entrenarlo es Vista general, a la que se va con el botón
// «Ir a hoy». La otra mitad del apartado es la Biblioteca (`Library.tsx`).

import { useEffect, useMemo, useRef, useState } from "react";
import { Library, Link2, Plus, Sun, X } from "lucide-react";
import { api } from "../../lib/bridge";
import { useApp } from "../../store/app";
import { useExercise } from "../../store/exercise";
import { usePersistedNav } from "../../store/navState";
import {
  catalogNames,
  libraryEntry,
  libraryFingerprint,
  orphanCopies,
  staleCopies,
} from "../../lib/exerciseLibrary";
import { normalizeLibraryName, type LibraryUserEntry } from "../../lib/libraryTypes";
import type { Exercise } from "../../lib/types";
import { confirmAction, IconButton } from "../ui";
import { GhostButton } from "../common/forms";
import { ExerciseForm } from "./ExerciseForm";
import { HistoryPanel } from "./HistoryPanel";
import { ORANGE, useFail } from "./parts";
import { RoutineDaySection, confirmRemove } from "./RoutineDaySection";

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
  // Días abiertos a mano. `null` = automático: abiertos los que tienen algo.
  const [openDays, setOpenDays] = useState<string[] | null>(null);
  // El formulario vive en un panel: cerrado al entrar, la lista respira.
  const [formOpen, setFormOpen] = useState(false);
  // La ficha de historial de un ejercicio, si se pidió desde su fila.
  const [historyId, setHistoryId] = useState<string | null>(null);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  // Opt-in apagado por defecto: encendido, las copias se ponen al día solas
  // sin banner; apagado, todo igual que siempre (banner + Actualizar/Ahora no).
  const [autoSync, setAutoSync] = usePersistedNav<boolean>("ejercicio.sync-auto", false);
  const mostrarAviso = stale.length > 0 && !dismissed && !autoSync;

  /** Pone al día las copias desfasadas. Solo campos de biblioteca: tus
   * series, tu descanso y tu video no se mandan y `ex_save` los conserva. */
  const applyStale = async (items: typeof stale) => {
    for (const ex of items) {
      const entry = libraryEntry(ex.source!, libraryEntries);
      if (!entry) continue;
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
    setLibStatus(`${items.length === 1 ? "Copia actualizada" : `${items.length} copias actualizadas`} ✓`);
    setLibraryEntries(await api.exLibraryList().catch(() => libraryEntries));
    void refresh();
  };
  // Auto-sync: una sola pasada por hornada de desfasadas. Al refrescar, la
  // lista se pone al día y `stale` se vacía, así que no se repite.
  const autoDone = useRef("");
  useEffect(() => {
    if (!autoSync || !stale.length) return;
    const key = stale.map((e) => e.id).sort().join(",");
    if (autoDone.current === key) return;
    autoDone.current = key;
    void applyStale(stale)
      .then(() => toast("info", `${stale.length === 1 ? "Copia actualizada sola" : `${stale.length} copias actualizadas solas`} ✓`))
      .catch(fail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSync, stale]);
  /**
   * Copias antiguas sin origen. Se ocultan una a una al vincular o al marcar
   * a mano (eso guarda `sourceFp`, así que dejan de ser huérfanas).
   */
  const orphans = useMemo(
    () => orphanCopies(list, libraryEntries),
    [list, libraryEntries],
  );
  const [orphanDone, setOrphanDone] = useState<string[]>([]);
  const pendientes = orphans.filter((o) => !orphanDone.includes(o.exercise.id));

  const closeForm = () => {    setEditing("");
    setF({ ...EMPTY, day: f.day });
    setStatus("");
    setFormOpen(false);
  };

  const openAdd = (day = f.day) => {
    setEditing("");
    setF({ ...EMPTY, day });
    setStatus("");
    setFormOpen(true);
  };

  const openEdit = (id: string) => {
    const e = list.find((x) => x.id === id);
    if (!e) return;
    setEditing(id);
    setF({ ...e });
    setStatus("");
    setFormOpen(true);
  };

  const remove = async (id: string) => {
    const e = list.find((x) => x.id === id);
    if (!e) return;
    if (!(await confirmRemove(e.name))) return;
    try {
      await api.exRemove(id);
      void refresh();
    } catch (err) {
      fail(err);
    }
  };

  /** Copia un día entero a otro día: mismos campos, nuevo id, origen intacto. */
  const duplicateDay = async (from: string, to: string) => {
    if (from === to) return;
    const src = list.filter((x) => x.day === from);
    if (!src.length) return;
    if (list.some((x) => x.day === to)) {
      const ok = await confirmAction(
        "Duplicar día",
        `«${to}» ya tiene ejercicios. Se añadirán los de «${from}» a los que hay.`,
        "Duplicar",
        true,
      );
      if (!ok) return;
    }
    try {
      for (const e of src) {
        await api.exSave("", {
          day: to,
          name: e.name,
          video_path: e.video_path || e.video,
          series_reps: e.series_reps,
          rest: e.rest,
          how_to: e.how_to,
          muscles: e.muscles,
          source: e.source,
          sourceFp: e.sourceFp,
        });
      }
      toast("info", `${src.length === 1 ? "Ejercicio duplicado" : `${src.length} ejercicios duplicados`} ✓`);
      void refresh();
    } catch (err) {
      fail(err);
    }
  };

  /** Mueve un ejercicio de día: solo cambia `day`, el resto se conserva. */
  const moveExercise = async (id: string, to: string) => {
    const e = list.find((x) => x.id === id);
    if (!e || e.day === to) return;
    try {
      await api.exSave(id, { day: to });
      void refresh();
    } catch (err) {
      fail(err);
    }
  };

  const isOpen = (key: string, count: number) =>
    openDays ? openDays.includes(key) : count > 0;

  const toggleDay = (key: string, count: number) => {
    const base = openDays ?? days.filter((d) => list.some((e) => e.day === d.key)).map((d) => d.key);
    setOpenDays(base.includes(key) ? base.filter((k) => k !== key) : [...base, key]);
    void count;
  };

  const save = async () => {
    if (!f.name?.trim()) return setStatus("El ejercicio necesita un nombre.");
    try {
      await api.exSave(editing, f);
      setStatus(editing ? "Ejercicio actualizado ✓" : "Ejercicio añadido ✓");
      setEditing("");
      setF({ ...EMPTY, day: f.day });
      setFormOpen(false);
      void refresh();
    } catch (e) {
      setStatus((e as Error).message);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 gap-4 overflow-hidden px-6 py-4">
      <div className="min-w-0 flex-1 space-y-3 overflow-y-auto pr-1">
        <div className="flex items-center gap-2">
          <h1 className="text-[15px] font-semibold text-text">Tu programa</h1>
          <span className="text-[12px] text-faint">
            {list.length === 1 ? "1 ejercicio" : `${list.length} ejercicios`}
          </span>
          <span className="flex-1" />
          {/* El programa es el molde; aquí se entrena. El botón evita tener que
              saber que Vista general existe para pasar de uno a otro. */}
          <GhostButton data-go-today onClick={onGoToday}>
            <Sun size={13} /> Ir a hoy
          </GhostButton>
          <IconButton
            title="Vincular videos automáticamente"
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
            <Link2 size={13} />
          </IconButton>
          <GhostButton data-add-exercise onClick={() => openAdd()}>
            <Plus size={13} /> Añadir ejercicio
          </GhostButton>
          <label className="flex cursor-pointer items-center gap-1.5 text-[11.5px] text-faint hover:text-dim" title="Si la Biblioteca cambia, las copias se actualizan solas sin preguntar">
            <input
              type="checkbox"
              data-sync-auto
              checked={autoSync}
              onChange={(e) => setAutoSync(e.target.checked)}
              style={{ accentColor: ORANGE }}
            />
            Actualizar solas
          </label>
        </div>
        {mostrarAviso && (
          <div
            data-stale-banner
            className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-card px-3 py-2 text-[12.5px] text-dim"
          >
            <span>
              «{stale[0]!.source}» cambió en la Biblioteca. Lo usas en{" "}
              {stale.length === 1 ? "un día" : `${stale.length} días`}.
            </span>
            <span className="flex-1" />
            <GhostButton
              data-stale-update
              onClick={() => void applyStale(stale)}
            >
              Actualizar
            </GhostButton>
            <GhostButton data-stale-dismiss onClick={() => setDismissed(true)}>
              Ahora no
            </GhostButton>
          </div>
        )}
        {pendientes.length > 0 && (
          <div
            data-orphan-banner
            className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-card px-3 py-2 text-[12.5px] text-dim"
          >
            <span>
              {pendientes.length === 1
                ? `«${pendientes[0]!.exercise.name}» parece de la Biblioteca. ¿Lo vinculamos?`
                : `${pendientes.length} ejercicios parecen de la Biblioteca. ¿Los vinculamos?`}
            </span>
            <span className="flex-1" />
            <GhostButton
              data-orphan-link
              onClick={async () => {
                for (const o of pendientes) {
                  await api.exSave(o.exercise.id, {
                    source: o.entry.slug,
                    sourceFp: libraryFingerprint(o.entry),
                  });
                }
                setOrphanDone((prev) => [...prev, ...pendientes.map((o) => o.exercise.id)]);
                void refresh();
              }}
            >
              Vincular
            </GhostButton>
            <GhostButton
              data-orphan-keep
              onClick={async () => {
                for (const o of pendientes) {
                  await api.exSave(o.exercise.id, { sourceFp: "manual" });
                }
                setOrphanDone((prev) => [...prev, ...pendientes.map((o) => o.exercise.id)]);
                void refresh();
              }}
            >
              Mantener a mano
            </GhostButton>
          </div>
        )}
        {/* El programa nace vacío. Con los siete días en «Sin ejercicios» al
            prinicipio, no se entiende qué hay que hacer, y el formulario —que
            sí sabe— queda enterrado abajo. */}
        {!list.length && (
          <div
            data-program-empty
            className="space-y-2 rounded-lg border border-line bg-card px-4 py-6 text-center"
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
            <RoutineDaySection
              key={d.key}
              day={d}
              days={days}
              exercises={exs}
              editing={editing}
              expanded={isOpen(d.key, exs.length)}
              onToggle={() => toggleDay(d.key, exs.length)}
              onEdit={openEdit}
              onRemove={(id) => void remove(id)}
              onHistory={(id) => setHistoryId(id)}
              onDuplicate={(from, to) => void duplicateDay(from, to)}
              onMove={(id, to) => void moveExercise(id, to)}
            />
          );
        })}
      </div>
      {historyId && (() => {
        const picked = list.find((x) => x.id === historyId);
        if (!picked) return null;
        return (
          <HistoryPanel
            exerciseId={picked.id}
            name={picked.name}
            onClose={() => setHistoryId(null)}
          />
        );
      })()}
      {formOpen && (
        <div
          data-exercise-drawer
          className="relative flex min-h-0 w-[360px] flex-none flex-col overflow-hidden"
        >
          <button
            type="button"
            aria-label="Cerrar formulario"
            title="Cerrar"
            onClick={closeForm}
            className="absolute -left-3 top-2 z-10 grid h-6 w-6 place-items-center rounded-full border border-line bg-panel text-faint hover:text-text"
          >
            <X size={12} />
          </button>
          <div className="min-h-0 flex-1 overflow-y-auto pb-2">
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
            onCancel={closeForm}
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
        </div>
      )}
    </div>
  );
}
