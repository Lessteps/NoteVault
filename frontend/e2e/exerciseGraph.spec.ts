// La gráfica de Progreso contra la app real: se marca un ejercicio con reps y
// se comprueba que aparece una línea. Cierra el hueco que los tests de jsdom no
// cubren — el backend real, su rango de fechas y el SVG en pantalla.

import { test, expect, type Page } from "@playwright/test";
import { _electron as electron, type ElectronApplication } from "playwright";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { sandboxEnv } from "./helpers";

const HERE = dirname(fileURLToPath(import.meta.url));

let app: ElectronApplication;
let win: Page;
let home = "";

const side = () => win.locator("aside[class*='w-[260px]']");

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
  await expect(side().getByRole("button", { name: "Progreso" })).toBeVisible({ timeout: 15_000 });
});

test.afterAll(async () => {
  await app?.close();
});

/**
 * El programa nace vacío, así que hay que montarlo: añade un ejercicio de la
 * biblioteca al día indicado. Usa el buscador del formulario del programa,
 * que deja elegir el día (la pestaña Biblioteca, en cambio, siempre mete el día
 * de hoy).
 */
async function addExerciseForDay(dayKey: string, query: string): Promise<void> {
  await side().getByRole("button", { name: "Ejercicios" }).click();
  await win.locator('[data-exercises-tab="programa"]').click();
  const search = win.locator('input[aria-label="Buscar en la biblioteca"]');
  await expect(search).toBeVisible({ timeout: 15_000 });
  await search.fill(query);
  const pick = win.locator("[data-library-pick]").first();
  await expect(pick).toBeVisible({ timeout: 15_000 });
  await pick.click();
  await win.locator('select[aria-label="Día"]').selectOption(dayKey);
  await win.getByRole("button", { name: "Guardar ejercicio" }).click();
  await expect(search).toBeVisible({ timeout: 15_000 });
}

test("NV-X-010 la gráfica dibuja líneas cuando hay reps registradas", async () => {
  // La rutina se monta a mano: el programa arranca vacío. Se necesitan dos
  // días con ejercicios —hoy y hace dos— porque un solo punto no dibuja un
  // `path`.
  const d = new Date();
  const keys = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
  const todayKey = keys[d.getDay() === 0 ? 0 : d.getDay()]!;
  const back = new Date(d);
  back.setDate(back.getDate() - 2);
  const backKey = keys[back.getDay() === 0 ? 0 : back.getDay()]!;

  await addExerciseForDay(todayKey, "press");
  if (backKey !== todayKey) await addExerciseForDay(backKey, "curl");

  // 1. Marcar con reps desde la vista Diaria: la rejilla solo marca, el número
  //    hay que escribirlo.
  await side().getByRole("button", { name: "Diaria" }).click();
  const check = win.locator("input[type='checkbox'][aria-label^='Hecho:']").first();
  await expect(check).toBeVisible({ timeout: 15_000 });
  await check.click();
  await expect(check).toBeChecked({ timeout: 15_000 });

  const reps = win.locator("input[aria-label^='Reps:']").first();
  await expect(reps).toBeVisible({ timeout: 15_000 });
  await reps.fill("12");
  await reps.press("Enter");
  await expect(reps).toHaveValue("12", { timeout: 15_000 });

  // 2. La gráfica vive en Progreso → Músculos.
  await side().getByRole("button", { name: "Progreso" }).click();
  await win.locator('[data-progress-tab="musculos"]').click();

  const graph = win.locator("[data-progress-graph]");
  await expect(graph).toBeVisible({ timeout: 15_000 });

  // 3. Con dos días registrados tiene que haber líneas.
  await side().getByRole("button", { name: "Diaria" }).click();
  // "Anterior" también es el botón de vista del mapa; el de fecha es el primero.
  const nav = win.locator('button[aria-label="Anterior"]').first();
  await nav.click();
  await nav.click();
  const check2 = win.locator("input[type='checkbox'][aria-label^='Hecho:']").first();
  await expect(check2).toBeVisible({ timeout: 15_000 });
  await check2.click();
  const reps2 = win.locator("input[aria-label^='Reps:']").first();
  await reps2.fill("8");
  await reps2.press("Enter");
  await expect(reps2).toHaveValue("8", { timeout: 15_000 });

  await side().getByRole("button", { name: "Progreso" }).click();
  await win.locator('[data-progress-tab="musculos"]').click();
  const graph2 = win.locator("[data-progress-graph]");
  await expect(graph2).toBeVisible({ timeout: 15_000 });
  await expect(graph2.locator("path")).not.toHaveCount(0, { timeout: 15_000 });

  // 4. Y el resumen por grupo existe.
  expect(await graph.locator("[data-group-toggle]").count()).toBeGreaterThan(0);
  await expect(graph2.getByText(/días ·/).first()).toBeVisible();

  // 5. Apagar todos los grupos deja la gráfica sin líneas.
  const toggles = graph2.locator("[data-group-toggle]");
  const count = await toggles.count();
  for (let i = 0; i < count; i += 1) {
    await graph2.locator("[data-group-toggle]").nth(i).click();
  }
  await expect(graph2.locator("path")).toHaveCount(0);
});

test("NV-X-011 la pestaña Año no rompe con el límite de rango del backend", async () => {
  await side().getByRole("button", { name: "Progreso" }).click();
  const tab = win.locator('[data-progress-tab="musculos"]');
  await expect(tab).toBeVisible({ timeout: 15_000 });
  await tab.click();
  await expect(win.locator("[data-progress-graph]")).toBeVisible({ timeout: 15_000 });

  // ex_days rechaza rangos de más de 31 días; el Año son 365.
  await win.locator('[data-progress-tab="anio"]').click();
  await win.locator('[data-progress-tab="musculos"]').click();

  // Con el rango troceado no sale el toast de "Rango de fechas inválido" y la
  // gráfica sigue respondiendo.
  const error = win.locator("text=Rango de fechas inválido");
  await expect(error).toHaveCount(0, { timeout: 5_000 });
  await expect(win.locator("[data-progress-graph]")).toBeVisible();
  await expect(win.locator("[data-group-toggle]")).toHaveCount(6);
});