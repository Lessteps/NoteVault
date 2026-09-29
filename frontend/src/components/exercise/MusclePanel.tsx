/**
 * Mapa muscular · la cara del panel derecho de la app.
 *
 * Misma información que el modal del día, en columna: la figura, la leyenda y la
 * lista de ejercicios del rango abierto. Como el panel es de la app y no del
 * módulo, el día que muestra lo publica la vista diaria (`store/muscleMap`).
 */
import { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, Map as MapIcon, X } from "lucide-react";
import { api } from "../../lib/bridge";
import type { ExerciseDay } from "../../lib/types";
import { muscleById, musclesOfExercise } from "../../lib/muscles";
import { useApp } from "../../store/app";
import { useMuscleMap } from "../../store/muscleMap";
import { cn, IconButton } from "../ui";
import { MuscleBody } from "./MuscleBody";
import { MODES, MuscleLegend, MuscleRows, modeLabel, useMuscleRows, type Mode, type Row } from "./muscleShared";
import { useFail } from "./parts";

export function MusclePanel() {
  const fail = useFail();
  const date = useMuscleMap((s) => s.date);
  const close = useApp((s) => s.toggleMuscle);
  const [day, setDay] = useState<ExerciseDay | null>(null);
  const [mode, setMode] = useState<Mode>("day");
  const [flipped, setFlipped] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);

  const load = () => api.exDays(date, date).then((d) => setDay(d[0] ?? null)).catch(fail);
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const { rows, data, openSide, byId, toggle } = useMuscleRows(mode, date, day);

  useEffect(() => { setFlipped(openSide === "back"); }, [openSide]);

  const muscle = picked ? muscleById(picked) : undefined;

  const highlight = useMemo(() => {
    if (pinned && picked) return new Set([picked]);
    const focused = rows.find((r) => r.id === (pinned ?? hovered));
    return focused ? new Set(musclesOfExercise(focused)) : null;
  }, [pinned, picked, hovered, rows]);

  const marcar = async (row: Row) => {
    await toggle(row);
    void load();
  };

  return (
    <aside aria-label="Esquema muscular" className="flex w-[320px] flex-none flex-col border-l border-line bg-panel">
      <div className="flex h-9 flex-none items-center gap-2 border-b border-line px-3">
        <MapIcon size={14} className="text-dim" />
        <span className="text-[12px] font-semibold text-text">Esquema muscular</span>
        <span className="truncate text-[11px] text-faint">{modeLabel(mode, date)}</span>
        <span className="ml-auto" />
        <IconButton title="Cerrar el panel" onClick={close}><X size={14} /></IconButton>
      </div>

      <div className="flex h-9 flex-none items-center gap-1 border-b border-line px-2">
        <div className="flex items-center gap-0.5 rounded-lg border border-line p-0.5">
          {MODES.map((m) => (
            <button key={m.id} type="button" title={m.hint}
              onClick={() => { setMode(m.id); setPicked(null); setPinned(null); }}
              className={cn("rounded-md px-1.5 py-0.5 text-[11.5px]", mode === m.id ? "bg-hover text-text" : "text-dim hover:text-text")}>
              {m.label}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setFlipped((v) => !v)} title="Cambiar de vista (anterior / posterior)"
          className="ml-auto flex items-center gap-1 rounded-md border border-line px-1.5 py-0.5 text-[11.5px] text-dim hover:bg-hover hover:text-text">
          <ArrowLeftRight size={12} /> {flipped ? "Posterior" : "Anterior"}
        </button>
      </div>

      <div className="nv-flip min-h-0 flex-[1.45] px-3 py-2">
        <div className="nv-flip-inner" data-face={flipped ? "back" : "front"}>
          <div className="nv-flip-face">
            <MuscleBody view="front" states={data.states} highlight={highlight} active={picked}
              label={(id) => muscleById(id)?.name_es ?? id}
              onMuscle={(id) => setPicked((p) => (p === id ? null : id))} />
          </div>
          <div className="nv-flip-face nv-flip-face--back">
            <MuscleBody view="back" states={data.states} highlight={highlight} active={picked}
              label={(id) => muscleById(id)?.name_es ?? id}
              onMuscle={(id) => setPicked((p) => (p === id ? null : id))} />
          </div>
        </div>
      </div>

      <div className="flex flex-none flex-wrap items-center gap-x-2 gap-y-0.5 border-t border-line px-3 py-1 text-[10.5px] text-faint">
        <MuscleLegend />
      </div>

      <div className="flex h-8 flex-none items-center gap-2 border-t border-line px-3">
        <span className="text-[12px] font-semibold text-text">{muscle ? muscle.name_es : "Ejercicios"}</span>
        {muscle && <span className="text-[11px] text-faint">{muscle.group}</span>}
        <button type="button" onClick={() => { setPicked(null); setPinned(null); }}
          className={cn("ml-auto text-[11px] text-faint hover:text-text", picked ? "" : "invisible")}>
          quitar filtro
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        <MuscleRows rows={rows} data={data} picked={picked} mode={mode} byId={byId}
          toggle={marcar} onHover={setHovered} onPin={setPinned}
          onVideo={(ex) => void api.exOpenVideo(ex.id).catch(fail)} />
      </div>
    </aside>
  );
}
