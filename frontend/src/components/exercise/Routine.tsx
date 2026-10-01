// Tu rutina: los ejercicios que tienes, agrupados por día, con el formulario de
// edición al lado. Es la mitad "lo que ya está" del apartado Ejercicios.
//
// La otra mitad es la Biblioteca, que vive en `Library.tsx`. Aquí solo se
// listan los ejercicios guardados y se editan.

import { useState } from "react";
import { Film, Link2, Pencil, X } from "lucide-react";
import { api } from "../../lib/bridge";
import { useApp } from "../../store/app";
import { useExercise } from "../../store/exercise";
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

export function Routine() {
  const fail = useFail();
  const toast = useApp((s) => s.toast);
  const days = useExercise((s) => s.days);
  const list = useExercise((s) => s.list);
  const refresh = useExercise((s) => s.refresh);
  const [editing, setEditing] = useState<string>("");
  const [f, setF] = useState<Partial<Exercise>>(EMPTY);
  const [status, setStatus] = useState("");
  const [debug, setDebug] = useState(false);

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
          <h1 className="text-[21px] font-semibold text-text">Tu rutina</h1>
          <span className="text-[12px] text-faint">{list.length} ejercicios</span>
          <span className="flex-1" />
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
export function ExerciseForm({
  editing,
  f,
  setF,
  status,
  onSave,
  onCancel,
  onPickVideo,
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
  title?: string;
  saveLabel?: string;
}) {
  const days = useExercise((s) => s.days);
  return (
    <aside className="w-[360px] flex-none space-y-3 overflow-y-auto rounded-xl border border-line bg-panel p-4">
      <div className="text-[14px] font-semibold text-text">
        {title ?? (editing ? "✎ Editar ejercicio" : "➕ Añadir ejercicio")}
      </div>
      <Field label="Día">
        <select className={input} value={f.day} onChange={(e) => setF({ ...f, day: e.target.value })}>
          {days.map((d) => (
            <option key={d.key} value={d.key}>{d.name}</option>
          ))}
        </select>
      </Field>
      <Field label="Nombre">
        <input className={input} value={f.name ?? ""} onChange={(e) => setF({ ...f, name: e.target.value })} />
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
      {status && <p className="text-[12px] text-dim">{status}</p>}
    </aside>
  );
}