import { test, expect, type Page } from "@playwright/test";
import { _electron as electron, type ElectronApplication } from "playwright";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { sandboxEnv } from "./helpers";

const HERE = dirname(fileURLToPath(import.meta.url));

let app: ElectronApplication;
let win: Page;
let home = "";

function exerciseDir(): string {
  return join(home, "NoteVault", ".notevault", "ejercicio");
}

function todayDayFile(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const iso = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  return join(exerciseDir(), String(d.getFullYear()), p(d.getMonth() + 1), `${iso}.json`);
}

function routinesFile(): string {
  return join(exerciseDir(), "exercises.json");
}

const side = () => win.locator("aside[class*='w-[260px]']");

/**
 * Back to the daily view. The module remembers its last one, and today can be a
 * rest day (the default routine only fills Monday..Saturday), in which case the
 * header shows a different hint — the day list's own "no exercises" text is the
 * one thing every day has.
 */
async function gotoDiaria() {
  await side().getByRole("button", { name: "Diaria" }).click();
  await expect(
    win.getByText("Añádelos en «Ejercicios · Tu programa»").or(win.getByTitle("Mapa muscular del día")),
  ).toBeVisible({ timeout: 15_000 });
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
  await win.locator("nav[aria-label='Módulos']").getByRole("button", { name: "Ejercicio" }).click();
  await expect(side().getByRole("button", { name: "Diaria" })).toBeVisible({ timeout: 15_000 });
});

test.afterAll(async () => {
  await app?.close();
});

test("NV-X-001 el programa nace vacío y ofrece la biblioteca", async () => {
  await side().getByRole("button", { name: "Ejercicios" }).click();
  await expect(win.getByRole("heading", { name: "Ejercicios" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(win.getByRole("heading", { name: "Tu programa" })).toBeVisible({ timeout: 15_000 });
  // Ya no se siembran 50 ejercicios: el programa lo monta quien lo usa.
  await expect(win.getByText("Todavía no hay ejercicios")).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => existsSync(routinesFile())).toBe(true);
  const routine = JSON.parse(readFileSync(routinesFile(), "utf-8")) as unknown[];
  expect(Array.isArray(routine)).toBe(true);
  expect(routine.length).toBe(0);
});

/** Añade el primer ejercicio de la biblioteca al día de hoy. */
async function addFirstFromLibrary(): Promise<string> {
  await side().getByRole("button", { name: "Ejercicios" }).click();
  await win.getByRole("tab", { name: "Biblioteca" }).click();
  const row = win.locator("[data-slug]").first();
  const name = ((await row.locator("div").first().innerText()) ?? "").trim();
  await row.locator("[data-library-add]").click();
  await expect(row.locator("[data-library-add]")).toHaveAttribute("data-library-added", "true", {
    timeout: 15_000,
  });
  return name;
}

test("NV-X-002 marcar un ejercicio persiste en el dia", async () => {
  // Con el programa vacío no hay casillas que marcar: primero se añade uno.
  await addFirstFromLibrary();
  await gotoDiaria();
  const check = win.locator("input[type='checkbox'][aria-label^='Hecho:']").first();
  await expect(check).toBeVisible({ timeout: 15_000 });
  await check.click();
  await expect(check).toBeChecked({ timeout: 15_000 });
  const file = todayDayFile();
  await expect.poll(() => existsSync(file)).toBe(true);
  await expect.poll(() => readFileSync(file, "utf-8")).toContain("true");
  // Solo ese dia existe: el modulo no escribe la semana entera.
  const p = String(new Date().getMonth() + 1).padStart(2, "0");
  expect(readdirSync(join(exerciseDir(), String(new Date().getFullYear()), p)).length).toBe(1);
});

test("NV-X-003 la vista general y el progreso cambian el panel", async () => {
  await side().getByRole("button", { name: "Vista general" }).click();
  await expect(win.getByRole("heading", { name: "Vista general" })).toBeVisible({ timeout: 15_000 });

  // Las rejillas, el mapa y la gráfica viven dentro de Progreso.
  await side().getByRole("button", { name: "Progreso" }).click();
  await expect(win.getByRole("heading", { name: "Progreso" })).toBeVisible({ timeout: 15_000 });

  await expect(win.getByRole("tab", { name: "Rejilla" })).toHaveCount(1);
  await win.getByRole("tab", { name: "Músculos" }).click();
  await expect(win.getByRole("tab", { name: "Músculos" })).toHaveAttribute(
    "aria-selected",
    "true",
    { timeout: 15_000 },
  );
  await expect(win.getByRole("tab", { name: "Gráfica" })).toBeVisible({ timeout: 15_000 });
});

test("NV-X-004 el mapa muscular del dia se abre y se cierra", async () => {
  await gotoDiaria();
  await win.getByTitle("Mapa muscular del día").click();
  await expect(win.getByRole("dialog")).toBeVisible({ timeout: 15_000 });
  await win.keyboard.press("Escape");
  await expect(win.getByRole("dialog")).toHaveCount(0, { timeout: 15_000 });
});
