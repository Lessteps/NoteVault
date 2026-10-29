// Agenda por ENFOQUE: cada día del plan por áreas tiene un enfoque (el área principal activa ese día) y unos BLOQUES OBLIGATORIOS de
// teoría y de práctica que salen de una PLANTILLA DE DÍA por enfoque. La tabla `FOCUS_TEMPLATES` es DATOS (no código disperso) y se
// documenta en docs/VAULT_FORMAT.md («Agenda por enfoque»).
//
// Módulo PURO y compartido (núcleo, API y renderer): sin node:* ni DOM. Determinista: misma entrada → misma agenda.
//
// Modelo
//  - CARRILES: los temas pendientes de cada área se reparten en carriles disjuntos por tipo de grupo: `<subplan>|knowledge` (Conocimientos),
//    `<subplan>|language` (Lenguaje: Python…) y un carril GLOBAL `bases` con los fundamentos (grupo «Bases» de cualquier área). Cada tema
//    está en un solo carril.
//  - PLANTILLA: lista de bloques (teoría/práctica) que toman minutos de uno o varios carriles. Un carril puede alimentar dos bloques (la
//    teoría y la práctica de bases de datos del MISMO tema, repartidos por su proporción).
//  - ENFOQUE del día: las áreas con plantilla activas esa semana (su fase o, sin fase, sus semanas objetivo) y con temas pendientes;
//    Databases es ACOMPAÑANTE de Backend (sus bloques van dentro del día de Backend). Con varios enfoques activos la semana alterna días en
//    proporción a lo que le queda a cada uno.
//  - MINUTOS: capacidad del día (tiempo × ritmo − práctica reservada) − proyecto diario. Cada bloque tiene una proporción (`share`) y un
//    mínimo (`floor`). Con holgura cada carril toma lo que necesita para terminar al final de su fase (ritmo nivelado, nunca por debajo del
//    mínimo); con sobrecarga las proporciones reparten el día y lo sobrante de un bloque pasa a los que van atrasados.
//  - MODO «JUNTAS» (`areaMode: "together"`): en vez de UN enfoque por día, TODOS los enfoques activos esa semana se combinan en un día
//    «completo» (plantilla compuesta, ver `compositeTemplate`): bloques de teoría y práctica de cada área el MISMO día, con los minutos
//    repartidos por PESOS (50 % parejo + 50 % proporcional a lo que le queda a cada área; cada mínimo se divide entre las áreas). Automation
//    sigue al final (su fase empieza cuando acaban las demás). Con una sola área activa, el día es el de siempre.
//  - PRÁCTICA DE LENGUAJE DIARIA (`languages`): cada día de estudio lleva un bloque propio «Práctica de <lenguaje>» (sintaxis, lógica y
//    resolución de problemas, ligadas a los temas del día) con minutos propios; el lenguaje rota por la lista con una proporción por
//    lenguaje (Python más frecuente). Es ADEMÁS de los bloques de temas del grupo «Lenguaje: …» (que no se duplican: siguen siendo los temas).
//  - «NO PARTIR DESDE CERO»: los fundamentos NO se adelantan como bloque inicial. Se intercalan dentro del bloque de práctica de lenguaje
//    («Lógica aplicada»), repartidos con el lenguaje en proporción a lo que le queda a cada uno, durante toda la fase del área que los tiene.
//    La semana objetivo (`targetWeek`) de un tema no fijado solo ORDENA su carril; un tema fijado (`pinned`) no se coloca antes de su semana.
//  - Sin temas de un tipo: si el carril tuvo temas pero ya están hechos (o aún no empieza su fase), el bloque queda como REPASO de esa área
//    con pocos minutos; si el plan no tiene ese tipo de tema, el bloque se OMITE con una explicación.

import type { AreaGroup, GroupKind } from "./planAreas.js";
import { areaNameOf } from "./planAreas.js";
import { languageName, pickLanguage } from "./planLanguages.js";
import type { PlanLanguageId } from "./planTime.js";
import { eachDay, isoDow, weekRangesOf } from "./planTime.js";

// ── Tabla de plantillas ─────────────────────────────────────────────────

export type BlockKind = "theory" | "practice";
/** Qué se practica en un bloque de práctica (define el ejercicio por plantilla). */
export type PracticeType = "language" | "database" | "ui" | "scripting" | "tooling" | "area";

/** Referencia a un carril: el área (`self` = la del enfoque; si no, un `areaId`) y el tipo de grupo, o el carril global de fundamentos. */
export type LaneRef = { area: "self" | string; kind: Exclude<GroupKind, "bases"> } | "bases";

export interface BlockDef {
  id: string;
  kind: BlockKind;
  /** «Teoría de backend», «Práctica de lenguaje ({lang})» */
  label: string;
  /** para la línea del día: «teoría de backend», «práctica de {lang}» */
  short: string;
  lanes: LaneRef[];
  /** si `lanes` no tuvo nunca temas en este plan, se usan estos (p. ej. scripting sobre los temas de automatización) */
  fallback?: LaneRef[];
  /** proporción del día (se normaliza entre los bloques presentes) */
  share: number;
  /** mínimo de minutos cuando hay temas */
  floor: number;
  practice?: PracticeType;
  /** lenguaje por defecto de la práctica cuando el día no lo dice («Python», «SQL») */
  language?: string;
  /** área dueña del bloque en una plantilla compuesta (modo «juntas») */
  owner?: string;
}

export interface FocusTemplate {
  id: string;
  /** nombre del enfoque («Backend») */
  label: string;
  /** áreas que van DENTRO de los días de este enfoque cuando están activas a la vez */
  companions: string[];
  blocks: BlockDef[];
  /** lenguaje por defecto de la práctica de lenguaje */
  language: string;
  /** cómo varía la práctica con este enfoque (se enseña en la vista Día) */
  practiceNote: string;
  /** proyecto diario: proporción de la capacidad del día, con mínimo y máximo (min) */
  dailyProject: { share: number; min: number; max: number };
}

const SELF = (kind: "knowledge" | "language"): LaneRef => ({ area: "self", kind });

/** Plantillas de día por enfoque (datos). `generic` sirve para cualquier otra área (Desktop, Mobile, materias propias). */
export const FOCUS_TEMPLATES: Readonly<Record<string, FocusTemplate>> = {
  backend: {
    id: "backend",
    label: "Backend",
    companions: ["databases"],
    language: "Python",
    practiceNote: "Con enfoque Backend practicas cada día el lenguaje del servidor ({lang}) y SQL sobre el tema de bases de datos del día: backend es base de datos y lógica.",
    dailyProject: { share: 0.12, min: 30, max: 60 },
    blocks: [
      { id: "backend-theory", kind: "theory", label: "Teoría de backend", short: "teoría de backend", lanes: [SELF("knowledge")], share: 0.3, floor: 25 },
      { id: "backend-lang", kind: "practice", label: "Práctica de lenguaje ({lang})", short: "práctica de {lang}", lanes: [SELF("language"), "bases"], share: 0.28, floor: 25, practice: "language" },
      { id: "db-theory", kind: "theory", label: "Teoría de bases de datos", short: "teoría de bases de datos", lanes: [{ area: "databases", kind: "knowledge" }], share: 0.24, floor: 20 },
      { id: "db-practice", kind: "practice", label: "Práctica de bases de datos (SQL)", short: "práctica de SQL", lanes: [{ area: "databases", kind: "knowledge" }], share: 0.18, floor: 20, practice: "database", language: "SQL" },
    ],
  },
  databases: {
    id: "databases",
    label: "Databases",
    companions: [],
    language: "SQL",
    practiceNote: "Con enfoque Databases la práctica es SQL: diseñar tablas y escribir las consultas del tema del día.",
    dailyProject: { share: 0.12, min: 30, max: 60 },
    blocks: [
      { id: "db-theory", kind: "theory", label: "Teoría de bases de datos", short: "teoría de bases de datos", lanes: [SELF("knowledge")], share: 0.55, floor: 25 },
      { id: "db-practice", kind: "practice", label: "Práctica de bases de datos (SQL)", short: "práctica de SQL", lanes: [SELF("knowledge")], share: 0.45, floor: 20, practice: "database", language: "SQL" },
    ],
  },
  frontend: {
    id: "frontend",
    label: "Frontend",
    companions: [],
    language: "JavaScript",
    practiceNote: "Con enfoque Frontend practicas el lenguaje del navegador ({lang}) y construyes interfaces y componentes con el tema del día.",
    dailyProject: { share: 0.12, min: 30, max: 60 },
    blocks: [
      { id: "frontend-theory", kind: "theory", label: "Teoría de frontend", short: "teoría de frontend", lanes: [SELF("knowledge")], share: 0.35, floor: 25 },
      { id: "frontend-lang", kind: "practice", label: "Práctica de lenguaje ({lang})", short: "práctica de {lang}", lanes: [SELF("language"), "bases"], share: 0.35, floor: 25, practice: "language" },
      { id: "frontend-ui", kind: "practice", label: "Práctica de UI y componentes", short: "práctica de UI y componentes", lanes: [SELF("knowledge")], share: 0.3, floor: 20, practice: "ui" },
    ],
  },
  automation: {
    id: "automation",
    label: "Automation",
    companions: [],
    language: "Python",
    practiceNote: "Con enfoque Automation la práctica es scripting en {lang}: automatizar una tarea real con el tema del día.",
    dailyProject: { share: 0.12, min: 30, max: 60 },
    blocks: [
      { id: "automation-theory", kind: "theory", label: "Teoría de automatización", short: "teoría de automatización", lanes: [SELF("knowledge")], share: 0.5, floor: 25 },
      { id: "automation-script", kind: "practice", label: "Práctica de scripting en {lang}", short: "scripting en {lang}", lanes: [SELF("language"), "bases"], fallback: [SELF("knowledge")], share: 0.5, floor: 25, practice: "scripting" },
    ],
  },
  tooling: {
    id: "tooling",
    label: "Tooling and Quality",
    companions: [],
    language: "Git",
    practiceNote: "Con enfoque Tooling and Quality practicas con Git, pruebas y linters en un repositorio de práctica.",
    dailyProject: { share: 0.12, min: 30, max: 60 },
    blocks: [
      { id: "tooling-theory", kind: "theory", label: "Teoría de herramientas y calidad", short: "teoría de herramientas", lanes: [SELF("knowledge")], share: 0.5, floor: 25 },
      { id: "tooling-practice", kind: "practice", label: "Práctica con Git y pruebas", short: "práctica con Git y pruebas", lanes: [SELF("knowledge")], share: 0.5, floor: 20, practice: "tooling", language: "Git" },
    ],
  },
  generic: {
    id: "generic",
    label: "",
    companions: [],
    language: "",
    practiceNote: "La práctica aplica el tema del día con ejercicios del área.",
    dailyProject: { share: 0.12, min: 25, max: 45 },
    blocks: [
      { id: "area-theory", kind: "theory", label: "Teoría de {area}", short: "teoría de {area}", lanes: [SELF("knowledge"), SELF("language")], share: 0.6, floor: 25 },
      { id: "area-practice", kind: "practice", label: "Práctica de {area}", short: "práctica de {area}", lanes: [SELF("knowledge"), SELF("language"), "bases"], share: 0.4, floor: 20, practice: "area" },
    ],
  },
};

/**
 * Plantilla COMPUESTA del modo «juntas»: los bloques de cada área activa en un solo día. Los pesos reparten el día: cada área aporta su
 * plantilla con `share` × su peso (50 % parejo + 50 % proporcional a lo que le queda) y el mínimo de cada bloque se divide entre las áreas.
 * Tabla del día «completo» (con 3 áreas y pesos parejos): teoría y práctica de Backend · lenguaje · teoría y SQL de Databases · teoría, lenguaje
 * y UI de Frontend, cada bloque con ~1/3 de su proporción habitual; el proyecto diario crece (40–75 min) porque integra las áreas.
 */
export function compositeTemplate(parts: ReadonlyArray<{ sub: FocusSubIn; weight: number }>): FocusTemplate {
  const sumW = parts.reduce((n, p) => n + p.weight, 0) || 1;
  const eq = 1 / Math.max(1, parts.length);
  const blocks: BlockDef[] = [];
  const seen = new Set<string>();
  const areas: string[] = [];
  for (const p of parts) {
    const tpl = templateFor(p.sub.areaId);
    const w = 0.5 * eq + 0.5 * (p.weight / sumW);
    const owner = p.sub.areaId ?? "self";
    const own = (r: LaneRef): LaneRef => (r !== "bases" && r.area === "self" ? { ...r, area: owner } : r);
    const areaOf = (r: LaneRef): string | null => (r === "bases" ? null : r.area);
    for (const def of tpl.blocks) {
      const id = tpl.id === "generic" ? `${owner}-${def.id}` : def.id;
      if (seen.has(id)) continue;
      seen.add(id);
      blocks.push({ ...def, id, share: def.share * w, floor: Math.max(10, Math.round(def.floor / parts.length)), lanes: def.lanes.map(own), ...(def.fallback ? { fallback: def.fallback.map(own) } : {}), owner });
      for (const r of def.lanes) {
        const a = areaOf(own(r));
        if (a && a !== "self" && !areas.includes(a)) areas.push(a);
      }
    }
  }
  const label = areas.includes("backend") && areas.includes("frontend") ? "Full stack" : areas.map((a) => areaNameOf(a, a)).join(" + ");
  return {
    id: "together",
    label,
    companions: [],
    language: templateFor(parts[0]?.sub.areaId).language,
    practiceNote: `Modo «juntas»: hoy practicas ${areas.map((a) => areaNameOf(a, a)).join(", ")} el mismo día; los minutos se reparten por peso entre las áreas y el proyecto del día las integra (una feature pequeña de punta a punta).`,
    dailyProject: { share: 0.18, min: 40, max: 75 },
    blocks,
  };
}

/** Minutos de un bloque de repaso (el carril ya no tiene temas pendientes). */
export const REVIEW_MINUTES = 20;
const MIN_CHUNK = 10;
/** temas que cada área trabaja cada día de estudio (obligatorio, si le quedan) */
export const DAILY_TOPICS_PER_AREA = 4;
/** los fundamentos no son de ningún área: temas de Bases por día */
const BASES_DAILY_TOPICS = 2;

export const templateFor = (areaId: string | undefined): FocusTemplate => FOCUS_TEMPLATES[areaId ?? ""] ?? FOCUS_TEMPLATES.generic!;

// ── Entrada y salida (estructurales; los tipos completos están en planSchedule.ts) ──

export interface FocusTopicIn {
  folder: string;
  title: string;
  estMinutes: number;
  targetWeek: number;
  completedAt?: string;
  pinned?: boolean;
  group?: string;
}
export interface FocusSubIn {
  id: string;
  area: string;
  areaId?: string;
  topics: FocusTopicIn[];
  groups?: AreaGroup[];
  phase?: { fromWeek: number; toWeek: number };
}
export interface FocusPlanIn {
  start: string;
  end: string;
  subplans: FocusSubIn[];
  /** modo «juntas»: todos los enfoques activos se combinan cada día (ver cabecera) */
  areaMode?: "together" | "phased";
  /** lenguajes con práctica diaria propia (rotación por peso); ausente = sin bloque diario de lenguaje */
  languages?: ReadonlyArray<{ id: string; weight?: number }>;
}

export interface BlockItem {
  subplanId: string;
  area: string;
  areaId?: string;
  folder: string;
  title: string;
  minutes: number;
  part: number;
  parts: number;
  group?: string;
  groupTitle?: string;
  /** fundamento intercalado como lógica aplicada al lenguaje */
  applied?: boolean;
  /** lenguaje concreto del tema («Python», «JavaScript»), si sale de su grupo */
  language?: string;
  /** tema añadido a mano a este día */
  extra?: boolean;
}

export interface DayBlock {
  id: string;
  kind: BlockKind;
  label: string;
  practice?: PracticeType;
  language?: string;
  /** topic = con temas · review = repaso del área (sus temas ya están hechos o su fase aún no empieza) · omitted = el plan no tiene ese tipo de tema · free = práctica diaria sin tema propio (lenguaje del día) */
  status: "topic" | "review" | "omitted" | "free";
  minutes: number;
  items: BlockItem[];
  /** área de la que sale el bloque */
  subplanId?: string;
  area?: string;
  areaId?: string;
  /** por qué es repaso u omitido */
  note?: string;
  /** bloque diario de práctica de lenguaje (ver cabecera) y el id del lenguaje */
  daily?: boolean;
  languageId?: string;
  /** títulos de los temas del día a los que se liga (bloque diario de lenguaje) */
  connected?: string[];
  /** esos mismos temas con su carpeta (para los ejercicios y para «Ver tema») */
  connectedTopics?: Array<{ folder: string; title: string }>;
}

export interface DayFocus {
  /** id de la plantilla (backend, frontend…, generic) */
  id: string;
  /** «Backend» */
  label: string;
  subplanId: string;
  areaId?: string;
  /** subplanes acompañantes que van dentro de este día (Databases con Backend) */
  companions: string[];
  /** áreas elementales presentes ese día (una en modo «por fases»; varias en modo «juntas») */
  areaIds?: string[];
  /** el día combina varias áreas (modo «juntas») */
  together?: boolean;
  /** «Hoy: teoría de backend + práctica de Python + teoría de bases de datos + práctica de SQL» */
  line: string;
  /** cómo varía la práctica con este enfoque */
  practiceNote: string;
}

export interface FocusDayOut {
  date: string;
  focus?: DayFocus;
  blocks: DayBlock[];
  /** minutos del proyecto diario */
  projectMinutes: number;
  /** minutos de bloques de repaso */
  reviewMinutes: number;
  /** minutos del bloque diario de práctica de lenguaje */
  languageMinutes?: number;
}

/** Un trozo de tema colocado (para construir `DayTopic` en planSchedule.ts). */
export interface FocusChunk {
  subplanId: string;
  folder: string;
  date: string;
  minutes: number;
  overflow?: boolean;
  /** bloque principal y papel del trozo */
  blockId?: string;
  role?: BlockKind;
  applied?: boolean;
}

export interface FocusResult {
  days: Map<string, FocusDayOut>;
  /** por tema (subplan|folder): sus trozos en orden */
  chunks: Map<string, FocusChunk[]>;
}

// ── Carriles ────────────────────────────────────────────────────────────

interface Seg {
  sub: FocusSubIn;
  topic: FocusTopicIn;
  order: number;
  remaining: number;
  chunks: FocusChunk[];
  applied: boolean;
}

interface Lane {
  key: string;
  /** todos los temas del carril en el plan (incluidos los hechos) */
  total: number;
  queue: Seg[];
  /** fijados que aún no llegan a su semana */
  waitingPinned: Seg[];
  startWeek: number;
  endWeek: number;
  /** área dueña del carril (para el repaso y el enfoque) */
  owners: Set<string>;
  lastTitles: string[];
}

const kindOfTopic = (sub: FocusSubIn, t: FocusTopicIn): GroupKind => sub.groups?.find((g) => g.id === t.group)?.kind ?? "knowledge";
const languageOfGroup = (sub: FocusSubIn, groupId: string | undefined): string | undefined => {
  const g = sub.groups?.find((x) => x.id === groupId);
  if (!g || g.kind !== "language") return undefined;
  return g.title.replace(/^Lenguaje:\s*/i, "").trim() || undefined;
};

export const shortTopic = (t: string): string => t.replace(/^[\d.\s_-]+/, "").trim() || t;

/** Etiqueta con {lang} / {area} sustituidos. */
const fill = (s: string, lang: string, area: string): string => s.replace(/\{lang\}/g, lang).replace(/\{area\}/g, area.toLowerCase()).replace(/\s+\(\)/, "");

export interface FocusOpts {
  /** capacidad de temas del día (ya sin kata ni sesión del proyecto semanal) */
  capOf: (date: string) => number;
  /** semana del plan de una fecha */
  weekOf: (date: string) => number;
}

/**
 * Agenda por enfoque de un plan por áreas: reparte los temas pendientes en bloques de teoría y práctica por día. Puro y determinista.
 */
export function buildFocusSchedule(plan: FocusPlanIn, opts: FocusOpts): FocusResult {
  const ranges = weekRangesOf(plan.start, plan.end);
  const W = ranges.length;
  const clampW = (w: number): number => Math.min(W, Math.max(1, Math.round(w) || 1));
  const allDays = eachDay(plan.start, plan.end);
  const subById = new Map(plan.subplans.map((s) => [s.id, s]));
  const subByArea = new Map<string, FocusSubIn>();
  for (const s of plan.subplans) if (s.areaId && !subByArea.has(s.areaId)) subByArea.set(s.areaId, s);

  // ── carriles ──
  const lanes = new Map<string, Lane>();
  const laneOf = (key: string): Lane => {
    let l = lanes.get(key);
    if (!l) lanes.set(key, (l = { key, total: 0, queue: [], waitingPinned: [], startWeek: W, endWeek: 1, owners: new Set(), lastTitles: [] }));
    return l;
  };
  const windowOf = (s: FocusSubIn): { from: number; to: number } => {
    if (s.phase) return { from: clampW(s.phase.fromWeek), to: clampW(s.phase.toWeek) };
    const ws = s.topics.map((t) => clampW(t.targetWeek));
    return { from: ws.length ? Math.min(...ws) : 1, to: ws.length ? Math.max(...ws) : W };
  };
  for (const s of plan.subplans) {
    const win = windowOf(s);
    s.topics.forEach((t, order) => {
      const kind = kindOfTopic(s, t);
      const key = kind === "bases" ? "bases" : `${s.id}|${kind}`;
      const lane = laneOf(key);
      lane.total++;
      lane.owners.add(s.id);
      lane.startWeek = Math.min(lane.startWeek, win.from);
      lane.endWeek = Math.max(lane.endWeek, win.to);
      if (t.completedAt) {
        lane.lastTitles.push(t.title);
        return;
      }
      const seg: Seg = { sub: s, topic: t, order, remaining: Math.max(1, t.estMinutes), chunks: [], applied: kind === "bases" };
      if (t.pinned) lane.waitingPinned.push(seg);
      else lane.queue.push(seg);
    });
  }
  for (const l of lanes.values()) {
    // la semana objetivo ordena el carril (y, dentro, el orden guardado del área)
    l.queue.sort((a, b) => clampW(a.topic.targetWeek) - clampW(b.topic.targetWeek) || a.order - b.order);
    l.waitingPinned.sort((a, b) => clampW(a.topic.targetWeek) - clampW(b.topic.targetWeek) || a.order - b.order);
  }
  const remainingOf = (l: Lane): number => l.queue.reduce((n, s) => n + s.remaining, 0) + l.waitingPinned.reduce((n, s) => n + s.remaining, 0);
  const pendingOf = (l: Lane | undefined): boolean => !!l && (l.queue.length > 0 || l.waitingPinned.length > 0);

  /** carriles concretos de una referencia, para el enfoque `focusSub` */
  const resolve = (ref: LaneRef, focusSub: FocusSubIn): string[] => {
    if (ref === "bases") return lanes.has("bases") ? ["bases"] : [];
    const sub = ref.area === "self" ? focusSub : subByArea.get(ref.area);
    if (!sub) return [];
    const key = `${sub.id}|${ref.kind}`;
    return lanes.has(key) ? [key] : [];
  };

  // carriles propios de un enfoque (los suyos, los de sus acompañantes y los fundamentos que posee)
  const ownLanes = (s: FocusSubIn): string[] => {
    const t = templateFor(s.areaId);
    const keys = new Set<string>();
    for (const b of t.blocks) for (const ref of [...b.lanes, ...(b.fallback ?? [])]) for (const k of resolve(ref, s)) if (k !== "bases" || lanes.get("bases")!.owners.has(s.id)) keys.add(k);
    return [...keys];
  };

  // ¿Qué áreas son enfoque? Las que tienen carriles propios con temas; los acompañantes van dentro de su principal cuando coinciden.
  const isCandidate = (s: FocusSubIn, week: number, dynamic: boolean): boolean => {
    const win = windowOf(s);
    const own = ownLanes(s).filter((k) => !templateFor(s.areaId).companions.some((c) => subByArea.get(c) && k.startsWith(`${subByArea.get(c)!.id}|`)));
    if (!own.length) return false;
    if (dynamic && !own.some((k) => pendingOf(lanes.get(k)))) return false;
    return week >= win.from && (week <= win.to || dynamic);
  };
  const candidatesOf = (week: number, dynamic: boolean): FocusSubIn[] => {
    const list = plan.subplans.filter((s) => isCandidate(s, week, dynamic));
    // modo «juntas»: cuando una fase posterior (Automation, al final) sigue activa, las áreas que ya terminaron NO desaparecen: siguen en el
    // día como repaso y práctica de mantenimiento (bloques de repaso con pocos minutos)
    if (dynamic && together && list.length) {
      for (const s of plan.subplans) {
        if (list.includes(s) || !s.areaId || s.areaId === "automation") continue;
        const win = windowOf(s);
        if (week > win.to && ownLanes(s).length) list.push(s);
      }
    }
    // acompañante absorbido: Databases dentro de los días de Backend
    return list.filter((s) => !list.some((p) => p !== s && s.areaId && templateFor(p.areaId).companions.includes(s.areaId)));
  };
  const demandOf = (s: FocusSubIn, dynamic: boolean): number => {
    const keys = new Set(ownLanes(s));
    let n = 0;
    for (const k of keys) {
      const l = lanes.get(k)!;
      n += dynamic ? remainingOf(l) : Math.max(1, remainingOf(l));
    }
    return Math.max(1, n);
  };

  // reparto estático (para estimar cuántos días le quedan a cada carril)
  const staticDemand = new Map(plan.subplans.map((s) => [s.id, demandOf(s, false)]));
  const studyDaysOfWeek = (week: number): string[] => allDays.filter((d) => opts.weekOf(d) === week && opts.capOf(d) > 0);
  const together = plan.areaMode === "together";
  interface DayPlan { s: FocusSubIn; t: FocusTemplate; subs: FocusSubIn[] }
  const staticLaneFrac = new Map<string, number[]>(); // carril → fracción de días por semana
  for (let w = 1; w <= W; w++) {
    const cands = candidatesOf(w, false);
    const total = cands.reduce((n, s) => n + (staticDemand.get(s.id) ?? 1), 0);
    for (const s of cands) {
      const f = together ? 1 : total > 0 ? (staticDemand.get(s.id) ?? 1) / total : 0;
      const t = templateFor(s.areaId);
      const keys = new Set<string>();
      for (const b of t.blocks) for (const ref of [...b.lanes, ...(b.fallback ?? [])]) for (const k of resolve(ref, s)) keys.add(k);
      for (const k of keys) {
        const arr = staticLaneFrac.get(k) ?? Array.from({ length: W + 1 }, () => 0);
        arr[w] = Math.min(1, (arr[w] ?? 0) + f);
        staticLaneFrac.set(k, arr);
      }
    }
  }
  const studyCount = Array.from({ length: W + 1 }, (_, w) => (w ? studyDaysOfWeek(w).length : 0));

  const days = new Map<string, FocusDayOut>();
  const chunksBy = new Map<string, FocusChunk[]>();
  const pushChunk = (seg: Seg, c: FocusChunk): void => {
    seg.chunks.push(c);
    const k = `${seg.sub.id}|${seg.topic.folder}`;
    chunksBy.set(k, [...(chunksBy.get(k) ?? []), c]);
  };

  let studyCounter = 0;
  let lastStudy = plan.end;
  for (const d of [...allDays].reverse()) {
    if (opts.capOf(d) > 0) {
      lastStudy = d;
      break;
    }
  }

  for (let week = 1; week <= W; week++) {
    // fijados que llegan a su semana: pasan delante de su carril
    for (const l of lanes.values()) {
      const now = l.waitingPinned.filter((s) => clampW(s.topic.targetWeek) <= week);
      if (now.length) {
        l.waitingPinned = l.waitingPinned.filter((s) => !now.includes(s));
        l.queue = [...now, ...l.queue];
      }
    }
    const studyDays = studyDaysOfWeek(week);
    const cands = candidatesOf(week, true);
    // días de la semana → enfoque, en proporción a lo que le queda a cada uno (mayor resto)
    const assign = new Map<string, DayPlan>();
    if (cands.length > 1 && together) {
      // modo «juntas»: todas las áreas activas, cada día, con una plantilla compuesta por pesos
      const dp: DayPlan = { s: cands[0]!, t: compositeTemplate(cands.map((sub) => ({ sub, weight: demandOf(sub, true) }))), subs: cands };
      for (const d of studyDays) assign.set(d, dp);
    } else if (cands.length) {
      const weights = cands.map((s) => demandOf(s, true));
      const tot = weights.reduce((n, x) => n + x, 0);
      const given = cands.map(() => 0);
      studyDays.forEach((d, i) => {
        let best = 0;
        let bestScore = -Infinity;
        cands.forEach((_s, ci) => {
          const score = (weights[ci]! / tot) * (i + 1) - given[ci]!;
          if (score > bestScore + 1e-9) {
            bestScore = score;
            best = ci;
          }
        });
        given[best]!++;
        assign.set(d, { s: cands[best]!, t: templateFor(cands[best]!.areaId), subs: [cands[best]!] });
      });
    }
    const weekRest = (laneKey: string, fromIdx: number): number => {
      let n = 0;
      for (let i = fromIdx; i < studyDays.length; i++) {
        const dp = assign.get(studyDays[i]!);
        if (!dp) continue;
        const s = dp.s;
        const t = dp.t;
        if (t.blocks.some((b) => [...b.lanes, ...(b.fallback ?? [])].some((ref) => resolve(ref, s).includes(laneKey)))) n++;
      }
      return n;
    };
    const estDays = (l: Lane, idx: number): number => {
      let n = weekRest(l.key, idx);
      const end = Math.max(week, l.endWeek);
      const frac = staticLaneFrac.get(l.key);
      for (let w = week + 1; w <= Math.min(W, end); w++) n += (frac?.[w] ?? 0) * (studyCount[w] ?? 0);
      return Math.max(1, n);
    };

    studyDays.forEach((date, idx) => {
      const dp = assign.get(date);
      const studyN = studyCounter++;
      const s = dp?.s;
      const out: FocusDayOut = { date, blocks: [], projectMinutes: 0, reviewMinutes: 0 };
      days.set(date, out);
      if (!s || !dp) return;
      const t = dp.t;
      const cap = opts.capOf(date);
      const areaName = s.area || areaNameOf(s.areaId ?? "", s.area);
      // ── bloques resueltos ──
      interface RB { def: BlockDef; lanes: string[]; status: DayBlock["status"]; note?: string; ownerSub?: FocusSubIn }
      const rbs: RB[] = t.blocks.map((def) => {
        let keys = [...new Set(def.lanes.flatMap((r) => resolve(r, s)))];
        if (!keys.filter((k) => k !== "bases").length && def.fallback) keys = [...new Set([...def.fallback.flatMap((r) => resolve(r, s)), ...keys.filter((k) => k === "bases")])];
        const ownerRef = def.lanes.find((r) => r !== "bases") as Exclude<LaneRef, "bases"> | undefined;
        const ownerSub = ownerRef ? (ownerRef.area === "self" ? s : subByArea.get(ownerRef.area)) : s;
        if (!keys.length) {
          const what = ownerRef && ownerRef.area !== "self" ? areaNameOf(ownerRef.area, ownerRef.area) : areaName;
          return { def, lanes: [], status: "omitted", note: ownerRef?.kind === "language" ? `El área ${what} no tiene temas de lenguaje en el plan: este bloque se omite.` : `El plan no tiene temas de ${what}: este bloque se omite.`, ownerSub };
        }
        const live = keys.filter((k) => {
          const l = lanes.get(k)!;
          return l.queue.length > 0 && (week >= l.startWeek || k === "bases" || l.owners.has(s.id));
        });
        if (live.length) return { def, lanes: live, status: "topic", ownerSub };
        const notStarted = keys.map((k) => lanes.get(k)!).find((l) => pendingOf(l) && week < l.startWeek);
        const what = ownerSub?.area ?? areaName;
        return {
          def,
          lanes: keys,
          status: "review",
          note: notStarted ? `${what} empieza en la semana ${notStarted.startWeek}: hoy, repaso y práctica libre.` : `Ya no quedan temas pendientes de este tipo en ${what}: repaso de lo estudiado.`,
          ownerSub,
        };
      });
      const present = rbs.filter((b) => b.status !== "omitted");
      const anyTopic = present.some((b) => b.status === "topic");
      const project = cap > 0 ? Math.min(Math.round(cap * 0.25), Math.max(t.dailyProject.min, Math.min(t.dailyProject.max, Math.round(cap * t.dailyProject.share)))) : 0;
      // práctica diaria de lenguaje (si el plan la pide): su propio bloque, con minutos propios, antes de repartir los temas
      const dailyLang = plan.languages?.length ? pickLanguage(plan.languages as ReadonlyArray<{ id: PlanLanguageId; weight?: number }>, studyN) : undefined;
      const langMinutes = dailyLang && cap > 0 ? Math.min(Math.round(cap * 0.25), Math.max(15, Math.min(35, Math.round(cap * 0.18)))) : 0;
      const C = Math.max(0, cap - project - langMinutes);
      const shareSum = present.reduce((n, b) => n + b.def.share, 0) || 1;
      const budgetOf = (b: RB): number => (C * b.def.share) / shareSum;
      const review = new Map<RB, number>();
      for (const b of present) if (b.status === "review") review.set(b, Math.round(Math.min(budgetOf(b), REVIEW_MINUTES)));
      // ── minutos por carril ──
      const laneBlocks = new Map<string, RB[]>();
      for (const b of present) if (b.status === "topic") for (const k of b.lanes) laneBlocks.set(k, [...(laneBlocks.get(k) ?? []), b]);
      // reparto de un bloque con varios carriles (lenguaje + fundamentos): en proporción a lo que le queda a cada uno
      const portion = (b: RB, k: string): number => {
        const tot = b.lanes.reduce((n, x) => n + remainingOf(lanes.get(x)!), 0) || 1;
        return remainingOf(lanes.get(k)!) / tot;
      };
      const want = new Map<string, number>();
      const alloc = new Map<string, number>();
      for (const [k, bs] of laneBlocks) {
        const l = lanes.get(k)!;
        const rem = l.queue.reduce((n, x) => n + x.remaining, 0);
        const pace = remainingOf(l) / estDays(l, idx);
        const floor = bs.reduce((n, b) => n + b.def.floor * portion(b, k), 0);
        const budget = bs.reduce((n, b) => n + budgetOf(b) * portion(b, k), 0);
        const w = Math.min(rem, Math.max(pace, floor));
        want.set(k, w);
        alloc.set(k, Math.min(w, budget));
      }
      let spare = C - [...review.values()].reduce((n, x) => n + x, 0) - [...alloc.values()].reduce((n, x) => n + x, 0);
      for (let pass = 0; pass < 4 && spare > 1; pass++) {
        const short = [...want].filter(([k, w]) => w - (alloc.get(k) ?? 0) > 0.5);
        const deficit = short.reduce((n, [k, w]) => n + (w - (alloc.get(k) ?? 0)), 0);
        if (deficit <= 0.5) break;
        let used = 0;
        for (const [k, w] of short) {
          const add = Math.min(w - (alloc.get(k) ?? 0), (spare * (w - (alloc.get(k) ?? 0))) / deficit);
          alloc.set(k, (alloc.get(k) ?? 0) + add);
          used += add;
        }
        spare -= used;
      }
      // ── consumir los carriles ──
      // OBLIGATORIO: cada área trabaja cada día de estudio DAILY_TOPICS_PER_AREA temas (si le quedan), repartidos entre sus carriles (p. ej. Backend:
      // 2 de conocimientos y 2 de Python). Los fundamentos («Bases») no son de ningún área: 2 al día. Los temas de un carril avanzan EN PARALELO: el
      // tiempo del carril se reparte a partes iguales entre sus temas del día (un tema largo ocupa varios días: «parte 2/4»).
      const laneTarget = new Map<string, number>();
      const bySub = new Map<string, string[]>();
      for (const k of alloc.keys()) {
        if (k === "bases") continue;
        const sid = k.split("|")[0]!;
        bySub.set(sid, [...(bySub.get(sid) ?? []), k]);
      }
      for (const ks of bySub.values()) {
        const caps = ks.map((k) => lanes.get(k)!.queue.length);
        const counts = ks.map(() => 0);
        let total = 0;
        while (total < DAILY_TOPICS_PER_AREA && counts.some((c, i) => c < caps[i]!)) {
          for (let i = 0; i < ks.length && total < DAILY_TOPICS_PER_AREA; i++) {
            if (counts[i]! < caps[i]!) {
              counts[i]!++;
              total++;
            }
          }
        }
        ks.forEach((k, i) => laneTarget.set(k, counts[i]!));
      }
      const placed = new Map<string, Array<{ seg: Seg; minutes: number }>>();
      for (const [k, a0] of alloc) {
        const l = lanes.get(k)!;
        let n = Math.min(laneTarget.get(k) ?? BASES_DAILY_TOPICS, l.queue.length);
        if (n < 1) continue;
        // el mínimo para que quepan sus n temas manda sobre el reparto fino de minutos, pero NUNCA pasa de la capacidad del día: en un día
        // sobrecargado entran menos temas (los que quepan, mínimo uno)
        const a = Math.min(Math.max(a0, n * MIN_CHUNK), a0 + Math.max(0, spare));
        n = Math.max(1, Math.min(n, Math.floor((a + 0.01) / MIN_CHUNK)));
        if (a > a0) spare -= a - a0;
        const got: Array<{ seg: Seg; minutes: number }> = l.queue.slice(0, n).map((seg) => ({ seg, minutes: 0 }));
        let left = a;
        let cursor = n;
        for (let guard = 0; guard < 24 && left > 0.5; guard++) {
          const open = got.filter((g) => g.seg.remaining - g.minutes > 0.01);
          if (!open.length) {
            // los temas del día se acabaron y sobra tiempo: entra el siguiente de la cola
            const nextSeg = l.queue[cursor++];
            if (!nextSeg) break;
            got.push({ seg: nextSeg, minutes: 0 });
            continue;
          }
          const each = left / open.length;
          for (const g of open) {
            const add = Math.min(each, g.seg.remaining - g.minutes);
            g.minutes += add;
            left -= add;
          }
        }
        for (const g of got) {
          // un resto pequeño se termina hoy (no se deja un trozo de 5 min para mañana)
          if (g.seg.remaining - g.minutes <= MIN_CHUNK * 0.5) g.minutes = g.seg.remaining;
          g.seg.remaining -= g.minutes;
          const qIdx = l.queue.indexOf(g.seg);
          if (g.seg.remaining < 0.5) {
            if (qIdx >= 0) l.queue.splice(qIdx, 1);
            l.lastTitles.push(g.seg.topic.title);
          } else if (qIdx >= 0 && g.minutes > 0.4) {
            // Rotar al final de la cola activa para que mañana y pasado mañana proyecten los siguientes temas de la ruta
            l.queue.splice(qIdx, 1);
            l.queue.push(g.seg);
          }
        }
        const done = got.filter((g) => g.minutes > 0.4);
        if (done.length) placed.set(k, done);
      }
      // ── a bloques ──
      const blocks: DayBlock[] = rbs.map((b) => {
        const lang = b.def.language ?? t.language;
        const owner = b.ownerSub;
        const base = {
          id: b.def.id,
          kind: b.def.kind,
          ...(b.def.practice ? { practice: b.def.practice } : {}),
          ...(owner ? { subplanId: owner.id, area: owner.area, ...(owner.areaId ? { areaId: owner.areaId } : {}) } : {}),
        };
        if (b.status !== "topic") {
          const recent = b.lanes.flatMap((k) => lanes.get(k)?.lastTitles.slice(-2) ?? []).map(shortTopic);
          const minutes = review.get(b) ?? 0;
          return {
            ...base,
            label: fill(b.def.label, lang, owner?.area ?? areaName),
            ...(b.def.kind === "practice" && lang ? { language: lang } : {}),
            status: b.status,
            minutes,
            items: [],
            note: b.status === "review" && recent.length ? `${b.note} Repasa: ${recent.join(" · ")}.` : b.note!,
          };
        }
        const items: BlockItem[] = [];
        for (const k of b.lanes) {
          const bs = laneBlocks.get(k) ?? [];
          const shareTot = bs.reduce((n, x) => n + x.def.share, 0) || 1;
          const f = (b.def.share / shareTot) * (bs.length > 1 ? 1 : 1);
          for (const p of placed.get(k) ?? []) {
            const m = bs.length > 1 ? p.minutes * f : p.minutes;
            items.push({
              subplanId: p.seg.sub.id,
              area: p.seg.sub.area,
              ...(p.seg.sub.areaId ? { areaId: p.seg.sub.areaId } : {}),
              folder: p.seg.topic.folder,
              title: p.seg.topic.title,
              minutes: Math.max(1, Math.round(m)),
              part: 0,
              parts: 0,
              ...(p.seg.topic.group ? { group: p.seg.topic.group, groupTitle: p.seg.sub.groups?.find((g) => g.id === p.seg.topic.group)?.title ?? p.seg.topic.group } : {}),
              ...(p.seg.applied ? { applied: true } : {}),
              ...(languageOfGroup(p.seg.sub, p.seg.topic.group) ? { language: languageOfGroup(p.seg.sub, p.seg.topic.group)! } : {}),
            });
          }
        }
        const dayLang = b.def.practice === "language" || b.def.practice === "scripting" ? (items.find((i) => i.language)?.language ?? languageOfOwner(owner) ?? lang) : lang;
        return {
          ...base,
          label: fill(b.def.label, dayLang, owner?.area ?? areaName),
          ...(b.def.kind === "practice" && dayLang ? { language: dayLang } : {}),
          status: items.length ? "topic" : "review",
          minutes: items.reduce((n, i) => n + i.minutes, 0),
          items,
          ...(items.length ? {} : { note: `Hoy no hay tema nuevo de este tipo: repaso de ${owner?.area ?? areaName}.` }),
        };
      });
      // los trozos del día (un tema por carril y día; el bloque principal es el primero que lo usa)
      for (const [k, got] of placed) {
        const first = (laneBlocks.get(k) ?? [])[0];
        for (const p of got) pushChunk(p.seg, { subplanId: p.seg.sub.id, folder: p.seg.topic.folder, date, minutes: p.minutes, ...(first ? { blockId: first.def.id, role: first.def.kind } : {}), ...(p.seg.applied ? { applied: true } : {}) });
      }
      const lang = blocks.find((b) => b.practice === "language" || b.practice === "scripting")?.language ?? t.language;
      if (dailyLang && langMinutes > 0) {
        const connectedTopics = [...new Map(blocks.filter((b) => b.kind === "theory").flatMap((b) => b.items.filter((i) => !i.applied).map((i) => [i.folder, { folder: i.folder, title: i.title }] as const))).values()].slice(0, 3);
        const connected = connectedTopics.map((t) => shortTopic(t.title));
        const name = languageName(dailyLang);
        blocks.push({
          id: "lang-daily",
          kind: "practice",
          label: `Práctica de ${name}`,
          practice: "language",
          language: name,
          languageId: dailyLang,
          status: "free",
          minutes: langMinutes,
          items: [],
          daily: true,
          connected,
          connectedTopics,
          subplanId: s.id,
          area: s.area,
          ...(s.areaId ? { areaId: s.areaId } : {}),
          note: `Sintaxis, lógica y resolución de problemas en ${name}${connected.length ? `, ligadas a lo de hoy: ${connected.join(" · ")}` : ""}.`,
        });
        out.languageMinutes = langMinutes;
      }
      out.blocks = blocks;
      out.projectMinutes = anyTopic || present.length ? project : 0;
      out.reviewMinutes = blocks.filter((b) => b.status === "review").reduce((n, b) => n + b.minutes, 0);
      const dayAreaIds = [...new Set([...(s.areaId ? [s.areaId] : []), ...blocks.map((b) => b.areaId).filter((a): a is string => !!a)])];
      const baseLine = focusLine(t, blocks.filter((b) => b.id !== "lang-daily"), lang, s.area);
      out.focus = {
        id: t.id,
        label: t.label || s.area,
        subplanId: s.id,
        ...(s.areaId && t.id !== "together" ? { areaId: s.areaId } : {}),
        companions: [...new Set(blocks.map((b) => b.subplanId).filter((id): id is string => !!id && id !== s.id))],
        areaIds: dayAreaIds,
        ...(t.id === "together" ? { together: true } : {}),
        line: dailyLang && langMinutes > 0 ? `${baseLine} + práctica de ${languageName(dailyLang)}` : baseLine,
        practiceNote: fill(t.practiceNote, lang, s.area),
      };
    });
  }

  // lo que no cupo en todo el plan: al último día de estudio, marcado como desbordado
  for (const l of lanes.values()) {
    for (const seg of [...l.queue, ...l.waitingPinned]) {
      if (seg.remaining < 0.5) continue;
      pushChunk(seg, { subplanId: seg.sub.id, folder: seg.topic.folder, date: lastStudy, minutes: seg.remaining, overflow: true });
      seg.remaining = 0;
    }
  }
  void subById;
  return { days, chunks: chunksBy };
}

const languageOfOwner = (s: FocusSubIn | undefined): string | undefined => {
  const g = s?.groups?.find((x) => x.kind === "language");
  return g ? g.title.replace(/^Lenguaje:\s*/i, "").trim() : undefined;
};

/** «Hoy: teoría de backend + práctica de Python + teoría de bases de datos + práctica de SQL» (repaso / omitido incluidos). */
export function focusLine(t: FocusTemplate, blocks: readonly DayBlock[], lang: string, area: string): string {
  const parts: string[] = [];
  for (const b of blocks) {
    const def = t.blocks.find((x) => x.id === b.id);
    if (!def || b.status === "omitted") continue;
    const s = fill(def.short, b.language ?? lang, b.area ?? area);
    parts.push(b.status === "review" ? `repaso (${s})` : s);
  }
  // «teoría de bases de datos + práctica de SQL» → «teoría y práctica de SQL»
  const joined = parts.join(" + ").replace("teoría de bases de datos + práctica de SQL", "teoría y práctica de SQL");
  return parts.length ? `Hoy: ${joined}` : "Hoy: repaso y práctica libre";
}

/** Días ISO de la semana en que el plan estudia (para pruebas y textos). */
export const isStudyDow = (dows: readonly number[], date: string): boolean => dows.includes(isoDow(date));
