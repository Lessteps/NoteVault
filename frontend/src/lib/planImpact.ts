// Chat de notas vs. Mentor: quién manda sobre qué.
//
//  - El PLAN del Mentor es dueño del QUÉ y el CUÁNDO: qué temas, en qué orden, a qué ritmo (se deriva de la ruta y del avance).
//  - El chat de notas solo es dueño del CONTENIDO de un tema (teoría, mapa, matriz de práctica, ejercicios).
//
// Las acciones de CONTENIDO no mueven nada del plan (la carpeta, el nombre y la posición del tema no cambian). Las acciones
// ESTRUCTURALES (temario, tema nuevo, área nueva, espacio) añaden, renombran, quitan o mueven temas y pueden cambiar la ruta.
// Este módulo es PURO: dado un tipo de acción, su objetivo y los planes guardados, dice qué planes / áreas / temas toca y si
// la acción debe BLOQUEARSE (renombrar o quitar un tema que está en la ruta de un plan). Los efectos (diálogo, bitácora) viven en
// `planImpactGuard.ts`.

export type StructuralKind =
  /** temas nuevos en un área o espacio que ya existe (temario, «Nuevo tema en un área») */
  | "add_topics"
  /** un área nueva dentro de un espacio */
  | "add_area"
  /** un espacio nuevo */
  | "add_space"
  | "rename_topic"
  | "remove_topic"
  | "move_topic";

export const CONTENT_BADGE = "Contenido del tema";
export const STRUCTURE_BADGE = "Cambia la ruta";

/** Lo mínimo que se necesita de un plan guardado (un `MentorPlan` lo cumple). */
export interface PlanLike {
  id: string;
  name?: string;
  archived?: boolean;
  /** `terminado` o `propuesto` no cuentan: ya no gobiernan lo que toca hoy */
  status?: string;
  start?: string;
  end?: string;
  subplans: Array<{ id: string; area: string; areaId?: string; topics: Array<{ folder: string }> }>;
}

/** Objetivo de la acción, en carpetas de la vault (`Espacio`, `Espacio/Área`, `Espacio/Área/Tema`). */
export interface ImpactTarget {
  space: string;
  area?: string;
  topic?: string;
}

export interface ImpactArea {
  subplanId: string;
  /** nombre del área del plan (Backend…) */
  area: string;
  /** temas de la ruta del área que están dentro del objetivo */
  topics: number;
}

export interface PlanImpact {
  planId: string;
  planName: string;
  areas: ImpactArea[];
  /** total de temas del plan dentro del objetivo */
  topics: number;
}

export interface ImpactResult {
  impacted: PlanImpact[];
  /** renombrar / quitar / mover un tema de la ruta no se hace desde el chat */
  blocked: boolean;
  /** por qué se bloquea (vacío si no) */
  reason: string;
}

const norm = (p: string): string => p.replace(/\\/g, "/").split("/").map((x) => x.trim()).filter(Boolean).join("/");

/** La carpeta que nombra el objetivo. */
export function targetFolder(t: ImpactTarget): string {
  return norm([t.space, t.area ?? "", t.topic ?? ""].filter(Boolean).join("/"));
}

/** ¿`folder` es `prefix` o está dentro de él? */
const within = (folder: string, prefix: string): boolean => {
  const f = norm(folder);
  return !!prefix && (f === prefix || f.startsWith(`${prefix}/`));
};

/** Un plan cuenta si no está archivado y no ha terminado (ni es una propuesta sin aceptar). */
export function isLivePlan(p: PlanLike): boolean {
  return !p.archived && p.status !== "terminado" && p.status !== "propuesto";
}

/** Los planes vivos cuyas rutas tocan el objetivo, con sus áreas y cuántos temas. */
export function impactedPlans(target: ImpactTarget, plans: readonly PlanLike[]): PlanImpact[] {
  const prefix = targetFolder(target);
  if (!prefix) return [];
  const out: PlanImpact[] = [];
  for (const plan of plans) {
    if (!isLivePlan(plan)) continue;
    const areas: ImpactArea[] = [];
    for (const sp of plan.subplans ?? []) {
      const n = (sp.topics ?? []).filter((t) => within(t.folder, prefix)).length;
      if (n) areas.push({ subplanId: sp.id, area: sp.area, topics: n });
    }
    if (areas.length) out.push({ planId: plan.id, planName: plan.name?.trim() || plan.id, areas, topics: areas.reduce((s, a) => s + a.topics, 0) });
  }
  return out;
}

const REMOVING: readonly StructuralKind[] = ["rename_topic", "remove_topic", "move_topic"];

/**
 * Qué toca una acción estructural. Añadir (temas, área, espacio) solo AVISA: los temas nuevos entran al final de la ruta del área.
 * Renombrar, quitar o mover un tema que está en la ruta de un plan se BLOQUEA: ahí manda el Mentor.
 */
export function planImpact(kind: StructuralKind, target: ImpactTarget, plans: readonly PlanLike[]): ImpactResult {
  const impacted = impactedPlans(target, plans);
  const blocked = REMOVING.includes(kind) && impacted.length > 0;
  return { impacted, blocked, reason: blocked ? blockMessage(kind, target, impacted) : "" };
}

const q = (s: string): string => `«${s}»`;
const nTemas = (n: number): string => `${n} tema${n === 1 ? "" : "s"}`;

/** «Backend, 7 temas» (varias áreas: «Backend, 7 temas; Databases, 2 temas»). */
export function describeAreas(i: PlanImpact): string {
  return i.areas.map((a) => `área ${a.area}, ${nTemas(a.topics)}`).join("; ");
}

/** El texto del diálogo de confirmación (una frase por plan). */
export function confirmMessage(kind: StructuralKind, impacted: readonly PlanImpact[]): string {
  const how =
    kind === "add_topics" || kind === "add_area" || kind === "add_space"
      ? "los temas nuevos entran al final de la ruta del área, el cronograma se recalcula solo según tu progreso y nada de lo ya hecho cambia"
      : "el cronograma se recalcula solo según tu progreso y nada de lo ya hecho cambia";
  const lines = impacted.map((i) => `Esta acción cambia la ruta del plan ${q(i.planName)} (${describeAreas(i)}): ${how}.`);
  return lines.join("\n\n");
}

/** Por qué no se hace desde el chat. */
export function blockMessage(kind: StructuralKind, target: ImpactTarget, impacted: readonly PlanImpact[]): string {
  const what = kind === "rename_topic" ? "renombrar" : kind === "move_topic" ? "mover" : "quitar";
  const name = (target.topic ?? target.area ?? target.space).split("/").pop() ?? "";
  const plans = impacted.map((i) => q(i.planName)).join(", ");
  const thing = target.topic ? "el tema" : target.area ? "el área" : "el espacio";
  return `No se puede ${what} ${q(name)}: ${thing} está en el plan ${plans}; ajústalo desde el Mentor.`;
}

/** La línea que queda en el historial de cambios del plan. */
export function changeNote(kind: StructuralKind, label: string, impact: PlanImpact): { comment: string; summary: string } {
  const verb = kind === "add_space" ? "Espacio nuevo" : kind === "add_area" ? "Área nueva" : "Temas nuevos";
  return {
    comment: `Chat de notas: ${label || verb}`,
    summary: `${verb} en ${describeAreas(impact)}. Entran al final de la ruta del área; el cronograma se recalcula solo.`,
  };
}

// ── Qué acción del chat es estructural ──

/** Los modos del chat que cambian la ruta (los demás solo tocan el contenido de un tema). */
export const STRUCTURAL_MODE_IDS: readonly string[] = ["temario", "tema"];

/** Una acción `nv-action` que añade temas: su tipo y objetivo, o `null` si solo toca contenido. */
export function structuralOfAction(action: { action: string; args: Record<string, unknown> }): { kind: StructuralKind; target: ImpactTarget; label: string } | null {
  const a = action.args ?? {};
  const str = (v: unknown): string => (typeof v === "string" ? norm(v) : "");
  if (action.action === "create_syllabus") {
    const space = str(a.subject);
    return space ? { kind: "add_topics", target: { space }, label: `Temario de ${space}` } : null;
  }
  if (action.action === "create_topic") {
    const [space = "", area = ""] = str(a.area).split("/");
    const topic = a.topic && typeof a.topic === "object" ? ((a.topic as Record<string, unknown>).name ?? (a.topic as Record<string, unknown>).folder) : "";
    return space ? { kind: "add_topics", target: { space, ...(area ? { area } : {}) }, label: `Tema nuevo ${typeof topic === "string" && topic ? q(topic) : ""} en ${[space, area].filter(Boolean).join("/")}`.replace(/\s+/g, " ").trim() } : null;
  }
  return null;
}

// ── Textos del menú del chat ──

/**
 * La etiqueta de una acción ESTRUCTURAL en el menú: «Cambia la ruta», y si hay un plan afectado, el aviso con su nombre.
 * `impact` es lo que toca en el contexto actual (o `null` si no se calculó).
 */
export function structureBadge(impacted: readonly PlanImpact[] | null): string {
  if (!impacted?.length) return STRUCTURE_BADGE;
  const first = impacted[0]!;
  return `${STRUCTURE_BADGE} · Afecta al plan ${q(first.planName)}${impacted.length > 1 ? ` y ${impacted.length - 1} más` : ""}`;
}

/** Por qué las acciones de generar están desactivadas mientras corre una generación del Mentor. */
export const BUSY_MESSAGE = "Hay una generación del Mentor en curso (Ejecutar plan o Regenerar). Espera a que termine.";
