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

/** El proyecto MENSUAL integrador: una aplicación. */
export function integratedMonthly(areaIds: readonly string[], label: string): { title: string; description: string } {
  return { title: `Aplicación del mes · ${label}`, description: `Una aplicación que integra las verticales semanales del mes${areaIds.length ? ` (${areaIds.map((a) => AREA_PRACTICE[a]?.name ?? a).slice(0, 4).join(" · ")})` : ""}: interfaz, API y base de datos.` };
}
