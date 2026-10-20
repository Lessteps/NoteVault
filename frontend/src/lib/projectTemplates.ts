// Mentor — CARPETAS DE PROYECTOS: la estructura de carpetas por ruta y por área, y la plantilla de archivos .md de cada proyecto (diario, semanal o
// mensual). Módulo PURO y compartido (API y renderer): solo calcula nombres y textos; quien escribe en la vault es `api/modules/mentorProjects.ts`,
// que NUNCA sobrescribe un archivo que ya exista.
//
//   <Materia>/Mentor/<Ruta>/
//     README.md                                  cómo está organizado
//     1. Backend/
//       README.md
//       1.1 Proyectos diarios/<AAAA-MM-DD> <título>/
//       1.2 Proyectos semanales/Semana 02 - <título>/
//       1.3 Proyectos mensuales/<AAAA-MM> - <título>/
//     2. Databases/ …
//   Cada proyecto: README.md · 01 Especificación.md · 02 Plan de trabajo.md · 03 Bitácora.md · 04 Entrega.md (+ Defensa y postmortem / Retrospectiva) · Código/LEEME.md

export type ProjectKind = "daily" | "weekly" | "monthly";

export const KIND_DIR: Record<ProjectKind, { n: number; label: string; single: string }> = {
  daily: { n: 1, label: "Proyectos diarios", single: "Proyecto diario" },
  weekly: { n: 2, label: "Proyectos semanales", single: "Proyecto semanal" },
  monthly: { n: 3, label: "Proyectos mensuales", single: "Proyecto mensual" },
};

const clean = (s: unknown, max: number): string => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** Un nombre de carpeta o archivo seguro en Windows (sin `\ / : * ? " < > |` ni puntos o espacios al final). */
export const safeName = (s: string, max = 80): string => clean(s, 400).replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim().slice(0, max).replace(/[. ]+$/, "").trim();

/** La carpeta de la ruta dentro de la materia: `Mentor/Ruta <nombre del plan>`. */
export const routeDirName = (planName: string, planId: string): string => `Ruta ${safeName(planName, 70) || safeName(planId, 40) || "del plan"}`;

export interface AreaRef {
  /** `areaId` o id del subplan: la clave que usa la interfaz */
  key: string;
  name: string;
}

/** Las carpetas de un área numerada: `1. Backend` y sus tres subcarpetas. */
export function areaDirs(index: number, name: string): { dir: string; kinds: Record<ProjectKind, string> } {
  const n = index + 1;
  return {
    dir: `${n}. ${safeName(name, 60) || "Área"}`,
    kinds: Object.fromEntries((Object.keys(KIND_DIR) as ProjectKind[]).map((k) => [k, `${n}.${KIND_DIR[k].n} ${KIND_DIR[k].label}`])) as Record<ProjectKind, string>,
  };
}

export interface ProjectSectionIn {
  areaId?: string;
  what: string;
  how: string[];
  result: string;
}

export interface ProjectInput {
  kind: ProjectKind;
  title: string;
  description: string;
  minutes?: number;
  /** diario: la pieza del semanal que avanza */
  weeklyPart?: string;
  /** los temas que aplica */
  topics: string[];
  sections: ProjectSectionIn[];
  /** diario: AAAA-MM-DD */
  date?: string;
  /** semanal: número de semana del plan */
  week?: number;
  /** mensual: AAAA-MM */
  month?: string;
  area: string;
  route: string;
  planId: string;
}

/** Normaliza lo que llega de fuera (la interfaz): recorta, quita lo vacío y limita las listas. */
export function sanitizeProject(raw: unknown, ctx: { area: string; route: string; planId: string }): ProjectInput | null {
  const o = (raw && typeof raw === "object" ? raw : null) as Record<string, any> | null;
  if (!o) return null;
  const kind: ProjectKind | null = o.kind === "daily" || o.kind === "weekly" || o.kind === "monthly" ? o.kind : null;
  const title = clean(o.title, 140);
  if (!kind || !title) return null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(o.date ?? "")) ? String(o.date) : undefined;
  const month = /^\d{4}-\d{2}$/.test(String(o.month ?? "")) ? String(o.month) : undefined;
  const week = Math.round(Number(o.week));
  return {
    kind,
    title,
    description: clean(o.description, 700),
    ...(Number.isFinite(Number(o.minutes)) && Number(o.minutes) > 0 ? { minutes: Math.min(1440, Math.round(Number(o.minutes))) } : {}),
    ...(o.weeklyPart ? { weeklyPart: clean(o.weeklyPart, 200) } : {}),
    topics: (Array.isArray(o.topics) ? o.topics : []).map((t: unknown) => clean(t, 160)).filter(Boolean).slice(0, 12),
    sections: (Array.isArray(o.sections) ? o.sections : [])
      .map((s: any) => ({ ...(s?.areaId ? { areaId: clean(s.areaId, 40) } : {}), what: clean(s?.what, 500), how: (Array.isArray(s?.how) ? s.how : []).map((h: unknown) => clean(h, 240)).filter(Boolean).slice(0, 10), result: clean(s?.result, 500) }))
      .filter((s: ProjectSectionIn) => s.what || s.how.length || s.result)
      .slice(0, 8),
    ...(date ? { date } : {}),
    ...(Number.isFinite(week) && week >= 1 && week <= 200 ? { week } : {}),
    ...(month ? { month } : {}),
    area: clean(ctx.area, 80),
    route: clean(ctx.route, 120),
    planId: ctx.planId,
  };
}

/** El nombre de la carpeta de un proyecto: `2026-10-19 Título` · `Semana 02 - Título` · `2026-10 - Título`. */
export function projectFolderName(p: Pick<ProjectInput, "kind" | "title" | "date" | "week" | "month">): string {
  const title = safeName(p.title, 60) || "Proyecto";
  if (p.kind === "daily") return `${p.date ?? "sin fecha"} ${title}`;
  if (p.kind === "weekly") return `Semana ${String(p.week ?? 0).padStart(2, "0")} - ${title}`;
  return `${p.month ?? "sin mes"} - ${title}`;
}

const yaml = (s: string): string => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
const stamp = (p: ProjectInput): string => (p.kind === "daily" ? p.date ?? "" : p.kind === "weekly" ? `semana ${p.week ?? ""}` : p.month ?? "");

export interface TemplateFile {
  /** ruta relativa a la carpeta del proyecto */
  name: string;
  text: string;
}

/** Los archivos de un proyecto. Todos son Markdown para leer y rellenar; el código va en `Código/`. */
export function projectFiles(p: ProjectInput): TemplateFile[] {
  const k = KIND_DIR[p.kind];
  const L = (...lines: string[]): string => `${lines.join("\n")}\n`;
  const front = (extra: string[] = []): string[] => ["---", `proyecto: ${p.kind === "daily" ? "diario" : p.kind === "weekly" ? "semanal" : "mensual"}`, `area: ${yaml(p.area)}`, `ruta: ${yaml(p.route)}`, `plan: ${yaml(p.planId)}`, `titulo: ${yaml(p.title)}`, ...(stamp(p) ? [`cuando: ${yaml(stamp(p))}`] : []), "estado: pendiente", ...extra, "---"];
  const how = p.sections.flatMap((s) => s.how);
  const what = p.sections.map((s) => s.what).filter(Boolean);
  const result = p.sections.map((s) => s.result).filter(Boolean);
  const files: TemplateFile[] = [];

  files.push({
    name: "README.md",
    text: L(
      ...front([`tiempo: ${p.minutes ? `${p.minutes} min` : "sin estimar"}`]),
      `# ${p.title}`,
      "",
      `> ${k.single} de **${p.area}** · ${stamp(p) || "sin fecha"}${p.minutes ? ` · ${p.minutes} min previstos` : ""}`,
      "",
      "## De qué va",
      p.description || "_Sin descripción: escríbela en `01 Especificación.md`._",
      ...(p.weeklyPart ? ["", `**Pieza del proyecto semanal que avanza:** ${p.weeklyPart}`] : []),
      "",
      "## Qué hay que hacer",
      ...(what.length ? what.map((w) => `- ${w}`) : ["- Define qué vas a construir en `01 Especificación.md`."]),
      "",
      "## Cómo hacerlo",
      ...(how.length ? how.map((h, i) => `${i + 1}. ${h}`) : ["1. Escribe la especificación.", "2. Divide el trabajo en pasos en `02 Plan de trabajo.md`.", "3. Construye en la carpeta `Código/`.", "4. Prueba y anota la evidencia en `04 Entrega.md`."]),
      "",
      "## Resultado real (cómo sé que está hecho)",
      ...(result.length ? result.map((r) => `- ${r}`) : ["- Algo que se pueda ejecutar o enseñar, con su prueba. Una intención no cuenta."]),
      ...(p.topics.length ? ["", "## Temas que aplica", ...p.topics.map((t) => `- [[${t}]]`)] : []),
      "",
      "## Archivos de este proyecto",
      "- `01 Especificación.md` — qué, para qué y cuándo está terminado",
      "- `02 Plan de trabajo.md` — los pasos, con casillas",
      "- `03 Bitácora.md` — qué fuiste haciendo, bloqueos y dudas",
      "- `04 Entrega.md` — la evidencia del resultado real y lo que aprendiste",
      ...(p.kind === "weekly" ? ["- `05 Defensa y postmortem.md` — explicar el proyecto y qué harías distinto"] : []),
      ...(p.kind === "monthly" ? ["- `05 Retrospectiva.md` — qué pasó este mes y qué cambias el siguiente"] : []),
      "- `Código/` — todo el código y los archivos del proyecto",
    ),
  });

  files.push({
    name: "01 Especificación.md",
    text: L(
      ...front(),
      `# Especificación — ${p.title}`,
      "",
      "## Problema",
      "_¿Qué problema resuelve? Una o dos frases._",
      "",
      "## Alcance (lo que SÍ hace)",
      ...(what.length ? what.map((w) => `- ${w}`) : ["- "]),
      "",
      "## Fuera de alcance (lo que NO hace)",
      "- ",
      "",
      "## Criterios de aceptación",
      ...(result.length ? result.map((r) => `- [ ] ${r}`) : ["- [ ] "]),
      "- [ ] Tiene al menos una prueba (automática o con un comando que se pueda repetir).",
      "",
      "## Decisiones",
      "| Decisión | Por qué |",
      "|---|---|",
      "|  |  |",
    ),
  });

  files.push({
    name: "02 Plan de trabajo.md",
    text: L(
      ...front(),
      `# Plan de trabajo — ${p.title}`,
      "",
      p.minutes ? `Tiempo previsto: **${p.minutes} min**. Marca cada paso al terminarlo.` : "Marca cada paso al terminarlo.",
      "",
      "## Pasos",
      ...(how.length ? how.map((h) => `- [ ] ${h}`) : ["- [ ] Escribir la especificación", "- [ ] Construir lo mínimo que funcione", "- [ ] Probarlo y anotar la evidencia"]),
      "",
      "## Si me atasco",
      "- Anótalo en `03 Bitácora.md` y sigue con lo siguiente: el atasco también es un dato para el Mentor.",
    ),
  });

  files.push({
    name: "03 Bitácora.md",
    text: L(
      ...front(),
      `# Bitácora — ${p.title}`,
      "",
      "> Una entrada por sesión de trabajo. Lo que escribas aquí sirve para repasar y para que el Mentor entienda dónde te atascas.",
      "",
      "## Entrada 1",
      "- **Fecha y hora:** ",
      "- **Qué hice:** ",
      "- **Qué me bloqueó:** ",
      "- **Dudas:** ",
      "- **Siguiente paso:** ",
    ),
  });

  files.push({
    name: "04 Entrega.md",
    text: L(
      ...front(),
      `# Entrega — ${p.title}`,
      "",
      "## Resultado real",
      "_Pega la evidencia: el comando y su salida, una captura, un enlace al commit… Si no se puede enseñar, no está hecho._",
      "",
      "```text",
      "",
      "```",
      "",
      "## Cómo lo probé",
      "- ",
      "",
      "## Qué falló o quedó pendiente",
      "- ",
      "",
      "## Qué aprendí",
      "- ",
      "",
      "## Autoevaluación",
      "- Terminado: sí / no / a medias",
      "- Dificultad (1–5): ",
    ),
  });

  if (p.kind === "weekly") {
    files.push({
      name: "05 Defensa y postmortem.md",
      text: L(...front(), `# Defensa y postmortem — ${p.title}`, "", "## Defensa (explícalo como en una entrevista)", "- ¿Qué construiste y por qué así?", "- ¿Qué alternativa descartaste?", "- ¿Cómo lo probaste?", "", "## Postmortem", "- Qué salió bien:", "- Qué salió mal:", "- Qué harías distinto:", "- Una acción concreta para la próxima semana:"),
    });
  }
  if (p.kind === "monthly") {
    files.push({
      name: "05 Retrospectiva.md",
      text: L(...front(), `# Retrospectiva — ${p.title}`, "", "## Qué pasó este mes", "- Lo que se completó:", "- Lo que se quedó a medias:", "", "## Qué cambio el mes siguiente", "- Empezar a:", "- Dejar de:", "- Seguir con:"),
    });
  }

  files.push({
    name: "Código/LEEME.md",
    text: L("# Código", "", "Pon aquí el código y los archivos del proyecto: un repositorio pequeño, un script o lo que corresponda.", "Si usas Git, puedes inicializarlo dentro de esta carpeta (`git init`)."),
  });
  return files;
}

/** El README de la carpeta de la ruta. */
export function routeReadme(route: string, planName: string, areas: ReadonlyArray<AreaRef>): string {
  const L: string[] = ["---", "mentor: proyectos", `ruta: ${yaml(route)}`, "---", `# ${route}`, "", `Carpeta de proyectos de la ruta **${planName}**. La crea el Mentor y está organizada por área; cada proyecto tiene su propia carpeta con una plantilla de archivos.`, "", "## Estructura"];
  areas.forEach((a, i) => {
    const d = areaDirs(i, a.name);
    L.push(`- **${d.dir}**`, ...(Object.keys(KIND_DIR) as ProjectKind[]).map((k) => `  - ${d.kinds[k]}`));
  });
  L.push("", "## Cómo se usa", "1. En la pestaña de un área, en el proyecto diario, pulsa **«Crear carpeta del proyecto»**.", "2. Abre su `README.md`: dice qué hay que hacer, cómo y cuál es el resultado real.", "3. Construye en `Código/` y anota la evidencia en `04 Entrega.md`.", "", "Los archivos que ya existen nunca se sobrescriben.", "");
  return L.join("\n");
}

/** El README de la carpeta de un área. */
export function areaReadme(index: number, area: AreaRef, route: string): string {
  const d = areaDirs(index, area.name);
  return ["---", "mentor: proyectos-area", `area: ${yaml(area.name)}`, `ruta: ${yaml(route)}`, "---", `# ${d.dir}`, "", `Proyectos de **${area.name}** de la ruta ${route}.`, "", ...(Object.keys(KIND_DIR) as ProjectKind[]).map((k) => `- **${d.kinds[k]}**`), ""].join("\n");
}
