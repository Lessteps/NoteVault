// Genera las capturas del README y la landing con la app real (Electron) y datos de ejemplo.
// Uso: npx vite build && node tools/capture-screenshots.mjs [carpeta-de-salida]
// Por defecto escribe en ../landing/img. Usa un HOME aislado: no toca tu bóveda.
import { _electron as electron } from "playwright";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const OUT = resolve(process.argv[2] ?? join(ROOT, "..", "landing", "img"));
mkdirSync(OUT, { recursive: true });

const home = mkdtempSync(join(tmpdir(), "nv-shots-"));
const vault = join(home, "NoteVault");
mkdirSync(vault, { recursive: true });
writeFileSync(
  join(vault, "Bienvenida a NoteVault.md"),
  `---
title: Bienvenida a NoteVault
---

# Bienvenida a NoteVault

Esta nota es un archivo \`.md\` normal. Puedes abrirla con cualquier editor.

## Qué puedes hacer

- Escribir con **Markdown** y ver la vista previa mientras escribes.
- Enlazar notas con \`[[otra nota]]\` y organizar ideas en lienzos.
- Escribir fórmulas: $e^{i\\pi} + 1 = 0$

## Un ejemplo de código

\`\`\`python
def saludo(nombre: str) -> str:
    return f"Hola, {nombre}"
\`\`\`

> Tus datos son archivos tuyos.
`,
  "utf-8",
);

const app = await electron.launch({
  args: [".", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
  cwd: ROOT,
  env: { ...process.env, NV_E2E_HOME: home },
});
const win = await app.firstWindow();
await app.evaluate(({ BrowserWindow }) => {
  const w = BrowserWindow.getAllWindows()[0];
  w.setSize(1440, 900);
  w.center();
});
await win.waitForSelector("nav[aria-label='Módulos']", { timeout: 30_000 });
const rail = win.locator("nav[aria-label='Módulos']");

const shots = [
  ["vista-general", "Vista General"],
  ["calendario", "Calendario"],
  ["habitos", "Hábitos"],
  ["finanzas", "Finanzas"],
  ["ejercicio", "Ejercicio"],
];
for (const [file, label] of shots) {
  await rail.getByRole("button", { name: label }).click();
  await win.waitForTimeout(1500);
  await win.screenshot({ path: join(OUT, `${file}.png`) });
  console.log("captura", file);
}

await rail.getByRole("button", { name: "Notas" }).click();
await win.waitForTimeout(1000);
const note = win.getByText("Bienvenida a NoteVault", { exact: false }).first();
if (await note.isVisible().catch(() => false)) {
  await note.dblclick().catch(() => note.click());
  await win.waitForTimeout(2000);
}
await win.screenshot({ path: join(OUT, "notas.png") });
console.log("captura notas");

await app.close();
