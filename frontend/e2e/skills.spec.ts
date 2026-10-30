import { test, expect, type Page } from "@playwright/test";
import { _electron as electron, type ElectronApplication } from "playwright";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { sandboxEnv } from "./helpers";

// Skills (barra derecha): ver, editar, guardar con historial (máx. 3), restaurar y pedir cambios. Electron real, vault aislada y sembrada.
const HERE = dirname(fileURLToPath(import.meta.url));
let app: ElectronApplication;
let win: Page;
let vault = "";
const skillFile = (f: string) => join(vault, "Programación", "_skills", f);
const panel = () => win.locator("aside[aria-label='Skills']");

test.beforeAll(async () => {
  const env = sandboxEnv();
  vault = join(env.NV_E2E_HOME!, "NoteVault");
  mkdirSync(join(vault, "Programación", "_skills"), { recursive: true });
  writeFileSync(join(vault, "Programación", "Programación.resumen.md"), "---\nsubject: programming\ntitle: Programación\n---\n# P\n");
  for (const f of ["resumen_teorico_skill.md", "mapa_skill.md", "practica_skill.md"]) writeFileSync(skillFile(f), `# ${f}\nversion 0\n`);
  app = await electron.launch({ args: [".", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"], cwd: join(HERE, ".."), env });
  win = await app.firstWindow();
  await win.waitForSelector("nav[aria-label='Módulos']", { timeout: 30_000 });
  await win.locator("nav[aria-label='Módulos']").getByRole("button", { name: "Notas" }).click();
});
test.afterAll(async () => { await app?.close(); });

test("SK-001 el botón Skills está justo debajo de Mentor y abre el panel con las tres skills", async () => {
  const strip = win.locator("aside[aria-label='Acceso panel lateral']");
  const labels = await strip.locator("button").evaluateAll((bs) => bs.map((b) => b.getAttribute("aria-label")));
  expect(labels.indexOf("Skills")).toBe(labels.indexOf("Mentor") + 1);
  await strip.getByRole("button", { name: "Skills" }).click();
  await expect(panel()).toBeVisible();
  for (const t of ["Notas", "Mapa", "Práctica"]) await expect(panel().getByRole("tab", { name: new RegExp(t) })).toBeVisible();
  await expect(panel().getByTestId("skill-editor")).toHaveValue(/version 0/);
});

test("SK-002 editar y guardar escribe la skill en la vault y guarda la anterior en el historial", async () => {
  const ed = panel().getByTestId("skill-editor");
  await expect(panel().getByTestId("skill-save")).toBeDisabled();
  await ed.fill("# resumen\nversion 1\n");
  await panel().getByTestId("skill-save").click();
  await expect.poll(() => readFileSync(skillFile("resumen_teorico_skill.md"), "utf8")).toContain("version 1");
  const hist = join(vault, ".notevault", "skills_history", "Programación", "theory");
  await expect.poll(() => readdirSync(hist).length).toBe(1);
  await panel().getByText(/Versiones anteriores/).click();
  await expect(panel().getByTestId("skill-past")).toHaveCount(1);
});

test("SK-003 solo se guardan 3 versiones anteriores", async () => {
  for (const n of [2, 3, 4, 5]) {
    await panel().getByTestId("skill-editor").fill(`# resumen\nversion ${n}\n`);
    await panel().getByTestId("skill-save").click();
    await expect.poll(() => readFileSync(skillFile("resumen_teorico_skill.md"), "utf8")).toContain(`version ${n}`);
    await win.waitForTimeout(1100); // los nombres de versión llevan segundos
  }
  await expect(panel().getByTestId("skill-past")).toHaveCount(3);
  expect(readdirSync(join(vault, ".notevault", "skills_history", "Programación", "theory"))).toHaveLength(3);
});

test("SK-004 restaurar una versión anterior la deja como la actual", async () => {
  win.once("dialog", (d) => void d.accept());
  await panel().getByTestId("skill-past-restore").first().click(); // la más reciente: version 4
  await expect.poll(() => readFileSync(skillFile("resumen_teorico_skill.md"), "utf8")).toContain("version 4");
  await expect(panel().getByTestId("skill-editor")).toHaveValue(/version 4/);
});

test("SK-005 cambiar de pestaña muestra otra skill; pedir un cambio como prompt copia el texto con la skill y la petición", async () => {
  await panel().getByTestId("skill-tab-canvas").click();
  await expect(panel().getByTestId("skill-editor")).toHaveValue(/mapa_skill/);
  await panel().getByTestId("skill-instruction").fill("Que cada panel del mapa tenga un título corto");
  await panel().getByTestId("skill-ask-prompt").click();
  await expect(win.getByText(/Prompt copiado/)).toBeVisible({ timeout: 10_000 });
  const clip = await app.evaluate(({ clipboard }) => clipboard.readText());
  expect(clip).toContain("Que cada panel del mapa tenga un título corto");
  expect(clip).toContain("mapa_skill"); // la skill actual va incrustada
  expect(readFileSync(skillFile("mapa_skill.md"), "utf8")).toContain("version 0"); // no guardó nada
});

test("SK-006 «Proponer con la IA» sin IA configurada avisa con claridad y no toca la skill", async () => {
  await panel().getByTestId("skill-ask-app").click();
  // el error del proveedor (aquí: clave inválida) sale en claro y con la salida alternativa
  await expect(win.getByText(/La IA de la app no pudo responder/)).toBeVisible({ timeout: 15_000 });
  await expect(win.getByText(/Copiar prompt para Antigravity/).first()).toBeVisible();
  await win.screenshot({ path: "/tmp/skills-panel.png" });
  expect(readFileSync(skillFile("mapa_skill.md"), "utf8")).toContain("version 0");
});

test("SK-007 se cierra con su botón y el resto de paneles siguen funcionando", async () => {
  await panel().getByRole("button", { name: "Cerrar Skills" }).click();
  await expect(panel()).toHaveCount(0);
  await win.locator("aside[aria-label='Acceso panel lateral']").getByRole("button", { name: "Asistente IA" }).click();
  await expect(panel()).toHaveCount(0);
});
