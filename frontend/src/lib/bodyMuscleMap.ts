/**
 * Shape → muscle for the accepted body asset.
 *
 * The asset ships 89 shapes (40 front, 49 back). Many shapes belong to one
 * muscle (left/right halves, heads, sub-parts), so the mapping is many-to-one and
 * never invents geometry. Head, face, hands, feet and joints are declared
 * non-interactive: base grey, never coloured, never hovered.
 *
 * Muscle ids are the ones from the project's own catalogue; the ids that have no
 * shape in the asset are declared in MUSCLE_ALIAS, pointing at the shape an
 * exercise should light up instead (a declared compromise, not a new shape).
 */
import { BODY_BACK_SHAPES, BODY_FRONT_SHAPES, type BodyShape } from "./bodyAsset";

export type BodyView = "front" | "back";

/** Never coloured, never hovered: not muscles. */
export const NON_INTERACTIVE: Record<BodyView, string[]> = {
  front: [
    "head", "face",
    "hand-left", "hand-right", "elbow-left", "elbow-right",
    "knee-left", "knee-right", "foot-left", "foot-right",
  ],
  back: [
    "head-back", "spine",
    "hand-back-left", "hand-back-right",
    "knee-back-left", "knee-back-right",
    "foot-back-left", "foot-back-right",
  ],
};

/**
 * shape id → muscle id. One shape belongs to exactly one muscle; a muscle may own
 * many shapes. Upstream names are kept verbatim so the mapping can be audited
 * against the asset.
 */
export const SHAPE_MUSCLE: Record<BodyView, Record<string, string>> = {
  front: {
    "neck-left": "neck",
    "neck-right": "neck",
    "shoulder-front-left": "deltoid-front",
    "shoulder-front-right": "deltoid-front",
    "shoulder-side-left": "deltoid-side",
    "shoulder-side-right": "deltoid-side",
    "chest-upper-left": "pectoral-upper",
    "chest-upper-right": "pectoral-upper",
    "chest-lower-left": "pectoral-lower",
    "chest-lower-right": "pectoral-lower",
    "biceps-left": "biceps",
    "biceps-right": "biceps",
    // The front figure draws one forearm shape per side; anatomically the visible
    // side is the flexor group (the extensors live on the back figure).
    "forearm-left": "forearm-flexors",
    "forearm-right": "forearm-flexors",
    "abs-upper-left": "abs-upper",
    "abs-upper-right": "abs-upper",
    "abs-lower-left": "abs-lower",
    "abs-lower-right": "abs-lower",
    "serratus-anterior-left": "serratus",
    "serratus-anterior-right": "serratus",
    "obliques-left": "obliques",
    "obliques-right": "obliques",
    "hip-flexor-left": "hip-flexors",
    "hip-flexor-right": "hip-flexors",
    // One shape per side covers the whole quadriceps: the rectus femoris is the
    // representative id, the vasti are declared as aliases.
    "quads-left": "quads-rectus-femoris",
    "quads-right": "quads-rectus-femoris",
    "adductors-left": "adductors",
    "adductors-right": "adductors",
    "tibialis-anterior-left": "tibialis",
    "tibialis-anterior-right": "tibialis",
  },
  back: {
    // The nape sits over the upper trapezius in this figure.
    "nape": "trapezius-upper",
    "traps-upper-left": "trapezius-upper",
    "traps-upper-right": "trapezius-upper",
    "traps-mid-left": "trapezius-mid",
    "traps-mid-right": "trapezius-mid",
    "traps-lower-left": "trapezius-lower",
    "traps-lower-right": "trapezius-lower",
    "deltoid-rear-left": "deltoid-rear",
    "deltoid-rear-right": "deltoid-rear",
    "triceps-long-left": "triceps",
    "triceps-long-right": "triceps",
    "triceps-lateral-left": "triceps",
    "triceps-lateral-right": "triceps",
    "forearm-flexors-left": "forearm-flexors",
    "forearm-flexors-right": "forearm-flexors",
    "forearm-extensors-left": "forearm-extensors",
    "forearm-extensors-right": "forearm-extensors",
    "lats-upper-left": "lats",
    "lats-upper-right": "lats",
    "lats-mid-left": "lats",
    "lats-mid-right": "lats",
    "lats-lower-left": "lats",
    "lats-lower-right": "lats",
    "lower-back-erectors-left": "lower-back",
    "lower-back-erectors-right": "lower-back",
    "lower-back-ql-left": "lower-back",
    "lower-back-ql-right": "lower-back",
    "gluteus-maximus-left": "glutes-max",
    "gluteus-maximus-right": "glutes-max",
    "gluteus-medius-left": "glutes-med",
    "gluteus-medius-right": "glutes-med",
    // "Lateral Hamstrings (Biceps)" / "… (Medial)" in the asset's own names.
    "hamstrings-lateral-left": "hamstrings-biceps-femris",
    "hamstrings-lateral-right": "hamstrings-biceps-femris",
    "hamstrings-medial-left": "hamstrings-semi",
    "hamstrings-medial-right": "hamstrings-semi",
    "calves-gastroc-lateral-left": "calves-gastrocnemius",
    "calves-gastroc-lateral-right": "calves-gastrocnemius",
    "calves-gastroc-medial-left": "calves-gastrocnemius",
    "calves-gastroc-medial-right": "calves-gastrocnemius",
    "calves-soleus-left": "soleus",
    "calves-soleus-right": "soleus",
  },
};

/**
 * Muscle ids **del catálogo** con no forma propia. Se declara por qué se enciende
 * otra: es un compromiso dicho, no un fallo silencioso.
 *
 * Ojo al vocabulario: estas claves vienen de `primaryMuscle` del catálogo, no de
 * `muscles.ts`. Para los músculos que tú eliges en el selector, el puente es
 * `LEGACY_TO_GRANULAR` en `muscles.ts`, que es lo que usa el mapa.
 */
export const MUSCLE_ALIAS: Record<string, string> = {
  "brachialis": "biceps",              // sits under the biceps in this figure
  "quads-vastus-lateralis": "quads-rectus-femoris",
  "quads-vastus-medialis": "quads-rectus-femoris",
  "calves-front": "tibialis",          // anterior lower leg
  "rotator-cuff": "deltoid-rear",      // nearest shape drawn
  "teres": "lats",                     // nearest shape drawn
};

const FRONT_IDS = new Set(BODY_FRONT_SHAPES.map((s) => s.id));
const BACK_IDS = new Set(BODY_BACK_SHAPES.map((s) => s.id));

export function shapesOf(view: BodyView): BodyShape[] {
  return view === "front" ? BODY_FRONT_SHAPES : BODY_BACK_SHAPES;
}

/** The muscle a shape paints, or null when it is declared non-interactive. */
export function shapeMuscle(view: BodyView, shapeId: string): string | null {
  if (NON_INTERACTIVE[view].includes(shapeId)) return null;
  return SHAPE_MUSCLE[view][shapeId] ?? null;
}

export function isNonInteractive(view: BodyView, shapeId: string): boolean {
  return NON_INTERACTIVE[view].includes(shapeId);
}

/** Every shape that paints a muscle (both views, or one). */
export function shapesForMuscle(muscleId: string, view?: BodyView): Array<{ view: BodyView; shape: BodyShape }> {
  const views: BodyView[] = view ? [view] : ["front", "back"];
  const out: Array<{ view: BodyView; shape: BodyShape }> = [];
  for (const v of views) {
    for (const shape of shapesOf(v)) {
      if (SHAPE_MUSCLE[v][shape.id] === muscleId) out.push({ view: v, shape });
    }
  }
  return out;
}

/** Shapes that are neither non-interactive nor assigned: must stay empty. */
export function unassignedShapes(): Array<{ view: BodyView; shape: BodyShape }> {
  const out: Array<{ view: BodyView; shape: BodyShape }> = [];
  for (const view of ["front", "back"] as BodyView[]) {
    for (const shape of shapesOf(view)) {
      if (isNonInteractive(view, shape.id)) continue;
      if (!SHAPE_MUSCLE[view][shape.id]) out.push({ view, shape });
    }
  }
  return out;
}

/** Muscle ids the asset can paint, with how many shapes each owns. */
export function musclesWithShapes(): Array<{ id: string; shapes: number }> {
  const count = new Map<string, number>();
  for (const view of ["front", "back"] as BodyView[]) {
    for (const id of Object.values(SHAPE_MUSCLE[view])) {
      count.set(id, (count.get(id) ?? 0) + 1);
    }
  }
  return [...count.entries()].map(([id, shapes]) => ({ id, shapes })).sort((a, b) => a.id.localeCompare(b.id));
}

/** Distinct colour per muscle, stable across renders (golden-angle hues). */
export function muscleColour(muscleId: string, order: string[]): string {
  const i = Math.max(0, order.indexOf(muscleId));
  return `hsl(${Math.round((i * 137.508) % 360)} 62% 58%)`;
}

/** Sanity check used by the debug view and the tests. */
export function mappingProblems(): string[] {
  const problems: string[] = [];
  for (const view of ["front", "back"] as BodyView[]) {
    for (const id of Object.keys(SHAPE_MUSCLE[view])) {
      if (!(view === "front" ? FRONT_IDS : BACK_IDS).has(id)) problems.push(`${view}: unknown shape "${id}"`);
      if (isNonInteractive(view, id)) problems.push(`${view}: "${id}" is both mapped and non-interactive`);
    }
  }
  for (const shape of unassignedShapes()) problems.push(`${shape.view}: "${shape.shape.id}" has no muscle`);
  return problems;
}
