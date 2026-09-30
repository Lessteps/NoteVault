import { test, expect, type Page } from "@playwright/test";
import { _electron as electron, type ElectronApplication } from "playwright";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { sandboxEnv } from "./helpers";

const HERE = dirname(fileURLToPath(import.meta.url));

let app: ElectronApplication;
let win: Page;
let home = "";

function vaultDir(): string {
  return join(home, "NoteVault");
}

/** Every .canvas file in the vault. */
function canvasFiles(): string[] {
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
        else if (e.endsWith(".canvas")) out.push(full);
      } catch {
        /* a half-written file is not a failure */
      }
    }
  };
  walk(vaultDir());
  return out;
}

/** Ids of the nodes a .canvas holds, read straight from the file. */
function nodeIds(file: string): string[] {
  try {
    return (JSON.parse(readFileSync(file, "utf-8")) as { nodes: Array<{ id: string }> }).nodes.map((n) => n.id);
  } catch {
    return [];
  }
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
  await win.locator("nav[aria-label='Módulos']").getByRole("button", { name: "Notas" }).click();
  await expect(win.getByTitle("Nuevo canvas")).toBeVisible({ timeout: 15_000 });
});

test.afterAll(async () => {
  await app?.close();
});

test("NV-A-001 nuevo canvas se crea y se abre", async () => {
  const before = new Set(canvasFiles());
  await win.getByTitle("Nuevo canvas").click();
  // El explorador pide el nombre antes de crear el fichero.
  const prompt = win.getByRole("dialog", { name: "Nuevo canvas" });
  await expect(prompt).toBeVisible();
  await prompt.getByRole("textbox").fill(`E2E Canvas ${Date.now()}`);
  await prompt.getByRole("button", { name: "Crear" }).click();

  const canvas = win.getByRole("application", { name: "Canvas" });
  await expect(canvas).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => canvasFiles().filter((f) => !before.has(f)).length).toBe(1);
  const file = canvasFiles().find((f) => !before.has(f))!;
  expect(readFileSync(file, "utf-8")).toContain("nodes");
});

test("NV-A-002 una tarjeta de texto se guarda en el .canvas", async () => {
  const file = canvasFiles()[canvasFiles().length - 1]!;
  await win.getByTitle("Tarjeta de texto (Z)").click();
  // El guardado es debounced (700 ms): el lienzo escribe solo, sin Ctrl+S.
  await expect.poll(() => nodeIds(file).length).toBe(1);
  expect(existsSync(file)).toBe(true);
});

test("NV-A-003 deshacer quita la tarjeta y el fichero la refleja", async () => {
  const file = canvasFiles()[canvasFiles().length - 1]!;
  const [nodeId] = nodeIds(file);
  expect(nodeId).toBeTruthy();

  const undo = win.getByTitle("Deshacer (Ctrl+Z)");
  await expect(undo).toBeEnabled({ timeout: 15_000 });
  await undo.click();
  await expect(win.getByTitle("Rehacer (Ctrl+Y)")).toBeEnabled({ timeout: 15_000 });
  await expect.poll(() => nodeIds(file)).toEqual([]);
});

test("NV-A-004 abrir una nota deja el canvas", async () => {
  const title = `E2E Nota ${Date.now()}`;
  await win.keyboard.press("Control+P");
  const input = win.getByPlaceholder(/Busca una nota por nombre/);
  await expect(input).toBeVisible();
  await input.fill(title);
  await expect(win.getByText(`Crear nota «${title}»`)).toBeVisible();
  await win.keyboard.press("Enter");
  await expect(win.getByRole("application", { name: "Canvas" })).toHaveCount(0, { timeout: 15_000 });
  await expect(win.locator(".cm-content")).toBeVisible({ timeout: 15_000 });
});
