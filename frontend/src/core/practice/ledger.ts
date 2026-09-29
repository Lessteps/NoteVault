/**
 * Skill Ledger: Not started -> Practicing -> Consolidated, computed from the attempts.
 *
 * Rules taken from the user's training systems (0.*_TRAINING_SYSTEM.md):
 * - the first attempt on any exercise of a skill moves it to Practicing;
 * - a skill is Consolidated after passing a judgment mode (debug, refactor, find_error, ...)
 *   at Advanced difficulty with no help, or after passing Beginner, Intermediate and
 *   Advanced exercises of it;
 * - a consolidated skill is due again after its interval (7 days, doubled by every passed
 *   review); failing an exercise of a consolidated skill sends it back to Practicing.
 *
 * The ledger is derived data: it is rebuilt from .notevault/estudio/intentos and written
 * to .notevault/estudio/ledger/<discipline>.json for other tools (and AIs) to read.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { formatIsoDate, formatIsoDatetime, parseIsoDate } from "../dates.js";
import * as store from "../store.js";
import { formatLayout, isSyncConflict, LAYOUT } from "../vaultFormat.js";
import { DISCIPLINES, skillOf } from "./disciplineCatalog.js";
import { ExerciseRef, skillKey } from "./exerciseIndex.js";

export const NOT_STARTED = "not_started";
export const PRACTICING = "practicing";
export const CONSOLIDATED = "consolidated";

export const STATUS_LABELS: Record<string, string> = {
  [NOT_STARTED]: "Sin empezar",
  [PRACTICING]: "Practicando",
  [CONSOLIDATED]: "Consolidada",
};

export const BANDS = ["beginner", "intermediate", "advanced"] as const;
export type DifficultyBand = (typeof BANDS)[number];

export const BAND_LABELS: Record<DifficultyBand, string> = {
  beginner: "Principiante",
  intermediate: "Intermedio",
  advanced: "Avanzado",
};

export const JUDGMENT_MODES = new Set([
  "debug",
  "refactor",
  "find_error",
  "counterexample",
  "design",
  "rewrite",
]);

export const PASS_SCORE = 75;
export const FAIL_SCORE = 40;
export const FIRST_INTERVAL = 7;
export const MAX_INTERVAL = 180;

export function difficultyBand(difficulty: any): DifficultyBand {
  const d = parseInt(String(difficulty), 10);
  const num = Number.isNaN(d) ? 2 : d;
  return num <= 2 ? "beginner" : num === 3 ? "intermediate" : "advanced";
}

export function attemptPassed(attempt: Record<string, any>): boolean {
  return (
    attempt.verdict !== "ungraded" &&
    !attempt.solution_seen &&
    (parseInt(String(attempt.score), 10) || 0) >= PASS_SCORE
  );
}

export function attemptFailed(attempt: Record<string, any>): boolean {
  return (
    attempt.verdict !== "ungraded" &&
    (parseInt(String(attempt.score), 10) || 0) < FAIL_SCORE
  );
}

export function attemptNoHelp(attempt: Record<string, any>): boolean {
  return (
    (parseInt(String(attempt.hints_used), 10) || 0) === 0 &&
    !attempt.solution_seen
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Fase 2 · qué cuenta.
   ───────────────────────────────────────────────────────────────────────── */

/** Por qué un intento no cuenta para el progreso ni para la próxima revisión. */
export const NO_COUNT_REASONS: Record<string, string> = {
  ungraded: "no se llegó a calificar",
  solution_seen: "se vio la solución",
  hints_used: "se usó una pista o la ayuda",
  gave_up: "se abandonó el ejercicio",
};

export interface AttemptCounting {
  counted: boolean;
  /** Vacío cuando cuenta. */
  reasons: string[];
  /** Los códigos, para la interfaz. */
  codes: string[];
}

/**
 * Lo que cuenta un intento.
 *
 * Un intento cuenta para el progreso, la maestría y la programación de repasos
 * (estilo chess.com) solo si fue calificado, no se vio la solución, no se usó
 * ninguna pista o ayuda y no se abandonó. Si no cuenta se guarda igual: es
 * práctica, alimenta el registro de errores y el historial, pero no mueve nada
 * hasta que el ejercicio se rehaga sin ayuda.
 *
 * Un `counted` explícito en el registro manda (lo escribe quien conoce el caso);
 * en los registros antiguos, que no lo traen, se deduce de sus propios campos.
 */
export function countAttempt(attempt: Record<string, any>): AttemptCounting {
  const codes: string[] = [];
  const verdict = String(attempt.verdict ?? "ungraded").trim().toLowerCase();
  if (verdict === "ungraded" || !verdict) codes.push("ungraded");
  if (attempt.solution_seen) codes.push("solution_seen");
  if ((parseInt(String(attempt.hints_used), 10) || 0) > 0) codes.push("hints_used");
  if (attempt.gave_up || String(attempt.outcome ?? "").trim().toLowerCase() === "gave_up") codes.push("gave_up");
  return {
    counted: codes.length === 0,
    reasons: codes.map((c) => NO_COUNT_REASONS[c] ?? c),
    codes,
  };
}

/** Si el intento cuenta: lo que diga el registro, o la regla si no lo trae. */
export function attemptCounts(attempt: Record<string, any>): boolean {
  if (typeof attempt.counted === "boolean") return attempt.counted;
  return countAttempt(attempt).counted;
}

function _day(stamp: any): string {
  if (!stamp) return formatIsoDate(new Date());
  const d = parseIsoDate(stamp);
  return d ? formatIsoDate(d) : formatIsoDate(new Date());
}

function addDays(dayStr: string, days: number): string {
  const d = parseIsoDate(dayStr) || new Date();
  const next = new Date(d.getTime() + days * 86400000);
  return formatIsoDate(next);
}

export interface SkillReplay {
  status: string;
  attempts: number;
  /** Intentos que cuentan (sin ayuda, sin solución vista, calificados). */
  counted_attempts: number;
  /** Práctica que no movió nada (fase 2): se ve en el historial, no en el progreso. */
  ignored_attempts: number;
  best: number | null;
  last_at: string;
  bands: string[];
  judged: boolean;
  consolidated_on: string;
  interval_days: number;
  due: string;
  is_due: boolean;
  lapses: number;
}

export function replay(
  events: Array<Record<string, any>>,
  today?: Date | string | null
): SkillReplay {
  const todayStr = _day(today);
  let status = NOT_STARTED;
  const bands = new Set<string>();
  let judged = false;
  let interval = 0;
  let due: string | null = null;
  let consolidatedOn: string | null = null;
  let lapses = 0;

  const sortedEvents = [...events].sort((a, b) =>
    String(a.at || "").localeCompare(String(b.at || ""))
  );

  // Fase 2: la práctica con ayuda no mueve estado, banda, intervalo ni próxima
  // revisión. Se queda en el historial (attempts) pero no entra en el motor.
  const countedEvents = sortedEvents.filter(attemptCounts);

  for (const ev of countedEvents) {
    const day = _day(ev.at);
    if (status === NOT_STARTED) {
      status = PRACTICING;
    }
    if (status === CONSOLIDATED) {
      if (attemptFailed(ev)) {
        status = PRACTICING;
        bands.clear();
        judged = false;
        interval = 0;
        due = null;
        lapses += 1;
      } else if (attemptPassed(ev) && due && day >= due) {
        interval = Math.min(MAX_INTERVAL, interval * 2);
        due = addDays(day, interval);
      }
      continue;
    }
    if (attemptPassed(ev)) {
      const band = difficultyBand(ev.difficulty);
      bands.add(band);
      if (band === "advanced" && JUDGMENT_MODES.has(ev.mode) && attemptNoHelp(ev)) {
        judged = true;
      }
    }
    if (
      judged ||
      (bands.has("beginner") && bands.has("intermediate") && bands.has("advanced"))
    ) {
      status = CONSOLIDATED;
      consolidatedOn = day;
      interval = FIRST_INTERVAL;
      due = addDays(day, FIRST_INTERVAL);
    }
  }

  const scores: number[] = [];
  for (const e of countedEvents) {
    if (e.verdict !== "ungraded") {
      scores.push(parseInt(String(e.score), 10) || 0);
    }
  }

  let last = "";
  for (const e of events) {
    const atStr = String(e.at || "");
    if (atStr > last) last = atStr;
  }

  return {
    status,
    attempts: events.length,
    counted_attempts: countedEvents.length,
    ignored_attempts: events.length - countedEvents.length,
    best: scores.length > 0 ? Math.max(...scores) : null,
    last_at: last,
    bands: BANDS.filter((b) => bands.has(b)),
    judged,
    consolidated_on: consolidatedOn || "",
    interval_days: interval,
    due: due || "",
    is_due: Boolean(status === CONSOLIDATED && due && due <= todayStr),
    lapses,
  };
}

export function loadAllAttempts(vaultRoot: string): Record<string, Record<string, any>> {
  const folder = path.join(path.resolve(vaultRoot), LAYOUT.study_attempts_dir);
  const out: Record<string, Record<string, any>> = {};
  if (!fs.existsSync(folder)) return out;

  let files: string[];
  try {
    files = fs.readdirSync(folder).filter((f) => f.endsWith(".json")).sort();
  } catch {
    return out;
  }

  for (const f of files) {
    if (isSyncConflict(f)) continue;
    const filePath = path.join(folder, f);
    const data = store.loadJson<Record<string, any>>(filePath, {});
    if (!data || typeof data !== "object" || !data.note_id) continue;
    const attempts = data.attempts;
    data.attempts = Array.isArray(attempts)
      ? attempts.filter((a) => typeof a === "object" && a !== null)
      : [];
    out[String(data.note_id)] = data;
  }
  return out;
}

export const load_all_attempts = loadAllAttempts;

function _events(
  exercises: ExerciseRef[],
  attempts: Record<string, any>
): Map<string, Array<Record<string, any>>> {
  const byId = new Map<string, ExerciseRef>();
  for (const e of exercises) {
    byId.set(e.note_id, e);
  }

  const groups = new Map<string, Array<Record<string, any>>>();
  for (const [noteId, data] of Object.entries(attempts)) {
    const ref = byId.get(noteId);
    const attemptsList = Array.isArray(data.attempts) ? data.attempts : [];
    for (const a of attemptsList) {
      let disc: string;
      let skill: string;
      let difficulty: any;
      if (ref) {
        disc = ref.discipline;
        skill = ref.skill;
        difficulty = ref.difficulty;
      } else {
        disc = String(a.discipline || "");
        skill = skillKey(disc, String(a.mode || ""), a.skill);
        difficulty = a.difficulty ?? 2;
      }
      const key = `${disc}:::${skill}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push({
        ...a,
        difficulty,
        note_id: noteId,
      });
    }
  }
  return groups;
}

export function buildLedger(
  vaultRoot: string,
  exercises: ExerciseRef[],
  attempts: Record<string, any> | null = null,
  today: Date | string | null = null
): Record<string, Record<string, any>> {
  const allAttempts = attempts === null ? loadAllAttempts(vaultRoot) : attempts;
  const events = _events(exercises, allAttempts);

  const active = new Set<string>();
  for (const e of exercises) {
    active.add(e.discipline);
  }
  for (const key of events.keys()) {
    const disc = key.split(":::")[0];
    if (disc) active.add(disc);
  }

  const now = formatIsoDatetime(new Date());
  const ledgers: Record<string, Record<string, any>> = {};

  for (const discId of Array.from(active).sort()) {
    const disc = DISCIPLINES[discId];
    if (!disc) continue;

    const codes = disc.skills.map((s) => s.code);
    const extraSet = new Set<string>();
    for (const e of exercises) {
      if (e.discipline === discId) extraSet.add(e.skill);
    }
    for (const key of events.keys()) {
      const [d, s] = key.split(":::");
      if (d === discId && s) extraSet.add(s);
    }
    const extra = Array.from(extraSet).sort();
    for (const c of extra) {
      if (!codes.includes(c)) {
        codes.push(c);
      }
    }

    const rows: Array<Record<string, any>> = [];
    for (const code of codes) {
      const skill = skillOf(disc, code);
      const refs = exercises.filter(
        (e) => e.discipline === discId && e.skill === code
      );
      const evs = events.get(`${discId}:::${code}`) || [];
      const row: Record<string, any> = replay(evs, today);
      row.code = code;
      row.title = skill ? skill.title : code || "Sin skill";
      row.label = STATUS_LABELS[row.status] || row.status;
      row.exercises = refs.length;
      const noteIds = new Set(evs.map((ev) => ev.note_id));
      row.attempted_exercises = noteIds.size;
      rows.push(row);
    }

    ledgers[discId] = {
      discipline: discId,
      title: disc.title,
      subject: disc.subject,
      updated: now,
      skills: rows,
    };
  }

  return ledgers;
}

export const build_ledger = buildLedger;

export function ledgerPath(vaultRoot: string, discipline: string): string {
  return path.join(
    path.resolve(vaultRoot),
    formatLayout(LAYOUT.study_ledger, { id: discipline })
  );
}

export const ledger_path = ledgerPath;

export function saveLedgers(
  vaultRoot: string,
  ledgers: Record<string, Record<string, any>>
): void {
  for (const [discId, data] of Object.entries(ledgers)) {
    const p = ledgerPath(vaultRoot, discId);
    const old = store.loadJson<Record<string, any>>(p, {});
    if (
      old &&
      typeof old === "object" &&
      JSON.stringify(old.skills) === JSON.stringify(data.skills)
    ) {
      continue;
    }
    store.writeJson(p, data);
  }
}

export const save_ledgers = saveLedgers;

export function loadLedger(vaultRoot: string, discipline: string): Record<string, any> {
  const data = store.loadJson<Record<string, any>>(ledgerPath(vaultRoot, discipline), {});
  return data && typeof data === "object" ? data : {};
}

export const load_ledger = loadLedger;

export function refreshLedgers(
  vaultRoot: string,
  exercises: ExerciseRef[],
  today: Date | string | null = null,
  attempts: Record<string, any> | null = null
): Record<string, Record<string, any>> {
  const ledgers = buildLedger(vaultRoot, exercises, attempts, today);
  saveLedgers(vaultRoot, ledgers);
  return ledgers;
}

export const refresh_ledgers = refreshLedgers;

export function skillStatus(
  ledgers: Record<string, any>,
  discipline: string,
  code: string
): Record<string, any> | null {
  const rows = ledgers[discipline]?.skills;
  if (!Array.isArray(rows)) return null;
  for (const row of rows) {
    if (row.code === code) return row;
  }
  return null;
}

export const skill_status = skillStatus;
