import { test, expect, type Page } from "@playwright/test";
import { _electron as electron, type ElectronApplication } from "playwright";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync, statSync } from "node:fs";
import { sandboxEnv } from "./helpers";

const HERE = dirname(fileURLToPath(import.meta.url));

let app: ElectronApplication;
let win: Page;
let home = "";

function webDir(): string {
  return join(home, "NoteVault", ".notevault", "web");
}

/** Los ficheros .json del módulo web, por nombre. */
function webFiles(name: string): string | null {
  const file = join(webDir(), name);
  return existsSync(file) ? file : null;
}

const rail = () => win.locator("nav[aria-label='Módulos']");
const tab = (name: string) => win.getByRole("tab", { name, exact: true });

/** El prompt genérico de `askText`: pide un texto y devuelve lo escrito. */
async function askText(dialogName: string, value: string, confirm: string) {
  const dialog = win.getByRole("dialog", { name: dialogName });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("textbox").fill(value);
  await dialog.getByRole("button", { name: confirm }).click();
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
  await rail().getByRole("button", { name: "Navegador Web" }).click();
  await expect(tab("Navegador")).toBeVisible({ timeout: 15_000 });
});

test.afterAll(async () => {
  await app?.close();
});

test("NV-W-001 el módulo abre con sus cinco pestañas y sin páginas", async () => {
  for (const t of ["Navegador", "Marcadores", "Historial", "Tiempo", "Restricciones"]) {
    await expect(tab(t)).toBeVisible();
  }
  // De salida vienen activadas, en modo bloqueo de lista negra.
  await expect(win.getByText(/Reglas activas/)).toBeVisible({ timeout: 15_000 });
  // El navegador arranca sin páginas: el aviso ofrece abrir la primera.
  const aviso = win.getByText("No hay ninguna página abierta.");
  if (await aviso.count()) {
    await expect(aviso).toBeVisible();
    await expect(win.getByRole("button", { name: "Abrir la primera página" })).toBeVisible();
  }
});

test("NV-W-002 las cinco pestañas cambian la vista", async () => {
  await tab("Marcadores").click();
  await expect(win.getByRole("heading", { name: "Marcadores" })).toBeVisible({ timeout: 15_000 });
  await expect(win.getByText("Aún no hay marcadores.")).toBeVisible();

  await tab("Historial").click();
  await expect(win.getByRole("heading", { name: "Historial" })).toBeVisible({ timeout: 15_000 });
  await expect(win.getByText("Sin visitas ese día.")).toBeVisible();

  await tab("Tiempo").click();
  await expect(win.getByRole("heading", { name: "Tiempo en la web" })).toBeVisible({ timeout: 15_000 });

  await tab("Restricciones").click();
  await expect(win.getByRole("heading", { name: "Restricciones de contenido" })).toBeVisible({ timeout: 15_000 });
});

test("NV-W-003 añadir un marcador lo guarda en marcadores.json", async () => {
  await tab("Marcadores").click();
  const url = "https://ejemplo.dev/docs";
  const title = `E2E Marcador ${Date.now()}`;

  await win.getByRole("button", { name: "+ Añadir marcador" }).click();
  await askText("Dirección del marcador", url, "Siguiente");
  await askText("Nombre", title, "Guardar");

  await expect(win.getByText(title)).toBeVisible({ timeout: 15_000 });
  const file = webFiles("marcadores.json");
  expect(file).not.toBeNull();
  expect(readFileSync(file!, "utf-8")).toContain(title);
  expect(readFileSync(file!, "utf-8")).toContain(url);
});

test("NV-W-004 quitar un marcador lo saca de marcadores.json", async () => {
  const url = "https://ejemplo.dev/quita";
  const title = `E2E Quitar ${Date.now()}`;
  await win.getByRole("button", { name: "+ Añadir marcador" }).click();
  await askText("Dirección del marcador", url, "Siguiente");
  await askText("Nombre", title, "Guardar");
  const row = win.getByText(title);
  await expect(row).toBeVisible({ timeout: 15_000 });

  // El botón de papelera solo se ve al pasar el ratón por encima, y hay
  // uno por fila: se acota a la del marcador que se acaba de crear.
  const fila = row.locator("xpath=ancestor::div[contains(@class,'group')][1]");
  await fila.hover();
  await fila.getByTitle("Quitar marcador").click();

  await expect(win.getByText(title)).toHaveCount(0, { timeout: 15_000 });
  expect(readFileSync(webFiles("marcadores.json")!, "utf-8")).not.toContain(title);
});

test("NV-W-005 guardar reglas las escribe en restricciones.json", async () => {
  await tab("Restricciones").click();
  await expect(win.getByRole("checkbox", { name: "Reglas activadas" })).toBeChecked();

  // El store normaliza cada linea a su host: un dominio con ruta se queda
  // en el dominio, y es lo que se compara luego (tiktok.com cubre
  // m.tiktok.com pero no notiktok.com).
  await win.getByPlaceholder("tiktok.com").fill("ejemplo.dev/social\ntiktok.com\n");

  await win.getByRole("button", { name: "Guardar reglas" }).click();
  await expect(win.getByText("Reglas guardadas.")).toBeVisible({ timeout: 15_000 });

  const file = webFiles("restricciones.json");
  expect(file).not.toBeNull();
  const reglas = JSON.parse(readFileSync(file!, "utf-8")) as {
    enabled: boolean;
    mode: string;
    blocked_domains: string[];
  };
  expect(reglas.enabled).toBe(true);
  expect(reglas.mode).toBe("blocklist");
  expect(reglas.blocked_domains).toEqual(["ejemplo.dev", "tiktok.com"]);

  // Y la cabecera sigue anunciando que están activas.
  await expect(win.getByText(/Reglas activas/)).toBeVisible({ timeout: 15_000 });
});

test("NV-W-009 la cabecera refleja el estado solo tras guardar", async () => {
  await tab("Restricciones").click();
  const cabecera = win.getByRole("tablist", { name: "WEB" });
  await expect(cabecera).toContainText(/Reglas activas/);

  // Desmarcar sin guardar no cambia el anuncio: la cabecera refleja el disco,
  // no el formulario. Un nombre de dominio bloqueado no se aplica tampoco.
  await win.getByRole("checkbox", { name: "Reglas activadas" }).uncheck();
  await expect(cabecera).toContainText(/Reglas activas/);

  await win.getByRole("button", { name: "Guardar reglas" }).click();
  await expect(win.getByText("Reglas guardadas.").last()).toBeVisible({ timeout: 15_000 });
  await expect(cabecera).toContainText("Reglas desactivadas");
  expect(JSON.parse(readFileSync(webFiles("restricciones.json")!, "utf-8")).enabled).toBe(false);

  // Se deja como estaba para los tests siguientes.
  await win.getByRole("checkbox", { name: "Reglas activadas" }).check();
  await win.getByRole("button", { name: "Guardar reglas" }).click();
  await expect(cabecera).toContainText(/Reglas activas/, { timeout: 15_000 });
});

test("NV-W-006 cambiar a modo enfoque cambia los campos que se piden", async () => {
  await tab("Restricciones").click();
  await expect(win.getByRole("radio", { name: /Bloquear lo que indique/ })).toBeChecked();

  // En modo enfoque se piden los sitios permitidos, no los bloqueados.
  await win.getByRole("radio", { name: /Modo enfoque/ }).check();
  await expect(win.getByPlaceholder("wikipedia.org\ndocs.python.org")).toBeVisible();
  await expect(win.getByPlaceholder("tiktok.com")).toHaveCount(0);

  await win.getByRole("button", { name: "Guardar reglas" }).click();
  // El aviso sale por toast, en el HUD, no dentro del modulo.
  await expect(win.getByText("Reglas guardadas.").last()).toBeVisible({ timeout: 15_000 });
  expect(JSON.parse(readFileSync(webFiles("restricciones.json")!, "utf-8")).mode).toBe("allowlist");
  // El anuncio de arriba lo dice al volver a leer del disco.
  await expect(win.getByText(/modo enfoque/)).toBeVisible({ timeout: 15_000 });

  // Y se vuelve a bloqueo para no dejar el vault rareado.
  await win.getByRole("radio", { name: /Bloquear lo que indique/ }).check();
  await win.getByRole("button", { name: "Guardar reglas" }).click();
  await expect(win.getByText("Reglas guardadas.").last()).toBeVisible({ timeout: 15_000 });
  expect(JSON.parse(readFileSync(webFiles("restricciones.json")!, "utf-8")).mode).toBe("blocklist");
});

test("NV-W-007 los datos del módulo viven en .notevault/web y no en la raíz", () => {
  const dir = webDir();
  expect(statSync(dir).isDirectory()).toBe(true);
  // Los dos ficheros que este spec ha ido guardando, y solo esos.
  expect(existsSync(join(dir, "marcadores.json"))).toBe(true);
  expect(existsSync(join(dir, "restricciones.json"))).toBe(true);
  // Nada de web.json en la raíz: lo que viaja va en .notevault.
  expect(existsSync(join(home, "NoteVault", "web.json"))).toBe(false);
  expect(existsSync(join(home, "NoteVault", ".notevault-bookmarks.json"))).toBe(false);
});

test("NV-W-008 las restricciones no se guardan hasta pulsar el botón", async () => {
  await tab("Restricciones").click();
  const antes = readFileSync(webFiles("restricciones.json")!, "utf-8");
  await win.getByPlaceholder("tiktok.com").fill("sin-pulsar-guardar.test\n");
  // Mientras no se guarde, el fichero sigue igual.
  expect(readFileSync(webFiles("restricciones.json")!, "utf-8")).toBe(antes);

  await win.getByRole("button", { name: "Guardar reglas" }).click();
  await expect(win.getByText("Reglas guardadas.").last()).toBeVisible({ timeout: 15_000 });
  expect(readFileSync(webFiles("restricciones.json")!, "utf-8")).toContain("sin-pulsar-guardar.test");
});
