// RUTA del plan: qué temas hay que estudiar de verdad para cumplir el objetivo y cuáles se pueden saltar SIN BORRAR NADA.
//
// Módulo PURO y compartido (núcleo, API y renderer): sin node:* ni DOM. Documentado en docs/VAULT_FORMAT.md («Ruta del plan»).
//
// Cada tema del plan tiene `route`: `core` (por defecto, en la ruta) · `optional` (se estudia si hay tiempo) · `skipped` (fuera de ruta).
// Saltar un tema NO lo quita de la vault ni borra notas: el tema se conserva en el plan, atenuado como «fuera de ruta», y se puede
// reactivar. Las cuentas del plan (temas, horas, semanas, capacidad, reparto diario) excluyen los `skipped`; así se libera tiempo para práctica.
// Cuando el estudiante va a NoteVault a estudiar con el Mentor, `mentor_route` le dice exactamente qué temas toca estudiar (los `core`/`optional`
// con su semana objetivo) y cuáles puede saltarse.
//
// «Reducir a lo esencial» (determinista): elige qué saltar según REGLAS (dominado/medido · nivel básico ya declarado · lo cubre la práctica
// diaria del lenguaje · lo menos necesario al final de la ruta) y NUNCA salta un prerrequisito de un tema que se queda.

import type { PlanLevel } from "./planTime.js";

export const TOPIC_ROUTES = ["core", "optional", "skipped"] as const;
export type TopicRoute = (typeof TOPIC_ROUTES)[number];
export const ROUTE_LABEL: Record<TopicRoute, string> = { core: "En la ruta", optional: "Opcional", skipped: "Fuera de ruta" };

export const routeOf = (t: { route?: string }): TopicRoute => ((TOPIC_ROUTES as readonly string[]).includes(String(t.route)) ? (t.route as TopicRoute) : "core");
/** ¿Cuenta en las cuentas, el reparto y la agenda del plan? (todo menos `skipped`) */
export const isLive = (t: { route?: string }): boolean => routeOf(t) !== "skipped";

/** Lectura segura: `core` no se guarda (es el valor por defecto). */
export function sanitizeRouteFields(raw: unknown): { route?: "optional" | "skipped"; skippedReason?: string } {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const route = routeOf({ route: String(o.route ?? "") });
  if (route === "core") return {};
  const reason = String(o.skippedReason ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
  return { route, ...(route === "skipped" && reason ? { skippedReason: reason } : {}) };
}

// ── Prerrequisitos ──────────────────────────────────────────────────────

const fold = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
/** El «tronco» de un título de serie: «Variables 2» y «Variables avanzado» → «variables». */
const stemOf = (title: string): string =>
  fold(title)
    .replace(/^[\d.\s_-]+/, "")
    .replace(/[\s:–-]*(avanzad[oa]s?|advanced|basic[oa]s?|parte\s+\d+|part\s+\d+|\d+|ii|iii|iv|v)\s*$/i, "")
    .trim();

export interface RouteTopic {
  folder: string;
  title: string;
  group?: string;
  /** tipo del grupo (`bases` · `language` · `knowledge`) */
  groupKind?: string;
  estMinutes: number;
  route?: string;
  completedAt?: string;
  pinned?: boolean;
  /** 0..100: progreso real del tema (del vault) */
  pct?: number;
  attempts?: number;
  /** prerrequisitos explícitos (carpetas de otros temas del plan) */
  requires?: readonly string[];
}

/**
 * Prerrequisitos de cada tema (carpeta → carpetas que necesita): los explícitos (`requires`) y los implícitos de una SERIE del mismo grupo
 * («Variables» ← «Variables 2» ← «Variables 3»; «X» ← «X avanzado»). Los temas sin serie no dependen de nadie.
 */
export function prerequisitesOf(topics: readonly RouteTopic[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const known = new Set(topics.map((t) => t.folder));
  const seen = new Map<string, string[]>();
  topics.forEach((t) => {
    const need = new Set<string>((t.requires ?? []).filter((f) => known.has(f) && f !== t.folder));
    const key = `${t.group ?? ""}|${stemOf(t.title)}`;
    if (stemOf(t.title).length >= 3) {
      const prev = seen.get(key);
      if (prev?.length) need.add(prev[prev.length - 1]!);
      seen.set(key, [...(prev ?? []), t.folder]);
    }
    out.set(t.folder, need);
  });
  return out;
}

/** Los temas vivos que quedan dependen (directa o transitivamente) de `folder`? */
function neededByLive(folder: string, prereq: ReadonlyMap<string, Set<string>>, live: ReadonlySet<string>): string | null {
  for (const [f, need] of prereq) {
    if (live.has(f) && f !== folder && need.has(folder)) return f;
  }
  return null;
}

// ── Reducir a lo esencial ───────────────────────────────────────────────

const BASIC_RE = /\b(intro(?:duccion)?|que es|basic[oa]s?|bases?|hola mundo|hello|primeros pasos|instalacion|setup|fundamentos?|conceptos? basicos?)\b/;
const SYNTAX_RE = /\b(sintaxis|variables?|tipos?|operadores?|condicionales?|bucles?|ciclos?|funciones?|cadenas?|strings?|listas?|arrays?|print|input|comentarios?)\b/;

export interface ReduceOptions {
  /** máximo de temas vivos que deben quedar en el alcance */
  max: number;
  /** nivel declarado de la materia: de «básico» en adelante, lo básico se puede saltar */
  level?: PlanLevel;
  /** el plan ya practica el lenguaje cada día: lo que repite su sintaxis se puede saltar */
  languagePractice?: boolean;
}

export interface Skip {
  folder: string;
  reason: string;
}

export interface ReduceResult {
  skip: Skip[];
  /** temas vivos que quedan en el alcance */
  live: number;
  /** temas que no se pudieron saltar por ser prerrequisito de otro que se queda (o por estar completados/fijados) */
  protectedTopics: string[];
  warnings: string[];
}

interface Scored {
  t: RouteTopic;
  pos: number;
  score: number;
  reason: string;
}

/**
 * Elige qué temas SALTAR para que el alcance quede en `max` temas vivos. Determinista. Los completados, fijados y en curso (intentos sin
 * dominio) se quedan; nunca se salta un prerrequisito de un tema que se queda.
 */
export function reduceToEssentials(topics: readonly RouteTopic[], o: ReduceOptions): ReduceResult {
  const max = Math.max(0, Math.round(o.max));
  const live = new Set(topics.filter((t) => isLive(t)).map((t) => t.folder));
  const prereq = prerequisitesOf(topics);
  const basicLevel = o.level === "basico" || o.level === "intermedio" || o.level === "avanzado";
  const n = Math.max(1, topics.length);
  const scored: Scored[] = [];
  topics.forEach((t, pos) => {
    if (!live.has(t.folder) || t.completedAt) return;
    const title = fold(t.title).replace(/^[\d.\s_-]+/, "");
    let score = 0;
    let reason = "Menos necesario para la ruta";
    let best = 0;
    const add = (pts: number, why: string): void => {
      score += pts;
      if (pts > best) {
        best = pts;
        reason = why;
      }
    };
    if ((t.pct ?? 0) >= 70) add(50, `Ya lo dominas (${Math.round(t.pct!)} %)`);
    if (basicLevel && BASIC_RE.test(title)) add(o.level === "basico" ? 20 : 30, `Nivel ${o.level} declarado: lo básico ya lo conoces`);
    if (o.languagePractice && t.groupKind === "bases" && SYNTAX_RE.test(title)) add(25, "Lo cubre la práctica diaria del lenguaje");
    score += (pos / n) * 10; // lo último de la ruta es lo menos necesario
    if ((t.attempts ?? 0) > 0 && (t.pct ?? 0) < 70) score -= 40; // en curso: se queda
    if (t.pinned) score -= 100;
    scored.push({ t, pos, score, reason });
  });
  scored.sort((a, b) => b.score - a.score || b.pos - a.pos);
  const skip: Skip[] = [];
  const protectedTopics: string[] = [];
  const warnings: string[] = [];
  for (const c of scored) {
    if (live.size <= max) break;
    if (c.t.pinned || c.score < -50) continue;
    if (neededByLive(c.t.folder, prereq, live)) {
      protectedTopics.push(c.t.folder);
      continue;
    }
    live.delete(c.t.folder);
    skip.push({ folder: c.t.folder, reason: c.reason });
  }
  if (live.size > max) warnings.push(`No se puede bajar de ${live.size} temas sin saltar prerrequisitos o temas completados o en curso.`);
  return { skip, live: live.size, protectedTopics, warnings };
}

/**
 * Valida una lista de temas a saltar propuesta por la IA o a mano: se descartan los completados, los desconocidos y los que son prerrequisito de
 * un tema que sigue vivo (también contando los que se saltan juntos). Devuelve los admitidos y los rechazados con su motivo.
 */
export function validateSkips(topics: readonly RouteTopic[], proposed: readonly string[]): { ok: string[]; rejected: Skip[] } {
  const byFolder = new Map(topics.map((t) => [t.folder, t]));
  const prereq = prerequisitesOf(topics);
  const want = new Set<string>();
  const rejected: Skip[] = [];
  for (const f of proposed) {
    const t = byFolder.get(f);
    if (!t) rejected.push({ folder: f, reason: "no es un tema del plan" });
    else if (t.completedAt) rejected.push({ folder: f, reason: "ya está completado" });
    else want.add(f);
  }
  let changed = true;
  while (changed) {
    changed = false;
    const liveAfter = new Set(topics.filter((t) => isLive(t) && !want.has(t.folder)).map((t) => t.folder));
    for (const f of [...want]) {
      const dep = neededByLive(f, prereq, liveAfter);
      if (dep) {
        want.delete(f);
        rejected.push({ folder: f, reason: `es prerrequisito de «${byFolder.get(dep)?.title ?? dep}»` });
        changed = true;
      }
    }
  }
  return { ok: [...want], rejected };
}

// ── La ruta de un plan (para `mentor_route`) ────────────────────────────

export interface RouteEntry {
  folder: string;
  title: string;
  route: TopicRoute;
  skippedReason?: string;
  /** semana (1..) del plan en que toca terminarlo */
  targetWeek: number;
  /** AAAA-MM-DD: inicio de esa semana */
  weekStart: string;
  areaId?: string;
  area: string;
  group?: string;
  completedAt?: string;
}

export interface PlanRouteLike {
  id: string;
  name?: string;
  start: string;
  end: string;
  subplans: Array<{ id: string; area: string; areaId?: string; topics: Array<{ folder: string; title: string; route?: string; skippedReason?: string; targetWeek: number; completedAt?: string; group?: string }> }>;
}

/** Los temas de un plan con su ruta y su semana objetivo, en el orden del plan (área por área). */
export function routeOfPlan(plan: PlanRouteLike, weekStartOf: (week: number) => string): RouteEntry[] {
  const out: RouteEntry[] = [];
  for (const s of plan.subplans) {
    for (const t of s.topics) {
      const route = routeOf(t);
      out.push({
        folder: t.folder,
        title: t.title,
        route,
        ...(route === "skipped" && t.skippedReason ? { skippedReason: t.skippedReason } : {}),
        targetWeek: t.targetWeek,
        weekStart: weekStartOf(t.targetWeek),
        ...(s.areaId ? { areaId: s.areaId } : {}),
        area: s.area,
        ...(t.group ? { group: t.group } : {}),
        ...(t.completedAt ? { completedAt: t.completedAt } : {}),
      });
    }
  }
  return out;
}
