import { test, expect, type Page } from "@playwright/test";
import { _electron as electron, type ElectronApplication } from "playwright";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { sandboxEnv } from "./helpers";

const HERE = dirname(fileURLToPath(import.meta.url));

let app: ElectronApplication;
let win: Page;
let home = "";

function exerciseDir(): string {
  return join(home, "NoteVault", ".notevault", "ejercicio");
}

function todayDayFile(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const iso = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  return join(exerciseDir(), String(d.getFullYear()), p(d.getMonth() + 1), `${iso}.json`);
}

function routinesFile(): string {
  return join(exerciseDir(), "exercises.json");
}

/** La biblioteca propia: el fichero que se crea al guardar el primer ejercicio tuyo. */
function libraryFile(): string {
  return join(exerciseDir(), "biblioteca.json");
}

const side = () => win.locator("aside[class*='w-[260px]']");

/**
 * Back to the daily view. The module remembers its last one, and today can be a
 * rest day (the default routine only fills Monday..Saturday), in which case the
 * header shows a different hint — the day list's own "no exercises" text is the
 * one thing every day has.
 */
async function gotoDiaria() {
  // La pantalla «Diaria» se fusionó dentro de Vista general: la sesión vive ahí.
  await side().getByRole("button", { name: "Vista general" }).click();
  await expect(
    win.getByText("Añádelos en «Ejercicios · Tu programa»").or(win.getByTitle("Mapa muscular del día")),
  ).toBeVisible({ timeout: 15_000 });
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
  await win.locator("nav[aria-label='Módulos']").getByRole("button", { name: "Ejercicio" }).click();
  await expect(side().getByRole("button", { name: "Vista general" })).toBeVisible({ timeout: 15_000 });
});

test.afterAll(async () => {
  await app?.close();
});

test("NV-X-001 el programa nace vacío y ofrece la biblioteca", async () => {
  await side().getByRole("button", { name: "Ejercicios" }).click();
  await expect(win.getByRole("heading", { name: "Ejercicios" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(win.getByRole("heading", { name: "Tu programa" })).toBeVisible({ timeout: 15_000 });
  // Ya no se siembran 50 ejercicios: el programa lo monta quien lo usa.
  await expect(win.getByText("Todavía no hay ejercicios")).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => existsSync(routinesFile())).toBe(true);
  const routine = JSON.parse(readFileSync(routinesFile(), "utf-8")) as unknown[];
  expect(Array.isArray(routine)).toBe(true);
  expect(routine.length).toBe(0);
});

/** Añade el primer ejercicio de la biblioteca al día de hoy. */
async function addFirstFromLibrary(): Promise<string> {
  await side().getByRole("button", { name: "Ejercicios" }).click();
  await win.getByRole("tab", { name: "Biblioteca" }).click();
  const row = win.locator("[data-slug]").first();
  const name = ((await row.locator("div").first().innerText()) ?? "").trim();
  await row.locator("[data-library-add]").click();
  await expect(row.locator("[data-library-add]")).toHaveAttribute("data-library-added", "true", {
    timeout: 15_000,
  });
  return name;
}

test("NV-X-002 marcar un ejercicio persiste en el dia", async () => {
  // Con el programa vacío no hay casillas que marcar: primero se añade uno.
  await addFirstFromLibrary();
  await gotoDiaria();
  const check = win.locator("input[type='checkbox'][aria-label^='Hecho:']").first();
  await expect(check).toBeVisible({ timeout: 15_000 });
  await check.click();
  await expect(check).toBeChecked({ timeout: 15_000 });
  const file = todayDayFile();
  await expect.poll(() => existsSync(file)).toBe(true);
  await expect.poll(() => readFileSync(file, "utf-8")).toContain("true");
  // Solo ese dia existe: el modulo no escribe la semana entera.
  const p = String(new Date().getMonth() + 1).padStart(2, "0");
  expect(readdirSync(join(exerciseDir(), String(new Date().getFullYear()), p)).length).toBe(1);
});

test("NV-X-003 la vista general y el progreso cambian el panel", async () => {
  await side().getByRole("button", { name: "Vista general" }).click();
  await expect(win.getByRole("heading", { name: "Vista general" })).toBeVisible({ timeout: 15_000 });

  // Las rejillas, el mapa y la gráfica viven dentro de Progreso.
  await side().getByRole("button", { name: "Progreso" }).click();
  await expect(win.getByRole("heading", { name: "Progreso" })).toBeVisible({ timeout: 15_000 });

  await expect(win.getByRole("tab", { name: "Rejilla" })).toHaveCount(1);
  await win.getByRole("tab", { name: "Músculos" }).click();
  await expect(win.getByRole("tab", { name: "Músculos" })).toHaveAttribute(
    "aria-selected",
    "true",
    { timeout: 15_000 },
  );
  await expect(win.getByRole("tab", { name: "Gráfica" })).toBeVisible({ timeout: 15_000 });
});

test("NV-X-004 el mapa muscular del dia se abre y se cierra", async () => {
  await gotoDiaria();
  await win.getByTitle("Mapa muscular del día").click();
  await expect(win.getByRole("dialog")).toBeVisible({ timeout: 15_000 });
  await win.keyboard.press("Escape");
  await expect(win.getByRole("dialog")).toHaveCount(0, { timeout: 15_000 });
});

test("NV-X-012 un ejercicio propio va a la biblioteca y avisa cuando lo cambias", async () => {
  // 1. En Ejercicios → Tu programa, se escribe un nombre y se guarda en la
  //    biblioteca. No debe tocar el programa.
  await side().getByRole("button", { name: "Ejercicios" }).click();
  // La pestaña activa se recuerda entre tests, y el anterior dejó la Biblioteca.
  await win.getByRole("tab", { name: "Tu programa" }).click();
  const name = win.locator('input[aria-label="Nombre"]');
  await expect(name).toBeVisible({ timeout: 15_000 });
  // Qué había en el programa antes: guardar en la biblioteca **no** debe tocarlo.
  const programaAntes = (JSON.parse(readFileSync(routinesFile(), "utf-8")) as unknown[]).length;
  await name.fill("Press banca propio");
  await win.locator("textarea").first().fill("1. Baja la barra\n2. Empuja");
  await win.locator("[data-library-save]").click();
  await expect(win.getByText(/guardado en la biblioteca/)).toBeVisible({ timeout: 15_000 });
  // Al programa no se le ha escrito nada.
  expect((JSON.parse(readFileSync(routinesFile(), "utf-8")) as unknown[]).length).toBe(programaAntes);

  // 2. En la Biblioteca aparece, sin imágenes pero con sus pasos.
  await win.getByRole("tab", { name: "Biblioteca" }).click();
  // `^=` porque los slugs propios llevan un sufijo: `mia-p21u9gpa`.
  const row = win.locator('[data-slug^="mia-"]').first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.click();
  const detail = win.locator("[data-library-detail]");
  await expect(detail).toContainText("Sin imágenes", { timeout: 15_000 });
  await expect(detail).toContainText("Baja la barra");

  // 3. Se añade al programa y queda con series propias.
  await row.locator("[data-library-add]").click();
  await expect(row.locator("[data-library-add]")).toHaveAttribute("data-library-added", "true", {
    timeout: 15_000,
  });

  // 4. Se le pone una serie, que es de la persona y no se toca después.
  await side().getByRole("button", { name: "Ejercicios" }).click();
  await win.getByRole("tab", { name: "Tu programa" }).click();
  await win.locator('[data-library-picker] input').first().fill("Press banca propio");
  const pick = win.locator("[data-library-pick]").first();
  await expect(pick).toBeVisible({ timeout: 15_000 });
  await pick.click();
  const series = win.locator('input[aria-label="Series × reps"]');
  await series.fill("4×6");
  await win.getByRole("button", { name: "Guardar ejercicio" }).click();

  // 5. Se cambia en la biblioteca: salta el aviso de copia desfasada.
  //    Tras guardar en el programa el formulario queda vacío, así que se vuelve
  //    a elegir la entrada —que rellena nombre y pasos— y luego se editan.
  await win.locator('[data-library-picker] input').first().fill("Press banca propio");
  await win.locator("[data-library-pick]").first().click();
  await win.locator("textarea").first().fill("1. Baja la barra al pecho\n2. Empuja sin bloquear");
  await win.locator("[data-library-save]").click();
  // El nombre ya existe en la biblioteca, así que hay que confirmar: es la red
  // antes de pisar una entrada.
  const avisar = win.getByRole("dialog", { name: "Actualizar en la biblioteca" });
  await expect(avisar).toBeVisible({ timeout: 15_000 });
  await avisar.getByRole("button", { name: "Actualizar" }).click();
  await expect(win.locator("[data-stale-banner]")).toBeVisible({ timeout: 15_000 });

  // 6. Al actualizar, cambian los pasos de la copia y las series siguen ahí.
  await win.locator("[data-stale-update]").click();
  await expect(win.locator("[data-stale-banner]")).toHaveCount(0, { timeout: 15_000 });
  await win.getByRole("tab", { name: "Tu programa" }).click();
// El test crea dos copias: la de la pestaña Biblioteca viene sin series —la
  // biblioteca no tiene prescripción— y la del programa con 4x6. Se afirma sobre
  // la que lleva números propios, que es la que tiene algo que perder.
  // La fila del programa no enseña los pasos: se asserta sobre el fichero, que
  // es donde vive la promesa del spec — los pasos nuevos entraron y **las
  // series siguen ahí**.
  const copia = (JSON.parse(readFileSync(routinesFile(), "utf-8")) as Array<{
    name: string;
    series_reps: string;
    how_to: string;
  }>).find((e) => e.series_reps === "4×6")!;
  expect(copia.how_to).toContain("Empuja sin bloquear");
});
test("NV-X-014 las flechas de Vista general cambian el día de la sesión", async () => {
  // Lo que la pantalla «Diaria» hacía con sus dos flechas, ahora en la cabecera
  // de Vista general. Antes esto solo lo cubría jsdom: aquí se prueba contra el
  // backend de verdad, que es quien decide qué ejercicios hay cada día.

  await side().getByRole("button", { name: "Vista general" }).click();
  const sesion = win.locator("[data-session-date]");
  await expect(sesion).toBeVisible({ timeout: 15_000 });

  // 1. Arranca en hoy.
  const iso = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    const p = (x: number) => String(x).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };
  await expect(sesion).toHaveAttribute("data-session-date", iso(0));

  // 2. «Anterior» retrocede un día. Las flechas viven en la cabecera; el mapa
  //    muscular tiene un «Anterior» propio, así que se toma el primero.
  await win.locator('button[aria-label="Anterior"]').first().click();
  await expect(sesion).toHaveAttribute("data-session-date", iso(-1));

  // 3. Y dos veces más, dos días.
  const prev = win.locator('button[aria-label="Anterior"]').first();
  await prev.click();
  await expect(sesion).toHaveAttribute("data-session-date", iso(-2));
  await prev.click();
  await expect(sesion).toHaveAttribute("data-session-date", iso(-3));

  // 4. «Siguiente» vuelve hacia hoy y no se pasa de ahí.
  const next = win.locator('button[aria-label="Siguiente"]').first();
  await next.click();
  await expect(sesion).toHaveAttribute("data-session-date", iso(-2));
  await next.click();
  await next.click();
  await expect(sesion).toHaveAttribute("data-session-date", iso(0));

  // 5. Un día futuro se pinta, pero sus ejercicios no se pueden marcar: aún no
  //    ha llegado. Es lo que impide apuntarse el programa de mañana por error.
  await next.click();
  await expect(sesion).toHaveAttribute("data-session-date", iso(1));
  const manana = win.locator("[data-session-date]").locator("input[type='checkbox']").first();
  if (await manana.count()) await expect(manana).toBeDisabled();
  await win.getByRole("button", { name: "Hoy" }).first().click();
  await expect(sesion).toHaveAttribute("data-session-date", iso(0));

  // 6. El día sobrevive a un cambio de pantalla. Antes vivía dentro de la
  //    vista, así que al ir a Progreso y volver saltaba a hoy.
  await prev.click();
  await prev.click();
  await expect(sesion).toHaveAttribute("data-session-date", iso(-2));
  await side().getByRole("button", { name: "Progreso" }).click();
  await expect(win.getByRole("heading", { name: "Progreso" })).toBeVisible({ timeout: 15_000 });
  await side().getByRole("button", { name: "Vista general" }).click();
  await expect(sesion).toHaveAttribute("data-session-date", iso(-2));
  await win.getByRole("button", { name: "Hoy" }).first().click();
});

test("NV-X-013 quitar tu entrada deshace la edición de un ejercicio del catálogo", async () => {
  // El camino que antes no existía: si escribes encima de Bench Press y te
  // arrepientes, sin este botón había que editar biblioteca.json a mano.

  const pasos = () => win.locator("[data-library-detail] ol li").count();

  // 1. Se edita Bench Press en la biblioteca, poniéndole un solo paso.
  await side().getByRole("button", { name: "Ejercicios" }).click();
  await win.getByRole("tab", { name: "Tu programa" }).click();
  await win.locator("[data-library-picker] input").first().fill("bench press");
  await win.locator("[data-library-pick]").first().click();
  await win.locator("textarea").first().fill("PASO MÍO ÚNICO");
  await win.locator("[data-library-save]").click();
  const avisar = win.getByRole("dialog", { name: "Actualizar en la biblioteca" });
  await expect(avisar).toBeVisible({ timeout: 15_000 });
  await avisar.getByRole("button", { name: "Actualizar" }).click();

  // 2. En la Biblioteca, el detalle ya enseña MI paso y no los del catálogo.
  await win.getByRole("tab", { name: "Biblioteca" }).click();
  await win.locator('[data-slug="bench-press"]').click();
  const detail = win.locator("[data-library-detail]");
  await expect(detail).toContainText("PASO MÍO ÚNICO", { timeout: 15_000 });
  expect(await pasos()).toBe(1);

  // 3. Se quita la entrada propia. Es una edición de un ejercicio del catálogo,
  //    así que el botón aparece igual: lo que se quita es lo tuyo, no el
  //    ejercicio.
  const quitar = win.locator("[data-library-remove]");
  await expect(quitar).toBeVisible({ timeout: 15_000 });
  await quitar.click();
  const confirmar = win.getByRole("dialog", { name: "Quitar de la biblioteca" });
  await expect(confirmar).toBeVisible({ timeout: 15_000 });
  await confirmar.getByRole("button", { name: "Quitar" }).click();

  // 4. Vuelve a mandar el catálogo. Tras quitar se deselecciona, así que hay
  //    que volver a elegir el ejercicio para ver que manda el catálogo.
  await expect(detail).toContainText("Elige un ejercicio", { timeout: 15_000 });
  await win.locator('[data-slug="bench-press"]').click();
  await expect(detail).not.toContainText("PASO MÍO ÚNICO", { timeout: 15_000 });
  // Sus pasos, los del catálogo: son varios y no el único mío.
  expect(await pasos()).toBeGreaterThan(1);
  // Y el botón desaparece: ya no hay nada tuyo que deshacer.
  await expect(win.locator("[data-library-remove]")).toHaveCount(0);

  // 5. Y el fichero se queda sin la entrada, que es la verdad.
  const biblio = JSON.parse(readFileSync(libraryFile(), "utf-8")) as {
    entries: Array<{ slug: string }>;
  };
  expect(biblio.entries.some((b) => b.slug === "bench-press")).toBe(false);
});
