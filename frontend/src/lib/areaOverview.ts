/**
 * Aggregation for an area's overview view file (`type: resumen`).
 *
 * Pure: it takes the per-topic data the dashboard API already returns
 * (`TopicDashboardItem[]`) and folds it into the numbers the overview shows —
 * totals, per-skill and per-difficulty progress, per-topic bars. No new core
 * scan, no new engine: just the same progress model the practice views use.
 */

import type { TopicDashboardItem } from "./types";

export interface AreaSkillRow {
  skill: string;
  label: string;
  attempts: number;
  passes: number;
  topics: number;
  mastered: number;
}

export interface AreaDifficultyRow {
  difficulty: 1 | 2 | 3;
  attempts: number;
  passes: number;
}

export interface AreaTopicRow {
  folder: string;
  title: string;
  area: string;
  pct: number;
  completed: boolean;
  attempts: number;
  passes: number;
}

export interface AreaOverview {
  topics: number;
  /** topics with every skill mastered (and the exam passed when required) */
  completed: number;
  /** topics the student has touched at least once */
  started: number;
  skills: AreaSkillRow[];
  difficulties: AreaDifficultyRow[];
  topicRows: AreaTopicRow[];
  attempts: number;
  passes: number;
  pct: number;
}

const DIFFICULTIES: Array<1 | 2 | 3> = [1, 2, 3];

/**
 * Natural order for titles with numeric prefixes: "1.2" before "1.10", which
 * plain `localeCompare` gets backwards. (`core/notesService.compareNumeric`
 * would do it too, but importing that here would drag `node:fs` into the
 * renderer bundle.)
 */
const compareNatural = (a: string, b: string): number =>
  a.localeCompare(b, "es", { numeric: true, sensitivity: "base" });

/** `Matemáticas\1 Área/1.1 Tema` → `Matemáticas/1 Área/1.1 Tema`, without edges. */
export function normFolder(folder: string): string {
  return String(folder ?? "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

/** True when `folder` is `scope` itself or a descendant of it. */
export function folderInScope(folder: string, scope: string): boolean {
  const f = folder.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  const s = scope.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (!s) return true;
  return f === s || f.startsWith(`${s}/`);
}

export function aggregateArea(topics: TopicDashboardItem[]): AreaOverview {
  const skills = new Map<string, AreaSkillRow>();
  const difficulties: AreaDifficultyRow[] = DIFFICULTIES.map((difficulty) => ({ difficulty, attempts: 0, passes: 0 }));
  const topicRows: AreaTopicRow[] = [];
  let attempts = 0;
  let passes = 0;
  let completed = 0;
  let started = 0;

  for (const item of topics) {
    const progress = item.progress;
    let topicAttempts = 0;
    let topicPasses = 0;

    for (const [skill, sp] of Object.entries(progress?.skills ?? {})) {
      const row = skills.get(skill) ?? { skill, label: sp.label || skill, attempts: 0, passes: 0, topics: 0, mastered: 0 };
      row.attempts += sp.totalAttempts;
      row.passes += sp.totalPasses;
      row.topics += 1;
      if (sp.mastered) row.mastered += 1;
      skills.set(skill, row);

      topicAttempts += sp.totalAttempts;
      topicPasses += sp.totalPasses;

      for (const cell of Object.values(sp.cells ?? {})) {
        const target = difficulties.find((d) => d.difficulty === cell.difficulty);
        if (target) {
          target.attempts += cell.attempts;
          target.passes += cell.passes;
        }
      }
    }

    attempts += topicAttempts;
    passes += topicPasses;
    if (item.progress?.isComplete) completed += 1;
    if (topicAttempts > 0) started += 1;

    topicRows.push({
      folder: item.folder,
      title: item.manifest?.title ?? item.folder,
      area: item.area ?? "",
      pct: item.progress?.completenessPct ?? 0,
      completed: Boolean(item.progress?.isComplete),
      attempts: topicAttempts,
      passes: topicPasses,
    });
  }

  topicRows.sort((a, b) => b.pct - a.pct || compareNatural(a.title, b.title));
  const skillRows = [...skills.values()].sort((a, b) => b.passes - a.passes || a.label.localeCompare(b.label));

  return {
    topics: topics.length,
    completed,
    started,
    skills: skillRows,
    difficulties,
    topicRows,
    attempts,
    passes,
    // Share of the area's topics that are fully mastered.
    pct: topics.length ? Math.round((completed / topics.length) * 100) : 0,
  };
}

// ── The completion dashboard: groups, rings and what is still missing ────────

/** The engine's own completeness for a topic, clamped to 0..100. */
export function topicPct(item: TopicDashboardItem): number {
  return Math.max(0, Math.min(100, Math.round(item.progress?.completenessPct ?? 0)));
}

export interface OverviewGroup {
  /** vault-relative folder of the group */
  key: string;
  title: string;
  /** true when the group *is* a topic: it has no children to expand into */
  isTopic: boolean;
  topics: TopicDashboardItem[];
  /** average mastery of the group's topics */
  pct: number;
  mastered: number;
}

const titleOf = (folder: string): string => folder.split("/").filter(Boolean).pop() ?? folder;

/**
 * Folds a scope's topics into the cards the dashboard shows: at the subject root
 * one card per internal area, at an area one card per topic.
 */
export function groupTopics(topics: TopicDashboardItem[], scope: string): OverviewGroup[] {
  const base = normFolder(scope);
  const groups = new Map<string, TopicDashboardItem[]>();
  for (const item of topics) {
    const folder = normFolder(item.folder ?? "");
    // A dashboard only ever shows its own scope, whatever it is handed.
    if (base && !folderInScope(folder, base)) continue;
    const rest = base && folder.startsWith(`${base}/`) ? folder.slice(base.length + 1) : folder;
    const child = rest.split("/")[0] ?? "";
    const key = base ? `${base}/${child}` : child;
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }

  return [...groups.entries()]
    .map(([key, items]) => {
      const isTopic = items.length === 1 && normFolder(items[0]!.folder) === key;
      const pct = items.length ? Math.round(items.reduce((a, i) => a + topicPct(i), 0) / items.length) : 0;
      return {
        key,
        title: isTopic ? items[0]!.manifest.title : titleOf(key),
        isTopic,
        topics: [...items].sort((a, b) => compareNatural(a.manifest.title, b.manifest.title)),
        pct,
        mastered: items.filter((i) => i.progress?.isComplete || i.progress?.examPassed).length,
      };
    })
    .sort((a, b) => compareNatural(a.title, b.title));
}

export interface SkillRing {
  skill: string;
  label: string;
  description: string;
  /** share of the required passes at or above the target difficulty */
  pct: number;
  done: number;
  required: number;
  /** what is still missing, in plain Spanish */
  missing: string[];
}

const STARS = ["", "★ Fácil", "★★ Med", "★★★ Dif"];

/**
 * One ring per competency of a topic: how much of the required practice at (or
 * above) the target difficulty is done, and what is left.
 */
export function skillRings(item: TopicDashboardItem): SkillRing[] {
  const min = Math.max(1, item.manifest.mastery?.min_per_skill ?? 6);
  const target = Math.max(1, Math.min(3, item.manifest.mastery?.target_difficulty ?? 3));
  const levels = ([1, 2, 3] as const).filter((d) => d >= target);

  return (item.manifest.skills ?? []).map((skill) => {
    const progress = item.progress?.skills?.[skill];
    const required = min * levels.length;
    let done = 0;
    const missing: string[] = [];
    const touched = (progress?.totalAttempts ?? 0) > 0;
    for (const d of levels) {
      const passes = progress?.cells?.[d]?.passes ?? 0;
      done += Math.min(min, passes);
      if (passes === 0) missing.push(touched ? `falta ${STARS[d]}` : `sin empezar ${STARS[d]}`);
    }
    return {
      skill,
      label: progress?.label ?? skill,
      description: progress?.description ?? "",
      pct: required ? Math.round((100 * done) / required) : 0,
      done,
      required,
      missing,
    };
  });
}

export interface SkillMatrixCell {
  difficulty: 1 | 2 | 3;
  passes: number;
  attempts: number;
  required: number;
  /** false for difficulties below the topic's target: shown, but not required */
  counts: boolean;
}

export interface SkillMatrixRow {
  skill: string;
  label: string;
  description: string;
  cells: SkillMatrixCell[];
}

/** One row per competency, one cell per difficulty: passes against what is required. */
export function skillMatrix(item: TopicDashboardItem): SkillMatrixRow[] {
  const min = Math.max(1, item.manifest.mastery?.min_per_skill ?? 6);
  const target = Math.max(1, Math.min(3, item.manifest.mastery?.target_difficulty ?? 3));
  return (item.manifest.skills ?? []).map((skill) => {
    const progress = item.progress?.skills?.[skill];
    return {
      skill,
      label: progress?.label ?? skill,
      description: progress?.description ?? "",
      cells: DIFFICULTIES.map((difficulty) => {
        // The topic's own AI plan, when it has one, decides what each cell needs.
        const planned = item.manifest.plan?.[skill]?.[difficulty - 1];
        return {
          difficulty,
          passes: progress?.cells?.[difficulty]?.passes ?? 0,
          attempts: progress?.cells?.[difficulty]?.attempts ?? 0,
          required: planned ?? min,
          counts: item.manifest.plan ? (planned ?? 0) > 0 : difficulty >= target,
        };
      }),
    };
  });
}

/** The competencies and difficulties of a topic that have not been practised. */
export function missingOf(item: TopicDashboardItem): string[] {
  const out: string[] = [];
  for (const ring of skillRings(item)) {
    if (ring.pct >= 100) continue;
    const detail = ring.missing.length ? ring.missing.join(", ") : `${ring.done}/${ring.required}`;
    out.push(`${ring.label}: ${detail}`);
  }
  return out;
}
