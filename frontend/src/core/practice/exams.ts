/**
 * Exam record store for topic and group certifications.
 * Persists under .notevault/estudio/exams/<slug>.json.
 */

import * as fs from "node:fs";
import * as path from "node:path";

export interface ExamSkillVerdict {
  passed: boolean;
  score: number;
}

export interface ExamRecord {
  id: string;
  topic_or_group: string;
  passed: boolean;
  score: number;
  skills: Record<string, ExamSkillVerdict>;
  created_at: string;
  duration_seconds: number;
}

function examSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function examDir(vaultRoot: string): string {
  return path.join(vaultRoot, ".notevault", "estudio", "exams");
}

export function saveExamRecord(vaultRoot: string, record: ExamRecord): void {
  const dir = examDir(vaultRoot);
  fs.mkdirSync(dir, { recursive: true });
  const slug = examSlug(record.topic_or_group);
  const filePath = path.join(dir, `${slug}.json`);
  fs.writeFileSync(filePath, JSON.stringify(record, null, 2), "utf-8");
}

export function loadExamRecord(vaultRoot: string, topicOrGroup: string): ExamRecord | null {
  const slug = examSlug(topicOrGroup);
  const filePath = path.join(examDir(vaultRoot), `${slug}.json`);
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as ExamRecord;
  } catch {
    return null;
  }
}

export function isExamPassed(vaultRoot: string, topicOrGroup: string): boolean {
  const rec = loadExamRecord(vaultRoot, topicOrGroup);
  return Boolean(rec && rec.passed);
}
