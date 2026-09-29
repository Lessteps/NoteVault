/**
 * Muscle map · the body itself.
 *
 * Schematic, flat, thin-outline front and back figures. Every muscle is its own
 * `<path>` carrying `data-muscle="<id>"`, so it can be addressed, coloured and
 * clicked independently. The geometry is deliberately geometric ("legibility
 * over realism"): deltoids and abdominals are clearly separated shapes.
 *
 * Hand-drawn on purpose: no third-party anatomical asset (most are CC-BY-SA),
 * no dependency, and the ids match the project's own catalogue exactly.
 */
import type { MuscleState } from "../../lib/muscles";

export interface MuscleShape {
  id: string;
  d: string;
}

/** Shared silhouette: head, neck, torso+legs in one mass, arms, hands, feet. */
const HEAD = "M110,6 a21,25 0 1,0 0.1,0 z";
const NECK = "M100,48 h20 v28 h-20 z";
const TORSO =
  "M88,74 C74,76 66,84 62,100 L58,142 C56,166 60,190 66,210 L74,224 L78,300 L76,340 L74,424 L104,424 " +
  "L106,340 L108,300 L108,252 C108,242 112,242 112,252 L112,300 L114,340 L116,424 L146,424 L144,340 " +
  "L142,300 L146,224 L154,210 C160,190 164,166 162,142 L158,100 C154,84 146,76 132,74 Z";
const ARM_LEFT = "M76,76 C62,84 56,102 54,122 L48,180 C46,204 46,232 48,252 L62,254 L64,224 L68,180 L72,122 L84,84 Z";
const ARM_RIGHT = "M144,76 C158,84 164,102 166,122 L172,180 C174,204 174,232 172,252 L158,254 L156,224 L152,180 L148,122 L136,84 Z";
const HAND_LEFT = "M46,254 C44,268 48,274 56,274 C62,274 64,268 62,256 Z";
const HAND_RIGHT = "M174,254 C176,268 172,274 164,274 C158,274 156,268 158,256 Z";
const FOOT_LEFT = "M72,424 L104,424 L106,442 L68,442 Z";
const FOOT_RIGHT = "M148,424 L116,424 L114,442 L152,442 Z";

export const SILHOUETTE: string[] = [HEAD, NECK, TORSO, ARM_LEFT, ARM_RIGHT, HAND_LEFT, HAND_RIGHT, FOOT_LEFT, FOOT_RIGHT];

/** Detail strokes (abs segments, spine): drawn, never clickable. */
export const DETAIL: Record<"front" | "back", string[]> = {
  front: ["M98,144 L122,144", "M97,160 L123,160", "M97,176 L123,176", "M110,127 L110,200"],
  back: ["M110,124 L110,204"],
};

export const BODY_FRONT: MuscleShape[] = [
  { id: "neck", d: "M102,50 L118,50 L118,72 L102,72 Z" },
  { id: "deltoid-front", d: "M62,78 C55,86 55,100 62,108 L80,104 L80,84 C76,76 68,74 62,78 Z" },
  { id: "deltoid-front", d: "M158,78 C165,86 165,100 158,108 L140,104 L140,84 C144,76 152,74 158,78 Z" },
  { id: "pectoral", d: "M82,87 C90,81 100,82 106,89 L107,117 C99,123 88,121 82,114 Z" },
  { id: "pectoral", d: "M138,87 C130,81 120,82 114,89 L113,117 C121,123 132,121 138,114 Z" },
  { id: "biceps", d: "M55,118 L73,115 L73,168 L57,170 Z" },
  { id: "biceps", d: "M165,118 L147,115 L147,168 L163,170 Z" },
  { id: "forearm", d: "M48,185 L62,182 L62,248 L48,250 Z" },
  { id: "forearm", d: "M172,185 L158,182 L158,248 L172,250 Z" },
  { id: "abs", d: "M99,127 L121,127 L123,180 L121,200 L110,208 L99,200 L97,180 Z" },
  { id: "obliques", d: "M84,131 L97,127 L97,196 L86,202 L82,168 Z" },
  { id: "obliques", d: "M136,131 L123,127 L123,196 L134,202 L138,168 Z" },
  { id: "quads", d: "M83,236 L103,233 L104,300 L101,336 L85,334 L82,300 Z" },
  { id: "quads", d: "M137,236 L117,233 L116,300 L119,336 L135,334 L138,300 Z" },
  { id: "adductors", d: "M103,240 L108,238 L108,308 L102,320 L99,300 Z" },
  { id: "adductors", d: "M117,240 L112,238 L112,308 L118,320 L121,300 Z" },
];

export const BODY_BACK: MuscleShape[] = [
  { id: "neck", d: "M102,50 L118,50 L118,72 L102,72 Z" },
  { id: "trapezius", d: "M110,74 L92,88 L100,114 L110,121 L120,114 L128,88 Z" },
  { id: "deltoid-rear", d: "M62,78 C55,86 55,100 62,108 L80,104 L80,84 C76,76 68,74 62,78 Z" },
  { id: "deltoid-rear", d: "M158,78 C165,86 165,100 158,108 L140,104 L140,84 C144,76 152,74 158,78 Z" },
  { id: "triceps", d: "M55,118 L73,115 L73,168 L57,170 Z" },
  { id: "triceps", d: "M165,118 L147,115 L147,168 L163,170 Z" },
  { id: "lats", d: "M84,102 L97,112 L99,158 L86,176 L78,138 Z" },
  { id: "lats", d: "M136,102 L123,112 L121,158 L134,176 L142,138 Z" },
  { id: "lower-back", d: "M100,160 L120,160 L122,194 L110,203 L98,194 Z" },
  { id: "glutes", d: "M85,206 C92,199 105,199 108,207 L108,236 L85,238 Z" },
  { id: "glutes", d: "M135,206 C128,199 115,199 112,207 L112,236 L135,238 Z" },
  { id: "abductors", d: "M75,212 L85,208 L87,252 L78,264 L72,236 Z" },
  { id: "abductors", d: "M145,212 L135,208 L133,252 L142,264 L148,236 Z" },
  { id: "hamstrings", d: "M84,244 L104,241 L104,308 L88,332 L83,302 Z" },
  { id: "hamstrings", d: "M136,244 L116,241 L116,308 L132,332 L137,302 Z" },
  { id: "calves", d: "M83,340 L101,337 L103,384 L92,404 L83,386 Z" },
  { id: "calves", d: "M137,340 L119,337 L117,384 L128,404 L137,386 Z" },
];

export function bodyShapes(view: "front" | "back"): MuscleShape[] {
  return view === "front" ? BODY_FRONT : BODY_BACK;
}

/** Every muscle id the drawing can paint (used by tests). */
export function bodyMuscleIds(): string[] {
  return [...new Set([...BODY_FRONT, ...BODY_BACK].map((s) => s.id))].sort();
}

export function MuscleBody({ view, states, highlight, active, onMuscle, onHover, label }: {
  view: "front" | "back";
  states: Record<string, MuscleState>;
  /** When given, only these muscles stay bright: the rest fades back. */
  highlight?: Set<string> | null;
  /** The muscle currently open in the panel. */
  active?: string | null;
  onMuscle?: (id: string) => void;
  onHover?: (id: string | null) => void;
  /** Spanish name for each id, for the accessible label. */
  label: (id: string) => string;
}) {
  const shapes = bodyShapes(view);
  return (
    <svg viewBox="0 0 220 470" className="nv-body" role="img" aria-label={`Cuerpo ${view === "front" ? "anterior" : "posterior"}`}>
      {SILHOUETTE.map((d, i) => <path key={`sil${i}`} d={d} className="nv-body-sil" />)}
      {DETAIL[view].map((d, i) => <path key={`det${i}`} d={d} className="nv-body-detail" />)}
      {shapes.map((s, i) => {
        const state = states[s.id] ?? "idle";
        const dim = highlight ? !highlight.has(s.id) : false;
        return (
          <path key={`${s.id}-${i}`} d={s.d} data-muscle={s.id}
            className={`nv-muscle nv-muscle--${state}${dim ? " is-dim" : ""}${active === s.id ? " is-active" : ""}`}
            onClick={onMuscle ? () => onMuscle(s.id) : undefined}
            onMouseEnter={onHover ? () => onHover(s.id) : undefined}
            onMouseLeave={onHover ? () => onHover(null) : undefined}>
            <title>{`${label(s.id)}${state === "done" ? " · hecho" : ""}`}</title>
          </path>
        );
      })}
    </svg>
  );
}
