/**
 * NoteVault Exercise Manager
 * Data layer for the Ejercicio module.
 * Ported from notevault_app/core/exercise_manager.py.
 *
 * Exercise definitions: {vault}/ejercicio/exercises.json
 * Daily logs:          {vault}/ejercicio/YYYY/MM/YYYY-MM-DD.json
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { parseIsoDate, todayIso, weekday } from "./dates";
import { LAYOUT } from "./vaultFormat";

export interface ExerciseEntry {
  done: boolean;
  weight: number;
  reps: number;
  notes: string;
}

export class ExerciseLog {
  date: Date;
  entries: Record<string, ExerciseEntry>;

  constructor(day: Date | string, entries: Record<string, any> = {}) {
    this.date = typeof day === "string" ? parseIsoDate(day) || new Date() : day;
    this.entries = {};
    for (const [k, v] of Object.entries(entries)) {
      if (v && typeof v === "object") {
        this.entries[k] = {
          done: Boolean(v.done),
          weight: typeof v.weight === "number" ? v.weight : 0.0,
          reps: typeof v.reps === "number" ? v.reps : 0,
          notes: String(v.notes || ""),
        };
      }
    }
  }

  is_done(exerciseId: string): boolean {
    return Boolean(this.entries[exerciseId]?.done);
  }
  isDone(exerciseId: string): boolean {
    return this.is_done(exerciseId);
  }

  all_done(exerciseIds: string[]): boolean {
    return Boolean(exerciseIds.length) && exerciseIds.every((eid) => this.is_done(eid));
  }
  allDone(exerciseIds: string[]): boolean {
    return this.all_done(exerciseIds);
  }

  completion_pct(exerciseIds: string[]): number {
    if (!exerciseIds.length) return 0.0;
    const count = exerciseIds.filter((eid) => this.is_done(eid)).length;
    return count / exerciseIds.length;
  }
  completionPct(exerciseIds: string[]): number {
    return this.completion_pct(exerciseIds);
  }
}

export const VIDEO_EXTS = [".mp4", ".mov", ".webm", ".mkv", ".m4v", ".avi"] as const;

export class ExerciseManager {
  vaultRoot: string;
  ejercicioDir: string;
  _configPath: string;
  videosDir: string;
  private _exercises: Record<string, any>[] | null = null;
  private _logCache: Map<string, ExerciseLog> = new Map();

  constructor(vaultRoot: string) {
    this.vaultRoot = path.resolve(vaultRoot);
    this.ejercicioDir = path.join(this.vaultRoot, LAYOUT.exercise_dir);
    this._configPath = path.join(this.vaultRoot, LAYOUT.exercises);
    this.videosDir = path.join(this.vaultRoot, LAYOUT.exercise_videos_dir);
  }

  exercises(): Record<string, any>[] {
    if (this._exercises === null) {
      this._exercises = this._loadExercises();
    }
    return this._exercises;
  }

  exercises_for_day(dayKey: string): Record<string, any>[] {
    return this.exercisesForDay(dayKey);
  }

  exercisesForDay(dayKey: string): Record<string, any>[] {
    return this.exercises().filter((e) => e.day === dayKey);
  }

  private _loadExercises(): Record<string, any>[] {
    if (fs.existsSync(this._configPath)) {
      try {
        const text = fs.readFileSync(this._configPath, "utf-8");
        const data = JSON.parse(text);
        if (Array.isArray(data) && data.length > 0) {
          return data;
        }
      } catch {
        // Fichero ilegible: se empieza de cero en vez de romper el arranque.
      }
    }
    // El programa nace vacío a propósito. Antes se sembraban aquí 50
    // ejercicios escritos a mano, anteriores a la Biblioteca; ahora quien lo
    // usa lo monta desde el catálogo de 302, así que sembrar nada es lo
    // honesto. Los registros de días ya escritos se conservan.
    this._exercises = [];
    this.saveExercises();
    return [];
  }

  save_exercises(): void {
    this.saveExercises();
  }

  saveExercises(): void {
    fs.mkdirSync(this.ejercicioDir, { recursive: true });
    fs.writeFileSync(
      this._configPath,
      JSON.stringify(this._exercises || [], null, 2),
      "utf-8",
    );
  }

  static _videoKey(name: unknown): string {
    return path
      .parse(String(name || ""))
      .name.toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
  }

  videoFiles(): string[] {
    if (!fs.existsSync(this.videosDir)) return [];
    try {
      return fs
        .readdirSync(this.videosDir)
        .filter((f) => {
          const ext = path.extname(f).toLowerCase();
          return (VIDEO_EXTS as readonly string[]).includes(ext);
        })
        .sort()
        .map((f) => path.join(this.videosDir, f));
    } catch {
      return [];
    }
  }

  resolveVideo(exercise: Record<string, any>): string | null {
    for (const raw of [exercise.video_path, exercise.video]) {
      const hit = this._resolveOne(String(raw || "").trim());
      if (hit !== null) {
        return hit;
      }
    }
    return null;
  }

  private _resolveOne(raw: string): string | null {
    if (!raw) return null;
    const given = path.resolve(raw);
    const candidates = [
      raw,
      path.join(this.vaultRoot, raw),
      given,
    ];
    for (const candidate of candidates) {
      try {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          return candidate;
        }
      } catch {
        continue;
      }
    }

    const files = this.videoFiles();
    if (!files.length) return null;

    const baseGiven = path.basename(raw).toLowerCase();
    const exact = files.find((p) => path.basename(p).toLowerCase() === baseGiven);
    if (exact) return exact;

    const key = ExerciseManager._videoKey(baseGiven);
    if (!key) return null;

    const keyed = new Map<string, string>();
    for (const p of files) {
      keyed.set(ExerciseManager._videoKey(path.basename(p)), p);
    }
    if (keyed.has(key)) {
      return keyed.get(key)!;
    }

    if (key.length >= 5) {
      const near = Array.from(keyed.entries()).filter(
        ([k]) => k.startsWith(key) || key.startsWith(k),
      );
      if (near.length === 1) {
        return near[0]![1];
      }
    }
    return null;
  }

  linkVideos(): { linked: string[]; already: string[]; missing: string[] } {
    const linked: string[] = [];
    const already: string[] = [];
    const missing: string[] = [];
    let changed = false;

    for (const ex of this.exercises()) {
      const hit = this.resolveVideo(ex);
      if (!hit) {
        missing.push(ex.name || ex.id || "");
        continue;
      }
      const hitName = path.basename(hit);
      const inside =
        path.resolve(path.dirname(hit)).toLowerCase() ===
        path.resolve(this.videosDir).toLowerCase();
      const wantVideo = inside ? hitName : "";
      const wantPath = inside ? "" : hit;

      if (ex.video === wantVideo && ex.video_path === wantPath) {
        already.push(ex.name || "");
        continue;
      }
      ex.video = wantVideo;
      ex.video_path = wantPath;
      linked.push(`${ex.name || ""}  →  ${hitName}`);
      changed = true;
    }

    if (changed) {
      this.saveExercises();
    }
    return { linked, already, missing };
  }

  importVideo(exerciseId: string, sourcePath: string): string | null {
    if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
      return null;
    }
    fs.mkdirSync(this.videosDir, { recursive: true });
    const fileName = path.basename(sourcePath);
    let target = path.join(this.videosDir, fileName);

    if (path.resolve(target) !== path.resolve(sourcePath)) {
      if (fs.existsSync(target)) {
        const parsed = path.parse(fileName);
        let n = 2;
        while (fs.existsSync(target)) {
          target = path.join(this.videosDir, `${parsed.name} ${n}${parsed.ext}`);
          n += 1;
        }
      }
      fs.copyFileSync(sourcePath, target);
    }
    this.updateExercise(exerciseId, {
      video: path.basename(target),
      video_path: "",
    });
    return target;
  }

  addExercise(
    name: string,
    dayKey: string,
    videoPath: string,
    seriesReps: string,
    rest: string,
    howTo: string,
  ): Record<string, any> {
    const exercises = this.exercises();
    const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, "") || "ex";
    const baseId = `${dayKey}_${cleanName}`;
    let hid = baseId;
    const existing = new Set(exercises.map((e) => e.id));
    let counter = 2;
    while (existing.has(hid)) {
      hid = `${baseId}${counter}`;
      counter += 1;
    }
    const e = {
      id: hid,
      day: dayKey,
      name,
      video: videoPath ? path.basename(videoPath) : "",
      video_path: videoPath,
      series_reps: seriesReps,
      rest,
      how_to: howTo,
    };
    exercises.push(e);
    this._exercises = exercises;
    this.saveExercises();
    return e;
  }
  add_exercise(
    name: string,
    dayKey: string,
    videoPath = "",
    seriesReps = "",
    rest = "",
    howTo = "",
  ): Record<string, any> {
    return this.addExercise(name, dayKey, videoPath, seriesReps, rest, howTo);
  }

  updateExercise(exerciseId: string, fields: Record<string, any>): void {
    const exercises = this.exercises();
    for (const e of exercises) {
      if (e.id === exerciseId) {
        Object.assign(e, fields);
        break;
      }
    }
    this._exercises = exercises;
    this.saveExercises();
  }
  update_exercise(exerciseId: string, fields: Record<string, any>): void {
    this.updateExercise(exerciseId, fields);
  }

  removeExercise(exerciseId: string): boolean {
    const before = this.exercises().length;
    this._exercises = this.exercises().filter((e) => e.id !== exerciseId);
    this.saveExercises();
    return this._exercises.length < before;
  }
  delete_exercise(exerciseId: string): boolean {
    return this.removeExercise(exerciseId);
  }

  getExercise(exerciseId: string): Record<string, any> | null {
    return this.exercises().find((e) => e.id === exerciseId) || null;
  }
  get_exercise(exerciseId: string): Record<string, any> | null {
    return this.getExercise(exerciseId);
  }

  private _logPath(d: Date | string): string {
    const dStr = typeof d === "string" ? d : todayIso(d);
    const [year, month] = dStr.split("-");
    return path.join(this.ejercicioDir, year!, month!, `${dStr}.json`);
  }
  day_path(d: Date | string): string {
    return this._logPath(d);
  }
  log_path(d: Date | string): string {
    return this._logPath(d);
  }

  day(d: Date | string): Record<string, any> {
    return this.getLog(d).entries;
  }

  set_entry(
    d: Date | string,
    exerciseId: string,
    entry: { done?: boolean; weight?: number; reps?: number; notes?: string },
  ): void {
    this.markDone(
      d,
      exerciseId,
      Boolean(entry.done),
      entry.weight ?? 0.0,
      entry.reps ?? 0,
      entry.notes ?? "",
    );
  }

  getLog(d: Date | string): ExerciseLog {
    const dStr = typeof d === "string" ? d : todayIso(d);
    const cached = this._logCache.get(dStr);
    if (cached) return cached;

    const p = this._logPath(dStr);
    let entries: Record<string, any> = {};
    if (fs.existsSync(p)) {
      try {
        entries = JSON.parse(fs.readFileSync(p, "utf-8"));
      } catch {
        entries = {};
      }
    }
    const log = new ExerciseLog(dStr, entries);
    this._logCache.set(dStr, log);
    return log;
  }
  get_log(d: Date | string): ExerciseLog {
    return this.getLog(d);
  }

  saveLog(log: ExerciseLog): void {
    const dStr = todayIso(log.date);
    this._logCache.set(dStr, log);
    const p = this._logPath(dStr);
    fs.mkdirSync(path.dirname(p), { recursive: true });

    let json = JSON.stringify(log.entries, null, 2);
    // Python outputs 60.0 instead of 60 for floats
    json = json.replace(/"weight": (\d+)(?=[,\n])/g, '"weight": $1.0');
    fs.writeFileSync(p, json, "utf-8");
  }
  save_log(log: ExerciseLog): void {
    this.saveLog(log);
  }

  markDone(
    d: Date | string,
    exerciseId: string,
    done: boolean,
    weight = 0.0,
    reps = 0,
    notes = "",
  ): void {
    const log = this.getLog(d);
    log.entries[exerciseId] = {
      done,
      weight,
      reps,
      notes,
    };
    this.saveLog(log);
  }
  mark_done(
    d: Date | string,
    exerciseId: string,
    done: boolean,
    weight = 0.0,
    reps = 0,
    notes = "",
  ): void {
    this.markDone(d, exerciseId, done, weight, reps, notes);
  }

  dayPct(d: Date | string): number {
    const dateObj = typeof d === "string" ? parseIsoDate(d) || new Date() : d;
    const dayKeys = [
      "lunes", "martes", "miercoles", "jueves",
      "viernes", "sabado", "domingo",
    ];
    const key = dayKeys[weekday(dateObj)]!;
    const ids = this.exercisesForDay(key).map((e) => e.id);
    if (!ids.length) return 0.0;
    return this.getLog(dateObj).completionPct(ids);
  }
  day_pct(d: Date | string): number {
    return this.dayPct(d);
  }

  rangePctByDay(year: number): Record<string, number> {
    const today = new Date();
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const start = new Date(year, 0, 1);
    const end = new Date(year, 11, 31);
    const maxDate = todayMidnight < end ? todayMidnight : end;

    const result: Record<string, number> = {};
    const dayKeys = [
      "lunes", "martes", "miercoles", "jueves",
      "viernes", "sabado", "domingo",
    ];

    let current = start;
    while (current <= maxDate) {
      const key = dayKeys[weekday(current)]!;
      const ids = this.exercisesForDay(key).map((e) => e.id);
      const iso = todayIso(current);
      result[iso] = ids.length ? this.getLog(current).completionPct(ids) : 0.0;
      current = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1);
    }
    return result;
  }
  range_pct_by_day(year: number): Record<string, number> {
    return this.rangePctByDay(year);
  }

  exerciseHistory(exerciseId: string, year: number): Record<string, boolean> {
    const today = new Date();
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const ex = this.exercises().find((e) => e.id === exerciseId);
    if (!ex) return {};

    const dayKeys = [
      "lunes", "martes", "miercoles", "jueves",
      "viernes", "sabado", "domingo",
    ];
    const targetWeekday = dayKeys.indexOf(ex.day);
    if (targetWeekday === -1) return {};

    const result: Record<string, boolean> = {};
    const start = new Date(year, 0, 1);
    const end = new Date(year, 11, 31);
    const maxDate = todayMidnight < end ? todayMidnight : end;

    let current = start;
    while (current <= maxDate) {
      if (weekday(current) === targetWeekday) {
        const iso = todayIso(current);
        result[iso] = this.getLog(current).isDone(exerciseId);
      }
      current = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1);
    }
    return result;
  }
  exercise_history(exerciseId: string, year: number): Record<string, boolean> {
    return this.exerciseHistory(exerciseId, year);
  }
}
