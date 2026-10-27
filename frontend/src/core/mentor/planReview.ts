// Sistema de revisión de áreas y sub-asignaturas añadidas al plan (manual o automáticamente).
// Almacena las revisiones pendientes en `.notevault/mentor/plan-reviews/<planId>.json`, fuera del plan
// para no interferir con `sanitizePlan` ni con «Deshacer».

import * as fs from "node:fs";
import * as path from "node:path";
import * as store from "../store.js";
import { fold, type CatalogTopic } from "./goalDraft.js";
import type { Plan } from "./plan.js";
import type { ApplyResult, FixOption } from "./planChange.js";
import { normFolder } from "../../lib/folderRoles.js";

export interface ReviewDuplicate {
  addedTopic: string;
  matchedTopic: string;
  title: string;
}

export interface ReviewImpact {
  addedTopics: number;
  addedMinutes: number;
  weeklyMinutesBefore: number;
  weeklyMinutesAfter: number;
  fits: boolean;
  endDate: string;
  suggestedEnd?: string;
  fixOptions: FixOption[];
}

export interface PlanReview {
  id: string;
  kind: "area" | "subject";
  subplanId: string;
  subplanName: string;
  groupId?: string;
  groupTitle?: string;
  folder: string;
  objective: string;
  source: "manual" | "auto";
  addedAt: string;
  state: "pending" | "kept";
  added: string[];
  duplicates: ReviewDuplicate[];
  impact: ReviewImpact;
}

/** Título normalizado para comparar duplicados: sin numeración inicial, minúsculas y sin acentos. */
export function cleanTitle(title: string): string {
  const noPrefix = String(title ?? "").replace(/^[\d.\s\-_]+/, "").trim();
  return fold(noPrefix);
}

/** Detecta temas añadidos cuyo título coincida con temas que ya estaban antes en el plan o en el catálogo. */
export function findDuplicates(
  addedFolders: readonly string[],
  existingTopics: readonly { folder: string; title: string }[],
  allTopics: readonly CatalogTopic[] = [],
): ReviewDuplicate[] {
  const titleMap = new Map<string, { folder: string; title: string }>();
  for (const t of existingTopics) {
    const k = cleanTitle(t.title);
    if (k) titleMap.set(k, t);
  }

  const lookup = new Map<string, { folder: string; title: string }>();
  for (const t of allTopics) lookup.set(t.folder, t);
  for (const t of existingTopics) lookup.set(t.folder, t);

  const duplicates: ReviewDuplicate[] = [];
  for (const folder of addedFolders) {
    const meta = lookup.get(folder);
    const title = meta?.title ?? folder.split("/").pop() ?? "";
    const k = cleanTitle(title);
    if (!k) continue;
    const match = titleMap.get(k);
    if (match && match.folder !== folder) {
      duplicates.push({
        addedTopic: folder,
        matchedTopic: match.folder,
        title,
      });
    }
  }
  return duplicates;
}

/** Calcula el impacto de una adición comparando el plan previo con el resultado de applyOps. */
export function impactOf(beforePlan: Plan, result: ApplyResult, addedFolders: readonly string[]): ReviewImpact {
  const afterPlan = result.plan;
  const addedSet = new Set(addedFolders);
  let addedMinutes = 0;
  for (const s of afterPlan.subplans) {
    for (const t of s.topics) {
      if (addedSet.has(t.folder)) addedMinutes += t.estMinutes;
    }
  }

  const weeklyBefore = Math.round((beforePlan.hoursPerWeek ?? 0) * 60);
  const weeklyAfter = Math.round((afterPlan.hoursPerWeek ?? 0) * 60);

  const fixOpt = result.fixOptions.find((o) => o.op && typeof o.op === "object" && (o.op as Record<string, unknown>).op === "extend_to" && "date" in o.op);
  const suggestedEnd = fixOpt && fixOpt.op && typeof fixOpt.op === "object" && "date" in fixOpt.op ? String((fixOpt.op as Record<string, unknown>).date) : undefined;

  return {
    addedTopics: addedFolders.length,
    addedMinutes,
    weeklyMinutesBefore: weeklyBefore,
    weeklyMinutesAfter: weeklyAfter,
    fits: result.fits,
    endDate: afterPlan.end,
    ...(suggestedEnd ? { suggestedEnd } : {}),
    fixOptions: result.fixOptions ?? [],
  };
}

/** Construye un objeto PlanReview con identificador determinista / único y datos saneados. */
export function buildReview(opts: {
  id?: string;
  kind: "area" | "subject";
  subplanId: string;
  subplanName: string;
  groupId?: string;
  groupTitle?: string;
  folder: string;
  objective?: string;
  source?: "manual" | "auto";
  addedAt?: string;
  added: string[];
  duplicates?: ReviewDuplicate[];
  impact: ReviewImpact;
}): PlanReview {
  const id = opts.id || `rev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  return {
    id,
    kind: opts.kind,
    subplanId: opts.subplanId,
    subplanName: opts.subplanName,
    ...(opts.groupId ? { groupId: opts.groupId } : {}),
    ...(opts.groupTitle ? { groupTitle: opts.groupTitle } : {}),
    folder: normFolder(opts.folder),
    objective: (opts.objective || "").slice(0, 200).trim(),
    source: opts.source || "manual",
    addedAt: opts.addedAt || new Date().toISOString(),
    state: "pending",
    added: [...opts.added],
    duplicates: opts.duplicates ? [...opts.duplicates] : [],
    impact: opts.impact,
  };
}

/**
 * Filtra las revisiones pendientes descartando las que ya no correspondan a un subplan o grupo
 * existente en el plan (por ejemplo si se hizo «Deshacer»).
 */
export function pendingReviews(reviews: readonly PlanReview[], plan: Plan): PlanReview[] {
  const subplanMap = new Map(plan.subplans.map((s) => [s.id, s]));
  return reviews.filter((r) => {
    if (r.state !== "pending") return false;
    const sub = subplanMap.get(r.subplanId);
    if (!sub) return false;
    if (r.kind === "subject" && r.groupId) {
      const hasGroup = (sub.groups ?? []).some((g) => g.id === r.groupId) || sub.topics.some((t) => t.group === r.groupId);
      if (!hasGroup) return false;
    }
    return true;
  });
}

/** Almacén en disco de revisiones de un plan: `.notevault/mentor/plan-reviews/<planId>.json` */
export class PlanReviewStore {
  readonly dir: string;

  constructor(vaultRoot: string) {
    this.dir = path.join(path.resolve(vaultRoot), ".notevault", "mentor", "plan-reviews");
  }

  private _path(planId: string): string {
    return path.join(this.dir, `${planId}.json`);
  }

  load(planId: string): PlanReview[] {
    const p = this._path(planId);
    if (!fs.existsSync(p)) return [];
    const list = store.loadJson<PlanReview[]>(p, []);
    return Array.isArray(list) ? list : [];
  }

  save(planId: string, list: PlanReview[]): void {
    const p = this._path(planId);
    if (!fs.existsSync(this.dir)) fs.mkdirSync(this.dir, { recursive: true });
    store.writeJson(p, list);
  }
}
