/**
 * Enlaces submeta -> sistema «Programming practice» (`practice_links` de GoalItem).
 *
 * Cadena de un enlace (una entrada de la lista `practice_links`, separada por comas en el
 * frontmatter, igual que `topic_links` y `habit_links`):
 *
 *   kata:daily                     kata diario; objetivo por defecto: 5 días con intento por semana
 *   kata:daily#week=N              N días con intento en la semana actual (lun-dom), 1..7
 *   kata:daily#streak=N            racha actual de N días seguidos con intento, 1..365
 *   project:weekly                 proyecto de práctica de la semana actual (lun-dom)
 *   project:monthly                proyecto de práctica del mes natural actual
 *   project:weekly#backend         igual, pero solo proyectos de ese foco
 *                                  (backend, databases, frontend, desktop, mobile, automation)
 *   project:folder:<carpeta>       un proyecto concreto por la carpeta de `projects/<carpeta>`
 *
 * En `<carpeta>` se escapan `%`, `,` y `#` como `%25`, `%2C` y `%23` (la lista se separa por comas).
 * No hay enlace `skill`: en `programming_practice` las «skills» (`pp_build`, `pp_defend`...) son
 * instrucciones de la IA, no habilidades del alumno; la habilidad del kata se mide con `kata`.
 *
 * CUMPLIMIENTO (derivado, nunca guardado; se pasa un `PracticeLookup` como el `TopicLookup` de los temas):
 *  - kata (sin objetivo o `week=N`): días distintos con algún intento `pp_kata` entre el lunes de esta
 *    semana y hoy, entre N (5 por defecto). Cumplido al llegar a N.
 *  - kata `streak=N`: racha actual (días consecutivos con intento acabando hoy; si hoy aún no hay intento,
 *    acabando ayer) entre N. Cumplido al llegar a N.
 *  - proyecto semanal/mensual: de los proyectos cuya fecha (creación de la carpeta, o de la especificación)
 *    cae en el periodo, y con el foco pedido si lo hay, se toma el más avanzado. Su avance es
 *    (fases hechas + media por cada fase en curso) / 4 con las cuatro fases de `phasesOfProject`
 *    (especificación, construcción, defensa, postmortem). Cumplido solo con el proyecto terminado
 *    (`state: done`). Sin proyecto en el periodo: 0 %.
 *  - proyecto por carpeta: igual, sobre ese proyecto (sin límite de fecha). Si ya no existe, el enlace
 *    está «roto» (como un tema borrado): no cumple y no da error.
 *  - Sin módulo `programming_practice` en la vault (lookup nulo o `ready: false`) todos los enlaces se
 *    marcan `noData` («sin datos de práctica»): 0 %, sin cumplir, sin lanzar.
 *
 * Este módulo no toca disco: quien llama aporta los datos mediante `PracticeLookup`.
 * El renderer no puede importar `core/`: `lib/practiceLinks.ts` espeja parse/format.
 */

import { addDays, todayIso } from "../dates.js";
import { phasesOfProject } from "../mentor/practiceState.js";

export const PRACTICE_FOCUS_IDS = ["backend", "databases", "frontend", "desktop", "mobile", "automation"] as const;

export const KATA_DEFAULT_WEEK_TARGET = 5;

export type PracticeLink =
  | { kind: "kata"; week?: number; streak?: number }
  | { kind: "project"; scope: "weekly" | "monthly"; focus?: string }
  | { kind: "project"; scope: "folder"; folder: string };

/** Datos del módulo de práctica que necesita el cumplimiento (estructural: sin importar tipos de la API). */
export interface PracticeProjectLike {
  folder: string;
  title: string;
  state: "spec" | "building" | "defended" | "done";
  /** AAAA-MM-DD */
  date: string;
  graded: boolean;
  focus?: string;
}
export interface PracticeData {
  /** existe el módulo `programming_practice` en la vault */
  ready: boolean;
  /** fechas AAAA-MM-DD con algún intento del kata diario */
  kataDates: ReadonlySet<string>;
  projects: readonly PracticeProjectLike[];
}
export type PracticeLookup = () => PracticeData | null;

export interface PracticeLinkItemProgress {
  link: string;
  kind: "kata" | "project";
  /** texto corto para el chip */
  label: string;
  /** qué falta o cómo va, p. ej. «3 de 5 días esta semana» */
  detail: string;
  /** el módulo de práctica no existe en la vault */
  noData: boolean;
  /** enlace a un proyecto concreto que ya no existe */
  broken: boolean;
  done: boolean;
  /** 0..100 */
  pct: number;
}

export interface PracticeLinkProgress {
  /** true solo si hay enlaces y todos están cumplidos */
  done: boolean;
  /** media de los enlaces, 0..100 */
  pct: number;
  links: PracticeLinkItemProgress[];
  /** ningún enlace pudo evaluarse porque no hay módulo de práctica */
  noData: boolean;
}

const escapePath = (p: string): string => p.replace(/%/g, "%25").replace(/,/g, "%2C").replace(/#/g, "%23");
const unescapePath = (p: string): string => p.replace(/%2C/gi, ",").replace(/%23/g, "#").replace(/%25/g, "%");
const intIn = (s: string, lo: number, hi: number): number | null => {
  if (!/^\d{1,4}$/.test(s)) return null;
  const n = Number(s);
  return n >= lo && n <= hi ? n : null;
};

export function parsePracticeLink(raw: unknown): PracticeLink | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const hash = text.indexOf("#");
  const head = (hash === -1 ? text : text.slice(0, hash)).trim();
  const tail = hash === -1 ? "" : text.slice(hash + 1).trim();
  const colon = head.indexOf(":");
  if (colon < 0) return null;
  const kind = head.slice(0, colon).toLowerCase();
  const rest = head.slice(colon + 1).trim();

  if (kind === "kata") {
    if (rest.toLowerCase() !== "daily") return null;
    const m = /^(week|streak)=(\d+)$/i.exec(tail);
    if (!m) return tail ? null : { kind: "kata" };
    if (m[1]!.toLowerCase() === "week") {
      const n = intIn(m[2]!, 1, 7);
      return n === null ? null : { kind: "kata", week: n };
    }
    const n = intIn(m[2]!, 1, 365);
    return n === null ? null : { kind: "kata", streak: n };
  }
  if (kind === "project") {
    const lower = rest.toLowerCase();
    if (lower === "weekly" || lower === "monthly") {
      const focus = tail.toLowerCase();
      if (focus && !(PRACTICE_FOCUS_IDS as readonly string[]).includes(focus)) return null;
      return { kind: "project", scope: lower, ...(focus ? { focus } : {}) };
    }
    if (lower.startsWith("folder:")) {
      if (hash !== -1) return null;
      const folder = unescapePath(rest.slice("folder:".length)).replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
      return folder ? { kind: "project", scope: "folder", folder } : null;
    }
  }
  return null;
}

export function formatPracticeLink(link: PracticeLink): string {
  if (link.kind === "kata") {
    if (link.streak) return `kata:daily#streak=${link.streak}`;
    if (link.week) return `kata:daily#week=${link.week}`;
    return "kata:daily";
  }
  if (link.scope === "folder") return `project:folder:${escapePath(link.folder.replace(/\\/g, "/").replace(/^\/+|\/+$/g, ""))}`;
  return `project:${link.scope}${link.focus ? `#${link.focus}` : ""}`;
}

/** Cadenas válidas, normalizadas y sin repetidos. Las no reconocidas se descartan. */
export function normalizePracticeLinks(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : String(raw ?? "").split(",");
  const out: string[] = [];
  for (const entry of list) {
    const parsed = parsePracticeLink(entry);
    if (!parsed) continue;
    const s = formatPracticeLink(parsed);
    if (!out.includes(s)) out.push(s);
  }
  return out;
}

/** Texto legible de un enlace (también para enlaces sin datos). */
export function practiceLinkLabel(link: PracticeLink): string {
  if (link.kind === "kata") {
    if (link.streak) return `Kata diario · racha de ${link.streak}`;
    return `Kata diario · ${link.week ?? KATA_DEFAULT_WEEK_TARGET} días/semana`;
  }
  if (link.scope === "folder") return `Proyecto ${link.folder.split("/").pop()}`;
  const per = link.scope === "weekly" ? "semanal" : "mensual";
  return `Proyecto ${per}${link.focus ? ` · ${link.focus}` : ""}`;
}

// ── Cumplimiento ───────────────────────────────────────────────────────

const weekStart = (d: Date): Date => addDays(d, -((d.getDay() + 6) % 7));

function kataProgress(link: Extract<PracticeLink, { kind: "kata" }>, data: PracticeData, today: Date): Pick<PracticeLinkItemProgress, "pct" | "done" | "detail"> {
  if (link.streak) {
    let streak = 0;
    let d = data.kataDates.has(todayIso(today)) ? today : addDays(today, -1);
    while (data.kataDates.has(todayIso(d)) && streak < 3650) {
      streak += 1;
      d = addDays(d, -1);
    }
    const n = link.streak;
    return { pct: Math.round((Math.min(streak, n) / n) * 100), done: streak >= n, detail: `racha de ${streak} de ${n} días` };
  }
  const target = link.week ?? KATA_DEFAULT_WEEK_TARGET;
  let days = 0;
  for (let d = weekStart(today); d.getTime() <= today.getTime(); d = addDays(d, 1)) if (data.kataDates.has(todayIso(d))) days += 1;
  return { pct: Math.round((Math.min(days, target) / target) * 100), done: days >= target, detail: `${days} de ${target} días esta semana` };
}

/** Avance 0..1 de un proyecto según sus cuatro fases (hecha = 1, en curso = 0,5). */
function projectScore(p: PracticeProjectLike): number {
  const ph = Object.values(phasesOfProject(p));
  return ph.reduce((a, s) => a + (s === "hecho" ? 1 : s === "en_curso" ? 0.5 : 0), 0) / ph.length;
}

function projectProgress(link: Extract<PracticeLink, { kind: "project" }>, data: PracticeData, today: Date): Pick<PracticeLinkItemProgress, "pct" | "done" | "detail" | "broken"> {
  let pool: readonly PracticeProjectLike[];
  if (link.scope === "folder") {
    pool = data.projects.filter((p) => p.folder === link.folder);
    if (!pool.length) return { pct: 0, done: false, broken: true, detail: "el proyecto ya no existe (enlace roto)" };
  } else {
    const first = link.scope === "weekly" ? todayIso(weekStart(today)) : todayIso(new Date(today.getFullYear(), today.getMonth(), 1));
    const last = link.scope === "weekly" ? todayIso(addDays(weekStart(today), 6)) : todayIso(new Date(today.getFullYear(), today.getMonth() + 1, 0));
    pool = data.projects.filter((p) => p.date >= first && p.date <= last && (!link.focus || p.focus === link.focus));
    if (!pool.length) return { pct: 0, done: false, broken: false, detail: link.scope === "weekly" ? "sin proyecto esta semana" : "sin proyecto este mes" };
  }
  const best = [...pool].sort((a, b) => projectScore(b) - projectScore(a) || b.date.localeCompare(a.date))[0]!;
  const phases = phasesOfProject(best);
  const donePhases = Object.values(phases).filter((s) => s === "hecho").length;
  return { pct: Math.round(projectScore(best) * 100), done: best.state === "done", broken: false, detail: `${best.title}: ${donePhases} de 4 fases` };
}

/** Cumplimiento de una lista de enlaces de práctica (nunca lanza). `today` por defecto es hoy. */
export function practiceLinkProgress(links: readonly string[], lookup: PracticeLookup, today: Date = new Date()): PracticeLinkProgress {
  const day = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let data: PracticeData | null = null;
  try {
    data = lookup();
  } catch {
    data = null;
  }
  const usable = data && data.ready ? data : null;
  const items: PracticeLinkItemProgress[] = [];
  for (const raw of links) {
    const parsed = parsePracticeLink(raw);
    if (!parsed) continue;
    const base = { link: String(raw), kind: parsed.kind, label: practiceLinkLabel(parsed) } as const;
    if (!usable) {
      items.push({ ...base, detail: "sin datos de práctica", noData: true, broken: false, done: false, pct: 0 });
      continue;
    }
    if (parsed.kind === "kata") items.push({ ...base, ...kataProgress(parsed, usable, day), noData: false, broken: false });
    else items.push({ ...base, ...projectProgress(parsed, usable, day), noData: false });
  }
  return {
    done: items.length > 0 && items.every((i) => i.done),
    pct: items.length ? Math.round(items.reduce((a, i) => a + i.pct, 0) / items.length) : 0,
    links: items,
    noData: items.length > 0 && items.every((i) => i.noData),
  };
}

/**
 * Regla de avance combinado de una submeta con enlaces a temas y a práctica: cada ENLACE pesa lo mismo.
 * El grupo de temas ya agrega sus enlaces por unidades (skills/examen), así que pesa tantos enlaces como tiene.
 * Con solo temas el resultado es exactamente el del grupo de temas (compatibilidad). `done` exige todo cumplido.
 */
export function combineLinkProgress(
  topic: { pct: number; done: boolean; links: readonly unknown[] } | null,
  practice: { pct: number; done: boolean; links: readonly unknown[] } | null,
): { pct: number; done: boolean } | null {
  const parts = [topic, practice].filter((p): p is NonNullable<typeof p> => !!p && p.links.length > 0);
  if (!parts.length) return null;
  const weight = parts.reduce((a, p) => a + p.links.length, 0);
  return { pct: Math.round(parts.reduce((a, p) => a + p.pct * p.links.length, 0) / weight), done: parts.every((p) => p.done) };
}
