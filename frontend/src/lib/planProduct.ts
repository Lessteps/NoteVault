// El PRODUCTO del mes: el proyecto mensual no es un ejercicio suelto, es UN producto real que crece mes a mes y CONSOLIDA lo aprendido. Cada mes tiene una etapa
// (qué le añades al producto) dividida en hitos; cada semana construye un hito (su proyecto semanal) y cada día una pieza de ese hito. Los temas del mes se reparten
// entre los hitos para que cada uno tenga su lugar en el producto. Determinista y sin IA (una IA puede reemplazar los textos con el currículo de práctica).
// Puro: sin disco ni red.

export interface ProductStage {
  /** lo que se añade al producto este mes */
  title: string;
  summary: string;
  /** 4 hitos: uno por semana */
  milestones: string[];
  criteria: string[];
}

export const PRODUCT_STAGES: readonly ProductStage[] = [
  {
    title: "La primera versión del producto, de punta a punta",
    summary: "Eliges UN producto real (un gestor de tareas, una mini tienda, un sistema de reservas…) y construyes su primera versión que funciona: pantalla, endpoint y tabla. Es la base de todo lo que añades los meses siguientes.",
    milestones: ["Modelo de datos y migraciones", "API con CRUD y documentación", "Interfaz para listar, crear y editar", "Validación y errores claros en todas las capas"],
    criteria: ["Se arranca desde cero con UN comando", "El README explica qué hace, cómo se ejecuta y cómo se prueba", "Hay datos de ejemplo que se cargan con otro comando"],
  },
  {
    title: "Cuentas, permisos y pruebas",
    summary: "El producto deja de ser anónimo y frágil: cada persona tiene su cuenta y sus datos, y lo que construyes queda protegido por pruebas automáticas.",
    milestones: ["Registro e inicio de sesión", "Permisos: cada usuario solo ve y cambia lo suyo", "Pruebas automáticas de la API", "Pruebas de la interfaz o un recorrido de punta a punta"],
    criteria: ["Sin sesión no se accede a nada privado", "Las pruebas corren con un solo comando y pasan", "Un usuario no puede leer ni modificar los datos de otro"],
  },
  {
    title: "Datos reales: relaciones, búsqueda y rendimiento",
    summary: "El producto maneja datos como los de verdad: varias entidades relacionadas, búsqueda, filtros y paginación, y consultas medidas en vez de supuestas.",
    milestones: ["Relaciones entre entidades (uno a muchos, muchos a muchos)", "Búsqueda, filtros y paginación", "Índices y consultas medidas con EXPLAIN", "Carga diferida o caché en la interfaz"],
    criteria: ["Con miles de filas sigue respondiendo con fluidez", "Cada consulta lenta tiene su índice y su medición antes/después", "La interfaz no se queda en blanco mientras carga"],
  },
  {
    title: "Automatización y entrega continua",
    summary: "Lo que hacías a mano pasa a hacerlo una máquina: tareas en segundo plano, integración continua y un despliegue repetible.",
    milestones: ["Tareas en segundo plano (colas, programadas)", "Integración continua: lint y pruebas en cada cambio", "Despliegue automatizado", "Configuración y secretos fuera del código"],
    criteria: ["Un cambio que rompe las pruebas no se puede desplegar", "Desplegar es un comando o un botón, no un ritual", "Ningún secreto vive en el repositorio"],
  },
  {
    title: "Seguridad y observabilidad",
    summary: "El producto aguanta ataques comunes y, cuando falla, sabes por qué: lo revisas con una lista de seguridad y lo instrumentas.",
    milestones: ["Revisión de seguridad (lo básico de OWASP)", "Registros estructurados y errores trazables", "Métricas y alertas simples", "Copias de seguridad con restauración probada"],
    criteria: ["Cada punto de la lista de seguridad está revisado y anotado", "Ante un error puedes seguirlo de la pantalla a la base de datos", "Restauraste una copia en una base nueva y los datos están"],
  },
  {
    title: "La versión de portafolio: terminada y defendida",
    summary: "Cierras el producto como lo enseñarías en una entrevista: pulido, documentado y con una demostración corta que cuenta qué decidiste y por qué.",
    milestones: ["Interfaz pulida y accesible", "Documentación de arquitectura y decisiones", "Demostración grabada de 3 minutos", "Retrospectiva: qué mejorarías y en qué orden"],
    criteria: ["Alguien que no te conoce lo entiende con el README y la demo", "Puedes explicar cada decisión técnica y su alternativa", "Hay una lista honesta de límites y mejoras"],
  },
];

const FOLLOW_UP: ProductStage = {
  title: "Ampliación del producto",
  summary: "Sigues haciendo crecer el mismo producto con lo nuevo que aprendes este mes: una funcionalidad grande de principio a fin, con sus pruebas y su documentación.",
  milestones: ["Diseño de la funcionalidad (modelo y contrato)", "Implementación de la parte de servidor", "Implementación de la interfaz", "Pruebas, documentación y cierre"],
  criteria: ["La funcionalidad nueva se usa desde la interfaz", "Tiene pruebas y está documentada", "No rompe lo que ya funcionaba"],
};

/** La etapa del producto de un mes (1..n del plan); pasado el último mes definido, ampliaciones del mismo producto. */
export function productStage(monthIndex: number): ProductStage {
  return PRODUCT_STAGES[monthIndex] ?? { ...FOLLOW_UP, title: `${FOLLOW_UP.title} (mes ${monthIndex + 1})` };
}

/** Reparte los temas del mes entre los hitos (en orden, de forma pareja): cada hito sabe qué temas aplica. */
export function spreadTopics(topics: readonly string[], milestones: number): string[][] {
  const out: string[][] = Array.from({ length: Math.max(1, milestones) }, () => []);
  topics.forEach((t, i) => out[Math.min(out.length - 1, Math.floor((i * out.length) / Math.max(1, topics.length)))]!.push(t));
  return out;
}

export interface MonthProduct {
  stage: ProductStage;
  /** el hito de cada semana del mes (en orden), con los temas que aplica */
  milestones: Array<{ title: string; topics: string[] }>;
}

/** El producto de un mes con `weeks` semanas: un hito por semana (si hay más semanas que hitos, el último se reparte; si hay menos, se juntan los últimos). */
export function monthProduct(monthIndex: number, weeks: number, topics: readonly string[]): MonthProduct {
  const stage = productStage(monthIndex);
  const n = Math.max(1, weeks);
  const titles: string[] =
    n >= stage.milestones.length
      ? [...stage.milestones, ...Array.from({ length: n - stage.milestones.length }, (_, i) => `Pulido y pruebas de «${stage.milestones[stage.milestones.length - 1]}» (${i + 1})`)]
      : [...stage.milestones.slice(0, n - 1), stage.milestones.slice(n - 1).join(" + ")];
  const spread = spreadTopics(topics, n);
  return { stage, milestones: titles.map((title, i) => ({ title, topics: spread[i] ?? [] })) };
}
