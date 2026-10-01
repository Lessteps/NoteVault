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
    win.getByText("Añádelos en «Gestionar ejercicios»").or(win.getByTitle("Mapa muscular del día")),
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

test("NV-X-001 la rutina por defecto existe en exercises.json", async () => {
  await side().getByRole("button", { name: "Gestionar ejercicios" }).click();
  await expect(win.getByRole("heading", { name: "Gestionar ejercicios" })).toBeVisible({
    timeout: 15_000,
  });
  await expect.poll(() => existsSync(routinesFile())).toBe(true);
  const routine = JSON.parse(readFileSync(routinesFile(), "utf-8")) as Array<{ name: string }>;
  expect(routine.length).toBeGreaterThan(0);
  // Toda rutina termina con estiramientos (regla de exercises.json).
  expect(routine[routine.length - 1]!.name.startsWith("Estiramientos")).toBe(true);
});

test("NV-X-002 marcar un ejercicio persiste en el dia", async () => {
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

  // Semanal, mensual y anual viven ya dentro de Progreso.
  await side().getByRole("button", { name: "Progreso" }).click();
  await expect(win.getByRole("heading", { name: "Progreso" })).toBeVisible({ timeout: 15_000 });
  for (const period of ["Mes", "Año", "Semana"]) {
    await win.getByRole("tab", { name: period }).click();
    await expect(win.getByRole("tab", { name: period })).toHaveAttribute("aria-selected", "true", {
      timeout: 15_000,
    });
  }
});

test("NV-X-004 el mapa muscular del dia se abre y se cierra", async () => {
  await gotoDiaria();
  await win.getByTitle("Mapa muscular del día").click();
  await expect(win.getByRole("dialog")).toBeVisible({ timeout: 15_000 });
  await win.keyboard.press("Escape");
  await expect(win.getByRole("dialog")).toHaveCount(0, { timeout: 15_000 });
});
