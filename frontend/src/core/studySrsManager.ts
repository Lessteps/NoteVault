/**
 * NoteVault Study Spaced Repetition (SRS) Manager
 * Shared Spaced Repetition Engine for Mathematics, Programming, English, and General concepts.
 * Stores individual SRS records in .notevault/estudio/srs/<srs_id>.json.
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { formatIsoDate, parseIsoDate } from "./dates.js";
import * as store from "./store.js";
import { formatLayout, isSyncConflict, LAYOUT } from "./vaultFormat.js";

export const DEFAULT_EASE_FACTOR = 2.5;
export const MIN_EASE_FACTOR = 1.3;

export interface SrsReviewHistory {
  date: string;
  grade: number;
  interval_days: number;
  ease_factor: number;
}

export interface SrsItem {
  id: string;
  entity_id: string;
  entity_type: string;
  subject: string;
  topic: string;
  source_note: string;
  difficulty: number;
  interval_days: number;
  ease_factor: number;
  repetitions: number;
  lapses: number;
  last_reviewed: string;
  next_review: string;
  mastery: number;
  history: SrsReviewHistory[];
}

export function generateSrsId(subject: string, entityType: string, entityId: string): string {
  const raw = `${subject.toLowerCase()}:${entityType.toLowerCase()}:${entityId.trim()}`;
  const h = crypto.createHash("sha256").update(raw, "utf-8").digest("hex").slice(0, 12);
  return `srs_${h}`;
}

export function sanitizeSrsItem(raw: Record<string, any>, fallbackId: string = ""): SrsItem {
  const data = raw && typeof raw === "object" ? raw : {};
  let srsId = String(data.id || fallbackId || "").trim();
  if (!srsId) {
    const h = crypto.createHash("sha256").update(String(Date.now()), "utf-8").digest("hex").slice(0, 12);
    srsId = `srs_${h}`;
  }

  const todayStr = formatIsoDate(new Date());
  let ease = parseFloat(data.ease_factor);
  if (Number.isNaN(ease)) ease = DEFAULT_EASE_FACTOR;
  ease = Math.max(MIN_EASE_FACTOR, ease);

  let mastery = parseFloat(data.mastery);
  if (Number.isNaN(mastery)) mastery = 0.0;
  mastery = Math.round(Math.max(0.0, Math.min(1.0, mastery)) * 100) / 100;

  const difficulty = parseInt(data.difficulty, 10);
  const intervalDays = parseInt(data.interval_days, 10);
  const repetitions = parseInt(data.repetitions, 10);
  const lapses = parseInt(data.lapses, 10);

  return {
    id: srsId,
    entity_id: String(data.entity_id || "").trim(),
    entity_type: String(data.entity_type || "concept").toLowerCase(),
    subject: String(data.subject || "general").toLowerCase(),
    topic: String(data.topic || "").trim(),
    source_note: String(data.source_note || ""),
    difficulty: Math.max(1, Math.min(5, Number.isNaN(difficulty) ? 1 : difficulty)),
    interval_days: Math.max(1, Number.isNaN(intervalDays) ? 1 : intervalDays),
    ease_factor: Math.round(ease * 100) / 100,
    repetitions: Math.max(0, Number.isNaN(repetitions) ? 0 : repetitions),
    lapses: Math.max(0, Number.isNaN(lapses) ? 0 : lapses),
    last_reviewed: String(data.last_reviewed || todayStr),
    next_review: String(data.next_review || todayStr),
    mastery,
    history: Array.isArray(data.history) ? [...data.history] : [],
  };
}

export class StudySRSManager {
  readonly vaultRoot: string;
  readonly dir: string;
  private _cache: Map<string, SrsItem> | null = null;
  private _stamp: string | null = null;

  constructor(vaultRoot: string) {
    this.vaultRoot = path.resolve(vaultRoot);
    this.dir = path.join(this.vaultRoot, LAYOUT.study_srs_dir);
    fs.mkdirSync(this.dir, { recursive: true });
  }

  private _path(srsId: string): string {
    return path.join(this.vaultRoot, formatLayout(LAYOUT.study_srs_item, { id: srsId }));
  }

  private _dirStamp(): { files: string[]; stampStr: string } {
    try {
      if (!fs.existsSync(this.dir)) return { files: [], stampStr: "" };
      const files = fs.readdirSync(this.dir).filter((f) => f.endsWith(".json")).sort();
      const parts: string[] = [];
      for (const f of files) {
        try {
          const st = fs.statSync(path.join(this.dir, f));
          parts.push(`${f}:${st.mtimeMs}:${st.size}`);
        } catch {
          // ignore
        }
      }
      return { files, stampStr: parts.join(";") };
    } catch {
      return { files: [], stampStr: "" };
    }
  }

  private _loadAll(): Map<string, SrsItem> {
    const { files, stampStr } = this._dirStamp();
    if (this._cache === null || stampStr !== this._stamp) {
      const out = new Map<string, SrsItem>();
      for (const name of files) {
        if (isSyncConflict(name)) continue;
        const filePath = path.join(this.dir, name);
        const data = store.loadJson<Record<string, any>>(filePath);
        if (data && typeof data === "object") {
          const clean = sanitizeSrsItem(data, path.basename(name, ".json"));
          out.set(clean.id, clean);
        }
      }
      this._cache = out;
      this._stamp = stampStr;
    }
    return this._cache;
  }

  allItems(): SrsItem[] {
    return Array.from(this._loadAll().values()).map((i) => ({ ...i }));
  }

  all_items(): SrsItem[] {
    return this.allItems();
  }

  get(srsId: string): SrsItem | null {
    const item = this._loadAll().get(srsId);
    return item ? { ...item } : null;
  }

  registerItem(
    entityId: string,
    entityType: string,
    subject: string,
    topic: string = "",
    sourceNote: string = "",
    difficulty: number = 1
  ): SrsItem {
    const srsId = generateSrsId(subject, entityType, entityId);
    const existing = this.get(srsId);
    if (existing) {
      return existing;
    }

    const todayStr = formatIsoDate(new Date());
    const data: Record<string, any> = {
      id: srsId,
      entity_id: entityId,
      entity_type: entityType,
      subject,
      topic,
      source_note: sourceNote,
      difficulty,
      interval_days: 1,
      ease_factor: DEFAULT_EASE_FACTOR,
      repetitions: 0,
      lapses: 0,
      last_reviewed: todayStr,
      next_review: todayStr,
      mastery: 0.0,
      history: [],
    };
    const clean = sanitizeSrsItem(data, srsId);
    store.writeJson(this._path(clean.id), clean);
    this._cache = null;
    return clean;
  }

  register_item(
    entityId: string,
    entityType: string,
    subject: string,
    topic: string = "",
    sourceNote: string = "",
    difficulty: number = 1
  ): SrsItem {
    return this.registerItem(entityId, entityType, subject, topic, sourceNote, difficulty);
  }

  review(
    srsId: string,
    qualityGrade: number,
    reviewDate?: Date | string | null
  ): SrsItem | null {
    const item = this.get(srsId);
    if (!item) return null;

    let today: Date;
    if (reviewDate) {
      const parsed = typeof reviewDate === "string" ? parseIsoDate(reviewDate) : reviewDate;
      today = parsed || new Date();
    } else {
      today = new Date();
    }
    today.setHours(0, 0, 0, 0);

    const grade = Math.max(0, Math.min(5, Math.floor(qualityGrade)));
    let repetitions = item.repetitions;
    let ease = item.ease_factor;
    let interval = item.interval_days;
    let lapses = item.lapses;

    if (grade >= 3) {
      if (repetitions === 0) {
        interval = 1;
      } else if (repetitions === 1) {
        interval = 6;
      } else {
        interval = Math.max(1, Math.round(interval * ease));
      }
      repetitions += 1;
      ease = ease + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02));
      ease = Math.max(MIN_EASE_FACTOR, ease);
    } else {
      repetitions = 0;
      interval = 1;
      lapses += 1;
      ease = Math.max(MIN_EASE_FACTOR, ease - 0.2);
    }

    const nextDue = new Date(today.getTime() + interval * 86400000);
    const mastery = Math.min(1.0, Math.max(0.0, repetitions * 0.18 - lapses * 0.08));

    item.repetitions = repetitions;
    item.ease_factor = Math.round(ease * 100) / 100;
    item.interval_days = interval;
    item.lapses = lapses;
    item.last_reviewed = formatIsoDate(today);
    item.next_review = formatIsoDate(nextDue);
    item.mastery = Math.round(mastery * 100) / 100;
    item.history.push({
      date: formatIsoDate(today),
      grade,
      interval_days: interval,
      ease_factor: Math.round(ease * 100) / 100,
    });

    store.writeJson(this._path(item.id), sanitizeSrsItem(item));
    this._cache = null;
    return item;
  }

  dueItems(targetDate?: Date | string | null, subject?: string | null): SrsItem[] {
    let targetStr: string;
    if (targetDate) {
      const parsed = typeof targetDate === "string" ? parseIsoDate(targetDate) : targetDate;
      targetStr = parsed ? formatIsoDate(parsed) : formatIsoDate(new Date());
    } else {
      targetStr = formatIsoDate(new Date());
    }

    const all = this.allItems();
    let due = all.filter((i) => i.next_review <= targetStr);
    if (subject) {
      const sLow = subject.toLowerCase();
      due = due.filter((i) => i.subject === sLow);
    }

    due.sort((a, b) => {
      if (a.next_review !== b.next_review) {
        return a.next_review.localeCompare(b.next_review);
      }
      if (a.lapses !== b.lapses) {
        return b.lapses - a.lapses;
      }
      return a.mastery - b.mastery;
    });

    return due;
  }

  due_items(targetDate?: Date | string | null, subject?: string | null): SrsItem[] {
    return this.dueItems(targetDate, subject);
  }
}
