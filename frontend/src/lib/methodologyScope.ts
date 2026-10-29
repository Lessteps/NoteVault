// Verificación de metodología — qué áreas del currículo de referencia mira cada pestaña, y el PROMPT para que cualquier IA (Antigravity, un modelo
// remoto, un chat) revise los temas y diga cuáles faltan o deben partirse en subtemas. Puro y determinista: sin disco, red ni IA.

export interface MethodologyScope {
  /** `all` = todas las áreas del plan; `area` = un área del plan (subplan); `group` = una asignatura dentro de un área */
  kind: "all" | "area" | "group";
  /** nombre visible: «Todas las áreas», «Frontend», «HTML» */
  label: string;
  areaName?: string;
  /** id de la asignatura (`html`, `css`, el de un lenguaje…) */
  groupId?: string;
  groupTitle?: string;
}

export interface ScopeTopic {
  folder: string;
  title: string;
  group?: string;
}

const fold = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Ids de las áreas del currículo de referencia (`html`, `css`, `atomic-design`, `js-reference`, `java`) que cuenta un texto («HTML», «JavaScript», «Frontend»…). */
export function curriculumIdsOfText(text: string): string[] {
  const t = fold(text);
  const out: string[] = [];
  if (/\bhtml\b/.test(t)) out.push("html");
  if (/\bcss\b/.test(t)) out.push("css");
  if (/atomic/.test(t)) out.push("atomic-design");
  if (/javascript|\bjs\b|typescript|\bts\b/.test(t)) out.push("js-reference");
  if (/\bjava\b/.test(t)) out.push("java");
  if (/frontend|front-end|front end/.test(t)) for (const id of ["html", "css", "atomic-design", "js-reference"]) if (!out.includes(id)) out.push(id);
  return out;
}

/** Áreas del currículo que verifica un alcance. Vacío = no hay referencia para ese alcance (p. ej. Python): se dice, no se inventa. */
export function curriculumIdsOfScope(scope: Pick<MethodologyScope, "kind" | "areaName" | "groupId" | "groupTitle">, allIds: readonly string[]): string[] {
  if (scope.kind === "all") return [...allIds];
  const ids = scope.kind === "group" ? curriculumIdsOfText(`${scope.groupId ?? ""} ${scope.groupTitle ?? ""}`) : curriculumIdsOfText(scope.areaName ?? "");
  return ids.filter((id) => allIds.includes(id));
}

/**
 * Reglas de metodología que la IA debe aplicar al revisar. Es el mismo criterio que usa el catálogo: en materias que se aprenden por patrones
 * (HTML, CSS, funciones y métodos de un lenguaje) hay UNA nota por elemento / propiedad / método; los temas grandes se parten en subtemas lineales.
 */
export const METHODOLOGY_RULES: readonly string[] = [
  "Subjects learned by patterns (HTML elements, CSS properties, language functions and methods) need ONE topic per element / property / method — never a single note that lists them all. Think of anatomy: you do not study every bone on one sheet.",
  "A topic that is a bundle of several concepts (functions, classes, selectors, layout…) must be split into ordered sub-topics: first an overview, then one sub-topic per piece, numbered N.M.K so learning is progressive and linear.",
  "Every sub-topic goes deep on its single piece: what it does, every value or form it accepts, defaults, interaction with neighbouring pieces, one common mistake, one realistic use.",
  "Order matters: foundations first, then the patterns that depend on them. If a topic needs another one that is missing, report the missing one first.",
];

/** El prompt de revisión: temas del alcance + reglas → la IA contesta qué temas faltan y cuáles partir. */
export function reviewPrompt(scope: MethodologyScope, topics: readonly ScopeTopic[], areaFolders: readonly string[] = []): string {
  const list = topics.length ? topics.map((t) => `- ${t.title}${t.group ? ` [${t.group}]` : ""} (${t.folder})`).join("\n") : "(no topics yet)";
  return [
    `Review the study topics of «${scope.label}» against the methodology below and tell me what is MISSING or must be SPLIT. Do not rewrite anything yet.`,
    "",
    "## Methodology",
    ...METHODOLOGY_RULES.map((r, i) => `${i + 1}. ${r}`),
    "",
    "## Topics I have now",
    list,
    ...(areaFolders.length ? ["", "## Vault folders for this scope", ...areaFolders.map((f) => `- ${f}`)] : []),
    "",
    "## Answer format",
    "1. **Topics to split** — for each: the current topic, and the ordered sub-topics it should become (one per element / property / method).",
    "2. **Missing topics** — grouped by subject, in learning order, each with a one-line reason.",
    "3. **Missing areas or subjects** — anything a working junior needs in this scope that has no topic at all.",
    "4. **Order problems** — any topic placed before one it depends on.",
    "Be concrete: name every element, property or method. Do not pad.",
  ].join("\n");
}

/** Prompt para que una IA externa revise qué ÁREAS faltan en el plan (no los temas de cada una). */
export function areasReviewPrompt(planAreas: ReadonlyArray<{ name: string; topics: number }>, vaultFolders: ReadonlyArray<{ label: string; topics: number }>): string {
  return [
    "Review the AREAS of my study plan (not the topics inside them) and tell me which areas or subjects are MISSING for a working junior full-stack developer.",
    "",
    "## Areas in the plan",
    ...(planAreas.length ? planAreas.map((a) => `- ${a.name} (${a.topics} topics)`) : ["(none)"]),
    "",
    "## Vault folders with topics that are NOT in the plan",
    ...(vaultFolders.length ? vaultFolders.map((f) => `- ${f.label} (${f.topics} topics)`) : ["(none)"]),
    "",
    "## Rules",
    ...METHODOLOGY_RULES.map((r, i) => `${i + 1}. ${r}`),
    "",
    "## Answer format",
    "1. **Missing areas** — name, why it matters, and the sub-subjects it needs (for patterns subjects like HTML and CSS: one topic per element / property).",
    "2. **Vault folders to add to the plan** — which of the listed folders belong in the plan, and as a new area or as a subject of an existing one.",
    "3. **Areas that should be split** — any area mixing unrelated subjects.",
  ].join("\n");
}
