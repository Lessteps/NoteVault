/**
 * TEMPORARY · verificación visual del mapeo forma → músculo.
 *
 * No forma parte del sistema de ejercicios: solo dibuja el asset aceptado para
 * poder comprobar a ojo que cada forma tiene su músculo. Se borra cuando el
 * mapeo esté aprobado (una entrada en «Gestionar ejercicios» y este fichero).
 *
 * - Sin el toggle: base gris, y al pasar el ratón se ve «forma → músculo».
 * - Con el toggle: cada músculo con un color distinto, para ver de un vistazo qué
 *   formas van juntas.
 * - Cualquier forma sin músculo asignado se pinta en rojo (hoy: ninguna).
 */
import { useMemo, useState } from "react";
import { Paintbrush, X } from "lucide-react";
import { IconButton } from "../ui";
import { BODY_BACK_VIEWBOX, BODY_FRONT_VIEWBOX, type BodyShape } from "../../lib/bodyAsset";
import {
  MUSCLE_ALIAS, isNonInteractive, muscleColour, musclesWithShapes, shapeMuscle, shapesOf, unassignedShapes,
  type BodyView,
} from "../../lib/bodyMuscleMap";

const SIZE = { front: { w: 300, h: 800 }, back: { w: 300, h: 800 } };

export function MuscleMapDebug({ onClose }: { onClose: () => void }) {
  const [colour, setColour] = useState(false);
  const [hover, setHover] = useState<{ view: BodyView; shape: string; muscle: string | null; x: number; y: number } | null>(null);

  const order = useMemo(() => musclesWithShapes().map((m) => m.id), []);
  const orphans = useMemo(() => unassignedShapes(), []);

  const figure = (view: BodyView) => (
    <div className="flex flex-col gap-1">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-faint">
        {view === "front" ? "Frontal · 40 formas" : "Dorsal · 49 formas"}
      </div>
      <svg viewBox={view === "front" ? BODY_FRONT_VIEWBOX : BODY_BACK_VIEWBOX}
        width={SIZE[view].w} height={SIZE[view].h} className="rounded-xl border border-line bg-card">
        {shapesOf(view).map((s: BodyShape) => {
          const muscle = shapeMuscle(view, s.id);
          const orphan = !muscle && !isNonInteractive(view, s.id);
          const fill = orphan ? "#e5484d"
            : muscle ? (colour ? muscleColour(muscle, order) : "#3a3a48")
              : "#23232c";
          return (
            <path key={s.id} d={s.d} data-shape={s.id} data-muscle-shape={muscle ?? ""}
              fill={fill} stroke={muscle ? "#c9c9d8" : "#5b5b6d"} strokeWidth={0.14} strokeLinejoin="round"
              style={{ cursor: muscle ? "pointer" : "default" }}
              onMouseEnter={muscle ? (e) => setHover({ view, shape: s.id, muscle, x: e.clientX, y: e.clientY }) : undefined}
              onMouseMove={muscle ? (e) => setHover({ view, shape: s.id, muscle, x: e.clientX, y: e.clientY }) : undefined}
              onMouseLeave={muscle ? () => setHover(null) : undefined} />
          );
        })}
      </svg>
    </div>
  );

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }} onMouseDown={onClose}>
      <div role="dialog" aria-label="Verificación del mapeo" onMouseDown={(e) => e.stopPropagation()}
        className="nv-peek flex h-[min(94vh,900px)] w-[min(1200px,96vw)] flex-col overflow-hidden rounded-xl border border-line-strong shadow-2xl"
        style={{ background: "var(--nv-elevated)" }}>

        <div className="flex h-11 flex-none items-center gap-2 border-b border-line px-3">
          <h2 className="text-[14px] font-semibold text-text">Verificación del mapeo</h2>
          <span className="rounded-md px-1.5 py-0.5 text-[10.5px]" style={{ background: "var(--nv-warn-soft)", color: "var(--nv-warn)" }}>temporal</span>
          <span className="text-[12px] text-faint">
            {order.length} músculos dibujados · {Object.keys(MUSCLE_ALIAS).length} sin forma (alias) ·{" "}
            {orphans.length} formas sin músculo
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button type="button" data-debug-toggle onClick={() => setColour((v) => !v)}
              className="flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-[12px] text-dim hover:bg-hover hover:text-text">
              <Paintbrush size={13} /> {colour ? "Quitar colores" : "Colorear por músculo"}
            </button>
            <IconButton title="Cerrar" onClick={onClose}><X size={15} /></IconButton>
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          <div className="flex min-h-0 flex-1 gap-4 overflow-auto p-4">
            {figure("front")}
            {figure("back")}
          </div>

          <div className="flex w-[320px] flex-none flex-col overflow-y-auto border-l border-line p-3 text-[11.5px]">
            <div className="mb-1 font-semibold text-text">Forma bajo el puntero</div>
            <div data-debug-hover className="mb-3 rounded-md border border-line px-2 py-1.5 font-mono text-[11px] text-dim">
              {hover ? `${hover.shape} → ${hover.muscle}` : "pasa el ratón por un músculo"}
            </div>

            <div className="mb-1 font-semibold text-text">Con forma propia · {order.length}</div>
            <div className="mb-3 space-y-0.5">
              {musclesWithShapes().map((m) => (
                <div key={m.id} className="flex items-center gap-2">
                  <span className="h-3 w-3 flex-none rounded-sm border border-line"
                    style={{ background: colour ? muscleColour(m.id, order) : "#3a3a48" }} />
                  <span className="font-mono text-[11px] text-dim">{m.id}</span>
                  <span className="ml-auto text-faint">{m.shapes}</span>
                </div>
              ))}
            </div>

            <div className="mb-1 font-semibold" style={{ color: "var(--nv-warn)" }}>
              Sin forma en el asset · {Object.keys(MUSCLE_ALIAS).length}
            </div>
            <div className="mb-3 space-y-0.5">
              {Object.entries(MUSCLE_ALIAS).map(([gap, target]) => (
                <div key={gap} className="flex items-center gap-2">
                  <span className="font-mono text-[11px]" style={{ color: "var(--nv-warn)" }}>{gap}</span>
                  <span className="text-faint">→</span>
                  <span className="font-mono text-[11px] text-dim">{target}</span>
                </div>
              ))}
            </div>

            <div className="mb-1 font-semibold text-text">Sin músculo (no interactivas)</div>
            <div className="text-faint">
              cabeza, cara, manos, codos, rodillas, pies y la línea de la columna.
            </div>

            {orphans.length > 0 && (
              <div className="mt-3 rounded-md border px-2 py-1.5"
                style={{ borderColor: "var(--nv-danger)", background: "var(--nv-danger-soft)", color: "var(--nv-danger)" }}>
                {orphans.map((o) => `${o.view}: ${o.shape.id}`).join(", ")}
              </div>
            )}
          </div>
        </div>

        {hover && (
          <div data-debug-tip className="pointer-events-none fixed z-50 rounded-md border border-line-strong px-2 py-1 font-mono text-[11.5px] shadow-lg"
            style={{ left: Math.min(hover.x + 14, window.innerWidth - 240), top: hover.y + 14, background: "var(--nv-elevated)", color: "var(--nv-text)" }}>
            {hover.shape} → {hover.muscle}
          </div>
        )}
      </div>
    </div>
  );
}
