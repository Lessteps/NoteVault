// Mentor — REGISTROS DE SESIÓN: lo que deja cada bloque de estudio para que el propio programa pueda leerlo y repensar el plan (ver
// docs/MENTOR_SESSION_RECORDS_PLAN.md). Módulo PURO y compartido (API y renderer): no lee ni escribe nada; recibe la sesión, la evaluación y la
// evidencia (intentos, errores, repasos, archivos tocados) ya filtradas, y devuelve el registro, su nota Markdown, los agregados deterministas
// (dominio por tema, patrones), las propuestas por reglas y el seguimiento de lo que se aplicó.
//
// Regla de oro: lo MEDIDO pesa más que lo DECLARADO. La comprensión que se escribe en el formulario nunca decide sola: la evidencia (notas de los
// intentos, errores repetidos) manda.

export const RECORD_RETENTION_DAYS = 90;

export type SessionMode = "timer" | "stopwatch" | "manual";
export type OutcomeStatus = "done" | "partial" | "none";

export interface AssignedItem {
  kind: "topic" | "task" | "project";
  /** carpeta del tema; en una tarea o proyecto a mano, su id */
  folder: string;
  title: string;
  status: OutcomeStatus;
}

export interface EvidenceAttempt {
  exercise: string;
  /** carpeta del tema de ese ejercicio (vacía si no se pudo saber) */
  topic: string;
  skill: string;
  score: number;
  verdict: string;
}

export interface EvidenceError {
  category: string;
  skill: string;
  /** título del tema */
  topic: string;
  /** carpeta del tema (vacía si no se pudo saber) */
  folder: string;
  repeat: number;
  description?: string;
}

export interface SessionAssessment {
  understanding: number;
  focus: number;
  practiced: boolean;
  learned: string;
  doubt: string;
  errors: string;
}

export interface SessionRecord {
  version: 1;
  id: string;
  planId: string;
  areaKey: string;
  areaName: string;
  /** día local `YYYY-MM-DD` */
  date: string;
  /** hora local de inicio `HH:MM` */
  start: string;
  startedAt: string;
  minutes: number;
  mode: SessionMode;
  assigned: AssignedItem[];
  assessment: SessionAssessment | null;
  evidence: {
    attempts: EvidenceAttempt[];
    errors: EvidenceError[];
    katas: Array<{ areaId: string; status: string }>;
    reviewsDone: string[];
    filesTouched: string[];
  };
  /** cuándo se guardó (ISO) */
  at: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const one = (v: unknown, max: number): string => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const num = (v: unknown, lo: number, hi: number, d = 0): number => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d;
};
const status = (v: unknown): OutcomeStatus => (v === "done" || v === "none" ? v : "partial");

export interface SessionInput {
  id: string;
  planId: string;
  areaKey: string;
  areaName: string;
  date: string;
  startedAtMs: number;
  minutes: number;
  mode: string;
  assigned: ReadonlyArray<Partial<AssignedItem>>;
  assessment?: Partial<SessionAssessment> | null;
  attempts?: ReadonlyArray<Partial<EvidenceAttempt>>;
  errors?: ReadonlyArray<Partial<EvidenceError>>;
  katas?: ReadonlyArray<{ areaId: string; status: string }>;
  reviewsDone?: readonly string[];
  filesTouched?: readonly string[];
  now: string;
}

/** La hora local `HH:MM` de un instante. */
export const hhmm = (ms: number): string => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/** Construye el registro: limpia todo, recorta las listas y descarta lo inválido. Devuelve `null` si faltan el plan, el área, el día o los minutos. */
export function buildSessionRecord(i: SessionInput): SessionRecord | null {
  const minutes = num(i.minutes, 0, 720);
  const areaKey = one(i.areaKey, 60);
  if (!i.id || !i.planId || !areaKey || !DATE_RE.test(i.date) || minutes < 1) return null;
  const a = i.assessment ?? null;
  const assessment: SessionAssessment | null = a
    ? { understanding: num(a.understanding, 0, 5), focus: num(a.focus, 0, 5), practiced: a.practiced === true, learned: one(a.learned, 600), doubt: one(a.doubt, 600), errors: one(a.errors, 600) }
    : null;
  const mode: SessionMode = i.mode === "stopwatch" || i.mode === "manual" ? i.mode : "timer";
  const startedAtMs = Number.isFinite(i.startedAtMs) && i.startedAtMs > 0 ? i.startedAtMs : Date.parse(i.now) - minutes * 60_000;
  return {
    version: 1,
    id: one(i.id, 80),
    planId: i.planId,
    areaKey,
    areaName: one(i.areaName, 80) || areaKey,
    date: i.date,
    start: hhmm(startedAtMs),
    startedAt: new Date(startedAtMs).toISOString(),
    minutes,
    mode,
    assigned: i.assigned
      .map((t) => ({ kind: (t.kind === "task" || t.kind === "project" ? t.kind : "topic") as AssignedItem["kind"], folder: one(t.folder, 400), title: one(t.title, 200), status: status(t.status) }))
      .filter((t) => t.title)
      .slice(0, 12),
    assessment,
    evidence: {
      attempts: (i.attempts ?? []).map((x) => ({ exercise: one(x.exercise, 300), topic: one(x.topic, 400), skill: one(x.skill, 60), score: num(x.score, 0, 100), verdict: one(x.verdict, 20) })).filter((x) => x.exercise).slice(0, 30),
      errors: (i.errors ?? [])
        .map((x) => ({ category: one(x.category, 40) || "otro", skill: one(x.skill, 60), topic: one(x.topic, 200), folder: one(x.folder, 400), repeat: num(x.repeat, 1, 99, 1), ...(x.description ? { description: one(x.description, 240) } : {}) }))
        .slice(0, 20),
      katas: (i.katas ?? []).map((k) => ({ areaId: one(k.areaId, 40), status: one(k.status, 20) })).slice(0, 10),
      reviewsDone: (i.reviewsDone ?? []).map((r) => one(r, 300)).filter(Boolean).slice(0, 12),
      filesTouched: (i.filesTouched ?? []).map((r) => one(r, 400)).filter(Boolean).slice(0, 20),
    },
    at: i.now,
  };
}

/** Un registro leído de disco: válido o `null`. */
export function parseSessionRecord(raw: unknown): SessionRecord | null {
  const o = (raw && typeof raw === "object" ? raw : null) as Record<string, any> | null;
  if (!o || o.version !== 1) return null;
  const ev = (o.evidence && typeof o.evidence === "object" ? o.evidence : {}) as Record<string, any>;
  return buildSessionRecord({
    id: o.id, planId: o.planId, areaKey: o.areaKey, areaName: o.areaName, date: o.date, startedAtMs: Date.parse(o.startedAt), minutes: o.minutes, mode: o.mode,
    assigned: Array.isArray(o.assigned) ? o.assigned : [], assessment: o.assessment, attempts: Array.isArray(ev.attempts) ? ev.attempts : [], errors: Array.isArray(ev.errors) ? ev.errors : [],
    katas: Array.isArray(ev.katas) ? ev.katas : [], reviewsDone: Array.isArray(ev.reviewsDone) ? ev.reviewsDone : [], filesTouched: Array.isArray(ev.filesTouched) ? ev.filesTouched : [], now: String(o.at ?? ""),
  });
}

// ── Nota legible ───────────────────────────────────────────────────────

const OUTCOME_TEXT: Record<OutcomeStatus, string> = { done: "completado", partial: "a medias", none: "no se tocó" };
const yamlStr = (s: string): string => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
const nameOf = (folder: string): string => folder.split("/").pop() ?? folder;
const avg = (xs: readonly number[]): number | null => (xs.length ? Math.round((xs.reduce((n, x) => n + x, 0) / xs.length) * 10) / 10 : null);

/** La nota Markdown de una sesión (derivada del JSON: si se edita a mano no cambia nada). */
export function renderSessionMarkdown(r: SessionRecord): string {
  const a = r.assessment;
  const L: string[] = [];
  L.push("---");
  L.push("registro: sesion");
  L.push(`plan: ${yamlStr(r.planId)}`);
  L.push(`area: ${yamlStr(r.areaName)}`);
  L.push(`fecha: ${r.date}`);
  L.push(`inicio: ${yamlStr(r.start)}`);
  L.push(`minutos: ${r.minutes}`);
  L.push(`modo: ${r.mode}`);
  if (a?.understanding) L.push(`comprension: ${a.understanding}`);
  if (a?.focus) L.push(`concentracion: ${a.focus}`);
  L.push(`id: ${yamlStr(r.id)}`);
  L.push("---");
  L.push(`# Sesión de ${r.areaName} · ${r.date} ${r.start} (${r.minutes} min)`);
  L.push("");
  L.push("> Nota generada por el Mentor a partir del registro de la sesión. Es derivada: editarla aquí no cambia nada (el dato vive en `.notevault/mentor/records/`).");
  L.push("");
  L.push("## Qué se trabajó");
  if (!r.assigned.length) L.push("- Sesión libre (sin temas asignados).");
  for (const t of r.assigned) {
    const label = t.kind === "topic" ? `[[${nameOf(t.folder)}]]` : `${t.kind === "project" ? "Proyecto" : "Tarea"}: ${t.title}`;
    L.push(`- ${label} — ${OUTCOME_TEXT[t.status]}`);
  }
  L.push("");
  if (a) {
    L.push("## Cómo fue");
    if (a.learned) L.push(`- **Aprendí:** ${a.learned}`);
    if (a.doubt) L.push(`- **Duda pendiente:** ${a.doubt}`);
    if (a.errors) L.push(`- **Errores o problemas:** ${a.errors}`);
    L.push(`- Comprensión ${a.understanding || "—"}/5 · Concentración ${a.focus || "—"}/5 · Ejercicios o práctica: ${a.practiced ? "sí" : "no"}`);
    L.push("");
  }
  const ev = r.evidence;
  L.push("## Evidencia (calculada por la app)");
  if (!ev.attempts.length && !ev.errors.length && !ev.reviewsDone.length && !ev.filesTouched.length && !ev.katas.length) L.push("- Sin intentos, errores ni archivos tocados en esta ventana de tiempo.");
  if (ev.attempts.length) {
    const m = avg(ev.attempts.map((x) => x.score));
    L.push(`- Intentos: ${ev.attempts.length}${m !== null ? ` (nota media ${m})` : ""}`);
    for (const x of ev.attempts.slice(0, 8)) L.push(`  - ${x.skill || "—"} · ${x.score} · ${x.verdict || "sin calificar"}${x.topic ? ` · [[${nameOf(x.topic)}]]` : ""}`);
  }
  if (ev.errors.length) {
    L.push(`- Errores registrados: ${ev.errors.reduce((n, x) => n + x.repeat, 0)}`);
    for (const x of ev.errors.slice(0, 8)) L.push(`  - ${x.category}${x.skill ? ` (${x.skill})` : ""}${x.topic ? ` · ${x.topic}` : ""}${x.repeat > 1 ? ` ×${x.repeat}` : ""}${x.description ? ` — ${x.description}` : ""}`);
  }
  if (ev.katas.length) L.push(`- Katas: ${ev.katas.map((k) => `${k.areaId} ${k.status}`).join(", ")}`);
  if (ev.reviewsDone.length) L.push(`- Repasos hechos: ${ev.reviewsDone.map((x) => `[[${nameOf(x).replace(/\.md$/i, "")}]]`).join(", ")}`);
  if (ev.filesTouched.length) L.push(`- Archivos tocados: ${ev.filesTouched.map((x) => `[[${nameOf(x).replace(/\.md$/i, "")}]]`).join(", ")}`);
  L.push("");
  return L.join("\n");
}

/** La carpeta de la nota de una sesión dentro de la materia: `_registro/<fecha>/<hhmm> <Área>.md`. */
export function sessionNoteRel(space: string, r: Pick<SessionRecord, "date" | "start" | "areaName">): string {
  const safe = r.areaName.replace(/[\\/:*?"<>|]/g, "").trim() || "sesion";
  return `${space}/_registro/${r.date}/${r.start.replace(":", "")} ${safe}.md`;
}

// ── Agregados deterministas ────────────────────────────────────────────

export interface TopicMastery {
  folder: string;
  title: string;
  sessions: number;
  /** sesiones con el tema «a medias» o «no se tocó» */
  openSessions: number;
  avgUnderstanding: number | null;
  avgFocus: number | null;
  attempts: number;
  avgScore: number | null;
  errors: number;
  /** 0–100: lo medido pesa más que lo declarado */
  mastery: number;
}

const pctOf = (st: OutcomeStatus): number => (st === "done" ? 100 : st === "partial" ? 50 : 0);

/** Dominio por tema a partir de las sesiones: nota de los intentos (peso 0,5), resultado de las sesiones (0,2), comprensión declarada (0,2) y errores (0,1). Sin dato, ese peso se reparte. */
export function masteryByTopic(records: ReadonlyArray<SessionRecord>): TopicMastery[] {
  interface Acc { title: string; sessions: number; open: number; und: number[]; foc: number[]; scores: number[]; errors: number; out: number[] }
  const by = new Map<string, Acc>();
  const get = (folder: string, title: string): Acc => {
    const a = by.get(folder) ?? { title, sessions: 0, open: 0, und: [], foc: [], scores: [], errors: 0, out: [] };
    by.set(folder, a);
    return a;
  };
  for (const r of records) {
    for (const t of r.assigned) {
      if (t.kind !== "topic" || !t.folder) continue;
      const a = get(t.folder, t.title);
      a.sessions++;
      if (t.status !== "done") a.open++;
      a.out.push(pctOf(t.status));
      if (r.assessment?.understanding) a.und.push(r.assessment.understanding);
      if (r.assessment?.focus) a.foc.push(r.assessment.focus);
    }
    for (const x of r.evidence.attempts) if (x.topic) get(x.topic, nameOf(x.topic)).scores.push(x.score);
    for (const e of r.evidence.errors) if (e.folder) get(e.folder, e.topic || nameOf(e.folder)).errors += e.repeat;
  }
  const out: TopicMastery[] = [];
  for (const [folder, a] of by) {
    const parts: Array<[number, number]> = [[100 - Math.min(100, a.errors * 20), 0.1]];
    if (a.scores.length) parts.push([avg(a.scores)!, 0.5]);
    if (a.out.length) parts.push([avg(a.out)!, 0.2]);
    if (a.und.length) parts.push([(avg(a.und)! / 5) * 100, 0.2]);
    const w = parts.reduce((n, [, x]) => n + x, 0);
    const mastery = Math.round(parts.reduce((n, [v, x]) => n + v * x, 0) / w);
    out.push({ folder, title: a.title, sessions: a.sessions, openSessions: a.open, avgUnderstanding: avg(a.und), avgFocus: avg(a.foc), attempts: a.scores.length, avgScore: avg(a.scores), errors: a.errors, mastery });
  }
  return out.sort((x, y) => x.mastery - y.mastery || y.errors - x.errors || x.title.localeCompare(y.title, "es", { numeric: true }));
}

export type PatternKind = "repeated_error" | "stuck_topic" | "low_understanding" | "low_focus" | "overdue_reviews" | "low_hours";

export interface Pattern {
  kind: PatternKind;
  /** carpeta del tema (vacía en patrones que no son de un tema) */
  folder: string;
  title: string;
  skill?: string;
  /** frase corta con el dato que lo dispara */
  detail: string;
  /** ids de las sesiones que lo demuestran */
  recordIds: string[];
}

const daysBetween = (a: string, b: string): number => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);

export interface PatternOpts {
  today: string;
  /** ventana en días (por defecto 14) */
  windowDays?: number;
  /** repasos vencidos de temas del plan (carpeta y título) */
  overdueReviews?: ReadonlyArray<{ folder: string; title: string; inDays: number }>;
  /** minutos hechos y previstos en la ventana, si se conocen */
  hours?: { done: number; planned: number };
}

/** Los patrones que merecen atención en la ventana: errores que se repiten, temas que siempre quedan a medias, comprensión o concentración bajas, repasos vencidos, horas muy por debajo de lo previsto. */
export function patternsOf(records: ReadonlyArray<SessionRecord>, o: PatternOpts): Pattern[] {
  const win = o.windowDays ?? 14;
  const recent = records.filter((r) => { const d = daysBetween(r.date, o.today); return d >= 0 && d < win; }).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const out: Pattern[] = [];

  const errs = new Map<string, { folder: string; title: string; skill: string; category: string; n: number; ids: Set<string> }>();
  for (const r of recent) {
    for (const e of r.evidence.errors) {
      const key = `${e.folder || e.topic}|${e.skill}|${e.category}`;
      const x = errs.get(key) ?? { folder: e.folder, title: e.topic || nameOf(e.folder), skill: e.skill, category: e.category, n: 0, ids: new Set<string>() };
      x.n += e.repeat;
      x.ids.add(r.id);
      errs.set(key, x);
    }
  }
  for (const x of errs.values()) if (x.n >= 3) out.push({ kind: "repeated_error", folder: x.folder, title: x.title, ...(x.skill ? { skill: x.skill } : {}), detail: `${x.n} errores de tipo «${x.category}»${x.skill ? ` en ${x.skill}` : ""} en ${win} días`, recordIds: [...x.ids] });

  const open = new Map<string, { title: string; ids: string[]; everDone: boolean }>();
  for (const r of recent) for (const t of r.assigned) {
    if (t.kind !== "topic" || !t.folder) continue;
    const x = open.get(t.folder) ?? { title: t.title, ids: [], everDone: false };
    if (t.status === "done") x.everDone = true;
    else x.ids.push(r.id);
    open.set(t.folder, x);
  }
  for (const [folder, x] of open) if (x.ids.length >= 3 && !x.everDone) out.push({ kind: "stuck_topic", folder, title: x.title, detail: `quedó a medias en ${x.ids.length} sesiones y nunca se completó`, recordIds: x.ids });

  for (const m of masteryByTopic(recent)) {
    if (m.avgUnderstanding !== null && m.avgUnderstanding <= 2.5 && m.sessions >= 2) {
      const ids = recent.filter((r) => r.assigned.some((t) => t.folder === m.folder)).map((r) => r.id);
      out.push({ kind: "low_understanding", folder: m.folder, title: m.title, detail: `comprensión media ${m.avgUnderstanding}/5 en ${m.sessions} sesiones`, recordIds: ids });
    }
  }

  const foc = recent.filter((r) => r.assessment?.focus).slice(-5);
  const focAvg = avg(foc.map((r) => r.assessment!.focus));
  if (foc.length >= 3 && focAvg !== null && focAvg <= 2.5) out.push({ kind: "low_focus", folder: "", title: "Concentración", detail: `concentración media ${focAvg}/5 en las últimas ${foc.length} sesiones`, recordIds: foc.map((r) => r.id) });

  const od = (o.overdueReviews ?? []).filter((r) => r.inDays <= -3);
  if (od.length >= 3) out.push({ kind: "overdue_reviews", folder: "", title: "Repasos", detail: `${od.length} repasos llevan 3 días o más vencidos`, recordIds: [] });

  if (o.hours && o.hours.planned >= 120 && o.hours.done < o.hours.planned * 0.6) out.push({ kind: "low_hours", folder: "", title: "Horas", detail: `${Math.round(o.hours.done)} de ${Math.round(o.hours.planned)} min previstos en ${win} días`, recordIds: [] });
  return out;
}

// ── Propuestas ─────────────────────────────────────────────────────────

export type ProposalKind = "reinforce" | "bridge_note" | "move_review" | "optional" | "lighten";
export type ProposalStatus = "open" | "dismissed" | "applied";

export interface ProposalBaseline {
  mastery: number | null;
  errors: number;
  avgScore: number | null;
  avgUnderstanding: number | null;
}

export interface Proposal {
  id: string;
  kind: ProposalKind;
  /** carpeta del tema al que se refiere (vacía en `lighten`) */
  folder: string;
  title: string;
  /** por qué se propone, en una frase */
  why: string;
  /** la sesión y el dato que lo demuestran */
  evidence: Array<{ recordId: string; date: string; note: string }>;
  /** lo que costaría aplicarla: llamadas de IA y archivos nuevos */
  cost: { aiCalls: number; files: number };
  skill?: string;
  status: ProposalStatus;
  source: "rules" | "ai";
  createdAt: string;
  appliedAt?: string;
  baseline?: ProposalBaseline;
  /** a quién se le propone: nunca se aplica sola */
  needsConfirmation: true;
}

export const PROPOSAL_LABEL: Record<ProposalKind, string> = {
  reinforce: "Refuerzo con ejercicios",
  bridge_note: "Nota puente",
  move_review: "Adelantar el repaso",
  optional: "Mover a opcional",
  lighten: "Bajar la carga",
};

/** Un id estable: la misma propuesta (tipo, tema, skill) sale siempre con el mismo id, así sobrevive a nuevas revisiones. */
export function proposalId(kind: string, folder: string, skill = ""): string {
  let h = 5381;
  for (const c of `${kind}|${folder}|${skill}`) h = ((h << 5) + h + c.charCodeAt(0)) >>> 0;
  return `pr-${h.toString(36)}`;
}

const evidenceOf = (records: ReadonlyArray<SessionRecord>, ids: readonly string[], note: (r: SessionRecord) => string): Proposal["evidence"] =>
  ids.map((id) => records.find((r) => r.id === id)).filter((r): r is SessionRecord => !!r).slice(0, 4).map((r) => ({ recordId: r.id, date: r.date, note: note(r) }));

/** Propuestas por REGLAS a partir de los patrones: es lo que se ofrece sin IA y con lo que se valida lo que devuelve la IA. */
export function proposalsFromPatterns(patterns: ReadonlyArray<Pattern>, records: ReadonlyArray<SessionRecord>, now: string): Proposal[] {
  const base = { status: "open" as const, source: "rules" as const, createdAt: now, needsConfirmation: true as const };
  const out: Proposal[] = [];
  for (const p of patterns) {
    const note = (r: SessionRecord): string => r.assessment?.errors || r.assessment?.doubt || `${r.minutes} min`;
    if (p.kind === "repeated_error" && p.folder) {
      out.push({ ...base, id: proposalId("reinforce", p.folder, p.skill), kind: "reinforce", folder: p.folder, title: `Reforzar ${p.title}${p.skill ? ` (${p.skill})` : ""}`, why: `Se repite: ${p.detail}.`, evidence: evidenceOf(records, p.recordIds, note), cost: { aiCalls: 1, files: 1 }, ...(p.skill ? { skill: p.skill } : {}) });
    } else if ((p.kind === "stuck_topic" || p.kind === "low_understanding") && p.folder) {
      out.push({ ...base, id: proposalId("bridge_note", p.folder), kind: "bridge_note", folder: p.folder, title: `Nota puente para ${p.title}`, why: `${p.title}: ${p.detail}. La nota actual no basta: una nota puente corta con lo que no se entiende.`, evidence: evidenceOf(records, p.recordIds, note), cost: { aiCalls: 1, files: 1 } });
      out.push({ ...base, id: proposalId("move_review", p.folder), kind: "move_review", folder: p.folder, title: `Repasar ${p.title} mañana`, why: `${p.title}: ${p.detail}. Adelantar su repaso lo mantiene fresco.`, evidence: evidenceOf(records, p.recordIds, note), cost: { aiCalls: 0, files: 0 } });
    } else if (p.kind === "low_hours") {
      out.push({ ...base, id: proposalId("lighten", ""), kind: "lighten", folder: "", title: "Bajar la carga del plan", why: `Llevas ${p.detail}: el plan pide más de lo que estás pudiendo hacer.`, evidence: [], cost: { aiCalls: 0, files: 0 } });
    }
  }
  return out;
}

// ── Seguimiento ────────────────────────────────────────────────────────

export interface FollowUp {
  verdict: "improved" | "same" | "worse" | "pending";
  /** días desde que se aplicó */
  days: number;
  detail: string;
}

/** Línea base de un tema para una propuesta: lo que había antes de aplicarla. */
export function baselineFor(folder: string, records: ReadonlyArray<SessionRecord>): ProposalBaseline {
  const m = masteryByTopic(records).find((x) => x.folder === folder);
  return { mastery: m?.mastery ?? null, errors: m?.errors ?? 0, avgScore: m?.avgScore ?? null, avgUnderstanding: m?.avgUnderstanding ?? null };
}

/** ¿Funcionó? Compara el tema con las sesiones POSTERIORES a aplicar la propuesta. Hacen falta ≥ 14 días y ≥ 2 sesiones; antes es «pendiente». */
export function followUpOf(p: Proposal, records: ReadonlyArray<SessionRecord>, today: string): FollowUp | null {
  if (p.status !== "applied" || !p.appliedAt || !p.baseline || !p.folder) return null;
  const appliedDay = p.appliedAt.slice(0, 10);
  const days = daysBetween(appliedDay, today);
  const after = records.filter((r) => r.date > appliedDay && r.assigned.some((t) => t.folder === p.folder));
  if (days < 14 || after.length < 2) return { verdict: "pending", days, detail: `Aún no hay datos suficientes (${days} días, ${after.length} sesiones desde que se aplicó).` };
  const now = masteryByTopic(after).find((x) => x.folder === p.folder);
  if (!now) return { verdict: "pending", days, detail: "Sin sesiones del tema desde que se aplicó." };
  const before = p.baseline.mastery;
  if (before === null) return { verdict: "same", days, detail: `Dominio ahora ${now.mastery} % (no había línea base).` };
  const d = now.mastery - before;
  const detail = `Dominio ${before} % → ${now.mastery} % · errores ${p.baseline.errors} → ${now.errors}`;
  return { verdict: d >= 8 ? "improved" : d <= -8 ? "worse" : "same", days, detail };
}

// ── Semana y retención ────────────────────────────────────────────────

/** La semana ISO de una fecha: `2026-W42`. */
export function isoWeekOf(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  const dow = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dow);
  const y = d.getUTCFullYear();
  const week = Math.ceil(((d.getTime() - Date.UTC(y, 0, 1)) / 86_400_000 + 1) / 7);
  return `${y}-W${String(week).padStart(2, "0")}`;
}

export interface WeekAggregate {
  week: string;
  sessions: number;
  minutes: number;
  avgUnderstanding: number | null;
  avgFocus: number | null;
  attempts: number;
  errors: number;
  byArea: Array<{ area: string; minutes: number; sessions: number }>;
  topics: Array<{ title: string; sessions: number }>;
}

/** El agregado de una semana: es lo que se conserva cuando el detalle de sus sesiones pasa de los 90 días. */
export function weekAggregate(week: string, records: ReadonlyArray<SessionRecord>): WeekAggregate {
  const rs = records.filter((r) => isoWeekOf(r.date) === week);
  const areas = new Map<string, { minutes: number; sessions: number }>();
  const topics = new Map<string, number>();
  for (const r of rs) {
    const a = areas.get(r.areaName) ?? { minutes: 0, sessions: 0 };
    a.minutes += r.minutes;
    a.sessions++;
    areas.set(r.areaName, a);
    for (const t of r.assigned) if (t.kind === "topic") topics.set(t.title, (topics.get(t.title) ?? 0) + 1);
  }
  return {
    week,
    sessions: rs.length,
    minutes: rs.reduce((n, r) => n + r.minutes, 0),
    avgUnderstanding: avg(rs.filter((r) => r.assessment?.understanding).map((r) => r.assessment!.understanding)),
    avgFocus: avg(rs.filter((r) => r.assessment?.focus).map((r) => r.assessment!.focus)),
    attempts: rs.reduce((n, r) => n + r.evidence.attempts.length, 0),
    errors: rs.reduce((n, r) => n + r.evidence.errors.reduce((m, e) => m + e.repeat, 0), 0),
    byArea: [...areas].map(([area, v]) => ({ area, ...v })).sort((a, b) => b.minutes - a.minutes),
    topics: [...topics].map(([title, sessions]) => ({ title, sessions })).sort((a, b) => b.sessions - a.sessions).slice(0, 12),
  };
}

/** Las sesiones cuyo detalle ya pasó de la retención (90 días). */
export const expiredRecords = (records: ReadonlyArray<SessionRecord>, today: string, days = RECORD_RETENTION_DAYS): SessionRecord[] => records.filter((r) => daysBetween(r.date, today) > days);

/** La nota semanal (resumen que sobrevive a la retención). */
export function renderWeekMarkdown(a: WeekAggregate): string {
  const L: string[] = ["---", "registro: semana", `semana: ${a.week}`, `sesiones: ${a.sessions}`, `minutos: ${a.minutes}`, "---", `# Registro de la semana ${a.week}`, ""];
  L.push(`- Sesiones: **${a.sessions}** · Tiempo: **${Math.floor(a.minutes / 60)} h ${a.minutes % 60} min**`);
  L.push(`- Comprensión media: ${a.avgUnderstanding ?? "—"}/5 · Concentración media: ${a.avgFocus ?? "—"}/5`);
  L.push(`- Intentos: ${a.attempts} · Errores: ${a.errors}`);
  if (a.byArea.length) {
    L.push("", "## Por área");
    for (const x of a.byArea) L.push(`- ${x.area}: ${x.minutes} min en ${x.sessions} ${x.sessions === 1 ? "sesión" : "sesiones"}`);
  }
  if (a.topics.length) {
    L.push("", "## Temas trabajados");
    for (const t of a.topics) L.push(`- ${t.title} (${t.sessions})`);
  }
  L.push("");
  return L.join("\n");
}

/** La nota de puntos débiles: los temas con menor dominio y los patrones abiertos, con enlaces. */
export function renderWeakPointsMarkdown(mastery: ReadonlyArray<TopicMastery>, patterns: ReadonlyArray<Pattern>, today: string): string {
  const L: string[] = ["---", "registro: puntos-debiles", `actualizado: ${today}`, "---", "# Puntos débiles", "", "> Generada por el Mentor a partir de tus sesiones. Se recalcula cada vez que guardas una sesión.", ""];
  L.push("## Temas con menor dominio");
  const weak = mastery.filter((m) => m.mastery < 70).slice(0, 12);
  if (!weak.length) L.push("- Ninguno por debajo de 70 %.");
  for (const m of weak) L.push(`- [[${nameOf(m.folder)}]] — dominio ${m.mastery} %${m.avgScore !== null ? ` · nota media ${m.avgScore}` : ""}${m.errors ? ` · ${m.errors} errores` : ""} · ${m.sessions} ${m.sessions === 1 ? "sesión" : "sesiones"}`);
  L.push("", "## Patrones abiertos");
  if (!patterns.length) L.push("- Ninguno en los últimos 14 días.");
  for (const p of patterns) L.push(`- ${p.folder ? `[[${nameOf(p.folder)}]]` : p.title}: ${p.detail}`);
  L.push("");
  return L.join("\n");
}

// ── Lo que devuelve la API a la interfaz ───────────────────────────────

export interface ProposalView extends Proposal {
  followUp: FollowUp | null;
}

export interface RecordsList {
  records: SessionRecord[];
  overview: { mastery: TopicMastery[]; patterns: Pattern[]; weeks: WeekAggregate[] };
  proposals: ProposalView[];
  lastReviewAt: string;
  space: string;
  noteDir: string;
  retentionDays: number;
  aiConfigured: boolean;
}
