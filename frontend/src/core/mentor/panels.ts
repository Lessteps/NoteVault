/**
 * Panel "Notas / Estudio" del Mentor: lista compacta de temas por estado. Puro; los datos vienen del
 * escaneo ya hecho (`TopicSnap`) y del informe. Sin anillos ni matrices: eso es el Resumen de estudio.
 */

import type { TopicSnap } from "./topics.js";

export interface TopicRow {
  folder: string;
  title: string;
  subject: string;
  completenessPct: number;
  /** días desde el último intento; null si nunca */
  lastAttemptDays: number | null;
  /** skills sin dominar con intentos flojos o sin iniciar (máx. 4) */
  pendingSkills: string[];
}

export interface TopicsPanel {
  total: number;
  inProgress: number;
  untreated: number;
  complete: number;
  /** a medias, el último intento más antiguo primero (los parados arriba) */
  inProgressList: TopicRow[];
  untreatedList: TopicRow[];
  /** con intentos en los últimos 7 días */
  recentList: TopicRow[];
}

const MAX_ROWS = 8;
const RECENT_DAYS = 7;

const dayMs = 86400000;
const startOfDay = (d: Date): number => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

function lastDays(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  return Math.max(0, Math.round((startOfDay(now) - startOfDay(d)) / dayMs));
}

export function topicsPanel(snaps: readonly TopicSnap[], now: Date = new Date()): TopicsPanel {
  const rows = snaps.map((t) => {
    const pct = Math.round(t.progress.completenessPct);
    const untreated = t.attemptCount === 0;
    const status = untreated ? "untreated" : pct >= 100 ? "complete" : "in_progress";
    const row: TopicRow = {
      folder: t.folder,
      title: t.title,
      subject: t.subject,
      completenessPct: pct,
      lastAttemptDays: lastDays(t.lastAttemptAt, now),
      pendingSkills: Object.entries(t.progress.skills)
        .filter(([, s]) => !s.mastered)
        .map(([id]) => id)
        .slice(0, 4),
    };
    return { status, row, hasMaterial: t.exerciseCount + t.theoryNotes > 0 };
  });
  const inProgress = rows.filter((r) => r.status === "in_progress");
  const untreated = rows.filter((r) => r.status === "untreated" && r.hasMaterial);
  const recent = rows.filter((r) => r.row.lastAttemptDays !== null && r.row.lastAttemptDays <= RECENT_DAYS);
  return {
    total: rows.length,
    inProgress: inProgress.length,
    untreated: rows.filter((r) => r.status === "untreated").length,
    complete: rows.filter((r) => r.status === "complete").length,
    inProgressList: inProgress
      .map((r) => r.row)
      .sort((a, b) => (b.lastAttemptDays ?? 0) - (a.lastAttemptDays ?? 0) || a.folder.localeCompare(b.folder))
      .slice(0, MAX_ROWS),
    untreatedList: untreated.map((r) => r.row).sort((a, b) => a.folder.localeCompare(b.folder)).slice(0, MAX_ROWS),
    recentList: recent
      .map((r) => r.row)
      .sort((a, b) => (a.lastAttemptDays ?? 0) - (b.lastAttemptDays ?? 0) || a.folder.localeCompare(b.folder))
      .slice(0, MAX_ROWS),
  };
}
