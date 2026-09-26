/**
 * What to practise next, and the interleaved daily queue of the Estudio hub.
 *
 * Adapted from the coach recommender of the user's training systems:
 * 1. a weakness repeated >= 2 times -> a debug / find_error exercise of that skill;
 * 2. every skill of a chapter at least Practicing -> an integration exercise;
 * 3. a consolidated skill whose interval has elapsed -> spaced review with a fresh exercise;
 * 4. otherwise the next skill of the ledger.
 *
 * Exercise generation is on hold, so every recommendation points to an existing exercise
 * note (never attempted first, then due in SRS). When there is none, the recommendation
 * carries a message saying so instead of an exercise.
 */

import * as path from "node:path";
import { formatIsoDate, parseIsoDate } from "../dates.js";
import { StudyError, StudyErrorManager } from "../studyErrorManager.js";
import { StudySRSManager } from "../studySrsManager.js";
import { ENTITY_TYPE as CARD_TYPE, NEW_CARDS_PER_DAY, indexCards } from "./cards.js";
import { DISCIPLINES, skillOf } from "./disciplineCatalog.js";
import { ExerciseRef, scanVault, skillKey } from "./exerciseIndex.js";
import {
  CONSOLIDATED,
  NOT_STARTED,
  PRACTICING,
  attemptPassed,
  loadAllAttempts,
  refreshLedgers,
  skillStatus,
} from "./ledger.js";
import { MODES } from "./modes.js";
import { StudyArea } from "./studyArea.js";

export const REMEDIATION_MODES = ["debug", "find_error"] as const;
export const REPEAT_THRESHOLD = 2;

export const REMEDIATION = "remediation";
export const INTEGRATION = "integration";
export const REVIEW = "review";
export const NEXT_SKILL = "next_skill";
export const CONTINUE = "continue";
export const SRS_EXERCISE = "srs_exercise";
export const SRS_PROOF = "srs_proof";
export const SRS_CARD = "srs_card";

export const PRIORITY: Record<string, number> = {
  [REMEDIATION]: 0,
  [INTEGRATION]: 1,
  [REVIEW]: 2,
  [SRS_EXERCISE]: 3,
  [SRS_PROOF]: 3,
  [SRS_CARD]: 4,
  [NEXT_SKILL]: 5,
  [CONTINUE]: 6,
};

function _isProof(item: Record<string, any>): boolean {
  return String(item.entity_type || "").toLowerCase().startsWith("proof_l");
}

function _vaultRel(vaultRoot: string, source: string): string {
  if (!source) return "";
  const p = path.resolve(source);
  const root = path.resolve(vaultRoot);
  try {
    return path.relative(root, p).replace(/\\/g, "/");
  } catch {
    return source.replace(/\\/g, "/");
  }
}

function _proofRef(vaultRoot: string, item: Record<string, any>): ExerciseRef {
  const rel = _vaultRel(vaultRoot, String(item.source_note || ""));
  const absPath = path.join(path.resolve(vaultRoot), rel);
  const stem = path.basename(rel, path.extname(rel));
  return {
    path: absPath,
    rel,
    note_id: item.entity_id,
    title: stem,
    subject: item.subject || "",
    discipline: "math_general",
    skill: "",
    mode: "prove",
    difficulty: parseInt(item.difficulty, 10) || 3,
    concept: "",
    chapter: "",
    chapter_title: "",
    integration: false,
  };
}

export class Recommendation {
  kind: string;
  discipline: string;
  skill: string;
  subject: string;
  title: string;
  reason: string;
  exercise: ExerciseRef | null;
  message: string;

  constructor(
    kind: string,
    discipline: string,
    skill: string,
    subject: string,
    title: string,
    reason: string,
    exercise: ExerciseRef | null = null,
    message: string = ""
  ) {
    this.kind = kind;
    this.discipline = discipline;
    this.skill = skill;
    this.subject = subject;
    this.title = title;
    this.reason = reason;
    this.exercise = exercise;
    this.message = message;
  }

  get priority(): number {
    return PRIORITY[this.kind] ?? 9;
  }
}

export class QueueItem {
  kind: string;
  group: [string, string];
  subject: string;
  title: string;
  reason: string;
  exercise: ExerciseRef | null;
  srs_item: Record<string, any> | null;
  message: string;
  extra: Record<string, any>;

  constructor(
    kind: string,
    group: [string, string],
    subject: string,
    title: string,
    reason: string,
    exercise: ExerciseRef | null = null,
    srsItem: Record<string, any> | null = null,
    message: string = "",
    extra: Record<string, any> = {}
  ) {
    this.kind = kind;
    this.group = group;
    this.subject = subject;
    this.title = title;
    this.reason = reason;
    this.exercise = exercise;
    this.srs_item = srsItem;
    this.message = message;
    this.extra = extra;
  }

  get priority(): number {
    return PRIORITY[this.kind] ?? 9;
  }
}

export function skillLabel(discipline: string, code: string): string {
  const disc = DISCIPLINES[discipline];
  if (!disc) {
    return code ? `${discipline} \u00b7 ${code}` : discipline;
  }
  const skill = skillOf(disc, code);
  if (!skill) {
    return code ? `${disc.title} \u00b7 ${code}` : disc.title;
  }
  return `${disc.title} \u00b7 ${skill.code} ${skill.title}`;
}

export const skill_label = skillLabel;

function _compareNatural(a: ExerciseRef, b: ExerciseRef): number {
  if (a.difficulty !== b.difficulty) {
    return a.difficulty - b.difficulty;
  }
  return a.rel.toLowerCase().localeCompare(b.rel.toLowerCase());
}

export function pickExercise(
  candidates: Iterable<ExerciseRef>,
  attempted: Set<string>,
  due: Record<string, string>
): ExerciseRef | null {
  const list = Array.from(candidates);
  const fresh = list.filter((e) => !attempted.has(e.note_id)).sort(_compareNatural);
  if (fresh.length > 0) {
    return fresh[0]!;
  }
  const overdue = list
    .filter((e) => e.note_id in due)
    .sort((a, b) => {
      const dueA = due[a.note_id] || "";
      const dueB = due[b.note_id] || "";
      if (dueA !== dueB) {
        return dueA.localeCompare(dueB);
      }
      return _compareNatural(a, b);
    });
  return overdue.length > 0 ? overdue[0]! : null;
}

export const pick_exercise = pickExercise;

function _dueExercises(srsItems: Record<string, any>[], todayStr: string): Record<string, string> {
  const res: Record<string, string> = {};
  for (const i of srsItems) {
    if (i.entity_type === "exercise" && i.next_review <= todayStr) {
      res[i.entity_id] = i.next_review;
    }
  }
  return res;
}

function _errorSkill(
  err: Record<string, any>,
  byId: Record<string, ExerciseRef>
): [string, string, string] {
  const ref = byId[err.note_id || err.exercise_id || ""];
  if (ref) {
    return [ref.discipline, ref.skill, ref.concept];
  }
  const disc = err.discipline || "";
  return [disc, skillKey(disc, err.mode || "", err.skill), ""];
}

function _remediations(
  errors: Record<string, any>[],
  exercises: ExerciseRef[],
  byId: Record<string, ExerciseRef>,
  attempted: Set<string>,
  due: Record<string, string>
): Recommendation[] {
  const groups = new Map<
    string,
    {
      discipline: string;
      skill: string;
      weakness: string;
      count: number;
      subject: string;
      concepts: Set<string>;
    }
  >();

  for (const err of errors) {
    const [disc, skill, concept] = _errorSkill(err, byId);
    if (!disc) continue;
    const weakness = err.anchor || err.category || "";
    const key = `${disc}:::${skill}:::${weakness.toLowerCase()}`;
    if (!groups.has(key)) {
      groups.set(key, {
        discipline: disc,
        skill,
        weakness,
        count: 0,
        subject: err.subject || "",
        concepts: new Set(),
      });
    }
    const g = groups.get(key)!;
    g.count += parseInt(String(err.repeat_count), 10) || 1;
    if (concept) {
      g.concepts.add(concept);
    }
  }

  const recs: Recommendation[] = [];
  const sortedGroups = Array.from(groups.values()).sort((a, b) => b.count - a.count);

  for (const g of sortedGroups) {
    if (g.count < REPEAT_THRESHOLD) continue;
    const pool = exercises.filter(
      (e) =>
        (REMEDIATION_MODES as readonly string[]).includes(e.mode) &&
        e.discipline === g.discipline &&
        (e.skill === g.skill || (e.concept && g.concepts.has(e.concept)))
    );
    const label = skillLabel(g.discipline, g.skill);
    const ex = pickExercise(pool, attempted, due);
    const subject =
      g.subject || (DISCIPLINES[g.discipline]?.subject || "");
    recs.push(
      new Recommendation(
        REMEDIATION,
        g.discipline,
        g.skill,
        subject,
        "Corregir un error repetido",
        `\u00ab${g.weakness}\u00bb se ha repetido ${g.count} veces en ${label}.`,
        ex,
        ex
          ? ""
          : `No hay ejercicios de depuraci\u00f3n o de encontrar el error de ${label} todav\u00eda.`
      )
    );
  }
  return recs;
}

function _integrations(
  exercises: ExerciseRef[],
  ledgers: Record<string, any>,
  attempts: Record<string, any>,
  attempted: Set<string>,
  due: Record<string, string>
): Recommendation[] {
  const chapters = new Map<string, ExerciseRef[]>();
  for (const e of exercises) {
    const key = `${e.chapter}:::${e.discipline}`;
    if (!chapters.has(key)) chapters.set(key, []);
    chapters.get(key)!.push(e);
  }

  const recs: Recommendation[] = [];
  const sortedKeys = Array.from(chapters.keys()).sort();

  for (const key of sortedKeys) {
    const refs = chapters.get(key)!;
    const skills = new Set<string>();
    for (const e of refs) {
      if (!e.integration) {
        skills.add(`${e.discipline}:::${e.skill}`);
      }
    }
    if (skills.size < 2) continue;

    let hasUnstarted = false;
    for (const s of skills) {
      const parts = s.split(":::");
      const d = parts[0] || "";
      const code = parts[1] || "";
      const r = skillStatus(ledgers, d, code);
      if (!r || r.status === NOT_STARTED) {
        hasUnstarted = true;
        break;
      }
    }
    if (hasUnstarted) continue;

    const pool = refs.filter((e) => e.integration);
    const anyPassed = pool.some((e) => {
      const atts = attempts[e.note_id]?.attempts;
      return Array.isArray(atts) && atts.some(attemptPassed);
    });
    if (anyPassed) continue;

    const first = refs[0];
    if (!first) continue;
    const title = first.chapter_title;
    const ex = pickExercise(pool, attempted, due);
    recs.push(
      new Recommendation(
        INTEGRATION,
        first.discipline,
        "",
        first.subject,
        "Ejercicio de integraci\u00f3n",
        `Todas las skills de \u00ab${title}\u00bb ya est\u00e1n en pr\u00e1ctica: toca integrarlas.`,
        ex,
        ex ? "" : `No hay ejercicios de integraci\u00f3n de \u00ab${title}\u00bb todav\u00eda.`
      )
    );
  }
  return recs;
}

function _skillRecs(
  exercises: ExerciseRef[],
  ledgers: Record<string, any>,
  attempted: Set<string>,
  due: Record<string, string>
): Recommendation[] {
  const recs: Recommendation[] = [];
  for (const discId of Object.keys(ledgers).sort()) {
    const ledger = ledgers[discId];
    const refs = exercises.filter((e) => e.discipline === discId && !e.integration);
    const subject = ledger.subject || "";

    for (const row of ledger.skills || []) {
      if (row.status === CONSOLIDATED && row.is_due) {
        const pool = refs.filter((e) => e.skill === row.code);
        const fresh = pickExercise(pool, attempted, due);
        const label = skillLabel(discId, row.code);
        recs.push(
          new Recommendation(
            REVIEW,
            discId,
            row.code,
            subject,
            "Repaso espaciado de una skill",
            `${label} est\u00e1 consolidada y tocaba repasarla (cada ${row.interval_days} d\u00edas).`,
            fresh,
            fresh ? "" : `No hay ejercicios nuevos de ${label} todav\u00eda.`
          )
        );
      }
    }

    const rows: Array<Record<string, any>> = ledger.skills || [];
    const pending = rows.filter((r) => r.status === NOT_STARTED);
    if (pending.length > 0) {
      const first = pending[0]!;
      const pool = refs.filter((e) => e.skill === first.code);
      const ex = pickExercise(pool, attempted, due);
      const label = skillLabel(discId, first.code);
      recs.push(
        new Recommendation(
          NEXT_SKILL,
          discId,
          first.code,
          subject,
          "Siguiente skill",
          `Siguiente skill sin empezar del ledger: ${label}.`,
          ex,
          ex ? "" : `No hay ejercicios de ${label} todav\u00eda.`
        )
      );
      if (ex === null) {
        for (const row of pending.slice(1)) {
          const p = refs.filter((e) => e.skill === row.code);
          const candidate = pickExercise(p, attempted, due);
          if (candidate) {
            recs.push(
              new Recommendation(
                NEXT_SKILL,
                discId,
                row.code,
                subject,
                "Siguiente skill",
                `Primera skill sin empezar que ya tiene ejercicios: ${skillLabel(discId, row.code)}.`,
                candidate
              )
            );
            break;
          }
        }
      }
    }

    for (const row of rows) {
      if (row.status !== PRACTICING) continue;
      const pool = refs.filter((e) => e.skill === row.code);
      const ex = pickExercise(pool, attempted, due);
      if (ex) {
        recs.push(
          new Recommendation(
            CONTINUE,
            discId,
            row.code,
            subject,
            "Seguir practicando",
            `${skillLabel(discId, row.code)} est\u00e1 en pr\u00e1ctica: sigue hasta consolidarla.`,
            ex
          )
        );
        break;
      }
    }
  }
  return recs;
}

export function recommend(
  vaultRoot: string,
  exercises: ExerciseRef[],
  ledgers: Record<string, any>,
  attempts: Record<string, any>,
  errors?: Record<string, any>[] | null,
  srsItems?: Record<string, any>[] | null,
  today?: Date | string | null
): Recommendation[] {
  const todayStr = formatIsoDate(
    typeof today === "string" ? parseIsoDate(today) || new Date() : today || new Date()
  );
  const errList =
    errors === undefined || errors === null
      ? new StudyErrorManager(vaultRoot).errors(null, null, true)
      : errors;
  const srsList =
    srsItems === undefined || srsItems === null
      ? new StudySRSManager(vaultRoot).allItems()
      : srsItems;

  const attempted = new Set<string>();
  for (const [nid, data] of Object.entries(attempts)) {
    if (Array.isArray(data.attempts) && data.attempts.length > 0) {
      attempted.add(nid);
    }
  }

  const due = _dueExercises(srsList, todayStr);
  const byId: Record<string, ExerciseRef> = {};
  for (const e of exercises) {
    byId[e.note_id] = e;
  }

  const recs: Recommendation[] = [];
  recs.push(..._remediations(errList, exercises, byId, attempted, due));
  recs.push(..._integrations(exercises, ledgers, attempts, attempted, due));
  recs.push(..._skillRecs(exercises, ledgers, attempted, due));
  return recs;
}

function _interleave(items: QueueItem[]): QueueItem[] {
  const buckets = new Map<string, QueueItem[]>();
  const sortedItems = [...items].sort((a, b) => a.priority - b.priority);

  for (const item of sortedItems) {
    const key = `${item.group[0]}:::${item.group[1]}`;
    if (!buckets.has(key)) {
      buckets.set(key, []);
    }
    buckets.get(key)!.push(item);
  }

  const order = Array.from(buckets.values()).sort(
    (a, b) => (a[0]?.priority ?? 9) - (b[0]?.priority ?? 9)
  );
  const out: QueueItem[] = [];

  while (order.length > 0) {
    for (const bucket of [...order]) {
      const item = bucket.shift();
      if (item) {
        out.push(item);
      }
      if (bucket.length === 0) {
        const idx = order.indexOf(bucket);
        if (idx !== -1) order.splice(idx, 1);
      }
    }
  }
  return out;
}

export interface DailyQueue {
  items: QueueItem[];
  gaps: Recommendation[];
  counts: {
    recommendations: number;
    srs_exercises: number;
    cards: number;
    total: number;
  };
}

export function buildDailyQueue(
  vaultRoot: string,
  exercises: ExerciseRef[],
  _ledgers: Record<string, any>,
  _attempts: Record<string, any>,
  recommendations: Recommendation[],
  srsItems?: Record<string, any>[] | null,
  today?: Date | string | null
): DailyQueue {
  const todayStr = formatIsoDate(
    typeof today === "string" ? parseIsoDate(today) || new Date() : today || new Date()
  );
  const srsList =
    srsItems === undefined || srsItems === null
      ? new StudySRSManager(vaultRoot).allItems()
      : srsItems;

  const byId: Record<string, ExerciseRef> = {};
  for (const e of exercises) {
    byId[e.note_id] = e;
  }

  const items: QueueItem[] = [];
  const seen = new Set<string>();
  const gaps: Recommendation[] = [];

  for (const rec of recommendations) {
    if (rec.exercise === null) {
      gaps.push(rec);
      continue;
    }
    if (seen.has(rec.exercise.note_id)) {
      continue;
    }
    seen.add(rec.exercise.note_id);
    items.push(
      new QueueItem(
        rec.kind,
        [rec.exercise.discipline, rec.exercise.skill],
        rec.subject || rec.exercise.subject,
        rec.title,
        rec.reason,
        rec.exercise
      )
    );
  }

  const due = srsList.filter((i) => i.next_review <= todayStr);
  due.sort((a, b) => {
    if (a.next_review !== b.next_review) {
      return a.next_review.localeCompare(b.next_review);
    }
    if (a.lapses !== b.lapses) {
      return b.lapses - a.lapses;
    }
    return a.mastery - b.mastery;
  });

  let newCards = 0;
  let nExercises = 0;
  let nCards = 0;

  for (const item of due) {
    if (item.entity_type === "exercise") {
      const ref = byId[item.entity_id];
      if (!ref || seen.has(ref.note_id)) {
        continue;
      }
      seen.add(ref.note_id);
      nExercises += 1;
      items.push(
        new QueueItem(
          SRS_EXERCISE,
          [ref.discipline, ref.skill],
          ref.subject,
          "Repaso programado",
          `Tocaba repasarlo hoy (intervalo ${item.interval_days} d).`,
          ref,
          item
        )
      );
    } else if (_isProof(item)) {
      if (seen.has(item.entity_id)) {
        continue;
      }
      seen.add(item.entity_id);
      const ref = _proofRef(vaultRoot, item);
      const level = String(item.entity_type).slice("proof_l".length);
      nExercises += 1;
      items.push(
        new QueueItem(
          SRS_PROOF,
          ["proof", ref.note_id],
          ref.subject,
          "Repaso de demostraci\u00f3n",
          `Toca repasar el nivel ${level} de la escalera.`,
          ref,
          item
        )
      );
    } else if (item.entity_type === CARD_TYPE) {
      const history = Array.isArray(item.history) ? item.history : [];
      if (history.length === 0) {
        if (newCards >= NEW_CARDS_PER_DAY) {
          continue;
        }
        newCards += 1;
      }
      nCards += 1;
      items.push(
        new QueueItem(
          SRS_CARD,
          ["card", item.topic || ""],
          item.subject || "",
          "Tarjeta",
          item.topic || "",
          null,
          item
        )
      );
    }
  }

  const ordered = _interleave(items);
  return {
    items: ordered,
    gaps,
    counts: {
      recommendations: ordered.filter((i) => i.srs_item === null).length,
      srs_exercises: nExercises,
      cards: nCards,
      total: ordered.length,
    },
  };
}

export const build_daily_queue = buildDailyQueue;

export function modeLabel(mode: string): string {
  const m = MODES[mode];
  return m ? m.label : mode;
}

export const mode_label = modeLabel;

export class HubSnapshot {
  exercises: ExerciseRef[];
  attempts: Record<string, any>;
  ledgers: Record<string, any>;
  errors: StudyError[];
  recommendations: Recommendation[];
  queue: DailyQueue;
  srs_items: Record<string, any>[];
  area: StudyArea | null;

  constructor(
    exercises: ExerciseRef[],
    attempts: Record<string, any>,
    ledgers: Record<string, any>,
    errors: StudyError[],
    recommendations: Recommendation[],
    queue: DailyQueue,
    srsItems: Record<string, any>[] = [],
    area: StudyArea | null = null
  ) {
    this.exercises = exercises;
    this.attempts = attempts;
    this.ledgers = ledgers;
    this.errors = errors;
    this.recommendations = recommendations;
    this.queue = queue;
    this.srs_items = srsItems;
    this.area = area;
  }
}

export function hubSnapshot(
  vaultRoot: string,
  notePaths: Iterable<string>,
  today?: Date | string | null,
  area?: StudyArea | null
): HubSnapshot {
  const scan = scanVault(vaultRoot, notePaths);
  const attempts = loadAllAttempts(vaultRoot);
  const ledgers = refreshLedgers(vaultRoot, scan.exercises, today, attempts);
  const attempted = new Set<string>();
  for (const [nid, data] of Object.entries(attempts)) {
    if (Array.isArray(data.attempts) && data.attempts.length > 0) {
      attempted.add(nid);
    }
  }
  const srs = new StudySRSManager(vaultRoot);
  indexCards(vaultRoot, scan.card_notes, scan.exercises, attempted, srs);
  let srsItems = srs.allItems();
  let errors = new StudyErrorManager(vaultRoot).errors(null, null, true);

  let exercises = scan.exercises;
  let weaknesses = errors;

  if (area) {
    exercises = scan.exercises.filter((e) => area.contains(e.rel, e.subject));
    const scoped = new Set(exercises.map((e) => e.discipline));
    const filteredLedgers: Record<string, any> = {};
    for (const [k, v] of Object.entries(ledgers)) {
      if (scoped.has(k)) filteredLedgers[k] = v;
    }
    errors = errors.filter((e) => e.subject === area.subject);
    const known = new Set(scan.exercises.map((e) => e.note_id));
    const ids = new Set(exercises.map((e) => e.note_id));
    weaknesses = errors.filter(
      (e) => ids.has(e.note_id || e.exercise_id) || !known.has(e.note_id || e.exercise_id)
    );
    srsItems = srsItems.filter((i) => {
      if (i.entity_type === "exercise") {
        return ids.has(i.entity_id);
      }
      return area.contains(_vaultRel(vaultRoot, i.source_note || ""), i.subject || "");
    });
  }

  const recs = recommend(vaultRoot, exercises, ledgers, attempts, weaknesses, srsItems, today);
  const queue = buildDailyQueue(
    vaultRoot,
    exercises,
    ledgers,
    attempts,
    recs,
    srsItems,
    today
  );
  return new HubSnapshot(
    exercises,
    attempts,
    ledgers,
    errors,
    recs,
    queue,
    srsItems,
    area || null
  );
}

export const hub_snapshot = hubSnapshot;
