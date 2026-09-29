/**
 * Topic-level spaced repetition.
 *
 * The unit is the TOPIC, not the skill: practising any mix of skills of a topic on a
 * day is one practice day for that topic. The first day schedules the next review in
 * 3 days; each review done on or after its due date moves up the ladder
 * (3, 7, 14, 30, 60, 120 days); a day on which nothing was passed brings the topic
 * back tomorrow. Practising before the due date only pushes the date out, it does not
 * climb. Pure: no files here (see reviewFiles.ts).
 */

export const REVIEW_INTERVALS = [3, 7, 14, 30, 60, 120] as const;

export interface ReviewDay {
  /** local date, YYYY-MM-DD */
  date: string;
  skills: string[];
  attempts: number;
  passes: number;
}

export interface ReviewState {
  topic: string;
  /** vault-relative folder of the topic */
  topicPath: string;
  subject: string;
  days: ReviewDay[];
  /** how many reviews have been completed on time (1 after the first practice) */
  level: number;
  next: string;
}

export interface PracticeEvent {
  date: string;
  skill: string;
  passed: boolean;
}

const DAY_MS = 86_400_000;

function parseIso(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y!, (m ?? 1) - 1, d ?? 1);
}

export function isoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function addDays(iso: string, n: number): string {
  const d = new Date(parseIso(iso) + n * DAY_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** Whole days from `today` to `iso` (negative when it is overdue). */
export function daysUntil(iso: string, today: string): number {
  return Math.round((parseIso(iso) - parseIso(today)) / DAY_MS);
}

export function intervalForLevel(level: number): number {
  return REVIEW_INTERVALS[Math.min(Math.max(level, 1), REVIEW_INTERVALS.length) - 1]!;
}

export function newReview(topic: string, topicPath: string, subject: string): ReviewState {
  return { topic, topicPath, subject, days: [], level: 0, next: "" };
}

/** Folds one graded attempt into the topic's history and recomputes its next review. */
export function addPractice(state: ReviewState, ev: PracticeEvent): ReviewState {
  const days = state.days.map((d) => ({ ...d, skills: [...d.skills] }));
  const previousNext = state.next;
  const isNewDay = !days.length || days[days.length - 1]!.date !== ev.date;
  let day = days[days.length - 1];
  if (isNewDay) {
    day = { date: ev.date, skills: [], attempts: 0, passes: 0 };
    days.push(day);
  }
  day!.attempts += 1;
  if (ev.passed) day!.passes += 1;
  if (!day!.skills.includes(ev.skill)) day!.skills.push(ev.skill);

  let level = state.level;
  if (isNewDay) {
    if (level === 0) level = 1;
    else if (previousNext && ev.date >= previousNext) level += 1;
  }
  // Nothing passed today: see it again tomorrow instead of climbing the ladder.
  const next = day!.passes === 0 ? addDays(ev.date, 1) : addDays(ev.date, intervalForLevel(level));
  return { ...state, days, level, next };
}

// ── The review note ─────────────────────────────────────────────────────────

const DATA_RE = /<!--\s*nv:review\s+([\s\S]*?)\s*-->/;
const quote = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export function longDate(iso: string): string {
  const d = new Date(parseIso(iso));
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} de ${MONTHS[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
}

function inWords(n: number): string {
  if (n === 0) return "hoy";
  if (n === 1) return "mañana";
  if (n === -1) return "venció ayer";
  return n > 0 ? `en ${n} días` : `venció hace ${-n} días`;
}

/** The markdown of a review note: readable table on top, the machine data in a comment. */
export function serializeReview(state: ReviewState, today: string): string {
  const last = state.days[state.days.length - 1]?.date ?? "";
  const rows = state.days
    .slice()
    .reverse()
    .map((d) => `| ${d.date} | ${d.skills.join(", ")} | ${d.attempts} | ${d.passes} |`);
  const data = JSON.stringify({ days: state.days, level: state.level });
  return [
    "---",
    "type: repaso",
    `subject: ${state.subject}`,
    `topic: ${quote(state.topic)}`,
    `topic_path: ${quote(state.topicPath)}`,
    `next_review: ${state.next}`,
    `last_practiced: ${last}`,
    `level: ${state.level}`,
    "---",
    "",
    `# Repaso — ${state.topic}`,
    "",
    `**Próximo repaso:** ${longDate(state.next)} (${inWords(daysUntil(state.next, today))})`,
    "",
    `**Nivel:** ${state.level} · la siguiente vez que lo repases a tiempo pasará a ${intervalForLevel(state.level + 1)} días.`,
    "",
    "| Fecha | Skills practicadas | Intentos | Aprobados |",
    "| --- | --- | --- | --- |",
    ...rows,
    "",
    `<!-- nv:review ${data} -->`,
    "",
  ].join("\n");
}

/** Reads a review note back; null when it is not one or its data is corrupt. */
export function parseReview(text: string): ReviewState | null {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!fm || !/^type:\s*repaso\s*$/m.test(fm[1]!)) return null;
  const get = (key: string) => {
    const m = new RegExp(`^${key}:\\s*(.*)$`, "m").exec(fm[1]!);
    return m ? m[1]!.trim().replace(/^"|"$/g, "").replace(/\\"/g, '"').replace(/\\\\/g, "\\") : "";
  };
  const data = DATA_RE.exec(text);
  if (!data) return null;
  try {
    const parsed = JSON.parse(data[1]!) as { days: ReviewDay[]; level: number };
    if (!Array.isArray(parsed.days)) return null;
    return {
      topic: get("topic"),
      topicPath: get("topic_path"),
      subject: get("subject"),
      days: parsed.days,
      level: Number(parsed.level) || 0,
      next: get("next_review"),
    };
  } catch {
    return null;
  }
}
