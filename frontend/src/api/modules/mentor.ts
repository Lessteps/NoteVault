// Mentor: informe del estudiante, candidatos de estudio y registro de sesiones.
//
// Todo el cálculo vive en core/mentor (puro y testeado); aquí solo se arma el
// contexto con los managers de la vault y se validan las entradas de la UI. La IA
// (fase siguiente) consume `mentor_brief().text`: nunca lee notas completas.

import { AIConfig, sendChat } from "../../core/aiClient.js";
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
import { periodLabel } from "../../lib/planTime.js";
import {
  areaOfFolder,
  adjustedMinutes,
  autoSeeds,
  defaultDeliverable,
  buildPlanMessages,
  composeFromPreconditions,
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
  };
};

/** Activos primero (el más reciente arriba), luego futuros por fecha, luego terminados del más reciente al más antiguo. */
function sortRows<T extends { status: string; start: string; end: string }>(rows: T[]): T[] {
  const rank = { activo: 0, futuro: 1, terminado: 2 } as Record<string, number>;
  return [...rows].sort((a, b) => rank[a.status]! - rank[b.status]! || (a.status === "terminado" ? b.end.localeCompare(a.end) : a.status === "activo" ? b.start.localeCompare(a.start) : a.start.localeCompare(b.start)));
}

/** El plan que se muestra por defecto: el activo hoy; si no, el siguiente futuro; si no, el último terminado. */
function defaultPlan(plans: readonly Plan[], today: string): Plan | null {
  const rows = sortRows(plans.map((p) => planRow(p, today)));
  return plans.find((p) => p.id === rows[0]?.id) ?? null;
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

  return {
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
      const prePrev: PlanPreconditions | null = prevPlan?.preconditions ? sanitizePreconditions(prevPlan.preconditions, today) : null;
      const scopePrev = prePrev ? resolveScope(prePrev, buildTopicCatalog(snapsAll, "", { max: 1_000_000 }), goalScopes(app)) : null;
      const catalog = scopePrev ? planCatalog(scopePrev, 100, `${prePrev?.freeObjective ?? ""} ${prePrev?.notes ?? ""} ${message}`) : buildTopicCatalog(snapsAll, request, { max: planMode ? 80 : 60 });
      const planCtx = planContext(app, today);
      const areas = app.mgrs().areas.areas().filter((a) => !a.archived);
      const chatLog = existing ?? chats().create();
      const turns = chatLog.append({ role: "user", content: message });

      let raw = "";
      try {
        const extras = { today, areas: areas.map((a) => a.name), plan: planCtx, planMode };
        raw = await (send ?? sendChat)(cfg, prePrev && scopePrev ? buildPlanMessages(prePrev, brief, catalog, history, { ...extras, scope: scopePrev }, message) : buildChatMessages(message, brief, catalog, history, extras));
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
      const areas = new Map<string, { id: string; name: string; total: number; pending: number; minutes: number }>();
      for (const t of all) {
        const id = areaOfFolder(t.folder) || t.subject || "General";
        const e = areas.get(id) ?? { id, name: id, total: 0, pending: 0, minutes: 0 };
        e.total++;
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
        areas: [...areas.values()].sort((a, b) => a.name.localeCompare(b.name, "es", { numeric: true })),
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
      const pre = sanitizePreconditions(o.preconditions && typeof o.preconditions === "object" ? o.preconditions : o, today);
      const problem = preconditionsProblem(pre, today);
      if (problem) throw new ApiError(problem);
      if (studyIndexCold(app)) return { loading: true as const };

      const all = buildTopicCatalog(topicSnaps(app), "", { max: 1_000_000 });
      const goals = goalScopes(app);
      const scope = resolveScope(pre, all, goals);
      const catalog = planCatalog(scope, 100, `${pre.freeObjective ?? ""} ${pre.notes ?? ""}`);
      if (!catalog.length) {
        throw new ApiError("No hay temas pendientes en lo que elegiste. Elige metas con temas enlazados o materias con temas sin completar.");
      }

      const cfg = AIConfig.fromDict(AppConfig.get_ai_config());
      const unavailable = aiUnavailableReason(cfg);
      const planCtx = planContext(app, today);
      let draft: PlanDraft | null = null;
      let fallbackReason: string | undefined = unavailable ?? undefined;
      if (!unavailable) {
        try {
          const brief = buildStudentBrief(briefContext(app, log()));
          const areaNames = app.mgrs().areas.areas().filter((a) => !a.archived).map((a) => a.name);
          const raw = await (send ?? sendChat)(cfg, buildPlanMessages(pre, brief, catalog, [], { today, areas: areaNames, plan: planCtx, scope }));
          const parsed = parsePreconditionReply(raw, catalog, planCtx);
          if (parsed.ok) {
            const { seeds, why } = seedsFromReply(parsed.reply, catalog, pre, new Map(goals.map((g) => [g.id, g.name])));
            if (seeds.length) {
              draft = composeFromPreconditions(seeds, pre, { today, auto: false, rationale: parsed.reply.rationale, discarded: parsed.reply.discarded, why, startFocus: practiceStartFocus(app), practiceSuggestions: parsed.reply.practice });
            } else fallbackReason = "La IA no propuso ningún tema válido.";
          } else fallbackReason = parsed.reason;
        } catch (e) {
          fallbackReason = `La IA falló: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300);
        }
      }
      if (!draft) {
        const why = unavailable ? "La IA no está configurada" : `La IA no devolvió un plan válido (${fallbackReason ?? "sin detalle"})`;
        draft = composeFromPreconditions(autoSeeds(pre, scope), pre, {
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
      const next = chatLog.append({ role: "assistant", content: text, planDraft: draft });
      return {
        loading: false as const,
        kind: "plan_draft" as const,
        source: draft.auto ? ("auto" as const) : ("ai" as const),
        text,
        planDraft: draft,
        turns: next,
        pending: pendingDraft(next)?.id ?? null,
        chatId: chatLog.record().id,
      };
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

      let seeds: SubplanSeed[] = [];
      for (const s of d.subplans.slice(0, 12) as any[]) {
        const seen = new Set<string>();
        const topics: SubplanSeed["topics"] = [];
        for (const t of (Array.isArray(s?.topics) ? s.topics : []).slice(0, 60) as any[]) {
          const folder = String(t?.folder ?? "").replace(/\\/g, "/");
          const snap = snaps.get(folder);
          if (!snap || seen.has(folder)) continue;
          seen.add(folder);
          const valid = new Set(Object.keys(snap.progress.skills));
          const skills = Array.isArray(t.skills) ? t.skills.map((x: unknown) => String(x).toLowerCase()).filter((x: string) => valid.has(x)) : [];
          const base = estimateTopicMinutes(snap);
          topics.push({ folder, title: snap.title, ...(skills.length ? { skills } : {}), estMinutes: pre ? adjustedMinutes(base, areaOfFolder(folder), pre.levels) : base });
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
        seeds.push({ ...(/^[A-Za-z0-9_-]{1,40}$/.test(String(s?.id ?? "")) ? { id: String(s.id) } : {}), area: String(s?.area ?? ""), objective: String(s?.objective ?? ""), ...(goalId ? { goalId } : {}), topics, requiredGoals, ...(deliverable ? { deliverable } : {}) });
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
            rationale: String(d.rationale ?? ""),
          })
        : buildPlan(seeds, { month: win.month, hoursPerWeek, from, rationale: String(d.rationale ?? "") });
      const saved = st.save(mergePlans(st.load(built.plan.id), built.plan));
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
      const subplanId = String(o.subplanId ?? "");
      const sub = draft.subplans.find((s) => s.id === subplanId);
      if (!sub) throw new ApiError("Ese subplan ya no existe en el borrador.");
      let next = draft;
      if (answer !== "later") {
        const proposal = defaultDeliverable(sub.objective || sub.area);
        const subplans = draft.subplans.map((s) =>
          s.id === subplanId && answer === "yes" && !s.deliverable ? { ...s, deliverable: { title: proposal.title, description: proposal.description ?? "", criteria: proposal.criteria ?? [], status: "idea" as const } } : s,
        );
        next = { ...draft, subplans, openQuestions: (draft.openQuestions ?? []).filter((q) => !(q.id === questionId && q.subplanId === subplanId)) };
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
      if (!(DELIVERABLE_STATUSES as readonly string[]).includes(String(o.status))) throw new ApiError("Estado de entregable inválido.");
      const st = new PlanStore(app.root);
      const plan = st.load(id);
      const sub = plan?.subplans.find((s) => s.id === String(o.subplanId ?? ""));
      if (!plan || !sub) throw new ApiError("Ese subplan ya no existe.");
      if (!sub.deliverable) throw new ApiError("Ese subplan no tiene entregable.");
      let projectId = sub.deliverable.projectId;
      if (o.projectId !== undefined) {
        const wanted = o.projectId === null ? "" : String(o.projectId);
        if (wanted && !app.mgrs().projects.get(wanted)) throw new ApiError("Ese proyecto no existe.");
        projectId = wanted || undefined;
      }
      sub.deliverable = { ...sub.deliverable, status: o.status as DeliverableStatus, ...(projectId ? { projectId } : {}) };
      if (!projectId) delete sub.deliverable.projectId;
      plan.updatedAt = new Date().toISOString();
      return st.save(plan);
    },
  };
}
