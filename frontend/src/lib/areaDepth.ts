// PROFUNDIDAD de un área: ¿sus temas son piezas o capítulos enteros? Es la regla que faltaba: la metodología solo vigilaba HTML y CSS, y Backend, Automation, Tooling o los
// lenguajes se quedaron con un tema por capítulo sin que la app dijera nada. Aquí el LÍMITE es un dato (abajo), no una opinión: un capítulo es «grueso» si no tiene
// el mínimo de piezas y dura lo bastante como para tener varias cosas dentro. Puro: sin disco ni red.

import { compareKeys, numberKey } from "./planOrganize.js";

/** Piezas mínimas que debe tener un capítulo para darlo por desglosado (`N.M` → `N.M.1 … N.M.3`). */
export const MIN_PIECES_PER_CHAPTER = 3;
/** Un capítulo que dura menos que esto ya es una sola cosa: no hace falta desglosarlo. */
export const COARSE_MIN_MINUTES = 60;
/** Áreas (id) cuya práctica no es por temas atómicos (katas de lógica): no se les exige desglose. */
const EXEMPT_AREAS: ReadonlySet<string> = new Set(["logic"]);

export interface DepthTopic {
  folder: string;
  title: string;
  estMinutes: number;
  group?: string;
  route?: string;
}

export interface DepthSubplan {
  id: string;
  area: string;
  areaId?: string;
  groups?: ReadonlyArray<{ id: string; title: string; kind?: string }>;
  topics: ReadonlyArray<DepthTopic>;
}

export interface CoarseChapter {
  folder: string;
  title: string;
  estMinutes: number;
  /** piezas que ya tiene (temas con su número como prefijo) */
  pieces: number;
}

export interface DepthGap {
  subplanId: string;
  areaId: string;
  area: string;
  groupId: string;
  groupTitle: string;
  groupKind: string;
  /** capítulos del grupo (los temas de menor profundidad numérica) */
  chapters: number;
  /** los que aún no tienen las piezas mínimas */
  coarse: CoarseChapter[];
  /** piezas que faltan como mínimo para cumplir el estándar */
  missingPieces: number;
}

const isPrefix = (p: readonly number[], k: readonly number[]): boolean => k.length > p.length && p.every((n, i) => k[i] === n);

/** Los capítulos del grupo son los temas de menor profundidad numérica; las piezas, los más profundos que cuelgan de uno. */
export function coarseChaptersOf(topics: ReadonlyArray<DepthTopic>): { chapters: number; coarse: CoarseChapter[] } {
  // lo omitido y lo opcional (los temas genéricos antiguos que ya sustituyen las piezas) no se exigen
  const live = topics.filter((t) => t.route !== "skipped" && t.route !== "optional");
  const keyed = live.map((t) => ({ t, k: numberKey(t.folder) })).filter((x): x is { t: DepthTopic; k: number[] } => !!x.k);
  if (!keyed.length) return { chapters: 0, coarse: [] };
  const depth = Math.min(...keyed.map((x) => x.k.length));
  const chapters = keyed.filter((x) => x.k.length === depth).sort((a, b) => compareKeys(a.k, b.k));
  const coarse: CoarseChapter[] = [];
  for (const c of chapters) {
    const pieces = keyed.filter((x) => isPrefix(c.k, x.k)).length;
    if (pieces < MIN_PIECES_PER_CHAPTER && c.t.estMinutes >= COARSE_MIN_MINUTES) coarse.push({ folder: c.t.folder, title: c.t.title, estMinutes: c.t.estMinutes, pieces });
  }
  return { chapters: chapters.length, coarse };
}

/** Los grupos de cada área que tienen capítulos gruesos, del más grueso al menos. Las áreas de referencia (HTML, CSS…) ya son atómicas y salen limpias. */
export function depthGaps(subplans: ReadonlyArray<DepthSubplan>): DepthGap[] {
  const out: DepthGap[] = [];
  for (const s of subplans) {
    if (s.areaId && EXEMPT_AREAS.has(s.areaId)) continue;
    const groups = s.groups?.length ? s.groups : [{ id: "", title: s.area, kind: "knowledge" }];
    for (const g of groups) {
      const mine = s.topics.filter((t) => (g.id ? (t.group ?? "core") === g.id : true));
      const { chapters, coarse } = coarseChaptersOf(mine);
      if (!coarse.length) continue;
      out.push({
        subplanId: s.id,
        areaId: s.areaId ?? "",
        area: s.area,
        groupId: g.id,
        groupTitle: g.title,
        groupKind: (g as { kind?: string }).kind ?? "knowledge",
        chapters,
        coarse,
        missingPieces: coarse.reduce((n, c) => n + (MIN_PIECES_PER_CHAPTER - c.pieces), 0),
      });
    }
  }
  return out.sort((a, b) => b.coarse.length - a.coarse.length);
}
