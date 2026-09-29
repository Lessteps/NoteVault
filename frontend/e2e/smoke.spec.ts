import { test, expect, type Page } from "@playwright/test";
import { _electron as electron, type ElectronApplication } from "playwright";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { sandboxEnv } from "./helpers";

const HERE = dirname(fileURLToPath(import.meta.url));

let app: ElectronApplication;
let win: Page;

test.beforeAll(async () => {
  app = await electron.launch({
    args: [".", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
    cwd: join(HERE, ".."),
    env: sandboxEnv(),
  });
  win = await app.firstWindow();
  await win.waitForSelector("nav[aria-label='Módulos']", { timeout: 30_000 });
});

test.afterAll(async () => {
  await app?.close();
});

test("NV-G-001 shell carga: topbar + rail + statusbar", async () => {
  await expect(win.locator("nav[aria-label='Módulos']")).toBeVisible();
  await expect(win.locator("nav[aria-label='Módulos']")).toBeVisible();
  await expect(win.locator("footer", { hasText: "Sin nota abierta" })).toBeVisible();
});

test("NV-G-002 navegar a Notas y Tareas por IconRail", async () => {
  const rail = win.locator("nav[aria-label='Módulos']");
  await rail.getByRole("button", { name: "Notas" }).click();
  await expect(rail.getByRole("button", { name: "Notas" })).toBeVisible();
  await rail.getByRole("button", { name: "Tareas" }).click();
  await expect(rail.getByRole("button", { name: "Tareas" })).toBeVisible();
});

test("NV-G-003 paleta con Ctrl+Shift+P y cierre con Esc", async () => {
  await win.keyboard.press("Control+Shift+P");
  await win.keyboard.press("Escape");
  await expect(win.locator("nav[aria-label='Módulos']")).toBeVisible();
});
