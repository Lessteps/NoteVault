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
import type { ExerciseRef } from "../../core/practice/exerciseIndex.js";
import { BANDS, attemptPassed } from "../../core/practice/ledger.js";
import { MODES } from "../../core/practice/modes.js";
import {
  hubSnapshot,
  pickExercise,
  skillLabel,
} from "../../core/practice/recommender.js";
import { StudyArea, detectStudyArea } from "../../core/practice/studyArea.js";
import { StudyErrorManager } from "../../core/studyErrorManager.js";
import { StudySRSManager } from "../../core/studySrsManager.js";
import { LAYOUT } from "../../core/vaultFormat.js";
import { WorkspaceManager } from "../../core/workspaceManager.js";
import {
  type TopicManifest,
  computeTopicProgress,
  createDefaultTopicManifest,
  parseTopicManifest,
  serializeTopicManifest,
} from "../../core/practice/topic.js";
import {
  type QuantityOption,
  type TheoryNoteContext,
  buildTopicSession,
  type SessionAIClient,
} from "../../core/practice/sessionBuilder.js";
import { loadExamRecord } from "../../core/practice/exams.js";
import { loadAllAttempts } from "../../core/practice/ledger.js";
import { clearExerciseIndexCache, scanVault } from "../../core/practice/exerciseIndex.js";
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

export function clearStudySnapshotCache(): void {
  _snapshotCache.clear();
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
    if (!fs.existsSync(absDir) || !fs.statSync(absDir).isDirectory()) return null;

    const preferred = path.join(absDir, "_tema.md");
    if (fs.existsSync(preferred)) {
      const raw = fs.readFileSync(preferred, "utf-8");
      const m = parseTopicManifest(raw, path.basename(absDir));
      if (m) {
        m.path = app.rel(preferred);
        m.folder = topicFolder;
        return { path: m.path, manifest: m };
      }
    }

    const alt = path.join(absDir, "tema.md");
    if (fs.existsSync(alt)) {
      const raw = fs.readFileSync(alt, "utf-8");
      const m = parseTopicManifest(raw, path.basename(absDir));
      if (m) {
        m.path = app.rel(alt);
        m.folder = topicFolder;
        return { path: m.path, manifest: m };
      }
    }

    const entries = fs.readdirSync(absDir, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.isFile() && ent.name.toLowerCase().endsWith(".md")) {
        const p = path.join(absDir, ent.name);
        const raw = fs.readFileSync(p, "utf-8");
        const m = parseTopicManifest(raw, path.basename(absDir));
        if (m) {
          m.path = app.rel(p);
          m.folder = topicFolder;
          return { path: m.path, manifest: m };
        }
      }
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

    study_topic_get(rel: string) {
      const topicFolder = resolveTopicDir(app, rel);
      if (!topicFolder) {
        return { is_topic: false, folder: "", can_convert: false };
      }
      const found = findTopicManifest(app, topicFolder);
      const scan = scanVault(app.root, app.vault.notePaths());
      const normFolder = topicFolder.replace(/\\/g, "/");
      const topicExercises = scan.exercises.filter((e) => {
        const p = (e.rel || e.path).replace(/\\/g, "/");
        return p.startsWith(normFolder + "/");
      });

      // Scan theory notes in folder
      const absDir = app.resolve(topicFolder, { allowRoot: true });
      const theoryNotes: Array<{ rel: string; title: string }> = [];
      try {
        const files = fs.readdirSync(absDir, { withFileTypes: true });
        for (const f of files) {
          if (f.isFile() && f.name.endsWith(".md") && !f.name.startsWith("_tema")) {
            theoryNotes.push({
              rel: `${normFolder}/${f.name}`,
              title: f.name.replace(/\.md$/, ""),
            });
          }
        }
      } catch {}

      if (!found) {
        return {
          is_topic: false,
          folder: topicFolder,
          can_convert: topicExercises.length > 0 || theoryNotes.length > 0,
        };
      }

      const attempts = loadAllAttempts(app.root);
      const examRec = loadExamRecord(
        app.root,
        found.manifest.exam_group || found.manifest.title,
      );
      const progress = computeTopicProgress(
        found.manifest,
        topicExercises,
        attempts,
        examRec,
        theoryNotes.length,
      );

      return {
        is_topic: true,
        folder: topicFolder,
        topic: found.manifest,
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
      const scan = scanVault(app.root, app.vault.notePaths());
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
      const scan = scanVault(app.root, app.vault.notePaths());
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
  };
}
