import { test, expect, type Page } from "@playwright/test";
import { _electron as electron, type ElectronApplication } from "playwright";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { sandboxEnv } from "./helpers";

const HERE = dirname(fileURLToPath(import.meta.url));

let app: ElectronApplication;
let win: Page;
let home = "";

function taskFiles(): string[] {
  const dir = join(home, "NoteVault", ".notevault", "tareas");
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".md")).map((f) => join(dir, f));
}

function fileWithText(files: string[], text: string): string | null {
  for (const f of files) {
    if (readFileSync(f, "utf-8").includes(text)) return f;
  }
  return null;
}

const sidebar = () => win.locator("aside[class*='w-[260px]']");
const taskRow = (name: string) => win.locator("div[class*='group/row']", { hasText: name });

async function createTask(name: string) {
  await win.getByRole("button", { name: "Nueva tarea" }).click();
  const drawer = win.locator("aside[class*='w-[400px]']");
  await expect(drawer).toBeVisible();
  await drawer.locator("input").first().fill(name);
  await win.keyboard.press("Enter");
  await expect(taskRow(name)).toBeVisible({ timeout: 15_000 });
}

/** Deja la vista en Tabla y sin filtros (los tests comparten la app). */
async function resetTabla() {
  await sidebar().getByRole("button", { name: "Tabla" }).click();
  const search = win.getByPlaceholder("Buscar tareas…");
  await expect(search).toBeVisible({ timeout: 15_000 });
  await search.fill("");
  const limpiar = win.getByRole("button", { name: "Limpiar" });
  if (await limpiar.count()) await limpiar.click();
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
  await win.locator("nav[aria-label='Módulos']").getByRole("button", { name: "Tareas" }).click();
  await expect(win.getByRole("button", { name: "Nueva tarea" })).toBeVisible({ timeout: 15_000 });
});

test.afterAll(async () => {
  await app?.close();
});

test("NV-T-001 crear tarea y verificar .md en disco", async () => {
  const name = `E2E Tarea ${Date.now()}`;
  await win.getByRole("button", { name: "Nueva tarea" }).click();
  const drawer = win.locator("aside[class*='w-[400px]']");
  await expect(drawer).toBeVisible();
  await drawer.locator("input").first().fill(name);
  await win.keyboard.press("Enter");
  await expect(win.locator("div[class*='group/row']", { hasText: name })).toBeVisible({ timeout: 15_000 });
  expect(fileWithText(taskFiles(), name)).not.toBeNull();
});

test("NV-T-002 completar tarea con checkbox", async () => {
  const name = `E2E Done ${Date.now()}`;
  await win.getByRole("button", { name: "Nueva tarea" }).click();
  const drawer = win.locator("aside[class*='w-[400px]']");
  await drawer.locator("input").first().fill(name);
  await win.keyboard.press("Enter");
  const row = win.locator("div[class*='group/row']", { hasText: name });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.getByTitle("Marcar como completada").click();
  await expect.poll(() => fileWithText(taskFiles(), name)).not.toBeNull();
  const doneFile = fileWithText(taskFiles(), name)!;
  expect(readFileSync(doneFile, "utf-8")).toMatch(/done|Hecha|hecha|status:\s*done/i);
});

test("NV-T-003 eliminar tarea va a papelera, no se pierde", async () => {
  const name = `E2E Papelera ${Date.now()}`;
  await win.getByRole("button", { name: "Nueva tarea" }).click();
  const drawer = win.locator("aside[class*='w-[400px]']");
  await drawer.locator("input").first().fill(name);
  await win.keyboard.press("Enter");
  const created = await expect.poll(() => fileWithText(taskFiles(), name)).not.toBeNull().then(() => fileWithText(taskFiles(), name)!);
  await drawer.getByTitle("Eliminar (a la papelera)").click();
  const dialog = win.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Eliminar" }).click();
  await expect(win.locator("div[class*='group/row']", { hasText: name })).toHaveCount(0, { timeout: 15_000 });
  // El archivo sale de tareas/ pero debe seguir existiendo (papelera, nunca borrado real).
  expect(existsSync(created)).toBe(false);
});

test("NV-T-004 buscar filtra la tabla y Limpiar restaura", async () => {
  await resetTabla();
  const uniq = Date.now();
  const nameA = `E2E Filtro A ${uniq}`;
  const nameB = `E2E Filtro B ${uniq}`;
  await createTask(nameA);
  await createTask(nameB);

  const search = win.getByPlaceholder("Buscar tareas…");
  await search.fill(`Filtro A ${uniq}`);
  await expect(taskRow(nameA)).toBeVisible();
  await expect(taskRow(nameB)).toHaveCount(0);
  await expect(win.getByText(/de \d+ tareas/)).toBeVisible();

  await resetTabla();
  await expect(taskRow(nameA)).toBeVisible();
  await expect(taskRow(nameB)).toBeVisible();
});

test("NV-T-005 vistas Tabla Calendario Recordatorios cambian el panel", async () => {
  await sidebar().getByRole("button", { name: "Calendario" }).click();
  await expect(win.getByRole("button", { name: "Hoy" })).toBeVisible({ timeout: 15_000 });

  await sidebar().getByRole("button", { name: "Recordatorios" }).click();
  await expect(win.getByRole("heading", { name: "Recordatorios" })).toBeVisible({ timeout: 15_000 });

  await sidebar().getByRole("button", { name: "Tabla" }).click();
  await expect(win.getByRole("button", { name: "Nueva tarea" })).toBeVisible({ timeout: 15_000 });
});

test("NV-T-006 renombrar con doble clic persiste en disco", async () => {
  await resetTabla();
  const name = `E2E Rename ${Date.now()}`;
  const renamed = `${name} v2`;
  await createTask(name);

  const row = taskRow(name);
  await row.getByTitle("Doble clic para renombrar").dblclick();
  // En edición el nombre vive en el value del input (hasText ya no matchea la fila).
  const edit = win.locator(`div[class*='group/row'] input[value="${name}"]`);
  await expect(edit).toBeVisible();
  await edit.fill(renamed);
  await win.keyboard.press("Enter");
  await expect(taskRow(renamed)).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => fileWithText(taskFiles(), renamed)).not.toBeNull();
});

test("NV-T-007 ocultar completadas esconde las hechas", async () => {
  await resetTabla();
  const uniq = Date.now();
  const name = `E2E Ocultar ${uniq}`;
  await createTask(name);

  const row = taskRow(name);
  await row.getByTitle("Marcar como completada").click();
  await expect.poll(() => fileWithText(taskFiles(), name)).not.toBeNull();

  await win.getByText("Ocultar completadas").click();
  await expect(taskRow(name)).toHaveCount(0);
  await expect(win.getByRole("button", { name: "Limpiar" })).toBeVisible();

  await resetTabla();
  await expect(taskRow(name)).toBeVisible();
});
