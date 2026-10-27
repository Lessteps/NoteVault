// Áreas ELEMENTALES del Plan del Mentor: un subplan = un área (Backend, Frontend, Databases, Automation, Tooling and Quality,
// y Desktop/Mobile solo si el usuario las incluye) con grupos internos (Bases, Lenguaje, Conocimientos).
//
// Módulo PURO y compartido (núcleo, API y renderer): sin node:* ni DOM. Todo lo que decide «qué rama de la vault va a qué área»
// es una TABLA DE DATOS (`BRANCH_AREA_TABLE`, `LANGUAGE_AREA_CHAIN`, `AREA_DEFS`), no código disperso.
//
// Reglas del usuario (v1):
//  - Python → Backend (grupo «Lenguaje»); si Backend no está en el alcance y sí Automation → Automation.
//  - JavaScript / TypeScript → Frontend; si no hay Frontend → Backend.
//  - `1 Fundamentals` → grupo «Bases» del primer área del plan (en el orden de secuencia).
//  - `4 Backend`, `5 Frontend`, `6 Databases`, `7 Automation`, `9 Tooling and Quality` → su área (grupo «Conocimientos»);
//    `3 Desktop`, `8 Mobile` → sus áreas solo si están en el alcance.
//  - `programming_practice` NO es un área: es la pista de práctica diaria aparte.

import { areaOfFolder, branchOfFolder, classifyBranch, type BranchClass } from "./planTime.js";

// ── Tipos aditivos del plan por áreas ───────────────────────────────────

export type GroupKind = "bases" | "language" | "knowledge";

/** Un grupo interno de un área (Bases · Lenguaje: Python · Conocimientos de backend). */
export interface AreaGroup {
  id: string;
  title: string;
  kind: GroupKind;
  /** orden dentro del área (menor primero) */
  order: number;
}

/** Semanas (1..) del plan en que un área está activa. */
export interface AreaPhase {
  fromWeek: number;
  toWeek: number;
}

export const AREA_DELIVERABLE_KINDS = ["kata", "weekly_project", "monthly_project", "area_project", "daily_project", "topic_project"] as const;
export type PlanDeliverableKind = (typeof AREA_DELIVERABLE_KINDS)[number];
export const PLAN_DELIVERABLE_STATUSES = ["pendiente", "en_curso", "hecho"] as const;
export type PlanDeliverableStatus = (typeof PLAN_DELIVERABLE_STATUSES)[number];

/**
 * Entregable de la agenda: archivo práctico nacido del sistema de práctica o de los proyectos que la IA propone para demostrar
 * habilidad. Los de práctica (kata de cada día, proyecto semanal, proyecto mensual) y los de área (`Subplan.deliverable`) se DERIVAN
 * del plan; `Plan.deliverables` solo guarda lo que se editó a mano (estado, archivos) y los añadidos extra, casados por `id`.
 */
export interface PlanDeliverable {
  id: string;
  kind: PlanDeliverableKind;
  title: string;
  description: string;
  /** área a la que pertenece; `"all"` = proyecto integrador de varias áreas (ver `areaIds`) */
  areaId?: string;
  /** áreas que integra un proyecto integrador (diario/semanal/mensual en modo «juntas»); cuenta en el desglose de cada una */
  areaIds?: string[];
  /** AAAA-MM-DD */
  dueDate: string;
  files?: Array<{ path?: string; note: string }>;
  criteria: string[];
  status: PlanDeliverableStatus;
  source: "practice" | "ai";
}

/** Textos editados a mano del propósito de un día (clave AAAA-MM-DD), una semana (nº) o un mes (AAAA-MM). */
export interface PlanPurposes {
  day?: Record<string, string>;
  week?: Record<string, string>;
  month?: Record<string, string>;
}

// ── Definición de las áreas ─────────────────────────────────────────────

export interface AreaDef {
  id: string;
  name: string;
  /** objetivo corto y legible (una línea) */
  objective: string;
  /** título del grupo «Conocimientos» */
  knowledgeTitle: string;
  /** reconoce metas del usuario por nombre («Desarrollo Backend» ↔ Backend) */
  goalRe: RegExp;
  /** frase corta para los textos de propósito («HTTP y REST») no, aquí: foco por defecto del área */
  focus: string;
  deliverable: { title: string; description: string; criteria: string[] };
}

export const AREA_DEFS: readonly AreaDef[] = [
  {
    id: "backend",
    name: "Backend",
    objective: "Construir servicios y APIs sólidos y seguros",
    knowledgeTitle: "Conocimientos de backend",
    goalRe: /back[\s-]?end|servidor|\bapis?\b/,
    focus: "servicios y APIs",
    deliverable: {
      title: "API REST con persistencia y pruebas",
      description: "Un servicio pequeño con CRUD completo, validación, autenticación básica y pruebas automáticas, listo para enseñar.",
      criteria: ["Expone endpoints REST documentados", "Valida entradas y devuelve errores claros", "Tiene pruebas que pasan en un solo comando"],
    },
  },
  {
    id: "databases",
    name: "Databases",
    objective: "Modelar, consultar y operar bases de datos",
    knowledgeTitle: "Conocimientos de bases de datos",
    goalRe: /bases?\s+de\s+datos|database|\bsql\b|datos/,
    focus: "modelado y SQL",
    deliverable: {
      title: "Esquema relacional con consultas y migraciones",
      description: "Un modelo de datos normalizado con datos de ejemplo, consultas complejas y un script de migración reproducible.",
      criteria: ["Esquema normalizado con claves e índices", "Al menos cinco consultas con joins y agregaciones", "Migraciones que se pueden aplicar desde cero"],
    },
  },
  {
    id: "frontend",
    name: "Frontend",
    objective: "Crear interfaces web accesibles y mantenibles",
    knowledgeTitle: "Conocimientos de frontend",
    goalRe: /front[\s-]?end|interfaz|\bui\b/,
    focus: "interfaces web",
    deliverable: {
      title: "Aplicación web accesible conectada a una API",
      description: "Una interfaz con componentes reutilizables, estado, consumo de una API y revisión de accesibilidad.",
      criteria: ["Navegable solo con teclado", "Estado y datos remotos bien separados", "Funciona en móvil y en escritorio"],
    },
  },
  {
    id: "automation",
    name: "Automation",
    objective: "Automatizar tareas y flujos con scripts y pipelines",
    knowledgeTitle: "Conocimientos de automatización",
    goalRe: /automat/,
    focus: "scripting y automatización",
    deliverable: {
      title: "Flujo automatizado de punta a punta",
      description: "Un script o pipeline que ahorre una tarea real: entrada, proceso, registro de lo ocurrido y manejo de errores.",
      criteria: ["Se ejecuta sin intervención manual", "Deja un registro de lo que hizo", "Falla con mensajes claros y es idempotente"],
    },
  },
  {
    id: "logic",
    name: "Lógica de programación",
    objective: "Entrenar la resolución de problemas y las habilidades de entrevista, sin importar el lenguaje",
    knowledgeTitle: "Problemas y patrones",
    goalRe: /l[oó]gica|algoritm|entrevista|leetcode|hackerrank|resoluci[oó]n de problemas|problem solving/,
    focus: "resolución de problemas",
    deliverable: {
      title: "Carpeta de problemas resueltos con su análisis",
      description: "Un conjunto de problemas de entrevista resueltos por patrón y dificultad, cada uno con su razonamiento, su complejidad y sus casos límite.",
      criteria: ["Cada problema tiene ejemplos y casos límite probados", "Indica la complejidad en tiempo y espacio y por qué", "Hay al menos un problema difícil resuelto sin ayuda"],
    },
  },
  {
    id: "tooling",
    name: "Tooling and Quality",
    objective: "Trabajar con Git, pruebas y calidad de código",
    knowledgeTitle: "Herramientas y calidad",
    goalRe: /tooling|calidad|quality|\bgit\b|testing|herramientas/,
    focus: "herramientas y calidad",
    deliverable: {
      title: "Repositorio con pruebas, linters e integración continua",
      description: "Un proyecto con historial limpio de Git, pruebas, linters y una pipeline de CI que se ejecuta en cada cambio.",
      criteria: ["Historial de commits claro", "CI que corre pruebas y linters", "README con cómo ejecutar y contribuir"],
    },
  },
  {
    id: "desktop",
    name: "Desktop",
    objective: "Construir aplicaciones de escritorio",
    knowledgeTitle: "Conocimientos de escritorio",
    goalRe: /desktop|escritorio|electron/,
    focus: "aplicaciones de escritorio",
    deliverable: {
      title: "Aplicación de escritorio empaquetada",
      description: "Una app de escritorio con ventana, acceso a archivos y un instalador generado.",
      criteria: ["Se instala y se abre", "Guarda datos del usuario de forma segura", "Se puede actualizar sin perder datos"],
    },
  },
  {
    id: "mobile",
    name: "Mobile",
    objective: "Construir aplicaciones móviles",
    knowledgeTitle: "Conocimientos de móvil",
    goalRe: /mobile|movil|android|\bios\b/,
    focus: "aplicaciones móviles",
    deliverable: {
      title: "Aplicación móvil con datos persistentes",
      description: "Una app móvil con navegación, almacenamiento local y consumo de una API.",
      criteria: ["Funciona sin conexión para lo básico", "Navegación y estados de carga claros", "Se prueba en emulador o dispositivo"],
    },
  },
];

/** Orden de secuencia por defecto (lo que va antes en el plan). */
export const SEQUENCE_ORDER: readonly string[] = ["backend", "databases", "frontend", "logic", "automation", "tooling", "desktop", "mobile"];
export const MAX_PARALLEL_AREAS = 2;

const AREA_BY_ID = new Map(AREA_DEFS.map((a) => [a.id, a]));
export const areaDef = (id: string): AreaDef | undefined => AREA_BY_ID.get(id);

const fold = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const cleanBranch = (n: string): string => n.replace(/^[\d.\s_-]+/, "").trim() || n;
const slug = (s: string): string => fold(s).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "x";
const naturalCmp = (a: string, b: string): number => a.localeCompare(b, "es", { numeric: true, sensitivity: "base" });
export const isCustomArea = (id: string): boolean => id.startsWith("x-");

// ── Tabla rama de carpeta → área elemental + grupo interno ──────────────

/** Clase de la rama → área elemental fija (grupo «Conocimientos»). `fundamentals` y `language` dependen del alcance y van aparte. */
export const BRANCH_AREA_TABLE: ReadonlyArray<{ klass: BranchClass; areaId: string }> = [
  { klass: "backend", areaId: "backend" },
  { klass: "frontend", areaId: "frontend" },
  { klass: "databases", areaId: "databases" },
  { klass: "automation", areaId: "automation" },
  { klass: "tooling", areaId: "tooling" },
  { klass: "logic", areaId: "logic" },
  { klass: "desktop", areaId: "desktop" },
  { klass: "mobile", areaId: "mobile" },
];

/** Lenguaje → áreas preferidas, en orden: la primera que esté en el alcance se lleva el grupo «Lenguaje». */
export const LANGUAGE_AREA_CHAIN: Readonly<Record<string, readonly string[]>> = {
  python: ["backend", "automation"],
  javascript: ["frontend", "backend"],
  typescript: ["frontend", "backend"],
};
export const DEFAULT_LANGUAGE_CHAIN: readonly string[] = ["backend", "frontend", "automation"];

const LANGUAGE_NAMES: Record<string, string> = { python: "Python", javascript: "JavaScript", typescript: "TypeScript" };

/** ¿Es la rama de la pista de práctica (no un área del plan)? */
export const isPracticeBranch = (branch: string): boolean => /programming[\s_-]?practice/.test(fold(branch));

/** Clave del lenguaje de una rama «2.1 Python» → «python» (las conocidas) o su nombre limpio. */
export function languageKey(branch: string): string {
  const n = fold(cleanBranch(branch));
  for (const k of Object.keys(LANGUAGE_AREA_CHAIN)) if (n.includes(k)) return k;
  return slug(n);
}
const languageName = (branch: string): string => LANGUAGE_NAMES[languageKey(branch)] ?? cleanBranch(branch);

export interface BranchPlacement {
  areaId: string;
  areaName: string;
  group: AreaGroup;
}

const BASES_GROUP: AreaGroup = { id: "bases", title: "Bases", kind: "bases", order: 0 };
export const CORE_GROUP_ID = "core";

export const areaNameOf = (id: string, fallback = ""): string => AREA_BY_ID.get(id)?.name ?? fallback;

function knowledgeGroup(areaId: string, order = 100): AreaGroup {
  const d = AREA_BY_ID.get(areaId);
  return { id: CORE_GROUP_ID, title: d?.knowledgeTitle ?? "Temas", kind: "knowledge", order };
}

/**
 * Coloca las ramas de UN espacio de programación (nombres de carpeta de 2.º nivel) en áreas elementales. Devuelve `null` para las ramas
 * que no entran (la pista `programming_practice`). El alcance son las propias ramas dadas: Backend «no está en el alcance» si ninguna es de
 * backend.
 */
export function placeBranches(branches: readonly string[]): Map<string, BranchPlacement | null> {
  const out = new Map<string, BranchPlacement | null>();
  const real = [...new Set(branches)].filter((b) => b && !isPracticeBranch(b)).sort(naturalCmp);
  for (const b of branches) if (isPracticeBranch(b)) out.set(b, null);
  const scope = new Set<string>();
  const direct = new Map<string, string>();
  for (const b of real) {
    const k = classifyBranch(b);
    const row = BRANCH_AREA_TABLE.find((r) => r.klass === k);
    if (row) {
      direct.set(b, row.areaId);
      scope.add(row.areaId);
    }
  }
  const order = (ids: Iterable<string>): string[] => [...ids].sort((a, b) => SEQUENCE_ORDER.indexOf(a) - SEQUENCE_ORDER.indexOf(b));
  // lenguajes: la primera área de su cadena que esté en el alcance; si ninguna, la primera del alcance; si no hay alcance, la primera de la cadena
  const languages = real.filter((b) => classifyBranch(b) === "language");
  const langArea = new Map<string, string>();
  for (const b of languages) {
    const chain = LANGUAGE_AREA_CHAIN[languageKey(b)] ?? DEFAULT_LANGUAGE_CHAIN;
    const hit = chain.find((a) => scope.has(a)) ?? order(scope)[0] ?? chain[0]!;
    langArea.set(b, hit);
  }
  for (const a of langArea.values()) scope.add(a);
  const customOf = (b: string): string => `x-${slug(b)}`;
  const all = new Set<string>(scope);
  for (const b of real) if (!direct.has(b) && !langArea.has(b) && classifyBranch(b) !== "fundamentals") all.add(customOf(b));
  const firstArea = order([...all].filter((a) => !isCustomArea(a)))[0] ?? [...all].sort()[0] ?? "backend";
  languages.forEach((b, i) => {
    const areaId = langArea.get(b)!;
    out.set(b, { areaId, areaName: areaNameOf(areaId), group: { id: `lang-${languageKey(b)}`, title: `Lenguaje: ${languageName(b)}`, kind: "language", order: 10 + i } });
  });
  for (const b of real) {
    if (out.has(b)) continue;
    const k = classifyBranch(b);
    if (k === "fundamentals") out.set(b, { areaId: firstArea, areaName: areaNameOf(firstArea, firstArea), group: BASES_GROUP });
    else if (direct.has(b)) out.set(b, { areaId: direct.get(b)!, areaName: areaNameOf(direct.get(b)!), group: knowledgeGroup(direct.get(b)!) });
    else {
      const id = customOf(b);
      out.set(b, { areaId: id, areaName: cleanBranch(b), group: { id: CORE_GROUP_ID, title: cleanBranch(b), kind: "knowledge", order: 100 } });
    }
  }
  return out;
}

/** ¿Hay en el espacio alguna rama de programación? (si no, no se aplica la tabla: cada materia es su propia área). */
export function isProgrammingSpace(branches: readonly string[]): boolean {
  return branches.some((b) => {
    const k = classifyBranch(b);
    return k === "language" || BRANCH_AREA_TABLE.some((r) => r.klass === k);
  });
}

// ── Cubos por área ──────────────────────────────────────────────────────

export interface TopicLike {
  folder: string;
}

export interface AreaBucket<T extends TopicLike> {
  areaId: string;
  name: string;
  groups: AreaGroup[];
  /** temas en orden: por grupo (Bases → Lenguaje → Conocimientos) y, dentro, por orden natural de carpeta */
  topics: Array<T & { group: string }>;
}

/**
 * Reparte temas (cualquier materia) en áreas del plan. Los de materias de programación siguen `placeBranches`; los de otras materias
 * forman su propia área (la materia) con una rama = un grupo. Orden de áreas: secuencia por defecto y las demás después, por nombre.
 */
export function bucketByArea<T extends TopicLike>(topics: readonly T[], opts: { keepOrder?: boolean } = {}): Array<AreaBucket<T>> {
  const bySpace = new Map<string, T[]>();
  for (const t of topics) {
    const sp = areaOfFolder(t.folder);
    bySpace.set(sp, [...(bySpace.get(sp) ?? []), t]);
  }
  const buckets = new Map<string, AreaBucket<T>>();
  const put = (areaId: string, name: string, g: AreaGroup, t: T): void => {
    const b = buckets.get(areaId) ?? { areaId, name, groups: [], topics: [] };
    if (!b.groups.some((x) => x.id === g.id)) b.groups.push(g);
    b.topics.push({ ...t, group: g.id });
    buckets.set(areaId, b);
  };
  for (const [space, list] of bySpace) {
    const branches = [...new Set(list.map((t) => branchOfFolder(t.folder)).filter(Boolean))];
    if (isProgrammingSpace(branches)) {
      const placed = placeBranches(branches);
      for (const t of list) {
        const p = placed.get(branchOfFolder(t.folder));
        if (p === null) continue; // programming_practice: no es un área del plan
        if (p) put(p.areaId, p.areaName, p.group, t);
        else put("x-" + slug(space), space, { id: CORE_GROUP_ID, title: "Temas", kind: "knowledge", order: 100 }, t);
      }
    } else {
      const names = [...new Set(branches)].sort(naturalCmp);
      for (const t of list) {
        const br = branchOfFolder(t.folder);
        const g: AreaGroup = br ? { id: `b-${slug(br)}`, title: cleanBranch(br), kind: "knowledge", order: 100 + names.indexOf(br) } : { id: CORE_GROUP_ID, title: "Temas", kind: "knowledge", order: 100 };
        put(`x-${slug(space)}`, space, g, t);
      }
    }
  }
  const rank = (id: string): number => {
    const i = SEQUENCE_ORDER.indexOf(id);
    return i >= 0 ? i : 100;
  };
  const out = [...buckets.values()].sort((a, b) => rank(a.areaId) - rank(b.areaId) || naturalCmp(a.name, b.name));
  for (const b of out) {
    b.groups.sort((x, y) => x.order - y.order || naturalCmp(x.title, y.title));
    const gi = new Map(b.groups.map((g, i) => [g.id, i]));
    // orden estable: por grupo y, dentro, el orden natural de carpeta
    b.topics = b.topics
      .map((t, i) => ({ t, i }))
      .sort((x, y) => gi.get(x.t.group)! - gi.get(y.t.group)! || (opts.keepOrder ? 0 : naturalCmp(x.t.folder, y.t.folder)) || x.i - y.i)
      .map((x) => x.t);
  }
  return out;
}

/** Reordena (estable) temas de un área por el orden de sus grupos, respetando el orden relativo de cada grupo (p. ej. lo que eligió la IA). */
export function sortByGroupOrder<T extends { group?: string }>(topics: readonly T[], groups: readonly AreaGroup[] | undefined): T[] {
  if (!groups?.length) return [...topics];
  const rank = new Map(groups.map((g) => [g.id, g.order]));
  return topics.map((t, i) => ({ t, i })).sort((a, b) => (rank.get(a.t.group ?? "") ?? 1000) - (rank.get(b.t.group ?? "") ?? 1000) || a.i - b.i).map((x) => x.t);
}

// ── Fases: secuencia determinista con un máximo de 2 áreas en paralelo ──

export interface PhaseInput {
  key: string;
  /** peso (minutos o el que propone el esqueleto): reparte el tiempo y la capacidad */
  weight: number;
  /** áreas consecutivas con el mismo grupo van EN PARALELO (Backend ‖ Databases · Automation ‖ Tooling); sin grupo, el área va sola */
  group?: string;
  /** área elemental (para el modo «juntas»: Automation siempre va al final) */
  areaId?: string;
}

/** Qué áreas van en paralelo por defecto (datos): Backend ‖ Databases · Automation ‖ Tooling · Desktop ‖ Mobile; Frontend va sola. */
export const PARALLEL_GROUP: Readonly<Record<string, string>> = { backend: "datos", databases: "datos", automation: "ops", tooling: "ops", desktop: "clientes", mobile: "clientes" };

interface PhaseUnit {
  keys: string[];
  weight: number;
}

/** Simula semana a semana con la capacidad de cada semana y devuelve la ventana (semanas) de cada unidad. */
function simulatePhases(units: readonly PhaseUnit[], weekCapacity: readonly number[], maxParallel: number): AreaPhase[] {
  const W = Math.max(1, weekCapacity.length);
  const items = units.map((u) => ({ weight: Math.max(1, u.weight), done: 0, from: 0, to: 0 }));
  if (!items.length) return [];
  const totalW = items.reduce((n, a) => n + a.weight, 0);
  const totalC = weekCapacity.reduce((n, c) => n + Math.max(0, c), 0);
  const queue = [...items];
  const active: typeof items = [];
  const start = (w: number): void => {
    while (active.length < maxParallel && queue.length) {
      const a = queue.shift()!;
      a.from = w;
      active.push(a);
    }
  };
  start(1);
  // lo que sobra de una semana cuando una unidad termina pasa a la siguiente: una unidad nueva nunca empieza A MITAD de semana (si no, esa
  // semana tendría más áreas con ventana abierta de las permitidas en paralelo)
  let carry = 0;
  for (let w = 1; w <= W && active.length; w++) {
    let budget = (totalC > 0 ? (Math.max(0, weekCapacity[w - 1] ?? 0) * totalW) / totalC : totalW / W) + carry;
    carry = 0;
    for (let guard = 0; guard < 12 && budget > 1e-6 && active.length; guard++) {
      const sum = active.reduce((n, a) => n + a.weight, 0);
      let used = 0;
      for (const a of [...active]) {
        const give = Math.min((budget * a.weight) / sum, a.weight - a.done);
        a.done += give;
        used += give;
        if (a.weight - a.done <= 1e-6) {
          a.to = w;
          active.splice(active.indexOf(a), 1);
        }
      }
      budget -= used;
      if (used <= 1e-9) break;
    }
    if (budget > 1e-6 && !active.length) carry = budget;
    if (w < W) start(w + 1);
  }
  return items.map((a) => {
    const from = a.from || W;
    const to = Math.max(from, a.to || W);
    return { fromWeek: from, toWeek: to };
  });
}

/**
 * Secuencia las áreas por FASES (rangos de semanas distintos, no todas en todo el periodo), con como máximo `maxParallel` áreas en paralelo.
 * El orden de la lista es el que propone la IA (o el de la secuencia por defecto) y los pesos reparten el tiempo. Si las entradas traen
 * `group`, las consecutivas con el mismo grupo forman una FASE (p. ej. Backend ‖ Databases) y las fases van una tras otra; sin grupos, se
 * simulan `maxParallel` carriles. En cada semana la capacidad se reparte entre lo que está activo por su peso; con holgura, la velocidad
 * se escala para que todo el plan termine al final del periodo.
 */
export function planAreaPhases(areas: readonly PhaseInput[], weekCapacity: readonly number[], maxParallel = MAX_PARALLEL_AREAS): Record<string, AreaPhase> {
  const out: Record<string, AreaPhase> = {};
  if (!areas.length) return out;
  const grouped = areas.some((a) => a.group);
  const units: Array<PhaseUnit & { group?: string }> = [];
  for (const a of areas) {
    const last = units[units.length - 1];
    if (grouped && a.group && last && last.group === a.group && last.keys.length < maxParallel) {
      last.keys.push(a.key);
      last.weight += Math.max(1, a.weight);
    } else units.push({ keys: [a.key], weight: Math.max(1, a.weight), ...(a.group ? { group: a.group } : {}) });
  }
  const phases = simulatePhases(units, weekCapacity, grouped ? 1 : maxParallel);
  units.forEach((u, i) => {
    for (const k of u.keys) out[k] = phases[i]!;
  });
  return out;
}

/** Fracción MÍNIMA del periodo (por capacidad) que ocupa Automation al final en el modo «juntas»; si su peso natural es mayor, se respeta el peso. */
export const AUTOMATION_TAIL_MIN = 0.15;
/** Fracción máxima del periodo que Automation puede quitar al resto. */
export const AUTOMATION_TAIL_MAX = 0.35;

/**
 * Fases del modo «JUNTAS» (`areaMode: "together"`): TODAS las áreas (Backend, Frontend, Databases y también Tooling and Quality) están activas
 * desde la semana 1, salvo Automation, que va SIEMPRE AL FINAL («automatización es solo Python»): ocupa las últimas semanas, al menos el
 * ~15 % de la capacidad del periodo (o su peso natural si es mayor, con un máximo del 35 %). El corte se calcula con la capacidad semanal.
 * Cuando empieza Automation el resto sigue presente como práctica y proyectos de mantenimiento (ver `planDayFocus.ts`), no desaparece.
 * Sin Automation (o solo Automation) todas ocupan el periodo entero. Con una sola semana, todas coinciden en ella.
 */
export function planTogetherPhases(areas: readonly PhaseInput[], weekCapacity: readonly number[]): Record<string, AreaPhase> {
  const out: Record<string, AreaPhase> = {};
  const W = Math.max(1, weekCapacity.length);
  const main = areas.filter((a) => a.areaId !== "automation");
  const tail = areas.filter((a) => a.areaId === "automation");
  if (!main.length || !tail.length || W < 2) {
    for (const a of areas) out[a.key] = { fromWeek: 1, toWeek: W };
    return out;
  }
  const wm = main.reduce((n, a) => n + Math.max(1, a.weight), 0);
  const wt = tail.reduce((n, a) => n + Math.max(1, a.weight), 0);
  const tailFrac = Math.min(AUTOMATION_TAIL_MAX, Math.max(AUTOMATION_TAIL_MIN, wt / (wm + wt)));
  const frac = 1 - tailFrac;
  const total = weekCapacity.reduce((n, c) => n + Math.max(0, c), 0);
  let cut: number;
  if (total > 0) {
    // la última semana que cabe antes de que empiece Automation: así su cola nunca es menor que la fracción pedida
    let acc = 0;
    cut = 0;
    for (let w = 1; w <= W; w++) {
      acc += Math.max(0, weekCapacity[w - 1] ?? 0);
      if (acc > total * frac + 1e-6) break;
      cut = w;
    }
  } else cut = Math.floor(W * frac);
  cut = Math.min(W - 1, Math.max(1, cut));
  for (const a of main) out[a.key] = { fromWeek: 1, toWeek: cut };
  for (const a of tail) out[a.key] = { fromWeek: cut + 1, toWeek: W };
  return out;
}

/** El máximo de áreas solapadas en una semana cualquiera (para validar y probar). */
export function maxOverlap(phases: Record<string, AreaPhase>): number {
  const ws = Object.values(phases);
  const weeks = Math.max(0, ...ws.map((p) => p.toWeek));
  let max = 0;
  for (let w = 1; w <= weeks; w++) max = Math.max(max, ws.filter((p) => p.fromWeek <= w && w <= p.toWeek).length);
  return max;
}

/**
 * Valida un `phase` que llegue de fuera (IA, disco): números enteros ≥ 1 con `fromWeek` ≤ `toWeek`, acotados al nº de semanas.
 */
export function sanitizePhase(raw: unknown, weeks: number): AreaPhase | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const a = Math.round(Number(o.fromWeek));
  const b = Math.round(Number(o.toWeek));
  if (!Number.isFinite(a) || !Number.isFinite(b) || a < 1) return undefined;
  const to = Math.min(weeks, Math.max(a, b));
  const from = Math.min(a, weeks);
  return { fromWeek: from, toWeek: Math.max(from, to) };
}

/** Grupos válidos que llegan de fuera (disco, borrador). */
export function sanitizeGroups(raw: unknown): AreaGroup[] {
  const out: AreaGroup[] = [];
  const seen = new Set<string>();
  for (const g of Array.isArray(raw) ? raw : []) {
    const id = typeof g?.id === "string" ? g.id.trim().slice(0, 40) : "";
    const title = typeof g?.title === "string" ? g.title.replace(/\s+/g, " ").trim().slice(0, 80) : "";
    const kind: GroupKind = g?.kind === "bases" || g?.kind === "language" ? g.kind : "knowledge";
    if (!id || !title || seen.has(id)) continue;
    seen.add(id);
    const order = Number.isFinite(Number(g.order)) ? Math.round(Number(g.order)) : kind === "bases" ? 0 : kind === "language" ? 10 : 100;
    out.push({ id, title, kind, order });
  }
  return out.slice(0, 32);
}

// ── Lectura segura de lo guardado en el plan (entregables y propósitos) ──

const oneLineOf = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const DATE_OK = /^\d{4}-\d{2}-\d{2}$/;

/** Entregables guardados válidos (ediciones de estado/archivos y extras); `id` único. */
export function sanitizePlanDeliverables(raw: unknown): PlanDeliverable[] {
  const out: PlanDeliverable[] = [];
  const seen = new Set<string>();
  for (const d of Array.isArray(raw) ? raw : []) {
    const id = oneLineOf(d?.id, 60);
    const kind = (AREA_DELIVERABLE_KINDS as readonly string[]).includes(String(d?.kind)) ? (d.kind as PlanDeliverableKind) : null;
    if (!id || !kind || seen.has(id) || !DATE_OK.test(String(d?.dueDate ?? ""))) continue;
    seen.add(id);
    const status = (PLAN_DELIVERABLE_STATUSES as readonly string[]).includes(String(d.status)) ? (d.status as PlanDeliverableStatus) : "pendiente";
    const files = (Array.isArray(d.files) ? d.files : [])
      .map((f: any) => ({ ...(oneLineOf(f?.path, 300) ? { path: oneLineOf(f.path, 300) } : {}), note: oneLineOf(f?.note, 200) }))
      .filter((f: { note: string; path?: string }) => f.note || f.path)
      .slice(0, 12);
    const criteria = (Array.isArray(d.criteria) ? d.criteria : []).map((c: unknown) => oneLineOf(c, 200)).filter(Boolean).slice(0, 8);
    out.push({
      id,
      kind,
      title: oneLineOf(d.title, 140) || id,
      description: oneLineOf(d.description, 600),
      ...(oneLineOf(d.areaId, 40) ? { areaId: oneLineOf(d.areaId, 40) } : {}),
      ...(Array.isArray(d.areaIds) && d.areaIds.length ? { areaIds: [...new Set(d.areaIds.map((a: unknown) => oneLineOf(a, 40)).filter(Boolean))].slice(0, 12) as string[] } : {}),
      dueDate: String(d.dueDate),
      ...(files.length ? { files } : {}),
      criteria,
      status,
      source: d.source === "ai" ? "ai" : "practice",
    });
  }
  return out.slice(0, 600);
}

/** Propósitos escritos a mano válidos (claves de fecha, nº de semana y AAAA-MM). */
export function sanitizePurposes(raw: unknown): PlanPurposes | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, any>;
  const pick = (v: unknown, keyOk: (k: string) => boolean): Record<string, string> | undefined => {
    const r: Record<string, string> = {};
    for (const [k, t] of Object.entries(v && typeof v === "object" ? (v as object) : {})) {
      const text = oneLineOf(t, 300);
      if (keyOk(k) && text) r[k] = text;
    }
    return Object.keys(r).length ? r : undefined;
  };
  const day = pick(o.day, (k) => DATE_OK.test(k));
  const week = pick(o.week, (k) => /^\d{1,3}$/.test(k));
  const month = pick(o.month, (k) => /^\d{4}-\d{2}$/.test(k));
  return day || week || month ? { ...(day ? { day } : {}), ...(week ? { week } : {}), ...(month ? { month } : {}) } : undefined;
}

// ── Nombre del plan a partir de las áreas ───────────────────────────────

const MONTHS_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const dmShort = (iso: string): string => `${Number(iso.slice(8))} ${MONTHS_ES[Number(iso.slice(5, 7)) - 1]}`;

/** «Full stack web» si hay Backend y Frontend; el área si es una sola; si no, hasta tres áreas con « + ». Sin sufijos «+N». */
export function areasTitle(areas: ReadonlyArray<{ areaId?: string; area: string }>): string {
  const names: string[] = [];
  const ids = new Set(areas.map((a) => a.areaId).filter(Boolean) as string[]);
  for (const a of areas) if (!names.includes(a.area)) names.push(a.area);
  if (ids.has("backend") && ids.has("frontend")) return "Full stack web";
  if (!names.length) return "Plan";
  if (names.length <= 3) return names.join(" + ");
  return `${names.slice(0, 3).join(" + ")} y más`;
}

/** Nombre autogenerado: «Full stack web · 6 oct–5 abr» (el periodo aparece UNA vez). */
export function areasPlanName(areas: ReadonlyArray<{ areaId?: string; area: string }>, start: string, end: string): string {
  return `${areasTitle(areas)} · ${dmShort(start)}–${dmShort(end)}`;
}

/** ¿Parece un nombre autogenerado antiguo («… +9 · 6 oct–5 abr»)? Solo esos se regeneran al reorganizar; los editados a mano se respetan. */
export function isAutoPlanName(name: string | undefined): boolean {
  if (!name?.trim()) return true;
  return /\s\+\d+\s·\s\d+\s[a-zñ]{3}[–-]\d+\s[a-zñ]{3}$/i.test(name.trim());
}

// ── Textos del plan saneados ────────────────────────────────────────────

const GLUED = /\b(incluir|excluir|quitar|añadir|agregar|evitar|poner|usar)(desktop|mobile|móvil|movil|backend|frontend|python|javascript|typescript|sql|docker|git)\b/gi;

/** Texto libre del estudiante tal como se enseña: espacios normalizados, palabras pegadas («incluirdesktop») separadas, primera mayúscula. */
export function tidyNotes(text: string): string {
  const t = text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(GLUED, "$1 $2")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "";
}

const RULES_NOTE_RE = /\s*Temas en el orden natural de la materia \(sin la selecci[oó]n de la IA\)\.?/gi;

/** Separa de una nota de subplan antigua el aviso interno «sin la selección de la IA» (se enseña como aviso claro, no como nota). */
export function splitNotes(notes: string | undefined): { note: string; rulesFallback: boolean } {
  const raw = notes ?? "";
  const rulesFallback = new RegExp(RULES_NOTE_RE.source, "i").test(raw);
  return { note: raw.replace(RULES_NOTE_RE, "").replace(/\s+/g, " ").trim(), rulesFallback };
}

/** Etiqueta corta de un área para los chips «Plan: …»: sin puntos suspensivos si el nombre cabe. */
export function planChipLabel(name: string, max = 40): string {
  const t = name.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trim()}…`;
}

// ── Cómo se combinan las áreas: resolución del modo ─────────────────────

export type AreaModeSource = "user" | "ai" | "rules";
export interface ResolvedAreaModeInfo {
  mode: "together" | "phased";
  /** una línea de justificación visible («Backend, Frontend y Databases juntas cada día porque…») */
  why: string;
  by: AreaModeSource;
}

const AREA_LABEL = (id: string): string => areaNameOf(id, id);
const joinNames = (ids: readonly string[]): string => {
  const n = ids.map(AREA_LABEL);
  return n.length <= 1 ? (n[0] ?? "") : `${n.slice(0, -1).join(", ")} y ${n[n.length - 1]}`;
};

/** Sugerencia determinista (sin IA): Frontend + Backend (con o sin Databases) van juntas; el resto, por fases. */
export function suggestAreaMode(areaIds: readonly string[]): "together" | "phased" {
  return areaIds.includes("frontend") && areaIds.includes("backend") ? "together" : "phased";
}

/**
 * Decide el modo del plan a partir de lo que el estudiante eligió al crearlo (`pre.areaMode`) y, si dejó que decida el Mentor, de su propuesta
 * (ya validada) o de la regla `suggestAreaMode`. `undefined` = el plan no declara modo (planes antiguos: por fases como siempre).
 * Automation siempre va al final en cualquier modo: se cuenta en el texto de justificación.
 */
export function resolveAreaMode(choice: string | undefined, areaIds: readonly string[], proposal?: { mode?: unknown; why?: unknown; by?: unknown } | null): ResolvedAreaModeInfo | undefined {
  const real = areaIds.filter((a) => !isCustomArea(a));
  const tail = real.includes("automation") && real.length > 1 ? " Automation va siempre al final." : "";
  // sin elección explícita: con 2 o más áreas, TODAS desde el día 1 (Automation al final); con una sola no hay nada que combinar
  if (!choice) {
    // un plan que ya declara su modo lo conserva al recalcularse
    const given = proposal?.mode === "together" || proposal?.mode === "phased" ? proposal.mode : undefined;
    if (given) return { mode: given, by: proposal?.by === "ai" || proposal?.by === "user" ? proposal.by : "rules", why: oneLineOf(proposal?.why, 300) || (given === "together" ? `Todas las áreas activas desde el día 1.${tail}` : `Áreas por fases, como máximo ${MAX_PARALLEL_AREAS} en paralelo.${tail}`) };
    return areaIds.length >= 2 ? { mode: "together", by: "rules", why: `Por defecto, ${joinNames(real) || "las áreas"} juntas desde el día 1: todas activas desde la primera semana y presentes cada día.${tail}` } : undefined;
  }
  if (choice === "together") return { mode: "together", by: "user", why: `Elegiste estudiar ${joinNames(real) || "las áreas"} juntas desde el día 1: todas activas desde la primera semana y presentes cada día.${tail}` };
  if (choice === "phased") return { mode: "phased", by: "user", why: `Elegiste áreas separadas por fases (como máximo ${MAX_PARALLEL_AREAS} en paralelo).${tail}` };
  if (choice !== "ai") return undefined;
  const pm = proposal?.mode === "together" || proposal?.mode === "phased" ? proposal.mode : undefined;
  const pw = oneLineOf(proposal?.why, 240);
  if (pm && pw) return { mode: pm, by: proposal?.by === "rules" ? "rules" : "ai", why: pw };
  const mode = suggestAreaMode(real);
  return {
    mode,
    by: "rules",
    why:
      mode === "together"
        ? `Frontend y Backend van juntas cada día (con ${real.includes("databases") ? "Databases" : "sus bases de datos"} y los proyectos integrados) porque necesitas ver el stack completo.${tail}`
        : `Con ${joinNames(real) || "estas áreas"} lo más claro es separarlas por fases, como máximo ${MAX_PARALLEL_AREAS} en paralelo.${tail}`,
  };
}
