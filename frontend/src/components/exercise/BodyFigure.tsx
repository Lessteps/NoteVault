/**
 * The body figure: the accepted asset, painted by muscle.
 *
 * Geometry comes straight from `lib/bodyAsset.ts` (89 addressable shapes) and the
 * muscle each shape belongs to from `lib/bodyMuscleMap.ts`. Nothing is drawn here,
 * so the figure can never drift from the asset that was reviewed.
 *
 * Look (following the reference): dark body, hairline light separations, and the
 * day's muscles lit in the module's orange. Head, hands, feet and joints stay in
 * the base tone and never react to the pointer.
 */
import { cn } from "../ui";
import { BODY_BACK_VIEWBOX, BODY_FRONT_VIEWBOX } from "../../lib/bodyAsset";
import { isNonInteractive, shapeMuscle, shapesOf, type BodyView } from "../../lib/bodyMuscleMap";
import type { MuscleState } from "../../lib/muscles";

/** The aspect of the asset's own figures (35 × 93 units). */
const ASPECT = 93 / 35;

export interface BodyFigureProps {
  view: BodyView;
  /** State per muscle id (granular ids). Missing = idle. */
  states?: Record<string, MuscleState>;
  /** When set, only these muscles stay bright; the rest dim. */
  highlight?: Set<string> | null;
  /** The clicked muscle, drawn with a brighter outline. */
  active?: string | null;
  /** Handle the figure's own pointer events (theme figures are display-only). */
  interactive?: boolean;
  onMuscle?: (id: string) => void;
  onHover?: (id: string | null, at?: { x: number; y: number }) => void;
  label?: (id: string) => string;
  /** Rendered width in px; the height follows the asset's aspect. */
  width?: number;
  /** "width" fixes the width; "height" fills the parent box and keeps the aspect. */
  fit?: "width" | "height";
  /** Hairline weight, in viewBox units. */
  strokeWidth?: number;
  className?: string;
  /** Caption drawn over the frame, e.g. "VISTA ANTERIOR". */
  caption?: string;
}

export function BodyFigure({
  view, states, highlight, active, interactive = true, onMuscle, onHover, label,
  width = 300, fit = "width", strokeWidth = 0.14, className, caption,
}: BodyFigureProps) {
  const svg = (
    <svg viewBox={view === "front" ? BODY_FRONT_VIEWBOX : BODY_BACK_VIEWBOX}
      {...(fit === "height"
        ? { className: "nv-body" }
        : { width, height: Math.round(width * ASPECT) })}
      role="img"
      aria-label={view === "front" ? "Cuerpo, vista anterior" : "Cuerpo, vista posterior"}>
      {shapesOf(view).map((shape) => {
        const muscle = shapeMuscle(view, shape.id);
        const dim = Boolean(highlight && muscle && !highlight.has(muscle));
        const state: MuscleState = (muscle && states?.[muscle]) || "idle";
        return (
          <path key={shape.id} d={shape.d}
            data-muscle={muscle ?? undefined}
            data-shape={shape.id}
            data-state={muscle ? state : undefined}
            className={cn(
              muscle ? `nv-muscle nv-muscle--${state}` : "nv-body-detail",
              dim && "is-dim",
              muscle && active === muscle && "is-active",
              muscle && interactive && "cursor-pointer",
            )}
            strokeWidth={strokeWidth}
            /* Sin músculo no hay puntero: la cabeza o los pies no reaccionan. */
            style={muscle ? undefined : { pointerEvents: "none" }}
            onClick={muscle && interactive ? () => onMuscle?.(muscle) : undefined}
            onMouseEnter={muscle && interactive ? (e) => onHover?.(muscle, { x: e.clientX, y: e.clientY }) : undefined}
            onMouseMove={muscle && interactive ? (e) => onHover?.(muscle, { x: e.clientX, y: e.clientY }) : undefined}
            onMouseLeave={muscle && interactive ? () => onHover?.(null) : undefined}>
            {muscle && !interactive && label ? <title>{label(muscle)}</title> : null}
          </path>
        );
      })}
    </svg>
  );
  const cap = caption && (
    <span className="pointer-events-none absolute bottom-1 left-1/2 -translate-x-1/2 text-[9px] uppercase tracking-[0.14em] text-faint">
      {caption}
    </span>
  );
  if (fit === "height") {
    return <div className={cn("relative flex h-full flex-col items-center", className)}>{svg}{cap}</div>;
  }
  return <div className={cn("relative flex flex-col items-center", className)} style={{ width }}>{svg}{cap}</div>;
}

/** Front + back side by side, both display-only (the general view's card). */
export function BodyPair({
  states, highlight, width = 118, gap = 8, caption = true,
}: {
  states?: Record<string, MuscleState>;
  highlight?: Set<string> | null;
  width?: number;
  gap?: number;
  caption?: boolean;
}) {
  return (
    <div className="flex items-start justify-center" style={{ gap }}>
      <BodyFigure view="front" states={states} highlight={highlight} width={width} strokeWidth={0.2}
        interactive={false} caption={caption ? "Vista anterior" : undefined} />
      <BodyFigure view="back" states={states} highlight={highlight} width={width} strokeWidth={0.2}
        interactive={false} caption={caption ? "Vista posterior" : undefined} />
    </div>
  );
}

export { isNonInteractive };
