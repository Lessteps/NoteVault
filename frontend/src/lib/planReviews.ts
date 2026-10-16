// Mentor ↔ repaso espaciado. El sistema de repaso (`core/practice/reviewSchedule.ts`) agenda UN repaso por TEMA: al practicar un tema se
// programa el siguiente a 3, 7, 14, 30, 60 y 120 días. Aquí se une ese calendario con los temas del plan: qué repasos tiene cada área o ruta
// y en qué cajón caen (vencidos u hoy, esta semana, la próxima, después). Módulo PURO: recibe los repasos ya leídos, no lee nada.

export interface ReviewItemLike {
  path: string;
  topic: string;
  topicPath: string;
  next: string;
  level: number;
  inDays: number;
  skills: string[];
  kind?: "topic" | "vocab";
  upcoming?: Array<{ date: string; interval: number; level: number }>;
}

/** Un repaso de un tema del plan. */
export interface ReviewRow {
  /** nota de repaso en la vault */
  path: string;
  /** carpeta del tema del plan */
  folder: string;
  title: string;
  next: string;
  /** días hasta el repaso (negativo = vencido) */
  inDays: number;
  /** repasos hechos a tiempo hasta ahora */
  level: number;
  skills: string[];
}

export interface ReviewBuckets {
  /** vencidos y de hoy */
  today: ReviewRow[];
  /** de mañana al domingo de esta semana */
  week: ReviewRow[];
  /** de lunes a domingo de la semana siguiente */
  nextWeek: ReviewRow[];
  later: ReviewRow[];
}

/** Días de hoy al próximo domingo (0 si hoy es domingo). */
export function daysToSunday(today: string): number {
  const [y, m, d] = today.split("-").map(Number);
  const dow = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1)).getUTCDay() || 7;
  return 7 - dow;
}

/** Los repasos de temas (no de vocabulario) que caen en los temas dados (la nota puede estar en la carpeta del tema o en una subcarpeta). */
export function reviewsOfTopics(topics: ReadonlyArray<{ folder: string; title: string }>, items: ReadonlyArray<ReviewItemLike>): ReviewRow[] {
  const out = new Map<string, ReviewRow>();
  for (const it of items) {
    if (it.kind === "vocab" || !it.next) continue;
    const t = topics.find((x) => it.topicPath === x.folder || it.topicPath.startsWith(`${x.folder}/`));
    if (!t || out.has(it.path)) continue;
    out.set(it.path, { path: it.path, folder: t.folder, title: t.title, next: it.next, inDays: it.inDays, level: it.level, skills: it.skills });
  }
  return [...out.values()].sort((a, b) => a.next.localeCompare(b.next) || a.title.localeCompare(b.title, "es", { numeric: true }));
}

/** Reparte los repasos en cajones según hoy: vencidos u hoy · esta semana · la próxima · después. */
export function bucketReviews(rows: ReadonlyArray<ReviewRow>, today: string): ReviewBuckets {
  const left = daysToSunday(today);
  const out: ReviewBuckets = { today: [], week: [], nextWeek: [], later: [] };
  for (const r of rows) {
    if (r.inDays <= 0) out.today.push(r);
    else if (r.inDays <= left) out.week.push(r);
    else if (r.inDays <= left + 7) out.nextWeek.push(r);
    else out.later.push(r);
  }
  return out;
}

/** «Vencido hace 2 días», «Hoy», «Mañana», «En 3 días». */
export function dueText(inDays: number): string {
  if (inDays < -1) return `Vencido hace ${-inDays} días`;
  if (inDays === -1) return "Vencido desde ayer";
  if (inDays === 0) return "Hoy";
  if (inDays === 1) return "Mañana";
  return `En ${inDays} días`;
}
