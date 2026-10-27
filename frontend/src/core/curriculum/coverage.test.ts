import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { coverageBadge } from "../../lib/curriculum";
import { curriculumAreas } from "./catalog";
import { computeCoverage, coverageGapsPromptSection, type ExistingTopic } from "./coverage";

const P = "Programación";
const topic = (folder: string, title?: string, curriculumId?: string): ExistingTopic => ({
  folder: `${P}/${folder}`,
  title: title ?? folder.split("/").pop()!.replace(/^\d+(\.\d+)*\s+/, ""),
  ...(curriculumId ? { curriculumId } : {}),
});

/** Forma real de la vault hoy: un tema general de HTML, uno de CSS (+ estilos), JavaScript de repaso y nada de Java. */
const TODAY: ExistingTopic[] = [
  topic("5 Frontend/5.1 The browser as a runtime and semantic HTML"),
  topic("5 Frontend/5.2 CSS"),
  topic("5 Frontend/5.4 JavaScript in the browser"),
  topic("5 Frontend/5.10 Forms and validation"),
  topic("5 Frontend/5.11 Styling"),
  topic("5 Frontend/5.14 Accessibility"),
  topic("2.2 JavaScript/2.2.1 Project structure, npm and modules"),
  topic("2.2 JavaScript/2.2.2 Variables, types and conversions"),
  topic("2.2 JavaScript/2.2.3 Operators, equality and type coercion"),
  topic("2.2 JavaScript/2.2.4 Functions"),
  topic("2.2 JavaScript/2.2.5 Control flow, loops and exceptions"),
  topic("2.2 JavaScript/2.2.6 Arrays and their methods"),
  topic("2.2 JavaScript/2.2.7 Objects, Sets and Maps"),
  topic("2.2 JavaScript/2.2.8 Strings and template literals"),
  topic("2.2 JavaScript/2.2.9 Classes, inheritance and prototypes"),
  topic("2.2 JavaScript/2.2.10 Higher-order functions and closures"),
  topic("2.2 JavaScript/2.2.11 Iterators and generators"),
  topic("2.2 JavaScript/2.2.12 Asynchronous programming"),
  topic("2.2 JavaScript/2.2.13 The event loop"),
  topic("2.2 JavaScript/2.2.14 Dates, regular expressions and utilities"),
  topic("2.2 JavaScript/2.2.15 JSON and runtime validation"),
  topic("4 Backend/4.1 What the backend is"),
  topic("2.1 Python/2.1.1 Project structure, virtual environments and imports"),
];

describe("computeCoverage", () => {
  const areas = curriculumAreas();

  it("la vault de hoy sale crítica en HTML, CSS y Java, y baja o crítica en JS reference", () => {
    const cov = computeCoverage(areas, TODAY);
    const by = Object.fromEntries(cov.areas.map((a) => [a.areaId, a]));
    expect(by.html!.level).toBe("critico");
    expect(by.css!.level).toBe("critico");
    expect(by.java!.level).toBe("critico");
    expect(["bajo", "critico"]).toContain(by["js-reference"]!.level);
    expect(by.java).toMatchObject({ covered: 0, partial: 0, pct: 0 });
    // los temas de repaso solo dan parcial, nunca cubierto
    for (const a of cov.areas) expect(a.covered, a.areaId).toBe(0);
    expect(by.css!.partial).toBeGreaterThan(20);
    expect(by.html!.partial).toBeGreaterThan(5);
    expect(by["js-reference"]!.partial).toBeGreaterThan(30);
    for (const a of cov.areas) expect(a.covered + a.partial + a.missing).toBe(a.total);
  });

  it("5.2 CSS toca flex, grid, position y @media de forma parcial", () => {
    const css = computeCoverage(areas, TODAY).areas.find((a) => a.areaId === "css")!;
    const status = (id: string) => css.rows.find((r) => r.entry.id === id)!;
    for (const id of ["css.flex-container", "css.grid-container", "css.position-absolute", "css.media-queries"]) {
      expect(status(id).status, id).toBe("parcial");
      expect(status(id).matchedFolders).toContain(`${P}/5 Frontend/5.2 CSS`);
    }
    expect(status("css.anchor-positioning").status).toBe("faltante");
  });

  it("curriculum_id en el frontmatter da cubierto exacto", () => {
    const topics = [...TODAY, topic("5 Frontend/CSS/5.2.5 Flexbox container", "Flex container properties", "css.flex-container")];
    const css = computeCoverage(areas, topics).areas.find((a) => a.areaId === "css")!;
    const row = css.rows.find((r) => r.entry.id === "css.flex-container")!;
    expect(row.status).toBe("cubierto");
    expect(row.suggestedFolder).toBe("");
    expect(css.covered).toBe(1);
  });

  it("un tema específico con título del catálogo cubre; uno genérico de repaso no", () => {
    const css = computeCoverage(areas, [...TODAY, topic("5 Frontend/CSS/5.2.9 Box shadows")]).areas.find((a) => a.areaId === "css")!;
    expect(css.rows.find((r) => r.entry.id === "css.box-shadow")!.status).toBe("cubierto");
    const js = computeCoverage(areas, TODAY).areas.find((a) => a.areaId === "js-reference")!;
    expect(js.rows.find((r) => r.entry.id === "js.array-mutators")!.status).toBe("parcial");
  });

  it("numera las carpetas propuestas en orden del catálogo saltando números ya usados", () => {
    const topics = [...TODAY, topic("5 Frontend/CSS/5.19.2 Something already there", "Something already there")];
    const css = computeCoverage(areas, topics).areas.find((a) => a.areaId === "css")!;
    const folders = css.rows.map((r) => r.suggestedFolder).filter(Boolean);
    expect(folders[0]).toBe(`${P}/5 Frontend/CSS/5.19.1 ${css.rows[0]!.entry.title}`);
    expect(folders[1]).toBe(`${P}/5 Frontend/CSS/5.19.3 ${css.rows[1]!.entry.title}`);
    const nums = folders.map((f) => Number(/\/5\.19\.(\d+) /.exec(f)![1]));
    expect(new Set(nums).size).toBe(nums.length);
    expect(nums).not.toContain(2);
    expect(nums).toEqual([...nums].sort((a, b) => a - b));
  });

  it("ignora temas de otros espacios", () => {
    const other: ExistingTopic = { folder: "Math/12 CSS/12.1 Flexbox", title: "Flex container properties", curriculumId: "css.flex-container" };
    const css = computeCoverage(areas, [other]).areas.find((a) => a.areaId === "css")!;
    expect(css.covered).toBe(0);
  });

  it("una área completa queda ok y sin marca de falta de desarrollo", () => {
    const html = areas.find((a) => a.id === "html")!;
    const all = html.entries.map((e, i) => topic(`5 Frontend/HTML/5.18.${i + 1} ${e.title}`, e.title, e.id));
    const cov = computeCoverage([html], all);
    expect(cov.areas[0]).toMatchObject({ pct: 100, level: "ok", missing: 0 });
    expect(coverageBadge(cov.areas[0]!)).toBe("");
    expect(coverageGapsPromptSection(cov)).toBe("");
  });

  it("el texto de huecos para el prompt lista primero lo esencial", () => {
    const text = coverageGapsPromptSection(computeCoverage(areas, TODAY), 5);
    expect(text).toContain("«5 Frontend/CSS»");
    expect(text).toContain("«14 Java»");
    expect(text).toMatch(/\[esencial,/);
  });

  const realVault = "C:/PROGRAMMING/Programación";
  it.skipIf(!fs.existsSync(realVault) || process.env.CI)("(informativo) cobertura sobre las carpetas reales de la vault", () => {
    const topics: ExistingTopic[] = [];
    for (const area of fs.readdirSync(realVault, { withFileTypes: true })) {
      if (!area.isDirectory() || area.name.startsWith("_") || area.name.startsWith(".")) continue;
      for (const t of fs.readdirSync(path.join(realVault, area.name), { withFileTypes: true })) {
        if (t.isDirectory()) topics.push(topic(`${area.name}/${t.name}`));
      }
    }
    const cov = computeCoverage(areas, topics);
    console.log(cov.areas.map((a) => `${a.areaId}: ${a.pct}% ${a.level} (covered ${a.covered}, partial ${a.partial}, missing ${a.missing} of ${a.total})`).join("\n"));
    expect(cov.areas).toHaveLength(5);
  });
});
