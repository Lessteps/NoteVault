import { test, expect, type Page } from "@playwright/test";
import { _electron as electron, type ElectronApplication } from "playwright";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { sandboxEnv } from "./helpers";

const HERE = dirname(fileURLToPath(import.meta.url));

let app: ElectronApplication;
let win: Page;
let home = "";

function exerciseDir(): string {
  return join(home, "NoteVault", ".notevault", "ejercicio");
}

function routinesFile(): string {
  return join(exerciseDir(), "exercises.json");
}

function libraryFile(): string {
  return join(exerciseDir(), "biblioteca.json");
}

const side = () => win.locator("aside[class*='w-[260px]']");

const DAY_KEYS = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"] as const;

function todayKey(): string {
  return DAY_KEYS[(new Date().getDay() + 6) % 7]!;
}

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function logFile(iso: string): string {
  const [y, m] = iso.split("-");
  return join(exerciseDir(), y!, m!, `${iso}.json`);
}

type RoutineRow = Record<string, unknown>;

function seedRoutine(rows: RoutineRow[]): void {
  mkdirSync(exerciseDir(), { recursive: true });
  writeFileSync(routinesFile(), JSON.stringify(rows, null, 2), "utf-8");
}

function seedLibrary(entries: Array<Record<string, unknown>>): void {
  mkdirSync(exerciseDir(), { recursive: true });
  writeFileSync(libraryFile(), JSON.stringify({ entries }, null, 2), "utf-8");
}

function routineRow(over: RoutineRow): RoutineRow {
  return {
    id: "e1",
    day: "lunes",
    name: "Ejercicio",
    video: "",
    video_path: "",
    series_reps: "",
    rest: "",
    how_to: "",
    muscles: { primary: [], secondary: [] },
    source: "",
    sourceFp: "",
    ...over,
  };
}

function readRoutine(): RoutineRow[] {
  return JSON.parse(readFileSync(routinesFile(), "utf-8")) as RoutineRow[];
}

async function reloadToProgram(): Promise<void> {
  await win.reload();
  await win.waitForSelector("nav[aria-label='Módulos']", { timeout: 30_000 });
  await win.locator("nav[aria-label='Módulos']").getByRole("button", { name: "Ejercicio" }).click();
  await side().getByRole("button", { name: "Ejercicios" }).click();
  // La pestaña se recuerda entre visitas: se fuerza Tu programa.
  await win.getByRole("tab", { name: "Tu programa" }).click();
  await expect(win.getByRole("heading", { name: "Tu programa" })).toBeVisible({ timeout: 15_000 });
}

test.beforeAll(async () => {
  const env = sandboxEnv();
  home = env.NV_E2E_HOME;
  app = await electron.launch({
    args: [".", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
    cwd: join(HERE, ".."),
    env,
  });
  win = await app.firstWindow();
  await win.waitForSelector("nav[aria-label='Módulos']", { timeout: 30_000 });
});

test.afterAll(async () => {
  await app?.close();
});

test("NV-X-016 una copia antigua sin origen propone vincularse", async () => {
  seedLibrary([
    {
      slug: "mia-huerfana1",
      name: "Sentadilla Huerfana",
      equipment: "",
      muscles: { primary: ["quads"], secondary: [] },
      how_to: "Baja y sube",
    },
  ]);
  seedRoutine([routineRow({ id: "e-huerfana", name: "Sentadilla Huerfana" })]);
  await reloadToProgram();
  const banner = win.locator("[data-orphan-banner]");
  await expect(banner).toBeVisible({ timeout: 15_000 });
  await win.locator("[data-orphan-link]").click();
  await expect.poll(() => readRoutine().find((e) => e.id === "e-huerfana")?.source).toBe("mia-huerfana1");
  await expect(banner).toHaveCount(0, { timeout: 15_000 });
});

test("NV-X-017 un ejercicio propio con video lo muestra y lo hereda", async () => {
  const videos = join(exerciseDir(), "videos");
  mkdirSync(videos, { recursive: true });
  const clip = join(videos, "propio.mp4");
  writeFileSync(clip, Buffer.alloc(1024));
  seedLibrary([
    {
      slug: "mia-video1",
      name: "Peso Muerto Con Video",
      equipment: "Barra",
      muscles: { primary: ["hamstrings"], secondary: [] },
      how_to: "Sube la barra",
      video_path: clip,
    },
  ]);
  seedRoutine([]);
  await reloadToProgram();
  await win.getByRole("tab", { name: "Biblioteca" }).click();
  await win.locator('[data-slug="mia-video1"]').click();
  const detail = win.locator("[data-library-detail]");
  await expect(detail.locator("[data-library-video]")).toBeVisible({ timeout: 15_000 });
  await win.locator('[data-library-add="mia-video1"]').click();
  await expect.poll(() =>
    readRoutine().find((e) => e.name === "Peso Muerto Con Video")?.video_path,
  ).toBe(clip);
});

test("NV-X-018 el descanso abre un temporizador con los segundos del texto", async () => {
  seedLibrary([]);
  seedRoutine([
    routineRow({ id: "e-timer1", day: todayKey(), name: "Plancha Temporizador", rest: "90s" }),
  ]);
  await win.reload();
  await win.waitForSelector("nav[aria-label='Módulos']", { timeout: 30_000 });
  await win.locator("nav[aria-label='Módulos']").getByRole("button", { name: "Ejercicio" }).click();
  await side().getByRole("button", { name: "Vista general" }).click();
  await expect(win.locator("[data-session-date]")).toBeVisible({ timeout: 15_000 });
  await win.locator("[data-rest-timer]").first().click();
  const countdown = win.locator("[data-rest-countdown]").first();
  await expect(countdown).toBeVisible({ timeout: 15_000 });
  await expect(countdown.locator("[data-rest-remaining]")).toContainText("01:30");
});

test("NV-X-019 el historial muestra sesiones y PR", async () => {
  seedLibrary([]);
  seedRoutine([
    routineRow({ id: "e-hist1", day: todayKey(), name: "Press Historial", series_reps: "4×8" }),
  ]);
  const iso = isoDaysAgo(7);
  mkdirSync(dirname(logFile(iso)), { recursive: true });
  writeFileSync(
    logFile(iso),
    JSON.stringify({ "e-hist1": { done: true, weight: 60, reps: 8, notes: "" } }, null, 2),
    "utf-8",
  );
  await reloadToProgram();
  await win.locator('[data-routine-exercise="e-hist1"] [title="Historial"]').click();
  const panel = win.locator("[data-history-panel]");
  await expect(panel).toBeVisible({ timeout: 15_000 });
  await expect(panel.locator("[data-history-pr]")).toContainText("76");
  await expect(panel.locator("[data-history-row]")).toHaveCount(1);
});

test("NV-X-020 duplicar día y mover ejercicio", async () => {
  seedLibrary([]);
  const base = (id: string, name: string): RoutineRow =>
    routineRow({ id, day: "lunes", name, series_reps: "4×8", source: "bench-press", sourceFp: "x" });
  seedRoutine([base("e-dup1", "Remo Duplicado A"), base("e-dup2", "Remo Duplicado B")]);
  await reloadToProgram();
  await win.locator('[data-duplicate-day="lunes"]').click();
  await win.locator("[data-duplicate-target]").selectOption("martes");
  await win.locator("[data-duplicate-confirm]").click();
  await expect.poll(() => readRoutine().filter((e) => e.day === "martes").length).toBe(2);
  const martes = readRoutine().filter((e) => e.day === "martes");
  expect(martes.every((e) => e.source === "bench-press")).toBe(true);
  expect(readRoutine()).toHaveLength(4);
  await win.locator('[data-move-exercise="e-dup1"]').click();
  await win.locator('[data-move-target="e-dup1"]').selectOption("miercoles");
  await win.locator('[data-move-confirm="e-dup1"]').click();
  await expect.poll(() => readRoutine().find((e) => e.id === "e-dup1")?.day).toBe("miercoles");
  expect(readRoutine().find((e) => e.id === "e-dup1")?.series_reps).toBe("4×8");
});

test("NV-X-021 con auto-sync las copias se actualizan solas", async () => {
  seedLibrary([
    {
      slug: "mia-auto1",
      name: "Press Auto",
      equipment: "",
      muscles: { primary: ["pectoral"], secondary: [] },
      how_to: "Pasos nuevos",
    },
  ]);
  seedRoutine([
    routineRow({ id: "e-auto1", name: "Press Auto Viejo", source: "mia-auto1", sourceFp: "vieja" }),
  ]);
  await reloadToProgram();
  await win.locator("[data-sync-auto]").check();
  await expect.poll(() => readRoutine().find((e) => e.id === "e-auto1")?.sourceFp).not.toBe("vieja");
  await expect(win.locator("[data-stale-banner]")).toHaveCount(0, { timeout: 15_000 });
  expect(existsSync(routinesFile())).toBe(true);
  // Limpieza: desmarcar auto-sync para no contaminar tests siguientes
  await win.locator("[data-sync-auto]").uncheck();
});
