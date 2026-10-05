/**
 * Panel "Notas / Estudio" del Mentor: lista compacta de temas por estado. Puro; los datos vienen del
 * escaneo ya hecho (`TopicSnap`) y del informe. Sin anillos ni matrices: eso es el Resumen de estudio.
 */

import type { QueueHint } from "./brief.js";
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

// ── Áreas de estudio (materias) con sus grupos internos y temas ─────────────

export type AreaTopicStatus = "complete" | "in_progress" | "untreated";

export interface AreaTopicRow {
  folder: string;
  title: string;
  /** área interna (segundo nivel de la carpeta); "" si el tema cuelga directamente de la materia */
  group: string;
  status: AreaTopicStatus;
  /** todas las skills dominadas pero falta aprobar el examen que exige el tema */
  examPending: boolean;
  completenessPct: number;
  lastAttemptDays: number | null;
  /** skills con intentos y sin dominar (máx. 4) */
  weakSkills: string[];
}

export interface StudyAreaCard {
  /** primer segmento de la carpeta: la materia tal como se ve en el explorador */
  id: string;
  name: string;
  icon: string;
  colour: string;
  /** área de vida que coincide por nombre ("" si ninguna) */
  lifeArea: string;
  total: number;
  inProgress: number;
  untreated: number;
  complete: number;
  examPending: number;
  /** completitud media de sus temas, 0..100 */
  avgPct: number;
  srsDue: number;
  errors: number;
  next: { kind: string; title: string; folder?: string } | null;
  groups: Array<{ key: string; title: string; topics: AreaTopicRow[] }>;
}

export interface StudyAreasInput {
  /** áreas de vida (.notevault/areas) para heredar color/icono por nombre */
  lifeAreas: ReadonlyArray<{ id: string; name: string; icon: string; colour: string }>;
  srsBySubject: ReadonlyArray<{ subject: string; count: number }>;
  errorsBySubject: Readonly<Record<string, number>>;
  queue: readonly QueueHint[];
}

const PALETTE = ["#2383e2", "#33b679", "#e67c73", "#f6bf26", "#8e24aa", "#0b8043", "#d50000", "#039be5"];
const DEFAULT_ICON = "📚";

const norm = (v: string): string => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const naturalCmp = (a: string, b: string): number => a.localeCompare(b, "es", { numeric: true, sensitivity: "base" });

export function studyAreas(snaps: readonly TopicSnap[], input: StudyAreasInput, now: Date = new Date()): StudyAreaCard[] {
  const bySubject = new Map<string, TopicSnap[]>();
  for (const t of snaps) {
    const seg = t.folder.split("/").filter(Boolean);
    const id = seg.length > 1 ? seg[0]! : t.subject || "General";
    bySubject.set(id, [...(bySubject.get(id) ?? []), t]);
  }
  const ids = [...bySubject.keys()].sort(naturalCmp);
  return ids.map((id, idx) => {
    const list = bySubject.get(id)!;
    const subjectIds = new Set(list.map((t) => norm(t.subject)).concat(norm(id)));
    const life = input.lifeAreas.find((a) => norm(a.name) === norm(id) || norm(a.id) === norm(id));
    const rows = list.map((t) => {
      const pct = Math.round(t.progress.completenessPct);
      const status: AreaTopicStatus = t.attemptCount === 0 ? "untreated" : pct >= 100 ? "complete" : "in_progress";
      const skills = Object.entries(t.progress.skills);
      const allMastered = skills.length > 0 && skills.every(([, s]) => s.mastered);
      const examPending = status !== "complete" && t.progress.topic.mastery.exam === "required" && !t.progress.examPassed && allMastered;
      const seg = t.folder.split("/").filter(Boolean);
      const row: AreaTopicRow = {
        folder: t.folder,
        title: t.title,
        group: seg.length >= 3 ? seg[1]! : "",
        status,
        examPending,
        completenessPct: pct,
        lastAttemptDays: lastDays(t.lastAttemptAt, now),
        weakSkills: skills.filter(([, s]) => !s.mastered && s.totalAttempts > 0).map(([sk]) => sk).slice(0, 4),
      };
      return row;
    });
    const groups = new Map<string, AreaTopicRow[]>();
    for (const r of rows) groups.set(r.group, [...(groups.get(r.group) ?? []), r]);
    const hint = input.queue.find((q) => subjectIds.has(norm(q.subject)));
    const stalled = rows
      .filter((r) => r.status === "in_progress")
      .sort((a, b) => (b.lastAttemptDays ?? 0) - (a.lastAttemptDays ?? 0) || a.folder.localeCompare(b.folder))[0];
    const count = (st: AreaTopicStatus) => rows.filter((r) => r.status === st).length;
    return {
      id,
      name: id,
      icon: life?.icon || DEFAULT_ICON,
      colour: life?.colour || PALETTE[idx % PALETTE.length]!,
      lifeArea: life?.id ?? "",
      total: rows.length,
      inProgress: count("in_progress"),
      untreated: count("untreated"),
      complete: count("complete"),
      examPending: rows.filter((r) => r.examPending).length,
      avgPct: rows.length ? Math.round(rows.reduce((a, r) => a + r.completenessPct, 0) / rows.length) : 0,
      srsDue: input.srsBySubject.filter((s) => subjectIds.has(norm(s.subject))).reduce((a, s) => a + s.count, 0),
      errors: Object.entries(input.errorsBySubject).filter(([k]) => subjectIds.has(norm(k))).reduce((a, [, n]) => a + n, 0),
      // lo concreto primero: el tema a medias más parado; si no hay, lo que recomienda el recomendador
      next: stalled
        ? { kind: "continue", title: stalled.title, folder: stalled.folder }
        : hint
          ? { kind: hint.kind, title: hint.title }
          : null,
      groups: [...groups.entries()]
        .sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : naturalCmp(a, b)))
        .map(([key, topics]) => ({ key, title: key || "General", topics: topics.sort((a, b) => naturalCmp(a.title, b.title)) })),
    };
  });
}
