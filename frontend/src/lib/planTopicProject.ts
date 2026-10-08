// PROYECTO DE APLICACIÓN tras cada tema, CALIBRADO AL NIVEL del estudiante (`PlannedTopic.topicProject`).
//
// Módulo PURO y compartido (núcleo, API y renderer): sin node:* ni DOM. Documentado en docs/VAULT_FORMAT.md («Proyecto del tema»).
//
// Idea del usuario: «tras terminar un tema, un proyecto con aplicación real siempre que sea posible y que el nivel medido lo permita: si ya
// sabe sumar y restar, una calculadora; pero si ni siquiera sabe escribir un Hello World, no se le pide una calculadora: la IA debe medir
// según la actividad». Por eso:
//  - Cuatro NIVELES de proyecto: micro (unas líneas: «imprime tu nombre con 3 formatos») · guiado · aplicado (calculadora, CRUD…) ·
//    integrador (una pieza completa con pruebas).
//  - El nivel permitido (`calibrateTopicProject`) sale del nivel MEDIDO (progreso real de los temas requeridos y del propio tema, intentos y
//    errores del vault) y, si todavía no hay actividad, del nivel DECLARADO del formulario (`basis: "declarado"`). Lo medido manda sobre lo
//    declarado: nunca se pide más de lo que la actividad respalda, y como mucho un escalón por encima de lo declarado.
//  - Un tema sin temas previos (nada que combinar) nunca pasa de «guiado»; con 1–2 previos, de «aplicado».
//  - La IA puede proponer título y descripción, pero NO subir el nivel: `clampProject` recorta a lo permitido y, si recorta, usa la plantilla.
// Sin IA hay PLANTILLAS por tipo de tema (lenguaje · bases · Backend · Frontend · Databases · Automation · Tooling · genérico).

import type { PlanLevel } from "./planTime.js";

export const PROJECT_LEVELS = ["micro", "guiado", "aplicado", "integrador"] as const;
export type ProjectLevel = (typeof PROJECT_LEVELS)[number];
export const PROJECT_LEVEL_LABEL: Record<ProjectLevel, string> = { micro: "Micro", guiado: "Guiado", aplicado: "Aplicado", integrador: "Integrador" };
export const PROJECT_BASIS_LABEL = { declarado: "según tu nivel declarado", medido: "según tu actividad medida" } as const;

export interface TopicProject {
  title: string;
  description: string;
  level: ProjectLevel;
  /** `medido` = calibrado con la actividad real; `declarado` = aún no hay actividad y se usó el nivel del formulario */
  basis: "declarado" | "medido";
  /** carpetas de los temas previos cuyo dominio respalda el nivel (los que se combinan en el proyecto) */
  requires: string[];
  language?: string;
  source: "template" | "ai";
}

export const levelRank = (l: ProjectLevel): number => PROJECT_LEVELS.indexOf(l);
const byRank = (n: number): ProjectLevel => PROJECT_LEVELS[Math.max(0, Math.min(PROJECT_LEVELS.length - 1, n))]!;

/** Lo medido de un tema previo (o del propio tema). */
export interface MasteryPoint {
  folder: string;
  /** 0..100: progreso real del tema (`completenessPct`), `undefined` si no se conoce */
  pct?: number;
  /** intentos registrados en los ejercicios del tema */
  attempts?: number;
  /** 0..1: fracción de intentos fallidos */
  errorRate?: number;
}
export interface MasteryInput {
  own?: MasteryPoint;
  required: readonly MasteryPoint[];
}

/** Nivel declarado → nivel de proyecto inicial (hipótesis; lo medido lo corrige). */
export const DECLARED_PROJECT_LEVEL: Record<PlanLevel, ProjectLevel> = { empezando: "micro", basico: "guiado", intermedio: "aplicado", avanzado: "integrador", no_se: "micro" };

/** Tope por número de temas previos que se pueden combinar. */
export const maxLevelByRequires = (n: number): ProjectLevel => (n <= 0 ? "guiado" : n <= 2 ? "aplicado" : "integrador");

export interface Allowed {
  level: ProjectLevel;
  basis: "declarado" | "medido";
  /** por qué ese nivel (para enseñarlo) */
  why: string;
}

/** ¿Hay actividad real que medir? (progreso o intentos en el propio tema o en los previos) */
export function hasActivity(m: MasteryInput): boolean {
  return [m.own, ...m.required].some((p) => !!p && ((p.pct ?? 0) > 0 || (p.attempts ?? 0) > 0));
}

/**
 * El nivel MÁXIMO de proyecto que se puede pedir: lo medido si hay actividad (media del progreso de los previos y del propio tema; muchos
 * fallos bajan un escalón); si no, el declarado. Siempre acotado por cuántos temas previos hay.
 */
export function allowedProjectLevel(declared: PlanLevel | undefined, m: MasteryInput): Allowed {
  const cap = maxLevelByRequires(m.required.length);
  const decl = DECLARED_PROJECT_LEVEL[declared ?? "no_se"];
  if (!hasActivity(m)) {
    const level = byRank(Math.min(levelRank(decl), levelRank(cap)));
    return { level, basis: "declarado", why: declared ? `Aún no hay actividad que medir: nivel declarado (${declared.replace("_", " ")}).` : "Aún no hay actividad que medir ni nivel declarado: empieza pequeño." };
  }
  const pts = [...m.required, ...(m.own ? [m.own] : [])].filter((p) => p.pct !== undefined);
  const avg = pts.length ? pts.reduce((n, p) => n + (p.pct ?? 0), 0) / pts.length : 0;
  let step = avg < 25 ? 0 : avg < 55 ? 1 : avg < 80 ? 2 : 3;
  const attempts = [...m.required, ...(m.own ? [m.own] : [])].reduce((n, p) => n + (p.attempts ?? 0), 0);
  const failing = attempts >= 5 && [...m.required, ...(m.own ? [m.own] : [])].reduce((n, p) => n + (p.errorRate ?? 0) * (p.attempts ?? 0), 0) / attempts > 0.5;
  if (failing) step = Math.max(0, step - 1);
  // lo medido manda, pero no pasa de un escalón por encima de lo declarado (si lo hay)
  if (declared) step = Math.min(step, levelRank(decl) + 1);
  const level = byRank(Math.min(step, levelRank(cap)));
  return { level, basis: "medido", why: `Medido con tu actividad: ~${Math.round(avg)} % de dominio en los temas previos${failing ? " y muchos fallos recientes" : ""}.` };
}

// ── Plantillas ──────────────────────────────────────────────────────────

export type ProjectKind = "language" | "bases" | "backend" | "frontend" | "databases" | "automation" | "tooling" | "generic";

const shortOf = (t: string): string => t.replace(/^[\d.\s_-]+/, "").trim() || t;

type Maker = (t: string, lang: string) => { title: string; description: string };
const TEMPLATES: Record<ProjectKind, Record<ProjectLevel, Maker>> = {
  language: {
    micro: (t, l) => ({ title: `Imprime tu nombre con 3 formatos (${l})`, description: `Un programa de pocas líneas en ${l} que use «${t}» para mostrar tu nombre de tres maneras distintas.` }),
    guiado: (t, l) => ({ title: `Convertidor de unidades con «${t}»`, description: `En ${l}, un programa que pida un número y lo convierta (km a millas, °C a °F) usando «${t}»; sigue los pasos del tema.` }),
    aplicado: (t, l) => ({ title: `Calculadora de consola en ${l}`, description: `Suma, resta, multiplica y divide con entrada del usuario, validando los errores, aplicando «${t}».` }),
    integrador: (t, l) => ({ title: `Gestor de tareas en consola (${l})`, description: `Una pequeña aplicación de consola que guarda tareas en un archivo, con menús, validación y pruebas; aplica «${t}» y lo anterior.` }),
  },
  bases: {
    micro: (t, l) => ({ title: `Micro-programa de «${t}»`, description: `Escribe en ${l} un programa de menos de 10 líneas que muestre cómo funciona «${t}».` }),
    guiado: (t, l) => ({ title: `Adivina el número con «${t}»`, description: `Un juego sencillo en ${l} que aplica «${t}» paso a paso.` }),
    aplicado: (t, l) => ({ title: `Calculadora en ${l}`, description: `Una calculadora con las cuatro operaciones y manejo de errores, aplicando «${t}».` }),
    integrador: (t, l) => ({ title: `Mini-aplicación que combina «${t}» y lo anterior`, description: `Una herramienta de consola en ${l} con datos, funciones y pruebas.` }),
  },
  backend: {
    micro: (t) => ({ title: `Endpoint «hola» con «${t}»`, description: `Un único endpoint que responda un JSON fijo y use «${t}» de la forma más simple.` }),
    guiado: (t) => ({ title: `Endpoint con validación de «${t}»`, description: `Un endpoint que reciba datos, los valide y devuelva errores claros aplicando «${t}».` }),
    aplicado: (t) => ({ title: `CRUD de «${t}» con pruebas`, description: `Crear, leer, actualizar y borrar un recurso pequeño con pruebas automáticas; aplica «${t}».` }),
    integrador: (t) => ({ title: `API de «${t}» con persistencia y pruebas`, description: `Un servicio con base de datos, autenticación básica, documentación y pruebas; integra «${t}» con lo anterior.` }),
  },
  frontend: {
    micro: (t) => ({ title: `Átomo con «${t}»`, description: `Un componente mínimo (un botón o una etiqueta) en HTML/CSS que aplique «${t}».` }),
    guiado: (t) => ({ title: `Molécula con «${t}»`, description: `Un componente de dos o tres átomos (campo con etiqueta, buscador) que aplique «${t}».` }),
    aplicado: (t) => ({ title: `Organismo con «${t}»`, description: `Una navbar, un hero o una tarjeta completa, accesible, que aplique «${t}».` }),
    integrador: (t) => ({ title: `Página completa con «${t}»`, description: `Une los componentes que ya tienes en una página responsive y accesible que integre «${t}».` }),
  },
  databases: {
    micro: (t) => ({ title: `Una tabla y 3 consultas con «${t}»`, description: `Crea una tabla de ejemplo, inserta datos y escribe tres consultas que practiquen «${t}».` }),
    guiado: (t) => ({ title: `Esquema de 3 tablas con «${t}»`, description: `Diseña tres tablas relacionadas con claves y escribe las consultas que usan «${t}».` }),
    aplicado: (t) => ({ title: `Consultas con JOIN y agregaciones sobre un caso (${t})`, description: `Modela un caso pequeño y responde cinco preguntas con consultas que apliquen «${t}».` }),
    integrador: (t) => ({ title: `Esquema, migraciones y consultas de un caso (${t})`, description: `Un modelo normalizado con migraciones reproducibles y consultas complejas; integra «${t}».` }),
  },
  automation: {
    micro: (t, l) => ({ title: `Script de una acción con «${t}»`, description: `Un script de ${l} de pocas líneas que haga una sola tarea con «${t}».` }),
    guiado: (t, l) => ({ title: `Script que procesa un archivo con «${t}»`, description: `En ${l}, lee un archivo, transforma su contenido y deja un registro, aplicando «${t}».` }),
    aplicado: (t, l) => ({ title: `Automatización de una tarea real (${t})`, description: `Un script de ${l} con entrada, proceso, registro y manejo de errores que ahorre una tarea tuya.` }),
    integrador: (t, l) => ({ title: `Flujo automatizado de punta a punta (${t})`, description: `Un pipeline en ${l}, idempotente y con registro, que integra «${t}» con lo anterior.` }),
  },
  tooling: {
    micro: (t) => ({ title: `Un comando de «${t}» en un repo de prueba`, description: `Crea un repositorio de práctica y usa «${t}» una vez, comprobando el resultado.` }),
    guiado: (t) => ({ title: `Flujo corto con «${t}»`, description: `Tres cambios en un repositorio de prueba usando «${t}» y revisa el historial.` }),
    aplicado: (t) => ({ title: `Repositorio con pruebas y linter (${t})`, description: `Un proyecto pequeño con pruebas y un linter configurados, aplicando «${t}».` }),
    integrador: (t) => ({ title: `Repositorio con CI (${t})`, description: `Un proyecto con historial limpio, pruebas, linters y una pipeline de CI que integra «${t}».` }),
  },
  generic: {
    micro: (t) => ({ title: `Ejercicio mínimo de «${t}»`, description: `Una pieza muy pequeña que muestre que entiendes «${t}».` }),
    guiado: (t) => ({ title: `Mini-proyecto guiado de «${t}»`, description: `Un proyecto corto, paso a paso, que aplica «${t}».` }),
    aplicado: (t) => ({ title: `Proyecto aplicado de «${t}»`, description: `Una aplicación pequeña con un caso real que aplica «${t}».` }),
    integrador: (t) => ({ title: `Proyecto integrador de «${t}»`, description: `Una pieza completa que combina «${t}» con los temas previos.` }),
  },
};

/** El tipo de plantilla de un tema según el área y el grupo en que vive. */
export function projectKindOf(areaId: string | undefined, groupKind: string | undefined): ProjectKind {
  if (groupKind === "language") return "language";
  if (groupKind === "bases") return "bases";
  if (areaId === "backend" || areaId === "frontend" || areaId === "databases" || areaId === "automation" || areaId === "tooling") return areaId;
  return "generic";
}

export function templateProject(kind: ProjectKind, level: ProjectLevel, topicTitle: string, language: string): { title: string; description: string } {
  return TEMPLATES[kind][level](shortOf(topicTitle), language);
}

export interface ProjectTopicInput {
  folder: string;
  title: string;
  areaId?: string;
  groupKind?: string;
  /** lenguaje del tema o de su área («Python»), si lo hay */
  language?: string;
}

/**
 * El proyecto de un tema calibrado con el nivel declarado y lo medido. PURA y determinista: sin base ⇒ `micro`; con dominio de los temas
 * requeridos ⇒ `aplicado` / `integrador`. `declared` = nivel de la materia en el formulario.
 */
export function calibrateTopicProject(topic: ProjectTopicInput, declared: PlanLevel | undefined, mastery: MasteryInput): TopicProject {
  const allowed = allowedProjectLevel(declared, mastery);
  const lang = topic.language ?? "el lenguaje del plan";
  const t = templateProject(projectKindOf(topic.areaId, topic.groupKind), allowed.level, topic.title, lang);
  return { ...t, level: allowed.level, basis: allowed.basis, requires: mastery.required.map((r) => r.folder).slice(0, 4), ...(topic.language ? { language: topic.language } : {}), source: "template" };
}

/**
 * Una propuesta de la IA recortada a lo permitido: el nivel nunca supera el calibrado (si la IA pedía más, se usa la plantilla del nivel
 * permitido); título y descripción se acotan. Devuelve el proyecto final (`source: "ai"` solo si se respetó la propuesta).
 */
export function clampProject(proposal: { title?: unknown; description?: unknown; level?: unknown }, base: TopicProject): TopicProject {
  const title = String(proposal.title ?? "").replace(/\s+/g, " ").trim().slice(0, 100);
  const description = String(proposal.description ?? "").replace(/\s+/g, " ").trim().slice(0, 320);
  const asked = (PROJECT_LEVELS as readonly string[]).includes(String(proposal.level)) ? (proposal.level as ProjectLevel) : base.level;
  if (!title || levelRank(asked) > levelRank(base.level)) return base;
  return { ...base, title, description: description || base.description, level: asked, source: "ai" };
}

/** Lectura segura de lo guardado en el plan. */
export function sanitizeTopicProject(raw: unknown): TopicProject | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const title = String(o.title ?? "").replace(/\s+/g, " ").trim().slice(0, 100);
  if (!title) return undefined;
  const level = (PROJECT_LEVELS as readonly string[]).includes(String(o.level)) ? (o.level as ProjectLevel) : "micro";
  const requires = (Array.isArray(o.requires) ? o.requires : []).map((x) => String(x ?? "").trim()).filter(Boolean).slice(0, 4);
  const language = String(o.language ?? "").replace(/\s+/g, " ").trim().slice(0, 24);
  return {
    title,
    description: String(o.description ?? "").replace(/\s+/g, " ").trim().slice(0, 320),
    level,
    basis: o.basis === "medido" ? "medido" : "declarado",
    requires,
    ...(language ? { language } : {}),
    source: o.source === "ai" ? "ai" : "template",
  };
}

// ── Asignación a un plan ────────────────────────────────────────────────

export interface ProjectPlanTopic {
  folder: string;
  title: string;
  completedAt?: string;
  route?: string;
  group?: string;
}
export interface ProjectPlanSub {
  id: string;
  area: string;
  areaId?: string;
  groups?: Array<{ id: string; kind: string; title: string }>;
  topics: ProjectPlanTopic[];
}
/** Lo medido de un tema por carpeta (del vault); `undefined` = tema desconocido. */
export type MasteryLookup = (folder: string) => Omit<MasteryPoint, "folder"> | undefined;

/** Cuántos temas previos del grupo respaldan el proyecto de un tema. */
export const REQUIRED_WINDOW = 3;

/** Los proyectos de todos los temas vivos y pendientes de un subplan, en una sola pasada (clave = carpeta). */
export function projectsForSubplan(sub: ProjectPlanSub, declaredOf: (folder: string) => PlanLevel | undefined, lookup: MasteryLookup, overrides?: ReadonlyMap<string, { title?: unknown; description?: unknown; level?: unknown }>): Map<string, TopicProject> {
  const out = new Map<string, TopicProject>();
  const live = sub.topics.filter((t) => t.route !== "skipped");
  const langOf = (g?: string): string | undefined => {
    const grp = sub.groups?.find((x) => x.id === g);
    return grp?.kind === "language" ? grp.title.replace(/^Lenguaje:\s*/i, "").trim() : undefined;
  };
  live.forEach((t, i) => {
    if (t.completedAt) return;
    const grp = sub.groups?.find((x) => x.id === t.group);
    const prev = live.slice(0, i).filter((p) => p.group === t.group).slice(-REQUIRED_WINDOW);
    const point = (f: string): MasteryPoint => ({ folder: f, ...(lookup(f) ?? {}) });
    const base = calibrateTopicProject({ folder: t.folder, title: t.title, ...(sub.areaId ? { areaId: sub.areaId } : {}), ...(grp?.kind ? { groupKind: grp.kind } : {}), ...(langOf(t.group) ? { language: langOf(t.group)! } : {}) }, declaredOf(t.folder), { own: point(t.folder), required: prev.map((p) => point(p.folder)) });
    const ov = overrides?.get(t.folder);
    out.set(t.folder, ov ? clampProject(ov, base) : base);
  });
  return out;
}

/** Id estable (corto) del entregable de un proyecto de tema: `tp:<hash de la carpeta>`. */
export function topicProjectId(folder: string): string {
  let h = 5381;
  for (let i = 0; i < folder.length; i++) h = ((h << 5) + h + folder.charCodeAt(i)) >>> 0;
  return `tp:${h.toString(36)}`;
}
