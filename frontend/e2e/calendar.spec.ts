import { test, expect, type Page } from "@playwright/test";
import { _electron as electron, type ElectronApplication } from "playwright";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync } from "node:fs";
import { sandboxEnv } from "./helpers";

const HERE = dirname(fileURLToPath(import.meta.url));
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

let app: ElectronApplication;
let win: Page;
let home = "";

function eventFile(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const iso = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  return join(home, "NoteVault", ".notevault", "agenda", "events", String(d.getFullYear()), p(d.getMonth() + 1), `${iso}.json`);
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
  await win.locator("nav[aria-label='Módulos']").getByRole("button", { name: "Calendario" }).click();
  await expect(win.getByRole("button", { name: "Crear" })).toBeVisible({ timeout: 15_000 });
});

test.afterAll(async () => {
  await app?.close();
});

test("NV-C-001 vistas Dia Semana Mes Agenda cambian el titulo", async () => {
  const now = new Date();
  const mesTitle = `${MESES[now.getMonth()]![0]!.toUpperCase()}${MESES[now.getMonth()]!.slice(1)} de ${now.getFullYear()}`;
  const side = win.locator("aside[class*='w-[260px]']");
  await side.getByRole("button", { name: "Mes", exact: true }).click();
  await expect(win.locator("main h1", { hasText: mesTitle })).toBeVisible();
  await side.getByRole("button", { name: "Agenda", exact: true }).click();
  await expect(win.locator("main h1", { hasText: "Agenda" })).toBeVisible();
  await side.getByRole("button", { name: "Día" }).click();
  await expect(win.locator("main h1", { hasText: String(now.getDate()) })).toBeVisible();
  await side.getByRole("button", { name: "Semana", exact: true }).click();
  await expect(win.locator("main h1", { hasText: String(now.getFullYear()) })).toBeVisible();
});

test("NV-C-002 crear evento aparece en Agenda y en disco", async () => {
  const title = `E2E Evento ${Date.now()}`;
  const side = win.locator("aside[class*='w-[260px]']");
  await side.getByRole("button", { name: "Día" }).click();
  await win.getByRole("button", { name: "Hoy" }).click();
  await win.locator("main").getByRole("button", { name: "Crear", exact: true }).click();
  await win.getByRole("menuitem", { name: "Evento" }).click();
  const dialog = win.getByRole("dialog", { name: "Editor de evento" });
  await expect(dialog).toBeVisible();
  await dialog.getByPlaceholder("Añadir título").fill(title);
  await dialog.getByRole("button", { name: "Guardar" }).click();
  await side.getByRole("button", { name: "Agenda", exact: true }).click();
  await expect(win.getByText(title).first()).toBeVisible({ timeout: 15_000 });
  const file = eventFile();
  expect(existsSync(file)).toBe(true);
  expect(readFileSync(file, "utf-8")).toContain(title);
});

const side = () => win.locator("aside[class*='w-[260px]']");
const editor = () => win.getByRole("dialog", { name: "Editor de evento" });

async function createEvent(title: string) {
  await side().getByRole("button", { name: "Día" }).click();
  await win.getByRole("button", { name: "Hoy" }).click();
  await win.locator("main").getByRole("button", { name: "Crear", exact: true }).click();
  await win.getByRole("menuitem", { name: "Evento" }).click();
  await expect(editor()).toBeVisible();
  await editor().getByPlaceholder("Añadir título").fill(title);
  await editor().getByRole("button", { name: "Guardar" }).click();
  await side().getByRole("button", { name: "Agenda", exact: true }).click();
  await expect(win.getByText(title).first()).toBeVisible({ timeout: 15_000 });
}

async function openEditor(title: string) {
  await side().getByRole("button", { name: "Agenda", exact: true }).click();
  await win.getByText(title).first().click();
  await expect(editor()).toBeVisible({ timeout: 15_000 });
}

test("NV-C-003 editar el título persiste en disco", async () => {
  const title = `E2E Evento Edit ${Date.now()}`;
  const renamed = `${title} v2`;
  await createEvent(title);
  await openEditor(title);
  await editor().getByPlaceholder("Añadir título").fill(renamed);
  await editor().getByRole("button", { name: "Guardar" }).click();
  await expect(win.getByText(renamed).first()).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => readFileSync(eventFile(), "utf-8")).toContain(renamed);
});

test("NV-C-004 eliminar evento lo saca de la agenda y del disco", async () => {
  const title = `E2E Evento Del ${Date.now()}`;
  await createEvent(title);
  await openEditor(title);
  await editor().getByTitle("Eliminar").click();
  const confirm = win.getByRole("dialog", { name: "Eliminar" });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Eliminar" }).click();
  await expect(win.getByText(title)).toHaveCount(0, { timeout: 15_000 });
  await expect.poll(() => readFileSync(eventFile(), "utf-8")).not.toContain(title);
});

test("NV-C-005 el filtro Eventos oculta y restaura la agenda", async () => {
  const title = `E2E Evento Filtro ${Date.now()}`;
  await createEvent(title);
  const box = side().getByText("Eventos");
  await box.click();
  await expect(win.getByText(title)).toHaveCount(0);
  await box.click();
  await expect(win.getByText(title).first()).toBeVisible({ timeout: 15_000 });
});
