import { describe, expect, it } from "vitest";
import { areaDirs, areaReadme, projectFiles, projectFolderName, routeDirName, routeReadme, safeName, sanitizeProject } from "./projectTemplates";

const ctx = { area: "Backend", route: "Ruta Full Stack Junior", planId: "p1" };
const raw = {
  kind: "daily", title: "Feature del día: «What the backend is» con galería", description: "Una feature pequeña de punta a punta.", minutes: 66, weeklyPart: "Pieza 5 de 7", date: "2026-10-19",
  topics: ["4.1 What the backend is", "4.2 HTTP in depth", ""],
  sections: [{ areaId: "backend", what: "Un endpoint pequeño", how: ["Define ruta, verbo y códigos", "Valida la entrada", "Escribe una prueba"], result: "Un curl real devuelve el 2xx esperado" }],
};

describe("nombres de carpetas", () => {
  it("quita lo que Windows no admite y los puntos o espacios del final", () => {
    expect(safeName("Feature: «x» / y? <z>.  ")).toBe("Feature «x» y z");
    expect(safeName("a".repeat(200), 20)).toHaveLength(20);
    expect(routeDirName("Full Stack Junior · Entrevistas técnicas", "p1")).toBe("Ruta Full Stack Junior · Entrevistas técnicas");
    expect(routeDirName("", "2026-10-06_2027-04-05")).toBe("Ruta 2026-10-06_2027-04-05");
  });

  it("cada área va numerada con sus tres tipos de proyecto", () => {
    expect(areaDirs(0, "Backend")).toEqual({ dir: "1. Backend", kinds: { daily: "1.1 Proyectos diarios", weekly: "1.2 Proyectos semanales", monthly: "1.3 Proyectos mensuales" } });
    expect(areaDirs(2, "Frontend").kinds.monthly).toBe("3.3 Proyectos mensuales");
  });

  it("la carpeta de un proyecto lleva su fecha, semana o mes", () => {
    const p = sanitizeProject(raw, ctx)!;
    expect(projectFolderName(p)).toBe("2026-10-19 Feature del día «What the backend is» con galería");
    expect(projectFolderName({ kind: "weekly", title: "Vertical completa", week: 2 })).toBe("Semana 02 - Vertical completa");
    expect(projectFolderName({ kind: "monthly", title: "Consolidar", month: "2026-10" })).toBe("2026-10 - Consolidar");
  });
});

describe("sanitizeProject", () => {
  it("limpia lo que llega de fuera y rechaza lo que no tiene tipo o título", () => {
    const p = sanitizeProject(raw, ctx)!;
    expect(p).toMatchObject({ kind: "daily", minutes: 66, date: "2026-10-19", area: "Backend", planId: "p1" });
    expect(p.topics).toEqual(["4.1 What the backend is", "4.2 HTTP in depth"]);
    expect(p.sections[0]!.how).toHaveLength(3);
    expect(sanitizeProject({ ...raw, kind: "anual" }, ctx)).toBeNull();
    expect(sanitizeProject({ ...raw, title: "  " }, ctx)).toBeNull();
    expect(sanitizeProject(null, ctx)).toBeNull();
    expect(sanitizeProject({ ...raw, date: "ayer", minutes: -3 }, ctx)).not.toHaveProperty("date");
    expect(sanitizeProject({ ...raw, minutes: -3 }, ctx)).not.toHaveProperty("minutes");
  });
});

describe("plantilla de archivos", () => {
  it("un proyecto diario trae README, especificación, plan, bitácora, entrega y la carpeta de código", () => {
    const files = projectFiles(sanitizeProject(raw, ctx)!);
    expect(files.map((f) => f.name)).toEqual(["README.md", "01 Especificación.md", "02 Plan de trabajo.md", "03 Bitácora.md", "04 Entrega.md", "Código/LEEME.md"]);
    const readme = files[0]!.text;
    expect(readme).toContain("proyecto: diario");
    expect(readme).toContain("# Feature del día");
    expect(readme).toContain("## Qué hay que hacer\n- Un endpoint pequeño");
    expect(readme).toContain("1. Define ruta, verbo y códigos");
    expect(readme).toContain("## Resultado real (cómo sé que está hecho)\n- Un curl real devuelve el 2xx esperado");
    expect(readme).toContain("- [[4.1 What the backend is]]");
    expect(readme).toContain("Pieza del proyecto semanal que avanza:** Pieza 5 de 7");
    // el plan de trabajo trae los pasos como casillas y la especificación los criterios
    expect(files[2]!.text).toContain("- [ ] Valida la entrada");
    expect(files[1]!.text).toContain("- [ ] Un curl real devuelve el 2xx esperado");
    // sin Markdown suelto: todo el frontmatter se cierra
    for (const f of files.filter((x) => x.name.endsWith(".md") && x.name !== "Código/LEEME.md")) expect(f.text.startsWith("---\nproyecto:")).toBe(true);
  });

  it("el semanal añade defensa y postmortem; el mensual, retrospectiva; sin desglose usa pasos genéricos y no inventa nada", () => {
    const w = projectFiles(sanitizeProject({ kind: "weekly", title: "Vertical completa", week: 2, sections: [] }, ctx)!);
    expect(w.map((f) => f.name)).toContain("05 Defensa y postmortem.md");
    expect(w[0]!.text).toContain("1. Escribe la especificación.");
    expect(w[0]!.text).toContain("_Sin descripción");
    expect(w[0]!.text).toContain("semana 2");
    const m = projectFiles(sanitizeProject({ kind: "monthly", title: "Consolidar", month: "2026-10", sections: [] }, ctx)!);
    expect(m.map((f) => f.name)).toContain("05 Retrospectiva.md");
    expect(m.map((f) => f.name)).not.toContain("05 Defensa y postmortem.md");
  });

  it("los README de la ruta y del área describen la estructura", () => {
    const areas = [{ key: "backend", name: "Backend" }, { key: "databases", name: "Databases" }];
    const r = routeReadme("Ruta X", "X", areas);
    expect(r).toContain("- **1. Backend**\n  - 1.1 Proyectos diarios\n  - 1.2 Proyectos semanales\n  - 1.3 Proyectos mensuales");
    expect(r).toContain("- **2. Databases**");
    expect(r).toContain("Crear carpeta del proyecto");
    expect(areaReadme(1, areas[1]!, "Ruta X")).toContain("# 2. Databases");
  });
});
