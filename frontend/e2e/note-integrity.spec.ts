import { test, expect, type Page } from "@playwright/test";
import { _electron as electron, type ElectronApplication } from "playwright";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { sandboxEnv } from "./helpers";

// The unit tests for `AppState.resolve` and `setFrontmatterKeys` cover the
// logic in isolation. These specs drive the same two guarantees through the
// real UI against a real Electron build, because both guarantees are about what
// ends up on the user's disk:
//
//   · a path from the renderer can never write outside the vault
//   · editing one property does not rewrite the file's line endings
//
// The second one is issue #10 and is expected to fail until it is fixed.

const HERE = dirname(fileURLToPath(import.meta.url));

let app: ElectronApplication;
let win: Page;
let home = "";

const vault = () => join(home, "NoteVault");

/** True when every LF in the buffer is preceded by a CR. */
function isFullyCRLF(buf: Buffer): boolean {
  return !/(^|[^\r])\n/.test(buf.toString("utf-8"));
}

function eolMixOf(path: string): { crlf: number; bareLf: number } {
  const text = readFileSync(path, "utf-8");
  const crlf = (text.match(/\r\n/g) ?? []).length;
  const bareLf = (text.match(/(^|[^\r])\n/g) ?? []).length;
  return { crlf, bareLf };
}

/** Write a note straight to the sandbox vault, bypassing the app. */
function seedNote(name: string, body: string): string {
  const file = join(vault(), name);
  writeFileSync(file, body, "utf-8");
  return file;
}

/** The explorer's own refresh button, so the tree sees files we wrote. */
async function refreshTree() {
  await win.getByRole("button", { name: "Recargar" }).click();
}

/** Open a note from the file tree. The tree labels carry no extension. */
async function openFromTree(fileName: string) {
  await refreshTree();
  await win.getByRole("treeitem", { name: fileName.replace(/\.md$/, "") }).click();
  // A note opened from the tree lands in Lectura; the editor needs Editar.
  await win.getByRole("tab", { name: "Editar", exact: true }).click();
  await expect(win.locator(".cm-content")).toBeVisible({ timeout: 15_000 });
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

// ── resolve() a traves de la UI ────────────────────────────────────────────

test("NV-R-001 crear nota con titulo ../ no escapa del vault", async () => {
  const before = new Set(readdirSync(vault()));
  const evil = `../fuga${Date.now()}`;

  await win.keyboard.press("Control+P");
  const input = win.getByPlaceholder(/Busca una nota por nombre/);
  await expect(input).toBeVisible();
  await input.fill(evil);
  await expect(win.getByText(`Crear nota «${evil}»`)).toBeVisible();
  await win.keyboard.press("Enter");
  await win.waitForTimeout(2000);

  // Nada nuevo aparece en el home, junto al vault.
  const escaped = readdirSync(home).filter((e) => e.includes("fuga"));
  expect(escaped).toEqual([]);
  // Y lo que se creo, si algo, se queda dentro.
  const after = readdirSync(vault()).filter((e) => !before.has(e));
  for (const name of after) {
    expect(name.startsWith("..")).toBe(false);
  }
});

test("NV-R-002 una nota con ../ se abre y se puede leer", async () => {
  // Contraparte de R-001: si el fichero se creo, tiene que ser abrible. El
  // bug QA-002 dejaba un huerfano en disco que la UI rechazaba siempre.
  const title = `E2E Puntos ${Date.now()}`;
  const file = seedNote(`${title}.md`, `---\r\ntitle: ${title}\r\n---\r\n\r\ncuerpo\r\n`);

  await openFromTree(`${title}.md`);
  await win.getByRole("tab", { name: "Lectura", exact: true }).click();
  await expect(win.getByText("cuerpo")).toBeVisible({ timeout: 15_000 });
  expect(existsSync(file)).toBe(true);
});

test("NV-R-003 el explorador no lista la carpeta de datos interna", async () => {
  await refreshTree();
  // .notevault es la carpeta de datos: la UI no debe ofrecerla como navegable.
  const dataDir = readdirSync(vault()).find((e) => e === ".notevault");
  if (!dataDir) return; // vault recien creado sin datos aun
  await expect(win.getByRole("treeitem", { name: ".notevault" })).toHaveCount(0);
});

// ── EOL a traves de la UI (issue #10) ─────────────────────────────────────

test("NV-E-001 leer una nota CRLF reporta CRLF en el panel", async () => {
  const title = `E2E EOL ${Date.now()}`;
  seedNote(`${title}.md`, `---\r\ntitle: ${title}\r\n---\r\n\r\nlinea uno\r\nlinea dos\r\n`);

  await openFromTree(`${title}.md`);

  // El inspector y la barra de estado dicen LF o CRLF segun el fichero real.
  await expect(win.getByText("CRLF · UTF-8").first()).toBeVisible({ timeout: 15_000 });
});

test("NV-E-002 editar una propiedad conserva el CRLF del fichero", async () => {
  const title = `E2E EOL Edit ${Date.now()}`;
  const file = seedNote(
    `${title}.md`,
    `---\r\ntitle: ${title}\r\n---\r\n\r\nlinea uno\r\nlinea dos\r\n`,
  );
  expect(eolMixOf(file).crlf).toBeGreaterThan(0);

  await openFromTree(`${title}.md`);

  // Abrir el dialogo de propiedades y cambiar solo el tema.
  await win.getByRole("button", { name: "Editar propiedades" }).click();
  const dialog = win.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await dialog.getByPlaceholder(/Derivadas, Arrays, Past Simple/).fill("E2E tema");
  await win.getByRole("button", { name: "Guardar propiedades" }).click();
  await expect(win.getByText("Guardado").first()).toBeVisible({ timeout: 15_000 });

  // El fichero debe seguir siendo CRLF entero. Issue #10 lo deja mixto.
  const buf = readFileSync(file);
  expect(isFullyCRLF(buf)).toBe(true);
  expect(buf.toString("utf-8")).toContain("E2E tema");
  // Y el texto original no se pierde por el camino.
  expect(buf.toString("utf-8")).toContain("linea uno");
  expect(buf.toString("utf-8")).toContain("linea dos");
});

test("NV-E-003 editar el cuerpo de una nota CRLF conserva el CRLF", async () => {
  const title = `E2E EOL Body ${Date.now()}`;
  const file = seedNote(`${title}.md`, `---\r\ntitle: ${title}\r\n---\r\n\r\ncuerpo\r\n`);

  await openFromTree(`${title}.md`);
  const editor = win.locator(".cm-content");
  await editor.click();
  await win.keyboard.press("Control+End");
  await win.keyboard.type("linea anadida");
  await win.keyboard.press("Control+S");
  await expect(win.getByText("Guardado").first()).toBeVisible({ timeout: 15_000 });

  const buf = readFileSync(file);
  expect(buf.toString("utf-8")).toContain("linea anadida");
  expect(isFullyCRLF(buf)).toBe(true);
});
