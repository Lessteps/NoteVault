// RITMO NECESARIO: el plan tiene una fecha de inicio y una de fin que NO se mueven. Si hay más temas de los que caben a tu ritmo, no es un error ni se
// recorta nada: la app dice, por asignatura, qué ritmo hace falta para llegar a la fecha de fin (temas y minutos por día de estudio). La decisión de
// empezar con poco tiempo y muchos temas es de la persona; lo que la app le debe es la cuenta clara. Puro: sin disco ni DOM.

export interface PaceGroupInput {
  id: string;
  title: string;
  total: number;
  pending: number;
  /** minutos estimados de TODOS los temas de la asignatura (se reparte en proporción a lo pendiente) */
  totalMinutes: number;
}

export interface PaceNeed {
  id: string;
  title: string;
  pendingTopics: number;
  pendingMinutes: number;
  /** temas por día de estudio hasta la fecha de fin (1 decimal) */
  topicsPerDay: number;
  /** minutos por día de estudio hasta la fecha de fin (redondeado) */
  minutesPerDay: number;
}

export interface RequiredPace {
  /** días de estudio que quedan, de hoy (o del inicio) a la fecha de fin, ambos incluidos; al menos 1 */
  daysLeft: number;
  groups: PaceNeed[];
  total: PaceNeed;
  /** minutos por día que la persona dice tener; con él se sabe si el ritmo necesario cabe */
  availableMinutesPerDay?: number;
  /** `true` si el ritmo necesario cabe en los minutos diarios disponibles (o no se sabe cuáles son) */
  fits: boolean;
}

const DAY = 86_400_000;
const utc = (iso: string): number => Date.parse(`${iso}T00:00:00Z`);

/** Días de estudio (1 = lunes … 7 = domingo) entre dos fechas AAAA-MM-DD, ambas incluidas. */
export function studyDaysBetween(from: string, to: string, studyDays: readonly number[]): number {
  const a = utc(from);
  const b = utc(to);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0;
  const set = new Set(studyDays.length ? studyDays : [1, 2, 3, 4, 5, 6, 7]);
  let n = 0;
  for (let t = a; t <= b; t += DAY) {
    const wd = new Date(t).getUTCDay();
    if (set.has(wd === 0 ? 7 : wd)) n++;
  }
  return n;
}

const need = (id: string, title: string, topics: number, minutes: number, days: number): PaceNeed => ({
  id,
  title,
  pendingTopics: topics,
  pendingMinutes: Math.round(minutes),
  topicsPerDay: Math.round((topics / days) * 10) / 10,
  minutesPerDay: Math.round(minutes / days),
});

export function requiredPace(input: { today: string; start: string; end: string; studyDays: readonly number[]; minutesPerDay?: number; groups: readonly PaceGroupInput[] }): RequiredPace {
  const from = input.today > input.start ? input.today : input.start;
  const daysLeft = Math.max(1, studyDaysBetween(from, input.end, input.studyDays));
  const groups = input.groups.map((g) => need(g.id, g.title, g.pending, g.total > 0 ? (g.totalMinutes * g.pending) / g.total : 0, daysLeft));
  const total = need("total", "Todo el plan", groups.reduce((n, g) => n + g.pendingTopics, 0), groups.reduce((n, g) => n + g.pendingMinutes, 0), daysLeft);
  const available = input.minutesPerDay && input.minutesPerDay > 0 ? input.minutesPerDay : undefined;
  return { daysLeft, groups, total, ...(available ? { availableMinutesPerDay: available } : {}), fits: !available || total.minutesPerDay <= available };
}

const hm = (m: number): string => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}` : `${m} min`);
const num = (n: number): string => String(n).replace(".", ",");

/** «≈ 2,3 temas/día · 1 h 50 min/día para llegar al 5 abr». */
export function paceNeedText(n: PaceNeed, endLabel = ""): string {
  if (n.pendingTopics === 0) return "Sin temas pendientes";
  return `≈ ${num(n.topicsPerDay)} ${n.topicsPerDay === 1 ? "tema" : "temas"}/día · ${hm(n.minutesPerDay)}/día${endLabel ? ` para llegar al ${endLabel}` : ""}`;
}
