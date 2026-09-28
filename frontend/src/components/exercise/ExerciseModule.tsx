// Ejercicio: la rutina por días, el registro diario y los videos.
//
// La estructura imita la de Hábitos a propósito: pestañas de periodo (Diaria ·
// Semanal · Mensual · Anual), el panel de estadísticas al pie de la barra
// lateral y los dashboards circulares en la vista general.

import {
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ExternalLink,
  Film,
  LayoutGrid,
  ListChecks,
  Link2,
  Pencil,
  Settings2,
  Sun,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { usePersistedNav } from "../../store/navState";
import { api } from "../../lib/bridge";
import { useApp } from "../../store/app";
import { useExercise } from "../../store/exercise";
import type { Exercise } from "../../lib/types";
import { ModuleSidebar } from "../ModuleSidebar";
import { Field, GhostButton, input, PrimaryButton } from "../common/forms";
import { cn, confirmAction, IconButton } from "../ui";
import { Daily } from "./Daily";
import { ExerciseMonth, ExerciseWeek } from "./Grids";
import { Overview } from "./Overview";
import { ORANGE, SideStats, useFail } from "./parts";
import { Yearly } from "./Yearly";

const EMPTY: Partial<Exercise> = { day: "lunes", name: "", video_path: "", series_reps: "", rest: "", how_to: "" };

/** Gestionar ejercicios: la rutina por días y el formulario de uno. */
function Manage() {
  const fail = useFail();
  const toast = useApp((s) => s.toast);
  const days = useExercise((s) => s.days);
  const list = useExercise((s) => s.list);
  const refresh = useExercise((s) => s.refresh);
  const [editing, setEditing] = useState<string>("");
  const [f, setF] = useState<Partial<Exercise>>(EMPTY);
  const [status, setStatus] = useState("");

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
          <h1 className="text-[21px] font-semibold text-text">⚙ Gestionar ejercicios</h1>
          <span className="flex-1" />
          <GhostButton onClick={async () => {
            try {
              const r = await api.exLinkVideos();
              toast("info", `Vinculados: ${r.linked.length} · ya estaban: ${r.already.length} · sin video: ${r.missing.length}`);
              void refresh();
            } catch (e) {
              fail(e);
            }
          }}><Link2 size={13} /> Vincular videos automáticamente</GhostButton>
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
                  <div key={e.id} className={cn("group flex items-center gap-2 px-3 py-1.5 text-[12.5px]", editing === e.id && "bg-accent-soft")}>
                    <span className="min-w-0 flex-1 truncate text-text">{e.name}</span>
                    <span className="text-[11.5px] text-dim">{e.series_reps}</span>
                    <span title={e.has_video ? e.video_name : "Sin video"} className={e.has_video ? "text-mint" : "text-faint"}><Film size={13} /></span>
                    <IconButton title="Editar" onClick={() => { setEditing(e.id); setF({ ...e }); setStatus(""); }}><Pencil size={12} /></IconButton>
                    <IconButton title="Quitar" onClick={async () => {
                      if (!(await confirmAction("Quitar ejercicio", `¿Quitar «${e.name}» de la rutina? Los registros pasados se conservan.`, "Quitar", true))) return;
                      try {
                        await api.exRemove(e.id);
                        void refresh();
                      } catch (err) {
                        fail(err);
                      }
                    }}><X size={12} /></IconButton>
                  </div>
                ))}
                {!exs.length && <div className="px-3 py-2 text-[12px] text-faint">Sin ejercicios.</div>}
              </div>
            </section>
          );
        })}
      </div>
      <aside className="w-[360px] flex-none space-y-3 overflow-y-auto rounded-xl border border-line bg-panel p-4">
        <div className="text-[14px] font-semibold text-text">{editing ? "✎ Editar ejercicio" : "➕ Añadir ejercicio"}</div>
        <Field label="Día">
          <select className={input} value={f.day} onChange={(e) => setF({ ...f, day: e.target.value })}>
            {days.map((d) => <option key={d.key} value={d.key}>{d.name}</option>)}
          </select>
        </Field>
        <Field label="Nombre"><input className={input} value={f.name ?? ""} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Video (ruta del archivo)">
          <input className={input} value={f.video_path ?? ""} placeholder="C:\Videos\press-banca.mp4" onChange={(e) => setF({ ...f, video_path: e.target.value })} />
        </Field>
        {editing && <GhostButton onClick={async () => {
          try {
            const r = await api.exPickVideo(editing);
            if (r.ok) { setStatus("Video copiado al vault ✓"); void refresh(); }
          } catch (e) {
            setStatus((e as Error).message);
          }
        }}>📂 Elegir video y copiarlo al vault</GhostButton>}
        <div className="grid grid-cols-2 gap-2">
          <Field label="Series × reps"><input className={input} value={f.series_reps ?? ""} placeholder="4×8" onChange={(e) => setF({ ...f, series_reps: e.target.value })} /></Field>
          <Field label="Descanso"><input className={input} value={f.rest ?? ""} placeholder="90 s" onChange={(e) => setF({ ...f, rest: e.target.value })} /></Field>
        </div>
        <Field label="Cómo hacerlo"><textarea rows={4} className={cn(input, "resize-y")} value={f.how_to ?? ""} onChange={(e) => setF({ ...f, how_to: e.target.value })} /></Field>
        <div className="flex gap-2">
          <PrimaryButton onClick={() => void save()}>Guardar ejercicio</PrimaryButton>
          {editing && <GhostButton onClick={() => { setEditing(""); setF({ ...EMPTY, day: f.day }); setStatus(""); }}>Cancelar</GhostButton>}
        </div>
        {status && <p className="text-[12px] text-dim">{status}</p>}
      </aside>
    </div>
  );
}

/** El reproductor del módulo: el video se ajusta a la tarjeta, sin desbordar. */
function VideoPlayer({ ex, onBack }: { ex: Exercise; onBack: () => void }) {
  const fail = useFail();
  const [src, setSrc] = useState<{ url: string; name: string } | null>(null);
  useEffect(() => {
    api.exVideoUrl(ex.id).then(setSrc).catch((e) => { fail(e); onBack(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ex.id]);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 px-6 py-4">
      <div className="flex items-center gap-2">
        <GhostButton onClick={onBack} className="border-transparent px-1.5"><ChevronLeft size={14} /> Volver</GhostButton>
        <span className="text-[15px] font-semibold text-text">{ex.name}</span>
        <span className="flex-1" />
        <GhostButton onClick={() => void api.exOpenVideo(ex.id).catch(fail)}><ExternalLink size={13} /> Abrir en el reproductor del sistema</GhostButton>
      </div>
      {/* El video se letterboxea dentro de la tarjeta: `object-contain` sobre una
          caja que mide exactamente el marco evita que un clip 4:3 se salga. */}
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl bg-black">
        {src && <video key={src.url} src={src.url} controls autoPlay className="h-full w-full object-contain" />}
      </div>
      <div className="flex flex-wrap gap-4 text-[12.5px] text-dim">
        {ex.series_reps && <span>📊 {ex.series_reps}</span>}
        {ex.rest && <span>⏱ {ex.rest}</span>}
        <span className="text-faint">{src?.name}</span>
      </div>
      {ex.how_to && <p className="text-[12.5px] leading-relaxed text-dim">{ex.how_to}</p>}
    </div>
  );
}

export function ExerciseModule() {
  const load = useExercise((s) => s.load);
  const loaded = useExercise((s) => s.loaded);
  const error = useExercise((s) => s.error);
  const list = useExercise((s) => s.list);
  const stats = useExercise((s) => s.stats);
  // Su vista interna (general / diaria / …) se recuerda entre pestañas.
  const [view, setView] = usePersistedNav("ejercicio.view", "general");
  const [video, setVideo] = useState<Exercise | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  const pendingToday = stats ? Math.max(0, stats.today.total - stats.today.done) : 0;

  return (
    <div className="flex min-w-0 flex-1">
      <ModuleSidebar
        title="Ejercicio"
        active={view}
        onSelect={(id) => {
          setView(id);
          setVideo(null);
        }}
        items={[
          { id: "general", label: "Vista general", hint: "Rachas y dashboards", icon: <LayoutGrid /> },
          { id: "diaria", label: "Diaria", hint: "Rutina del día", icon: <Sun />, badge: pendingToday },
          { id: "semanal", label: "Semanal", icon: <CalendarRange /> },
          { id: "mensual", label: "Mensual", icon: <CalendarDays /> },
          { id: "anual", label: "Anual", icon: <ListChecks /> },
          { id: "gestionar", label: "Gestionar ejercicios", hint: `${list.length} ejercicios`, icon: <Settings2 /> },
        ]}
      >
        <SideStats />
      </ModuleSidebar>
      <main className="flex min-w-0 flex-1 flex-col bg-surface">
        {video ? (
          <VideoPlayer ex={video} onBack={() => setVideo(null)} />
        ) : !loaded ? (
          <div className="grid flex-1 place-items-center text-[13px] text-faint">Cargando ejercicios…</div>
        ) : error ? (
          <div className="grid flex-1 place-items-center text-[13px] text-danger">{error}</div>
        ) : view === "general" ? <Overview />
          : view === "diaria" ? <Daily onVideo={setVideo} />
            : view === "semanal" ? <ExerciseWeek />
              : view === "mensual" ? <ExerciseMonth />
                : view === "anual" ? <Yearly />
                  : <Manage />}
      </main>
    </div>
  );
}
