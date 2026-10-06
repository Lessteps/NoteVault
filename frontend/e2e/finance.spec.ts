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

function todayFile(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const iso = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  return join(home, "NoteVault", ".notevault", "finanzas", String(d.getFullYear()), p(d.getMonth() + 1), `${iso}.json`);
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
  await win.locator("nav[aria-label='Módulos']").getByRole("button", { name: "Finanzas" }).click();
  // La vista persiste entre sesiones: volver al Diario explícitamente.
  const side0 = win.locator("aside[class*='w-[260px]']");
  await expect(side0.getByRole("button", { name: "Diario" })).toBeVisible({ timeout: 15_000 });
  await side0.getByRole("button", { name: "Diario" }).click();
  await expect(win.getByRole("heading", { name: /Diario/ })).toBeVisible({ timeout: 15_000 });
});

test.afterAll(async () => {
  await app?.close();
});

test("NV-F-001 registro rapido de gasto aparece en tabla y en disco", async () => {
  const what = `E2E Cafe ${Date.now()}`;
  await win.getByLabel("Importe rápido").fill("12500");
  await win.getByPlaceholder("En qué").fill(what);
  await win.getByRole("button", { name: /Guardar/ }).click();
  await expect(win.getByText(/^Guardado:/)).toBeVisible({ timeout: 15_000 });
  await expect(win.getByRole("button", { name: new RegExp(`Gasto.*${what}`) })).toBeVisible({ timeout: 15_000 });
  const file = todayFile();
  expect(existsSync(file)).toBe(true);
  expect(readFileSync(file, "utf-8")).toContain(what);
});

test("NV-F-002 sin importe muestra ayuda, no guarda nada", async () => {
  await win.getByLabel("Importe rápido").fill("");
  await win.getByRole("button", { name: /Guardar/ }).click();
  await expect(win.getByText(/Escribe un importe/)).toBeVisible({ timeout: 15_000 });
});

const side = () => win.locator("aside[class*='w-[260px]']");

async function gotoDiario() {
  await side().getByRole("button", { name: "Diario" }).click();
  await expect(win.getByRole("heading", { name: /Diario/ })).toBeVisible({ timeout: 15_000 });
}

test("NV-F-003 ingreso con formulario aparece en tabla y en disco", async () => {
  await gotoDiario();
  const what = `E2E Salario ${Date.now()}`;
  await win.getByRole("button", { name: "+ Nuevo movimiento" }).click();
  const dialog = win.getByRole("dialog", { name: "Nuevo gasto" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Ingreso" }).click();
  await expect(win.getByRole("dialog", { name: "Nuevo ingreso" })).toBeVisible();
  await dialog.getByLabel("Importe").fill("50000");
  await dialog.getByPlaceholder("p. ej. Almuerzo").fill(what);
  await dialog.getByRole("button", { name: "Guardar" }).click();
  await expect(win.getByRole("button", { name: new RegExp(`Ingreso.*${what}`) })).toBeVisible({
    timeout: 15_000,
  });
  const file = todayFile();
  expect(existsSync(file)).toBe(true);
  expect(readFileSync(file, "utf-8")).toContain(what);
});

test("NV-F-004 eliminar movimiento lo saca de la tabla y del disco", async () => {
  await gotoDiario();
  const what = `E2E Borrar ${Date.now()}`;
  await win.getByLabel("Importe rápido").fill("8000");
  await win.getByPlaceholder("En qué").fill(what);
  await win.getByRole("button", { name: /Guardar/ }).click();
  const row = win.getByRole("button", { name: new RegExp(`Gasto.*${what}`) });
  await expect(row).toBeVisible({ timeout: 15_000 });

  await row.click();
  await win.getByRole("button", { name: "Editar" }).click();
  const dialog = win.getByRole("dialog", { name: "Editar movimiento" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Eliminar" }).click();
  const confirm = win.getByRole("dialog", { name: "Eliminar movimiento" });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Eliminar" }).click();

  await expect(win.getByRole("button", { name: new RegExp(`Gasto.*${what}`) })).toHaveCount(0, {
    timeout: 15_000,
  });
  await expect.poll(() => readFileSync(todayFile(), "utf-8")).not.toContain(what);
});

test("NV-F-005 categorías muestra Comida y vuelve al diario", async () => {
  await side().getByRole("button", { name: "Categorías" }).click();
  await expect(win.getByRole("heading", { name: /Categorías/ })).toBeVisible({ timeout: 15_000 });
  await expect(win.locator("main").locator("span", { hasText: "Comida" }).first()).toBeVisible({
    timeout: 15_000,
  });

  await gotoDiario();
  await expect(win.getByLabel("Importe rápido")).toBeVisible({ timeout: 15_000 });
});

test("NV-F-006 crear meta en 2 pasos calcula el aporte y la muestra", async () => {
  await side().getByRole("button", { name: "Metas financieras" }).click();
  await expect(win.getByRole("heading", { name: /Metas financieras/ })).toBeVisible({ timeout: 15_000 });
  const name = `E2E Moto ${Date.now()}`;
  await win.getByRole("button", { name: "Nueva meta" }).click();
  const dialog = win.getByRole("dialog", { name: /Nueva meta/ });
  await expect(dialog).toBeVisible();
  await dialog.getByPlaceholder("p. ej. Moto").fill(name);
  await dialog.getByLabel("Objetivo").fill("5000000");
  await dialog.getByRole("button", { name: "Siguiente" }).click();
  await expect(dialog.getByLabel("Fecha límite")).toBeVisible();
  await dialog.getByLabel("Fecha límite").fill("2026-12-31");
  await expect(dialog.getByText(/Calculado del objetivo/)).toBeVisible();
  await dialog.getByRole("button", { name: "Crear meta" }).click();
  await expect(win.getByRole("button", { name: new RegExp(name) })).toBeVisible({ timeout: 15_000 });
});
