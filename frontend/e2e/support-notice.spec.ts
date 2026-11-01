import { test, expect, type Page } from "@playwright/test";
import { _electron as electron, type ElectronApplication } from "playwright";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { sandboxEnv } from "./helpers";

const HERE = dirname(fileURLToPath(import.meta.url));

let app: ElectronApplication;
let win: Page;

test.beforeAll(async () => {
  // NV_E2E_SUPPORT=1 deja que el aviso de apoyo salga aunque el HOME sea aislado.
  app = await electron.launch({
    args: [".", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
    cwd: join(HERE, ".."),
    env: { ...sandboxEnv(), NV_E2E_SUPPORT: "1" },
  });
  win = await app.firstWindow();
  await win.waitForSelector("nav[aria-label='Módulos']", { timeout: 30_000 });
  // El perfil de Electron se comparte entre ejecuciones: se parte de cero para que la prueba se pueda repetir.
  await win.evaluate(() => localStorage.removeItem("nv.support-notice"));
  await win.reload();
  await win.waitForSelector("nav[aria-label='Módulos']", { timeout: 30_000 });
});

test.afterAll(async () => {
  await app?.close();
});

test("NV-SUP-001 el aviso «Ayúdanos» sale solo, no tapa la app y se puede apagar", async () => {
  const notice = win.getByTestId("support-notice");
  await expect(notice).toBeVisible({ timeout: 15_000 });
  await expect(notice).toContainText("Somos estudiantes");
  await expect(notice.getByRole("button", { name: "Apoyar con PayPal" })).toBeVisible();

  // No bloquea: la app sigue respondiendo con el aviso a la vista.
  await win.locator("nav[aria-label='Módulos']").getByRole("button", { name: "Calendario" }).click();
  await expect(notice).toBeVisible();

  await notice.getByRole("button", { name: "No volver a mostrar" }).click();
  await expect(notice).toHaveCount(0);
  expect(await win.evaluate(() => JSON.parse(localStorage.getItem("nv.support-notice")!).never)).toBe(true);
});
