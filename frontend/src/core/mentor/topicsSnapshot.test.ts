// `snapshotTopics` reparte ejercicios y notas entre temas en UNA pasada. Debe dar EXACTAMENTE lo mismo que la versión original (recorrer todos los ejercicios
// y todas las notas por cada tema), también con temas anidados, carpetas repetidas y notas que no cuentan como teoría; y debe ser rápido con una vault grande.

import { describe, expect, it } from "vitest";
import type { ExerciseRef } from "../practice/exerciseIndex.js";
import { computeTopicProgress, type TopicManifest } from "../practice/topic.js";
import { snapshotTopics, type TopicSnap, type TopicSnapInput } from "./topics.js";

const manifest = (title: string, plan?: Record<string, number[]>): TopicManifest =>
  ({ type: "topic", subject: "programming", title, skills: ["explain", "implement"], mastery: { min_per_skill: 6, target_difficulty: 3, exam: "none" }, ...(plan ? { plan } : {}) }) as unknown as TopicManifest;

const ex = (rel: string, id: string, skill = "explain", difficulty = 1): ExerciseRef =>
  ({ path: `/vault/${rel}`, rel, note_id: id, title: id, subject: "programming", discipline: "x", skill, mode: "", difficulty, concept: "", chapter: "", chapter_title: "", integration: false }) as ExerciseRef;

/** La implementación original, tal cual (referencia). */
function reference(input: TopicSnapInput): TopicSnap[] {
  const out: TopicSnap[] = [];
  const attemptsOf = (e: unknown): any[] => (Array.isArray(e) ? e : Array.isArray((e as { attempts?: unknown })?.attempts) ? (e as { attempts: any[] }).attempts : []);
  const noteRels = (input.noteRels ?? []).map((r) => r.replace(/\\/g, "/"));
  for (const { folder: rawFolder, manifest: m } of input.manifests) {
    const folder = rawFolder.replace(/\\/g, "/");
    const prefix = folder + "/";
    const exercises = input.exercises.filter((e) => (e.rel || e.path).replace(/\\/g, "/").startsWith(prefix));
    const progress = computeTopicProgress(m, exercises, input.attempts, input.examFor(m), 0);
    let attemptCount = 0;
    let last: string | null = null;
    for (const e of exercises) for (const a of attemptsOf(input.attempts[e.note_id])) {
      attemptCount += 1;
      const at = String(a?.at ?? "");
      if (at && (last === null || at > last)) last = at;
    }
    const exerciseRels = new Set(exercises.map((e) => (e.rel || e.path).replace(/\\/g, "/")));
    const theoryNotes = noteRels.filter((r) => {
      if (!r.startsWith(prefix) || exerciseRels.has(r)) return false;
      const base = r.slice(r.lastIndexOf("/") + 1);
      return !base.startsWith("_") && !base.startsWith(".") && !base.toLowerCase().endsWith(".practica.md");
    }).length;
    const planExercises = m.plan ? Object.values(m.plan).reduce((n, row) => n + (Array.isArray(row) ? row.reduce((a, b) => a + (Number(b) || 0), 0) : 0), 0) : 0;
    out.push({ folder, subject: m.subject, title: m.title, progress, exerciseCount: exercises.length, theoryNotes, attemptCount, lastAttemptAt: last, ...(planExercises > 0 ? { planExercises } : {}) });
  }
  return out;
}

/** Generador pseudoaleatorio con semilla (las pruebas son repetibles). */
function rng(seed: number): () => number {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

function randomVault(seed: number, topicsN: number, exercisesN: number, notesN: number): TopicSnapInput {
  const r = rng(seed);
  const pick = <T,>(a: readonly T[]): T => a[Math.floor(r() * a.length)]!;
  const areas = ["Programación/2.1 Python", "Programación/4 Backend", "Programación/5 Frontend/HTML", "Matemáticas/1 Aritmética"];
  const folders: string[] = [];
  for (let i = 0; i < topicsN; i++) {
    const area = pick(areas);
    // a veces un tema cuelga DENTRO de otro (anidado) y a veces se repite una carpeta
    const nested = folders.length && r() < 0.15 ? `${pick(folders)}/${i}.9 Anidado` : `${area}/${Math.floor(i / 4)}.${i % 4} Tema ${i}`;
    folders.push(r() < 0.05 && folders.length ? pick(folders) : nested);
  }
  const manifests = folders.map((folder, i) => ({ folder: r() < 0.3 ? folder.replace(/\//g, "\\") : folder, manifest: manifest(`Tema ${i}`, r() < 0.2 ? { explain: [1, 2], implement: [3] } : undefined) }));
  const exercises = Array.from({ length: exercisesN }, (_, i) => {
    const f = pick(folders);
    return ex(`${f}/Ejercicios/${pick(["explain", "implement"])}/e${i}.md`, `ex${i}`, pick(["explain", "implement"]), 1 + Math.floor(r() * 3));
  });
  const noteRels = [
    ...exercises.map((e) => e.rel), // los ejercicios también son notas de la vault
    ...Array.from({ length: notesN }, (_, i) => {
      const f = pick(folders);
      return `${f}/${pick(["nota", "_oculta", ".privada", "otra.PRACTICA.md", "Teoría"])} ${i}.md`;
    }),
  ];
  const attempts: Record<string, unknown> = {};
  for (const e of exercises) if (r() < 0.4) attempts[e.note_id] = { attempts: [{ at: `2026-10-${10 + Math.floor(r() * 20)}`, ok: r() < 0.5 }] };
  return { manifests, exercises, attempts, noteRels, examFor: () => null };
}

describe("snapshotTopics: una pasada, mismo resultado", () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8])("idéntico a la versión original en una vault aleatoria (semilla %i)", (seed) => {
    const input = randomVault(seed, 60, 400, 500);
    expect(snapshotTopics(input)).toEqual(reference(input));
  });

  it("sin notas ni ejercicios, y con temas anidados contando también para su padre", () => {
    const m = manifest("x");
    const input: TopicSnapInput = {
      manifests: [{ folder: "A/1 Padre", manifest: m }, { folder: "A/1 Padre/1.1 Hijo", manifest: m }],
      exercises: [ex("A/1 Padre/1.1 Hijo/Ejercicios/explain/e.md", "e")],
      attempts: {},
      noteRels: ["A/1 Padre/teoria.md", "A/1 Padre/1.1 Hijo/hijo.md", "A/1 Padre/1.1 Hijo/Ejercicios/explain/e.md"],
      examFor: () => null,
    };
    const snaps = snapshotTopics(input);
    expect(snaps).toEqual(reference(input));
    expect(snaps.map((s) => [s.exerciseCount, s.theoryNotes])).toEqual([[1, 2], [1, 1]]);
    expect(snapshotTopics({ ...input, manifests: [], noteRels: undefined })).toEqual([]);
  });

  it("escala: ~1000 temas, ~8000 ejercicios y ~10000 notas se resuelven en una fracción de segundo", () => {
    const input = randomVault(42, 1000, 8000, 10000);
    const t0 = performance.now();
    const fast = snapshotTopics(input);
    const fastMs = performance.now() - t0;
    expect(fast).toHaveLength(1000);
    expect(fastMs).toBeLessThan(1500);
    // y sigue dando lo mismo que la versión original (que tarda mucho más)
    expect(fast).toEqual(reference(input));
  }, 120000);
});
