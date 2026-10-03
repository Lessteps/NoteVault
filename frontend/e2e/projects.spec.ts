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

function proyectosDir(): string {
  return join(home, "NoteVault", ".notevault", "proyectos");
}

/** Every .md under proyectos/ containing `text` (project files and issues). */
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
  walk(proyectosDir());
  return out;
}

async function createProject(name: string) {
  // El peek modal de un test anterior intercepta los clics: cerrarlo primero.
  if (await issuePeek().count()) {
    await issuePeek().getByTitle("Cerrar").click();
    await expect(issuePeek()).toHaveCount(0, { timeout: 15_000 });
  }
  // Un test anterior puede dejar un proyecto abierto (sin botón en el main).
  await win.locator("aside[class*='w-[240px]']").getByRole("button", { name: "Tablero" }).click();
  await win.locator("main").getByRole("button", { name: "Nuevo proyecto" }).click();
  const dialog = win.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByPlaceholder("p. ej. Portafolio web").fill(name);
  await dialog.getByRole("button", { name: "Crear proyecto" }).click();
  await expect(win.locator("aside[class*='w-[240px]']").getByRole("button", { name })).toBeVisible({
    timeout: 15_000,
  });
}

async function openProject(name: string) {
  await win.locator("aside[class*='w-[240px]']").getByRole("button", { name }).click();
}

async function createIssue(title: string) {
  await win.getByRole("button", { name: "Crear issue" }).click();
  const dialog = win.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByPlaceholder("¿Qué hay que hacer?").fill(title);
  await dialog.getByRole("button", { name: "Crear", exact: true }).click();
  // Creating focuses the new issue: its centred peek opens on its own.
  await expect(issuePeek()).toBeVisible({ timeout: 15_000 });
}

/** The centred peek showing the focused issue (replaces the old side panel). */
const issuePeek = () => win.getByRole("dialog", { name: "Detalle del issue" });

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
  await win.locator("nav[aria-label='Módulos']").getByRole("button", { name: "Proyectos" }).click();
  await expect(win.getByRole("button", { name: "Nuevo proyecto" }).first()).toBeVisible({
    timeout: 15_000,
  });
});

test.afterAll(async () => {
  await app?.close();
});

test("NV-P-001 crear proyecto y verificar .md en disco", async () => {
  const name = `E2E Proyecto ${Date.now()}`;
  await createProject(name);
  await expect.poll(() => filesWithText(name)).not.toEqual([]);
});

test("NV-P-002 crear issue y verificar .md en disco", async () => {
  const name = `E2E Proyecto Issues ${Date.now()}`;
  const title = `E2E Issue ${Date.now()}`;
  await createProject(name);
  await openProject(name);
  await createIssue(title);
  await expect(win.getByText(title).first()).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => filesWithText(title)).not.toEqual([]);
});

test("NV-P-003 pestañas Resumen Tablero Lista cambian la vista", async () => {
  const name = `E2E Proyecto Tabs ${Date.now()}`;
  await createProject(name);
  await openProject(name);

  await win.getByRole("tab", { name: "Tablero" }).click();
  await expect(win.getByTitle("Crear en Por hacer")).toBeVisible({ timeout: 15_000 });

  await win.getByRole("tab", { name: "Lista" }).click();
  await expect(win.getByRole("tab", { name: "Lista" })).toHaveAttribute("aria-selected", "true");

  await win.getByRole("tab", { name: "Resumen" }).click();
  await expect(win.getByRole("tab", { name: "Resumen" })).toHaveAttribute("aria-selected", "true");
});

test("NV-P-004 pasar el issue a Hecho persiste en disco", async () => {
  const name = `E2E Proyecto Done ${Date.now()}`;
  const title = `E2E Issue Done ${Date.now()}`;
  await createProject(name);
  await openProject(name);
  await createIssue(title);

  const peek = issuePeek();
  await pickEstado(peek, "Hecho");
  await peek.getByRole("button", { name: "Guardar" }).click();
  await expect(peek.getByText("Guardado ✓")).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => filesWithText(title).map((f) => readFileSync(f, "utf-8")).join("\n")).toContain("Hecho");
});

/**
 * El menú de Estado es un toggle con portal; la opción lleva un icono
 * delante ("V Hecho"), así que el match es por substring.
 */
async function pickEstado(peek: ReturnType<typeof issuePeek>, value: string) {
  for (let i = 0; i < 3; i++) {
    await peek.getByTitle("Estado").click();
    const opt = win.getByRole("option", { name: value });
    try {
      await opt.waitFor({ timeout: 3000 });
      await opt.click();
      return;
    } catch {
      /* el menú quedó cerrado: el siguiente clic lo reabre */
    }
  }
  throw new Error(`el menú de Estado no ofreció ${value}`);
}
