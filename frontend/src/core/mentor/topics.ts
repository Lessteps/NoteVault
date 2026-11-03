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

/** Las carpetas ancestro de una ruta POSIX (`a/b/c.md` → `a`, `a/b`), de la más corta a la más larga. */
function ancestorsOf(rel: string): string[] {
  const out: string[] = [];
  for (let i = rel.indexOf("/"); i >= 0; i = rel.indexOf("/", i + 1)) out.push(rel.slice(0, i));
  return out;
}

/**
 * La foto de cada tema: progreso, ejercicios, teoría e intentos. Se reparte cada ejercicio y cada nota entre los temas que la contienen UNA sola vez
 * (por carpeta ancestro), en vez de recorrer todos los ejercicios y todas las notas por cada tema: con ~1000 temas, ~8000 ejercicios y ~10000 notas eso
 * eran decenas de millones de comparaciones (2–3 s con el proceso principal bloqueado y la escritura congelada). El resultado es idéntico al de recorrerlos.
 */
export function snapshotTopics(input: TopicSnapInput): TopicSnap[] {
  const topics = input.manifests.map(({ folder, manifest }) => ({ folder: folder.replace(/\\/g, "/"), manifest }));
  const byFolder = new Map<string, number[]>();
  topics.forEach((t, i) => byFolder.set(t.folder, [...(byFolder.get(t.folder) ?? []), i]));

  const exercisesOf: ExerciseRef[][] = topics.map(() => []);
  const exerciseRelsOf: Array<Set<string>> = topics.map(() => new Set<string>());
  for (const ex of input.exercises) {
    const rel = (ex.rel || ex.path).replace(/\\/g, "/");
    for (const dir of ancestorsOf(rel)) {
      for (const i of byFolder.get(dir) ?? []) {
        exercisesOf[i]!.push(ex);
        exerciseRelsOf[i]!.add(rel);
      }
    }
  }

  const theoryOf: number[] = topics.map(() => 0);
  for (const raw of input.noteRels ?? []) {
    const r = raw.replace(/\\/g, "/");
    const base = r.slice(r.lastIndexOf("/") + 1);
    if (base.startsWith("_") || base.startsWith(".") || base.toLowerCase().endsWith(".practica.md")) continue;
    for (const dir of ancestorsOf(r)) {
      for (const i of byFolder.get(dir) ?? []) if (!exerciseRelsOf[i]!.has(r)) theoryOf[i]! += 1;
    }
  }

  return topics.map(({ folder, manifest }, i): TopicSnap => {
    const exercises = exercisesOf[i]!;
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
    const planExercises = manifest.plan
      ? Object.values(manifest.plan).reduce((n, row) => n + (Array.isArray(row) ? row.reduce((a, b) => a + (Number(b) || 0), 0) : 0), 0)
      : 0;
    return {
      folder,
      subject: manifest.subject,
      title: manifest.title,
      progress,
      exerciseCount: exercises.length,
      theoryNotes: theoryOf[i]!,
      attemptCount,
      lastAttemptAt: last,
      ...(planExercises > 0 ? { planExercises } : {}),
    };
  });
}
