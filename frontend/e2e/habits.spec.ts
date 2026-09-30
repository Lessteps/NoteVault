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

function habitsDir(): string {
  return join(home, "NoteVault", ".notevault", "habits");
}

function todayDayFile(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const iso = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  return join(habitsDir(), String(d.getFullYear()), p(d.getMonth() + 1), `${iso}.md`);
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
  await win.locator("nav[aria-label='Módulos']").getByRole("button", { name: "Hábitos" }).click();
  await expect(win.getByRole("button", { name: "Gestionar hábitos" })).toBeVisible({ timeout: 15_000 });
});

test.afterAll(async () => {
  await app?.close();
});

test("NV-H-001 crear habito aparece en config en disco", async () => {
  const name = `E2E Habito ${Date.now()}`;
  const side = win.locator("aside[class*='w-[260px]']");
  await side.getByRole("button", { name: "Gestionar hábitos" }).click();
  await win.getByRole("button", { name: "Nuevo hábito" }).click();
  const editor = win.locator("aside[class*='w-[380px]']");
  await expect(editor).toBeVisible();
  await editor.locator("input").nth(1).fill(name);
  await win.keyboard.press("Enter");
  await expect(win.getByText(name).first()).toBeVisible({ timeout: 15_000 });
  const cfg = join(habitsDir(), "habits_config.json");
  expect(existsSync(cfg)).toBe(true);
  expect(readFileSync(cfg, "utf-8")).toContain(name);
});

test("NV-H-002 marcar check diario persiste en el dia", async () => {
  const name = `E2E Check ${Date.now()}`;
  const side = win.locator("aside[class*='w-[260px]']");
  await side.getByRole("button", { name: "Gestionar hábitos" }).click();
  await win.getByRole("button", { name: "Nuevo hábito" }).click();
  const editor = win.locator("aside[class*='w-[380px]']");
  await editor.locator("input").nth(1).fill(name);
  await win.keyboard.press("Enter");
  await expect(win.getByText(name).first()).toBeVisible({ timeout: 15_000 });

  await side.getByRole("button", { name: "Diaria" }).click();
  const check = win.getByRole("checkbox", { name: new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) });
  await expect(check).toBeVisible({ timeout: 15_000 });
  await check.click();
  await expect(check).toHaveAttribute("aria-checked", "true", { timeout: 15_000 });
  const dayFile = todayDayFile();
  expect(existsSync(dayFile)).toBe(true);
  expect(readFileSync(dayFile, "utf-8")).toContain("true");
});
