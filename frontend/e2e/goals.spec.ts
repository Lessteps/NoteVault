import { test, expect, type Page } from "@playwright/test";
import { _electron as electron, type ElectronApplication } from "playwright";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { sandboxEnv } from "./helpers";

const HERE = dirname(fileURLToPath(import.meta.url));

let app: ElectronApplication;
let win: Page;
let home = "";

function metasDir(): string {
  return join(home, "NoteVault", ".notevault", "metas");
}

/** Every .md under metas/ containing `text` (goal.md files and items). */
function filesWithText(text: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    let entries: string[] = [];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const e of entries) {
      const full = join(dir, e);
      try {
        if (statSync(full).isDirectory()) walk(full);
        else if (e.endsWith(".md") && readFileSync(full, "utf-8").includes(text)) out.push(full);
      } catch {
        /* a half-written file is not a failure */
      }
    }
  };
  walk(metasDir());
  return out;
}

const side = () => win.locator("aside[class*='w-[240px]']");

/** Back to the board without filters (tests share the app). */
async function resetBoard() {
  await side().getByRole("button", { name: "Tablero" }).click();
  // Regex: el filtro ("Todas"/"Todas 1"), no el área "◎ Todas".
  await side().getByRole("button", { name: /^Todas( \d+)?$/ }).click();
  await expect(win.getByRole("heading", { name: "🎯 Metas" })).toBeVisible({ timeout: 15_000 });
}

async function createGoal(name: string) {
  await resetBoard();
  await win.locator("main").getByRole("button", { name: "Nueva meta" }).click();
  const dialog = win.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByPlaceholder("p. ej. Ser desarrollador backend").fill(name);
  await dialog.getByRole("button", { name: "Crear meta" }).click();
  // Crear abre la meta: su nombre vive en el input inline del GoalView.
  await expect(win.getByLabel("Nombre de la meta")).toHaveValue(name, { timeout: 15_000 });
}

async function openGoal(name: string) {
  await resetBoard();
  await win.locator("main").getByRole("button", { name }).click();
  await expect(win.getByRole("tab", { name: "Submetas" })).toBeVisible({ timeout: 15_000 });
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
  await win.locator("nav[aria-label='Módulos']").getByRole("button", { name: "Metas" }).click();
  await expect(win.getByRole("button", { name: "Nueva meta" }).first()).toBeVisible({
    timeout: 15_000,
  });
});

test.afterAll(async () => {
  await app?.close();
});

test("NV-M-001 crear meta y verificar goal.md en disco", async () => {
  const name = `E2E Meta ${Date.now()}`;
  await createGoal(name);
  await expect.poll(() => filesWithText(name)).not.toEqual([]);
});

test("NV-M-002 crear submeta y verificar items en disco", async () => {
  const name = `E2E Meta Submetas ${Date.now()}`;
  await createGoal(name);
  await openGoal(name);
  await win.getByRole("button", { name: "Submeta", exact: true }).click();
  // Crear abre el detalle de la submeta con su nombre en el editor.
  await expect(win.getByLabel("Nombre de la submeta")).toHaveValue("Nueva submeta", { timeout: 15_000 });
  await expect.poll(() => filesWithText("Nueva submeta")).not.toEqual([]);
});

test("NV-M-003 pestañas Submetas Hoy Historial Notas cambian la vista", async () => {
  const name = `E2E Meta Tabs ${Date.now()}`;
  await createGoal(name);
  await openGoal(name);

  for (const tab of ["Hoy", "Historial", "Notas"]) {
    await win.getByRole("tab", { name: tab }).click();
    await expect(win.getByRole("tab", { name: tab })).toHaveAttribute("aria-selected", "true");
  }
  await win.getByRole("tab", { name: "Submetas" }).click();
  await expect(win.getByRole("tab", { name: "Submetas" })).toHaveAttribute("aria-selected", "true");
});

test("NV-M-004 filtro Completadas esconde la meta activa", async () => {
  const name = `E2E Meta Filtro ${Date.now()}`;
  await createGoal(name);

  await resetBoard();
  await side().getByRole("button", { name: "Completadas" }).click();
  await expect(win.getByText("No hay metas aquí todavía.")).toBeVisible({ timeout: 15_000 });
  await expect(win.locator("main").getByRole("button", { name })).toHaveCount(0);

  await side().getByRole("button", { name: "Activas" }).click();
  await expect(win.locator("main").getByRole("button", { name })).toBeVisible({ timeout: 15_000 });
});
