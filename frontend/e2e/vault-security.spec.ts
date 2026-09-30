import { test, expect, type Page } from "@playwright/test";
import { _electron as electron, type ElectronApplication } from "playwright";
import { join, dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync, readFileSync, appendFileSync, existsSync } from "node:fs";
import { sandboxEnv } from "./helpers";

const HERE = dirname(fileURLToPath(import.meta.url));

let app: ElectronApplication;
let win: Page;
let home = "";

const vault = () => join(home, "NoteVault");

function vaultFiles(): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out.push(p);
    }
  };
  walk(vault());
  return out;
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
});

test.afterAll(async () => {
  await app?.close();
});

test("NV-S-001 titulo con ../ no escapa del vault", async () => {
  const before = new Set(vaultFiles());
  const evil = `../fuga${Date.now()}`;
  await win.keyboard.press("Control+P");
  const input = win.getByPlaceholder(/Busca una nota por nombre/);
  await expect(input).toBeVisible();
  await input.fill(evil);
  await expect(win.getByText(`Crear nota «${evil}»`)).toBeVisible();
  await win.keyboard.press("Enter");
  // Dar tiempo al IPC: la creacion puede mostrar editor o toast de error.
  await win.waitForTimeout(2000);

  const after = vaultFiles().filter((f) => !before.has(f));
  // Contencion: todo lo creado queda dentro del vault...
  for (const f of after) {
    expect(resolve(f).startsWith(resolve(vault()) + sep)).toBe(true);
  }
  // ...y nada escapa al home (p. ej. `fuga*` junto al vault).
  const escaped = readdirSync(home).filter((e) => e.includes("fuga"));
  expect(escaped).toEqual([]);
});

test("NV-S-002 edicion externa + guardar muestra Conflicto sin perdida", async () => {
  const title = `E2E Conflicto ${Date.now()}`;
  await win.keyboard.press("Control+P");
  await win.getByPlaceholder(/Busca una nota por nombre/).fill(title);
  await expect(win.getByText(`Crear nota «${title}»`)).toBeVisible();
  await win.keyboard.press("Enter");
  const editor = win.locator(".cm-content");
  await expect(editor).toBeVisible({ timeout: 15_000 });
  await editor.click();
  await win.keyboard.press("Control+End");
  const mine = "texto mio E2E";
  await win.keyboard.type(`\n${mine}`);
  await win.keyboard.press("Control+S");
  await expect(win.getByText("Guardado").first()).toBeVisible({ timeout: 15_000 });

  // Cambio externo en disco (simula sync/edicion concurrente).
  const file = join(vault(), `${title}.md`);
  appendFileSync(file, "\nCAMBIO EXTERNO\n");

  await editor.click();
  await win.keyboard.type("\nsegunda edicion mia");
  // Sin Ctrl+S: el guardado forzado omite el chequeo mtime (pasa null).
  // El conflicto solo lo detecta el autosave (1200ms).
  await expect(win.getByRole("button", { name: "Conservar la mía" })).toBeVisible({ timeout: 15_000 });
  await expect(win.getByRole("button", { name: "Usar la del disco" })).toBeVisible();

  // Conservar la mia: el disco termina con mi texto, nada se pierde en silencio.
  await win.getByRole("button", { name: "Conservar la mía" }).click();
  await expect(win.getByText("Guardado").first()).toBeVisible({ timeout: 15_000 });
  const final = readFileSync(file, "utf-8");
  expect(final).toContain("segunda edicion mia");
});
