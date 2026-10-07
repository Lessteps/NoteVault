// Mentor: informe del estudiante, candidatos de estudio y registro de sesiones.
//
// Todo el cálculo vive en core/mentor (puro y testeado); aquí solo se arma el
// contexto con los managers de la vault y se validan las entradas de la UI. La IA
// (fase siguiente) consume `mentor_brief().text`: nunca lee notas completas.

import { AIConfig, sendChat, type ChatMessage, type SendOpts } from "../../core/aiClient.js";
import { ApiError } from "../../core/errors.js";
import { loadExamRecordForTopic } from "../../core/practice/exams.js";
import { loadAllAttempts } from "../../core/practice/ledger.js";
import { hubSnapshot } from "../../core/practice/recommender.js";
import { manifestsFromNotes, type TopicManifest } from "../../core/practice/topic.js";
import { FILTER_ACTIVE, ITEM_DONE } from "../../core/goalManager.js";
import { allocate, buildCandidates } from "../../core/mentor/candidates.js";
import { buildPracticeTrack, practiceDayMinutes, practiceItemsFor, sanitizePracticeTrack, suggestionsOf, type PracticeItem } from "../../lib/practiceTrack.js";
import { derivePracticeStatus, kataDates, manualPracticeOf, phasesDone, ppAreaDir, readPpProjects, type PracticeStatus } from "../../core/mentor/practiceState.js";
import { loadProfile, suggestFocus } from "../../core/ppractice/profile.js";
import { objectiveText, resolveObjective, sanitizeObjective, subjectLabel } from "../../core/mentor/objective.js";
import {
  buildPlan,
  DELIVERABLE_STATUSES,
  deriveView,
  mergePlans,
  MONTH_RE,
  PLAN_ID_RE,
  PlanStore,
  planItemsFor,
  planName,
  planStatus,
  refreshPlanProgress,
  topicState,
  type DeliverableStatus,
  type Plan,
  type PlanItem,
  type SubplanSeed,
  type TopicLiteLookup,
} from "../../core/mentor/plan.js";
import { branchAllowed, branchOfFolder, classifyBranch, detectBranchIntent, periodLabel, sanitizeNotes } from "../../lib/planTime.js";
import {
  BUILD_ID_RE,
  computeBuild,
  emptyAi,
  isBuildStage,
  makeAnswer,
  MAX_BUILD_QUESTIONS,
  newBuildId,
  PlanBuildStore,
  stageIndex,
  summaryOf,
  type AnswerInput,
  type BuildAiState,
  type BuildCtx,
  type BuildStage,
  type PlanBuild,
} from "../../core/mentor/planBuild.js";
import {
  applyOps,
  ChangeStore,
  changeMessages,
  deltaText,
  MAX_COMMENT_CHARS,
  opsFromText,
  parseChangeReply,
  viewOf,
  type ChangeEntry,
  type ChangeOp,
} from "../../core/mentor/planChange.js";
import { generateByParts, PipelineCancel } from "../../core/mentor/planPipeline.js";
import { canReorganize, reorganizeByAreas } from "../../core/mentor/planReorganize.js";
import { PLAN_DELIVERABLE_STATUSES, sanitizeGroups, type PlanDeliverableStatus } from "../../lib/planAreas.js";
import { buildSchedule, deliverablesOf } from "../../lib/planSchedule.js";
import { CurriculumCancel, generateCurriculum } from "../../core/mentor/planCurriculumAi.js";
import { areaKeyOf, computeCoverage, MAX_PROFILE_CHARS, parseCoverageReply } from "../../lib/planCoverage.js";
import { coverageMessages } from "../../core/mentor/planCoverageAi.js";
import { parseScopeReply, parseTopicsReply, scopeMessages, topicsMessages } from "../../core/mentor/planBuildAi.js";
import {
  areaOfFolder,
  adjustedMinutes,
  autoSeeds,
  defaultDeliverableFor,
  buildPlanMessages,
  composeFromPreconditions,
  dynamicCatalogMax,
  resolveBranches,
  markDiagnostics,
  parsePreconditionReply,
  planCatalog,
  preconditionsProblem,
  resolveScope,
  sanitizePreconditions,
  scopeTopics,
  seedsFromReply,
  preconditionsRequest,
  type GoalScope,
  type PlanPreconditions,
} from "../../core/mentor/planSpec.js";
import {
  buildChatMessages,
  composePlanDraft,
  parseChatResponse,
  planDraftSummary,
  planWindow,
  type PlanContext,
  type PlanDraft,
} from "../../core/mentor/planDraft.js";
import { buildStudentBrief, toPromptText, type BriefContext, type QueueHint } from "../../core/mentor/brief.js";
import { adherence, BLOCK_STATUSES, sanitizeSession, SessionLog, type BlockStatus } from "../../core/mentor/sessionLog.js";
import { aiUnavailableReason, planToBlocks, proposePlan, type ProposedBlock, type SendFn } from "../../core/mentor/planner.js";
import { snapshotTopics, type TopicSnap } from "../../core/mentor/topics.js";
import { ChatStore, pendingDraft, type ChatLog, type ChatTurnRecord } from "../../core/mentor/chatLog.js";
import {
  buildTopicCatalog,
  composeDraft,
  estimateTopicMinutes,
  fold,
  scheduleGoal,
  type ChatTurn,
} from "../../core/mentor/goalDraft.js";
import { studyAreas, topicsPanel } from "../../core/mentor/panels.js";
import { sectionData, type StudyPendingData, type TasksData, type TopicsData } from "../../core/mentor/brief.js";
import { StudyErrorManager } from "../../core/studyErrorManager.js";
import { StudySRSManager } from "../../core/studySrsManager.js";
import { AppConfig } from "../appConfig.js";
import type { AppState } from "../appState.js";
import { clampInt } from "../common.js";
import { vaultScan } from "../vaultScan.js";
import { parseTopicLink } from "../../core/practice/topicLinks.js";
import { goalsApi } from "./goals.js";
import { projectsApi } from "./projects.js";
import { studyIndexCold } from "./study.js";

const DEFAULT_BRIEF_CHARS = 6000;

/** Cancelación de una llamada larga de IA: `abort` = no hacer nada; `auto` = seguir con el plan automático (sin IA). */
class CancelError extends Error {
  constructor(readonly mode: "abort" | "auto") {
    super(mode === "auto" ? "Seguir sin IA." : "Cancelado por ti.");
  }
}
interface Job {
  key: string;
  label: string;
  since: number;
  waiters: Set<(e: Error) => void>;
  cancelled?: "abort" | "auto";
  /** al cancelar se aborta: las llamadas en vuelo MATAN su petición o su proceso de Claude Code */
  controller: AbortController;
}
const JOBS = new WeakMap<AppState, Map<string, Job>>();
function jobsOf(app: AppState): Map<string, Job> {
  let m = JOBS.get(app);
  if (!m) JOBS.set(app, (m = new Map()));
  return m;
}

/** Operaciones en vuelo del constructor guiado por vault (un plan en construcción hace una cosa a la vez). */
const INFLIGHT = new WeakMap<AppState, Map<string, { key: string; p: Promise<unknown> }>>();
function inflightOf(app: AppState): Map<string, { key: string; p: Promise<unknown> }> {
  let m = INFLIGHT.get(app);
  if (!m) INFLIGHT.set(app, (m = new Map()));
  return m;
}
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function needDate(value: unknown): string {
  const d = String(value ?? "");
  if (!DATE_RE.test(d)) throw new ApiError("Fecha inválida (AAAA-MM-DD).");
  return d;
}

/** Foto de todos los temas de la vault (misma fuente que `study_topic_dashboard`). */
function topicSnaps(app: AppState): TopicSnap[] {
  const scan = vaultScan(app);
  const byFolder = new Map<string, { folder: string; manifest: TopicManifest }>();
  for (const found of manifestsFromNotes(scan.notes)) {
    const folder = app.rel(found.topicFolder).replace(/\\/g, "/");
    if (!byFolder.has(folder)) {
      byFolder.set(folder, { folder, manifest: { ...found.manifest, path: app.rel(found.manifestPath), folder } });
    }
  }
  return snapshotTopics({
    manifests: [...byFolder.values()],
    exercises: scan.exercises,
    attempts: loadAllAttempts(app.root),
    noteRels: scan.notes.map((n) => n.rel),
    examFor: (manifest) => loadExamRecordForTopic(app.root, manifest),
  });
}

/** Cola del recomendador (la misma del hub de Estudio), resumida; vacía si falla. */
function studyQueue(app: AppState): QueueHint[] {
  try {
    const snap = hubSnapshot(app.root, app.vault.notePaths(), null, null);
    return snap.queue.items.slice(0, 8).map((q) => ({
      kind: q.kind,
      subject: q.subject,
      title: q.title,
      reason: q.reason,
      ...(q.exercise?.rel ? { exercise: q.exercise.rel } : {}),
    }));
  } catch {
    return [];
  }
}

export function briefContext(app: AppState, log: SessionLog): BriefContext {
  const m = app.mgrs();
  const now = new Date();
  return {
    today: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
    goals: m.goals,
    tasks: m.tasks,
    projects: m.projects,
    srs: new StudySRSManager(app.root),
    errors: new StudyErrorManager(app.root),
    topics: () => topicSnaps(app),
    sessions: () => log.recent(14),
    queue: () => studyQueue(app),
  };
}

const localDate = (d = new Date()): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Historial para la IA: los borradores se resumen en JSON compacto para que sepa qué propuso. */
function toHistory(turns: readonly ChatTurnRecord[]): ChatTurn[] {
  return turns.slice(-20).map((t) => ({
    role: t.role,
    content: t.planDraft
      ? planDraftSummary(t.planDraft)
      : t.draft
      ? JSON.stringify({
          type: "goal_draft",
          name: t.draft.name,
          hoursPerWeek: t.draft.schedule.hoursPerWeek,
          durationWeeks: Math.round((Date.parse(t.draft.schedule.end) - Date.parse(t.draft.schedule.start)) / (7 * 86400000)),
          topics: t.draft.topics.map((x) => ({ folder: x.folder, skills: x.skills, why: x.why })),
        })
      : t.content,
  }));
}

/** Metas y proyectos reales que la IA puede referenciar en un plan del mes. */
function planContext(app: AppState, today: string): PlanContext {
  const m = app.mgrs();
  return {
    month: today.slice(0, 7),
    today,
    goals: m.goals.goals(FILTER_ACTIVE).map((g) => ({
      id: g.id,
      name: g.name,
      items: m.goals.items(g.id).filter((i) => i.is_leaf && i.status !== ITEM_DONE).map((i) => ({ id: i.id, name: i.name })),
    })),
    projects: m.projects.projects().filter((p) => p.status === "En curso" || p.status === "Planeado").map((p) => ({ id: p.id, name: p.name })),
  };
}

/** Lo que el plan del mes dice que toca hoy (solo lee el plan). */
function todaysPlanItems(app: AppState, day: string = localDate()): PlanItem[] {
  return planItemsFor(day, new PlanStore(app.root).list());
}

/** Estado derivado de la práctica de un plan (módulo `programming_practice` + registro manual de «Hoy»). */
function practiceStatusOf(app: AppState, plan: Plan, today: string, log: SessionLog, shared?: { projects: ReturnType<typeof readPpProjects>; kata: Set<string> }): PracticeStatus | null {
  if (!plan.programmingPractice) return null;
  const projects = shared?.projects ?? readPpProjects(app.root);
  const kata = shared?.kata ?? kataDates(loadAllAttempts(app.root));
  return derivePracticeStatus({ plan, today, projects, kataDates: kata, manual: manualPracticeOf(plan.id, log.recent(60)), ppReady: !!ppAreaDir(app.root) });
}

/** Lo que la pista Programming practice de los planes activos pide hoy (kata del día y sesión del proyecto semanal). */
function todaysPracticeItems(app: AppState, day: string = localDate()): PracticeItem[] {
  const plans = new PlanStore(app.root).list().filter((p) => p.programmingPractice && planStatus(p, day) === "activo");
  if (!plans.length) return [];
  const sl = new SessionLog(app.root);
  const shared = { projects: readPpProjects(app.root), kata: kataDates(loadAllAttempts(app.root)) };
  const status = new Map(plans.map((p) => [p.id, practiceStatusOf(app, p, day, sl, shared)]));
  return practiceItemsFor(
    day,
    plans,
    {
      kata: (id, d) => !!status.get(id)?.kata && d === day && status.get(id)!.kata!.todayDone,
      project: (id, week, phases) => phasesDone(status.get(id) ?? null, week, phases),
    },
    (p) => planName(p as Plan),
  );
}

/**
 * Responde la pregunta de entregables sobre una lista de subplanes. Sin `subplanId` es la pregunta GLOBAL del plan por áreas:
 * «yes» añade el proyecto propio de cada área que aún no lo tiene (y retira también las preguntas por subplan antiguas) y «no» descarta
 * la pregunta. Con `subplanId` es la de ese subplan (planes antiguos). Los entregables repetidos se evitan: cada área propone el suyo.
 */
function answerDeliverables<T extends { id: string; area: string; objective: string; areaId?: string; goalId?: string; deliverable?: { title: string; description: string; criteria: string[]; status: DeliverableStatus; projectId?: string } }>(
  subplans: readonly T[],
  open: ReadonlyArray<{ id: string; subplanId?: string; text: string; options: string[] }> | undefined,
  subplanId: string,
  answer: "yes" | "no",
): { subplans: T[]; openQuestions: Array<{ id: string; subplanId?: string; text: string; options: string[] }> } {
  const targets = subplanId ? subplans.filter((s) => s.id === subplanId) : subplans;
  const next = subplans.map((s) => {
    if (answer !== "yes" || !targets.includes(s) || s.deliverable) return s;
    const d = defaultDeliverableFor(s);
    return { ...s, deliverable: { title: d.title, description: d.description ?? "", criteria: d.criteria ?? [], status: "idea" as const } };
  });
  let rest = (open ?? []).filter((q) => (subplanId ? !(q.id === "deliverables" && q.subplanId === subplanId) : q.id !== "deliverables"));
  // si ya no queda ningún área sin proyecto, la pregunta global está respondida
  if (next.every((s) => !!s.deliverable)) rest = rest.filter((q) => q.id !== "deliverables");
  return { subplans: next, openQuestions: [...rest] };
}

/** Planes que contienen el día `day` (varios pueden estar activos a la vez). */
const activePlans = (plans: readonly Plan[], day: string): Plan[] => plans.filter((p) => planStatus(p, day) === "activo");

const planRow = (p: Plan, today: string, lookup?: TopicLiteLookup) => {
  const topics = p.subplans.reduce((n, s) => n + s.topics.length, 0);
  const view = lookup ? deriveView(p, lookup, today) : null;
  const completed = view ? view.summary.done : p.subplans.reduce((n, s) => n + s.topics.filter((t) => t.completedAt).length, 0);
  return {
    id: p.id,
    start: p.start,
    end: p.end,
    ...(p.month ? { month: p.month } : {}),
    name: planName(p),
    period: periodLabel(p.start, p.end),
    status: planStatus(p, today),
    archived: !!p.archived,
    auto: !!p.auto,
    subplans: p.subplans.length,
    topics,
    completed,
    pct: view ? view.summary.pct : topics ? Math.round((completed / topics) * 100) : 0,
    minutesPerDay: p.preconditions?.minutesPerDay ?? null,
    programmingPractice: !!p.programmingPractice,
    ...(p.structure ? { structure: p.structure } : {}),
  };
};

/** Activos primero (el más reciente arriba), luego futuros por fecha, luego terminados del más reciente al más antiguo. */
function sortRows<T extends { status: string; start: string; end: string }>(rows: T[]): T[] {
  const rank = { propuesto: 0, activo: 1, futuro: 2, terminado: 3 } as Record<string, number>;
  return [...rows].sort((a, b) => rank[a.status]! - rank[b.status]! || (a.status === "terminado" ? b.end.localeCompare(a.end) : a.status === "activo" ? b.start.localeCompare(a.start) : a.start.localeCompare(b.start)));
}

/** El plan que se muestra por defecto: el activo hoy; si no, el siguiente futuro; si no, el último terminado. */
function defaultPlan(plans: readonly Plan[], today: string): Plan | null {
  // un plan propuesto no es «el plan de hoy»: solo se ve si no hay otro
  const real = plans.filter((p) => !p.proposed);
  const pool = real.length ? real : plans;
  const rows = sortRows(pool.map((p) => planRow(p, today)));
  return pool.find((p) => p.id === rows[0]?.id) ?? null;
}

/** Primer foco de la rotación de proyectos: el que sugiere el perfil de `programming_practice`, si lo hay. */
function practiceStartFocus(app: AppState) {
  try {
    return suggestFocus(loadProfile(app.root)) ?? undefined;
  } catch {
    return undefined;
  }
}

const toIso = (d: Date | null | undefined): string | null => (d ? localDate(d) : null);

/** Metas activas con los temas que enlazan sus submetas (`topic_links`), para el alcance de un plan. */
function goalScopes(app: AppState): GoalScope[] {
  const m = app.mgrs();
  const areaName = new Map(m.areas.areas().map((a) => [a.id, a.name]));
  return m.goals.goals(FILTER_ACTIVE).map((g) => ({
    id: g.id,
    name: g.name,
    area: areaName.get(g.area) ?? "",
    end: toIso(g.end),
    items: m.goals
      .items(g.id)
      .filter((i) => i.is_leaf && i.status !== ITEM_DONE && i.topic_links.length > 0)
      .sort((a, b) => a.order - b.order || (a.start?.getTime() ?? Infinity) - (b.start?.getTime() ?? Infinity) || (a.due?.getTime() ?? Infinity) - (b.due?.getTime() ?? Infinity) || a.name.localeCompare(b.name, "es", { numeric: true, sensitivity: "base" }))
      .map((i) => ({
        id: i.id,
        name: i.name,
        links: i.topic_links
          .map((l: string) => parseTopicLink(l))
          .filter((l: ReturnType<typeof parseTopicLink>): l is NonNullable<ReturnType<typeof parseTopicLink>> => l !== null)
          .map((l: { topic: string; skills: string[] }) => ({ folder: l.topic, skills: l.skills })),
      })),
  }));
}

const midnight = (d = new Date()): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const DAY = 86400000;

/** Opciones del selector "Objetivo de la sesión": metas que se cumplen a diario/semanalmente, materias y atajos. */
function objectiveOptions(app: AppState, brief: ReturnType<typeof buildStudentBrief>) {
  const m = app.mgrs();
  const today = midnight();
  const goals: Array<{ goalId: string; name: string; area: string; kind: "daily" | "weekly" | "due" | "topics"; itemIds: string[]; hint: string }> = [];
  for (const g of m.goals.goals(FILTER_ACTIVE)) {
    const leaves = m.goals.items(g.id).filter((i) => i.is_leaf && i.status !== ITEM_DONE);
    const daily = leaves.filter((i) => i.repeating && i.rule.freq === "daily");
    const weekly = leaves.filter((i) => i.repeating && i.rule.freq !== "daily");
    const due = leaves.filter((i) => !i.repeating && i.due && (i.due.getTime() - today.getTime()) / DAY <= 7);
    const topics = leaves.filter((i) => !i.repeating && i.topic_links.length > 0);
    const kind = daily.length ? "daily" : weekly.length ? "weekly" : due.length ? "due" : topics.length ? "topics" : null;
    if (!kind) continue;
    const picked = [...new Set([...daily, ...weekly, ...due, ...topics].map((i) => i.id))];
    const hint = kind === "daily" ? "a diario" : kind === "weekly" ? "semanal" : kind === "due" ? "vence esta semana" : "con temas de estudio";
    goals.push({ goalId: g.id, name: g.name, area: g.area, kind, itemIds: picked, hint });
  }
  const topics = sectionData<TopicsData>(brief, "topics")?.topics ?? [];
  const bySubject = new Map<string, { topics: number; open: number }>();
  for (const t of topics) {
    const e = bySubject.get(t.subject) ?? { topics: 0, open: 0 };
    e.topics++;
    if (t.status !== "complete") e.open++;
    bySubject.set(t.subject, e);
  }
  const subjects = [...bySubject.entries()]
    .map(([subject, v]) => ({ subject, label: subjectLabel(subject), topics: v.topics, open: v.open }))
    .sort((a, b) => a.label.localeCompare(b.label, "es"));
  const day = localDate();
  const active = activePlans(new PlanStore(app.root).list(), day);
  const lead = [...active].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).find((p) => p.preconditions?.minutesPerDay) ?? active[0];
  return {
    goals,
    subjects,
    tasksPending: sectionData<TasksData>(brief, "tasks")?.tasks.length ?? 0,
    plan: active.length
      ? {
          month: (lead ?? active[0]!).start.slice(0, 7),
          id: (lead ?? active[0]!).id,
          start: (lead ?? active[0]!).start,
          end: (lead ?? active[0]!).end,
          items: planItemsFor(day, active).length,
          minutesPerDay: lead?.preconditions?.minutesPerDay ?? null,
        }
      : null,
    programmingPractice: active.some((p) => p.programmingPractice) ? { items: todaysPracticeItems(app, day).length } : null,
  };
}

/** El id de un área real a partir de su id o su nombre; "" si no existe (nunca se crea un área). */
function resolveArea(app: AppState, wanted: unknown): string {
  const w = fold(String(wanted ?? "").trim());
  if (!w) return "";
  const hit = app.mgrs().areas.areas().find((a) => !a.archived && (fold(a.id) === w || fold(a.name) === w));
  return hit ? hit.id : "";
}

/** Solo lo que pintan las previsualizaciones (sin historial ni adherencia). */
function slimItem(i: any) {
  return {
    id: i.id,
    parent: i.parent,
    name: i.name,
    status: i.status,
    due: i.due,
    start: i.start,
    is_leaf: i.is_leaf,
    progress: i.progress,
    topic_links: i.topic_links,
    topic_progress: i.topic_progress,
    late: i.late,
    priority: i.priority,
    category: i.category,
    schedule: i.schedule,
    is_priority: i.is_priority,
    counts: i.counts,
    done_today: i.done_today,
  };
}

/** Lo que pinta el panel de proyectos de cada issue abierto. */
function slimIssue(i: any) {
  return {
    id: i.id,
    key: i.key,
    title: i.title,
    status: i.status,
    priority: i.priority,
    parent: i.parent,
    due: i.due,
    overdue: i.overdue,
    icon: i.icon,
    type: i.type,
    type_colour: i.type_colour,
  };
}

/** `send` se inyecta solo en los tests; en la app es `sendChat`. */
export function mentorApi(app: AppState, send?: SendFn) {
  const log = () => new SessionLog(app.root);
  const chats = () => new ChatStore(app.root);
  /** La conversación activa del Mentor, o la indicada (así un turno en vuelo no salta de conversación). */
  const chatFor = (id?: unknown): ChatLog | null => (id ? chats().get(String(id)) : null) ?? chats().peek();
  const stateOf = (c: ChatLog | null) => {
    if (!c) return { id: null as string | null, title: "", turns: [] as ChatTurnRecord[], pending: null as string | null };
    const rec = c.record();
    return { id: rec.id as string | null, title: rec.title, turns: rec.turns, pending: pendingDraft(rec.turns)?.id ?? null };
  };

  function markBlock(date: unknown, candidateId: unknown, status: unknown, note?: unknown) {
    if (!(BLOCK_STATUSES as readonly string[]).includes(String(status))) throw new ApiError("Estado de bloque inválido.");
    const rec = log().markBlock(
      needDate(date),
      String(candidateId ?? ""),
      status as BlockStatus,
      note === undefined || note === null ? undefined : String(note),
    );
    if (!rec) throw new ApiError("Ese bloque ya no existe.");
    return rec;
  }

  function discardPlanDraft(turnId: unknown) {
    const turns = chatFor()?.patch(String(turnId ?? ""), { discarded: true });
    if (!turns) throw new ApiError("Ese borrador ya no existe.");
    return { turns, pending: pendingDraft(turns)?.id ?? null };
  }

  // ── Constructor guiado del plan (core/mentor/planBuild.ts) ──
  // ── Llamadas largas a la IA: estado («pensando…»), progreso y cancelación ──
  const jobs = jobsOf(app);
  interface JobHandle {
    send: (messages: ChatMessage[], o?: { signal?: AbortSignal; timeoutMs?: number }) => Promise<string>;
    setLabel: (label: string) => void;
    cancelled: () => "abort" | "auto" | undefined;
  }
  async function withJob<T>(key: string, label: string, fn: (job: JobHandle) => Promise<T>): Promise<T> {
    const job: Job = { key, label, since: Date.now(), waiters: new Set(), controller: new AbortController() };
    jobs.set(key, job);
    const handle: JobHandle = {
      cancelled: () => job.cancelled,
      setLabel: (l) => {
        job.label = l;
      },
      send: (messages, o) => {
        if (job.cancelled) return Promise.reject(new CancelError(job.cancelled));
        const signal = o?.signal ? AbortSignal.any([job.controller.signal, o.signal]) : job.controller.signal;
        return new Promise<string>((resolve, reject) => {
          job.waiters.add(reject);
          aiSendRaw(messages, { signal, ...(o?.timeoutMs ? { timeoutMs: o.timeoutMs } : {}) }).then(resolve, (e) => reject(job.cancelled ? new CancelError(job.cancelled) : e)).finally(() => job.waiters.delete(reject));
        });
      },
    };
    try {
      return await fn(handle);
    } finally {
      jobs.delete(key);
    }
  }
  const aiSendRaw = async (messages: ChatMessage[], opts?: SendOpts): Promise<string> => (send ?? sendChat)(AIConfig.fromDict(AppConfig.get_ai_config()), messages, opts);
  const builds = () => new PlanBuildStore(app.root, localDate);
  const inflight = inflightOf(app);
  /** Una sola operación a la vez por plan en construcción: la misma (doble envío) comparte la llamada; otra distinta espera. */
  function guarded<T>(id: string, key: string, fn: () => Promise<T>): Promise<T> {
    const cur = inflight.get(id);
    if (cur) {
      if (cur.key === key) return cur.p as Promise<T>;
      throw new ApiError("El Mentor sigue pensando en este plan. Espera un momento.");
    }
    const p = fn().finally(() => {
      if (inflight.get(id)?.p === p) inflight.delete(id);
    });
    inflight.set(id, { key, p });
    return p;
  }
  const buildCtx = (): BuildCtx | null => {
    if (studyIndexCold(app)) return null;
    return {
      today: localDate(),
      all: buildTopicCatalog(topicSnaps(app), "", { max: 1_000_000 }),
      goals: goalScopes(app),
      startFocus: practiceStartFocus(app),
      aiOn: aiUnavailableReason(AIConfig.fromDict(AppConfig.get_ai_config())) === null,
    };
  };

  /** Recalcula el plan en construcción y, si una etapa lo pide, hace UNA llamada pequeña a la IA (validada; si falla o se cancela, sigue por reglas). */
  async function advance(b: PlanBuild, ctx: BuildCtx, finishing: boolean, job: JobHandle): Promise<PlanBuild> {
    let cur = b;
    for (let i = 0; i < 60; i++) {
      const input = { pre: cur.pre, answers: cur.answers, ai: cur.ai, maxQuestions: cur.maxQuestions };
      const comp = computeBuild(input, ctx, { finishing, noAi: i === 59 });
      if (comp.needs === "ai_scope" && comp.info) {
        const ai: BuildAiState = { ...cur.ai, scopeTried: true, errors: [...cur.ai.errors] };
        job.setLabel("Leyendo tus comentarios y preparando las preguntas…");
        try {
          const brief = buildStudentBrief(briefContext(app, log()));
          const parsed = parseScopeReply(await job.send(scopeMessages(brief, cur.pre, comp.info.areas, comp.info.rules, cur.answers), { timeoutMs: 120_000 }), comp.info.rules.map((r) => r.id));
          if (parsed.ok) Object.assign(ai, { scopeOk: true, questions: parsed.questions, rewrites: { ...ai.rewrites, ...parsed.rewrites } });
          else ai.errors.push(parsed.reason ?? "La IA no devolvió nada útil.");
        } catch (e) {
          if (e instanceof CancelError && e.mode === "abort") throw new ApiError("Cancelado.");
          ai.errors.push(e instanceof CancelError ? "Pediste seguir sin IA." : `La IA falló: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300));
        }
        cur = { ...cur, ai };
        continue;
      }
      if (comp.needs === "ai_topics" && comp.info?.block) {
        const block = comp.info.block;
        const key = block.slice(0, block.lastIndexOf("#"));
        const seed = comp.info.seeds[0]!;
        const ai: BuildAiState = { ...cur.ai, topicsDone: [...cur.ai.topicsDone, block], errors: [...cur.ai.errors].slice(-4) };
        job.setLabel(`Eligiendo temas de ${seed.area}${seed.objective ? ` · ${seed.objective}` : ""}…`.slice(0, 120));
        try {
          const brief = buildStudentBrief(briefContext(app, log()));
          const candidates = new Map([[key, new Set(seed.topics.map((t) => t.folder))]]);
          const parsed = parseTopicsReply(await job.send(topicsMessages(brief, cur.pre, [seed], cur.answers), { timeoutMs: 120_000 }), candidates);
          if (parsed.ok) {
            Object.assign(ai, {
              topicsOk: true,
              topicsOkBlocks: [...ai.topicsOkBlocks, block],
              order: { ...ai.order, [key]: [...(ai.order[key] ?? []), ...(parsed.order[key] ?? [])] },
              rewrites: { ...ai.rewrites, ...parsed.rewrites },
              discarded: [...new Set([...ai.discarded, ...parsed.discarded])].slice(0, 20),
            });
          } else ai.errors.push(parsed.reason ?? "La IA no devolvió nada útil.");
        } catch (e) {
          if (e instanceof CancelError && e.mode === "abort") throw new ApiError("Cancelado.");
          ai.errors.push(e instanceof CancelError ? "Pediste seguir sin IA." : `La IA falló: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300));
        }
        cur = { ...cur, ai };
        continue;
      }
      const { openQuestion: _old, ...rest } = cur;
      return {
        ...rest,
        stage: comp.stage,
        steps: comp.steps,
        draft: comp.draft,
        skeleton: comp.skeleton,
        effective: comp.effective,
        ...(comp.question ? { openQuestion: comp.question } : {}),
        status: comp.status,
        finishing,
        questionCount: cur.answers.length,
        source: cur.ai.scopeOk || cur.ai.topicsOk ? "ai" : "rules",
        name: comp.name,
      };
    }
    throw new ApiError("No se pudo calcular el plan en construcción.");
  }
  const loadBuild = (id: unknown): PlanBuild => {
    const sid = String(id ?? "");
    const b = BUILD_ID_RE.test(sid) ? builds().load(sid) : null;
    if (!b || b.status === "abandoned") throw new ApiError("Ese plan en construcción ya no existe.");
    return b;
  };
  const buildView = (b: PlanBuild) => ({ loading: false as const, build: b, summary: summaryOf(b) });
  /** El plan de una petición de cobertura (`{ id }`), o error claro. */
  const coveragePlan = (opts: unknown): Plan => {
    const id = String(((opts && typeof opts === "object" ? opts : {}) as Record<string, any>).id ?? "");
    if (!PLAN_ID_RE.test(id)) throw new ApiError("Plan inválido.");
    const plan = new PlanStore(app.root).load(id);
    if (!plan) throw new ApiError("Ese plan ya no existe.");
    return plan;
  };
  /** Cobertura determinista del plan contra TODOS los temas de la vault (notas de teoría y ejercicios por tema). */
  const coverageOf = (plan: Plan) => {
    const snaps = topicSnaps(app);
    const topics = snaps.map((t) => ({ folder: t.folder, title: t.title, theoryNotes: t.theoryNotes, exerciseCount: t.exerciseCount, ...(t.planExercises ? { planExercises: t.planExercises } : {}), completenessPct: t.progress.completenessPct }));
    return { coverage: computeCoverage(plan, topics, { ppReady: !!ppAreaDir(app.root) }), snaps };
  };
  let acceptRef: (opts: unknown) => any = () => {
    throw new ApiError("No disponible.");
  };

  const api = {
    mentor_brief(opts: unknown = {}) {
      const o = (opts && typeof opts === "object" ? opts : {}) as Record<string, any>;
      const strs = (v: unknown): string[] | undefined =>
        Array.isArray(v) ? v.map((x) => String(x)).slice(0, 20) : undefined;
      const brief = buildStudentBrief(briefContext(app, log()), { only: strs(o.only), exclude: strs(o.exclude) });
      const maxChars = clampInt(o.maxChars, 500, 40000, DEFAULT_BRIEF_CHARS);
      return { brief, text: toPromptText(brief, maxChars) };
    },

    mentor_candidates(opts: unknown) {
      const o = (opts && typeof opts === "object" ? opts : {}) as Record<string, any>;
      const availableMinutes = clampInt(o.availableMinutes, 5, 720, 60);
      const brief = buildStudentBrief(briefContext(app, log()));
      const objective = sanitizeObjective(o.objective) ?? undefined;
      const candidates = buildCandidates(brief, { availableMinutes, objective, planItems: todaysPlanItems(app), practiceItems: todaysPracticeItems(app) });
      const plan = allocate(candidates, availableMinutes, {
        maxSubjects: o.maxSubjects === undefined ? undefined : clampInt(o.maxSubjects, 1, 10, 3),
      });
      return {
        availableMinutes,
        candidates,
        plan,
        plannedMinutes: plan.reduce((n, c) => n + c.estMinutes, 0),
      };
    },

    mentor_session_save(record: unknown) {
      const clean = sanitizeSession(record);
      if (!clean) throw new ApiError("Sesión inválida.");
      return log().save(clean);
    },

    mentor_session_load(date: unknown) {
      return log().load(needDate(date));
    },

    mentor_session_recent(n: unknown = 14) {
      return log().recent(clampInt(n, 1, 365, 14));
    },

    mentor_session_mark_block: markBlock,

    mentor_adherence(n: unknown = 30) {
      return adherence(log().recent(clampInt(n, 1, 365, 30)));
    },

    /**
     * "Lo que sé de ti": señales del informe en texto + adherencia reciente, para el panel
     * lateral de la pestaña. `loading` mientras el índice de la vault está frío (la vista
     * reintenta, igual que el dashboard de estudio).
     */
    mentor_overview() {
      if (studyIndexCold(app)) return { loading: true as const };
      const brief = buildStudentBrief(briefContext(app, log()));
      return {
        loading: false as const,
        date: brief.date,
        weekday: brief.weekday,
        sections: brief.sections.map((s) => ({ id: s.id, title: s.title, summary: s.summary, signals: s.signals })),
        adherence: adherence(log().recent(30)),
        today: log().load(localDate()),
        aiConfigured: aiUnavailableReason(AIConfig.fromDict(AppConfig.get_ai_config())) === null,
        objectives: objectiveOptions(app, brief),
      };
    },

    /**
     * Propone el plan de hoy: candidatos del informe + IA (o plan automático). Nunca escribe;
     * el plan solo se guarda al aceptarlo (`mentor_plan_accept`).
     */
    async mentor_plan_propose(opts: unknown) {
      const o = (opts && typeof opts === "object" ? opts : {}) as Record<string, any>;
      const availableMinutes = clampInt(o.availableMinutes, 5, 720, 60);
      if (studyIndexCold(app)) return { loading: true as const };
      const strs = (v: unknown): string[] | undefined => (Array.isArray(v) ? v.map((x) => String(x)).slice(0, 50) : undefined);
      const brief = buildStudentBrief(briefContext(app, log()));
      const spec = sanitizeObjective(o.objectiveSpec) ?? undefined;
      const candidates = buildCandidates(brief, { availableMinutes, objective: spec, planItems: todaysPlanItems(app), practiceItems: todaysPracticeItems(app) });
      const cfg = AIConfig.fromDict(AppConfig.get_ai_config());
      const objective = (spec ? objectiveText(resolveObjective(spec, brief), brief) : "") || (o.objective ? String(o.objective).slice(0, 500) : "");
      const res = await proposePlan(
        cfg,
        {
          brief,
          candidates,
          availableMinutes,
          objective: objective || undefined,
          userNote: o.userNote ? String(o.userNote).slice(0, 500) : undefined,
          excludeSubjects: strs(o.excludeSubjects),
          excludeCandidateIds: strs(o.excludeCandidateIds),
        },
        send,
      );
      return {
        loading: false as const,
        availableMinutes,
        objective,
        plan: res.plan,
        source: res.source,
        candidates: res.candidates,
        ...(res.error ? { error: res.error } : {}),
      };
    },

    /**
     * Acepta el plan: guarda el `SessionRecord` del día (fuente de verdad, bloques `planned`).
     * Re-aceptar el mismo día conserva el estado de los bloques que siguen en el plan.
     * No se copia a la cola de estudio ni a la agenda: eso duplicaría datos (ver informe).
     */
    mentor_plan_accept(opts: unknown) {
      const o = (opts && typeof opts === "object" ? opts : {}) as Record<string, any>;
      const date = o.date ? needDate(o.date) : localDate();
      if (!Array.isArray(o.blocks) || !o.blocks.length) throw new ApiError("El plan no tiene bloques.");
      const blocks = planToBlocks({ blocks: o.blocks as ProposedBlock[] });
      const previous = log().load(date);
      for (const b of blocks) {
        const old = previous?.blocks.find((p) => p.candidateId === b.candidateId);
        if (old) {
          b.status = old.status;
          if (old.note) b.note = old.note;
        }
      }
      const clean = sanitizeSession({
        date,
        availableMinutes: clampInt(o.availableMinutes, 5, 720, 60),
        objective: o.objective ? String(o.objective) : undefined,
        blocks,
        createdAt: previous?.createdAt ?? new Date().toISOString(),
        acceptedAt: new Date().toISOString(),
      });
      if (!clean || !clean.blocks.length) throw new ApiError("Plan inválido.");
      return log().save(clean);
    },

    // ── Conversación con el Mentor: crear metas con el estudiante ─────────

    /** La conversación activa del Mentor y su borrador pendiente (si lo hay). */
    mentor_chat_load() {
      return stateOf(chatFor());
    },

    /** Compatibilidad: "limpiar" es empezar una conversación nueva (la anterior queda en el historial). */
    mentor_chat_clear() {
      return stateOf(chats().create());
    },

    // Historial del Mentor: conversaciones propias, aparte del historial del asistente.
    mentor_chats_list() {
      return chats().list();
    },

    mentor_chat_new() {
      return stateOf(chats().create());
    },

    mentor_chat_open(id: unknown) {
      const c = chats().open(String(id ?? ""));
      if (!c) throw new ApiError("Esa conversación ya no existe.");
      return stateOf(c);
    },

    mentor_chat_rename(id: unknown, title: unknown) {
      const next = String(title ?? "").trim();
      if (!next) throw new ApiError("Escribe un título.");
      const rec = chats().rename(String(id ?? ""), next);
      if (!rec) throw new ApiError("Esa conversación ya no existe.");
      return { id: rec.id, title: rec.title };
    },

    /** Borra una conversación (a la papelera) y devuelve la conversación que queda activa. */
    mentor_chat_delete(id: unknown) {
      const store = chats();
      if (!store.remove(String(id ?? ""))) throw new ApiError("Esa conversación ya no existe.");
      return stateOf(store.peek());
    },

    /**
     * Un turno de la conversación. La IA solo ve el informe, el catálogo de temas reales filtrado por
     * el pedido y la conversación; responde con una pregunta o un borrador, y el calendario lo calcula
     * la app. NUNCA escribe una meta: eso solo lo hace `mentor_goal_create` al confirmar.
     */
    async mentor_chat(opts: unknown) {
      const o = (opts && typeof opts === "object" ? opts : {}) as Record<string, any>;
      const message = String(o.message ?? "").trim().slice(0, 1500);
      if (!message) throw new ApiError("Escribe un mensaje para el Mentor.");
      if (studyIndexCold(app)) return { loading: true as const };
      const cfg = AIConfig.fromDict(AppConfig.get_ai_config());
      const unavailable = aiUnavailableReason(cfg);
      const existing = chatFor(o.chatId);
      const stored = existing?.load() ?? [];
      if (unavailable) {
        return { loading: false as const, kind: "no_ai" as const, text: unavailable, turns: stored, pending: pendingDraft(stored)?.id ?? null };
      }

      const history: ChatTurn[] = Array.isArray(o.history)
        ? o.history
            .filter((h: any) => h && (h.role === "user" || h.role === "assistant") && typeof h.content === "string")
            .map((h: any) => ({ role: h.role as "user" | "assistant", content: String(h.content).slice(0, 3000) }))
            .slice(-20)
        : toHistory(stored);

      const brief = buildStudentBrief(briefContext(app, log()));
      const request = [...history.filter((h) => h.role === "user").map((h) => h.content), message].join(" ");
      const planMode = o.mode === "plan";
      const today = localDate();
      const snapsAll = topicSnaps(app);
      // refinando un borrador que salió de precondiciones: siguen siendo hechos fijos
      const prevPlan = pendingDraft(stored)?.planDraft;
      const allTopics = buildTopicCatalog(snapsAll, "", { max: 1_000_000 });
      const prePrev0: PlanPreconditions | null = prevPlan?.preconditions ? sanitizePreconditions(prevPlan.preconditions, today) : null;
      // también en el chat: si el borrador no traía ramas, se infieren («full stack», metas solo Backend/Frontend) y se respetan las excluidas
      const prePrev = prePrev0 ? resolveBranches(prePrev0, allTopics, goalScopes(app).filter((g) => prePrev0.goalIds.includes(g.id)).map((g) => g.name), message) : null;
      const scopePrev = prePrev ? resolveScope(prePrev, allTopics, goalScopes(app)) : null;
      const catalog = scopePrev ? planCatalog(scopePrev, dynamicCatalogMax(prePrev!, scopePrev, today), `${prePrev?.freeObjective ?? ""} ${prePrev?.notes ?? ""} ${message}`) : buildTopicCatalog(snapsAll, request, { max: planMode ? 80 : 60 });
      const planCtx = planContext(app, today);
      const areas = app.mgrs().areas.areas().filter((a) => !a.archived);
      const chatLog = existing ?? chats().create();
      const turns = chatLog.append({ role: "user", content: message });

      let raw = "";
      try {
        const extras = { today, areas: areas.map((a) => a.name), plan: planCtx, planMode };
        const msgs = prePrev && scopePrev ? buildPlanMessages(prePrev, brief, catalog, history, { ...extras, scope: scopePrev }, message) : buildChatMessages(message, brief, catalog, history, extras);
        raw = await withJob("chat", "El Mentor está pensando…", (job) => job.send(msgs));
      } catch (e) {
        return { loading: false as const, kind: "error" as const, text: `La IA falló: ${e instanceof Error ? e.message : String(e)}`.slice(0, 400), turns, pending: pendingDraft(turns)?.id ?? null };
      }
      const parsed = parseChatResponse(raw, catalog, planCtx);
      if (!parsed.ok) {
        return { loading: false as const, kind: "error" as const, text: `${parsed.error} Reformula o inténtalo de nuevo.`, turns, pending: pendingDraft(turns)?.id ?? null };
      }
      if (parsed.reply.type === "question") {
        const next = chatLog.append({ role: "assistant", content: parsed.reply.text });
        return { loading: false as const, kind: "question" as const, text: parsed.reply.text, turns: next, pending: pendingDraft(next)?.id ?? null };
      }
      if (parsed.reply.type === "plan_draft") {
        let planDraft: PlanDraft | { missing: string };
        if (prePrev) {
          const { seeds, why } = seedsFromReply(parsed.reply, catalog, prePrev, new Map(goalScopes(app).map((g) => [g.id, g.name])));
          if (!seeds.length) return { loading: false as const, kind: "error" as const, text: "La IA no propuso ningún tema válido. Reformula o inténtalo de nuevo.", turns, pending: pendingDraft(turns)?.id ?? null };
          planDraft = composeFromPreconditions(seeds, prePrev, { today, auto: false, rationale: parsed.reply.rationale, discarded: parsed.reply.discarded, why, startFocus: practiceStartFocus(app), practiceSuggestions: parsed.reply.practice ?? suggestionsOf(prevPlan?.programmingPractice) });
        } else planDraft = composePlanDraft(parsed.reply, catalog, planCtx);
        if ("missing" in planDraft) {
          const text = `Antes de armar el plan del mes necesito saber ${planDraft.missing}.`;
          const next = chatLog.append({ role: "assistant", content: text });
          return { loading: false as const, kind: "question" as const, text, turns: next, pending: pendingDraft(next)?.id ?? null };
        }
        const text = parsed.reply.rationale || `Plan de ${planDraft.month}: ${planDraft.subplans.length} subplanes`;
        const next = chatLog.append({ role: "assistant", content: text, planDraft });
        return { loading: false as const, kind: "plan_draft" as const, text, planDraft, turns: next, pending: pendingDraft(next)?.id ?? null };
      }
      const reply = parsed.reply;
      const draft = composeDraft(reply, catalog, today, resolveArea(app, reply.area));
      if ("missing" in draft) {
        const text = `Antes de armar el calendario necesito saber ${draft.missing}.`;
        const next = chatLog.append({ role: "assistant", content: text });
        return { loading: false as const, kind: "question" as const, text, turns: next, pending: pendingDraft(next)?.id ?? null };
      }
      const text = reply.rationale || `Borrador: ${draft.name}`;
      const next = chatLog.append({ role: "assistant", content: text, draft });
      return { loading: false as const, kind: "draft" as const, text, draft, turns: next, pending: pendingDraft(next)?.id ?? null };
    },

    /** "Descartar": no escribe ninguna meta; solo marca el borrador. */
    mentor_draft_discard(turnId: unknown) {
      const turns = chatFor()?.patch(String(turnId ?? ""), { discarded: true });
      if (!turns) throw new ApiError("Ese borrador ya no existe.");
      return { turns, pending: pendingDraft(turns)?.id ?? null };
    },

    /**
     * "Crear meta": el ÚNICO camino de escritura. No se fía del calendario que mande la UI: vuelve a
     * calcularlo con los temas que existen AHORA (las carpetas inexistentes se descartan) y escribe la
     * meta y sus submetas con `topic_links` mediante GoalManager.
     */
    mentor_goal_create(opts: unknown) {
      const o = (opts && typeof opts === "object" ? opts : {}) as Record<string, any>;
      const d = (o.draft && typeof o.draft === "object" ? o.draft : {}) as Record<string, any>;
      const sch = (d.schedule && typeof d.schedule === "object" ? d.schedule : {}) as Record<string, any>;
      const start = needDate(sch.start);
      const end = needDate(sch.end);
      const hoursPerWeek = Number(sch.hoursPerWeek);
      if (!(hoursPerWeek > 0)) throw new ApiError("Horas por semana inválidas.");
      if (!Array.isArray(d.topics) || !d.topics.length) throw new ApiError("El borrador no tiene temas.");

      const snaps = new Map(topicSnaps(app).map((t) => [t.folder, t]));
      const seen = new Set<string>();
      const topics: Array<{ folder: string; title: string; skills: string[]; estMinutes: number; why: string }> = [];
      for (const t of d.topics.slice(0, 40) as any[]) {
        const folder = String(t?.folder ?? "").replace(/\\/g, "/");
        const snap = snaps.get(folder);
        if (!snap || seen.has(folder)) continue;
        seen.add(folder);
        const valid = new Set(Object.keys(snap.progress.skills));
        const skills = Array.isArray(t.skills) ? t.skills.map((x: unknown) => String(x).toLowerCase()).filter((x: string) => valid.has(x)) : [];
        topics.push({ folder, title: snap.title, skills, estMinutes: estimateTopicMinutes(snap), why: String(t?.why ?? "").replace(/\s+/g, " ").slice(0, 240) });
      }
      if (!topics.length) throw new ApiError("Ninguno de los temas del borrador existe ya en tu sistema.");
      let schedule;
      try {
        schedule = scheduleGoal({ topics, start, end, hoursPerWeek });
      } catch (e) {
        throw new ApiError((e as Error).message);
      }

      const goals = app.mgrs().goals;
      const name = String(d.name ?? "").replace(/\s+/g, " ").trim().slice(0, 120) || "Nueva meta de estudio";
      const goal = goals.create_goal(name, {
        area: resolveArea(app, d.area),
        start,
        end,
        description: String(d.description ?? "").slice(0, 4000),
        priority: 2,
        in_overview: true,
      });
      const byFolder = new Map(topics.map((t) => [t.folder, t]));
      for (const it of schedule.items) {
        goals.create_item(goal.id, it.name, "", {
          start: it.start,
          due: it.due,
          duration_min: Math.min(100000, it.minutes),
          topic_links: it.topic_links,
          notes: it.folders.map((f) => byFolder.get(f)?.why ?? "").filter(Boolean).join("\n"),
        });
      }
      if (o.turnId) chatFor(o.chatId)?.patch(String(o.turnId), { createdGoalId: goal.id });
      return { goalId: goal.id, name: goal.name, items: schedule.items.length, schedule };
    },

    /**
     * Previsualizaciones de solo lectura para los paneles Metas / Proyectos / Notas. Todo sale de los
     * mismos managers que sus módulos; aquí no se edita nada.
     */
    mentor_panels() {
      if (studyIndexCold(app)) return { loading: true as const };
      const g = goalsApi(app);
      const goals = (g.goals_list("activas") as any[]).map((card) => {
        const detail = g.goals_get(card.id) as any;
        return { card, items: (detail.items as any[]).map(slimItem) };
      });
      const pApi = projectsApi(app);
      const projects = (pApi.projects_list() as any[])
        .filter((p) => p.status === "En curso" || p.status === "Planeado")
        .map((p) => {
          const open = ((pApi.projects_get(p.id) as any).issues as any[]).filter((i) => !i.done);
          return { ...p, issues: open.slice(0, 40).map(slimIssue) };
        });
      const brief = buildStudentBrief(briefContext(app, log()));
      const pending = sectionData<StudyPendingData>(brief, "study_pending");
      const snaps = topicSnaps(app);
      return {
        loading: false as const,
        goals,
        areas: app.mgrs().areas.areas().map((a) => ({ id: a.id, name: a.name, icon: a.icon, colour: a.colour })),
        projects,
        study: {
          topics: topicsPanel(snaps),
          areas: studyAreas(snaps, {
            lifeAreas: app.mgrs().areas.areas().map((a) => ({ id: a.id, name: a.name, icon: a.icon, colour: a.colour })),
            srsBySubject: pending?.srs.bySubject ?? [],
            errorsBySubject: pending?.errors.bySubject ?? {},
            queue: pending?.queue ?? [],
          }),
          srs: pending?.srs ?? { dueTotal: 0, bySubject: [] },
          errors: pending ? { unresolved: pending.errors.unresolved, repeaters: pending.errors.repeaters.slice(0, 5) } : { unresolved: 0, repeaters: [] },
        },
      };
    },

    mentor_block_status: markBlock,

    // ── Planes del Mentor sobre un periodo libre (core/mentor/plan.ts, planSpec.ts) ──

    /** Los planes con su periodo y estado (activo / futuro / terminado): activos primero. */
    mentor_plan_list() {
      const today = localDate();
      const snaps = studyIndexCold(app) ? null : new Map(topicSnaps(app).map((t) => [t.folder, t]));
      const lookup = snaps ? (f: string) => snaps.get(f) : undefined;
      return sortRows(new PlanStore(app.root).list().map((p) => planRow(p, today, lookup)));
    },

    /** Renombra un plan (el nombre se guarda en su archivo; vacío = volver al nombre autogenerado). */
    mentor_plan_rename(opts: unknown) {
      const o = (opts && typeof opts === "object" ? opts : {}) as Record<string, any>;
      const st = new PlanStore(app.root);
      const plan = PLAN_ID_RE.test(String(o.id ?? "")) ? st.load(String(o.id)) : null;
      if (!plan) throw new ApiError("Ese plan ya no existe.");
      const name = String(o.name ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
      const { name: _old, ...rest } = plan;
      return st.save({ ...rest, ...(name ? { name } : {}), updatedAt: new Date().toISOString() });
    },

    /** Archiva (da por terminado) un plan o lo reactiva: deja de aportar a «Hoy» sin borrar nada. */
    mentor_plan_archive(opts: unknown) {
      const o = (opts && typeof opts === "object" ? opts : {}) as Record<string, any>;
      const st = new PlanStore(app.root);
      const plan = PLAN_ID_RE.test(String(o.id ?? "")) ? st.load(String(o.id)) : null;
      if (!plan) throw new ApiError("Ese plan ya no existe.");
      const { archived: _a, ...rest } = plan;
      return st.save({ ...rest, ...(o.archived === false ? {} : { archived: true }), updatedAt: new Date().toISOString() });
    },

    /** Elimina un plan: su archivo va a la papelera de la vault (`.notevault/.papelera/mentor-plans`), no se borra de forma dura. */
    mentor_plan_delete(opts: unknown) {
      const o = (opts && typeof opts === "object" ? opts : {}) as Record<string, any>;
      const id = String(o.id ?? "");
      if (!PLAN_ID_RE.test(id)) throw new ApiError("Plan inválido.");
      const st = new PlanStore(app.root);
      if (!st.load(id)) throw new ApiError("Ese plan ya no existe.");
      if (!st.trash(id)) throw new ApiError("No se pudo eliminar el plan.");
      return { id, plans: sortRows(st.list().map((p) => planRow(p, localDate()))) };
    },

    /**
     * Lo que ofrece el formulario de precondiciones: metas activas con sus temas enlazados, materias con
     * temas y, por tema pendiente, sus minutos y qué metas lo enlazan (el cliente calcula en vivo con eso).
     */
    mentor_plan_options() {
      if (studyIndexCold(app)) return { loading: true as const };
      const all = buildTopicCatalog(topicSnaps(app), "", { max: 1_000_000 });
      const goals = goalScopes(app);
      const topics = scopeTopics(all, goals);
      const areas = new Map<string, { id: string; name: string; total: number; pending: number; minutes: number; branches: Record<string, { total: number; pending: number }> }>();
      for (const t of all) {
        const id = areaOfFolder(t.folder) || t.subject || "General";
        const e = areas.get(id) ?? { id, name: id, total: 0, pending: 0, minutes: 0, branches: {} };
        e.total++;
        const br = branchOfFolder(t.folder);
        if (br) {
          const be = (e.branches[br] ??= { total: 0, pending: 0 });
          be.total++;
          if (t.completenessPct < 100) be.pending++;
        }
        if (t.completenessPct < 100) {
          e.pending++;
          e.minutes += t.estMinutes;
        }
        areas.set(id, e);
      }
      return {
        loading: false as const,
        today: localDate(),
        aiConfigured: aiUnavailableReason(AIConfig.fromDict(AppConfig.get_ai_config())) === null,
        goals: goals.map((g) => {
          const mine = topics.filter((t) => t.goalIds.includes(g.id));
          return { id: g.id, name: g.name, area: g.area, end: g.end, topics: mine.length, minutes: mine.reduce((n, t) => n + t.minutes, 0) };
        }),
        areas: [...areas.values()]
          .sort((a, b) => a.name.localeCompare(b.name, "es", { numeric: true }))
          .map((a) => ({ ...a, branches: Object.entries(a.branches).sort((x, y) => x[0].localeCompare(y[0], "es", { numeric: true })).map(([name, v]) => ({ name, ...v, kind: classifyBranch(name) })) })),
        topics,
      };
    },

    /**
     * Un plan a partir de las PRECONDICIONES (periodo, tiempo diario, días de estudio, qué cubrir, nivel…).
     * Devuelve un BORRADOR (no escribe ningún plan): con IA, ella elige y ordena temas del catálogo real con las
     * precondiciones como hechos fijos; sin IA, o si falla, un plan automático determinista. El borrador queda
     * como turno pendiente del Mentor (se acepta o descarta igual que un `plan_draft`, y se puede refinar en el chat).
     */
    async mentor_plan_generate(opts: unknown) {
      const o = (opts && typeof opts === "object" ? opts : {}) as Record<string, any>;
      const today = localDate();
      const pre0 = sanitizePreconditions(o.preconditions && typeof o.preconditions === "object" ? o.preconditions : o, today);
      const problem = preconditionsProblem(pre0, today);
      if (problem) throw new ApiError(problem);
      if (studyIndexCold(app)) return { loading: true as const };
      if (jobs.has("generate")) throw new ApiError("Ya se está generando un plan. Espera a que termine o cancélalo.");

      const all = buildTopicCatalog(topicSnaps(app), "", { max: 1_000_000 });
      const goals = goalScopes(app);
      // ramas: si no vienen explícitas se infieren aquí («full stack», metas solo Backend/Frontend…); las excluidas no entran a nada
      const pre = resolveBranches(pre0, all, goals.filter((g) => pre0.goalIds.includes(g.id)).map((g) => g.name));
      const scope = resolveScope(pre, all, goals);
      const catalog = planCatalog(scope, dynamicCatalogMax(pre, scope, today), `${pre.freeObjective ?? ""} ${pre.notes ?? ""}`);
      if (!catalog.length) {
        throw new ApiError("No hay temas pendientes en lo que elegiste. Elige metas con temas enlazados o materias con temas sin completar.");
      }

      const cfg = AIConfig.fromDict(AppConfig.get_ai_config());
      const unavailable = o.noAi === true ? "Pediste el plan automático (sin IA)" : aiUnavailableReason(cfg);
      const planCtx = planContext(app, today);
      return withJob("generate", `Eligiendo temas de ${[...new Set(scope.goalGroups.map((g) => g.area).concat(scope.areaGroups.map((g) => g.area)))].slice(0, 3).join(", ") || "tus metas"}…`, async (job) => {
        let draft: PlanDraft | null = null;
        let fallbackReason: string | undefined = unavailable ?? undefined;
        if (o.asDraft !== true) {
          // camino principal: esqueleto + un bloque de temas por subplan (en paralelo, con tiempo por llamada); lo que falla cae a reglas SOLO en ese bloque
          const brief = unavailable ? (null as never) : buildStudentBrief(briefContext(app, log()));
          let res;
          try {
            res = await generateByParts(pre, autoSeeds(pre, scope, goals), {
              aiOn: !unavailable,
              brief,
              send: (m, so) => job.send(m, so),
              cancelled: job.cancelled,
              onProgress: (_p, l) => job.setLabel(l),
              ...(o.concurrency ? { concurrency: clampInt(o.concurrency, 1, 6, 3) } : {}),
              ...(o.callTimeoutMs ? { callTimeoutMs: clampInt(o.callTimeoutMs, 50, 300000, 120000) } : {}),
              ...(o.budgetMs ? { budgetMs: clampInt(o.budgetMs, 100, 1800000, 480000) } : {}),
            });
          } catch (e) {
            if (e instanceof PipelineCancel || e instanceof CancelError) throw new ApiError("Generación cancelada.");
            throw e;
          }
          const why = unavailable ? (o.noAi === true ? "Lo pediste sin IA" : "La IA no está configurada") : `La IA no devolvió ningún tema válido (${res.warnings[0] ?? "sin detalle"})`;
          draft = composeFromPreconditions(markDiagnostics(res.seeds, pre), pre, {
            today,
            auto: !res.aiUsed,
            startFocus: practiceStartFocus(app),
            discarded: res.discarded,
            rationale: res.aiUsed ? res.rationale || "Plan armado por partes: esqueleto y temas de cada subplan elegidos por el Mentor." : `Plan automático con tus metas y materias elegidas, en su orden natural y sin lo ya completado. ${why}.`,
            ...(!res.aiUsed && !unavailable && res.warnings[0] ? { fallbackReason: res.warnings[0] } : {}),
          });
          if (res.warnings.length) draft = { ...draft, warnings: [...draft.warnings, ...res.warnings] };
        } else if (!unavailable) {
          try {
            const brief = buildStudentBrief(briefContext(app, log()));
            const areaNames = app.mgrs().areas.areas().filter((a) => !a.archived).map((a) => a.name);
            const raw = await job.send(buildPlanMessages(pre, brief, catalog, [], { today, areas: areaNames, plan: planCtx, scope }));
            const parsed = parsePreconditionReply(raw, catalog, planCtx);
            if (parsed.ok) {
              const { seeds, why } = seedsFromReply(parsed.reply, catalog, pre, new Map(goals.map((g) => [g.id, g.name])), goals);
              if (seeds.length) {
                draft = composeFromPreconditions(seeds, pre, { today, auto: false, rationale: parsed.reply.rationale, discarded: parsed.reply.discarded, why, startFocus: practiceStartFocus(app), practiceSuggestions: parsed.reply.practice });
              } else fallbackReason = "La IA no propuso ningún tema válido.";
            } else fallbackReason = parsed.reason;
          } catch (e) {
            if (e instanceof CancelError && e.mode === "abort") throw new ApiError("Generación cancelada.");
            fallbackReason = e instanceof CancelError ? "Pediste el plan automático (sin IA)" : `La IA falló: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300);
          }
        }
        if (!draft) {
          const why = unavailable ? (o.noAi === true ? "Lo pediste sin IA" : "La IA no está configurada") : `La IA no devolvió un plan válido (${fallbackReason ?? "sin detalle"})`;
          draft = composeFromPreconditions(autoSeeds(pre, scope, goals), pre, {
            today,
            auto: true,
            startFocus: practiceStartFocus(app),
            rationale: `Plan automático con tus metas y materias elegidas, en su orden natural y sin lo ya completado. ${why}.`,
            ...(fallbackReason && !unavailable ? { fallbackReason } : {}),
          });
        }

        const active = chats().peek();
        const chatLog = active && active.load().length === 0 ? active : chats().create();
        chatLog.append({ role: "user", content: preconditionsRequest(pre, scope) });
        const text = draft.rationale || `Plan del ${draft.start} al ${draft.end}: ${draft.subplans.length} subplanes`;
        const source = draft.auto ? ("auto" as const) : ("ai" as const);
        if (o.asDraft === true) {
          // compatibilidad: el borrador separado que se acepta con `mentor_plan_draft_accept`
          const next = chatLog.append({ role: "assistant", content: text, planDraft: draft });
          return { loading: false as const, kind: "plan_draft" as const, source, text, planDraft: draft, turns: next, pending: pendingDraft(next)?.id ?? null, chatId: chatLog.record().id };
        }
        // camino principal: el plan se crea YA como plan real «propuesto» (se mantiene o se borra desde su sub-interfaz)
        const created = acceptRef({ draft, proposed: true }) as { id: string };
        const planName_ = planName(new PlanStore(app.root).load(created.id)!);
        const next = chatLog.append({ role: "assistant", content: `Plan creado: ${planName_}. ${draft.rationale}`.trim(), createdPlan: created.id });
        return { loading: false as const, kind: "plan_created" as const, source, text, planId: created.id, planDraft: draft, turns: next, pending: pendingDraft(next)?.id ?? null, chatId: chatLog.record().id };
      });
    },

    /**
     * Un plan con el estado de práctica DERIVADO en vivo (por defecto, el activo hoy). Al leerlo anota (una sola
     * vez) la fecha de los temas que ya están completos: es el registro de temas completados. `items` es lo que
     * toca hoy en TODOS los planes activos.
     */
    mentor_plan_get(opts: unknown) {
      const o = (opts && typeof opts === "object" ? opts : {}) as Record<string, any>;
      const today = localDate();
      let wanted = "";
      if (o.id) {
        wanted = String(o.id);
        if (!PLAN_ID_RE.test(wanted)) throw new ApiError("Plan inválido.");
      } else if (o.month) {
        wanted = String(o.month);
        if (!MONTH_RE.test(wanted)) throw new ApiError("Mes inválido (AAAA-MM).");
      }
      if (studyIndexCold(app)) return { loading: true as const };
      const st = new PlanStore(app.root);
      const plans = st.list();
      const snapMap = new Map(topicSnaps(app).map((t) => [t.folder, t]));
      const rows = sortRows(plans.map((p) => planRow(p, today, (f) => snapMap.get(f))));
      const aiConfigured = aiUnavailableReason(AIConfig.fromDict(AppConfig.get_ai_config())) === null;
      let plan = wanted ? st.load(wanted) : defaultPlan(plans, today);

      const snaps = snapMap;
      const lookup = (folder: string) => snaps.get(folder);
      const active = activePlans(plans, today);
      const done = new Set(active.flatMap((p) => p.subplans.flatMap((s) => s.topics.filter((t) => topicState(lookup(t.folder) ?? null) === "completo").map((t) => t.folder))));
      const items = planItemsFor(today, active, (f) => done.has(f));
      const practiceItems = todaysPracticeItems(app, today);
      const months = st.months();
      if (!plan) {
        return { loading: false as const, id: wanted || null, month: wanted && MONTH_RE.test(wanted) ? wanted : today.slice(0, 7), today, plan: null, derived: null, goals: {}, projects: {}, items, practiceItems, practice: null, months, plans: rows, aiConfigured };
      }

      const refreshed = refreshPlanProgress(plan, lookup, today);
      if (refreshed.changed) plan = st.save(refreshed.plan);
      const practice = practiceStatusOf(app, plan, today, log());
      const derived = deriveView(plan, lookup, today);

      const m = app.mgrs();
      const dayStart = midnight();
      const goals: Record<string, { name: string; pct: number; items: Record<string, { name: string; pct: number }> }> = {};
      for (const s of plan.subplans) {
        for (const id of [s.goalId, ...s.requiredGoals.map((g) => g.goalId)]) {
          if (!id || goals[id]) continue;
          const g = m.goals.get_goal(id);
          if (!g) continue;
          const goalItems: Record<string, { name: string; pct: number }> = {};
          for (const it of m.goals.items(id)) goalItems[it.id] = { name: it.name, pct: Math.round(Math.max(0, Math.min(1, m.goals.itemProgress(it, g, dayStart))) * 100) };
          goals[id] = { name: g.name, pct: Math.round(Math.max(0, Math.min(1, m.goals.progress(g, dayStart))) * 100), items: goalItems };
        }
      }
      const projects: Record<string, { id: string; name: string; status: string }> = {};
      for (const s of plan.subplans) {
        const pid = s.deliverable?.projectId;
        const p = pid ? m.projects.get(pid) : null;
        if (pid && p) projects[pid] = { id: p.id, name: p.name, status: p.status };
      }
      return {
        loading: false as const,
        id: plan.id,
        month: plan.month ?? plan.start.slice(0, 7),
        today,
        status: planStatus(plan, today),
        plan,
        derived,
        goals,
        projects,
        items,
        practiceItems,
        practice,
        months,
        plans: rows,
        aiConfigured,
      };
    },

    /**
     * "Aceptar plan": el ÚNICO camino de escritura de los planes. No se fía del reparto que mande la UI:
     * vuelve a validar los temas contra los que existen AHORA (los inventados se descartan), las metas y
     * los proyectos, y recalcula el reparto semanal (con la capacidad de las precondiciones, si las hay).
     * Un borrador mensual (sin precondiciones) se fusiona con el plan que ya hubiera ese mes; uno con
     * precondiciones crea el plan `<inicio>_<fin>` (o se fusiona con el de ese mismo periodo).
     */
    mentor_plan_draft_accept(opts: unknown) {
      const o = (opts && typeof opts === "object" ? opts : {}) as Record<string, any>;
      const turn = o.turnId ? chatFor(o.chatId)?.load().find((t) => t.id === String(o.turnId)) : undefined;
      const d = (turn?.planDraft ?? (o.draft && typeof o.draft === "object" ? o.draft : null)) as Record<string, any> | null;
      if (!d || !Array.isArray(d.subplans) || !d.subplans.length) throw new ApiError("El borrador del plan no tiene subplanes.");
      const today = localDate();
      const pre: PlanPreconditions | null = d.preconditions && typeof d.preconditions === "object" ? sanitizePreconditions(d.preconditions, today) : null;
      const hoursPerWeek = Number(d.hoursPerWeek);
      if (!pre && !(hoursPerWeek > 0)) throw new ApiError("Horas por semana inválidas.");
      if (pre) {
        const problem = preconditionsProblem(pre, today);
        if (problem) throw new ApiError(problem);
      }
      const win = planWindow(typeof d.month === "string" ? d.month : undefined, today);
      const ctx = planContext(app, today);
      const goalById = new Map(ctx.goals.map((g) => [g.id, g]));
      const projectIds = new Set(ctx.projects.map((p) => p.id));
      const snaps = new Map(topicSnaps(app).map((t) => [t.folder, t]));
      // las ramas excluidas no entran aunque el borrador las traiga (salvo lo que enlaza una meta elegida)
      const linked = new Set(pre?.branches ? goalScopes(app).filter((g) => pre.goalIds.includes(g.id)).flatMap((g) => g.items.flatMap((i) => i.links.map((l) => l.folder))) : []);

      let seeds: SubplanSeed[] = [];
      for (const s of d.subplans.slice(0, 12) as any[]) {
        const seen = new Set<string>();
        const topics: SubplanSeed["topics"] = [];
        // plan por áreas: el área y sus grupos internos viajan con el borrador (se revalidan: solo ids de área seguros y grupos conocidos)
        const areaId = /^[a-z][a-z0-9-]{0,39}$/.test(String(s?.areaId ?? "")) ? String(s.areaId) : undefined;
        const groups = areaId ? sanitizeGroups(s?.groups) : [];
        for (const t of (Array.isArray(s?.topics) ? s.topics : []).slice(0, 400) as any[]) {
          const folder = String(t?.folder ?? "").replace(/\\/g, "/");
          const snap = snaps.get(folder);
          if (!snap || seen.has(folder)) continue;
          if (pre && !branchAllowed(pre.branches, areaOfFolder(folder), branchOfFolder(folder)) && !linked.has(folder)) continue;
          seen.add(folder);
          const valid = new Set(Object.keys(snap.progress.skills));
          const skills = Array.isArray(t.skills) ? t.skills.map((x: unknown) => String(x).toLowerCase()).filter((x: string) => valid.has(x)) : [];
          const base = estimateTopicMinutes(snap);
          const group = groups.some((g) => g.id === String(t?.group)) ? String(t.group) : undefined;
          topics.push({ folder, title: snap.title, ...(skills.length ? { skills } : {}), estMinutes: pre ? adjustedMinutes(base, areaOfFolder(folder), pre.levels) : base, ...(group ? { group } : {}) });
        }
        const goalId = goalById.has(String(s?.goalId)) ? String(s.goalId) : undefined;
        const requiredGoals = (Array.isArray(s?.requiredGoals) ? s.requiredGoals : [])
          .filter((g: any) => goalById.has(String(g?.goalId)))
          .map((g: any) => ({ goalId: String(g.goalId), ...(goalById.get(String(g.goalId))!.items.some((i) => i.id === String(g.itemId)) ? { itemId: String(g.itemId) } : {}), note: String(g.note ?? "") }));
        const dv = s?.deliverable && typeof s.deliverable === "object" ? s.deliverable : null;
        const deliverable = dv && String(dv.title ?? "").trim() && (!pre || pre.deliverables !== "no")
          ? { title: String(dv.title), description: String(dv.description ?? ""), criteria: Array.isArray(dv.criteria) ? dv.criteria.map(String) : [], ...(projectIds.has(String(dv.projectId)) ? { projectId: String(dv.projectId) } : {}), status: "idea" as DeliverableStatus }
          : undefined;
        if (!topics.length && !deliverable) continue;
        const weight = Number(d.weights && typeof d.weights === "object" ? d.weights[String(s?.id)] : 0);
        // las notas que ya trae el subplan (razón del Mentor, aviso de «completado con reglas»); la nota de diagnóstico se vuelve a derivar
        const keepNote = String(s?.notes ?? "").replace(/Nivel «no sé» en [^:]+: empieza con un diagnóstico corto de «[^»]*» para calibrar el resto\.\s*/g, "").trim();
        const fb = s?.fallback && (s.fallback.kind === "rules" || s.fallback.kind === "mixed") ? { kind: s.fallback.kind as "rules" | "mixed", reason: String(s.fallback.reason ?? "").replace(/s+/g, " ").trim().slice(0, 240) } : undefined;
        seeds.push({ ...(/^[A-Za-z0-9_-]{1,40}$/.test(String(s?.id ?? "")) ? { id: String(s.id) } : {}), area: String(s?.area ?? ""), objective: String(s?.objective ?? ""), ...(goalId ? { goalId } : {}), topics, requiredGoals, ...(deliverable ? { deliverable } : {}), ...(weight > 0 ? { weight } : {}), ...(keepNote ? { notes: keepNote.slice(0, 400) } : {}), ...(areaId ? { areaId } : {}), ...(groups.length ? { groups } : {}), ...(fb ? { fallback: fb } : {}) });
      }
      if (!seeds.length) throw new ApiError("Ninguno de los temas del borrador existe ya en tu sistema.");
      if (pre) seeds = markDiagnostics(seeds, pre);

      const st = new PlanStore(app.root);
      const from = pre ? (today > pre.start ? today : pre.start) : win.from;
      // la pista de práctica se recalcula aquí (determinista): del borrador solo se aceptan temas y focos validados
      const practice = pre?.practice ? buildPracticeTrack(pre, { from, startFocus: practiceStartFocus(app), suggestions: suggestionsOf(sanitizePracticeTrack(d.programmingPractice, pre.start, pre.end)) }) : undefined;
      const built = pre
        ? buildPlan(seeds, {
            id: `${pre.start}_${pre.end}`,
            start: pre.start,
            end: pre.end,
            minutesPerDay: pre.minutesPerDay,
            studyDays: pre.studyDays,
            blockedDates: pre.blockedDates,
            pace: pre.pace,
            from,
            preconditions: pre,
            ...(practice ? { programmingPractice: practice, reservedMinutes: practiceDayMinutes(practice, { blockedDates: pre.blockedDates, from }) } : {}),
            ...(Array.isArray(d.openQuestions) ? { openQuestions: d.openQuestions } : {}),
            ...(d.auto ? { auto: true } : {}),
            ...(d.compact === true ? { spread: false } : {}),
            rationale: String(d.rationale ?? ""),
          })
        : buildPlan(seeds, { month: win.month, hoursPerWeek, from, rationale: String(d.rationale ?? "") });
      let saved: Plan;
      if (o.proposed === true) {
        // plan real «propuesto»: nunca se fusiona con otro; si el id está ocupado, se le añade un sufijo
        let pid = built.plan.id;
        for (let n = 2; st.load(pid); n++) pid = `${built.plan.id}-${n}`;
        saved = st.save({ ...built.plan, id: pid, proposed: true });
      } else saved = st.save(mergePlans(st.load(built.plan.id), built.plan));
      if (turn) chatFor(o.chatId)?.patch(turn.id, { acceptedPlan: saved.id });
      return {
        id: saved.id,
        month: saved.month ?? saved.start.slice(0, 7),
        start: saved.start,
        end: saved.end,
        subplans: saved.subplans.length,
        topics: saved.subplans.reduce((n, s) => n + s.topics.length, 0),
        warnings: built.warnings,
        fits: built.fits,
      };
    },

    /**
     * Responde una pregunta pendiente del BORRADOR (hoy: «¿quieres un entregable para <subplan>?»). Determinista y sin
     * IA: `yes` añade la propuesta de entregable al subplan, `no` la descarta y `later` la deja pendiente. Solo edita
     * el turno del borrador; el plan se escribe al aceptarlo. Es el punto de extensión de la construcción progresiva.
     */
    mentor_plan_draft_answer(opts: unknown) {
      const o = (opts && typeof opts === "object" ? opts : {}) as Record<string, any>;
      const chat = chatFor(o.chatId);
      const turn = chat?.load().find((t) => t.id === String(o.turnId ?? ""));
      const draft = turn?.planDraft;
      if (!chat || !turn || !draft) throw new ApiError("Ese borrador ya no existe.");
      if (turn.acceptedPlan || turn.discarded) throw new ApiError("Ese borrador ya se cerró.");
      const questionId = String(o.questionId ?? "deliverables");
      if (questionId !== "deliverables") throw new ApiError("Pregunta desconocida.");
      const answer = String(o.answer ?? "");
      if (!["yes", "no", "later"].includes(answer)) throw new ApiError("Respuesta inválida (yes, no o later).");
      // sin `subplanId` es la pregunta GLOBAL («¿un entregable por cada área?»); con él, la de un subplan (planes antiguos) o una excepción por área
      const subplanId = String(o.subplanId ?? "");
      if (subplanId && !draft.subplans.some((s) => s.id === subplanId)) throw new ApiError("Ese subplan ya no existe en el borrador.");
      let next = draft;
      if (answer !== "later") {
        const r = answerDeliverables(draft.subplans, draft.openQuestions, subplanId, answer as "yes" | "no");
        next = { ...draft, subplans: r.subplans, openQuestions: r.openQuestions };
        if (!next.openQuestions!.length) delete next.openQuestions;
      }
      const turns = chat.patch(turn.id, { planDraft: next });
      return { turns, pending: pendingDraft(turns ?? [])?.id ?? null, planDraft: next };
    },
    /** "Descartar" el borrador del plan: no escribe ningún plan; solo marca el borrador. */
    mentor_plan_draft_discard: discardPlanDraft,
    mentor_plan_discard: discardPlanDraft,

    /** Lo único editable del plan desde el Mentor: el estado del entregable de un subplan (y su proyecto). */
    mentor_plan_update_deliverable(opts: unknown) {
      const o = (opts && typeof opts === "object" ? opts : {}) as Record<string, any>;
      const id = String(o.id ?? o.month ?? "");
      if (o.month && !o.id && !MONTH_RE.test(id)) throw new ApiError("Mes inválido (AAAA-MM).");
      if (!PLAN_ID_RE.test(id)) throw new ApiError("Plan inválido.");
      // dos vocabularios: el del entregable de un área (idea · en_curso · hecho) y el de la agenda (pendiente · en_curso · hecho)
      const raw = String(o.status);
      if (!(DELIVERABLE_STATUSES as readonly string[]).includes(raw) && !(PLAN_DELIVERABLE_STATUSES as readonly string[]).includes(raw)) throw new ApiError("Estado de entregable inválido.");
      const agendaStatus: PlanDeliverableStatus = raw === "idea" ? "pendiente" : (raw as PlanDeliverableStatus);
      const areaStatus: DeliverableStatus = raw === "pendiente" ? "idea" : (raw as DeliverableStatus);
      const st = new PlanStore(app.root);
      const plan = st.load(id);
      if (!plan) throw new ApiError("Ese plan ya no existe.");
      const deliverableId = String(o.deliverableId ?? "");
      // un entregable de la agenda (kata del día, proyecto semanal o mensual, extra) o el de un área por su id `area:<subplan>`
      const subId = deliverableId.startsWith("area:") ? deliverableId.slice(5) : String(o.subplanId ?? "");
      if (deliverableId && !deliverableId.startsWith("area:")) {
        const derived = deliverablesOf(plan, practiceStatusOf(app, plan, localDate(), log()));
        const d = derived.find((x) => x.id === deliverableId);
        if (!d) throw new ApiError("Ese entregable ya no existe en el plan.");
        const files = Array.isArray(o.files) ? (o.files as any[]).slice(0, 12).map((f) => ({ ...(f?.path ? { path: String(f.path).slice(0, 300) } : {}), note: String(f?.note ?? "").slice(0, 200) })) : d.files;
        const entry = { ...d, status: agendaStatus, ...(files?.length ? { files } : {}) };
        const list = [...(plan.deliverables ?? []).filter((x) => x.id !== deliverableId), entry];
        return st.save({ ...plan, deliverables: list, updatedAt: new Date().toISOString() });
      }
      const sub = plan.subplans.find((s) => s.id === subId);
      if (!sub) throw new ApiError("Ese subplan ya no existe.");
      if (!sub.deliverable) throw new ApiError("Ese subplan no tiene entregable.");
      let projectId = sub.deliverable.projectId;
      if (o.projectId !== undefined) {
        const wanted = o.projectId === null ? "" : String(o.projectId);
        if (wanted && !app.mgrs().projects.get(wanted)) throw new ApiError("Ese proyecto no existe.");
        projectId = wanted || undefined;
      }
      sub.deliverable = { ...sub.deliverable, status: areaStatus, ...(projectId ? { projectId } : {}) };
      if (!projectId) delete sub.deliverable.projectId;
      plan.updatedAt = new Date().toISOString();
      return st.save(plan);
    },

    /**
     * Responde, sobre el plan YA GUARDADO, una pregunta que quedó pendiente al armarlo (hoy: «¿quieres un entregable para <subplan>?»,
     * la opción «Después»). `yes` añade la propuesta determinista de entregable (estado «idea»), `no` descarta la pregunta y `later`
     * la deja. Es lo único que cambia: ni temas ni reparto.
     */
    mentor_plan_answer(opts: unknown) {
      const o = (opts && typeof opts === "object" ? opts : {}) as Record<string, any>;
      const id = String(o.id ?? "");
      if (!PLAN_ID_RE.test(id)) throw new ApiError("Plan inválido.");
      const questionId = String(o.questionId ?? "deliverables");
      if (questionId !== "deliverables") throw new ApiError("Pregunta desconocida.");
      const answer = String(o.answer ?? (o.deliverable === true ? "yes" : o.deliverable === false ? "no" : ""));
      if (!["yes", "no", "later"].includes(answer)) throw new ApiError("Respuesta inválida (yes, no o later).");
      const st = new PlanStore(app.root);
      const plan = st.load(id);
      if (!plan) throw new ApiError("Ese plan ya no existe.");
      // sin `subplanId` es la pregunta GLOBAL de entregables del plan por áreas; con él, la de un subplan (planes antiguos)
      const subplanId = String(o.subplanId ?? "");
      if (subplanId && !plan.subplans.some((s) => s.id === subplanId)) throw new ApiError("Ese subplan ya no existe en el plan.");
      if (!(plan.openQuestions ?? []).some((q) => q.id === questionId && (q.subplanId ?? "") === subplanId)) throw new ApiError("Esa pregunta ya no está pendiente.");
      if (answer === "later") return plan;
      const r = answerDeliverables(plan.subplans, plan.openQuestions, subplanId, answer as "yes" | "no");
      const { openQuestions: _q, ...base } = plan;
      return st.save({ ...base, subplans: r.subplans, ...(r.openQuestions.length ? { openQuestions: r.openQuestions } : {}), updatedAt: new Date().toISOString() });
    },

    /**
     * Excepción por área tras la pregunta global: añade o quita el entregable (el proyecto) de UN área. Solo se quita si sigue en «idea»
     * (un entregable ya empezado o hecho no se borra por error).
     */
    mentor_plan_area_deliverable(opts: unknown) {
      const o = (opts && typeof opts === "object" ? opts : {}) as Record<string, any>;
      const id = String(o.id ?? "");
      if (!PLAN_ID_RE.test(id)) throw new ApiError("Plan inválido.");
      const st = new PlanStore(app.root);
      const plan = st.load(id);
      const sub = plan?.subplans.find((s) => s.id === String(o.subplanId ?? ""));
      if (!plan || !sub) throw new ApiError("Ese área ya no existe en el plan.");
      if (o.enabled === true) {
        if (sub.deliverable) return plan;
        const d = defaultDeliverableFor(sub);
        sub.deliverable = { title: d.title ?? "", description: d.description ?? "", criteria: d.criteria ?? [], status: "idea" };
      } else {
        if (!sub.deliverable) return plan;
        if (sub.deliverable.status !== "idea") throw new ApiError("Ese entregable ya está en marcha: cambia su estado en lugar de quitarlo.");
        delete sub.deliverable;
      }
      plan.updatedAt = new Date().toISOString();
      return st.save(plan);
    },

    /** Escribe (o borra, con texto vacío) el propósito de un día, una semana o un mes. Es una edición directa, sin pasar por la IA. */
    mentor_plan_set_purpose(opts: unknown) {
      const o = (opts && typeof opts === "object" ? opts : {}) as Record<string, any>;
      const id = String(o.id ?? "");
      if (!PLAN_ID_RE.test(id)) throw new ApiError("Plan inválido.");
      const st = new PlanStore(app.root);
      const plan = st.load(id);
      if (!plan) throw new ApiError("Ese plan ya no existe.");
      const scope = String(o.scope ?? "");
      const key = String(o.key ?? "");
      const text = String(o.text ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
      const weeks = Math.floor((Date.parse(plan.end) - Date.parse(plan.start)) / 86400000 / 7) + 1;
      const ok =
        scope === "day" ? /^\d{4}-\d{2}-\d{2}$/.test(key) && key >= plan.start && key <= plan.end
        : scope === "week" ? /^\d{1,3}$/.test(key) && Number(key) >= 1 && Number(key) <= weeks
        : scope === "month" ? /^\d{4}-(0[1-9]|1[0-2])$/.test(key) && key >= plan.start.slice(0, 7) && key <= plan.end.slice(0, 7)
        : false;
      if (!ok) throw new ApiError("Ese día, semana o mes no está en el plan.");
      const purposes = JSON.parse(JSON.stringify(plan.purposes ?? {})) as NonNullable<Plan["purposes"]>;
      const bag = ((purposes as any)[scope] ??= {}) as Record<string, string>;
      if (text) bag[key] = text;
      else delete bag[key];
      if (!Object.keys(bag).length) delete (purposes as any)[scope];
      const { purposes: _p, ...base } = plan;
      return st.save({ ...base, ...(Object.keys(purposes).length ? { purposes } : {}), updatedAt: new Date().toISOString() });
    },

    /**
     * «Generar la práctica del plan con el Mentor»: crea el currículo de práctica del plan (`Plan.practiceCurriculum`: ejercicios por semana
     * ligados a los temas que se practican, retos de lógica, proyecto semanal, mini-proyectos diarios y proyecto mensual). Solo se ejecuta cuando
     * el usuario lo pide. Por bloques de semanas en paralelo limitado (timeouts, cancelación real con `mentor_ai_cancel` clave
     * `practice:<id>`, progreso en `mentor_ai_status`); si un bloque falla cae a plantillas; sin IA todo son plantillas marcadas como
     * automáticas. Los temas con ejercicios en la vault los prioriza la app. Queda en el historial de cambios con la instantánea previa:
     * «Deshacer» lo revierte (`mentor_plan_change_undo`).
     */
    async mentor_plan_practice_generate(opts: unknown) {
      const o = (opts && typeof opts === "object" ? opts : {}) as Record<string, any>;
      const id = String(o.id ?? "");
      if (!PLAN_ID_RE.test(id)) throw new ApiError("Plan inválido.");
      const st = new PlanStore(app.root);
      const plan = st.load(id);
      if (!plan) throw new ApiError("Ese plan ya no existe.");
      if (!plan.subplans.some((s) => s.topics.length)) throw new ApiError("Este plan no tiene temas.");
      if (studyIndexCold(app)) return { loading: true as const };
      return guarded(`plan:${id}`, "practice", () =>
        withJob(`practice:${id}`, "Preparando la práctica del plan…", async (job) => {
          const today = localDate();
          const sch = buildSchedule(plan);
          const folders = new Set(plan.subplans.flatMap((s) => s.topics.map((t) => t.folder)));
          const counts = new Map<string, number>();
          for (const ex of vaultScan(app).exercises) {
            const parts = ex.rel.replace(/\\/g, "/").split("/");
            for (let i = parts.length - 1; i > 0; i--) {
              const dir = parts.slice(0, i).join("/");
              if (folders.has(dir)) {
                counts.set(dir, (counts.get(dir) ?? 0) + 1);
                break;
              }
            }
          }
          const cfg = AIConfig.fromDict(AppConfig.get_ai_config());
          const aiOn = o.noAi !== true && aiUnavailableReason(cfg) === null;
          const objective = plan.preconditions?.freeObjective?.trim().slice(0, 300) || plan.subplans.map((s) => s.area).slice(0, 5).join(" + ");
          const weekNow = Math.floor((Date.parse(today) - Date.parse(plan.start)) / 86400000 / 7) + 1;
          let res;
          try {
            res = await generateCurriculum(plan, sch, {
              send: (messages, so) => job.send(messages, so),
              aiOn,
              existing: { count: (f) => counts.get(f) ?? 0 },
              fromWeek: o.all === true ? 1 : Math.max(1, Math.min(weekNow, sch.weeks)),
              objective,
              cancelled: job.cancelled,
              onProgress: (_p, label) => job.setLabel(label),
            });
          } catch (e) {
            if (e instanceof CurriculumCancel || e instanceof CancelError) throw new ApiError("Cancelado.");
            throw e;
          }
          const hist = new ChangeStore(app.root);
          const prev = plan.practiceCurriculum;
          const merged = prev && res.curriculum.weeks.length ? { ...res.curriculum, weeks: [...prev.weeks.filter((w) => !res.curriculum.weeks.some((x) => x.week === w.week)), ...res.curriculum.weeks].sort((a, b) => a.week - b.week), monthly: [...prev.monthly.filter((m) => !res.curriculum.monthly.some((x) => x.month === m.month)), ...res.curriculum.monthly] } : res.curriculum;
          const saved = st.save({ ...plan, practiceCurriculum: merged, updatedAt: new Date().toISOString() });
          const nW = res.curriculum.weeks.length;
          const entry = hist.append(id, {
            at: new Date().toISOString(),
            comment: "Generar la práctica del plan",
            status: "applied",
            source: res.aiUsed ? "ai" : "rules",
            summary: `Práctica del plan: ${nW} ${nW === 1 ? "semana" : "semanas"} ${res.aiUsed ? "con el Mentor" : "con plantillas automáticas"}${res.warnings.length ? ` (${res.warnings.length} ${res.warnings.length === 1 ? "bloque" : "bloques"} con plantillas)` : ""}.`,
            delta: { added: 0, removed: 0, moved: 0, deliverables: 0 },
            changed: [],
            warnings: res.warnings,
            fixOptions: [],
            before: plan,
          });
          return { loading: false as const, plan: saved, entry: viewOf(entry), history: hist.list(id).map(viewOf), aiUsed: res.aiUsed, calls: res.calls };
        }),
      );
    },

    /**
     * «Reorganizar por áreas»: convierte un plan de estructura antigua (un subplan por rama de carpeta) a áreas elementales con grupos y
     * fases. Solo se ejecuta cuando el usuario lo pide. Determinista, conserva lo completado y los comentarios, y queda en el historial de
     * cambios con la instantánea previa: «Deshacer» lo revierte (`mentor_plan_change_undo`).
     */
    mentor_plan_reorganize(opts: unknown) {
      const o = (opts && typeof opts === "object" ? opts : {}) as Record<string, any>;
      const id = String(o.id ?? "");
      if (!PLAN_ID_RE.test(id)) throw new ApiError("Plan inválido.");
      const st = new PlanStore(app.root);
      const plan = st.load(id);
      if (!plan) throw new ApiError("Ese plan ya no existe.");
      if (plan.structure === "areas") throw new ApiError("Este plan ya está organizado por áreas.");
      if (!canReorganize(plan)) throw new ApiError("Este plan no tiene temas que reorganizar.");
      const hist = new ChangeStore(app.root);
      const res = reorganizeByAreas(plan, { today: localDate(), startFocus: practiceStartFocus(app), goals: goalScopes(app) });
      if (!res) throw new ApiError("No se pudo reorganizar el plan.");
      const saved = st.save(res.plan);
      const entry = hist.append(id, {
        at: new Date().toISOString(),
        comment: "Reorganizar por áreas",
        status: "applied",
        source: "rules",
        summary: res.summary,
        delta: { added: 0, removed: res.dropped.length, moved: res.moved, deliverables: 0, structure: saved.subplans.length },
        changed: res.changed,
        warnings: res.warnings,
        fixOptions: [],
        before: plan,
        ...(saved.name !== plan.name ? { nameAfter: saved.name ?? "" } : {}),
      });
      return { plan: saved, entry: viewOf(entry), history: hist.list(id).map(viewOf), applied: true as const };
    },

    // ── Cobertura del plan: notas de teoría y práctica por área (determinista) + revisión con el Mentor (bajo demanda) ──

    /** Cobertura de teoría y práctica de cada área del plan contra la vault y la última revisión guardada. Solo lee. */
    mentor_plan_coverage(opts: unknown) {
      const plan = coveragePlan(opts);
      if (studyIndexCold(app)) return { loading: true as const };
      return {
        loading: false as const,
        coverage: coverageOf(plan).coverage,
        review: plan.coverageReview ?? null,
        aiConfigured: aiUnavailableReason(AIConfig.fromDict(AppConfig.get_ai_config())) === null,
      };
    },

    /**
     * «Revisar cobertura con el Mentor»: UNA llamada a la IA con el objetivo, el perfil declarado, los títulos de los temas por área y el
     * resumen de cobertura (nunca las notas). La respuesta se valida (descarta lo que ya existe como tema, normaliza las áreas) y se guarda
     * como `coverageReview` en el plan; no crea notas ni cambia temas. Sin IA (o si falla o se cancela) no se guarda nada: `source: "none"`.
     */
    async mentor_plan_coverage_review(opts: unknown) {
      const o = (opts && typeof opts === "object" ? opts : {}) as Record<string, any>;
      const plan = coveragePlan(o);
      const profile = String(o.profile ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_PROFILE_CHARS);
      if (studyIndexCold(app)) return { loading: true as const };
      const { coverage, snaps } = coverageOf(plan);
      const none = (reason: string) => ({ loading: false as const, source: "none" as const, reason, coverage });
      if (o.noAi === true) return none("Sin IA por petición tuya: se muestra solo la cobertura calculada.");
      if (aiUnavailableReason(AIConfig.fromDict(AppConfig.get_ai_config())) !== null) return none("La IA no está configurada: sin IA solo se muestra la cobertura calculada.");
      const id = plan.id;
      return guarded(`plan:${id}`, `coverage:${profile}`, () =>
        withJob(`coverage:${id}`, "Revisando la cobertura del plan con tu objetivo…", async (job) => {
          const objective = plan.preconditions?.freeObjective?.trim() || plan.subplans.map((s) => s.objective).filter(Boolean).join(" · ");
          let text: string;
          try {
            text = await job.send(coverageMessages({ objective, profile, subplans: plan.subplans, coverage }) as ChatMessage[], { timeoutMs: 180_000 });
          } catch (e) {
            if (e instanceof CancelError) return none(e.mode === "abort" ? "Cancelaste la revisión: se muestra solo la cobertura calculada." : "Seguiste sin IA: se muestra solo la cobertura calculada.");
            return none(`La IA falló (${e instanceof Error ? e.message : String(e)}`.slice(0, 200) + "): se muestra solo la cobertura calculada.");
          }
          const parsed = parseCoverageReply(text, {
            areas: plan.subplans.map((s) => ({ key: areaKeyOf(s), area: s.area, groups: s.groups })),
            planTopics: plan.subplans.flatMap((s) => s.topics.map((t) => ({ folder: t.folder, title: t.title, key: areaKeyOf(s) }))),
            vaultTitles: snaps.map((t) => t.title),
          });
          if (!parsed.ok) return none(`${parsed.reason} Se muestra solo la cobertura calculada.`);
          const st = new PlanStore(app.root);
          const fresh = st.load(id) ?? plan;
          const review = { at: new Date().toISOString(), source: "ai" as const, ...(profile ? { profile } : {}), ...parsed.review };
          const saved = st.save({ ...fresh, coverageReview: review });
          return { loading: false as const, source: "ai" as const, review: saved.coverageReview ?? review, plan: saved, coverage };
        }),
      );
    },

    // ── Constructor guiado: el plan se arma por etapas y se pregunta al estudiante conforme se arma ──

    /**
     * Empieza a armar un plan paso a paso con las precondiciones del formulario. Calcula la primera etapa (con IA, una llamada pequeña
     * si hay comentarios o preguntas que mejorar; sin IA, por reglas) y deja el estado en \`.notevault/mentor/plans/_building/<id>.json\`.
     * No escribe ningún plan.
     */
    async mentor_plan_build_start(opts: unknown) {
      const o = (opts && typeof opts === "object" ? opts : {}) as Record<string, any>;
      const today = localDate();
      const pre0 = sanitizePreconditions(o.preconditions && typeof o.preconditions === "object" ? o.preconditions : o, today);
      const problem = preconditionsProblem(pre0, today);
      if (problem) throw new ApiError(problem);
      const ctx = buildCtx();
      if (!ctx) return { loading: true as const };
      const pre = resolveBranches(pre0, ctx.all, ctx.goals.filter((g) => pre0.goalIds.includes(g.id)).map((g) => g.name));
      const wanted = o.id !== undefined ? String(o.id) : "";
      if (!planCatalog(resolveScope(pre, ctx.all, ctx.goals), 100).length) {
        throw new ApiError("No hay temas pendientes en lo que elegiste. Elige metas con temas enlazados o materias con temas sin completar.");
      }
      const now = new Date().toISOString();
      const id = BUILD_ID_RE.test(wanted) && !builds().load(wanted) ? wanted : newBuildId();
      return guarded(id, "start", () => withJob(`build:${id}`, "Preparando el alcance de tu plan…", async (job) => {
        const first: PlanBuild = {
          id, createdAt: now, updatedAt: now, pre, effective: pre, stage: "alcance", steps: [], answers: [], draft: null, skeleton: null,
          source: "rules", questionCount: 0, maxQuestions: MAX_BUILD_QUESTIONS, status: "building", finishing: false, ai: emptyAi(), name: "",
        };
        return buildView(builds().save(await advance(first, ctx, false, job)));
      }));
    },

    /** El estado guardado de un plan en construcción (sin recalcular: funciona aunque el índice de la vault esté frío). */
    mentor_plan_build_get(opts: unknown) {
      const o = (opts && typeof opts === "object" ? opts : {}) as Record<string, any>;
      return buildView(loadBuild(o.id));
    },

    /** Los planes en construcción (el último tocado primero), en resumen para la barra lateral, el resumen y el chat. */
    mentor_plan_build_list() {
      return builds().list().map(summaryOf);
    },

    /**
     * Responde la pregunta abierta: \`choice\` (id de una opción), \`text\` (se interpreta como una opción solo si es inequívoco; las
     * preguntas de la IA admiten texto libre), \`skip\` (valor por defecto) o \`delegate\` («que decida el Mentor»). La respuesta la aplica
     * código determinista al recalcular. Un doble envío no duplica la llamada.
     */
    async mentor_plan_build_answer(opts: unknown) {
      const o = (opts && typeof opts === "object" ? opts : {}) as Record<string, any>;
      const b = loadBuild(o.id);
      if (b.status !== "building" || !b.openQuestion) throw new ApiError("Este plan no tiene ninguna pregunta abierta.");
      const q = b.openQuestion;
      if (String(o.questionId ?? q.id) !== q.id) throw new ApiError("Esa pregunta ya no está abierta.");
      const input: AnswerInput = { choice: o.choice === undefined ? undefined : String(o.choice), text: o.answer !== undefined ? String(o.answer) : o.text !== undefined ? String(o.text) : undefined, skip: o.skip === true, delegate: o.delegate === true };
      const ctx = buildCtx();
      if (!ctx) return { loading: true as const };
      return guarded(b.id, `answer:${q.id}:${input.choice ?? ""}:${input.text ?? ""}:${input.skip}:${input.delegate}`, () =>
        withJob(`build:${b.id}`, "Aplicando tu respuesta y preparando lo siguiente…", async (job) => {
          let ans;
          try {
            ans = makeAnswer(q, input, new Date().toISOString());
          } catch (e) {
            throw new ApiError((e as Error).message);
          }
          return buildView(builds().save(await advance({ ...b, answers: [...b.answers, ans] }, ctx, false, job)));
        }),
      );
    },

    /** «Volver a una etapa» / «Cambiar respuesta»: descarta las respuestas de esa etapa en adelante y rehace desde ahí. */
    async mentor_plan_build_back(opts: unknown) {
      const o = (opts && typeof opts === "object" ? opts : {}) as Record<string, any>;
      const b = loadBuild(o.id);
      if (!isBuildStage(o.stage)) throw new ApiError("Etapa inválida.");
      const stage = o.stage as BuildStage;
      const ctx = buildCtx();
      if (!ctx) return { loading: true as const };
      return guarded(b.id, `back:${stage}`, () => withJob(`build:${b.id}`, "Rehaciendo desde esa etapa…", async (job) => buildView(builds().save(await advance({ ...b, answers: b.answers.filter((a) => stageIndex(a.stage) < stageIndex(stage)) }, ctx, false, job)))));
    },

    /** «Generar ya con lo que hay»: completa lo que falta con valores razonables (una llamada a la IA para los temas, o determinista) y pasa a Revisión. */
    async mentor_plan_build_finish_now(opts: unknown) {
      const o = (opts && typeof opts === "object" ? opts : {}) as Record<string, any>;
      const b = loadBuild(o.id);
      const ctx = buildCtx();
      if (!ctx) return { loading: true as const };
      return guarded(b.id, "finish", () => withJob(`build:${b.id}`, "Completando lo que falta con valores razonables…", async (job) => buildView(builds().save(await advance({ ...b, finishing: true }, ctx, true, job)))));
    },

    /** «Abandonar»: el estado va a la papelera de la vault (`.notevault/.papelera/mentor-plans`). */
    mentor_plan_build_abandon(opts: unknown) {
      const o = (opts && typeof opts === "object" ? opts : {}) as Record<string, any>;
      const b = loadBuild(o.id);
      if (inflight.has(b.id)) throw new ApiError("El Mentor sigue pensando en este plan. Espera un momento.");
      if (!builds().trash(b.id)) throw new ApiError("No se pudo abandonar el plan en construcción.");
      return { id: b.id, builds: builds().list().map(summaryOf) };
    },

    /**
     * «Aceptar plan» de un plan en construcción: recalcula TODO desde las precondiciones y las respuestas (no se fía del estado que
     * mande la UI), exige estar en Revisión y escribe el plan por el camino de siempre (que vuelve a validar temas, metas, proyectos y
     * capacidad). Después el estado de construcción se elimina.
     */
    mentor_plan_build_accept(opts: unknown) {
      const o = (opts && typeof opts === "object" ? opts : {}) as Record<string, any>;
      const b = loadBuild(o.id);
      if (inflight.has(b.id)) throw new ApiError("El Mentor sigue pensando en este plan. Espera un momento.");
      const ctx = buildCtx();
      if (!ctx) return { loading: true as const };
      const comp = computeBuild({ pre: b.pre, answers: b.answers, ai: b.ai, maxQuestions: b.maxQuestions }, ctx, { finishing: b.finishing, noAi: true });
      if (comp.status !== "review" || !comp.draft) throw new ApiError("Al plan aún le faltan etapas: responde las preguntas o pulsa «Generar ya con lo que hay».");
      const out = acceptRef({ draft: comp.draft, proposed: true });
      builds().remove(b.id);
      return out;
    },

    // ── Estado y cancelación de las llamadas largas de la IA (generar plan, constructor, chat, cambios) ──

    /** ¿Sigue pensando la IA? Claves: `generate`, `chat`, `build:<id>`, `change:<id>`. `label` dice qué hace; `elapsed`, los segundos. */
    mentor_ai_status(opts: unknown) {
      const o = (opts && typeof opts === "object" ? opts : {}) as Record<string, any>;
      const j = jobs.get(String(o.key ?? ""));
      return j ? { busy: true as const, label: j.label, elapsed: Math.round((Date.now() - j.since) / 1000) } : { busy: false as const, label: "", elapsed: 0 };
    },

    /** Cancela una llamada larga: `mode: "abort"` (por defecto) la aborta sin efectos; `mode: "auto"` sigue con el plan automático (sin IA). */
    mentor_ai_cancel(opts: unknown) {
      const o = (opts && typeof opts === "object" ? opts : {}) as Record<string, any>;
      const j = jobs.get(String(o.key ?? ""));
      if (!j) return { cancelled: false };
      j.cancelled = o.mode === "auto" ? "auto" : "abort";
      j.controller.abort();
      for (const w of [...j.waiters]) w(new CancelError(j.cancelled));
      return { cancelled: true };
    },

    // ── Plan propuesto: mantener / borrar, y pedir cambios con comentarios ──

    /** «Mantener plan»: el plan propuesto deja de serlo (pasa a activo o futuro según sus fechas). «Borrar» es `mentor_plan_delete` (papelera). */
    mentor_plan_keep(opts: unknown) {
      const o = (opts && typeof opts === "object" ? opts : {}) as Record<string, any>;
      const id = String(o.id ?? "");
      if (!PLAN_ID_RE.test(id)) throw new ApiError("Plan inválido.");
      const st = new PlanStore(app.root);
      const plan = st.load(id);
      if (!plan) throw new ApiError("Ese plan ya no existe.");
      if (!plan.proposed) throw new ApiError("Ese plan ya está mantenido.");
      const { proposed: _p, ...rest } = plan;
      return st.save({ ...rest, updatedAt: new Date().toISOString() });
    },

    /** El historial de cambios pedidos a un plan (sin las instantáneas). */
    mentor_plan_changes(opts: unknown) {
      const o = (opts && typeof opts === "object" ? opts : {}) as Record<string, any>;
      const id = String(o.id ?? "");
      if (!PLAN_ID_RE.test(id)) throw new ApiError("Plan inválido.");
      return new ChangeStore(app.root).list(id).map(viewOf);
    },

    /**
     * Pedir cambios al plan con un comentario (o con operaciones de ajuste calculadas por la app: `ops`). La IA lo traduce a un parche
     * validado; sin IA, o si falla, hay un intérprete por palabras clave; lo que no se entiende queda como «pendiente» (el texto no se
     * pierde). El reparto semanal se recalcula siempre con la capacidad real. Cada cambio guarda una instantánea para «Deshacer».
     */
    async mentor_plan_change(opts: unknown) {
      const o = (opts && typeof opts === "object" ? opts : {}) as Record<string, any>;
      const id = String(o.id ?? "");
      if (!PLAN_ID_RE.test(id)) throw new ApiError("Plan inválido.");
      const st = new PlanStore(app.root);
      const plan = st.load(id);
      if (!plan) throw new ApiError("Ese plan ya no existe.");
      const comment = sanitizeNotes(o.comment, MAX_COMMENT_CHARS);
      const direct: ChangeOp[] | null = Array.isArray(o.ops)
        ? (o.ops as any[])
            .filter((x) => x && ["trim_to_fit", "extend_to", "raise_minutes", "lighter"].includes(String(x.op)))
            .map((x) => (x.op === "extend_to" ? { op: "extend_to" as const, date: String(x.date ?? "") } : x.op === "raise_minutes" ? { op: "raise_minutes" as const, minutes: Number(x.minutes) } : { op: x.op as "trim_to_fit" | "lighter" }))
        : null;
      if (!comment && !direct?.length) throw new ApiError("Escribe qué quieres cambiar en el plan.");
      if (studyIndexCold(app)) return { loading: true as const };
      return guarded(`plan:${id}`, `change:${comment}:${JSON.stringify(direct)}`, () =>
        withJob(`change:${id}`, "Aplicando tu comentario al plan…", async (job) => {
          const today = localDate();
          const all = buildTopicCatalog(topicSnaps(app), "", { max: 1_000_000 });
          const ctx = { today, all, startFocus: practiceStartFocus(app) };
          const hist = new ChangeStore(app.root);
          const label = comment || String(o.label ?? "Ajuste propuesto por la app").slice(0, 200);
          let ops: ChangeOp[] = direct ?? [];
          let summary = "";
          let source: ChangeEntry["source"] = direct ? "rules" : "none";
          let note = "";
          if (!direct) {
            const cfg = AIConfig.fromDict(AppConfig.get_ai_config());
            if (o.noAi !== true && aiUnavailableReason(cfg) === null) {
              try {
                const pre = plan.preconditions;
                const scope = pre ? resolveScope(pre, all, goalScopes(app)) : null;
                const inPlan = new Set(plan.subplans.flatMap((s) => s.topics.map((t) => t.folder)));
                const base = scope ? planCatalog(scope, dynamicCatalogMax(pre!, scope, today), comment) : buildTopicCatalog(topicSnaps(app), comment, { max: 120 });
                // ramas excluidas que el comentario nombra de forma explícita (el estudiante manda)
                const named = fold(comment);
                const extraClasses = detectBranchIntent(comment).extra;
                const extra = all.filter((t) => t.completenessPct < 100 && branchOfFolder(t.folder) && (extraClasses.includes(classifyBranch(branchOfFolder(t.folder)) as never) || named.includes(fold(branchOfFolder(t.folder)).replace(/^[\d.\s_-]+/, "")))).slice(0, 150);
                const catalog = [...new Map([...base, ...extra].filter((t) => !inPlan.has(t.folder) && t.completenessPct < 100).map((t) => [t.folder, t])).values()].slice(0, 320);
                const brief = buildStudentBrief(briefContext(app, log()));
                const parsed = parseChangeReply(await job.send(changeMessages(brief, plan, comment, catalog, hist.list(id))), plan, catalog, comment);
                if (parsed.ok && parsed.ops.length) {
                  ops = parsed.ops;
                  summary = parsed.summary;
                  source = "ai";
                } else note = parsed.ok ? parsed.summary || "La IA no propuso ningún cambio aplicable." : (parsed.reason ?? "La IA no devolvió un parche válido.");
              } catch (e) {
                if (e instanceof CancelError && e.mode === "abort") note = "Cancelaste la llamada: el comentario queda pendiente.";
                else note = e instanceof CancelError ? "Pediste seguir sin IA." : `La IA falló: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200);
                if (e instanceof CancelError && e.mode === "abort") ops = [];
              }
            } else note = o.noAi === true ? "Sin IA por petición tuya." : "La IA no está configurada.";
            if (!ops.length && !note.startsWith("Cancelaste")) {
              const r = opsFromText(comment, plan, ctx);
              if (r.ops.length) {
                ops = r.ops;
                summary = r.summary;
                source = "rules";
              }
            }
          }
          // ramas: si el plan no las trae y el comentario (o el nombre de sus metas) dice «full stack», se aplican y se quitan los temas de las excluidas
          if (plan.preconditions && !direct) {
            const goalNames = plan.subplans.filter((sp) => sp.goalId).map((sp) => sp.objective);
            const inf = resolveBranches(plan.preconditions, all, goalNames, comment);
            if (inf.branches && !plan.preconditions.branches) ops = [{ op: "set_branches", branches: inf.branches, preset: inf.branchPreset ?? "fullstack", excluded: inf.branchExcluded ?? [] }, ...ops];
          }
          let res = ops.length ? applyOps(plan, ops, ctx) : null;
          if (res && !res.applied && source === "ai") {
            const r = opsFromText(comment, plan, ctx);
            res = r.ops.length ? applyOps(plan, r.ops, ctx) : res;
            if (res.applied) {
              summary = r.summary;
              source = "rules";
            }
          }
          const now = new Date().toISOString();
          if (!res || !res.applied) {
            const entry = hist.append(id, {
              at: now,
              comment: label,
              status: "pending",
              source: "none",
              summary: `${note ? `${note} ` : ""}${ops.length ? "Los cambios pedidos no modificaron nada." : "No pude aplicar este comentario: queda guardado como pendiente. Reescríbelo o usa frases como «quita desktop» o «pasa X a la semana 5»."}`.trim(),
              delta: { added: 0, removed: 0, moved: 0, deliverables: 0 },
              changed: [],
              warnings: [],
              fixOptions: [],
            });
            return { loading: false as const, plan, entry: viewOf(entry), history: hist.list(id).map(viewOf), applied: false };
          }
          const saved = st.save(res.plan);
          const entry = hist.append(id, {
            at: now,
            comment: label,
            status: "applied",
            source,
            summary: summary || deltaText(res.delta),
            delta: res.delta,
            changed: res.changed,
            warnings: res.warnings,
            fixOptions: res.fixOptions,
            before: plan,
          });
          return { loading: false as const, plan: saved, entry: viewOf(entry), history: hist.list(id).map(viewOf), applied: true };
        }),
      );
    },

    /** «Deshacer» el último cambio aplicado: restaura la instantánea previa (conserva el nombre y si el plan está propuesto o mantenido). */
    mentor_plan_change_undo(opts: unknown) {
      const o = (opts && typeof opts === "object" ? opts : {}) as Record<string, any>;
      const id = String(o.id ?? "");
      if (!PLAN_ID_RE.test(id)) throw new ApiError("Plan inválido.");
      const st = new PlanStore(app.root);
      const cur = st.load(id);
      if (!cur) throw new ApiError("Ese plan ya no existe.");
      const hist = new ChangeStore(app.root);
      const last = [...hist.list(id)].reverse().find((e) => e.status === "applied" && e.before);
      if (!last?.before) throw new ApiError("No hay ningún cambio que deshacer.");
      const { proposed: _p, archived: _a, name: _n, coverageReview: _cr, ...base } = last.before;
      // el nombre actual se conserva (renombrar no es un cambio del plan), salvo que el propio cambio lo hubiera puesto y nadie lo haya tocado después
      const name = last.nameAfter !== undefined && (cur.name ?? "") === last.nameAfter ? last.before.name : cur.name;
      const restored = st.save({ ...base, ...(cur.proposed ? { proposed: true } : {}), ...(cur.archived ? { archived: true } : {}), ...(name ? { name } : {}), ...(cur.coverageReview ? { coverageReview: cur.coverageReview } : {}), updatedAt: new Date().toISOString() });
      hist.save(id, { ...last, status: "undone" });
      return { plan: restored, history: hist.list(id).map(viewOf) };
    },
  };
  acceptRef = api.mentor_plan_draft_accept;
  return {
    ...api,
    /** Compatibilidad: el flujo anterior (un BORRADOR en el chat que se acepta aparte); el camino principal crea el plan propuesto. */
    mentor_plan_generate_draft: (opts: unknown) => api.mentor_plan_generate({ ...((opts && typeof opts === "object" ? opts : {}) as object), asDraft: true }),
  };
}
