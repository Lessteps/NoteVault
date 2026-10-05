/**
 * Foto por tema para el informe del Mentor: progreso + cuántas notas/ejercicios/intentos
 * tiene y cuándo fue el último intento. Puro: quien llama aporta lo ya escaneado de la
 * vault (manifiestos, ejercicios, intentos), igual que `study_topic_dashboard`.
 */

import type { ExerciseRef } from "../practice/exerciseIndex.js";
import { computeTopicProgress, type TopicManifest } from "../practice/topic.js";

/** Subconjunto estructural de `TopicProgress` (también lo cumplen los fakes de los tests). */
export interface TopicProgressSnap {
  topic: { title: string; subject: string; mastery: { exam: string } };
  skills: Record<string, { mastered: boolean; status: string; totalAttempts: number; bestScore: number | null }>;
  examPassed: boolean;
  examScore: number | null;
  completenessPct: number;
}

export interface TopicSnap {
  /** carpeta del tema, POSIX relativa a la vault (el id estable del tema) */
  folder: string;
  subject: string;
  title: string;
  progress: TopicProgressSnap;
  exerciseCount: number;
  /** notas de teoría de la carpeta (sin ejercicios ni ficheros internos `_*`/`.*`) */
  theoryNotes: number;
  attemptCount: number;
  /** ISO del último intento en algún ejercicio del tema, o null */
  lastAttemptAt: string | null;
  /** ejercicios que pide el plan del tema (suma de su plan por dificultad); ausente sin plan */
  planExercises?: number;
}

export interface TopicSnapInput {
  manifests: Array<{ folder: string; manifest: TopicManifest }>;
  exercises: ExerciseRef[];
  attempts: Record<string, any>;
  /** rutas POSIX relativas de las notas de la vault (para contar teoría) */
  noteRels?: string[];
  examFor: (manifest: TopicManifest) => { passed: boolean; score?: number } | null;
}

function attemptsOf(entry: unknown): any[] {
  if (Array.isArray(entry)) return entry;
  const list = (entry as { attempts?: unknown } | undefined)?.attempts;
  return Array.isArray(list) ? list : [];
}

export function snapshotTopics(input: TopicSnapInput): TopicSnap[] {
  const out: TopicSnap[] = [];
  const noteRels = (input.noteRels ?? []).map((r) => r.replace(/\\/g, "/"));
  for (const { folder: rawFolder, manifest } of input.manifests) {
    const folder = rawFolder.replace(/\\/g, "/");
    const prefix = folder + "/";
    const exercises = input.exercises.filter((ex) => (ex.rel || ex.path).replace(/\\/g, "/").startsWith(prefix));
    const progress = computeTopicProgress(manifest, exercises, input.attempts, input.examFor(manifest), 0);

    let attemptCount = 0;
    let last: string | null = null;
    for (const ex of exercises) {
      for (const a of attemptsOf(input.attempts[ex.note_id])) {
        attemptCount += 1;
        const at = String(a?.at ?? "");
        if (at && (last === null || at > last)) last = at;
      }
    }

    const exerciseRels = new Set(exercises.map((e) => (e.rel || e.path).replace(/\\/g, "/")));
    const theoryNotes = noteRels.filter((r) => {
      if (!r.startsWith(prefix) || exerciseRels.has(r)) return false;
      const base = r.slice(r.lastIndexOf("/") + 1);
      return !base.startsWith("_") && !base.startsWith(".") && !base.toLowerCase().endsWith(".practica.md");
    }).length;

    const planExercises = manifest.plan
      ? Object.values(manifest.plan).reduce((n, row) => n + (Array.isArray(row) ? row.reduce((a, b) => a + (Number(b) || 0), 0) : 0), 0)
      : 0;
    out.push({
      folder,
      subject: manifest.subject,
      title: manifest.title,
      progress,
      exerciseCount: exercises.length,
      theoryNotes,
      attemptCount,
      lastAttemptAt: last,
      ...(planExercises > 0 ? { planExercises } : {}),
    });
  }
  return out;
}
