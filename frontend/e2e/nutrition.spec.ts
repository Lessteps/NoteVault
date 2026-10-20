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

  // Cambiar a pestaña Carga Manual
  await win.getByTestId("tab-modal-manual").click();

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

test("NV-NUTRI-006 recetas y platos compuestos: crear plato y consumirlo desde turnos de comida", async () => {
  // 1. Ir a pestaña Despensa y cambiar a la sub-pestaña Recetas
  await win.getByTestId("tab-alimentos").click();
  await expect(win.getByTestId("food-library-view")).toBeVisible({ timeout: 5_000 });
  await win.getByTestId("subtab-recipes").click();
  await expect(win.getByTestId("new-recipe-btn")).toBeVisible();

  // 2. Abrir modal de nueva receta
  await win.getByTestId("new-recipe-btn").click();
  await expect(win.getByTestId("recipe-modal")).toBeVisible();

  const recipeName = `E2E Ensalada Cesar ${Date.now()}`;
  await win.getByTestId("input-recipe-name").fill(recipeName);
  await win.getByTestId("input-recipe-servings").fill("2");

  // 3. Agregar un ingrediente desde la despensa
  await win.getByTestId("add-ingredient-btn").click();
  await expect(win.getByTestId("add-ingredient-panel")).toBeVisible();

  // Seleccionar el primer alimento disponible en la lista
  const firstFoodBtn = win.getByTestId(/^select-food-/).first();
  await expect(firstFoodBtn).toBeVisible();
  await firstFoodBtn.click();
  await win.getByTestId("confirm-add-ingredient-btn").click();

  // Verificar que el ingrediente aparezca en la lista del modal
  await expect(win.getByTestId("recipe-ingredient-row-0")).toBeVisible();

  // Guardar la receta
  await win.getByTestId("save-recipe-btn").click();
  await expect(win.getByText(recipeName)).toBeVisible({ timeout: 10_000 });

  // 4. Ir a Diario y agregar la receta a la Cena mediante AddFoodDialog
  await win.getByTestId("tab-diario").click();
  const cenaSec = win.getByTestId("meal-section-cena");
  await expect(cenaSec).toBeVisible();
  await cenaSec.getByTestId("add-food-btn-cena").click();

  // Cambiar a la pestaña de "Mis Recetas" dentro del diálogo
  await win.getByTestId("tab-modal-recipes").click();
  await expect(win.getByTestId("modal-recipes-container")).toBeVisible();

  // Seleccionar la receta recién creada
  const recipeItem = win.locator("button").filter({ hasText: recipeName }).first();
  await expect(recipeItem).toBeVisible();
  await recipeItem.click();

  // Confirmar agregado a Cena
  await win.getByTestId("confirm-add-recipe-to-meal-btn").click();

  // Verificar que aparezca en Cena y se persista
  await expect(cenaSec.getByText(recipeName)).toBeVisible({ timeout: 10_000 });

  // Verificar archivo en disco
  const recipesFile = join(home, "NoteVault", ".notevault", "alimentacion", "recetas.json");
  expect(existsSync(recipesFile)).toBe(true);
  const data = JSON.parse(readFileSync(recipesFile, "utf-8"));
  expect(data.recipes.some((r: any) => r.name === recipeName)).toBe(true);
});

test("NV-NUTRI-007 estimador inteligente de platos por IA en AddFoodDialog", async () => {
  await win.getByTestId("tab-diario").click();
  const almuerzoSec = win.getByTestId("meal-section-almuerzo");
  await expect(almuerzoSec).toBeVisible();

  // Abrir diálogo de agregar comida
  await almuerzoSec.getByTestId("add-food-btn-almuerzo").click();

  // Cambiar a pestaña "Estimar con IA"
  await win.getByTestId("tab-modal-ai").click();
  await expect(win.getByTestId("ai-estimator-container")).toBeVisible();
  await expect(win.getByTestId("input-ai-prompt")).toBeVisible();
  await expect(win.getByTestId("run-estimate-btn")).toBeVisible();
  await win.keyboard.press("Escape");
});

test("NV-NUTRI-008 exportación de reporte nutricional y timing por turnos", async () => {
  // 1. Verificar timing por turnos en Ajustes
  await win.getByTestId("open-settings-btn").click();
  await expect(win.getByTestId("nutrition-settings-dialog")).toBeVisible();
  await expect(win.getByTestId("meal-distribution-container")).toBeVisible();
  await expect(win.getByTestId("input-dist-almuerzo")).toBeVisible();
  await win.getByTestId("save-targets-btn").click();

  // 2. Ir a Tendencias y abrir Exportación
  await win.getByTestId("tab-tendencias").click();
  await expect(win.getByTestId("nutrition-trends-view")).toBeVisible();
  await win.getByTestId("open-export-btn").click();

  // 3. Validar diálogo de exportación
  await expect(win.getByTestId("export-nutrition-dialog")).toBeVisible();
  await expect(win.getByTestId("export-md-btn")).toBeVisible();
  await expect(win.getByTestId("export-csv-btn")).toBeVisible();
  await expect(win.getByTestId("export-vault-note-btn")).toBeVisible();

  // Guardar en el Vault como nota .md
  await win.getByTestId("export-vault-note-btn").click();
  await expect(win.getByText("¡Guardado!")).toBeVisible({ timeout: 5_000 });
  await win.keyboard.press("Escape");
});

test("NV-NUTRI-009 escáner de etiquetas nutricionales por visión IA en Despensa", async () => {
  await win.getByTestId("tab-alimentos").click();
  await expect(win.getByTestId("food-library-view")).toBeVisible();
  await win.getByTestId("subtab-foods").click();

  // Abrir modal de escáner
  const openScannerBtn = win.getByTestId("open-label-scanner-btn");
  await expect(openScannerBtn).toBeVisible();
  await openScannerBtn.click();

  // Verificar modal y zona de captura de imagen
  await expect(win.getByTestId("nutrition-label-scanner-modal")).toBeVisible();
  await expect(win.getByTestId("scanner-dropzone")).toBeVisible();
  await expect(win.getByTestId("scanner-file-input")).toBeAttached();

  // Cerrar modal
  await win.getByTestId("close-scanner-btn").click();
  await expect(win.getByTestId("nutrition-label-scanner-modal")).not.toBeVisible();
});
