/**
 * `programming_practice` — the project SPECIFICATION (phase 1, `pp_build`) and the rule that keeps it honest.
 *
 * The user's rule, the whole point of this module: every weekly project is FULL STACK. A database, a backend and a client
 * are mandatory every time; automation is an optional extra that adds points and never replaces a layer. A frontend client
 * must also carry architecture, design patterns and Atomic Design; a backend carries a layered architecture.
 *
 * The model proposes, this validator disposes: a specification that misses a layer, has criteria that cannot be checked or
 * goes past the size limit is REJECTED and regenerated, so the rule never depends on the model remembering it.
 */

export const CLIENTS = ["web", "desktop", "mobile"] as const;
export type ClientKind = (typeof CLIENTS)[number];

/** What a week puts extra weight on (the "focus"): it adds criteria, it never removes a layer. */
export const FOCUSES = ["backend", "databases", "frontend", "desktop", "mobile", "automation"] as const;
export type Focus = (typeof FOCUSES)[number];

/** The size limit that keeps a weekly project small. */
export const SCOPE = { tables: { min: 1, max: 3 }, endpoints: { min: 2, max: 5 }, screens: { min: 1, max: 3 } } as const;

export interface LayerSpec {
  /** One sentence: what this layer is in THIS project. */
  summary: string;
  /** Acceptance criteria: each one must be something that can be checked (observable result, command, status code). */
  criteria: string[];
}

export interface ProjectSpec {
  /** Folder name the project will be built in (exactly what `pp_construct` creates). */
  folder: string;
  title: string;
  problem: string;
  client: ClientKind;
  focus: Focus;
  hours: number;
  stack: { database: string; backend: string; client: string };
  database: LayerSpec & { tables: string[] };
  backend: LayerSpec & { endpoints: string[]; architecture: string[] };
  clientLayer: LayerSpec & { screens: string[]; architecture: string[]; patterns: string[]; atomic: { atoms: string[]; molecules: string[]; organisms: string[] } };
  focusCriteria: string[];
  automation?: { summary: string; criteria: string[] };
  topics: string[];
  rubric: Array<{ criterion: string; weight: number }>;
  defenseQuestions: string[];
}

const BAD_FOLDER_CHARS = /[\\/:*?"<>|]/g;

/** A safe, readable folder name: `Link shortener with stats`. */
export function sanitizeFolderName(value: unknown): string {
  return String(value ?? "")
    .replace(BAD_FOLDER_CHARS, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .slice(0, 80)
    .trim();
}

const asStrings = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x ?? "").trim()).filter(Boolean) : []);
const asString = (v: unknown): string => String(v ?? "").trim();

function asLayer(v: any): LayerSpec {
  return { summary: asString(v?.summary), criteria: asStrings(v?.criteria) };
}

/** Normalises whatever the model returned into a ProjectSpec (missing pieces become empty so the validator can name them). */
export function normalizeSpec(raw: any): ProjectSpec {
  const client = asString(raw?.client).toLowerCase();
  const focus = asString(raw?.focus).toLowerCase();
  const c = raw?.clientLayer ?? raw?.client_layer ?? {};
  const atomic = c?.atomic ?? {};
  return {
    folder: sanitizeFolderName(raw?.folder || raw?.title),
    title: asString(raw?.title),
    problem: asString(raw?.problem),
    client: (CLIENTS as readonly string[]).includes(client) ? (client as ClientKind) : ("web" as ClientKind),
    focus: (FOCUSES as readonly string[]).includes(focus) ? (focus as Focus) : ("backend" as Focus),
    hours: Number(raw?.hours) || 0,
    stack: { database: asString(raw?.stack?.database), backend: asString(raw?.stack?.backend), client: asString(raw?.stack?.client) },
    database: { ...asLayer(raw?.database), tables: asStrings(raw?.database?.tables) },
    backend: { ...asLayer(raw?.backend), endpoints: asStrings(raw?.backend?.endpoints), architecture: asStrings(raw?.backend?.architecture) },
    clientLayer: {
      ...asLayer(c),
      screens: asStrings(c?.screens),
      architecture: asStrings(c?.architecture),
      patterns: asStrings(c?.patterns),
      atomic: { atoms: asStrings(atomic?.atoms), molecules: asStrings(atomic?.molecules), organisms: asStrings(atomic?.organisms) },
    },
    focusCriteria: asStrings(raw?.focusCriteria ?? raw?.focus_criteria),
    ...(raw?.automation && (raw.automation.summary || raw.automation.criteria)
      ? { automation: { summary: asString(raw.automation.summary), criteria: asStrings(raw.automation.criteria) } }
      : {}),
    topics: asStrings(raw?.topics),
    rubric: Array.isArray(raw?.rubric)
      ? raw.rubric.map((r: any) => ({ criterion: asString(r?.criterion), weight: Number(r?.weight) || 0 })).filter((r: { criterion: string }) => r.criterion)
      : [],
    defenseQuestions: asStrings(raw?.defenseQuestions ?? raw?.defense_questions),
  };
}

/**
 * A criterion is checkable when it names something observable. Cheap heuristic: it must be long enough to say something and
 * must not be pure praise ("clean code", "well designed", "looks good").
 */
const VAGUE = /^(clean|good|nice|well[- ]?(designed|written|structured)|looks? good|beautiful|readable|quality)\b/i;
export function isCheckable(criterion: string): boolean {
  const c = criterion.trim();
  return c.length >= 20 && !VAGUE.test(c);
}

const range = (n: number, r: { min: number; max: number }): boolean => n >= r.min && n <= r.max;

/**
 * The learner's stack: PostgreSQL is THE database; SQLite is only for desktop apps. The model proposes, this refuses.
 * A desktop client keeps its data in SQLite; web and mobile projects (which have a server) use PostgreSQL.
 */
export function databaseStackProblems(spec: Pick<ProjectSpec, "client" | "stack">): string[] {
  const db = spec.stack.database.toLowerCase();
  if (spec.client === "desktop") return /sqlite/.test(db) ? [] : ["stack: a desktop project stores its data in SQLite (PostgreSQL is for web and mobile backends)."];
  return /postgres/.test(db) ? [] : [`stack: the database of a ${spec.client} project is PostgreSQL (SQLite is only for desktop apps); got "${spec.stack.database}".`];
}

/** Every reason the specification breaks the rules. Empty means it is valid. */
export function validateSpec(spec: ProjectSpec, knownTopics?: ReadonlySet<string>): string[] {
  const p: string[] = [];
  if (!spec.folder) p.push("folder: a folder name is required (it is what pp_construct creates).");
  if (!spec.title) p.push("title: missing.");
  if (spec.problem.length < 40) p.push("problem: describe the problem in at least a couple of sentences.");
  if (!spec.stack.database || !spec.stack.backend || !spec.stack.client) p.push("stack: database, backend and client technologies must all be named.");
  else p.push(...databaseStackProblems(spec));
  if (spec.hours < 4 || spec.hours > 16) p.push("hours: a weekly project is 4 to 16 hours.");

  // The three mandatory layers.
  const layers: Array<["database" | "backend" | "clientLayer", LayerSpec]> = [["database", spec.database], ["backend", spec.backend], ["clientLayer", spec.clientLayer]];
  for (const [name, layer] of layers) {
    const label = name === "clientLayer" ? "client" : name;
    if (!layer.summary) p.push(`${label}: the layer is MANDATORY every week; describe it.`);
    if (layer.criteria.length < 3) p.push(`${label}: at least 3 acceptance criteria are required (got ${layer.criteria.length}).`);
    for (const c of layer.criteria) if (!isCheckable(c)) p.push(`${label}: criterion not checkable: "${c.slice(0, 60)}". Say what is observable (a status code, a command, a result).`);
  }

  // Size: a weekly project is a thin vertical slice.
  if (!range(spec.database.tables.length, SCOPE.tables)) p.push(`database: ${SCOPE.tables.min} to ${SCOPE.tables.max} tables (got ${spec.database.tables.length}).`);
  if (!range(spec.backend.endpoints.length, SCOPE.endpoints)) p.push(`backend: ${SCOPE.endpoints.min} to ${SCOPE.endpoints.max} endpoints (got ${spec.backend.endpoints.length}).`);
  if (!range(spec.clientLayer.screens.length, SCOPE.screens)) p.push(`client: ${SCOPE.screens.min} to ${SCOPE.screens.max} screens (got ${spec.clientLayer.screens.length}).`);

  // Backend: layered architecture.
  if (spec.backend.architecture.length < 2) p.push("backend: name the layers of its architecture (for example routes, services, repository).");

  // Client: architecture + design patterns + Atomic Design, for every kind of client.
  if (spec.clientLayer.architecture.length < 1) p.push("client: describe its architecture (where state lives, how it talks to the backend, folder structure).");
  if (spec.clientLayer.patterns.length < 1) p.push("client: name at least one design pattern it must use and where (for example container/presentational, custom hook, observer, adapter).");
  const a = spec.clientLayer.atomic;
  if (a.atoms.length < 2 || a.molecules.length < 1 || a.organisms.length < 1) p.push("client: Atomic Design is required: list at least 2 atoms, 1 molecule and 1 organism (screens are templates/pages).");

  // Focus: extra, checkable criteria.
  if (spec.focusCriteria.length < 2) p.push(`focus (${spec.focus}): at least 2 extra criteria specific to the focus.`);
  for (const c of spec.focusCriteria) if (!isCheckable(c)) p.push(`focus: criterion not checkable: "${c.slice(0, 60)}".`);
  if (spec.focus === "desktop" && spec.client !== "desktop") p.push("focus desktop requires client = desktop.");
  if (spec.focus === "mobile" && spec.client !== "mobile") p.push("focus mobile requires client = mobile.");
  if (spec.focus === "frontend" && spec.client === "mobile") p.push("focus frontend needs a web or desktop client.");

  // Automation is an EXTRA: when present it must be real, and it never counts as a replacement for a layer.
  if (spec.focus === "automation" && !spec.automation) p.push("focus automation needs an automation section (trigger, steps, idempotency, failure handling).");
  if (spec.automation && (!spec.automation.summary || spec.automation.criteria.length < 2)) p.push("automation: when present it needs a summary and at least 2 criteria.");

  // Rubric.
  if (spec.rubric.length < 4) p.push("rubric: at least 4 weighted criteria.");
  const total = spec.rubric.reduce((s, r) => s + r.weight, 0);
  if (spec.rubric.length && Math.abs(total - 100) > 1) p.push(`rubric: weights must add up to 100 (got ${total}).`);
  if (spec.topics.length < 3) p.push("topics: link at least 3 syllabus topics this project practises.");
  if (knownTopics) {
    const unknown = spec.topics.map((t) => t.replace(/^\[\[|\]\]$/g, "")).filter((t) => !knownTopics.has(t));
    if (unknown.length) p.push(`topics: not syllabus topics (use the exact names from the list): ${unknown.slice(0, 4).join("; ")}.`);
  }
  if (spec.defenseQuestions.length < 4) p.push("defenseQuestions: at least 4 questions about design decisions.");
  return p;
}

const bullets = (items: string[]): string => items.map((i) => `- ${i}`).join("\n");
const checks = (items: string[]): string => items.map((i) => `- [ ] ${i}`).join("\n");

/** `SPEC.md`: what the learner reads and builds against. */
export function renderSpecMarkdown(spec: ProjectSpec, meta: { created: string; week?: number } = { created: "" }): string {
  const c = spec.clientLayer;
  return [
    "---",
    "type: pp_spec",
    "subject: programming",
    `title: ${JSON.stringify(spec.title)}`,
    `folder: ${JSON.stringify(spec.folder)}`,
    `client: ${spec.client}`,
    `focus: ${spec.focus}`,
    `hours: ${spec.hours}`,
    ...(meta.week ? [`week: ${meta.week}`] : []),
    `created: ${meta.created}`,
    "---",
    "",
    `# ${spec.title}`,
    "",
    `**Focus of the week:** ${spec.focus} · **Client:** ${spec.client} · **Estimated time:** ${spec.hours} h`,
    "",
    "## Problem",
    spec.problem,
    "",
    "## Stack",
    `- Database: ${spec.stack.database}`,
    `- Backend: ${spec.stack.backend}`,
    `- Client: ${spec.stack.client}`,
    "",
    "## Database (mandatory)",
    spec.database.summary,
    "",
    "Tables:",
    bullets(spec.database.tables),
    "",
    "Acceptance criteria:",
    checks(spec.database.criteria),
    "",
    "## Backend (mandatory)",
    spec.backend.summary,
    "",
    "Architecture layers:",
    bullets(spec.backend.architecture),
    "",
    "Endpoints:",
    bullets(spec.backend.endpoints),
    "",
    "Acceptance criteria:",
    checks(spec.backend.criteria),
    "",
    "## Client (mandatory)",
    c.summary,
    "",
    "Screens:",
    bullets(c.screens),
    "",
    "Architecture:",
    bullets(c.architecture),
    "",
    "Design patterns to use:",
    bullets(c.patterns),
    "",
    "Atomic Design:",
    `- Atoms: ${c.atomic.atoms.join(", ")}`,
    `- Molecules: ${c.atomic.molecules.join(", ")}`,
    `- Organisms: ${c.atomic.organisms.join(", ")}`,
    "- Templates / pages: the screens above",
    "",
    "Acceptance criteria:",
    checks(c.criteria),
    "",
    `## Focus: ${spec.focus}`,
    checks(spec.focusCriteria),
    ...(spec.automation ? ["", "## Automation (extra)", spec.automation.summary, "", checks(spec.automation.criteria)] : []),
    "",
    "## Syllabus topics this practises",
    bullets(spec.topics.map((t) => (t.startsWith("[[") ? t : `[[${t}]]`))),
    "",
    "## Rubric",
    "| Criterion | Weight |",
    "|---|---|",
    ...spec.rubric.map((r) => `| ${r.criterion} | ${r.weight} |`),
    "",
    "## Defense questions (you will be asked these in pp_defend)",
    bullets(spec.defenseQuestions),
    "",
  ].join("\n");
}
