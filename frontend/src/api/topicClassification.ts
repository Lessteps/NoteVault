// English topics that could not be classified by branch. They are LOGGED here (never defaulted) until
// the user resolves them explicitly (`study_topic_classify`), so nothing is silently treated as
// belonging to a branch it may not belong to.

import * as fs from "node:fs";
import * as path from "node:path";
import type { EnglishBranch } from "../lib/englishSkillData.js";

export interface PendingClassification {
  folder: string;
  subject: string;
  name: string;
  /** a guess offered as a one-click choice; never applied on its own */
  suggestion: EnglishBranch | null;
  reason: string;
  since: string;
}

const file = (root: string): string => path.join(root, ".notevault", "estudio", "clasificacion-pendiente.json");

export function listUnclassified(root: string): PendingClassification[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(file(root), "utf-8")) as PendingClassification[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(root: string, items: PendingClassification[]): void {
  fs.mkdirSync(path.dirname(file(root)), { recursive: true });
  fs.writeFileSync(file(root), JSON.stringify(items, null, 2) + "\n", "utf-8");
}

/** Notes an unclassified topic (once per folder). */
export function recordUnclassified(root: string, entry: Omit<PendingClassification, "since">): void {
  const items = listUnclassified(root);
  if (items.some((i) => i.folder === entry.folder)) return;
  save(root, [...items, { ...entry, since: new Date().toISOString() }]);
}

/** The topic has been classified: it is no longer pending. */
export function resolveUnclassified(root: string, folder: string): void {
  const items = listUnclassified(root);
  const rest = items.filter((i) => i.folder !== folder);
  if (rest.length !== items.length) save(root, rest);
}
