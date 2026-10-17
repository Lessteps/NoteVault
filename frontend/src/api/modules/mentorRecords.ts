// Mentor — REGISTROS DE SESIÓN (ver `lib/sessionRecords.ts` y docs/MENTOR_SESSION_RECORDS_PLAN.md).
//
//  - mentor_record_save({ id, areaKey, areaName?, date, startedAt, minutes, mode, assigned, assessment, assessmentId? }) -> { record, rel }:
//    une la sesión con la EVIDENCIA que calcula la app (intentos y errores de esa ventana de tiempo, repasos, archivos tocados), guarda el JSON y su
//    nota `<Materia>/_registro/<fecha>/<hhmm> <Área>.md`, y recalcula `puntos-debiles.md` y la nota de la semana. Sin IA.
//  - mentor_records_list({ id }) -> { records, overview, proposals, space, aiConfigured }: todas las sesiones (90 días), el dominio por tema, los
//    patrones, las semanas resumidas y las propuestas con su seguimiento.
//  - mentor_records_rethink({ id, noAi? }) -> { proposals, source, note }: «Repensar el plan con mis registros». UNA llamada a la IA con un resumen
//    (nunca las notas); sin IA, por reglas. Solo PROPONE: no cambia el plan ni escribe notas.
//  - mentor_proposal_set({ id, proposalId, status }) -> { proposals }: descartar, reabrir o marcar como aplicada (guarda la línea base del tema).
//  - mentor_proposal_apply({ id, proposalId, preview? }) -> { rel, created, source }: crea la nota de refuerzo o la nota puente de UNA propuesta
//    (`<tema>/_Refuerzo — …md`). Con `preview` solo dice qué crearía. NUNCA sobrescribe.
// Escribe SOLO en `.notevault/mentor/records/`, en `<Materia>/_registro/` y, al aplicar una propuesta, la nota de refuerzo que se le enseñó a la persona.

import * as fs from "node:fs";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import { AIConfig, sendChat, type ChatMessage } from "../../core/aiClient.js";
import { ApiError } from "../../core/errors.js";
import { AreaPracticeStore } from "../../core/mentor/areaPracticeState.js";
import { PLAN_ID_RE, PlanStore, type Plan } from "../../core/mentor/plan.js";
import { aiUnavailableReason } from "../../core/mentor/planner.js";
import { SessionRecordStore } from "../../core/mentor/sessionRecordStore.js";
import { loadAllAttempts } from "../../core/practice/ledger.js";
import { listReviews } from "../../core/practice/reviewFiles.js";
import * as store from "../../core/store.js";
import { StudyErrorManager } from "../../core/studyErrorManager.js";
import { areaKeyOf } from "../../lib/planCoverage.js";
import {
  baselineFor, buildSessionRecord, expiredRecords, followUpOf, isoWeekOf, masteryByTopic, patternsOf, proposalId, proposalsFromPatterns, renderSessionMarkdown,
  renderWeakPointsMarkdown, renderWeekMarkdown, sessionNoteRel, weekAggregate, RECORD_RETENTION_DAYS, type Pattern, type Proposal, type ProposalKind, type SessionRecord,
} from "../../lib/sessionRecords.js";
import { AppConfig } from "../appConfig.js";
import type { AppState } from "../appState.js";

export interface RecordsHooks {
  send?: (cfg: AIConfig, messages: ChatMessage[], opts?: { timeoutMs?: number }) => Promise<string>;
  now?: () => string;
  today?: () => string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const KINDS: readonly ProposalKind[] = ["reinforce", "bridge_note", "move_review", "optional", "lighten"];
const COST: Record<ProposalKind, { aiCalls: number; files: number }> = { reinforce: { aiCalls: 1, files: 1 }, bridge_note: { aiCalls: 1, files: 1 }, move_review: { aiCalls: 0, files: 0 }, optional: { aiCalls: 0, files: 0 }, lighten: { aiCalls: 0, files: 0 } };
const WINDOW_AFTER_MS = 5 * 60_000;

const nameOf = (folder: string): string => folder.split("/").pop() ?? folder;
const slug = (s: string): string => s.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim().slice(0, 70) || "tema";
const localDate = (d = new Date()): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const under = (rel: string, folders: readonly string[]): string => folders.filter((f) => rel === f || rel.startsWith(`${f}/`)).sort((a, b) => b.length - a.length)[0] ?? "";
const fence = (t: string): string => t.replace(/^\s*```(?:markdown|md)?\s*\n/i, "").replace(/\n```\s*$/i, "").trim();

/** La nota de refuerzo por REGLAS (sin IA): lo que falló, qué repasar y preguntas de autoevaluación con las dudas de la persona. Nada inventado. */
export function renderRefuerzoTemplate(p: Pick<Proposal, "id" | "kind" | "title" | "folder" | "skill">, records: ReadonlyArray<SessionRecord>, today: string): string {
  const mine = records.filter((r) => r.assigned.some((t) => t.folder === p.folder) || r.evidence.errors.some((e) => e.folder === p.folder));
  const dubs = mine.filter((r) => r.assessment?.doubt).map((r) => ({ date: r.date, text: r.assessment!.doubt }));
  const errs = mine.flatMap((r) => [...(r.assessment?.errors ? [{ date: r.date, text: r.assessment.errors }] : []), ...r.evidence.errors.filter((e) => e.folder === p.folder && e.description).map((e) => ({ date: r.date, text: `${e.category}${e.skill ? ` (${e.skill})` : ""}: ${e.description}` }))]);
  const name = nameOf(p.folder);
  const L: string[] = ["---", "registro: refuerzo", `tema: "${name.replace(/"/g, "'")}"`, `propuesta: ${p.id}`, `creada: ${today}`, "---", `# ${p.kind === "reinforce" ? "Refuerzo" : "Nota puente"} — ${name}`, ""];
  L.push("> Creada a petición tuya a partir de tus sesiones de estudio. Es tuya: edítala con libertad.", "");
  L.push("## Qué falló");
  if (!errs.length && !dubs.length) L.push("- Aún no hay detalle: repasa el tema y anota aquí lo que no entiendas.");
  for (const e of errs.slice(0, 8)) L.push(`- ${e.date}: ${e.text}`);
  for (const d of dubs.slice(0, 8)) L.push(`- ${d.date} (duda): ${d.text}`);
  L.push("", "## Para repasar", `- Nota del tema: [[${name}]]`, `- Práctica: [[${name}.practica]]${p.skill ? ` — empieza por la skill «${p.skill}»` : ""}`, "");
  L.push("## Autoevaluación (respóndelas sin mirar la nota)");
  const qs = [...dubs.map((d) => `¿Puedes explicar con tus palabras: «${d.text}»?`), ...errs.slice(0, 3).map((e) => `¿Qué harías distinto para evitar: «${e.text}»?`)];
  if (!qs.length) qs.push(`¿Cuál es la idea principal de ${name} y en qué se confunde fácilmente?`);
  for (const q of [...new Set(qs)].slice(0, 5)) L.push(`- ${q}`);
  L.push("");
  return L.join("\n");
}

export function mentorRecordsApi(app: AppState, hooks: RecordsHooks = {}) {
  const now = hooks.now ?? ((): string => new Date().toISOString());
  const today = hooks.today ?? ((): string => localDate());
  const aiOn = (): boolean => aiUnavailableReason(AIConfig.fromDict(AppConfig.get_ai_config())) === null;
  const send = (m: ChatMessage[], timeoutMs: number): Promise<string> => (hooks.send ?? ((c, msgs, o) => sendChat(c, msgs, o)))(AIConfig.fromDict(AppConfig.get_ai_config()), m, { timeoutMs });

  const planOf = (opts: unknown): Plan => {
    const id = String(((opts && typeof opts === "object" ? opts : {}) as Record<string, any>).id ?? "");
    if (!PLAN_ID_RE.test(id)) throw new ApiError("Plan inválido.");
    const plan = new PlanStore(app.root).load(id);
    if (!plan) throw new ApiError("Ese plan ya no existe.");
    return plan;
  };
  const allTopics = (plan: Plan): Array<{ folder: string; title: string }> => plan.subplans.flatMap((s) => s.topics.map((t) => ({ folder: t.folder, title: t.title })));
  const spaceOf = (plan: Plan): string => allTopics(plan)[0]?.folder.split("/")[0] ?? "Programación";
  const noteDir = (plan: Plan): string => `${spaceOf(plan)}/_registro`;
  const writeNote = (rel: string, text: string): void => {
    const abs = path.resolve(app.root, ...rel.split("/"));
    if (!abs.startsWith(path.resolve(app.root) + path.sep)) throw new ApiError("Ruta fuera de la vault.");
    store.writeText(abs, text);
  };

  /** Los temas (carpetas) de una sesión: los asignados y los del área; sin área conocida (Bases, sesión libre) todos los del plan. */
  function foldersFor(plan: Plan, areaKey: string, assigned: ReadonlyArray<{ kind?: string; folder?: string }>): string[] {
    const sub = plan.subplans.find((s) => areaKeyOf(s) === areaKey);
    const own = (sub ? sub.topics : plan.subplans.flatMap((s) => s.topics)).map((t) => t.folder);
    const picked = assigned.filter((t) => (t.kind ?? "topic") === "topic" && t.folder).map((t) => String(t.folder));
    return [...new Set([...picked, ...own])];
  }

  function evidenceFor(plan: Plan, areaKey: string, date: string, startMs: number, minutes: number, assigned: ReadonlyArray<{ kind?: string; folder?: string }>) {
    const folders = foldersFor(plan, areaKey, assigned);
    const from = startMs - 60_000;
    const to = startMs + minutes * 60_000 + WINDOW_AFTER_MS;
    const inWindow = (at: string): boolean => {
      const t = Date.parse(String(at ?? ""));
      return Number.isFinite(t) && t >= from && t <= to;
    };
    const attempts: Array<{ exercise: string; topic: string; skill: string; score: number; verdict: string }> = [];
    for (const rec of Object.values(loadAllAttempts(app.root))) {
      const notePath = String(rec.note_path ?? "").replace(/\\/g, "/");
      const topic = under(notePath, folders);
      if (folders.length && !topic) continue;
      for (const a of Array.isArray(rec.attempts) ? rec.attempts : []) {
        if (!inWindow(String(a?.at ?? ""))) continue;
        attempts.push({ exercise: notePath, topic, skill: String(a.skill ?? ""), score: Number(a.score) || 0, verdict: String(a.verdict ?? "") });
      }
    }
    const errors = new StudyErrorManager(app.root)
      .errors()
      .filter((e) => inWindow(e.occurred_at))
      .map((e) => ({ e, folder: under(String(e.source_note ?? "").replace(/\\/g, "/"), folders) }))
      .filter((x) => !folders.length || x.folder)
      .map(({ e, folder }) => ({ category: e.category, skill: e.skill, topic: e.topic, folder, repeat: e.repeat_count || 1, description: e.description_en || e.explanation }));
    const marks = new AreaPracticeStore(app.root).load(plan.id) as Record<string, Record<string, string>>;
    const katas = Object.entries(marks).filter(([id]) => id === areaKey || areaKey === "bases" || areaKey === "libre").flatMap(([areaId, days]) => (days?.[date] ? [{ areaId, status: String(days[date]) }] : []));
    const reviewsDone = listReviews(app.root, date).filter((r) => r.kind !== "vocab" && r.last === date && under(r.topicPath, folders)).map((r) => r.path);
    const filesTouched: string[] = [];
    for (const f of assigned.filter((t) => (t.kind ?? "topic") === "topic" && t.folder).map((t) => String(t.folder))) {
      const walk = (dir: string, depth: number): void => {
        if (depth > 3 || filesTouched.length >= 20) return;
        let ents: fs.Dirent[] = [];
        try {
          ents = fs.readdirSync(path.join(app.root, ...dir.split("/")), { withFileTypes: true });
        } catch {
          return;
        }
        for (const e of ents) {
          const rel = `${dir}/${e.name}`;
          if (e.isDirectory()) walk(rel, depth + 1);
          else if (e.name.toLowerCase().endsWith(".md")) {
            try {
              const m = fs.statSync(path.join(app.root, ...rel.split("/"))).mtimeMs;
              if (m >= from && m <= to) filesTouched.push(rel);
            } catch {
              /* ya no está */
            }
          }
        }
      };
      walk(f, 0);
    }
    return { attempts, errors, katas, reviewsDone, filesTouched };
  }

  /** Recalcula las notas derivadas (puntos débiles y la semana) y aplica los 90 días: el detalle caduca, el agregado semanal queda. */
  function refreshNotes(plan: Plan, st: SessionRecordStore, touchedDate: string): void {
    let records = st.list();
    const gone = expiredRecords(records, today());
    const pruned = new Set(gone.map((r) => isoWeekOf(r.date)));
    if (gone.length) {
      for (const w of pruned) {
        const agg = weekAggregate(w, records);
        st.saveWeek(agg);
        writeNote(`${noteDir(plan)}/semana-${w}.md`, renderWeekMarkdown(agg));
      }
      for (const r of gone) {
        st.remove(r);
        try {
          fs.rmSync(path.join(app.root, ...sessionNoteRel(spaceOf(plan), r).split("/")), { force: true });
        } catch {
          /* ya no estaba */
        }
      }
      records = st.list();
    }
    // la semana de una sesión que ya caducó conserva su resumen: no se reescribe con lo que queda (nada)
    const week = isoWeekOf(touchedDate);
    if (!pruned.has(week)) writeNote(`${noteDir(plan)}/semana-${week}.md`, renderWeekMarkdown(weekAggregate(week, records)));
    writeNote(`${noteDir(plan)}/puntos-debiles.md`, renderWeakPointsMarkdown(masteryByTopic(records), patternsOf(records, { today: today() }), today()));
  }

  function overdueOf(plan: Plan): Array<{ folder: string; title: string; inDays: number }> {
    const topics = allTopics(plan);
    return listReviews(app.root, today())
      .filter((r) => r.kind !== "vocab")
      .map((r) => ({ r, t: topics.find((x) => r.topicPath === x.folder || r.topicPath.startsWith(`${x.folder}/`)) }))
      .filter((x) => !!x.t)
      .map(({ r, t }) => ({ folder: t!.folder, title: t!.title, inDays: r.inDays }));
  }

  const proposalsView = (st: SessionRecordStore, records: ReadonlyArray<SessionRecord>) =>
    st.proposals().proposals.map((p) => ({ ...p, followUp: followUpOf(p, records, today()) }));

  const SYSTEM =
    "Eres el Mentor de estudio de una persona. Recibes sus REGISTROS de sesiones (qué asignó a cada bloque, cómo quedó, dudas, errores, comprensión) y el " +
    "dominio calculado por tema. Propones cambios PEQUEÑOS al plan, solo los que tengan evidencia en esos registros. Responde SOLO con un objeto JSON: " +
    '{"proposals":[{"kind":"reinforce"|"bridge_note"|"move_review"|"optional"|"lighten","folder":string (carpeta EXACTA de un tema de la lista; vacía en "lighten"),' +
    '"skill":string (opcional, solo en reinforce),"title":string (corto, en español),"why":string (una frase con el dato que lo demuestra),"recordIds":string[] (ids de sesiones de la lista)}]}. ' +
    "reinforce = ejercicios/nota para un error que se repite; bridge_note = nota corta para una duda que no se resuelve; move_review = adelantar el repaso; " +
    "optional = mover un tema a opcional si no aporta; lighten = bajar la carga si no llega. Máximo 6 propuestas. Nada que no esté respaldado por los registros.";

  function digest(plan: Plan, records: ReadonlyArray<SessionRecord>, patterns: ReadonlyArray<Pattern>): string {
    const m = masteryByTopic(records).slice(0, 15);
    const L: string[] = [`Plan: ${plan.name ?? plan.id} (${plan.start} a ${plan.end}). Hoy: ${today()}.`, "", "Dominio por tema (los más flojos primero):"];
    for (const x of m) L.push(`- ${x.title} [${x.folder}] dominio ${x.mastery}%, ${x.sessions} sesiones (${x.openSessions} a medias), nota media ${x.avgScore ?? "—"}, ${x.errors} errores, comprensión ${x.avgUnderstanding ?? "—"}/5`);
    L.push("", "Patrones detectados:");
    if (!patterns.length) L.push("- (ninguno)");
    for (const p of patterns) L.push(`- ${p.kind}: ${p.title} — ${p.detail} [sesiones: ${p.recordIds.join(", ") || "—"}]`);
    L.push("", "Últimas sesiones:");
    for (const r of records.slice(0, 10)) {
      const a = r.assessment;
      L.push(`- ${r.id} · ${r.date} · ${r.areaName} · ${r.minutes} min · ${r.assigned.map((t) => `${t.title} (${t.status})`).join(", ") || "libre"}${a ? ` · comprensión ${a.understanding}/5 concentración ${a.focus}/5` : ""}${a?.doubt ? ` · duda: ${a.doubt}` : ""}${a?.errors ? ` · errores: ${a.errors}` : ""}`);
    }
    return L.join("\n");
  }

  function jsonOf(text: string): unknown {
    const s = String(text ?? "").replace(/```[a-z]*\n?|```/gi, "");
    const a = s.indexOf("{");
    const b = s.lastIndexOf("}");
    if (a < 0 || b <= a) return null;
    try {
      return JSON.parse(s.slice(a, b + 1));
    } catch {
      return null;
    }
  }

  /** Valida lo que devuelve la IA: tipos conocidos, temas que existen, sesiones citadas que existen. Lo demás se descarta. */
  function validateAi(raw: unknown, plan: Plan, records: ReadonlyArray<SessionRecord>, createdAt: string): Proposal[] {
    const list = (raw && typeof raw === "object" ? (raw as any).proposals : null) as unknown;
    if (!Array.isArray(list)) return [];
    const folders = new Set(allTopics(plan).map((t) => t.folder));
    const titleOf = new Map(allTopics(plan).map((t) => [t.folder, t.title] as const));
    const out = new Map<string, Proposal>();
    for (const x of list.slice(0, 12)) {
      const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
      const kind = KINDS.find((k) => k === o.kind);
      const folder = String(o.folder ?? "");
      if (!kind || (kind !== "lighten" && !folders.has(folder)) || (kind === "lighten" && folder)) continue;
      const skill = String(o.skill ?? "").slice(0, 60);
      const ids = (Array.isArray(o.recordIds) ? o.recordIds : []).map(String).filter((id) => records.some((r) => r.id === id));
      if (kind !== "lighten" && !ids.length) continue;
      const id = proposalId(kind, folder, kind === "reinforce" ? skill : "");
      if (out.has(id)) continue;
      out.set(id, {
        id, kind, folder,
        title: String(o.title ?? "").replace(/\s+/g, " ").trim().slice(0, 120) || `${kind} ${titleOf.get(folder) ?? ""}`.trim(),
        why: String(o.why ?? "").replace(/\s+/g, " ").trim().slice(0, 300),
        evidence: ids.slice(0, 4).map((rid) => { const r = records.find((q) => q.id === rid)!; return { recordId: rid, date: r.date, note: r.assessment?.errors || r.assessment?.doubt || `${r.minutes} min` }; }),
        cost: COST[kind], ...(kind === "reinforce" && skill ? { skill } : {}), status: "open", source: "ai", createdAt, needsConfirmation: true,
      });
      if (out.size >= 6) break;
    }
    return [...out.values()];
  }

  return {
    mentor_record_save(opts: unknown) {
      const o = (opts && typeof opts === "object" ? opts : {}) as Record<string, any>;
      const plan = planOf(o);
      const areaKey = String(o.areaKey ?? "").slice(0, 60);
      const date = String(o.date ?? "");
      if (!DATE_RE.test(date)) throw new ApiError("La fecha de la sesión no es válida.");
      const minutes = Math.round(Number(o.minutes));
      const startedAt = Number(o.startedAt);
      const assigned = Array.isArray(o.assigned) ? o.assigned : [];
      const st = new SessionRecordStore(app.root, plan.id);
      const id = o.assessmentId ? `r-${String(o.assessmentId).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40)}` : `r-${date.replace(/-/g, "")}-${randomUUID().slice(0, 8)}`;
      // reintentar el guardado de la misma evaluación no duplica la sesión
      const dup = st.has(id, date) ? st.load(id, date) : null;
      if (dup) return { record: dup, rel: sessionNoteRel(spaceOf(plan), dup), duplicate: true };
      const sub = plan.subplans.find((s) => areaKeyOf(s) === areaKey);
      const areaName = String(o.areaName ?? "").trim() || sub?.area || (areaKey === "bases" ? "Bases" : areaKey === "libre" ? "Sesión libre" : areaKey);
      const ev = Number.isFinite(startedAt) && startedAt > 0 ? evidenceFor(plan, areaKey, date, startedAt, minutes, assigned) : { attempts: [], errors: [], katas: [], reviewsDone: [], filesTouched: [] };
      const record = buildSessionRecord({
        id, planId: plan.id, areaKey, areaName, date, startedAtMs: startedAt, minutes, mode: String(o.mode ?? "timer"), assigned, assessment: o.assessment ?? null,
        attempts: ev.attempts, errors: ev.errors, katas: ev.katas, reviewsDone: ev.reviewsDone, filesTouched: ev.filesTouched, now: now(),
      });
      if (!record) throw new ApiError("La sesión no es válida: indica el área, el día y al menos 1 minuto.");
      st.save(record);
      const rel = sessionNoteRel(spaceOf(plan), record);
      writeNote(rel, renderSessionMarkdown(record));
      refreshNotes(plan, st, date);
      return { record, rel, duplicate: false };
    },

    mentor_records_list(opts: unknown) {
      const plan = planOf(opts);
      const st = new SessionRecordStore(app.root, plan.id);
      const records = st.list();
      const patterns = patternsOf(records, { today: today(), overdueReviews: overdueOf(plan) });
      const file = st.proposals();
      return {
        records: records.slice(0, 300),
        overview: { mastery: masteryByTopic(records).slice(0, 30), patterns, weeks: st.weeks().slice(0, 26) },
        proposals: proposalsView(st, records),
        lastReviewAt: file.lastReviewAt,
        space: spaceOf(plan),
        noteDir: noteDir(plan),
        retentionDays: RECORD_RETENTION_DAYS,
        aiConfigured: aiOn(),
      };
    },

    async mentor_records_rethink(opts: unknown) {
      const o = (opts && typeof opts === "object" ? opts : {}) as Record<string, any>;
      const plan = planOf(o);
      const st = new SessionRecordStore(app.root, plan.id);
      const records = st.list();
      const at = now();
      if (!records.length) return { proposals: proposalsView(st, records), source: "rules" as const, note: "Aún no hay sesiones registradas: termina un bloque de estudio y rellena su registro para que el Mentor tenga de dónde aprender." };
      const patterns = patternsOf(records, { today: today(), overdueReviews: overdueOf(plan) });
      const byRules = proposalsFromPatterns(patterns, records, at).filter((p) => p.kind === "lighten" || allTopics(plan).some((t) => t.folder === p.folder));
      let fresh: Proposal[] = byRules;
      let source: "ai" | "rules" = "rules";
      let note = "";
      if (o.noAi === true) note = "Sin IA por petición tuya: propuestas por reglas sobre tus registros.";
      else if (!aiOn()) note = "La IA no está configurada: propuestas por reglas sobre tus registros.";
      else {
        try {
          const text = await send([{ role: "system", content: SYSTEM }, { role: "user", content: digest(plan, records, patterns) }], 150_000);
          const ai = validateAi(jsonOf(text), plan, records, at);
          if (ai.length) {
            fresh = [...ai, ...byRules.filter((p) => !ai.some((a) => a.id === p.id))].slice(0, 8);
            source = "ai";
          } else note = "La IA no devolvió propuestas válidas: se muestran las de reglas.";
        } catch (e) {
          note = `La IA falló (${e instanceof Error ? e.message : String(e)}`.slice(0, 160) + "): se muestran las propuestas por reglas.";
        }
      }
      // lo ya decidido (descartado o aplicado) se conserva; lo abierto que ya no se sostiene se quita
      const prev = st.proposals().proposals;
      const kept = prev.filter((p) => p.status !== "open");
      const merged = [...kept, ...fresh.filter((p) => !kept.some((k) => k.id === p.id)).map((p) => prev.find((x) => x.id === p.id && x.status === "open") ?? p)];
      st.saveProposals({ version: 1, lastReviewAt: at, source, proposals: merged });
      return { proposals: proposalsView(st, records), source, ...(note ? { note } : {}) };
    },

    mentor_proposal_set(opts: unknown) {
      const o = (opts && typeof opts === "object" ? opts : {}) as Record<string, any>;
      const plan = planOf(o);
      const st = new SessionRecordStore(app.root, plan.id);
      const file = st.proposals();
      const p = file.proposals.find((x) => x.id === String(o.proposalId ?? ""));
      if (!p) throw new ApiError("Esa propuesta ya no existe: vuelve a repensar el plan.");
      const status = o.status === "dismissed" || o.status === "applied" ? o.status : "open";
      const records = st.list();
      st.saveProposals({
        ...file,
        proposals: file.proposals.map((x) => {
          if (x.id !== p.id) return x;
          if (status === "applied") return { ...x, status, appliedAt: now(), baseline: baselineFor(x.folder, records) };
          const { appliedAt: _a, baseline: _b, ...rest } = x;
          void _a; void _b;
          return { ...rest, status };
        }),
      });
      return { proposals: proposalsView(st, records) };
    },

    async mentor_proposal_apply(opts: unknown) {
      const o = (opts && typeof opts === "object" ? opts : {}) as Record<string, any>;
      const plan = planOf(o);
      const st = new SessionRecordStore(app.root, plan.id);
      const p = st.proposals().proposals.find((x) => x.id === String(o.proposalId ?? ""));
      if (!p) throw new ApiError("Esa propuesta ya no existe: vuelve a repensar el plan.");
      if (p.kind !== "reinforce" && p.kind !== "bridge_note") throw new ApiError("Esta propuesta no crea notas: se aplica desde el plan.");
      if (!allTopics(plan).some((t) => t.folder === p.folder)) throw new ApiError("El tema de la propuesta ya no está en el plan.");
      const abs = (rel: string): string => path.join(app.root, ...rel.split("/"));
      const base = `${p.folder}/_${p.kind === "reinforce" ? "Refuerzo" : "Nota puente"} — ${slug(nameOf(p.folder))}`;
      let rel = `${base}.md`;
      for (let n = 2; fs.existsSync(abs(rel)); n++) rel = `${base} (${n}).md`;
      if (o.preview === true) return { rel, created: false, source: aiOn() ? ("ai" as const) : ("rules" as const), aiCalls: aiOn() ? p.cost.aiCalls : 0 };
      const records = st.list();
      let text = renderRefuerzoTemplate(p, records, today());
      let source: "ai" | "rules" = "rules";
      if (aiOn() && o.noAi !== true) {
        try {
          const evidence = text.split("## Qué falló")[1]?.split("## Para repasar")[0]?.trim() ?? "";
          const reply = await send(
            [
              { role: "system", content: `Eres un tutor. Escribes una ${p.kind === "reinforce" ? "nota de refuerzo" : "nota puente corta"} en español, en Markdown, para que el estudiante supere lo que le falló. Estructura: «## Qué falló» (breve), «## Explicación» (clara, con un ejemplo concreto), «## Autoevaluación» (3 preguntas sin respuesta). Sin introducción ni despedida. No inventes datos sobre el estudiante.` },
              { role: "user", content: `Tema: ${nameOf(p.folder)}${p.skill ? `\nSkill: ${p.skill}` : ""}\nLo que falló y las dudas registradas:\n${evidence}` },
            ],
            120_000,
          );
          const body = fence(reply);
          if (body.length >= 200 && body.length <= 8000) {
            text = text.split("## Qué falló")[0] + `${body}\n\n## Para repasar\n- Nota del tema: [[${nameOf(p.folder)}]]\n- Práctica: [[${nameOf(p.folder)}.practica]]\n`;
            source = "ai";
          }
        } catch {
          /* queda la nota por reglas */
        }
      }
      if (fs.existsSync(abs(rel))) throw new ApiError("Ese archivo apareció mientras tanto: no se sobrescribe.");
      writeNote(rel, text);
      const file = st.proposals();
      st.saveProposals({ ...file, proposals: file.proposals.map((x) => (x.id === p.id ? { ...x, status: "applied" as const, appliedAt: now(), baseline: baselineFor(x.folder, records) } : x)) });
      return { rel, created: true, source };
    },
  };
}
