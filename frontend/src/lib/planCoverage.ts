// Revisión de COBERTURA del plan del Mentor por área: ¿tiene cada tema del plan su nota de teoría y su práctica (ejercicios) en la vault?
// ¿Qué temas de las ramas del área quedaron fuera del plan? Y, bajo demanda, la revisión de la IA («faltan colas y jobs para un full
// stack de automatización»), validada aquí y guardada en el plan como `coverageReview` (aditivo, ver docs/VAULT_FORMAT.md).
//
// Módulo PURO y compartido (núcleo, API y renderer): sin node:* ni DOM. La IA solo propone: aquí se descartan las sugerencias que ya
// existen como tema de la vault, se normalizan las áreas a las del plan y se recortan los textos. No crea notas ni toca temas.

import { areaOfFolder, branchOfFolder } from "./planTime.js";
import { isPracticeBranch, type AreaGroup } from "./planAreas.js";

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
}

export interface PlanCoverage {
  areas: AreaCoverage[];
  totals: { topics: number; theory: number; practice: number; outOfPlan: number };
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
    };
  });
  return {
    areas,
    totals: {
      topics: areas.reduce((n, a) => n + a.total, 0),
      theory: areas.reduce((n, a) => n + a.theory, 0),
      practice: areas.reduce((n, a) => n + a.practice, 0),
      outOfPlan: areas.reduce((n, a) => n + a.outOfPlan.filter((t) => !t.done).length, 0),
    },
    ppReady: !!opts.ppReady,
  };
}

// ── Revisión con IA (guardada en el plan) ───────────────────────────────

/** Un conocimiento que FALTA para el objetivo y que no existe como tema en la vault. */
export interface CoverageSuggestion {
  title: string;
  why: string;
  /** grupo del área donde encajaría (id de `AreaGroup`), si la IA lo dijo y existe */
  groupId?: string;
}

/** Un tema del plan que sobra o está mal ubicado. */
export interface CoverageMisplaced {
  folder: string;
  title: string;
  reason: string;
  /** clave del área del plan a la que movería el tema */
  suggestedArea?: string;
}

export interface CoverageReviewArea {
  /** clave del área (`areaId` o id del subplan) */
  key: string;
  area: string;
  assessment: string;
  missing: CoverageSuggestion[];
  misplaced: CoverageMisplaced[];
}

export interface CoverageReview {
  /** ISO de cuándo se hizo */
  at: string;
  source: "ai";
  /** perfil declarado con el que se revisó («full stack especializado en automatización») */
  profile?: string;
  /** valoración global breve */
  summary: string;
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
        .map((m: any) => ({ title: oneLine(m?.title, 120), why: oneLine(m?.why, 300), ...(oneLine(m?.groupId, 40) ? { groupId: oneLine(m.groupId, 40) } : {}) }))
        .filter((m: CoverageSuggestion) => m.title)
        .slice(0, MAX_SUGGESTIONS_PER_AREA),
      misplaced: (Array.isArray(a.misplaced) ? a.misplaced : [])
        .map((m: any) => ({ folder: oneLine(m?.folder, 300), title: oneLine(m?.title, 160), reason: oneLine(m?.reason, 300), ...(oneLine(m?.suggestedArea, 60) ? { suggestedArea: oneLine(m.suggestedArea, 60) } : {}) }))
        .filter((m: CoverageMisplaced) => m.folder && m.title)
        .slice(0, MAX_SUGGESTIONS_PER_AREA),
    });
  }
  const summary = oneLine(r.summary, 600);
  if (!summary && !areas.length) return undefined;
  const profile = oneLine(r.profile, MAX_PROFILE_CHARS);
  return { at, source: "ai", ...(profile ? { profile } : {}), summary, areas, discarded: Math.max(0, Math.round(Number(r.discarded) || 0)) };
}

export interface CoverageReplyCtx {
  /** las áreas del plan con sus grupos */
  areas: ReadonlyArray<{ key: string; area: string; groups?: readonly AreaGroup[] }>;
  /** temas del plan (para reconocer los «sobrantes o mal ubicados») con la clave de su área */
  planTopics: ReadonlyArray<{ folder: string; title: string; key: string }>;
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
      target.missing.push({ title, why: oneLine(m?.why ?? m?.reason, 300), ...(group ? { groupId: group.id } : {}) });
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
  const kept = areas.filter((a) => a.assessment || a.missing.length || a.misplaced.length);
  if (!summary && !kept.length) return { ok: false, reason: "La IA no propuso nada útil." };
  return { ok: true, review: { summary, areas: kept, discarded } };
}
