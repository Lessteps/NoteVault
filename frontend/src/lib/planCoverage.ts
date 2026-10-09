// Revisión de COBERTURA del plan del Mentor por área: ¿tiene cada tema del plan su nota de teoría y su práctica (ejercicios) en la vault?
// ¿Qué temas de las ramas del área quedaron fuera del plan? Y, bajo demanda, la revisión de la IA («faltan colas y jobs para un full
// stack de automatización»), validada aquí y guardada en el plan como `coverageReview` (aditivo, ver docs/VAULT_FORMAT.md).
//
// Módulo PURO y compartido (núcleo, API y renderer): sin node:* ni DOM. La IA solo propone: aquí se descartan las sugerencias que ya
// existen como tema de la vault, se normalizan las áreas a las del plan y se recortan los textos. No crea notas ni toca temas.

import { areaOfFolder, branchOfFolder } from "./planTime.js";
import { isPracticeBranch, type AreaGroup } from "./planAreas.js";
import { ARTIFACT_IDS, summarizeDesign, type ArtifactId, type DesignGap, type DesignSummary, type TopicDesign } from "./topicDesign.js";

// ── Cobertura determinista ──────────────────────────────────────────────

/** Lo que la vault sabe de un tema (sale de `TopicSnap`). */
export interface CoverageTopicIn {
  folder: string;
  title: string;
  /** notas de teoría de la carpeta del tema */
  theoryNotes: number;
  /** ejercicios (notas de práctica) del tema */
  exerciseCount: number;
  /** ejercicios que pide el plan de práctica del manifiesto del tema (0/ausente = sin plan) */
  planExercises?: number;
  completenessPct: number;
  /** diseño del tema contra el checklist de la vault (ver `topicDesign.ts`); ausente = no se evaluó */
  design?: TopicDesign;
}

/** Un tema con el diseño incompleto: lo que le falta, en frases concretas. */
export interface DesignTopicRef extends CoverageRef {
  score: number;
  /** todos los artefactos obligatorios están (aunque falten recomendados) */
  complete: boolean;
  type: TopicDesign["topicType"];
  gaps: DesignGap[];
}

export interface CoverageRef {
  folder: string;
  title: string;
}

export interface GroupCoverage {
  id: string;
  title: string;
  total: number;
  /** temas con al menos una nota de teoría */
  theory: number;
  /** temas con al menos un ejercicio */
  practice: number;
  noTheory: CoverageRef[];
  noPractice: CoverageRef[];
  /** temas con ejercicios pero menos de los que pide su plan de práctica */
  shortPractice: CoverageRef[];
  /** temas del plan que ya no están en la vault (sin manifiesto) */
  notFound: CoverageRef[];
  /** diseño de los temas del grupo contra el checklist de la vault (aditivo) */
  design?: DesignSummary;
  /** los temas del grupo con el diseño incompleto (les falta algún artefacto obligatorio) (los de menor puntuación primero; como mucho `MAX_DESIGN_TOPICS`) */
  designTopics?: DesignTopicRef[];
}

export interface AreaCoverage {
  subplanId: string;
  /** clave estable del área: `areaId` en los planes por áreas, el id del subplan en los antiguos */
  key: string;
  area: string;
  total: number;
  theory: number;
  practice: number;
  notFound: number;
  groups: GroupCoverage[];
  /** ramas de la vault que cubre el área («4 Backend», «2.1 Python»…) */
  branches: string[];
  /** temas de esas ramas que NO están en el plan (los completados también, marcados) */
  outOfPlan: Array<CoverageRef & { branch: string; done: boolean }>;
  /** resumen del diseño de los temas del área (aditivo) */
  design?: DesignSummary;
}

export interface PlanCoverage {
  areas: AreaCoverage[];
  totals: { topics: number; theory: number; practice: number; outOfPlan: number; design?: DesignSummary };
  /** el módulo de práctica `programming_practice` está instalado en la vault */
  ppReady: boolean;
}

export interface CoveragePlanLike {
  subplans: ReadonlyArray<{
    id: string;
    area: string;
    areaId?: string;
    groups?: readonly AreaGroup[];
    topics: ReadonlyArray<{ folder: string; title: string; group?: string }>;
  }>;
}

const MAX_OUT_OF_PLAN = 200;
export const MAX_DESIGN_TOPICS = 250;

export const areaKeyOf = (s: { id: string; areaId?: string }): string => s.areaId || s.id;

/** La cobertura de teoría y práctica de cada área del plan contra la vault (`topics` = todos los temas de la vault). */
export function computeCoverage(plan: CoveragePlanLike, topics: readonly CoverageTopicIn[], opts: { ppReady?: boolean } = {}): PlanCoverage {
  const byFolder = new Map(topics.map((t) => [t.folder, t]));
  const inPlan = new Set(plan.subplans.flatMap((s) => s.topics.map((t) => t.folder)));
  const claimed = new Set<string>();
  const areas: AreaCoverage[] = plan.subplans.map((s) => {
    const known = new Set((s.groups ?? []).map((g) => g.id));
    const defs = [...(s.groups ?? [])].sort((a, b) => a.order - b.order).map((g) => ({ id: g.id, title: g.title }));
    if (s.topics.some((t) => !known.has(t.group ?? ""))) defs.push({ id: "", title: defs.length ? "Otros temas" : "Temas" });
    const groups: GroupCoverage[] = defs
      .map((g) => {
        const list = s.topics.filter((t) => (g.id ? t.group === g.id : !known.has(t.group ?? "")));
        const ref = (t: { folder: string; title: string }): CoverageRef => ({ folder: t.folder, title: t.title });
        const found = list.filter((t) => byFolder.has(t.folder));
        const designs = found.map((t) => byFolder.get(t.folder)!.design).filter((d): d is TopicDesign => !!d);
        const designTopics: DesignTopicRef[] = designs
          .filter((d) => !d.complete)
          .sort((a, b) => a.score - b.score || a.folder.localeCompare(b.folder, "es", { numeric: true }))
          .slice(0, MAX_DESIGN_TOPICS)
          .map((d) => ({ folder: d.folder, title: d.title, score: d.score, complete: d.complete, type: d.topicType, gaps: d.gaps }));
        return {
          id: g.id,
          title: g.title,
          total: list.length,
          theory: found.filter((t) => byFolder.get(t.folder)!.theoryNotes > 0).length,
          practice: found.filter((t) => byFolder.get(t.folder)!.exerciseCount > 0).length,
          noTheory: found.filter((t) => byFolder.get(t.folder)!.theoryNotes === 0).map(ref),
          noPractice: found.filter((t) => byFolder.get(t.folder)!.exerciseCount === 0).map(ref),
          shortPractice: found
            .filter((t) => {
              const v = byFolder.get(t.folder)!;
              return v.exerciseCount > 0 && (v.planExercises ?? 0) > v.exerciseCount;
            })
            .map(ref),
          notFound: list.filter((t) => !byFolder.has(t.folder)).map(ref),
          ...(designs.length ? { design: summarizeDesign(designs), designTopics } : {}),
        };
      })
      .filter((g) => g.total > 0);
    const branches = [...new Set(s.topics.map((t) => `${areaOfFolder(t.folder)}/${branchOfFolder(t.folder)}`).filter((b) => !b.endsWith("/") && !isPracticeBranch(b.split("/")[1]!)))];
    const outOfPlan: AreaCoverage["outOfPlan"] = [];
    for (const t of topics) {
      if (inPlan.has(t.folder) || claimed.has(t.folder)) continue;
      const b = `${areaOfFolder(t.folder)}/${branchOfFolder(t.folder)}`;
      if (!branches.includes(b)) continue;
      claimed.add(t.folder);
      if (outOfPlan.length < MAX_OUT_OF_PLAN) outOfPlan.push({ folder: t.folder, title: t.title, branch: branchOfFolder(t.folder), done: t.completenessPct >= 100 });
    }
    outOfPlan.sort((a, b) => a.folder.localeCompare(b.folder, "es", { numeric: true }));
    return {
      subplanId: s.id,
      key: areaKeyOf(s),
      area: s.area,
      total: s.topics.length,
      theory: groups.reduce((n, g) => n + g.theory, 0),
      practice: groups.reduce((n, g) => n + g.practice, 0),
      notFound: groups.reduce((n, g) => n + g.notFound.length, 0),
      groups,
      branches: branches.map((b) => b.split("/")[1]!),
      outOfPlan,
      ...(groups.some((g) => g.design) ? { design: mergeDesign(groups.map((g) => g.design).filter((d): d is DesignSummary => !!d)) } : {}),
    };
  });
  const allDesign = areas.map((a) => a.design).filter((d): d is DesignSummary => !!d);
  return {
    areas,
    totals: {
      topics: areas.reduce((n, a) => n + a.total, 0),
      theory: areas.reduce((n, a) => n + a.theory, 0),
      practice: areas.reduce((n, a) => n + a.practice, 0),
      outOfPlan: areas.reduce((n, a) => n + a.outOfPlan.filter((t) => !t.done).length, 0),
      ...(allDesign.length ? { design: mergeDesign(allDesign) } : {}),
    },
    ppReady: !!opts.ppReady,
  };
}

/** Junta resúmenes de diseño (media ponderada por nº de temas). */
export function mergeDesign(list: readonly DesignSummary[]): DesignSummary {
  const topics = list.reduce((n, d) => n + d.topics, 0);
  const byArtifact: DesignSummary["byArtifact"] = {};
  for (const d of list) for (const id of ARTIFACT_IDS) if (d.byArtifact[id]) byArtifact[id] = (byArtifact[id] ?? 0) + d.byArtifact[id]!;
  return {
    topics,
    avgScore: topics ? Math.round(list.reduce((n, d) => n + d.avgScore * d.topics, 0) / topics) : 0,
    complete: list.reduce((n, d) => n + d.complete, 0),
    incomplete: list.reduce((n, d) => n + d.incomplete, 0),
    requiredGaps: list.reduce((n, d) => n + d.requiredGaps, 0),
    recommendedGaps: list.reduce((n, d) => n + d.recommendedGaps, 0),
    byArtifact,
  };
}

// ── Revisión con IA (guardada en el plan) ───────────────────────────────

/** Un conocimiento que FALTA para el objetivo y que no existe como tema en la vault. */
export interface CoverageSuggestion {
  title: string;
  why: string;
  /** grupo del área donde encajaría (id de `AreaGroup`), si la IA lo dijo y existe */
  groupId?: string;
  /** cuánto importa para el criterio elegido (estimación de la IA) */
  priority?: CoveragePriority;
  /** nivel al que corresponde (junior · mid · senior) */
  level?: SkillLevel;
  /** el estudiante lo añadió al plan como PROPUESTA («Añadir faltante al plan»): no crea ninguna nota */
  accepted?: boolean;
}

export const COVERAGE_PRIORITIES = ["high", "medium", "low"] as const;
export type CoveragePriority = (typeof COVERAGE_PRIORITIES)[number];
export const PRIORITY_LABEL: Record<CoveragePriority, string> = { high: "Prioridad alta", medium: "Prioridad media", low: "Prioridad baja" };
export const SKILL_LEVELS = ["junior", "mid", "senior"] as const;
export type SkillLevel = (typeof SKILL_LEVELS)[number];
export const LEVEL_LABEL: Record<SkillLevel, string> = { junior: "Junior", mid: "Mid-level", senior: "Senior" };

/** Veredicto de un área frente al criterio: se queda corta, es adecuada o tiene de más. */
export const COVERAGE_VERDICTS = ["short", "adequate", "excessive"] as const;
export type CoverageVerdict = (typeof COVERAGE_VERDICTS)[number];
export const VERDICT_LABEL: Record<CoverageVerdict, string> = { short: "Corto", adequate: "Adecuado", excessive: "Excesivo" };

/** Un tema del plan que PUEDE pasar a «fuera de ruta» (demasiado básico o poco necesario para el criterio). */
export interface CoverageDispensable {
  folder: string;
  title: string;
  reason: string;
}

// ── Criterio de la revisión («¿con qué criterio revisamos?») ──

export const CRITERION_PRESETS = ["market", "mid", "interviews", "custom"] as const;
export type CriterionPreset = (typeof CRITERION_PRESETS)[number];
export const CRITERION_LABEL: Record<CriterionPreset, string> = {
  market: "Tendencias del mercado actual (junior hoy)",
  mid: "Nivel mid-level",
  interviews: "Entrevistas técnicas",
  custom: "Lo que yo pida",
};
export const CURRENT_LEVELS = ["auto", "none", "junior", "mid", "senior"] as const;
export type CurrentLevel = (typeof CURRENT_LEVELS)[number];
export const CURRENT_LEVEL_LABEL: Record<CurrentLevel, string> = { auto: "Que lo mida el Mentor (por mi progreso)", none: "Sin experiencia", junior: "Junior", mid: "Mid-level", senior: "Senior" };
export const MAX_CONDITIONS_CHARS = 600;

export interface CoverageCriteria {
  presets: CriterionPreset[];
  targetLevel: SkillLevel;
  currentLevel: CurrentLevel;
  /** condiciones libres del estudiante («compara con ofertas de backend en Python», «prioriza testing»…) */
  conditions: string;
}

export const DEFAULT_CRITERIA: CoverageCriteria = { presets: ["market"], targetLevel: "junior", currentLevel: "auto", conditions: "" };

/** Lectura segura del criterio (de la interfaz o de disco): valores desconocidos vuelven al por defecto; siempre al menos un preset. */
export function sanitizeCriteria(raw: unknown): CoverageCriteria {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const presets = [...new Set((Array.isArray(o.presets) ? o.presets : []).map(String).filter((p): p is CriterionPreset => (CRITERION_PRESETS as readonly string[]).includes(p)))];
  const conditions = String(o.conditions ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_CONDITIONS_CHARS);
  const target = String(o.targetLevel ?? "");
  const current = String(o.currentLevel ?? "");
  if (conditions && !presets.includes("custom")) presets.push("custom");
  return {
    presets: presets.length ? presets : [...DEFAULT_CRITERIA.presets],
    targetLevel: (SKILL_LEVELS as readonly string[]).includes(target) ? (target as SkillLevel) : DEFAULT_CRITERIA.targetLevel,
    currentLevel: (CURRENT_LEVELS as readonly string[]).includes(current) ? (current as CurrentLevel) : DEFAULT_CRITERIA.currentLevel,
    conditions,
  };
}

/** El criterio en una frase legible («Tendencias del mercado actual · nivel objetivo Junior · condiciones: …»). */
export function criteriaText(c: CoverageCriteria): string {
  return [
    c.presets.map((p) => CRITERION_LABEL[p]).join(" + "),
    `nivel objetivo ${LEVEL_LABEL[c.targetLevel]}`,
    c.currentLevel === "auto" ? "nivel actual medido por el Mentor" : `nivel actual ${CURRENT_LEVEL_LABEL[c.currentLevel].toLowerCase()}`,
    c.conditions ? `condiciones: ${c.conditions}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Aviso fijo que acompaña a toda revisión: la IA no tiene datos del mercado en vivo. */
export const COVERAGE_DISCLAIMER =
  "Estimación basada en el conocimiento del modelo de IA y su fecha de corte, sin datos del mercado en vivo: úsala como orientación, no como cifra exacta.";

/** Un tema del plan que sobra o está mal ubicado. */
export interface CoverageMisplaced {
  folder: string;
  title: string;
  reason: string;
  /** clave del área del plan a la que movería el tema */
  suggestedArea?: string;
}

/** Veredicto de la IA sobre el DISEÑO de un tema frente al checklist de la vault: bien diseñado, incompleto o pobre. */
export const DESIGN_VERDICTS = ["good", "incomplete", "poor"] as const;
export type DesignVerdict = (typeof DESIGN_VERDICTS)[number];
export const DESIGN_VERDICT_LABEL: Record<DesignVerdict, string> = { good: "Bien diseñado", incomplete: "Incompleto", poor: "Pobre" };

export interface CoverageDesignTopic {
  folder: string;
  title: string;
  verdict: DesignVerdict;
  /** artefactos del checklist que habría que crear para este tema (ids de `ARTIFACT_IDS`) */
  create: ArtifactId[];
  note: string;
}

export interface CoverageDesignReview {
  /** valoración breve del diseño del área */
  summary: string;
  topics: CoverageDesignTopic[];
}

export interface CoverageReviewArea {
  /** clave del área (`areaId` o id del subplan) */
  key: string;
  area: string;
  assessment: string;
  missing: CoverageSuggestion[];
  misplaced: CoverageMisplaced[];
  /** temas que pueden pasar a «fuera de ruta» (sobran o son demasiado básicos para el criterio) */
  dispensable?: CoverageDispensable[];
  /** corto / adecuado / excesivo frente al criterio, y por qué */
  verdict?: CoverageVerdict;
  verdictWhy?: string;
  /** estimación (múltiplos de 5) de lo esperado para el criterio que el área cubre, 0..100 */
  coveragePct?: number;
  /** juicio de la IA sobre el diseño de los temas del área (aditivo; ausente en las revisiones antiguas) */
  design?: CoverageDesignReview;
}

export interface CoverageOverall {
  verdict: CoverageVerdict;
  /** estimación (múltiplos de 5) de lo esperado para el criterio que cubre el plan entero */
  coveragePct?: number;
  text: string;
}

export interface CoverageReview {
  /** ISO de cuándo se hizo */
  at: string;
  source: "ai";
  /** perfil declarado con el que se revisó («full stack especializado en automatización») */
  profile?: string;
  /** valoración global breve */
  summary: string;
  /** el criterio con el que se revisó (aditivo; ausente en las revisiones antiguas) */
  criteria?: CoverageCriteria;
  /** veredicto global y % estimado de lo esperado */
  overall?: CoverageOverall;
  /** aviso de que es una estimación (la app lo pone siempre; no lo escribe la IA) */
  disclaimer?: string;
  /** valoración global del diseño de los temas (aditivo) */
  designSummary?: string;
  areas: CoverageReviewArea[];
  /** sugerencias descartadas por la app (ya existían como tema, área desconocida, duplicadas…) */
  discarded: number;
}

export const MAX_SUGGESTIONS_PER_AREA = 12;
export const MAX_PROFILE_CHARS = 200;

const fold = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const oneLine = (v: unknown, max: number): string => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
/** «4.12 Message queues» → «message queues» (sin numeración ni acentos ni puntuación) */
export const titleKey = (s: string): string => fold(s.replace(/^[\d.\s_-]+/, "")).replace(/[^a-z0-9]+/g, " ").trim();

/** Normaliza una revisión leída de disco (o null si no sirve). `keys`: claves de las áreas del plan (descarta las que ya no existen). */
export function sanitizeCoverageReview(raw: unknown, keys?: readonly string[]): CoverageReview | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, any>;
  const at = oneLine(r.at, 40);
  if (!at || Number.isNaN(Date.parse(at))) return undefined;
  const areas: CoverageReviewArea[] = [];
  for (const a of Array.isArray(r.areas) ? r.areas : []) {
    const key = oneLine(a?.key, 60);
    if (!key || (keys && !keys.includes(key)) || areas.some((x) => x.key === key)) continue;
    areas.push({
      key,
      area: oneLine(a.area, 80) || key,
      assessment: oneLine(a.assessment, 400),
      missing: (Array.isArray(a.missing) ? a.missing : [])
        .map((m: any) => ({
          title: oneLine(m?.title, 120),
          why: oneLine(m?.why, 300),
          ...(oneLine(m?.groupId, 40) ? { groupId: oneLine(m.groupId, 40) } : {}),
          ...(priorityOf(m?.priority) ? { priority: priorityOf(m.priority)! } : {}),
          ...(levelOf(m?.level) ? { level: levelOf(m.level)! } : {}),
          ...(m?.accepted === true ? { accepted: true } : {}),
        }))
        .filter((m: CoverageSuggestion) => m.title)
        .slice(0, MAX_SUGGESTIONS_PER_AREA),
      misplaced: (Array.isArray(a.misplaced) ? a.misplaced : [])
        .map((m: any) => ({ folder: oneLine(m?.folder, 300), title: oneLine(m?.title, 160), reason: oneLine(m?.reason, 300), ...(oneLine(m?.suggestedArea, 60) ? { suggestedArea: oneLine(m.suggestedArea, 60) } : {}) }))
        .filter((m: CoverageMisplaced) => m.folder && m.title)
        .slice(0, MAX_SUGGESTIONS_PER_AREA),
      ...(Array.isArray(a.dispensable) && a.dispensable.length
        ? {
            dispensable: a.dispensable
              .map((m: any) => ({ folder: oneLine(m?.folder, 300), title: oneLine(m?.title, 160), reason: oneLine(m?.reason, 300) }))
              .filter((m: CoverageDispensable) => m.folder && m.title)
              .slice(0, MAX_DISPENSABLE_PER_AREA),
          }
        : {}),
      ...(verdictOf(a.verdict) ? { verdict: verdictOf(a.verdict)! } : {}),
      ...(oneLine(a.verdictWhy, 300) ? { verdictWhy: oneLine(a.verdictWhy, 300) } : {}),
      ...(pctOf(a.coveragePct) !== undefined ? { coveragePct: pctOf(a.coveragePct)! } : {}),
      ...(designReviewOf(a.design) ? { design: designReviewOf(a.design)! } : {}),
    });
  }
  const summary = oneLine(r.summary, 600);
  if (!summary && !areas.length) return undefined;
  const profile = oneLine(r.profile, MAX_PROFILE_CHARS);
  const overall = overallOf(r.overall);
  const disclaimer = oneLine(r.disclaimer, 300);
  return {
    at,
    source: "ai",
    ...(profile ? { profile } : {}),
    summary,
    ...(r.criteria && typeof r.criteria === "object" ? { criteria: sanitizeCriteria(r.criteria) } : {}),
    ...(overall ? { overall } : {}),
    ...(disclaimer ? { disclaimer } : {}),
    ...(oneLine(r.designSummary, 600) ? { designSummary: oneLine(r.designSummary, 600) } : {}),
    areas,
    discarded: Math.max(0, Math.round(Number(r.discarded) || 0)),
  };
}

export const MAX_DESIGN_TOPICS_PER_AREA = 120;
const designVerdictOf = (v: unknown): DesignVerdict | undefined => {
  const k = fold(String(v ?? ""));
  if (/^(good|well|bien|bueno|buen|completo|ok|adecuad)/.test(k)) return "good";
  if (/^(incomplete|incompleto|parcial|medio|regular|falta)/.test(k)) return "incomplete";
  if (/^(poor|pobre|malo|mal|insuficiente|vacio|ausente)/.test(k)) return "poor";
  return undefined;
};
/** Artefactos del checklist que la IA dijo crear (ids exactos; se admiten alias en español y se descartan los desconocidos). */
const artifactsOf = (v: unknown): ArtifactId[] => {
  const alias: Array<[RegExp, ArtifactId]> = [
    [/^(theory|teoria|nota)\b/, "theory"],
    [/^(contract|contrato|estructura)/, "contract"],
    [/^(canvas|mapa)/, "canvas"],
    [/^(manifest|manifiesto|practica md)/, "manifest"],
    [/^(skills fit|skills acordes)/, "skills_fit"],
    [/^(branch skills)/, "branch_skills"],
    [/^(practice basic|practica basica|practice|practica|ejercicios)/, "practice_basic"],
    [/^(practice ladder|escalera)/, "practice_ladder"],
  ];
  const out: ArtifactId[] = [];
  for (const x of Array.isArray(v) ? v : []) {
    const k = fold(String(x ?? "")).replace(/[-_]+/g, " ").trim();
    const id = (ARTIFACT_IDS as readonly string[]).includes(String(x)) ? (String(x) as ArtifactId) : alias.find(([re]) => re.test(k))?.[1];
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
};
function designReviewOf(raw: unknown): CoverageDesignReview | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, any>;
  const topics: CoverageDesignTopic[] = [];
  for (const t of Array.isArray(o.topics) ? o.topics : []) {
    const verdict = designVerdictOf(t?.verdict);
    const folder = oneLine(t?.folder, 300);
    const title = oneLine(t?.title, 160);
    if (!verdict || !folder || !title || topics.some((x) => x.folder === folder)) continue;
    topics.push({ folder, title, verdict, create: artifactsOf(t?.create), note: oneLine(t?.note ?? t?.why, 300) });
    if (topics.length >= MAX_DESIGN_TOPICS_PER_AREA) break;
  }
  const summary = oneLine(o.summary, 500);
  return summary || topics.length ? { summary, topics } : undefined;
}

const priorityOf = (v: unknown): CoveragePriority | undefined => {
  const k = fold(String(v ?? ""));
  if (/^(high|alta|alto|critica|critico|imprescindible)/.test(k)) return "high";
  if (/^(medium|media|medio|normal)/.test(k)) return "medium";
  if (/^(low|baja|bajo|opcional)/.test(k)) return "low";
  return undefined;
};
const levelOf = (v: unknown): SkillLevel | undefined => {
  const k = fold(String(v ?? ""));
  if (/^(junior|jr|trainee|entry)/.test(k)) return "junior";
  if (/^(mid|medio|intermedio|semi)/.test(k)) return "mid";
  if (/^(senior|sr|avanzado|experto)/.test(k)) return "senior";
  return undefined;
};
const verdictOf = (v: unknown): CoverageVerdict | undefined => {
  const k = fold(String(v ?? ""));
  if (/^(short|corto|corta|insuficiente|se queda corto|escaso|incompleto)/.test(k)) return "short";
  if (/^(adequate|adecuad|suficiente|ok|equilibrad|bien|correct)/.test(k)) return "adequate";
  if (/^(excessive|excesiv|sobra|demasiad|de mas)/.test(k)) return "excessive";
  return undefined;
};
/** Porcentaje estimado: entero 0..100 redondeado a múltiplos de 5 (no se aparenta una precisión que la IA no tiene). */
const pctOf = (v: unknown): number | undefined => {
  const n = typeof v === "string" ? Number(v.replace("%", "").replace(",", ".")) : Number(v);
  if (v === null || v === undefined || v === "" || !Number.isFinite(n)) return undefined;
  return Math.max(0, Math.min(100, Math.round(n / 5) * 5));
};
function overallOf(raw: unknown): CoverageOverall | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const verdict = verdictOf(o.verdict);
  if (!verdict) return undefined;
  const pct = pctOf(o.coveragePct);
  return { verdict, ...(pct !== undefined ? { coveragePct: pct } : {}), text: oneLine(o.text ?? o.assessment, 500) };
}

export const MAX_DISPENSABLE_PER_AREA = 40;

export interface CoverageReplyCtx {
  /** las áreas del plan con sus grupos */
  areas: ReadonlyArray<{ key: string; area: string; groups?: readonly AreaGroup[] }>;
  /** temas del plan (para reconocer los «sobrantes o mal ubicados») con la clave de su área */
  planTopics: ReadonlyArray<{ folder: string; title: string; key: string; /** completado: no se propone como prescindible */ done?: boolean }>;
  /** títulos de TODOS los temas de la vault: una sugerencia que ya existe se descarta */
  vaultTitles: readonly string[];
}

/** Saca el primer objeto JSON de la respuesta (admite ```json … ``` y texto alrededor). */
function jsonOf(text: string): any {
  const s = String(text ?? "");
  const a = s.indexOf("{");
  const b = s.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try {
    return JSON.parse(s.slice(a, b + 1));
  } catch {
    return null;
  }
}

const GROUP_WORDS: Array<{ kind: AreaGroup["kind"]; re: RegExp }> = [
  { kind: "bases", re: /\bbases?\b|fundament/ },
  { kind: "language", re: /lenguaje|language|python|javascript|typescript/ },
  { kind: "knowledge", re: /conocimiento|knowledge|core|especialidad/ },
];

/**
 * Valida la respuesta de la IA a la revisión de cobertura. Descarta: áreas que no son del plan, sugerencias que ya existen como tema de la
 * vault (por título, sin numeración), duplicadas o vacías, y «sobrantes» que no son temas del plan. Normaliza el grupo y el área sugerida.
 */
export function parseCoverageReply(text: string, ctx: CoverageReplyCtx): { ok: true; review: Omit<CoverageReview, "at" | "source" | "profile"> } | { ok: false; reason: string } {
  const j = jsonOf(text);
  if (!j || typeof j !== "object") return { ok: false, reason: "La IA no devolvió un JSON válido." };
  const existingKeys = [...new Set(ctx.vaultTitles.map(titleKey).filter(Boolean))];
  const existingSet = new Set(existingKeys);
  // ya existe: mismo título (sin numeración) o uno contiene al otro cuando el más corto es lo bastante específico
  const existing = { has: (k: string): boolean => existingSet.has(k) || existingKeys.some((e) => (e.length <= k.length ? e.length >= 12 && k.includes(e) : k.length >= 12 && e.includes(k))) };
  const areaOf = (v: unknown): (typeof ctx.areas)[number] | undefined => {
    const k = fold(oneLine(v, 80));
    if (!k) return undefined;
    return ctx.areas.find((a) => fold(a.key) === k || fold(a.area) === k) ?? ctx.areas.find((a) => fold(a.area).startsWith(k) || k.startsWith(fold(a.area)));
  };
  const byFolder = new Map(ctx.planTopics.map((t) => [t.folder, t]));
  const byTitle = new Map(ctx.planTopics.map((t) => [titleKey(t.title), t]));
  let discarded = 0;
  const areas: CoverageReviewArea[] = [];
  for (const raw of Array.isArray(j.areas) ? j.areas : []) {
    const a = areaOf(raw?.key ?? raw?.areaId ?? raw?.area);
    if (!a) {
      discarded += (Array.isArray(raw?.missing) ? raw.missing.length : 0) + (Array.isArray(raw?.misplaced) ? raw.misplaced.length : 0);
      continue;
    }
    const target = areas.find((x) => x.key === a.key) ?? (areas.push({ key: a.key, area: a.area, assessment: "", missing: [], misplaced: [] }), areas[areas.length - 1]!);
    if (!target.assessment) target.assessment = oneLine(raw?.assessment, 400);
    const verdict = verdictOf(raw?.verdict ?? raw?.veredicto);
    if (verdict && !target.verdict) target.verdict = verdict;
    if (!target.verdictWhy && oneLine(raw?.verdictWhy ?? raw?.why, 300)) target.verdictWhy = oneLine(raw?.verdictWhy ?? raw?.why, 300);
    const pct = pctOf(raw?.coveragePct ?? raw?.coverage);
    if (pct !== undefined && target.coveragePct === undefined) target.coveragePct = pct;
    const seen = new Set(target.missing.map((m) => titleKey(m.title)));
    for (const m of Array.isArray(raw?.missing) ? raw.missing : []) {
      const title = oneLine(typeof m === "string" ? m : m?.title, 120);
      const k = titleKey(title);
      if (!k || existing.has(k) || seen.has(k) || target.missing.length >= MAX_SUGGESTIONS_PER_AREA) {
        discarded++;
        continue;
      }
      seen.add(k);
      const g = fold(oneLine(m?.group ?? m?.groupId, 60));
      const groups = a.groups ?? [];
      const group = g ? groups.find((x) => fold(x.id) === g || fold(x.title) === g) ?? groups.find((x) => GROUP_WORDS.find((w) => w.re.test(g))?.kind === x.kind) : undefined;
      const priority = priorityOf(m?.priority ?? m?.prioridad);
      const level = levelOf(m?.level ?? m?.nivel);
      target.missing.push({ title, why: oneLine(m?.why ?? m?.reason, 300), ...(group ? { groupId: group.id } : {}), ...(priority ? { priority } : {}), ...(level ? { level } : {}) });
    }
    // prescindibles: temas del plan (no completados) que pueden pasar a «fuera de ruta»
    for (const m of Array.isArray(raw?.dispensable) ? raw.dispensable : Array.isArray(raw?.skippable) ? raw.skippable : []) {
      const t = byFolder.get(oneLine(m?.folder, 300)) ?? byTitle.get(titleKey(oneLine(typeof m === "string" ? m : m?.title, 160)));
      const list = (target.dispensable ??= []);
      if (!t || t.done || list.some((x) => x.folder === t.folder) || list.length >= MAX_DISPENSABLE_PER_AREA) {
        discarded++;
        continue;
      }
      list.push({ folder: t.folder, title: t.title, reason: oneLine(m?.reason ?? m?.why, 300) });
    }
    // diseño: veredicto de la IA por tema del plan frente al checklist (solo temas del plan; los demás se descartan)
    if (raw?.design && typeof raw.design === "object") {
      const dr = raw.design as Record<string, any>;
      const topics: CoverageDesignTopic[] = target.design?.topics ?? [];
      for (const m of Array.isArray(dr.topics) ? dr.topics : []) {
        const t = byFolder.get(oneLine(m?.folder, 300)) ?? byTitle.get(titleKey(oneLine(m?.title, 160)));
        const verdict = designVerdictOf(m?.verdict);
        if (!t || !verdict || topics.some((x) => x.folder === t.folder) || topics.length >= MAX_DESIGN_TOPICS_PER_AREA) {
          discarded++;
          continue;
        }
        topics.push({ folder: t.folder, title: t.title, verdict, create: artifactsOf(m?.create), note: oneLine(m?.note ?? m?.why ?? m?.reason, 300) });
      }
      const dsum = oneLine(dr.summary, 500) || target.design?.summary || "";
      if (dsum || topics.length) target.design = { summary: dsum, topics };
    }
    for (const m of Array.isArray(raw?.misplaced) ? raw.misplaced : Array.isArray(raw?.extra) ? raw.extra : []) {
      const t = byFolder.get(oneLine(m?.folder, 300)) ?? byTitle.get(titleKey(oneLine(typeof m === "string" ? m : m?.title, 160)));
      if (!t || target.misplaced.some((x) => x.folder === t.folder) || target.misplaced.length >= MAX_SUGGESTIONS_PER_AREA) {
        discarded++;
        continue;
      }
      const to = areaOf(m?.suggestedArea ?? m?.toArea ?? m?.area);
      target.misplaced.push({ folder: t.folder, title: t.title, reason: oneLine(m?.reason ?? m?.why, 300), ...(to && to.key !== t.key ? { suggestedArea: to.key } : {}) });
    }
  }
  const summary = oneLine(j.summary ?? j.assessment, 600);
  const kept = areas.filter((a) => a.assessment || a.missing.length || a.misplaced.length || a.dispensable?.length || a.verdict || a.design);
  const overall = overallOf(j.overall);
  const designSummary = oneLine(j.designSummary ?? j.design?.summary, 600);
  if (!summary && !kept.length && !overall) return { ok: false, reason: "La IA no propuso nada útil." };
  return { ok: true, review: { summary: summary || overall?.text || "", ...(overall ? { overall } : {}), ...(designSummary ? { designSummary } : {}), areas: kept, discarded } };
}
