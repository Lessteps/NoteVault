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
import { allocate, buildCandidates } from "../../core/mentor/candidates.js";
import { buildStudentBrief, toPromptText, type BriefContext, type QueueHint } from "../../core/mentor/brief.js";
import { adherence, BLOCK_STATUSES, sanitizeSession, SessionLog, type BlockStatus } from "../../core/mentor/sessionLog.js";
import { aiUnavailableReason, planToBlocks, proposePlan, type ProposedBlock, type SendFn } from "../../core/mentor/planner.js";
import { snapshotTopics, type TopicSnap } from "../../core/mentor/topics.js";
import { ChatStore, pendingDraft, type ChatLog, type ChatTurnRecord } from "../../core/mentor/chatLog.js";
import {
  buildGoalMessages,
  buildTopicCatalog,
  composeDraft,
  estimateTopicMinutes,
  fold,
  parseGoalResponse,
  scheduleGoal,
  type ChatTurn,
} from "../../core/mentor/goalDraft.js";
import { studyAreas, topicsPanel } from "../../core/mentor/panels.js";
import { sectionData, type StudyPendingData } from "../../core/mentor/brief.js";
import { StudyErrorManager } from "../../core/studyErrorManager.js";
import { StudySRSManager } from "../../core/studySrsManager.js";
import { AppConfig } from "../appConfig.js";
import type { AppState } from "../appState.js";
import { clampInt } from "../common.js";
import { vaultScan } from "../vaultScan.js";
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
    content: t.draft
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
      const candidates = buildCandidates(brief, { availableMinutes });
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
      const candidates = buildCandidates(brief, { availableMinutes });
      const cfg = AIConfig.fromDict(AppConfig.get_ai_config());
      const res = await proposePlan(
        cfg,
        {
          brief,
          candidates,
          availableMinutes,
          objective: o.objective ? String(o.objective).slice(0, 500) : undefined,
          userNote: o.userNote ? String(o.userNote).slice(0, 500) : undefined,
          excludeSubjects: strs(o.excludeSubjects),
          excludeCandidateIds: strs(o.excludeCandidateIds),
        },
        send,
      );
      return {
        loading: false as const,
        availableMinutes,
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
      const catalog = buildTopicCatalog(topicSnaps(app), request);
      const today = localDate();
      const areas = app.mgrs().areas.areas().filter((a) => !a.archived);
      const chatLog = existing ?? chats().create();
      const turns = chatLog.append({ role: "user", content: message });

      let raw = "";
      try {
        raw = await (send ?? sendChat)(cfg, buildGoalMessages(message, brief, catalog, history, { today, areas: areas.map((a) => a.name) }));
      } catch (e) {
        return { loading: false as const, kind: "error" as const, text: `La IA falló: ${e instanceof Error ? e.message : String(e)}`.slice(0, 400), turns, pending: pendingDraft(turns)?.id ?? null };
      }
      const parsed = parseGoalResponse(raw, catalog);
      if (!parsed.ok) {
        return { loading: false as const, kind: "error" as const, text: `${parsed.error} Reformula o inténtalo de nuevo.`, turns, pending: pendingDraft(turns)?.id ?? null };
      }
      if (parsed.reply.type === "question") {
        const next = chatLog.append({ role: "assistant", content: parsed.reply.text });
        return { loading: false as const, kind: "question" as const, text: parsed.reply.text, turns: next, pending: pendingDraft(next)?.id ?? null };
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
  };
}
