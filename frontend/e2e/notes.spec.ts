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
  await win.locator("nav[aria-label='Módulos']").getByRole("button", { name: "Notas" }).click();
});

test.afterAll(async () => {
  await app?.close();
});

test("NV-N-001 crear nota desde QuickSwitcher y verificar .md en disco", async () => {
  const title = `E2E Nota ${Date.now()}`;
  const body = "Contenido E2E de verificacion.";

  await win.keyboard.press("Control+P");
  const input = win.getByPlaceholder(/Busca una nota por nombre/);
  await expect(input).toBeVisible();
  await input.fill(title);
  await expect(win.getByText(`Crear nota «${title}»`)).toBeVisible();
  await win.keyboard.press("Enter");

  // La nota se abre en modo edición (CodeMirror).
  const editor = win.locator(".cm-content");
  await expect(editor).toBeVisible({ timeout: 15_000 });
  await editor.click();
  await win.keyboard.press("Control+End");
  await win.keyboard.type(`\n${body}`);
  await win.keyboard.press("Control+S");

  // SyncState confirma guardado y el archivo existe en el vault sandbox.
  await expect(win.getByText("Guardado").first()).toBeVisible({ timeout: 15_000 });
  const file = join(home, "NoteVault", `${title}.md`);
  expect(existsSync(file)).toBe(true);
  expect(readFileSync(file, "utf-8")).toContain(body);
});

test("NV-N-002 pasar a Lectura renderiza el contenido", async () => {
  // Nota propia (independiente de N-001): crear + escribir + guardar.
  const title = `E2E Lectura ${Date.now()}`;
  const body = "Contenido E2E de verificacion.";
  await win.keyboard.press("Control+P");
  const input = win.getByPlaceholder(/Busca una nota por nombre/);
  await expect(input).toBeVisible();
  await input.fill(title);
  await expect(win.getByText(`Crear nota «${title}»`)).toBeVisible();
  await win.keyboard.press("Enter");
  const editor = win.locator(".cm-content");
  await expect(editor).toBeVisible({ timeout: 15_000 });
  await editor.click();
  await win.keyboard.press("Control+End");
  await win.keyboard.type(`\n${body}`);
  await win.keyboard.press("Control+S");
  await expect(win.getByText("Guardado").first()).toBeVisible({ timeout: 15_000 });

  await win.getByRole("tab", { name: "Lectura", exact: true }).click();
  await expect(win.getByText("Contenido E2E de verificacion.")).toBeVisible({ timeout: 15_000 });
});
