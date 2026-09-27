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

  topicRows.sort((a, b) => b.pct - a.pct || a.title.localeCompare(b.title));
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
