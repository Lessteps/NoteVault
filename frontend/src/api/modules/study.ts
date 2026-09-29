// Ported from notevault_app/webapp/modules/study.py
// Estudio: the study side panel of Notas — the area's daily queue (exercises
// to practise, spaced reviews, concept cards), its ledger of skills and the
// error log of its subject.

import * as fs from "node:fs";
import * as path from "node:path";
import { ApiError } from "../../core/errors.js";
import { parseFrontmatter } from "../../core/frontmatter.js";
import { loadCard } from "../../core/practice/cards.js";
import { DISCIPLINES, skillOf } from "../../core/practice/disciplineCatalog.js";
import { writeErrorDigest } from "../../core/practice/errorLog.js";
import type { ExerciseRef, VaultScan } from "../../core/practice/exerciseIndex.js";
import { BANDS, attemptPassed } from "../../core/practice/ledger.js";
import { MODES } from "../../core/practice/modes.js";
import {
  hubSnapshot,
  pickExercise,
  skillLabel,
} from "../../core/practice/recommender.js";
import { StudyArea, detectStudyArea } from "../../core/practice/studyArea.js";
import { ensureOverviewFile, ensureTopicViewFiles, folderHasTopicsBelow, isSubjectRoot, isTopicFolder, mapNoteOf } from "../../core/practice/viewFiles.js";
import { StudyErrorManager } from "../../core/studyErrorManager.js";
import { StudySRSManager } from "../../core/studySrsManager.js";
import { LAYOUT } from "../../core/vaultFormat.js";
import { WorkspaceManager } from "../../core/workspaceManager.js";
import {
  type TopicManifest,
  computeTopicProgress,
  createDefaultTopicManifest,
  findAncestorTopicManifest,
  manifestsFromNotes,
  serializeTopicManifest,
} from "../../core/practice/topic.js";
import {
  type QuantityOption,
  type TheoryNoteContext,
  buildTopicSession,
  type SessionAIClient,
} from "../../core/practice/sessionBuilder.js";
import {
  type ExamItemSubmission,
  type ExamSession,
  type ExamGrader,
  assembleGroupedExam,
  assembleTopicExam,
  gradeAndAggregateExam,
  loadExamRecordForTopic,
} from "../../core/practice/exams.js";
import { loadAllAttempts } from "../../core/practice/ledger.js";
import { clearExerciseIndexCache, scanVault, warmNoteCache } from "../../core/practice/exerciseIndex.js";
import { AIConfig, sendChat } from "../../core/aiClient.js";
import { AppConfig } from "../appConfig.js";
import type { DifficultyLevel } from "../../core/practice/skills.js";
import type { AppState } from "../appState.js";
import { isoDate } from "../common.js";

export const STUDY_IDS = ["mathematics", "programming", "english"] as const;

function exerciseDict(ex: ExerciseRef, rel: string): Record<string, unknown> {
  const disc = DISCIPLINES[ex.discipline];
  const skill = disc && ex.skill ? skillOf(disc, ex.skill) : null;
  const mode = MODES[ex.mode];
  return {
    path: rel,
    note_id: ex.note_id,
    title: ex.title,
    discipline: disc ? disc.title : ex.discipline,
    skill: skill ? `${ex.skill} ${skill.title.split(" (")[0]}` : ex.skill,
    mode: mode ? mode.label : ex.mode,
    difficulty: ex.difficulty,
  };
}

function studyRel(app: AppState, p: string | null | undefined): string {
  if (!p) return "";
  try {
    const abs = path.resolve(app.root, p);
    return app.rel(abs);
  } catch {
    return "";
  }
}

function getStudyArea(app: AppState, rel: string): StudyArea | null {
  const absPath = app.resolve(rel, { allowRoot: true });
  let stat: fs.Stats;
  try {
    stat = fs.statSync(absPath);
  } catch {
    return null;
  }
  const isDir = stat.isDirectory();
  const ext = path.extname(absPath).toLowerCase();
  if (!isDir && ext !== ".md" && ext !== ".canvas") {
    return null;
  }
  let r = absPath !== app.root ? app.rel(absPath) : "";
  if (isDir) {
    r += "/_";
  }
  let fm: Record<string, any> = {};
  if (!isDir && ext === ".md") {
    try {
      const fd = fs.openSync(absPath, "r");
      const buf = Buffer.alloc(4096);
      const bytesRead = fs.readSync(fd, buf, 0, 4096, 0);
      fs.closeSync(fd);
      const text = buf.toString("utf-8", 0, bytesRead);
      const [parsed] = parseFrontmatter(text);
      if (parsed && typeof parsed === "object") {
        fm = parsed;
      }
    } catch {
      fm = {};
    }
  }
  const workspaces = new WorkspaceManager(app.root).workspaces();
  return detectStudyArea(r, fm, workspaces);
}

interface CachedStudySnapshot {
  data: any;
  timestamp: number;
}

const _snapshotCache = new Map<string, CachedStudySnapshot>();
const SNAPSHOT_CACHE_TTL_MS = 30_000;

/** The per-subject dashboard is expensive (it scans the whole vault), so it is memoed. */
const _dashboardCache = new Map<string, { data: unknown; timestamp: number }>();

/**
 * One vault scan, shared by every study call that needs it.
 *
 * Reading every note is the expensive part of the whole study API (six call sites
 * used to do it independently, each paying the disk cost), so the scan is kept
 * here and dropped whenever the vault changes — the same invalidation the
 * snapshots use, plus the TTL as a safety net.
 */
const _scanCache = new Map<string, { data: VaultScan; timestamp: number }>();

export function vaultScan(app: AppState): VaultScan {
  const hit = _scanCache.get(app.root);
  if (hit && Date.now() - hit.timestamp < SNAPSHOT_CACHE_TTL_MS) return hit.data;
  const data = scanVault(app.root, app.vault.notePaths());
  _scanCache.set(app.root, { data, timestamp: Date.now() });
  return data;
}

export function clearStudySnapshotCache(): void {
  _snapshotCache.clear();
  _dashboardCache.clear();
  _scanCache.clear();
}

/**
 * Read the vault into the per-file cache in the background, once the window is up.
 *
 * The first study view opened in a cold process used to wait for the whole vault to
 * be read (measured: 30 s over 2 107 notes, with the main process blocked the whole
 * time). Warming it here — in batches, yielding between them — moves that cost to
 * right after launch, where nothing is waiting for it.
 */
export async function warmStudyIndex(): Promise<{ notes: number; ms: number }> {
  const app = getWarmApp();
  if (!app) return { notes: 0, ms: 0 };
  const started = Date.now();
  const notes = await warmNoteCache(app.vault.notePaths());
  return { notes, ms: Date.now() - started };
}

/** Set by the registry (the study module is built against an AppState). */
let warmApp: AppState | null = null;
function getWarmApp(): AppState | null {
  return warmApp;
}
export function setWarmApp(app: AppState): void {
  warmApp = app;
}

function resolveTopicDir(app: AppState, relPath: string): string {
  try {
    const abs = app.resolve(relPath, { allowRoot: true });
    let dir = fs.statSync(abs).isDirectory() ? abs : path.dirname(abs);
    const base = path.basename(dir).toLowerCase();
    if (["ejercicios", "exercises", "demostraciones", "proofs", "practica"].includes(base)) {
      const parent = path.dirname(dir);
      if (parent !== app.root) dir = parent;
    }
    return app.rel(dir);
  } catch {
    return "";
  }
}

function findTopicManifest(
  app: AppState,
  topicFolder: string,
): { path: string; manifest: TopicManifest } | null {
  try {
    const absDir = app.resolve(topicFolder, { allowRoot: true });
    const found = findAncestorTopicManifest(absDir, app.root);
    if (found) {
      const relPath = app.rel(found.manifestPath);
      const relFolder = app.rel(found.topicFolder);
      return {
        path: relPath,
        manifest: {
          ...found.manifest,
          path: relPath,
          folder: relFolder,
        },
      };
    }
  } catch {}
  return null;
}

export function studyApi(app: AppState) {
  return {
    study_area(rel: string) {
      const area = getStudyArea(app, rel);
      if (!area) {
        return null;
      }
      return {
        subject: area.subject,
        folder: area.folder,
        title: area.title,
        subject_title: area.subject_title,
      };
    },

    study_snapshot(rel: string) {
      const area = getStudyArea(app, rel);
      if (!area) {
        throw new ApiError("Esta nota no está en un área de estudio.");
      }
      const cacheKey = `${app.root}::${area.subject}::${area.folder}`;
      const cached = _snapshotCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < SNAPSHOT_CACHE_TTL_MS) {
        return cached.data;
      }
      const snap = hubSnapshot(app.root, app.vault.notePaths(), null, area);
      const srs = new StudySRSManager(app.root);
      const items: Array<Record<string, unknown>> = [];

      for (const it of snap.queue.items) {
        const row: Record<string, unknown> = {
          kind: it.kind,
          title: it.title,
          reason: it.reason,
        };
        if (it.exercise) {
          row.exercise = exerciseDict(it.exercise, studyRel(app, it.exercise.path));
        } else if (it.srs_item) {
          const card = loadCard(app.root, it.srs_item);
          row.card = {
            srs_id: it.srs_item.id,
            source: String(it.srs_item.source_note || ""),
            kind: card ? card.kind : "",
            question: card ? card.question : "",
            answer: card ? card.answer : "",
            missing: card === null,
          };
        }
        items.push(row);
      }

      const attempted = new Set<string>();
      for (const [nid, d] of Object.entries(snap.attempts)) {
        if (Array.isArray(d.attempts) && d.attempts.length > 0) {
          attempted.add(nid);
        }
      }

      const today = isoDate(new Date())!;
      const due: Record<string, string> = {};
      for (const i of snap.srs_items) {
        if (i.entity_type === "exercise" && i.next_review <= today) {
          due[i.entity_id] = i.next_review;
        }
      }

      const ledgers: Array<Record<string, unknown>> = [];
      for (const ledger of Object.values(snap.ledgers)) {
        const rows: Array<Record<string, unknown>> = [];
        for (const row of ledger.skills) {
          const refs = snap.exercises.filter(
            (e) => e.discipline === ledger.discipline && e.skill === row.code,
          );
          const ex =
            pickExercise(refs, attempted, due) || (refs.length > 0 ? refs[0]! : null);
          rows.push({
            code: row.code,
            title: String(row.title || "").split(" (")[0],
            status: row.status,
            label: row.label,
            best: row.best ?? null,
            is_due: Boolean(row.is_due),
            due: row.due || "",
            interval_days: row.interval_days ?? null,
            bands: (BANDS as readonly string[]).filter((b) =>
              (row.bands || []).includes(b),
            ),
            exercises: row.exercises,
            attempted: row.attempted_exercises,
            practice: ex ? studyRel(app, ex.path) : "",
            practice_title: ex ? ex.title : "",
          });
        }
        ledgers.push({ title: ledger.title, skills: rows });
      }

      const chapters = new Map<string, [string, ExerciseRef[]]>();
      for (const e of snap.exercises) {
        if (!chapters.has(e.chapter)) {
          chapters.set(e.chapter, [e.chapter_title, []]);
        }
        chapters.get(e.chapter)![1].push(e);
      }
      const sortedKeys = Array.from(chapters.keys()).sort();
      const conceptRows: Array<Record<string, unknown>> = [];
      for (const key of sortedKeys) {
        const [title, refs] = chapters.get(key)!;
        let done = 0;
        let best: number | null = null;
        for (const e of refs) {
          const atts = snap.attempts[e.note_id]?.attempts || [];
          if (atts.some((a: any) => attemptPassed(a))) {
            done += 1;
          }
          const scores = atts
            .filter((a: any) => a.verdict !== "ungraded")
            .map((a: any) => parseInt(String(a.score || 0), 10));
          if (scores.length > 0) {
            best = Math.max(best ?? 0, Math.max(...scores));
          }
        }
        conceptRows.push({ title, done, total: refs.length, best });
      }

      const byId = new Map(snap.exercises.map((e) => [e.note_id, e]));
      const errors: Array<Record<string, unknown>> = [];
      for (const err of snap.errors) {
        const ref = byId.get(err.note_id || err.exercise_id || "");
        let source = ref ? studyRel(app, ref.path) : "";
        if (!source && err.source_note) {
          const p = path.resolve(app.root, String(err.source_note));
          if (fs.existsSync(p)) {
            source = studyRel(app, p);
          }
        }
        errors.push({
          id: err.id,
          repeat_count: err.repeat_count,
          category: err.category,
          skill: err.discipline
            ? skillLabel(err.discipline, ref ? ref.skill : err.skill || "")
            : "",
          anchor: err.anchor || "",
          description: err.description_en || err.explanation || "",
          fix: err.fix_en || err.expected || "",
          seen: String(err.last_seen || err.occurred_at || "").slice(0, 10),
          note: ref ? ref.title : err.note_id || err.topic || "",
          source,
        });
      }
      errors.sort((a, b) => String(b.seen).localeCompare(String(a.seen)));
      errors.sort((a, b) => Number(b.repeat_count) - Number(a.repeat_count));
      srs.allItems(); // warm cache

      const result = {
        area: {
          subject: area.subject,
          title: area.title,
          subject_title: area.subject_title,
          folder: area.folder,
        },
        exercises: snap.exercises.length,
        queue: {
          items,
          gaps: snap.queue.gaps
            .map((g: any) => g.message)
            .filter(Boolean),
          counts: snap.queue.counts,
        },
        ledgers,
        concepts: conceptRows,
        errors,
      };
      _snapshotCache.set(cacheKey, { data: result, timestamp: Date.now() });
      return result;
    },

    study_card_grade(srs_id: string, quality: number) {
      clearStudySnapshotCache();
      const q =
        typeof quality === "number"
          ? Math.trunc(quality)
          : parseInt(String(quality), 10);
      if (!Number.isFinite(q) || ![1, 3, 4, 5].includes(q)) {
        throw new ApiError("Calificación inválida.");
      }
      if (new StudySRSManager(app.root).review(String(srs_id), q) === null) {
        throw new ApiError("Esa tarjeta ya no existe.");
      }
      return { ok: true };
    },

    study_error_resolve(error_id: string) {
      clearStudySnapshotCache();
      if (new StudyErrorManager(app.root).markResolved(String(error_id)) === null) {
        throw new ApiError("Ese error ya no existe.");
      }
      writeErrorDigest(app.root);
      return { ok: true };
    },

    study_error_digest() {
      const digestPath = path.join(app.root, LAYOUT.study_error_digest);
      try {
        return { text: fs.readFileSync(digestPath, "utf-8") };
      } catch {
        return {
          text: "Todavía no hay ERROR_LOG.md: se genera al corregir el primer intento.",
        };
      }
    },

    study_folders() {
      const ws = new WorkspaceManager(app.root);
      const out: Array<Record<string, unknown>> = [];
      for (const wid of STUDY_IDS) {
        const w = ws.get(wid);
        if (!w) continue;
        const folder = ws.findExistingFolder(wid);
        const indexPath = folder ? path.join(folder, "00 Índice.md") : null;
        out.push({
          id: wid,
          name: w.name,
          icon: w.icon || "📁",
          exists: folder !== null,
          index: indexPath && fs.existsSync(indexPath) ? studyRel(app, indexPath) : "",
        });
      }
      return out;
    },

    study_folder_create(ws_id: string, with_structure = true) {
      if (!STUDY_IDS.includes(ws_id as any)) {
        throw new ApiError("Espacio de estudio desconocido.");
      }
      const res = new WorkspaceManager(app.root).ensureFolder(
        ws_id,
        Boolean(with_structure),
      );
      return {
        path: app.rel(res.path),
        created: res.created,
        index: res.index ? studyRel(app, res.index) : "",
      };
    },

    /**
     * The view file of a folder: the topic's `practica` file for a topic folder,
     * the `resumen` overview otherwise. Creates it when it is missing (the
     * explorer's "open the folder's view" and "create view" action).
     */
    study_view_ensure(rel: string) {
      const abs = app.resolve(rel, { allowRoot: true });
      let stat: fs.Stats;
      try {
        stat = fs.statSync(abs);
      } catch {
        throw new ApiError("Esa carpeta no existe.");
      }
      // A file was passed: use the folder it lives in.
      const folderAbs = stat.isDirectory() ? abs : path.dirname(abs);
      // The subject root groups areas: it gets its overview and nothing else.
      const subjectRoot = isSubjectRoot(app.root, folderAbs);
      const topic = !subjectRoot && isTopicFolder(app.root, folderAbs);
      if (!topic && !subjectRoot && !folderHasTopicsBelow(app.root, folderAbs)) {
        // A plain folder has no view: the explorer falls back to expanding it.
        return { ok: false, kind: "none", path: "", created: [], errors: [] };
      }
      const result = topic
        ? ensureTopicViewFiles(app.root, folderAbs)
        : ensureOverviewFile(app.root, folderAbs);

      const created = [...result.created];
      const tagged = [...result.tagged];
      if (created.length || tagged.length) {
        clearExerciseIndexCache();
        clearStudySnapshotCache();
      }
      const kind = topic ? "practica" : "resumen";
      const fileAbs = topic
        ? path.join(folderAbs, `${path.basename(folderAbs)}.practica.md`)
        : path.join(folderAbs, `${path.basename(folderAbs)}.resumen.md`);
      return {
        ok: fs.existsSync(fileAbs),
        kind,
        path: app.rel(fileAbs),
        created: created.map((c) => app.rel(c)),
        /** theory notes marked `type: teorica` by this call */
        tagged: tagged.map((t) => app.rel(t)),
        errors: result.errors.map((e) => app.rel(e)),
      };
    },

    /** The canvas of the topic the given path belongs to, if it has one. */
    study_topic_map(rel: string) {
      const abs = app.resolve(rel, { allowRoot: true });
      let folderAbs: string;
      try {
        folderAbs = fs.statSync(abs).isDirectory() ? abs : path.dirname(abs);
      } catch {
        throw new ApiError("Esa ruta no existe.");
      }
      const found = findAncestorTopicManifest(abs, app.root);
      const topicAbs = found ? found.topicFolder : folderAbs;
      const map = mapNoteOf(topicAbs);
      return { ok: Boolean(map), path: map ? app.rel(map) : "" };
    },

    study_topic_get(rel: string) {
      const absPath = app.resolve(rel, { allowRoot: true });
      const found = findAncestorTopicManifest(absPath, app.root);

      let topicFolder: string;
      if (found) {
        topicFolder = app.rel(found.topicFolder);
      } else {
        topicFolder = resolveTopicDir(app, rel);
        if (!topicFolder) {
          return { is_topic: false, folder: "", can_convert: false };
        }
      }

      const scan = vaultScan(app);
      const normFolder = topicFolder.replace(/\\/g, "/");
      const topicExercises = scan.exercises.filter((e) => {
        const p = (e.rel || e.path).replace(/\\/g, "/");
        return p.startsWith(normFolder + "/");
      });

      // Scan theory notes in topic folder and all subfolders
      const theoryNotes: Array<{ rel: string; title: string }> = [];
      const exercisePaths = new Set(topicExercises.map((e) => (e.rel || e.path).replace(/\\/g, "/")));
      for (const np of app.vault.notePaths()) {
        const normNp = np.replace(/\\/g, "/");
        if (
          normNp.startsWith(normFolder + "/") &&
          !normNp.endsWith("/_tema.md") &&
          !normNp.endsWith("/tema.md")
        ) {
          if (!exercisePaths.has(normNp)) {
            const baseName = path.basename(normNp).replace(/\.md$/, "");
            theoryNotes.push({
              rel: normNp,
              title: baseName,
            });
          }
        }
      }

      if (!found) {
        return {
          is_topic: false,
          folder: topicFolder,
          can_convert: topicExercises.length > 0 || theoryNotes.length > 0,
        };
      }

      const attempts = loadAllAttempts(app.root);
      const manifestWithRelPaths: TopicManifest = {
        ...found.manifest,
        path: app.rel(found.manifestPath),
        folder: topicFolder,
      };

      const examRec = loadExamRecordForTopic(
        app.root,
        manifestWithRelPaths,
      );
      const progress = computeTopicProgress(
        manifestWithRelPaths,
        topicExercises,
        attempts,
        examRec,
        theoryNotes.length,
      );

      return {
        is_topic: true,
        folder: topicFolder,
        topic: manifestWithRelPaths,
        progress,
        theory_notes: theoryNotes,
        exercises: topicExercises.map((e) => exerciseDict(e, studyRel(app, e.path))),
        can_convert: false,
      };
    },

    study_topic_convert(folder: string) {
      const absDir = app.resolve(folder, { allowRoot: true });
      if (!fs.existsSync(absDir) || !fs.statSync(absDir).isDirectory()) {
        throw new ApiError("Carpeta no encontrada.");
      }
      const manifestPath = path.join(absDir, "_tema.md");
      if (fs.existsSync(manifestPath)) {
        throw new ApiError("El tema ya tiene un archivo de manifiesto (_tema.md).");
      }
      const scan = vaultScan(app);
      const folderRel = app.rel(absDir);
      const topicExercises = scan.exercises.filter((e) =>
        (e.rel || e.path).replace(/\\/g, "/").startsWith(folderRel + "/"),
      );
      const area = getStudyArea(app, folderRel);
      const subject = area ? area.subject : "mathematics";
      const manifest = createDefaultTopicManifest(
        folderRel,
        path.basename(absDir),
        subject,
        topicExercises,
      );
      const text = serializeTopicManifest(manifest);
      fs.writeFileSync(manifestPath, text, "utf-8");
      clearExerciseIndexCache();
      clearStudySnapshotCache();
      return { ok: true, path: app.rel(manifestPath), manifest };
    },

    async study_topic_session_build(
      folder: string,
      skill: string,
      difficulty: number,
      quantity = "3-5",
      assistance = "no_help",
    ) {
      const normFolder = app.rel(app.resolve(folder, { allowRoot: true }));
      const found = findTopicManifest(app, normFolder);
      if (!found) {
        throw new ApiError("Esta carpeta no tiene un manifiesto de tema.");
      }
      const scan = vaultScan(app);
      const diff = Math.min(
        3,
        Math.max(1, parseInt(String(difficulty), 10) || 2),
      ) as DifficultyLevel;
      const ast = assistance === "helper" ? "helper" : "no_help";
      const qty = (quantity || "3-5") as QuantityOption;

      // Extract theory notes
      const absDir = app.resolve(normFolder);
      const theoryNotes: TheoryNoteContext[] = [];
      try {
        const files = fs.readdirSync(absDir, { withFileTypes: true });
        for (const f of files) {
          if (f.isFile() && f.name.endsWith(".md") && !f.name.startsWith("_tema")) {
            const full = path.join(absDir, f.name);
            const content = fs.readFileSync(full, "utf-8");
            theoryNotes.push({
              rel: app.rel(full),
              title: f.name.replace(/\.md$/, ""),
              content,
            });
          }
        }
      } catch {}

      const aiClient: SessionAIClient = {
        async generateExercises(messages) {
          try {
            const cfg = AIConfig.fromDict(AppConfig.get_ai_config());
            if (cfg.is_bridge) return [];
            const reply = await sendChat(cfg, messages as any);
            let cleaned = reply.trim();
            const match = /```(?:json)?\s*([\s\S]*?)```/i.exec(cleaned);
            if (match) cleaned = match[1]!.trim();
            const start = cleaned.indexOf("[");
            const end = cleaned.lastIndexOf("]");
            if (start !== -1 && end !== -1 && end > start) {
              cleaned = cleaned.slice(start, end + 1);
            }
            return JSON.parse(cleaned);
          } catch {
            return [];
          }
        },
      };

      const plan = await buildTopicSession(
        found.manifest,
        normFolder,
        { skill, difficulty: diff, quantity: qty, assistance: ast },
        scan.exercises,
        theoryNotes,
        aiClient,
      );

      for (const ex of plan.exercises) {
        if (ex.isNew && ex.content) {
          const targetAbs = app.resolve(ex.path, { allowRoot: false, mustExist: false });
          fs.mkdirSync(path.dirname(targetAbs), { recursive: true });
          fs.writeFileSync(targetAbs, ex.content, "utf-8");
        }
      }

      if (plan.generatedCount > 0) {
        clearExerciseIndexCache();
        clearStudySnapshotCache();
      }

      return {
        ok: true,
        skill: plan.skill,
        difficulty: plan.difficulty,
        assistance: plan.assistance,
        target_count: plan.targetCount,
        existing_count: plan.existingCount,
        generated_count: plan.generatedCount,
        exercises: plan.exercises.map((e) => ({
          id: e.id,
          title: e.title,
          path: e.path,
          is_new: e.isNew,
        })),
        first_exercise: plan.exercises[0]?.path ?? "",
      };
    },

    /**
     * A session that draws from every topic of an area (or the whole subject),
     * instead of one topic: the exercises that already exist in the area's
     * topics are filtered by skill and difficulty. Nothing is generated here —
     * the per-topic builder keeps owning generation.
     */
    study_area_session_build(
      folder: string,
      skill: string,
      difficulty: number,
      quantity = "6-10",
      assistance = "no_help",
    ) {
      const normFolder = app.rel(app.resolve(folder, { allowRoot: true })).split(path.sep).join("/").replace(/^\/+|\/+$/g, "");
      const scan = vaultScan(app);
      const prefix = normFolder ? `${normFolder}/` : "";
      const inArea = scan.exercises.filter((e) => String(e.rel || e.path || "").split(path.sep).join("/").startsWith(prefix));

      const diff = Math.min(3, Math.max(1, parseInt(String(difficulty), 10) || 2));
      const wantSkill = String(skill || "").trim().toLowerCase();
      const hasSkill = (e: (typeof inArea)[number]) =>
        (e.mode || "").toLowerCase() === wantSkill || (e.skill || "").toLowerCase() === wantSkill;

      // Skill + difficulty first, then skill, then difficulty, then anything.
      const tiers = [
        inArea.filter((e) => hasSkill(e) && e.difficulty === diff),
        inArea.filter((e) => hasSkill(e)),
        inArea.filter((e) => e.difficulty === diff),
        inArea,
      ];
      const picked = tiers.find((t) => t.length) ?? [];
      const wanted = quantity === "3-5" ? 5 : quantity === "11+" ? 12 : quantity === "all" ? picked.length : 10;
      const chosen = picked.slice(0, Math.max(1, wanted));

      return {
        ok: chosen.length > 0,
        skill: wantSkill || "solve",
        difficulty: diff,
        assistance: assistance === "helper" ? "helper" : "no_help",
        target_count: wanted,
        existing_count: inArea.length,
        generated_count: 0,
        exercises: chosen.map((e) => ({
          id: e.note_id,
          title: e.title,
          path: e.rel || e.path,
          is_new: false,
        })),
        first_exercise: chosen[0]?.rel ?? "",
      };
    },

    study_exam_assemble: async (
      topicFolder?: string,
      examGroup?: string,
      targetDifficulty?: number,
    ) => {
      const scan = vaultScan(app);
      const allExercises = scan.exercises;
      const targetDiff = (targetDifficulty && targetDifficulty >= 1 && targetDifficulty <= 3
        ? targetDifficulty
        : 3) as DifficultyLevel;

      if (topicFolder) {
        const found = findTopicManifest(app, topicFolder);
        if (!found) {
          throw new ApiError(`No se encontró manifest de tema en "${topicFolder}"`);
        }
        const normFolder = topicFolder.replace(/\\/g, "/");
        const topicExercises = allExercises.filter((ex) => {
          const p = (ex.rel || ex.path).replace(/\\/g, "/");
          return p.startsWith(normFolder + "/");
        });

        const session = await assembleTopicExam(found.manifest, topicExercises, {
          targetDifficulty: targetDiff,
        });
        return { ok: true, session };
      }

      if (examGroup) {
        const matchedTopics: TopicManifest[] = [];
        const topicMap = new Map<string, ExerciseRef[]>();

        const folderSet = new Set<string>();
        for (const np of app.vault.notePaths()) {
          const dir = path.dirname(np).replace(/\\/g, "/");
          if (dir && dir !== ".") {
            folderSet.add(dir);
            const parent = path.dirname(dir).replace(/\\/g, "/");
            if (parent && parent !== ".") folderSet.add(parent);
          }
        }

        for (const f of folderSet) {
          const found = findTopicManifest(app, f);
          if (found && found.manifest.exam_group?.toLowerCase() === examGroup.toLowerCase()) {
            if (!matchedTopics.some((t) => t.title === found.manifest.title)) {
              matchedTopics.push(found.manifest);
              const normF = f.replace(/\\/g, "/");
              const exs = allExercises.filter((ex) => {
                const p = (ex.rel || ex.path).replace(/\\/g, "/");
                return p.startsWith(normF + "/");
              });
              topicMap.set(found.manifest.title, exs);
            }
          }
        }

        if (matchedTopics.length === 0) {
          throw new ApiError(`No se encontraron temas para el grupo de examen "${examGroup}"`);
        }

        const session = await assembleGroupedExam(examGroup, matchedTopics, topicMap, {
          targetDifficulty: targetDiff,
        });
        return { ok: true, session };
      }

      throw new ApiError("Debe especificar topicFolder o examGroup");
    },

    study_exam_submit: async (
      session: ExamSession,
      submissions: ExamItemSubmission[],
    ) => {
      const grader: ExamGrader = async (item, answerText) => {
        if (!answerText.trim()) {
          return { score: 0, passed: false, feedback: "Sin respuesta." };
        }
        const aiCfg = AIConfig.fromDict(AppConfig.get_ai_config());
        if (aiCfg.base_url || aiCfg.api_key) {
          const messages = [
            {
              role: "system" as const,
              content: `Eres un evaluador riguroso de exámenes de matemáticas y programación. Evalúa la respuesta del alumno sin indulgencia. Devuelve ÚNICAMENTE un objeto JSON: {"score": <número 0..100>, "passed": <true si score >= 70, false si no>, "feedback": "<retroalimentación en español, concisa>"}.`,
            },
            {
              role: "user" as const,
              content: `Ejercicio: ${item.title}\nHabilidad: ${item.skill} (Dificultad: ${item.difficulty}/3)\nTema: ${item.topicTitle}\n\nEnunciado:\n${item.statement}\n\nRespuesta del alumno:\n${answerText}`,
            },
          ];
          try {
            const reply = await sendChat(aiCfg, messages);
            const match = reply.match(/\{[\s\S]*\}/);
            if (match) {
              const parsed = JSON.parse(match[0]);
              const score = typeof parsed.score === "number" ? parsed.score : 70;
              return {
                score,
                passed: Boolean(parsed.passed ?? score >= 70),
                feedback: String(parsed.feedback || "Evaluado por IA."),
              };
            }
          } catch {
            // fallback
          }
        }

        const hasSubstance = answerText.trim().length > 30;
        return {
          score: hasSubstance ? 75 : 40,
          passed: hasSubstance,
          feedback: hasSubstance
            ? "Respuesta registrada y calificada."
            : "Respuesta incompleta o insuficiente.",
        };
      };

      const { record, itemResults } = await gradeAndAggregateExam(
        session,
        submissions,
        grader,
        app.root,
      );

      clearStudySnapshotCache();

      return {
        ok: true,
        record,
        item_results: itemResults,
      };
    },

    study_topic_dashboard: async (subjectFilter?: string) => {
      const cacheKey = `${app.root}::${subjectFilter ?? ""}`;
      const cachedDashboard = _dashboardCache.get(cacheKey) as
        | { data: { subjects: string[]; areas: string[]; topics: unknown[] }; timestamp: number }
        | undefined;
      if (cachedDashboard && Date.now() - cachedDashboard.timestamp < SNAPSHOT_CACHE_TTL_MS) {
        return cachedDashboard.data;
      }
      const scan = vaultScan(app);
      const allExercises = scan.exercises;
      const attempts = loadAllAttempts(app.root);

      // The manifests come from the notes the scan already read: enumerating them by
      // name and type costs nothing, while the per-folder climb re-read every note of
      // the vault (measured on the real vault: 593 folders → 2 680 ms, for 42 topics).
      const foundMap = new Map<string, { folder: string; manifest: TopicManifest }>();
      for (const found of manifestsFromNotes(scan.notes)) {
        const title = found.manifest.title;
        if (foundMap.has(title)) continue;
        const folder = app.rel(found.topicFolder).replace(/\\/g, "/");
        foundMap.set(title, {
          folder,
          manifest: { ...found.manifest, path: app.rel(found.manifestPath), folder },
        });
      }

      const items: Array<{
        folder: string;
        area: string;
        subject: string;
        manifest: TopicManifest;
        progress: ReturnType<typeof computeTopicProgress>;
      }> = [];
      const subjectsSet = new Set<string>();
      const areasSet = new Set<string>();

      for (const { folder, manifest } of foundMap.values()) {
        if (subjectFilter && manifest.subject.toLowerCase() !== subjectFilter.toLowerCase()) {
          continue;
        }

        const normFolder = folder.replace(/\\/g, "/");
        const topicExercises = allExercises.filter((ex) => {
          const p = (ex.rel || ex.path).replace(/\\/g, "/");
          return p.startsWith(normFolder + "/");
        });

        const parentDir = path.dirname(normFolder);
        const areaName = parentDir && parentDir !== "." ? path.basename(parentDir) : manifest.exam_group || "General";

        const examRec = loadExamRecordForTopic(app.root, manifest);
        const progress = computeTopicProgress(
          manifest,
          topicExercises,
          attempts,
          examRec,
          0,
        );

        subjectsSet.add(manifest.subject);
        areasSet.add(areaName);

        items.push({
          folder,
          area: areaName,
          subject: manifest.subject,
          manifest,
          progress,
        });
      }

      items.sort((a, b) => a.area.localeCompare(b.area) || a.manifest.title.localeCompare(b.manifest.title));

      const payload = {
        subjects: Array.from(subjectsSet),
        areas: Array.from(areasSet),
        topics: items,
      };
      _dashboardCache.set(cacheKey, { data: payload, timestamp: Date.now() });
      return payload;
    },
  };
}
