// Mentor: informe del estudiante, candidatos de estudio y registro de sesiones.
//
// Todo el cálculo vive en core/mentor (puro y testeado); aquí solo se arma el
// contexto con los managers de la vault y se validan las entradas de la UI. La IA
// (fase siguiente) consume `mentor_brief().text`: nunca lee notas completas.

import { ApiError } from "../../core/errors.js";
import { loadExamRecordForTopic } from "../../core/practice/exams.js";
import { loadAllAttempts } from "../../core/practice/ledger.js";
import { hubSnapshot } from "../../core/practice/recommender.js";
import { manifestsFromNotes, type TopicManifest } from "../../core/practice/topic.js";
import { allocate, buildCandidates } from "../../core/mentor/candidates.js";
import { buildStudentBrief, toPromptText, type BriefContext, type QueueHint } from "../../core/mentor/brief.js";
import { adherence, BLOCK_STATUSES, sanitizeSession, SessionLog, type BlockStatus } from "../../core/mentor/sessionLog.js";
import { snapshotTopics, type TopicSnap } from "../../core/mentor/topics.js";
import { StudyErrorManager } from "../../core/studyErrorManager.js";
import { StudySRSManager } from "../../core/studySrsManager.js";
import type { AppState } from "../appState.js";
import { clampInt } from "../common.js";
import { vaultScan } from "../vaultScan.js";

const DEFAULT_BRIEF_CHARS = 6000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function needDate(value: unknown): string {
  const d = String(value ?? "");
  if (!DATE_RE.test(d)) throw new ApiError("Fecha inválida (AAAA-MM-DD).");
  return d;
}

/** Foto de todos los temas de la vault (misma fuente que `study_topic_dashboard`). */
function topicSnaps(app: AppState): TopicSnap[] {
  const scan = vaultScan(app);
  const byFolder = new Map<string, { folder: string; manifest: TopicManifest }>();
  for (const found of manifestsFromNotes(scan.notes)) {
    const folder = app.rel(found.topicFolder).replace(/\\/g, "/");
    if (!byFolder.has(folder)) {
      byFolder.set(folder, { folder, manifest: { ...found.manifest, path: app.rel(found.manifestPath), folder } });
    }
  }
  return snapshotTopics({
    manifests: [...byFolder.values()],
    exercises: scan.exercises,
    attempts: loadAllAttempts(app.root),
    noteRels: scan.notes.map((n) => n.rel),
    examFor: (manifest) => loadExamRecordForTopic(app.root, manifest),
  });
}

/** Cola del recomendador (la misma del hub de Estudio), resumida; vacía si falla. */
function studyQueue(app: AppState): QueueHint[] {
  try {
    const snap = hubSnapshot(app.root, app.vault.notePaths(), null, null);
    return snap.queue.items.slice(0, 8).map((q) => ({
      kind: q.kind,
      subject: q.subject,
      title: q.title,
      reason: q.reason,
      ...(q.exercise?.rel ? { exercise: q.exercise.rel } : {}),
    }));
  } catch {
    return [];
  }
}

export function briefContext(app: AppState, log: SessionLog): BriefContext {
  const m = app.mgrs();
  const now = new Date();
  return {
    today: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
    goals: m.goals,
    tasks: m.tasks,
    projects: m.projects,
    srs: new StudySRSManager(app.root),
    errors: new StudyErrorManager(app.root),
    topics: () => topicSnaps(app),
    sessions: () => log.recent(14),
    queue: () => studyQueue(app),
  };
}

export function mentorApi(app: AppState) {
  const log = () => new SessionLog(app.root);

  return {
    mentor_brief(opts: unknown = {}) {
      const o = (opts && typeof opts === "object" ? opts : {}) as Record<string, any>;
      const strs = (v: unknown): string[] | undefined =>
        Array.isArray(v) ? v.map((x) => String(x)).slice(0, 20) : undefined;
      const brief = buildStudentBrief(briefContext(app, log()), { only: strs(o.only), exclude: strs(o.exclude) });
      const maxChars = clampInt(o.maxChars, 500, 40000, DEFAULT_BRIEF_CHARS);
      return { brief, text: toPromptText(brief, maxChars) };
    },

    mentor_candidates(opts: unknown) {
      const o = (opts && typeof opts === "object" ? opts : {}) as Record<string, any>;
      const availableMinutes = clampInt(o.availableMinutes, 5, 720, 60);
      const brief = buildStudentBrief(briefContext(app, log()));
      const candidates = buildCandidates(brief, { availableMinutes });
      const plan = allocate(candidates, availableMinutes, {
        maxSubjects: o.maxSubjects === undefined ? undefined : clampInt(o.maxSubjects, 1, 10, 3),
      });
      return {
        availableMinutes,
        candidates,
        plan,
        plannedMinutes: plan.reduce((n, c) => n + c.estMinutes, 0),
      };
    },

    mentor_session_save(record: unknown) {
      const clean = sanitizeSession(record);
      if (!clean) throw new ApiError("Sesión inválida.");
      return log().save(clean);
    },

    mentor_session_load(date: unknown) {
      return log().load(needDate(date));
    },

    mentor_session_recent(n: unknown = 14) {
      return log().recent(clampInt(n, 1, 365, 14));
    },

    mentor_session_mark_block(date: unknown, candidateId: unknown, status: unknown, note?: unknown) {
      if (!(BLOCK_STATUSES as readonly string[]).includes(String(status))) throw new ApiError("Estado de bloque inválido.");
      const rec = log().markBlock(
        needDate(date),
        String(candidateId ?? ""),
        status as BlockStatus,
        note === undefined || note === null ? undefined : String(note),
      );
      if (!rec) throw new ApiError("Ese bloque ya no existe.");
      return rec;
    },

    mentor_adherence(n: unknown = 30) {
      return adherence(log().recent(clampInt(n, 1, 365, 30)));
    },
  };
}
