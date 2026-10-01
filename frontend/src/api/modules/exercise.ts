import * as path from "node:path";
import { addDays, todayIso, weekday } from "../../core/dates.js";
import { ApiError } from "../../core/errors.js";
import {
  ExerciseManager,
  VIDEO_EXTS,
} from "../../core/exerciseManager.js";
import { normalizeMuscles } from "../../core/exerciseMuscles.js";
import { exercises as CATALOG } from "@bryllim/workout-guide";
import type { LibraryUserEntry } from "../../lib/libraryTypes.js";
import type { AppState } from "../appState.js";
import { clampInt, oneLine, optDate } from "../common.js";
import { MediaServer } from "../media.js";

export const DAY_KEYS = [
  "lunes",
  "martes",
  "miercoles",
  "jueves",
  "viernes",
  "sabado",
  "domingo",
] as const;

export const GLYPHS = ["💪", "🦵", "💪", "🦵", "🔥", "🚶", "😴"] as const;

export const DAY_METAS = [
  { key: "lunes", name: "Lunes", subtitle: "Top A — Fuerza" },
  { key: "martes", name: "Martes", subtitle: "Bottom A — Fuerza" },
  { key: "miercoles", name: "Miércoles", subtitle: "Recuperación activa" },
  { key: "jueves", name: "Jueves", subtitle: "Top B — Resistencia" },
  { key: "viernes", name: "Viernes", subtitle: "Bottom B — Resistencia" },
  { key: "sabado", name: "Sábado", subtitle: "Recuperación activa" },
  { key: "domingo", name: "Domingo", subtitle: "Cardio / Descanso" },
] as const;

function dayKey(d: Date): string {
  return DAY_KEYS[weekday(d)]!;
}

function num(value: unknown, lo: number, hi: number): number {
  let v = 0.0;
  if (value !== null && value !== undefined && value !== "") {
    const s = String(value).replace(/,/g, ".");
    v = parseFloat(s);
    if (Number.isNaN(v)) {
      throw new ApiError(`Número inválido: ${value}`);
    }
  }
  if (!Number.isFinite(v) || v < lo || v > hi) {
    throw new ApiError(`Número inválido: ${value}`);
  }
  return v;
}

function exDict(mgr: ExerciseManager, e: Record<string, any>): Record<string, unknown> {
  const videoFile = mgr.resolveVideo(e);
  return {
    id: e.id,
    day: e.day || "",
    name: e.name || "",
    video: e.video || "",
    video_path: e.video_path || "",
    series_reps: e.series_reps || "",
    rest: e.rest || "",
    how_to: e.how_to || "",
    has_video: videoFile !== null,
    video_name: videoFile ? path.basename(videoFile) : "",
    muscles: normalizeMuscles(e.muscles),
    source: e.source || "",
    sourceFp: e.sourceFp || "",
  };
}

function exFields(fields: unknown) {
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
    throw new ApiError("Datos inválidos.");
  }
  const f = fields as Record<string, any>;
  const day = f.day ?? "lunes";
  if (!DAY_KEYS.includes(day)) {
    throw new ApiError("Día inválido.");
  }
  const videoPath = oneLine(f.video_path, 1000);
  if (videoPath) {
    const ext = path.extname(videoPath).toLowerCase();
    if (!VIDEO_EXTS.includes(ext as any)) {
      throw new ApiError(
        "Eso no es un video (mp4, mov, webm, mkv, m4v, avi)."
      );
    }
  }
  return {
    day,
    // De qué entrada de la biblioteca salió esta copia, si salió de alguna.
    // Vacío = escrito a mano, que es la respuesta a «¿esto es de la Biblioteca?».
    source: oneLine(f.source, 120),
    // Huella de lo que se copió; la Task 6 la compara para avisar de copias viejas.
    sourceFp: oneLine(f.sourceFp, 40),
    name: oneLine(f.name, 120) || "Ejercicio",
    video_path: videoPath,
    series_reps: oneLine(f.series_reps, 120),
    rest: oneLine(f.rest, 60),
    how_to: String(f.how_to || "").slice(0, 4000),
    muscles: normalizeMuscles(f.muscles),
  };
}

function openWithSystem(filePath: string): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const electron = require("electron") as {
      shell: { openPath(p: string): Promise<string> };
    };
    electron.shell.openPath(filePath);
  } catch {
    // best-effort
  }
}

/**
 * La clave con la que se reconoce un ejercicio. Case-insensitive y con los
 * espacios internos colapsados: es lo que hace que «  MI   PRESS » y
 * «mi press» sean el mismo ejercicio y no dos.
 */
export function normalizeLibraryName(name: string): string {
  return String(name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * `nombre normalizado -> slug` del catálogo de 302.
 *
 * Se lee del paquete directamente y **no** de `lib/exerciseLibrary.ts`: ese
 * fichero es del renderer y arrastrarlo aquí se traería el mapa corporal y sus
 * dependencias al proceso de Electron sin necesitar nada de eso.
 */
function catalogSlugByName(): Map<string, string> {
  return new Map(
    CATALOG.map((e) => [normalizeLibraryName(e.name), e.slug]),
  );
}

export function exerciseApi(app: AppState) {
  const mgr = () => app.mgrs().exercise;
  const lib = () => app.mgrs().library;
  let media: MediaServer | null = null;
  const server = (): MediaServer => (media ??= new MediaServer());

  function exDate(value: unknown): Date {
    const d = optDate(value);
    if (!d) {
      throw new ApiError("Fecha inválida.");
    }
    return d;
  }

  function exVideo(exerciseId: string): string {
    const m = mgr();
    const e = m.exercises().find((x) => x.id === exerciseId);
    if (!e) {
      throw new ApiError("Ese ejercicio ya no existe.");
    }
    const hit = m.resolveVideo(e);
    if (!hit) {
      throw new ApiError(
        "No se encontró el video. Vincúlalo en «Ejercicios · Tu programa»."
      );
    }
    const ext = path.extname(hit).toLowerCase();
    if (!VIDEO_EXTS.includes(ext as any)) {
      throw new ApiError("Eso no es un video.");
    }
    return path.resolve(hit);
  }

  return {
    _shutdown_media() {
      if (media) {
        media.shutdown();
        media = null;
      }
    },

    ex_meta() {
      return {
        days: DAY_METAS.map((d, i) => ({
          key: d.key,
          name: d.name,
          subtitle: d.subtitle,
          glyph: GLYPHS[i]!,
        })),
      };
    },

    ex_list() {
      const m = mgr();
      return m.exercises().map((e) => exDict(m, e));
    },

    ex_days(first: string, last: string) {
      const a = exDate(first);
      const b = exDate(last);
      const diffDays = Math.round(
        (b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000)
      );
      if (b < a || diffDays > 31) {
        throw new ApiError("Rango de fechas inválido.");
      }
      const m = mgr();
      const out: Array<Record<string, unknown>> = [];
      let curr = new Date(a);
      while (curr <= b) {
        const dk = dayKey(curr);
        const exs = m.exercisesForDay(dk);
        const log = m.getLog(curr);
        out.push({
          date: todayIso(curr),
          day: dk,
          exercises: exs.map((e) => exDict(m, e)),
          log: Object.fromEntries(
            exs.map((e) => [e.id, log.entries[e.id] ?? {}])
          ),
          pct: m.dayPct(curr),
        });
        curr = addDays(curr, 1);
      }
      return out;
    },

    ex_mark(
      day: string,
      exerciseId: string,
      done: boolean,
      weight: unknown = 0,
      reps: unknown = 0,
      notes = ""
    ) {
      const d = exDate(day);
      const m = mgr();
      if (!m.exercises().some((e) => e.id === exerciseId)) {
        throw new ApiError("Ese ejercicio ya no existe.");
      }
      m.markDone(
        d,
        String(exerciseId),
        Boolean(done),
        num(weight, 0, 2000),
        Math.trunc(num(reps, 0, 10000)),
        oneLine(notes, 300)
      );
      return { ok: true, pct: m.dayPct(d) };
    },

    ex_library_list(): LibraryUserEntry[] {
      return lib().entries();
    },

    /**
     * Guarda en la biblioteca propia.
     *
     * Si el nombre ya existe —en tus entradas o en el catálogo— **edita esa**,
     * no crea otra. Esa es la garantía: no hay ruta en el código que produzca
     * un duplicado. Si el nombre viene del catálogo, la entrada propia se crea
     * con **su** slug, y en la biblioteca sigue habiendo un solo bench-press.
     *
     * Solo se escriben los campos que llegan con contenido: uno vacío
     * significa «déjalo como estaba», no «bórralo».
     */
    ex_library_save(fields: unknown) {
      const f = (fields ?? {}) as Record<string, unknown>;
      const name = oneLine(f.name, 120);
      if (!name) {
        throw new ApiError("El ejercicio necesita un nombre.");
      }
      const howTo = String(f.how_to || "").slice(0, 4000).trim();
      const equipment = oneLine(f.equipment, 60);
      const muscles = normalizeMuscles(f.muscles);

      const store = lib();
      const entries = store.entries();
      const key = normalizeLibraryName(name);

      const propia = entries.find((e) => normalizeLibraryName(e.name) === key);
      // ¿El nombre es uno del catálogo? Si lo es, la entrada propia que se crea
      // usa **su** slug: así el ejercicio sigue siendo el mismo y no aparece
      // dos veces con nombres parecidos.
      const slugDelCatalogo = propia
        ? null
        : catalogSlugByName().get(key) ?? null;
      const actual: Partial<LibraryUserEntry> & { slug?: string } | null = propia ?? (slugDelCatalogo
        ? { slug: slugDelCatalogo, name, equipment: "", muscles: { primary: [], secondary: [] }, how_to: "" }
        : null);

      // Un campo llega si trae algo; si no, se conserva el que había.
      const next: LibraryUserEntry = {
        slug: actual?.slug ?? `mia-${Math.random().toString(36).slice(2, 10)}`,
        name,
        equipment: equipment || actual?.equipment || "",
        muscles: muscles.primary.length || muscles.secondary.length
          ? { primary: muscles.primary, secondary: muscles.secondary }
          : actual?.muscles ?? { primary: [], secondary: [] },
        how_to: howTo || actual?.how_to || "",
      };

      const resto = entries.filter((e) => e.slug !== next.slug);
      store.save([...resto, next]);
      return { entry: next, created: !actual, updatedFrom: actual?.slug };
    },

    /** Borra una entrada propia. El catálogo no se puede borrar. */
    ex_library_remove(slug: string): boolean {
      const s = String(slug ?? "");
      // Los `mia-` son tuyos. Sin prefijo sería del paquete, y 302 ejercicios
      // escritos no se borran porque alguien vacíe su fichero.
      if (!s.startsWith("mia-")) return false;
      const store = lib();
      const entries = store.entries();
      if (!entries.some((e) => e.slug === s)) return false;
      store.save(entries.filter((e) => e.slug !== s));
      return true;
    },

    ex_overview(year = 0, exerciseId = "") {
      const m = mgr();      const today = new Date();
      const y = clampInt(
        year || today.getFullYear(),
        1970,
        3000,
        today.getFullYear()
      );
      const dayOfWeek = weekday(today);
      const monday = addDays(today, -dayOfWeek);
      let week = 0;
      for (let i = 0; i < 7; i++) {
        const d = addDays(monday, i);
        if (d <= today && m.dayPct(d) > 0) {
          week += 1;
        }
      }
      let month = 0;
      for (let n = 1; n <= today.getDate(); n++) {
        const d = new Date(today.getFullYear(), today.getMonth(), n);
        if (m.dayPct(d) > 0) {
          month += 1;
        }
      }
      const yearPcts = m.rangePctByDay(y);
      let yearTrained = 0;
      for (const p of Object.values(yearPcts)) {
        if (p > 0) yearTrained += 1;
      }

      let grid: Record<string, number> = {};
      if (exerciseId) {
        const hist = m.exerciseHistory(String(exerciseId), y);
        for (const [d, v] of Object.entries(hist)) {
          grid[d] = v ? 1.0 : 0.0;
        }
      } else {
        grid = m.rangePctByDay(y);
      }

      const breakdown: Array<{
        day: string;
        rows: Array<{ id: string; name: string; done: number; total: number }>;
      }> = [];
      for (const key of DAY_KEYS) {
        const rows: Array<{
          id: string;
          name: string;
          done: number;
          total: number;
        }> = [];
        for (const e of m.exercisesForDay(key)) {
          const hist = m.exerciseHistory(e.id, y);
          let done = 0;
          for (const v of Object.values(hist)) {
            if (v) done += 1;
          }
          rows.push({
            id: e.id,
            name: e.name || "",
            done,
            total: Object.keys(hist).length,
          });
        }
        if (rows.length) {
          breakdown.push({ day: key, rows });
        }
      }

      return {
        week,
        month,
        year: yearTrained,
        grid,
        breakdown,
      };
    },

    /**
     * The four periods of the module, the streak and the trained-day counts.
     *
     * Same definitions the views use: a day is due when its weekday has a
     * routine, it counts as trained when at least one exercise of it is done,
     * and a rest day neither adds to the streak nor breaks it (the Hábitos rule).
     */
    ex_stats(year = 0) {
      const m = mgr();
      const now = new Date();
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const y = clampInt(year || now.getFullYear(), 1970, 3000, now.getFullYear());

      const dueIds = (d: Date) => m.exercisesForDay(DAY_KEYS[weekday(d)]!).map((e) => e.id);
      const doneOn = (d: Date) => {
        const ids = dueIds(d);
        const log = m.getLog(d);
        return ids.filter((id) => log.isDone(id)).length;
      };

      /** Everything done over everything due, up to today, plus the day counts. */
      const tally = (from: Date, to: Date) => {
        let done = 0;
        let total = 0;
        let trained = 0;
        let due = 0;
        const pcts: number[] = [];
        for (let d = new Date(from); d <= to && d <= midnight; d = addDays(d, 1)) {
          const ids = dueIds(d);
          if (!ids.length) continue;
          due += 1;
          const dDone = doneOn(d);
          done += dDone;
          total += ids.length;
          pcts.push(dDone / ids.length);
          if (dDone > 0) trained += 1;
        }
        // The mean of the daily percentages, as in Hábitos: every day weighs the
        // same, so a day with one exercise cannot outvote a day with ten.
        const pct = pcts.length ? pcts.reduce((a, v) => a + v, 0) / pcts.length : 0;
        return { done, total, pct, trained, due };
      };

      const monday = addDays(midnight, -weekday(midnight));
      const todayIds = dueIds(midnight);
      const todayDone = doneOn(midnight);

      let current = 0;
      for (let i = 0; i < 400; i += 1) {
        const d = addDays(midnight, -i);
        if (!dueIds(d).length) continue;
        if (m.dayPct(d) > 0) current += 1;
        else break;
      }
      let best = 0;
      let run = 0;
      for (let d = new Date(y, 0, 1); d <= midnight; d = addDays(d, 1)) {
        if (!dueIds(d).length) continue;
        if (m.dayPct(d) > 0) {
          run += 1;
          if (run > best) best = run;
        } else {
          run = 0;
        }
      }

      return {
        year: y,
        today: {
          done: todayDone,
          total: todayIds.length,
          pct: todayIds.length ? todayDone / todayIds.length : 0,
        },
        week: tally(monday, addDays(monday, 6)),
        month: tally(new Date(y, midnight.getMonth(), 1), new Date(y, midnight.getMonth() + 1, 0)),
        anual: tally(new Date(y, 0, 1), new Date(y, 11, 31)),
        streak: { current, best },
      };
    },

    ex_save(exerciseId: string, fields: unknown) {
      const f = exFields(fields);
      const m = mgr();
      if (!exerciseId) {
        const e = m.addExercise(
          f.name,
          f.day,
          f.video_path,
          f.series_reps,
          f.rest,
          f.how_to
        );
        // addExercise keeps its old signature, so the muscles go in a second step.
        if (f.muscles.primary.length || f.muscles.secondary.length) {
          m.updateExercise(String(e.id), { muscles: f.muscles });
        }
        // Y el origen, cuando la copia viene de la biblioteca.
        if (f.source || f.sourceFp) {
          m.updateExercise(String(e.id), { source: f.source, sourceFp: f.sourceFp });
        }
        return exDict(m, m.exercises().find((x) => x.id === e.id)!);
      }
      if (!m.exercises().some((e) => e.id === exerciseId)) {
        throw new ApiError("Ese ejercicio ya no existe.");
      }
      const actual = m.exercises().find((e) => e.id === exerciseId)!;
      const updates: Record<string, any> = { ...f };
      // Editar «4×8» no puede borrar de dónde salió el ejercicio. Como `f` llega
      // con "" cuando no se manda el campo, aquí se recupera el que había: el
      // origen se actualiza solo desde la biblioteca, nunca al retocar tus
      // números.
      if (!f.source) updates.source = actual.source || "";
      if (!f.sourceFp) updates.sourceFp = actual.sourceFp || "";
      if (f.video_path) {
        updates.video = path.basename(f.video_path);
      }
      m.updateExercise(String(exerciseId), updates);
      const updated = m.exercises().find((e) => e.id === exerciseId)!;
      return exDict(m, updated);
    },

    ex_remove(exerciseId: string) {
      const m = mgr();
      if (!m.exercises().some((e) => e.id === exerciseId)) {
        throw new ApiError("Ese ejercicio ya no existe.");
      }
      m.removeExercise(String(exerciseId));
      return { ok: true };
    },

    ex_link_videos() {
      return mgr().linkVideos();
    },

    async ex_video_url(exerciseId: string) {
      const videoPath = exVideo(String(exerciseId));
      const srv = server();
      return {
        url: await srv.urlFor(videoPath),
        name: path.basename(videoPath),
      };
    },

    ex_open_video(exerciseId: string) {
      const videoPath = exVideo(String(exerciseId));
      openWithSystem(videoPath);
      return { ok: true };
    },

    ex_pick_video(exerciseId: string) {
      if (app.window === null || app.window === undefined) {
        throw new ApiError("Solo disponible en la app de escritorio.");
      }
      let chosen: string | null = null;
      const win = app.window as any;
      if (typeof win.create_file_dialog === "function") {
        const res = win.create_file_dialog(1, [
          "Videos (*.mp4 *.mov *.webm *.mkv *.m4v *.avi)",
        ]);
        if (res) chosen = Array.isArray(res) ? res[0] : res;
      } else {
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const electron = require("electron") as {
            dialog: { showOpenDialogSync(opts: unknown): string[] | undefined };
          };
          const res = electron.dialog.showOpenDialogSync({
            properties: ["openFile"],
            filters: [
              {
                name: "Videos",
                extensions: ["mp4", "mov", "webm", "mkv", "m4v", "avi"],
              },
            ],
          });
          if (res && res.length) chosen = res[0]!;
        } catch {
          chosen = null;
        }
      }
      if (!chosen) {
        return { ok: false };
      }
      const source = path.resolve(chosen);
      const ext = path.extname(source).toLowerCase();
      if (!VIDEO_EXTS.includes(ext as any)) {
        throw new ApiError("Eso no es un video.");
      }
      const m = mgr();
      if (!m.exercises().some((e) => e.id === exerciseId)) {
        throw new ApiError("Ese ejercicio ya no existe.");
      }
      m.importVideo(String(exerciseId), source);
      return { ok: true };
    },
  };
}
