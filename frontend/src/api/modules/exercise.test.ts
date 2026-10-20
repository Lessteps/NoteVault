import * as fs from "node:fs";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { todayIso } from "../../core/dates.js";
import { ApiError } from "../../core/errors.js";
import { ExerciseManager } from "../../core/exerciseManager.js";
import { AppState } from "../appState.js";
import { exerciseApi } from "./exercise.js";

function fetchRange(url: string, rangeHeader: string): Promise<{ status: number; data: Buffer }> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { headers: { Range: rangeHeader } }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      res.on("end", () => {
        resolve({ status: res.statusCode ?? 0, data: Buffer.concat(chunks) });
      });
    });
    req.on("error", reject);
  });
}

function fetchStatus(url: string): Promise<number> {
  return new Promise((resolve) => {
    http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    }).on("error", () => resolve(500));
  });
}

describe("exerciseApi", () => {
  it("favoritos alternan y persisten", () => {
    expect(api.ex_favorites()).toEqual([]);
    expect(api.ex_favorite_toggle("bench-press")).toEqual({ slug: "bench-press", on: true });
    expect(api.ex_favorites()).toEqual(["bench-press"]);
    expect(api.ex_favorite_toggle("bench-press")).toEqual({ slug: "bench-press", on: false });
    expect(api.ex_favorites()).toEqual([]);
  });

  it("gestiona perfil atlético y registro de peso", () => {
    const profile = api.ex_profile();
    expect(profile.goal).toBe("salud");
    expect(profile.weight_history).toEqual([]);

    // Guardar objetivo y limitaciones de salud
    const saved = api.ex_profile_save({
      goal: "hipertrofia",
      goal_note: "Etapa de volumen",
      health_limitations: "Molestia en hombro derecho",
    });
    expect(saved.goal).toBe("hipertrofia");
    expect(saved.goal_note).toBe("Etapa de volumen");
    expect(saved.health_limitations).toBe("Molestia en hombro derecho");

    // Añadir peso
    const withWeight = api.ex_weight_add("2026-05-10", 76.4);
    expect(withWeight.weight_history).toEqual([{ date: "2026-05-10", weight: 76.4 }]);

    // Rechaza peso o fecha inválida
    expect(() => api.ex_weight_add("fecha-mala", 70)).toThrow(ApiError);
    expect(() => api.ex_weight_add("2026-05-10", -5)).toThrow(ApiError);

    // Eliminar peso
    const removed = api.ex_weight_remove("2026-05-10");
    expect(removed.weight_history).toEqual([]);
  });

  let tmpDir: string;
  let app: AppState;
  let api: ReturnType<typeof exerciseApi>;
  let today: string;

  /**
   * El programa nace vacío —antes se sembraban 50 ejercicios por defecto—, así
   * que los tests que necesitan una rutina la montan aquí. Se siembra cada día
   * de la semana porque el logging es por día de la semana, no por fecha.
   */
  function seedWeek(): void {
    for (const day of ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"]) {
      api.ex_save("", { day, name: `Ejercicio de ${day}` });
    }
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_ex_test_"));
    app = new AppState(tmpDir);
    api = exerciseApi(app);
    today = todayIso();
  });

  afterEach(() => {
    api._shutdown_media();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("mark writes the same log", () => {
    seedWeek();
    const day = api.ex_days(today, today)[0]!;
    const exs = day.exercises as Array<{ id: string }>;
    const ex = exs[0]!;
    api.ex_mark(today, ex.id, true, "42,5", 8, "fácil");

    const mgr = new ExerciseManager(tmpDir);
    const entry = mgr.getLog(today).entries[ex.id]!;
    expect(entry.done).toBe(true);
    expect(entry.weight).toBe(42.5);
    expect(entry.reps).toBe(8);

    expect(api.ex_overview().week).toBeGreaterThan(0);
    expect(() => api.ex_mark(today, ex.id, true, "mucho")).toThrow(ApiError);
  });

  it("ex_history devuelve las sesiones hechas con volumen y 1RM", () => {
    seedWeek();
    const lunes = (api.ex_list() as Array<{ id: string; day: string }>).find((x) => x.day === "lunes")!;
    // Dos lunes pasados: fechas con weekday lunes del año en curso.
    const mondays: string[] = [];
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    while (mondays.length < 2) {
      d.setDate(d.getDate() - 1);
      const js = (d.getDay() + 6) % 7;
      if (js === 0) mondays.push(todayIso(d));
    }
    const [viejo, nuevo] = [mondays[1]!, mondays[0]!];
    api.ex_mark(nuevo, lunes.id, true, 70, 5, "");
    api.ex_mark(viejo, lunes.id, true, 60, 8, "");
    const hist = api.ex_history(lunes.id) as Array<{ date: string; volume: number; e1rm: number | null }>;
    const mine = hist.filter((h) => h.date === viejo || h.date === nuevo);
    expect(mine.map((h) => h.date)).toEqual([viejo, nuevo]);
    expect(mine.find((h) => h.date === viejo)!.volume).toBe(480);
    expect(mine.find((h) => h.date === nuevo)!.e1rm).toBeCloseTo(70 * (1 + 5 / 30), 6);
  });

  it("ex_history de un ejercicio inexistente es vacío", () => {
    expect(api.ex_history("no-existe")).toEqual([]);
  });

  it("mover cambia solo el día y conserva todo lo demás", () => {
    const e = api.ex_save("", {
      day: "lunes", name: "Press", series_reps: "4×8", rest: "90 s",
      source: "bench-press", sourceFp: "abc",
    }) as { id: string };
    api.ex_save(e.id, { day: "martes" });
    const got = api.ex_list().find((x) => x.id === e.id)! as Record<string, unknown>;
    expect(got.day).toBe("martes");
    expect(got.name).toBe("Press");
    expect(got.series_reps).toBe("4×8");
    expect(got.rest).toBe("90 s");
    expect(got.source).toBe("bench-press");
    expect(got.sourceFp).toBe("abc");
  });

  it("duplicar a otro día crea copia con nuevo id y mismo origen", () => {
    const e = api.ex_save("", {
      day: "lunes", name: "Press", series_reps: "4×8",
      source: "bench-press", sourceFp: "abc",
    }) as { id: string };
    const src = api.ex_list().find((x) => x.id === e.id)! as Record<string, unknown>;
    const copy = api.ex_save("", {
      day: "martes", name: src.name, series_reps: src.series_reps,
      source: src.source, sourceFp: src.sourceFp,
    }) as { id: string };
    expect(copy.id).not.toBe(e.id);
    const got = api.ex_list().find((x) => x.id === copy.id)! as Record<string, unknown>;
    expect(got.day).toBe("martes");
    expect(got.source).toBe("bench-press");
    expect(api.ex_list().filter((x) => (x as Record<string, unknown>).name === "Press")).toHaveLength(2);
  });

  it("routine edits", () => {
    const e = api.ex_save("", {
      day: "lunes",
      name: "Dominadas",
      series_reps: "3×8",
    }) as { id: string };

    expect(api.ex_list().some((x) => x.id === e.id)).toBe(true);

    api.ex_save(e.id, { day: "martes", name: "Dominadas lastradas" });
    expect(api.ex_list().find((x) => x.id === e.id)!.day).toBe("martes");

    expect(() => api.ex_save("", { day: "festivo" })).toThrow(ApiError);
    expect(() =>
      api.ex_save("", { day: "lunes", video_path: "C:/secretos.txt" })
    ).toThrow(ApiError);

    api.ex_remove(e.id);
    expect(api.ex_list().some((x) => x.id === e.id)).toBe(false);
  });

  it("video is streamed with ranges", async () => {
    seedWeek();
    const e = api.ex_list()[0] as { id: string; day: string; name: string };
    const mgr = new ExerciseManager(tmpDir);
    const videos = mgr.videosDir;
    fs.mkdirSync(videos, { recursive: true });

    const sampleData = Buffer.alloc(256 * 40);
    for (let i = 0; i < sampleData.length; i++) {
      sampleData[i] = i % 256;
    }
    const videoFile = path.join(videos, "clip.mp4");
    fs.writeFileSync(videoFile, sampleData);

    api.ex_save(e.id, {
      day: e.day,
      name: e.name,
      video_path: videoFile,
    });

    const res = await api.ex_video_url(e.id);
    expect(res.url.startsWith("http://127.0.0.1:")).toBe(true);

    const rangeRes = await fetchRange(res.url, "bytes=10-19");
    expect(rangeRes.status).toBe(206);
    expect(rangeRes.data).toEqual(sampleData.subarray(10, 20));

    const base = res.url.slice(0, res.url.lastIndexOf("/"));
    expect(await fetchStatus(base + "/deadbeef")).toBe(404);
  });

  it("missing video throws ApiError", async () => {
    const e = api.ex_save("", { day: "lunes", name: "Sin video" }) as {
      id: string;
    };
    await expect(api.ex_video_url(e.id)).rejects.toThrow(ApiError);
  });

  it("el video propio se sirve por http", async () => {
    const mgr = new ExerciseManager(tmpDir);
    fs.mkdirSync(mgr.videosDir, { recursive: true });
    const data = Buffer.alloc(256 * 10);
    const file = path.join(mgr.videosDir, "mio.mp4");
    fs.writeFileSync(file, data);
    const r = api.ex_library_save({ name: "Mío", video_path: file });
    const res = await api.ex_library_video_url(r.entry.slug);
    expect(res.url.startsWith("http://127.0.0.1:")).toBe(true);
    expect(res.name).toBe("mio.mp4");
  });

  it("sin video propio no hay url", async () => {
    api.ex_library_save({ name: "Mío" });
    const slug = api.ex_library_list()[0]!.slug;
    await expect(api.ex_library_video_url(slug)).rejects.toThrow(ApiError);
  });

  it("stats report the four periods, with nothing trained on an empty log", () => {
    seedWeek();
    const stats = api.ex_stats();
    expect(stats.today.done).toBe(0);
    expect(stats.today.pct).toBe(0);
    expect(stats.streak).toEqual({ current: 0, best: 0 });
    for (const period of [stats.week, stats.month, stats.anual]) {
      expect(period.done).toBe(0);
      expect(period.pct).toBe(0);
      expect(period.trained).toBe(0);
      // The routine is seeded for every weekday, so the period has days due.
      expect(period.due).toBeGreaterThan(0);
      expect(period.total).toBeGreaterThan(0);
    }
  });

  it("stats follow the ticks: one exercise is enough to train the day", () => {
    seedWeek();
    const day = api.ex_days(today, today)[0]!;
    const exs = day.exercises as Array<{ id: string }>;
    const first = api.ex_stats();
    expect(first.today.total).toBe(exs.length);

    api.ex_mark(today, exs[0]!.id, true, 0, 0, "");

    const stats = api.ex_stats();
    expect(stats.today.done).toBe(1);
    expect(stats.today.pct).toBeCloseTo(1 / exs.length);
    expect(stats.week.trained).toBe(1);
    expect(stats.week.pct).toBeGreaterThan(0);
    expect(stats.month.trained).toBe(1);
    expect(stats.anual.trained).toBe(1);
    expect(stats.streak.current).toBe(1);
    expect(stats.streak.best).toBeGreaterThanOrEqual(stats.streak.current);
  });

  it("stats count the whole routine of the period, not just today", () => {
    seedWeek();
    const day = api.ex_days(today, today)[0]!;
    const exs = day.exercises as Array<{ id: string }>;
    for (const ex of exs) api.ex_mark(today, ex.id, true, 0, 0, "");

    const stats = api.ex_stats();
    expect(stats.today.pct).toBe(1);
    // The yearly total is what every day of the year had due.
    expect(stats.anual.total).toBeGreaterThanOrEqual(stats.today.total);
    expect(stats.anual.pct).toBeGreaterThan(0);
  });

  it("guardar un nombre nuevo crea la entrada", () => {
    const r = api.ex_library_save({
      name: "Press banca",
      how_to: "Baja",
      muscles: { primary: ["pectoral"] },
    });
    expect(r.created).toBe(true);
    expect(r.entry.slug.startsWith("mia-")).toBe(true);
    expect(api.ex_library_list()).toHaveLength(1);
    expect(api.ex_library_list()[0]!.name).toBe("Press banca");
  });

  it("guardar un nombre del catálogo edita, no añade", () => {
    const r = api.ex_library_save({ name: "Bench Press", how_to: "Mío" });
    expect(r.created).toBe(false);
    // El slug es el del catálogo: es la misma entrada, editada.
    expect(r.updatedFrom).toBe("bench-press");
    expect(r.entry.slug).toBe("bench-press");
    expect(api.ex_library_list()).toHaveLength(1);
  });

  it("guardar dos veces el mismo nombre no crea un duplicado", () => {
    api.ex_library_save({ name: "Mi press" });
    api.ex_library_save({ name: "Mi press", how_to: "otro" });
    expect(api.ex_library_list()).toHaveLength(1);
    expect(api.ex_library_list()[0]!.how_to).toBe("otro");
  });

  it("un campo vacío en una edición deja el anterior como estaba", () => {
    // El heart del spec: vacío significa "déjalo", no "bórralo".
    api.ex_library_save({ name: "Mi press", how_to: "el bueno", equipment: "Barra" });
    api.ex_library_save({ name: "Mi press", how_to: "" });
    const e = api.ex_library_list()[0]!;
    expect(e.how_to).toBe("el bueno");
    expect(e.equipment).toBe("Barra");
  });

  it("el video propio se guarda y sobrevive a una edición sin video", () => {
    api.ex_library_save({ name: "Mi press", video_path: "ejercicio/videos/mio.mp4" });
    api.ex_library_save({ name: "Mi press", how_to: "pasos" });
    expect(api.ex_library_list()[0]!.video_path).toBe("ejercicio/videos/mio.mp4");
  });

  it("solo difiere en mayúsculas y espacios: edita, no duplica", () => {
    // Review Focus 3.
    api.ex_library_save({ name: "Mi press" });
    api.ex_library_save({ name: "  MI   PRESS  ", how_to: "x" });
    expect(api.ex_library_list()).toHaveLength(1);
    expect(api.ex_library_list()[0]!.how_to).toBe("x");
  });

  it("un nombre vacío no crea una entrada fantasma", () => {
    // Review Focus 1.
    expect(() => api.ex_library_save({ name: "   " })).toThrow(ApiError);
    expect(api.ex_library_list()).toEqual([]);
  });

  it("borrar solo quita entradas propias", () => {
    const r = api.ex_library_save({ name: "Mío" });
    expect(api.ex_library_remove(r.entry.slug)).toBe(true);
    expect(api.ex_library_list()).toEqual([]);
    // El catálogo no se toca: vaciar tu fichero no puede borrar los 302.
    expect(api.ex_library_remove("bench-press")).toBe(false);
  });

  it("los nombres del catálogo se reconocen sin distinguir mayúsculas", () => {
    expect(api.ex_library_save({ name: "bench press" }).updatedFrom).toBe("bench-press");
    expect(api.ex_library_save({ name: "  BENCH   PRESS  " }).updatedFrom).toBe("bench-press");
  });

  it("lo que se guarda sobrevive a una escritura de la rutina", () => {
    // La biblioteca y el programa son ficheros distintos: uno no pisa al otro.
    api.ex_library_save({ name: "Mío", how_to: "pasos" });
    api.ex_save("", { day: "lunes", name: "Otro", series_reps: "4×8" });
    expect(api.ex_library_list()).toHaveLength(1);
    expect(api.ex_library_list()[0]!.how_to).toBe("pasos");
  });

  it("ex_dict expone el origen de la copia", () => {
    const e = api.ex_save("", {
      day: "lunes",
      name: "Press",
      source: "bench-press",
      sourceFp: "abc",
    }) as { id: string };
    const got = api.ex_list().find((x) => x.id === e.id)! as Record<string, unknown>;
    expect(got.source).toBe("bench-press");
    expect(got.sourceFp).toBe("abc");
  });

  it("un ejercicio escrito a mano no tiene origen", () => {
    const e = api.ex_save("", { day: "lunes", name: "A mano" }) as { id: string };
    const got = api.ex_list().find((x) => x.id === e.id)! as Record<string, unknown>;
    expect(got.source).toBeFalsy();
    expect(got.sourceFp).toBeFalsy();
  });

  it("source y sourceFp sobreviven a una edición posterior", () => {
    const e = api.ex_save("", {
      day: "lunes",
      name: "Press",
      source: "bench-press",
      sourceFp: "abc",
    }) as { id: string };
    api.ex_save(e.id, { series_reps: "4×8" });
    const got = api.ex_list().find((x) => x.id === e.id)! as Record<string, unknown>;
    expect(got.source).toBe("bench-press");
    expect(got.sourceFp).toBe("abc");
    expect(got.series_reps).toBe("4×8");
  });

  it("renombrar una entrada no deja la anterior con lo mismo", () => {
  // Revisión, hallazgo crítico: sin saber qué entrada se está editando,
  // guardar un nombre nuevo creaba una segunda con los mismos pasos.
  api.ex_library_save({ name: "Bench Press", how_to: "mios" });
  const r = api.ex_library_save({ name: "Press banca", how_to: "mios", slug: "bench-press" });
  expect(r.entry.slug).toBe("bench-press");
  expect(api.ex_library_list()).toHaveLength(1);
  expect(api.ex_library_list()[0]!.name).toBe("Press banca");
});

it("renombrar una entrada propia conserva su slug", () => {
  const a = api.ex_library_save({ name: "Mi press" });
  const b = api.ex_library_save({ name: "Press pesado", slug: a.entry.slug });
  expect(b.entry.slug).toBe(a.entry.slug);
  expect(api.ex_library_list()).toHaveLength(1);
});

it("se puede deshacer una edición del catálogo borrando tu entrada", () => {
  // Revisión, hallazgo crítico: una edición del catálogo se guarda con el slug
  // del catálogo, así que un «solo quito mia-» la dejaba pegada para siempre.
  api.ex_library_save({ name: "Bench Press", how_to: "mío" });
  expect(api.ex_library_remove("bench-press")).toBe(true);
  expect(api.ex_library_list()).toEqual([]);
  // Y ahora manda el catálogo otra vez: guardar sin cambiar nada no deja
  // una entrada fantasma espejándolo.
  const r = api.ex_library_save({ name: "Bench Press" });
  expect(r.updatedFrom).toBe("bench-press");
  expect(api.ex_library_list()).toEqual([]);
});

it("borrar un slug que no está en tu fichero no hace nada", () => {
  expect(api.ex_library_remove("bench-press")).toBe(false);
  expect(api.ex_library_remove("mia-nada")).toBe(false);
});

it("actualizar desde la biblioteca no borra tus números", () => {
  // El aviso de copias desfasadas manda SOLO nombre, pasos y músculos. exFields
  // rellena con "" lo que no llega, así que si la edición se apoyara en sus
  // valores se llevaría por delante todo lo demás. Esto seMidió en el e2e: las
  // series desaparecían.
  const e = api.ex_save("", {
    day: "lunes",
    name: "Press banca",
    series_reps: "4×6",
    rest: "90 s",
    source: "mia-1",
    sourceFp: "vieja",
  }) as { id: string };
  api.ex_save(e.id, {
    name: "Press banca",
    how_to: "Pasos nuevos",
    sourceFp: "nueva",
  });
  const got = api.ex_list().find((x) => x.id === e.id)! as Record<string, unknown>;
  expect(got.series_reps).toBe("4×6");
  expect(got.rest).toBe("90 s");
  expect(got.day).toBe("lunes");
  expect(got.name).toBe("Press banca");
  expect(got.how_to).toBe("Pasos nuevos");
  expect(got.sourceFp).toBe("nueva");
  expect(got.source).toBe("mia-1");
});

it("editar sin mandar el nombre no lo borra", () => {
  // Revisión, hallazgo importante: ex_save，默认 «Ejercicio».
  const ex = api.ex_save("", { day: "lunes", name: "Press banca" }) as { id: string };
  api.ex_save(ex.id, { series_reps: "4×8" });
  const got = api.ex_list().find((x) => x.id === ex.id)!;
  expect(got.name).toBe("Press banca");
  expect(got.series_reps).toBe("4×8");
});

it("renombrar una entrada propia al nombre de una del catálogo no duplica", () => {
  // Revisión final, crítico: slugDelCatalogo solo se calculaba cuando no había
  // entrada propia, así que renombrar «Mi press» a «Bench Press» dejaba las dos.
  // El duplicado vive en la biblioteca mezclada, no en la lista del vault.
  const a = api.ex_library_save({ name: "Mi press", how_to: "pasos" });
  api.ex_library_save({ name: "Bench Press", how_to: "pasos", slug: a.entry.slug });
  expect(api.ex_library_list()).toHaveLength(1);
  expect(api.ex_library_list()[0]!.slug).toBe("bench-press");
});

it("ex_library_save dice si de verdad escribió algo", () => {
  // Guardar el nombre de un ejercicio del catálogo sin cambiar ningún campo no
  // escribe nada, y tampoco debe decir que sí.
  const r = api.ex_library_save({ name: "Bench Press" });
  expect(r.wrote).toBe(false);
  expect(api.ex_library_list()).toEqual([]);
  // Con un cambio real, sí escribe.
  expect(api.ex_library_save({ name: "Bench Press", how_to: "mío" }).wrote).toBe(true);
});

it("ex_overview counts the year it was asked for, not always this one", () => {
    seedWeek();
    const year = new Date().getFullYear();
    const past = year - 1;
    // A Monday of the previous year, which the seeded routine covers.
    const monday = `${past}-01-05`;
    const day = api.ex_days(monday, monday)[0]!;
    const exs = day.exercises as Array<{ id: string }>;
    expect(exs.length).toBeGreaterThan(0);
    api.ex_mark(monday, exs[0]!.id, true, 0, 0, "");

    const old = api.ex_overview(past);
    const hits = old.breakdown.flatMap((b) => b.rows).filter((r) => r.done > 0);
    expect(hits.length).toBeGreaterThan(0);
    expect(old.grid[monday]).toBeGreaterThan(0);

    const current = api.ex_overview(year);
    expect(current.breakdown.flatMap((b) => b.rows).every((r) => r.done === 0)).toBe(true);
  });
});
