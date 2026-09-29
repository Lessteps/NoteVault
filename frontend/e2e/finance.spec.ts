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
  await win.waitForSelector("header:has-text('NoteVault')", { timeout: 30_000 });
  await win.locator("nav[aria-label='Módulos']").getByRole("button", { name: "Finanzas" }).click();
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
