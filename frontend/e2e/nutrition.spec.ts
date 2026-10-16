import { test, expect, type Page } from "@playwright/test";
import { _electron as electron, type ElectronApplication } from "playwright";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync } from "node:fs";
import { sandboxEnv } from "./helpers";

const HERE = dirname(fileURLToPath(import.meta.url));

let app: ElectronApplication;
let win: Page;
let home = "";

function todayNutritionFile(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const iso = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  return join(
    home,
    "NoteVault",
    ".notevault",
    "alimentacion",
    String(d.getFullYear()),
    p(d.getMonth() + 1),
    `${iso}.json`,
  );
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
  await win.locator("nav[aria-label='Módulos']").getByRole("button", { name: "Alimentación" }).click();
  await expect(win.getByRole("heading", { name: "Alimentación" })).toBeVisible({ timeout: 15_000 });
});

test.afterAll(async () => {
  await app?.close();
});

test("NV-NUTRI-001 navegación y carga del módulo de Alimentación", async () => {
  await expect(win.getByTestId("nutrition-module")).toBeVisible({ timeout: 10_000 });
  await expect(win.getByTestId("tab-diario")).toBeVisible();
  await expect(win.getByTestId("tab-tendencias")).toBeVisible();
  await expect(win.getByTestId("tab-alimentos")).toBeVisible();
  await expect(win.getByTestId("tab-perfil")).toBeVisible();
  await expect(win.getByTestId("macro-cards")).toBeVisible();
});

test("NV-NUTRI-002 registrar alimento manual en Desayuno actualiza macros y persiste en disco", async () => {
  await win.getByTestId("tab-diario").click();
  const mealSec = win.getByTestId("meal-section-desayuno");
  await expect(mealSec).toBeVisible();

  // Abrir diálogo de agregar alimento
  await mealSec.getByTestId("add-food-btn-desayuno").click();
  await expect(win.getByText("Añadir alimento a Desayuno")).toBeVisible({ timeout: 5_000 });

  // Cambiar a pestaña Carga Rápida / Manual
  await win.getByRole("button", { name: /Carga Rápida/ }).click();

  const foodName = `E2E Avena con Banana ${Date.now()}`;
  await win.getByPlaceholder("Ej. Pechuga con arroz y palta").fill(foodName);
  await win.getByPlaceholder("0").first().fill("350"); // Calorías

  // Guardar alimento
  await win.getByRole("button", { name: "Agregar a Desayuno" }).click();

  // Verificar que aparezca en la lista de desayuno
  await expect(mealSec.getByText(foodName)).toBeVisible({ timeout: 10_000 });

  // Verificar persistencia en disco
  const file = todayNutritionFile();
  expect(existsSync(file)).toBe(true);
  const content = readFileSync(file, "utf-8");
  expect(content).toContain(foodName);
  expect(content).toContain("350");
});

test("NV-NUTRI-003 gestión de despensa: agregar alimento habitual y consumirlo", async () => {
  // Ir a pestaña Despensa
  await win.getByTestId("tab-alimentos").click();
  await expect(win.getByTestId("food-library-view")).toBeVisible({ timeout: 5_000 });

  // Abrir modal de nuevo alimento
  await win.getByTestId("new-food-btn").click();
  await expect(win.getByText("Nuevo alimento para tu despensa")).toBeVisible();

  const pantryFood = `E2E Proteina Whey ${Date.now()}`;
  await win.getByPlaceholder("Ej. Pechuga de pavo").fill(pantryFood);
  await win.getByRole("button", { name: "Añadir a mi despensa" }).click();

  // Verificar que aparezca en la despensa
  await expect(win.getByText(pantryFood)).toBeVisible({ timeout: 10_000 });

  // Consumir rápido en Almuerzo: buscar el botón Consumir correspondiente
  const card = win.getByTestId(/^library-card-/).filter({ hasText: pantryFood }).first();
  await expect(card).toBeVisible();
  const consumeBtn = card.getByRole("button", { name: /Consumir/ });
  await consumeBtn.click();

  // Elegir Almuerzo en el menú contextual emergente
  await expect(win.locator("[role='menu']")).toBeVisible({ timeout: 5_000 });
  await win.getByRole("menuitem", { name: /Registrar en Almuerzo/ }).click();

  // Volver al Diario y verificar que esté en Almuerzo
  await win.getByTestId("tab-diario").click();
  const almuerzoSec = win.getByTestId("meal-section-almuerzo");
  await expect(almuerzoSec.getByText(pantryFood)).toBeVisible({ timeout: 10_000 });
});

test("NV-NUTRI-004 configuración de Perfil Nutricional con restricciones condicionales", async () => {
  await win.getByTestId("tab-perfil").click();
  await expect(win.getByTestId("nutri-profile-view")).toBeVisible({ timeout: 5_000 });
  await expect(win.getByText("Perfil del Usuario y Preferencias")).toBeVisible();

  // Cargar peso
  await win.getByTestId("input-weight").fill("78.5");

  // Toggle de restricciones condicionales
  const toggle = win.getByTestId("toggle-restrictions");
  const isChecked = await toggle.isChecked();
  if (!isChecked) {
    await toggle.check();
  }

  // Escribir restricción
  const commentArea = win.getByTestId("input-dietary-restrictions");
  await expect(commentArea).toBeVisible();
  await commentArea.fill("Intolerancia severa a la lactosa y mariscos");

  // Guardar perfil
  await win.getByTestId("save-profile-btn").click();
  await expect(win.getByText(/Perfil guardado con éxito/)).toBeVisible({ timeout: 5_000 });

  // Verificar que el archivo de perfil en disco contenga los datos
  const profileFile = join(home, "NoteVault", ".notevault", "alimentacion", "perfil.json");
  expect(existsSync(profileFile)).toBe(true);
  const data = JSON.parse(readFileSync(profileFile, "utf-8"));
  expect(data.weight).toBe(78.5);
  expect(data.dietary_restrictions).toContain("lactosa");
});

test("NV-NUTRI-005 vista de Analítica de Tendencias Semanales", async () => {
  await win.getByTestId("tab-tendencias").click();
  await expect(win.getByTestId("nutrition-trends-view")).toBeVisible({ timeout: 10_000 });
  await expect(win.getByText("Analítica de Adherencia y Tendencias")).toBeVisible();
  await expect(win.getByText("Promedio Calórico")).toBeVisible();
  await expect(win.getByText("Adherencia", { exact: true })).toBeVisible();
  await expect(win.getByTestId("range-btn-7")).toBeVisible();
  await expect(win.getByTestId("range-btn-14")).toBeVisible();
});
