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
  await win.getByPlaceholder("Detalle").fill(what);
  await win.getByRole("button", { name: /Guardar/ }).click();
  await expect(win.getByText(/registrado: /).first()).toBeVisible({ timeout: 15_000 });
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
  const ingresoDialog = win.getByRole("dialog", { name: "Nuevo ingreso" });
  await expect(ingresoDialog).toBeVisible();
  await ingresoDialog.getByLabel("Importe").fill("50000");
  await ingresoDialog.getByPlaceholder("p. ej. Almuerzo").fill(what);
  await ingresoDialog.getByRole("button", { name: "Guardar" }).click();
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
  await win.getByPlaceholder("Detalle").fill(what);
  await win.getByRole("button", { name: /Guardar/ }).click();
  const row = win.getByRole("button", { name: new RegExp(`Gasto.*${what}`) });
  await expect(row).toBeVisible({ timeout: 15_000 });

  await row.click();
  await win.getByRole("button", { name: "Editar" }).click();
  const dialog = win.getByRole("dialog", { name: "Editar movimiento" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Eliminar" }).click();
  const confirm = win.getByRole("alertdialog", { name: "Eliminar movimiento" });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Eliminar" }).click();

  await expect(win.getByRole("button", { name: new RegExp(`Gasto.*${what}`) })).toHaveCount(0, {
    timeout: 15_000,
  });
  await expect.poll(() => readFileSync(todayFile(), "utf-8")).not.toContain(what);
});

test("NV-F-005 categorías nacen vacías y se puede crear una", async () => {
  await side().getByRole("button", { name: "Categorías" }).click();
  await expect(win.getByRole("heading", { name: /Categorías/ })).toBeVisible({ timeout: 15_000 });
  // Un vault nuevo no trae catálogo: las categorías las crea la persona.
  await expect(win.getByText("Aún no hay categorías")).toBeVisible({ timeout: 15_000 });

  const name = `E2E Mascotas ${Date.now()}`;
  await win.getByRole("button", { name: "Nueva categoría" }).click();
  const dialog = win.getByRole("dialog", { name: "Nueva categoría" });
  await expect(dialog).toBeVisible();
  await dialog.getByPlaceholder("p. ej. Mascotas").fill(name);
  await dialog.getByRole("button", { name: "Guardar" }).click();
  await expect(win.locator("main").locator("span", { hasText: name }).first()).toBeVisible({
    timeout: 15_000,
  });

  await gotoDiario();
  await expect(win.getByLabel("Importe rápido")).toBeVisible({ timeout: 15_000 });
  // Y aparece en el selector del registro rápido.
  await expect(win.locator("select").filter({ hasText: name }).first()).toBeVisible({ timeout: 15_000 });

  // Se puede crear una categoría sin salir del Diario: sin esto, todo movimiento
  // caía en «Sin categoría» y no había forma de arreglarlo aquí.
  const inline = `E2E Taxi ${Date.now()}`;
  await win.getByTitle("Crear categoría").click();
  const inlineDialog = win.getByRole("dialog", { name: "Nueva categoría" });
  await expect(inlineDialog).toBeVisible();
  await inlineDialog.getByPlaceholder("p. ej. Mascotas").fill(inline);
  await inlineDialog.getByRole("button", { name: "Guardar" }).click();
  await expect(win.locator("select").filter({ hasText: inline }).first()).toBeVisible({ timeout: 15_000 });
});

test("NV-F-011 categorías se reordenan con las flechas", async () => {
  await side().getByRole("button", { name: "Categorías" }).click();
  await expect(win.getByRole("heading", { name: /Categorías/ })).toBeVisible({ timeout: 15_000 });

  const a = `E2E Uno ${Date.now()}`;
  const b = `E2E Dos ${Date.now()}`;
  for (const name of [a, b]) {
    await win.getByRole("button", { name: "Nueva categoría" }).click();
    const dialog = win.getByRole("dialog", { name: "Nueva categoría" });
    await dialog.getByPlaceholder("p. ej. Mascotas").fill(name);
    await dialog.getByRole("button", { name: "Guardar" }).click();
    await expect(win.locator("main").locator("span", { hasText: name }).first()).toBeVisible({ timeout: 15_000 });
  }

  const main = win.locator("main");
  const row = (name: string) => main.locator("[data-cat-row]").filter({ hasText: name });
  const pos = async (name: string) => {
    const box = await row(name).boundingBox();
    return box?.y ?? 0;
  };
  // La primera de la lista no se puede subir.
  await expect(main.locator("[data-cat-row]").first().getByTitle("Subir")).toBeDisabled();

  // Sube la de las dos que esté más abajo y comprueba que cambia de sitio.
  const before = { a: await pos(a), b: await pos(b) };
  const lower = before.a > before.b ? a : b;
  const wasAt = Math.max(before.a, before.b);
  await row(lower).getByTitle("Subir").click();
  await expect.poll(async () => pos(lower), { timeout: 15_000 }).toBeLessThan(wasAt);
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
  await expect(win.locator("main").getByRole("button", { name: new RegExp(name) }).first()).toBeVisible({ timeout: 15_000 });
});

test("NV-F-007 duplicar abre copia para hoy y la guarda", async () => {
  await gotoDiario();
  const what = `E2E Plantilla ${Date.now()}`;
  await win.getByLabel("Importe rápido").fill("9000");
  await win.getByPlaceholder("Detalle").fill(what);
  await win.getByRole("button", { name: /Guardar/ }).click();
  const row = win.getByRole("button", { name: new RegExp(`Gasto.*${what}`) });
  await expect(row).toBeVisible({ timeout: 15_000 });

  await row.click();
  await win.getByRole("button", { name: "Duplicar" }).click();
  const dialog = win.getByRole("dialog", { name: "Nuevo gasto" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByPlaceholder("p. ej. Almuerzo")).toHaveValue(what);
  await dialog.getByRole("button", { name: "Guardar" }).click();
  await expect(win.getByRole("button", { name: new RegExp(`Gasto.*${what}`) })).toHaveCount(2, {
    timeout: 15_000,
  });
});

test("NV-F-008 periodo cambia a año y muestra balance acumulado", async () => {
  await side().getByRole("button", { name: "Periodo" }).click();
  await expect(win.getByRole("heading", { name: "Periodo" })).toBeVisible({ timeout: 15_000 });
  await win.getByRole("button", { name: "Año", exact: true }).click();
  const year = String(new Date().getFullYear());
  await expect(win.getByText(`TOTAL ${year}`)).toBeVisible({ timeout: 15_000 });
  await expect(win.getByText("Balance acumulado")).toBeVisible();
  await expect(win.getByText("Proyección 3 meses")).toBeVisible();
});

test("NV-F-009 recurrente se crea y queda en disco", async () => {
  await side().getByRole("button", { name: "Recurrentes" }).click();
  await expect(win.getByRole("heading", { name: "Recurrentes" })).toBeVisible({ timeout: 15_000 });
  const what = `E2E Arriendo ${Date.now()}`;
  await win.getByRole("button", { name: "Nuevo recurrente" }).click();
  const dialog = win.getByRole("dialog", { name: "Nuevo recurrente" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Importe").fill("800000");
  await dialog.getByPlaceholder("p. ej. Arriendo").fill(what);
  await dialog.getByRole("button", { name: "Guardar" }).click();
  await expect(win.getByRole("button", { name: new RegExp(what) })).toBeVisible({ timeout: 15_000 });
  const file = join(home, "NoteVault", ".notevault", "finanzas", "recurrentes.json");
  expect(existsSync(file)).toBe(true);
  expect(readFileSync(file, "utf-8")).toContain(what);

  // Limpieza: el recurrente es diario y materializaría fantasmas en los siguientes tests.
  await win.getByRole("button", { name: new RegExp(what) }).click();
  const edit = win.getByRole("dialog", { name: "Editar recurrente" });
  await expect(edit).toBeVisible();
  await edit.getByRole("button", { name: "Eliminar" }).click();
  const confirm = win.getByRole("alertdialog", { name: "Eliminar recurrente" });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Eliminar" }).click();
  await expect(win.getByRole("button", { name: new RegExp(what) })).toHaveCount(0, { timeout: 15_000 });
});

test("NV-F-010 historial busca en todo el historial", async () => {
  await gotoDiario();
  const what = `E2E Viejo ${Date.now()}`;
  await win.getByLabel("Importe rápido").fill("7000");
  await win.getByPlaceholder("Detalle").fill(what);
  await win.getByRole("button", { name: /Guardar/ }).click();
  await expect(win.getByText(/registrado: /).first()).toBeVisible({ timeout: 15_000 });

  await side().getByRole("button", { name: "Periodo" }).click();
  await expect(win.getByRole("heading", { name: "Periodo" })).toBeVisible({ timeout: 15_000 });
  await win.getByPlaceholder(/Buscar/).fill(what);
  await win.getByRole("button", { name: "Historial" }).click();
  await expect(win.getByText(/resultados en todo el historial/)).toBeVisible({ timeout: 15_000 });
  await expect(win.getByRole("button", { name: new RegExp(`Gasto.*${what}`) })).toBeVisible({ timeout: 15_000 });
});

test("NV-F-012 periodo muestra estructura fijos vs variables y flujo neto", async () => {
  await side().getByRole("button", { name: "Periodo" }).click();
  await expect(win.getByRole("heading", { name: "Periodo" })).toBeVisible({ timeout: 15_000 });
  // Limpiar búsqueda previa para que se muestren los extras del mes
  await win.getByPlaceholder(/Buscar/).fill("");
  const hist = win.getByRole("button", { name: "Historial" });
  if ((await hist.getAttribute("aria-pressed")) === "true") {
    await hist.click();
  }
  await win.getByRole("button", { name: "Mes", exact: true }).click();
  await expect(win.getByText("Estructura de gastos · Fijos vs Variables")).toBeVisible({ timeout: 15_000 });
  await expect(win.getByText("Flujo neto")).toBeVisible({ timeout: 15_000 });
});
