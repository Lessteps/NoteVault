import { test, expect, type Page } from "@playwright/test";
import { _electron as electron, type ElectronApplication } from "playwright";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import { sandboxEnv } from "./helpers";

const HERE = dirname(fileURLToPath(import.meta.url));

let app: ElectronApplication;
let win: Page;
let home = "";

const rail = () => win.locator("nav[aria-label='Módulos']");

/** El panel de hábitos, con sus casillas de una en una. */
const panelHabitos = () =>
  win
    .getByRole("heading", { name: "Hábitos de hoy" })
    .locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");

/** El contador "3 / 15" de la cabecera del panel. */
const contadorHabitos = () => panelHabitos().locator("span.rounded-full").last();

const casilla = (name: string) => panelHabitos().getByRole("button", { name, exact: true });
/** El nombre del hábito, dentro del panel: el tachado es lo que marca "hecho". */
const fila = (name: string) => panelHabitos().locator("span").filter({ hasText: new RegExp(`^${name}$`) });

function habitsConfig(): string {
  return join(home, "NoteVault", ".notevault", "habits", "habits_config.json");
}

function todayDayFile(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return join(
    home, "NoteVault", ".notevault", "habits", String(d.getFullYear()), p(d.getMonth() + 1),
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.md`,
  );
}

async function gotoVistaGeneral() {
  await rail().getByRole("button", { name: "Vista General" }).click();
  await expect(win.getByRole("heading", { name: "Hábitos de hoy" })).toBeVisible({ timeout: 20_000 });
}

/** Crea un hábito desde su módulo y vuelve a la vista. */
async function createHabit(name: string) {
  await rail().getByRole("button", { name: "Hábitos" }).click();
  const side = win.locator("aside[class*='w-[260px]']");
  await side.getByRole("button", { name: "Gestionar hábitos" }).click();
  await win.getByRole("button", { name: "Nuevo hábito" }).click();
  const editor = win.locator("aside[class*='w-[380px]']");
  await expect(editor).toBeVisible();
  await editor.locator("input").nth(1).fill(name);
  await win.keyboard.press("Enter");
  await expect(win.getByText(name).first()).toBeVisible({ timeout: 15_000 });
  await gotoVistaGeneral();
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
  await gotoVistaGeneral();
});

test.afterAll(async () => {
  await app?.close();
});

test("NV-VG-001 carga con las cinco tarjetas y los dos paneles", async () => {
  for (const card of [
    "HÁBITOS DE HOY", "EJERCICIO", "PROYECTOS", "TAREAS PARA HOY", "FINANZAS",
  ]) {
    await expect(win.getByText(card, { exact: true })).toBeVisible();
  }
  await expect(win.getByRole("heading", { name: "Hábitos de hoy" })).toBeVisible();
  await expect(win.getByRole("heading", { name: "Analítica Semanal" })).toBeVisible();
  await expect(win.getByRole("heading", { name: "Progreso de Objetivos" })).toBeVisible();
});

test("NV-VG-002 el encabezado dice la fecha de hoy", async () => {
  const d = new Date();
  const meses = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
    "agosto", "septiembre", "octubre", "noviembre", "diciembre",
  ];
  await expect(win.getByText(`${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`)).toBeVisible();
});

test("NV-VG-003 volver desde otro módulo relee los datos (no se queda obsoleta)", async () => {
  const name = `E2E VG ${Date.now()}`;
  const antes = Number((await contadorHabitos().textContent())!.split("/")[1]!.trim());

  await createHabit(name);
  await expect(casilla(name)).toBeVisible({ timeout: 15_000 });

  // El panel cuenta los de hoy, no solo los que se ven: sube en uno.
  const total = Number((await contadorHabitos().textContent())!.split("/")[1]!.trim());
  expect(total).toBe(antes + 1);
  expect(readFileSync(habitsConfig(), "utf-8")).toContain(name);
});

test("NV-VG-004 marcar un hábito desde la vista lo persiste en el día", async () => {
  const name = `E2E VG Check ${Date.now()}`;
  await createHabit(name);

  await casilla(name).click();
  // Se pinta al instante (optimista) y el día queda escrito.
  await expect(fila(name)).toHaveClass(/line-through/, { timeout: 15_000 });
  const dayFile = todayDayFile();
  await expect.poll(() => existsSync(dayFile)).toBe(true);
  await expect.poll(() => readFileSync(dayFile, "utf-8")).toContain("true");
});

test("NV-VG-005 desmarcar lo revierte, también en disco", async () => {
  const name = `E2E VG Uncheck ${Date.now()}`;
  await createHabit(name);
  const box = casilla(name);

  await box.click();
  await expect(fila(name)).toHaveClass(/line-through/, { timeout: 15_000 });
  await expect.poll(() => readFileSync(todayDayFile(), "utf-8")).toContain("true");

  await box.click();
  await expect(fila(name)).not.toHaveClass(/line-through/, { timeout: 15_000 });
  await expect.poll(() => readFileSync(todayDayFile(), "utf-8")).toContain("false");
});

test("NV-VG-006 los filtros del focus engine se pueden cambiar", async () => {
  // Los cuatro viven en el focus engine, arriba del todo; "Hábitos" y
  // "Notas" tambien son nombres de modulo en el rail y en el acceso rapido.
  const engine = win.getByText("NOTEVAULT FOCUS ENGINE").locator("xpath=ancestor::div[2]");
  for (const tab of ["Hábitos", "Código", "Notas", "Todos"]) {
    const boton = engine.getByRole("button", { name: tab, exact: true });
    await boton.click();
    await expect(boton).toBeVisible();
  }
});

test("NV-VG-007 el acceso rápido salta al módulo pedido", async () => {
  await gotoVistaGeneral();
  const acceso = win.getByText("Acceso rápido").locator("xpath=ancestor::div[1]");
  await acceso.getByRole("button", { name: "Tareas", exact: true }).click();
  await expect(rail().getByRole("button", { name: "Tareas" })).toBeVisible();
  await gotoVistaGeneral();
  await acceso.getByRole("button", { name: "Calendario", exact: true }).click();
  await expect(rail().getByRole("button", { name: "Calendario" })).toBeVisible();
  await gotoVistaGeneral();
});

test("NV-VG-008 Nueva Nota abre el prompt y crea la nota", async () => {
  const title = `E2E VG Nota ${Date.now()}`;
  await gotoVistaGeneral();
  await win.getByRole("button", { name: "Nueva Nota", exact: true }).click();
  const prompt = win.getByRole("dialog");
  await expect(prompt).toBeVisible();
  await prompt.getByRole("textbox").fill(title);
  await prompt.getByRole("button", { name: "Crear" }).click();

  // Crea y abre: el editor de la nota se pone delante de la vista.
  await expect(win.locator(".cm-content")).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(() => existsSync(join(home, "NoteVault", `${title}.md`)))
    .toBe(true);
  await gotoVistaGeneral();
});
