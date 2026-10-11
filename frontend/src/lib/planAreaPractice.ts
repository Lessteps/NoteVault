// SISTEMA DE PRÁCTICA PROPIO DE CADA ÁREA: qué se practica a diario, qué proyecto de fin de semana lo integra, qué integra cada mes, qué demuestra
// la habilidad y con qué lenguajes. Es una TABLA DE DATOS (`AREA_PRACTICE`), documentada en docs/VAULT_FORMAT.md («Práctica por área»); alimenta
// las plantillas deterministas de los proyectos diario / semanal / mensual (`planCurriculum.ts`) y los prompts de la IA.
//
// Módulo PURO y compartido (núcleo, API y renderer): sin node:* ni DOM.
//
// Ejemplo (palabras del usuario para Frontend): «lo mejor es crear frontend con JavaScript y practicar lógica usando HTML, CSS y JS/TS; yo me
// ponía a crear patrones de diseño (Atomic Design): una navbar, un hero…, creaba componentes cada día y el proyecto de fin de semana era juntarlo
// todo para una página completa». Por eso Frontend = un componente por día siguiendo Atomic Design (átomos → moléculas → organismos) y cada fin de
// semana una PÁGINA COMPLETA que los une. Los componentes del día alimentan el proyecto semanal.
//
// Modo «juntas» (`areaMode: "together"`): los proyectos integran las áreas: diario = una feature pequeña con front + endpoint + tabla; semanal =
// una vertical completa; mensual = una aplicación.

export interface AreaPracticeSystem {
  areaId: string;
  /** nombre del sistema («Componentes con Atomic Design») */
  name: string;
  /** qué se practica A DIARIO, con ejemplos concretos */
  daily: { summary: string; examples: string[] };
  /** proyecto de FIN DE SEMANA que integra lo diario */
  weekly: { summary: string; title: string };
  /** proyecto MENSUAL integrador */
  monthly: { summary: string; title: string };
  /** qué demuestra la habilidad (cómo se mide) */
  measure: string;
  /** lenguajes habituales */
  languages: string[];
}

export const AREA_PRACTICE: Readonly<Record<string, AreaPracticeSystem>> = {
  frontend: {
    areaId: "frontend",
    name: "Componentes con Atomic Design",
    daily: {
      summary: "Cada día creas un componente con HTML, CSS y JS/TS siguiendo Atomic Design: átomos (botón, campo, icono) → moléculas (campo con etiqueta, buscador, tarjeta) → organismos (navbar, hero, footer, formulario).",
      examples: ["Un botón con estados (hover, foco, deshabilitado)", "Una navbar responsive accesible con teclado", "Un hero con título, texto y llamada a la acción", "Una tarjeta de producto reutilizable"],
    },
    weekly: { summary: "El fin de semana juntas los componentes de la semana en una página completa (plantilla + contenido real).", title: "Página completa" },
    monthly: { summary: "Una aplicación web completa con tu sistema de componentes, estado y consumo de una API.", title: "Aplicación web con tu sistema de componentes" },
    measure: "Componentes reutilizables y accesibles (teclado, contraste, responsive) y una página completa que los une.",
    languages: ["JavaScript", "TypeScript"],
  },
  backend: {
    areaId: "backend",
    name: "Endpoints y servicios con pruebas",
    daily: {
      summary: "Cada día construyes un endpoint o servicio pequeño con su lógica de negocio, validación y pruebas.",
      examples: ["Un endpoint GET que lista recursos con paginación", "Un POST que valida y guarda", "Un servicio con una regla de negocio y su prueba unitaria", "Un middleware de autenticación"],
    },
    weekly: { summary: "El fin de semana juntas los endpoints de la semana en una API completa, documentada y con pruebas.", title: "API completa" },
    monthly: { summary: "Un servicio de producción pequeño: autenticación, persistencia, pruebas, registro de errores y documentación.", title: "Servicio completo" },
    measure: "Endpoints con validación y errores claros, pruebas que pasan en un comando y una API documentada.",
    languages: ["Python", "TypeScript", "JavaScript"],
  },
  databases: {
    areaId: "databases",
    name: "Diseño y consultas sobre un caso",
    daily: {
      summary: "Cada día diseñas una tabla o escribes consultas sobre un caso real pequeño (tienda, biblioteca, gimnasio).",
      examples: ["Diseñar una tabla con claves y restricciones", "Una consulta con JOIN de dos tablas", "Una agregación con GROUP BY y HAVING", "Un índice y la consulta que acelera"],
    },
    weekly: { summary: "El fin de semana juntas lo de la semana en un esquema completo y un conjunto de consultas sobre un caso.", title: "Esquema y consultas de un caso" },
    monthly: { summary: "Un modelo de datos normalizado con migraciones reproducibles, datos de ejemplo y consultas complejas.", title: "Modelo de datos con migraciones" },
    measure: "Esquema normalizado con claves e índices y consultas con joins y agregaciones que responden preguntas reales.",
    languages: ["SQL"],
  },
  automation: {
    areaId: "automation",
    name: "Scripts que resuelven una tarea",
    daily: {
      summary: "Cada día escribes un script en Python que automatiza una tarea concreta, con registro de lo que hizo.",
      examples: ["Renombrar archivos por un patrón", "Procesar un registro y resumir errores", "Descargar y guardar datos de una API", "Un backup con rotación"],
    },
    weekly: { summary: "El fin de semana juntas los scripts de la semana en una automatización completa, idempotente y con registro.", title: "Automatización completa" },
    monthly: { summary: "Un flujo automatizado de punta a punta, programado y con alertas de fallo.", title: "Flujo automatizado de punta a punta" },
    measure: "Scripts que se ejecutan sin intervención, dejan registro y fallan con mensajes claros.",
    languages: ["Python"],
  },
  tooling: {
    areaId: "tooling",
    name: "Repositorio de práctica",
    daily: {
      summary: "Cada día practicas Git, pruebas y calidad en un repositorio de práctica.",
      examples: ["Una rama con commits claros y un merge", "Una prueba que falla y luego pasa", "Configurar un linter y arreglar sus avisos", "Un hook de pre-commit"],
    },
    weekly: { summary: "El fin de semana juntas lo de la semana en un repositorio con historial limpio, pruebas y linters.", title: "Repositorio con pruebas y linters" },
    monthly: { summary: "Un proyecto con CI que ejecuta pruebas y linters en cada cambio y un README claro.", title: "Proyecto con integración continua" },
    measure: "Historial limpio, pruebas y linters automáticos y un README para contribuir.",
    languages: ["Git"],
  },
  desktop: {
    areaId: "desktop",
    name: "Pantallas de escritorio",
    daily: {
      summary: "Cada día construyes una pantalla o una función de una app de escritorio.",
      examples: ["Una ventana con un formulario y su validación", "Leer y guardar un archivo de configuración", "Un menú con atajos de teclado"],
    },
    weekly: { summary: "El fin de semana juntas las pantallas en una app de escritorio usable.", title: "App de escritorio" },
    monthly: { summary: "Una app de escritorio empaquetada con instalador.", title: "App de escritorio empaquetada" },
    measure: "Una app que se instala, se abre y guarda los datos del usuario de forma segura.",
    languages: ["TypeScript"],
  },
  mobile: {
    areaId: "mobile",
    name: "Pantallas móviles",
    daily: {
      summary: "Cada día construyes una pantalla o un flujo de una app móvil.",
      examples: ["Una lista con detalle", "Un formulario con teclado adecuado", "Guardar datos en local"],
    },
    weekly: { summary: "El fin de semana juntas las pantallas en una app móvil navegable.", title: "App móvil" },
    monthly: { summary: "Una app móvil con almacenamiento local y consumo de una API.", title: "App móvil con datos" },
    measure: "Una app que funciona sin conexión para lo básico y se prueba en emulador.",
    languages: ["TypeScript"],
  },
};

export const areaPracticeOf = (areaId: string | undefined): AreaPracticeSystem | undefined => AREA_PRACTICE[areaId ?? ""];

// ── Atomic Design (Frontend) ────────────────────────────────────────────

export type AtomicLevel = "átomo" | "molécula" | "organismo";
/** El ciclo de componentes diarios de Frontend: sube de átomos a organismos y vuelve a empezar con piezas nuevas. */
export const ATOMIC_CYCLE: ReadonlyArray<{ level: AtomicLevel; name: string }> = [
  { level: "átomo", name: "botón" },
  { level: "átomo", name: "campo de texto" },
  { level: "molécula", name: "campo con etiqueta y error" },
  { level: "molécula", name: "buscador" },
  { level: "organismo", name: "navbar" },
  { level: "organismo", name: "hero" },
  { level: "molécula", name: "tarjeta de producto" },
  { level: "organismo", name: "footer" },
  { level: "átomo", name: "icono con texto" },
  { level: "organismo", name: "formulario de contacto" },
  { level: "molécula", name: "migas de pan" },
  { level: "organismo", name: "galería de tarjetas" },
];

/** El componente del día `n` (0, 1, 2…, contando los días de Frontend del plan). */
export const atomicPieceOf = (n: number): { level: AtomicLevel; name: string } => ATOMIC_CYCLE[((n % ATOMIC_CYCLE.length) + ATOMIC_CYCLE.length) % ATOMIC_CYCLE.length]!;

const short = (t: string): string => t.replace(/^[\d.\s_-]+/, "").trim() || t;
const list = (xs: readonly string[]): string => {
  const u = [...new Set(xs.map(short))];
  return u.length <= 1 ? (u[0] ?? "") : `${u.slice(0, -1).join(", ")} y ${u[u.length - 1]}`;
};

export interface DailyPiece {
  title: string;
  description: string;
  /** para el proyecto semanal: el nombre corto de la pieza del día */
  piece: string;
}

/**
 * La pieza de práctica de un día del área `areaId` (`n` = nº de día de esa área en el plan, desde 0), aplicada a los temas del día.
 * Backend mantiene el título «Mini-endpoint de «…»»; Frontend crea el componente Atomic Design del ciclo.
 */
export function dailyPieceOf(areaId: string, n: number, topics: readonly string[], opts: { lang?: string; db?: string } = {}): DailyPiece | null {
  const t = list(topics);
  const first = short(topics[0] ?? "") || "el tema";
  const lang = opts.lang;
  switch (areaId) {
    case "frontend": {
      const c = atomicPieceOf(n);
      return {
        title: `Componente ${c.level}: ${c.name} (${first})`,
        description: `Crea ${c.level === "átomo" ? "un átomo" : c.level === "molécula" ? "una molécula" : "un organismo"} de Atomic Design: ${c.name}, con HTML, CSS y ${lang ?? "JS/TS"}, aplicando ${t}. Debe ser reutilizable, accesible y responsive.`,
        piece: `${c.name} (${c.level})`,
      };
    }
    case "backend":
      return {
        title: `Mini-endpoint de «${first}»${opts.db ? ` con «${short(opts.db)}»` : ""}`,
        description: `Un endpoint pequeño${lang ? ` en ${lang}` : ""} con su lógica y su prueba, que aplica ${t}${opts.db ? ` y guarda o lee datos con ${short(opts.db)}` : ""}.`,
        piece: `endpoint de ${first}`,
      };
    case "databases":
      return { title: `Esquema y consultas de «${first}»`, description: `Diseña las tablas de un caso pequeño y escribe las consultas que aplican ${t}.`, piece: `consultas de ${first}` };
    case "automation":
      return { title: `Script de «${first}»`, description: `Un script${lang ? ` en ${lang}` : ""} que automatiza una tarea aplicando ${t}, con registro de lo que hizo.`, piece: `script de ${first}` };
    case "tooling":
      return { title: `Práctica en el repositorio: «${first}»`, description: `Un cambio en tu repositorio de práctica que aplica ${t}, con su commit y su prueba.`, piece: `cambio de ${first}` };
    case "desktop":
      return { title: `Pantalla de escritorio de «${first}»`, description: `Una pantalla o función de una app de escritorio que aplica ${t}.`, piece: `pantalla de ${first}` };
    case "mobile":
      return { title: `Pantalla móvil de «${first}»`, description: `Una pantalla o flujo de una app móvil que aplica ${t}.`, piece: `pantalla de ${first}` };
    default:
      return null;
  }
}

/** El proyecto de FIN DE SEMANA de un área: junta las piezas de la semana. */
export function weeklyPieceOf(areaId: string, week: number, pieces: readonly string[]): { title: string; description: string } | null {
  const sys = areaPracticeOf(areaId);
  if (!sys) return null;
  const parts = pieces.length ? list(pieces) : "lo de la semana";
  if (areaId === "frontend") return { title: `Proyecto semanal ${week} · Página completa`, description: `Une en UNA página completa los componentes que creaste esta semana (${parts}): plantilla, contenido real, accesible y responsive.` };
  return { title: `Proyecto semanal ${week} · ${sys.weekly.title}`, description: `${sys.weekly.summary} Esta semana: ${parts}.` };
}

/** El proyecto MENSUAL de un área. */
export function monthlyPieceOf(areaId: string, label: string): { title: string; description: string } | null {
  const sys = areaPracticeOf(areaId);
  return sys ? { title: `${sys.monthly.title} · ${label}`, description: sys.monthly.summary } : null;
}

// ── Modo «juntas»: proyectos que integran las áreas ─────────────────────

/** El proyecto DIARIO que integra varias áreas: una feature pequeña (front + endpoint + tabla). */
export function integratedDaily(areaIds: readonly string[], topics: readonly string[], n: number): DailyPiece {
  const first = short(topics[0] ?? "") || "el tema del día";
  const has = (a: string): boolean => areaIds.includes(a);
  const layers = [has("frontend") ? "la interfaz (un componente)" : "", has("backend") ? "el endpoint" : "", has("databases") ? "la tabla y su consulta" : ""].filter(Boolean);
  const comp = has("frontend") ? atomicPieceOf(n) : null;
  return {
    title: `Feature del día: «${first}»${comp ? ` con ${comp.name}` : ""}`,
    description: `Una feature pequeña de punta a punta: ${layers.join(" + ") || "las áreas del día"}. Aplica ${list(topics.slice(0, 2)) || first}; al final se puede probar de principio a fin.`,
    piece: `feature de ${first}`,
  };
}

/** El proyecto SEMANAL integrador: una vertical completa. */
export function integratedWeekly(areaIds: readonly string[], week: number, pieces: readonly string[]): { title: string; description: string } {
  const names = areaIds.map((a) => (a === "databases" ? "base de datos" : a));
  return {
    title: `Proyecto semanal ${week} · Vertical completa`,
    description: `Une las features de la semana (${pieces.length ? list(pieces) : "las de cada día"}) en una vertical completa que cruza ${list(names)}: pantalla → endpoint → tabla, funcionando de principio a fin.`,
  };
}

// ── Habilidades clave de cada área (Sistema de práctica por área, ver docs/VAULT_FORMAT.md) ──────────────────────────────────────────
//
// Cada área tiene sus HABILIDADES MÁS IMPORTANTES, con una progresión de tres niveles (1 = principiante, 2 = intermedio, 3 = avanzado) que
// sube con el nivel medido o declarado del estudiante. De aquí salen `skills.md` de la carpeta del área, la rotación de los katas diarios
// (`areaPracticeSystem.ts`) y las barras de progreso por habilidad de la pestaña Práctica. Los textos van en inglés porque se escriben en la
// vault de Programación; los nombres de las habilidades son las que la persona verá en `skills.md` y en los katas.

export interface AreaSkill {
  /** id estable dentro del área (`endpoint_design`) */
  id: string;
  name: string;
  /** por qué importa en el área */
  why: string;
  /** cómo se mide (qué demuestra un kata hecho) */
  measure: string;
  /** qué se espera en cada nivel: principiante · intermedio · avanzado */
  levels: readonly [string, string, string];
}

export const AREA_SKILLS: Readonly<Record<string, readonly AreaSkill[]>> = {
  backend: [
    { id: "endpoint_design", name: "Endpoint design", why: "An API is a contract: resources, verbs, status codes and pagination decide whether clients can use it without guessing.", measure: "The endpoint list, request and response shapes and status codes match the stated rules.", levels: ["name resources and pick the right verb and status code", "paginate, filter and version a collection", "design for backwards compatibility and partial updates"] },
    { id: "validation_errors", name: "Validation and error contracts", why: "Most production bugs start with input nobody validated and errors nobody could read.", measure: "Every invalid input gets a stable error shape and the right 4xx code; nothing invalid reaches the service layer.", levels: ["reject missing and wrongly typed fields", "report all field errors at once with a stable shape", "separate validation, business and infrastructure errors"] },
    { id: "state_transitions", name: "States and transitions", why: "Orders, payments and jobs are state machines; illegal transitions are where data gets corrupted.", measure: "A table of allowed transitions is enforced and every forbidden one returns a clear conflict.", levels: ["model 3 states and reject skipping one", "add a guard and a side effect to a transition", "handle concurrent transitions of the same record"] },
    { id: "transactions_idempotency", name: "Transactions and idempotency", why: "Retries and partial failures are normal; a correct service survives them.", measure: "Running the same request twice, or failing halfway, leaves the data in a single consistent state.", levels: ["wrap two writes in one transaction", "make a POST safe to retry with an idempotency key", "reason about what happens when the process dies between steps"] },
    { id: "auth_security", name: "Authentication and authorization", why: "Knowing who is calling and what they may touch is the first security boundary.", measure: "Anonymous, wrong-owner and wrong-role calls are rejected with 401 or 403 and never leak data.", levels: ["protect a route with a token check", "enforce ownership of a record", "design roles and scopes, and avoid leaking existence through errors"] },
    { id: "service_testing", name: "Testing a service", why: "Tests are the only way to change a service without fear.", measure: "Tests cover the happy path, the boundaries and the failures, and fail when the code is broken.", levels: ["write a unit test for one rule", "test an endpoint with a fake repository", "write a contract test that would catch a breaking change"] },
  ],
  frontend: [
    { id: "component_composition", name: "Component composition", why: "Small components with clear props are what keeps a UI changeable.", measure: "The component is reusable with different props and has no hidden dependencies.", levels: ["split a screen into 3 components", "lift shared state up and pass it down", "compose with children and render props instead of flags"] },
    { id: "state_management", name: "State management", why: "Where state lives decides how many bugs the UI can have.", measure: "A single source of truth per piece of data; derived values are computed, not copied.", levels: ["keep a counter and a form field in local state", "derive values instead of storing them", "model a multi-step flow with a reducer or a state machine"] },
    { id: "accessibility", name: "Accessibility", why: "A page a keyboard or a screen reader cannot use is a broken page.", measure: "Everything is reachable and operable with the keyboard, has an accessible name and enough contrast.", levels: ["label every control and keep a visible focus", "manage focus in a dialog or menu", "announce dynamic changes and respect reduced motion"] },
    { id: "atomic_design", name: "Atomic Design", why: "Atoms, molecules and organisms give a repeatable way to build a design system.", measure: "Each piece is built only from smaller pieces and is reusable on another page.", levels: ["build an atom (button, field, icon)", "combine atoms into a molecule (search, labelled field)", "build an organism (navbar, hero, form) and place it in a template"] },
    { id: "async_ui", name: "Loading, error and empty states", why: "Real data is slow, missing or broken; the UI must say so.", measure: "Loading, error, empty and success are all rendered and the user can retry.", levels: ["show a loading and an error message", "handle empty results and retry", "cancel stale requests and avoid showing outdated data"] },
    { id: "responsive_layout", name: "Responsive layout", why: "Users arrive on every screen size.", measure: "No horizontal scrolling or overlapping from 320 px up; tap targets stay usable.", levels: ["make a card list reflow in one column on a phone", "use a grid with container or media queries", "handle long text, zoom 200 % and large screens"] },
    { id: "forms_validation", name: "Forms and validation", why: "Almost every product is forms; a form that explains itself is what users and interviewers notice.", measure: "Validation runs on the right moment, errors are tied to their field and announced, and the form never loses what the user typed.", levels: ["validate required fields and show a message next to each one", "validate on blur and on submit, disable double submit, keep the typed values after a server error", "handle async validation (taken username), field dependencies and accessible error summaries"] },
    { id: "ui_testing", name: "Testing a UI like a user", why: "Tests that click and read like a person survive refactors; tests of internals do not.", measure: "The tests find elements by role or label, cover the happy path and one failure, and do not depend on implementation details.", levels: ["test that a component renders its data and reacts to one click", "test a form flow with a failing and a passing submit, mocking only the network", "test loading, error and retry states and keep the suite deterministic"] },
    { id: "web_performance", name: "Rendering performance", why: "Speed is a feature: a fast page is the cheapest way to look senior.", measure: "The cost is measured before and after (not guessed), and the fix targets the real bottleneck.", levels: ["find one unnecessary re-render or oversized image and fix it", "split a bundle or lazy-load a route and measure the change", "budget Core Web Vitals (LCP, CLS, INP) and explain which change moved which metric"] },
  ],
  databases: [
    { id: "data_modeling", name: "Data modeling", why: "A good schema prevents whole families of bugs.", measure: "Tables, keys and constraints express the rules of the case; no duplicated facts.", levels: ["design 2 related tables with keys", "normalise a flat table and add constraints", "model many-to-many, history and soft deletes"] },
    { id: "joins_queries", name: "Queries and joins", why: "Answering a question with the right query is the daily work.", measure: "The query returns exactly the expected rows for the sample data, including the edge cases.", levels: ["filter and sort one table", "join two or three tables", "use subqueries, left joins and anti-joins correctly"] },
    { id: "aggregation", name: "Aggregation and windows", why: "Reports and metrics are aggregations.", measure: "Group counts, sums and rankings match the expected result, including empty groups.", levels: ["count and sum with GROUP BY", "filter groups with HAVING", "rank and compare rows with window functions"] },
    { id: "indexing", name: "Indexes and plans", why: "The same query can be fast or unusable.", measure: "You choose the right index and justify it with the query plan.", levels: ["explain what an index speeds up", "pick a composite index for a query", "read a plan and find the missing index or the bad join"] },
    { id: "transactions_locking", name: "Transactions and isolation", why: "Concurrent writes are where data gets corrupted.", measure: "You can predict the final data of two interleaved transactions.", levels: ["use BEGIN and COMMIT for a transfer", "explain what a dirty and a non-repeatable read are", "prevent lost updates with locking or constraints"] },
    { id: "migrations", name: "Migrations", why: "A schema changes with live data in it.", measure: "A migration applies and rolls back cleanly and keeps the existing data.", levels: ["add a column with a default", "split a column into two with a backfill", "plan a zero-downtime change"] },
  ],
  automation: [
    { id: "idempotent_scripts", name: "Idempotent scripts", why: "A script that is safe to run twice is a script you can schedule.", measure: "Running the script twice produces the same result as running it once.", levels: ["skip work that is already done", "detect changes with a checksum or a marker", "recover cleanly from a run that died halfway"] },
    { id: "parsing_text", name: "Parsing text and files", why: "Automation lives on logs, CSVs and JSON that are never clean.", measure: "Bad lines are reported, good lines are parsed, and the totals are right.", levels: ["parse a simple CSV or log line", "handle missing fields, quotes and encodings", "stream a large file without loading it all"] },
    { id: "scheduling", name: "Scheduling and triggers", why: "Work has to start by itself at the right time.", measure: "The job runs at the expected times and does not overlap with itself.", levels: ["write a cron expression", "avoid overlapping runs with a lock", "handle missed runs, time zones and daylight saving"] },
    { id: "retries_errors", name: "Errors, retries and partial failures", why: "Networks fail; a robust job retries what is safe and reports the rest.", measure: "Transient failures are retried with backoff, permanent ones are reported, and nothing is lost.", levels: ["catch and log an error with context", "retry with exponential backoff", "separate retryable from fatal errors and keep a dead-letter list"] },
    { id: "api_integration", name: "API integration", why: "Most automation glues services together.", measure: "Paging, rate limits and authentication are handled and the data arrives complete.", levels: ["call an API and read the JSON", "page through all results", "respect rate limits and refresh expired tokens"] },
    { id: "logging_alerts", name: "Logging and alerts", why: "Nobody watches a script; it has to tell you when it breaks.", measure: "A run leaves a readable log and a failure raises an alert.", levels: ["log start, end and counts", "use levels and structured fields", "alert on failure and on silence"] },
  ],
  tooling: [
    { id: "git_workflow", name: "Git workflow", why: "History is how a team understands and undoes changes.", measure: "The final history and working tree match the requested state, and the commands are safe.", levels: ["branch, commit and merge", "rebase and resolve a conflict", "recover lost work with reflog and revert a pushed commit"] },
    { id: "testing_practice", name: "Testing practice", why: "Fast tests are the safety net of every change.", measure: "Tests fail when the code is wrong and pass in one command.", levels: ["write a failing test, then make it pass", "test boundaries and errors", "isolate dependencies with fakes and keep tests deterministic"] },
    { id: "ci_pipeline", name: "CI pipelines", why: "A change should be checked by a machine before a human reads it.", measure: "The pipeline runs tests and linters on every change and fails for the right reasons.", levels: ["run tests on push", "cache dependencies and run jobs in parallel", "gate merges and deploys on the checks"] },
    { id: "dependencies", name: "Dependencies and environments", why: "It must build on every machine, not just yours.", measure: "A fresh clone installs and runs with one documented command.", levels: ["pin versions and use a virtual environment", "separate dev and production dependencies", "audit and update dependencies safely"] },
    { id: "debugging_tools", name: "Debugging and the terminal", why: "Finding the cause quickly is the most valuable skill.", measure: "You state a hypothesis, collect evidence with a tool, and fix the root cause.", levels: ["read a stack trace", "use a debugger and logs to narrow down", "bisect history to find the commit that broke it"] },
    { id: "code_quality", name: "Linting and code quality", why: "Automatic checks keep a codebase consistent.", measure: "The linter and formatter run clean and the rules are in the repository.", levels: ["configure a formatter", "add a linter and fix its warnings", "add pre-commit hooks and enforce them in CI"] },
  ],
  desktop: [
    { id: "ipc_design", name: "IPC design", why: "The main and renderer processes only talk through messages you design.", measure: "Each channel has a typed request and response and validates its input.", levels: ["send a message from renderer to main", "return typed results and errors", "design channels that can be cancelled and streamed"] },
    { id: "window_lifecycle", name: "Windows and lifecycle", why: "Apps must start, hide, restore and quit correctly.", measure: "State survives restarts and closing the last window behaves as intended.", levels: ["create a window and handle close", "restore size and position", "handle single instance, deep links and quit cleanup"] },
    { id: "secure_preload", name: "Secure preload and isolation", why: "The renderer must never get raw access to Node.", measure: "Only a minimal allow-listed API is exposed and inputs are validated.", levels: ["expose one function through the preload", "validate every argument in the main process", "audit an API surface for privilege escalation"] },
    { id: "file_persistence", name: "Files and persistence", why: "Users' data must never be lost or corrupted.", measure: "Writes are atomic and a corrupted file is recovered.", levels: ["save and load a JSON file", "write atomically and keep a backup", "migrate the format between versions"] },
    { id: "packaging_updates", name: "Packaging and updates", why: "An app nobody can install does not exist.", measure: "The app installs, starts and updates without manual steps.", levels: ["build an installer", "sign and version a release", "ship an update and roll back"] },
    { id: "native_integration", name: "Menus, shortcuts and native integration", why: "Desktop users expect native behaviour.", measure: "Menus, shortcuts, notifications and the tray work on the target OS.", levels: ["add a menu with a shortcut", "add a tray icon and a notification", "handle OS differences and accessibility"] },
  ],
  mobile: [
    { id: "navigation", name: "Navigation", why: "Moving between screens is the skeleton of a mobile app.", measure: "Back, deep links and state restoration behave as users expect.", levels: ["stack navigation between two screens", "tabs and passing parameters", "deep links and restoring state after the app was killed"] },
    { id: "app_lifecycle", name: "App lifecycle", why: "The OS can pause or kill your app at any time.", measure: "No data is lost when the app goes to background or is killed.", levels: ["react to foreground and background", "save a draft on pause", "resume long operations after a kill"] },
    { id: "offline_storage", name: "Local storage and offline", why: "Mobile connections come and go.", measure: "The app is usable offline for the basics and syncs afterwards.", levels: ["persist a small setting", "cache a list and show it offline", "queue writes and replay them when back online"] },
    { id: "permissions", name: "Permissions and privacy", why: "Users can refuse access, and often do.", measure: "Every denied permission leaves the app working with a clear explanation.", levels: ["request and check one permission", "explain why before asking", "degrade gracefully when permanently denied"] },
    { id: "sync_conflicts", name: "Syncing with a backend", why: "Two devices edit the same data.", measure: "Conflicts are detected and resolved without losing an edit.", levels: ["fetch and display remote data", "push local changes with retry", "resolve conflicts with timestamps or merge rules"] },
    { id: "mobile_performance", name: "Performance on a phone", why: "Phones are slow, small and run on battery.", measure: "Lists stay smooth and startup stays fast on a low-end device.", levels: ["render a long list efficiently", "avoid unnecessary re-renders", "profile startup and memory and fix the worst offender"] },
  ],
};

export const areaSkillsOf = (areaId: string | undefined): readonly AreaSkill[] => AREA_SKILLS[areaId ?? ""] ?? [];

/** El id lógico de skill de los katas de un área en el ledger de intentos (`pp_kata:backend`). La nota lleva `skill: pp_kata` y se atribuye al área por su carpeta. */
export const areaKataSkillId = (areaId: string): string => `pp_kata:${areaId}`;

/** El proyecto MENSUAL integrador: una aplicación. */
export function integratedMonthly(areaIds: readonly string[], label: string): { title: string; description: string } {
  return { title: `Aplicación del mes · ${label}`, description: `Una aplicación que integra las verticales semanales del mes${areaIds.length ? ` (${areaIds.map((a) => AREA_PRACTICE[a]?.name ?? a).slice(0, 4).join(" · ")})` : ""}: interfaz, API y base de datos.` };
}

// ── Proyectos diario y semanal, desglosados por ÁREA: qué hay que hacer, cómo y qué resultado REAL se espera ──────────────────────────────
//
// Un proyecto sin resultado comprobable es una lista de buenas intenciones: cada sección dice QUÉ se construye en esa área, CÓMO se hace paso a paso
// y qué RESULTADO REAL hay que poder enseñar (un comando que se ejecuta, una respuesta, una captura, una prueba que pasa). El diario es una pieza
// pequeña que toca un poco de cada área; el semanal es la vertical completa, con más exigencia, sobre los temas aprendidos en la semana.

export interface ProjectSection {
  areaId: string;
  area: string;
  /** qué se construye en esa área */
  what: string;
  /** cómo hacerlo, en pasos */
  how: string[];
  /** el resultado real que debe poder enseñarse */
  result: string;
}

const FALLBACK_LABEL: Record<string, string> = { backend: "Backend", frontend: "Frontend", databases: "Databases", tooling: "Tooling and Quality", automation: "Automation", desktop: "Desktop", mobile: "Mobile" };
const ORDER = ["databases", "backend", "frontend", "tooling", "automation", "desktop", "mobile"];

const ordered = (areaIds: readonly string[]): string[] => [...new Set(areaIds)].sort((a, b) => (ORDER.indexOf(a) < 0 ? 99 : ORDER.indexOf(a)) - (ORDER.indexOf(b) < 0 ? 99 : ORDER.indexOf(b)));

/** El desglose del proyecto DIARIO: una pieza pequeña por área, aplicada a los temas del día. */
export function dailyBreakdown(areaIds: readonly string[], topics: readonly string[], opts: { lang?: string; db?: string } = {}): ProjectSection[] {
  const first = short(topics[0] ?? "") || "el tema del día";
  const t = list(topics.slice(0, 2)) || first;
  const lang = opts.lang ? ` en ${opts.lang}` : "";
  const out: ProjectSection[] = [];
  for (const id of ordered(areaIds)) {
    const area = FALLBACK_LABEL[id] ?? id;
    switch (id) {
      case "databases":
        out.push({
          areaId: id, area,
          what: `La tabla (o el cambio de tabla) que necesita la pieza del día y una consulta que la use, aplicando ${t}.`,
          how: ["Escribe la migración con restricciones (NOT NULL, UNIQUE o CHECK donde corresponda).", "Carga 5 filas de prueba, incluidas un caso límite y un duplicado.", "Escribe la consulta y mira su plan con EXPLAIN."],
          result: "La migración corre sobre una base vacía y la consulta devuelve las filas esperadas: pega el resultado y el EXPLAIN en tu README.",
        });
        break;
      case "backend":
        out.push({
          areaId: id, area,
          what: `Un endpoint pequeño${lang} para «${first}», con su validación y su prueba.`,
          how: ["Define ruta, verbo y códigos de estado antes de programar.", "Valida la entrada y devuelve un error con forma fija (un 422 claro).", "Escribe una prueba del caso feliz y de un fallo."],
          result: "Un curl real contra tu servidor devuelve el 2xx esperado y un 4xx cuando la entrada es inválida; la prueba pasa.",
        });
        break;
      case "frontend":
        out.push({
          areaId: id, area,
          what: `Un componente reutilizable que muestra el dato de «${first}» consumiendo tu endpoint.`,
          how: ["Haz el componente puro: recibe datos por props.", "Cubre cuatro estados: cargando, error con reintento, vacío y con datos.", "Revisa a 320 px y con el teclado (foco visible, etiquetas)."],
          result: "El componente se ve en el navegador con datos reales de tu API y los cuatro estados se pueden provocar a mano.",
        });
        break;
      case "tooling":
        out.push({
          areaId: id, area,
          what: "Que la pieza del día se pueda instalar, comprobar y ejecutar con comandos, sin pasos mentales.",
          how: ["Añade un script `check` que corra el linter y las pruebas.", "Haz un commit pequeño con un mensaje que explique el porqué.", "Anota en el README el comando exacto para arrancarlo."],
          result: "En un clon limpio, `check` termina en verde con un solo comando.",
        });
        break;
      case "automation":
        out.push({
          areaId: id, area,
          what: `Un script${lang} que automatiza una tarea repetible de la pieza (cargar datos de prueba, limpiar, exportar).`,
          how: ["Hazlo idempotente: ejecutarlo dos veces deja el mismo estado.", "Registra qué hizo y qué falló.", "Sal con código distinto de 0 si algo falla."],
          result: "Lo ejecutas dos veces seguidas: el segundo run no cambia nada y el log lo dice.",
        });
        break;
      case "desktop":
        out.push({ areaId: id, area, what: `Una acción de escritorio ligada a «${first}» pasando por IPC con un canal con nombre.`, how: ["Declara el canal y valida lo que llega al proceso principal.", "Expón solo esa función en el preload.", "Llama desde la interfaz y muestra el resultado."], result: "Pulsas el botón y ves el resultado del proceso principal en la ventana." });
        break;
      case "mobile":
        out.push({ areaId: id, area, what: `Una pantalla móvil para «${first}» que funciona sin conexión.`, how: ["Guarda lo necesario en almacenamiento local.", "Muestra el estado sin red.", "Sincroniza al volver la conexión."], result: "Con el modo avión activado la pantalla sigue mostrando los datos guardados." });
        break;
      default:
        out.push({ areaId: id, area, what: `Una pieza pequeña de ${area} aplicando ${t}.`, how: ["Define qué entrega la pieza.", "Constrúyela en un paso verificable.", "Comprueba el resultado con un comando o una captura."], result: "Puedes enseñar el resultado funcionando." });
    }
  }
  return out;
}

/** El desglose del proyecto SEMANAL: la vertical completa, con más exigencia y resultados reales medibles. */
export function weeklyBreakdown(areaIds: readonly string[], week: number, pieces: readonly string[]): ProjectSection[] {
  const feats = list(pieces.slice(0, 3)) || "las piezas de la semana";
  const out: ProjectSection[] = [];
  for (const id of ordered(areaIds)) {
    const area = FALLBACK_LABEL[id] ?? id;
    switch (id) {
      case "databases":
        out.push({
          areaId: id, area,
          what: `El esquema completo de la semana ${week}: al menos 3 tablas relacionadas, con migraciones versionadas y los datos de ${feats}.`,
          how: ["Modela las relaciones y las claves antes de escribir SQL.", "Añade restricciones e índices justificados por una consulta real.", "Crea un seed repetible y una consulta de reporte con agregación."],
          result: "`migrate up` y `migrate down` funcionan sin errores; el EXPLAIN de la consulta crítica usa el índice y lo demuestras con la salida.",
        });
        break;
      case "backend":
        out.push({
          areaId: id, area,
          what: `Una API por capas (rutas, servicios, repositorio) con 4–6 endpoints que cubren ${feats}.`,
          how: ["Separa HTTP, reglas y SQL en capas distintas.", "Un contrato de errores único y autenticación en las rutas de escritura.", "Pruebas de servicio sin base de datos y pruebas de ruta con ella."],
          result: "La suite de pruebas pasa y tienes una colección de curl (o archivo .http) que recorre todos los endpoints con respuestas reales.",
        });
        break;
      case "frontend":
        out.push({
          areaId: id, area,
          what: `Dos o tres pantallas que consumen la API de verdad: lista, detalle y un formulario con validación para ${feats}.`,
          how: ["Organiza en átomos, moléculas y organismos; el estado vive en un solo sitio.", "Formulario con validación por campo y errores del servidor visibles.", "Cuatro estados de datos y revisión de accesibilidad y 320 px."],
          result: "Recorres el flujo completo en el navegador contra tu API real y grabas el recorrido (captura o GIF) sin errores en consola.",
        });
        break;
      case "tooling":
        out.push({
          areaId: id, area,
          what: "El proyecto listo para que otra persona lo ejecute: scripts, calidad automática y documentación.",
          how: ["Un solo comando instala, comprueba y arranca.", "Linter, formateador y pruebas en un hook o en CI.", "README con requisitos, comandos y decisiones."],
          result: "Un clon nuevo del repo arranca siguiendo solo el README y el pipeline local termina en verde.",
        });
        break;
      case "automation":
        out.push({
          areaId: id, area,
          what: "Una tarea automática de la semana (importación, copia de seguridad o reporte) con reintentos y registro.",
          how: ["Idempotente y con reintentos con espera creciente.", "Registro estructurado de lo procesado y de los fallos.", "Programada o disparada por un comando documentado."],
          result: "La ejecutas con datos reales, fuerzas un fallo y muestras el log con el reintento y el estado final correcto.",
        });
        break;
      default:
        out.push({ areaId: id, area, what: `Una vertical de ${area} que integra ${feats}.`, how: ["Define el alcance de la semana.", "Constrúyelo por capas verificables.", "Documenta cómo ejecutarlo."], result: "Funciona de principio a fin y puedes demostrarlo." });
    }
  }
  return out;
}
