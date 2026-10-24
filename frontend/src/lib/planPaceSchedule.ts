// Mentor — Agenda: la CAPA DE RITMO Y EXTRAS sobre el reparto automático (ver `planPace.ts` para el modelo).
//
// Módulo PURO y compartido. `buildSchedule` (planSchedule.ts) lo aplica en tres pasos:
//   1. `planOverlay(plan)`: decide qué temas coloca esta capa por su cuenta y devuelve el plan SIN ellos (el reparto base les deja su
//      capacidad a los demás temas).
//   2. el reparto base de siempre sobre ese plan reducido.
//   3. `applyOverlay(...)`: coloca encima los temas del RITMO (exactamente `perDay` por día de estudio por área, nunca menos de `minPerDay`
//      mientras queden en la ruta; SIEMPRE en el orden de la ruta) y los EXTRA, y añade la práctica extra.
//
// Reglas del ritmo:
//  · Desde «hoy» (`asOf`; sin él, desde el inicio del plan) cada día de estudio recibe el siguiente tramo de la ruta del área (sus temas
//    pendientes sin los fundamentos, que siguen su propio reparto). Nunca se coloca un tema posterior antes de uno anterior sin terminar.
//  · Si en el último día de estudio aún quedan temas, se amontonan ahí marcados `overflow` (no se descarta nada); el aviso de constancia
//    (`planCatchUp`) dice el ritmo que hace falta.
//  · Solo `minPerDay` (sin `perDay`): cada día recibe lo que daría el reparto automático, pero nunca menos del mínimo.
//  · El tiempo del día sigue a los temas colocados (minutos estimados de cada uno).

import type { BlockItem, DayBlock } from "./planDayFocus.js";
import { EXTRA_AREA_LABEL, EXTRA_PRACTICE_MINUTES, EXTRA_SUBPLAN_ID, EXTRA_TOPIC_MINUTES, paceFor, type ExtraTopic } from "./planPace.js";
import { topicProjectId } from "./planTopicProject.js";
import type { DayTopic, PlanSchedule, ScheduleDay, SchedulePlan, ScheduleSubplan, ScheduleTopic } from "./planSchedule.js";

export interface PacedArea {
  sub: ScheduleSubplan;
  /** temas pendientes de la ruta del área, en orden */
  queue: ScheduleTopic[];
  perDay?: number;
  minPerDay?: number;
}

export interface PaceOverlay {
  /** el plan tal cual entra */
  plan: SchedulePlan;
  /** el plan sin los temas que coloca la capa (para el reparto base) */
  reduced: SchedulePlan;
  paced: PacedArea[];
  /** temas de la ruta que el estudiante añadió a un día (primer acierto por carpeta) */
  extraRoute: Map<string, { sub: ScheduleSubplan; topic: ScheduleTopic }>;
}

const keyOf = (subId: string, folder: string): string => `${subId}|${folder}`;
const isBasesTopic = (sub: ScheduleSubplan, t: ScheduleTopic): boolean => !!t.group && (sub.groups ?? []).some((g) => g.id === t.group && g.kind === "bases");

/** El «hoy» válido del reparto por avance (misma regla que `buildSchedule`). */
export const validAsOf = (plan: Pick<SchedulePlan, "asOf" | "start" | "end">): string | undefined => (plan.asOf && plan.asOf > plan.start && plan.asOf <= plan.end ? plan.asOf : undefined);

export function planOverlay(plan: SchedulePlan): PaceOverlay | null {
  const extras = plan.extraTopics ?? [];
  const practice = plan.extraPractice ?? [];
  const paceOn = !!plan.pace;
  if (!paceOn && !extras.length && !practice.length) return null;
  const extraRoute = new Map<string, { sub: ScheduleSubplan; topic: ScheduleTopic }>();
  for (const e of extras) {
    if (extraRoute.has(e.folder)) continue;
    for (const sub of plan.subplans) {
      const topic = sub.topics.find((t) => t.folder === e.folder && !t.completedAt);
      if (topic) {
        extraRoute.set(e.folder, { sub, topic });
        break;
      }
    }
  }
  const taken = new Set([...extraRoute.values()].map((x) => keyOf(x.sub.id, x.topic.folder)));
  const paced: PacedArea[] = [];
  if (paceOn) {
    for (const sub of plan.subplans) {
      const eff = paceFor(plan.pace, sub.id);
      if (!eff.perDay && !eff.minPerDay) continue;
      const queue = sub.topics.filter((t) => !t.completedAt && !isBasesTopic(sub, t) && !taken.has(keyOf(sub.id, t.folder)));
      if (!queue.length) continue;
      paced.push({ sub, queue, ...(eff.perDay ? { perDay: eff.perDay } : {}), ...(eff.minPerDay ? { minPerDay: eff.minPerDay } : {}) });
      for (const t of queue) taken.add(keyOf(sub.id, t.folder));
    }
  }
  if (!paced.length && !extras.length && !practice.length) return null;
  const reduced: SchedulePlan = taken.size ? { ...plan, subplans: plan.subplans.map((s) => ({ ...s, topics: s.topics.filter((t) => !taken.has(keyOf(s.id, t.folder))) })) } : plan;
  return { plan, reduced, paced, extraRoute };
}

/** El plan SOLO sin los temas de la ruta que se añadieron como extra (para medir el reparto automático que daría el mínimo diario). */
export function planWithoutExtraRoute(ov: PaceOverlay): SchedulePlan {
  const drop = new Set([...ov.extraRoute.values()].map((x) => keyOf(x.sub.id, x.topic.folder)));
  return drop.size ? { ...ov.plan, subplans: ov.plan.subplans.map((s) => ({ ...s, topics: s.topics.filter((t) => !drop.has(keyOf(s.id, t.folder))) })) } : ov.plan;
}

export interface ApplyCtx {
  asOf?: string;
  /** temas distintos que el reparto automático daría a un área un día (solo para el mínimo sin `perDay`) */
  auto?: (subplanId: string, date: string) => number;
}

export interface ApplyResult {
  /** días con temas del ritmo (su capacidad sigue a los temas) */
  pacedDates: Set<string>;
}

const shortFolderTitle = (folder: string): string => (folder.split("/").pop() ?? folder).replace(/^[\d.\s_-]+/, "").trim() || folder;

interface Placed {
  sub: { id: string; area: string; areaId?: string };
  items: BlockItem[];
}

export function applyOverlay(ov: PaceOverlay, sch: PlanSchedule, ctx: ApplyCtx): ApplyResult {
  const { plan } = ov;
  const days = sch.days;
  const pacedDates = new Set<string>();

  // posición y total de cada tema salen del plan COMPLETO (el reparto base solo vio el plan reducido)
  const position = new Map<string, number>();
  const total = new Map<string, number>();
  for (const s of plan.subplans) {
    total.set(s.id, s.topics.length);
    s.topics.forEach((t, i) => position.set(keyOf(s.id, t.folder), i + 1));
  }
  for (const d of days) {
    for (const t of d.topics) {
      const p = position.get(keyOf(t.subplanId, t.folder));
      if (p !== undefined) {
        t.position = p;
        t.total = total.get(t.subplanId) ?? t.total;
      }
    }
  }

  const placedBy = new Map<string, Map<string, Placed>>(); // fecha → subplan → elementos de bloque
  const studyFrom = ctx.asOf ?? plan.start;
  const studyDays = days.filter((d) => d.study && !d.blocked && d.date >= studyFrom);
  const lastStudy = studyDays.length ? studyDays[studyDays.length - 1]!.date : days.filter((d) => d.study).pop()?.date ?? plan.end;
  const dayByDate = sch.byDate;

  const place = (date: string, sub: { id: string; area: string; areaId?: string; groups?: ScheduleSubplan["groups"] }, topic: { folder: string; title: string; estMinutes: number; group?: string; topicProject?: ScheduleTopic["topicProject"]; completedAt?: string }, o: { extra?: boolean; paced?: boolean; overflow?: boolean; done?: boolean; pos?: number }): void => {
    const day = dayByDate.get(date);
    if (!day) return;
    const minutes = Math.max(1, Math.round(topic.estMinutes) || 1);
    const pos = o.pos ?? position.get(keyOf(sub.id, topic.folder)) ?? 1;
    const tot = total.get(sub.id) ?? 1;
    const groupTitle = topic.group ? (sub.groups ?? []).find((g) => g.id === topic.group)?.title ?? topic.group : undefined;
    const dt: DayTopic = {
      subplanId: sub.id,
      ...(sub.areaId ? { areaId: sub.areaId } : {}),
      area: sub.area,
      folder: topic.folder,
      title: topic.title,
      minutes,
      ...(topic.group ? { group: topic.group, groupTitle: groupTitle! } : {}),
      part: 1,
      parts: 1,
      position: pos,
      total: tot,
      done: !!o.done,
      ...(o.overflow ? { overflow: true } : {}),
      ...(o.extra ? { extra: true } : {}),
      ...(o.paced ? { paced: true } : {}),
    };
    day.topics.push(dt);
    if (o.paced) pacedDates.add(date);
    if (!o.done) {
      const bucket = placedBy.get(date) ?? new Map<string, Placed>();
      const entry = bucket.get(sub.id) ?? { sub: { id: sub.id, area: sub.area, ...(sub.areaId ? { areaId: sub.areaId } : {}) }, items: [] };
      entry.items.push({
        subplanId: sub.id,
        area: sub.area,
        ...(sub.areaId ? { areaId: sub.areaId } : {}),
        folder: topic.folder,
        title: topic.title,
        minutes,
        part: 1,
        parts: 1,
        ...(topic.group ? { group: topic.group, groupTitle: groupTitle! } : {}),
        ...(o.extra ? { extra: true } : {}),
      });
      bucket.set(sub.id, entry);
      placedBy.set(date, bucket);
      // proyecto de aplicación del tema (planes por áreas): el día en que se completa, o el siguiente con tiempo de proyecto
      if (plan.structure === "areas" && topic.topicProject && !topic.completedAt && !o.overflow) {
        let target: ScheduleDay | undefined = day;
        if (!target.projectMinutes) target = days.find((d) => d.study && d.date > date && d.projectMinutes) ?? target;
        (target.topicProjects ??= []).push({ id: topicProjectId(topic.folder), subplanId: sub.id, ...(sub.areaId ? { areaId: sub.areaId } : {}), area: sub.area, folder: topic.folder, title: topic.title, project: topic.topicProject, minutes: 0 });
        const each = target.projectMinutes ? Math.max(10, Math.round((target.projectMinutes * 0.6) / target.topicProjects.length)) : 0;
        for (const tp of target.topicProjects) tp.minutes = each;
      }
    }
  };

  // ── ritmo: el siguiente tramo de la ruta de cada área, cada día de estudio ──
  for (const p of ov.paced) {
    const queue = [...p.queue];
    for (const d of studyDays) {
      if (!queue.length) break;
      const isLast = d.date === lastStudy;
      const want = p.perDay ?? Math.max(p.minPerDay ?? 0, ctx.auto ? Math.min(ctx.auto(p.sub.id, d.date), queue.length) : 0);
      const n = isLast ? queue.length : Math.min(queue.length, Math.max(1, want));
      queue.splice(0, n).forEach((t, i) => {
        place(d.date, p.sub, t, { paced: true, ...(isLast && i >= want ? { overflow: true } : {}) });
      });
    }
    // sin ningún día de estudio desde hoy: todo al último día, desbordado
    for (const t of queue.splice(0)) place(lastStudy, p.sub, t, { paced: true, overflow: true });
  }

  // ── temas extra ──
  const subById = new Map(plan.subplans.map((s) => [s.id, s] as const));
  const seen = new Set<string>();
  for (const e of plan.extraTopics ?? []) {
    const key = `${e.date}|${e.folder}`;
    if (seen.has(key) || !dayByDate.has(e.date)) continue;
    seen.add(key);
    placeExtra(e);
  }
  function placeExtra(e: ExtraTopic): void {
    const route = ov.extraRoute.get(e.folder);
    if (route) {
      place(e.date, route.sub, route.topic, { extra: true });
      return;
    }
    // ¿es un tema de la ruta ya completado? Ya está anotado en su día: solo se marca si coincide con la fecha pedida
    for (const sub of plan.subplans) {
      const done = sub.topics.find((t) => t.folder === e.folder && t.completedAt);
      if (!done) continue;
      const when = done.completedAt! < plan.start ? plan.start : done.completedAt! > plan.end ? plan.end : done.completedAt!;
      const hit = dayByDate.get(when)?.topics.find((t) => t.folder === e.folder && t.done);
      if (hit && when === e.date) hit.extra = true;
      return;
    }
    // un tema de la vault que no está en el plan: a su área (si se indicó una que existe) o al cubo «Extra»
    const sub = e.area ? subById.get(e.area) : undefined;
    const target = sub ?? { id: EXTRA_SUBPLAN_ID, area: EXTRA_AREA_LABEL, areaId: EXTRA_SUBPLAN_ID };
    const subTotal = sub ? sub.topics.length : 1;
    place(e.date, { ...target, ...(sub?.groups ? { groups: sub.groups } : {}) }, { folder: e.folder, title: e.title ?? shortFolderTitle(e.folder), estMinutes: e.estMinutes ?? EXTRA_TOPIC_MINUTES }, { extra: true, done: !!e.doneAt, pos: subTotal });
  }

  // ── a los bloques (planes por áreas): la Agenda y la Ejecución leen los temas del día de ahí ──
  if (plan.structure === "areas") {
    for (const [date, bucket] of placedBy) {
      const day = dayByDate.get(date);
      if (!day) continue;
      const blocks = (day.blocks ??= []);
      for (const { sub, items } of bucket.values()) {
        const isExtra = sub.id === EXTRA_SUBPLAN_ID;
        let b: DayBlock | undefined = isExtra ? blocks.find((x) => x.subplanId === EXTRA_SUBPLAN_ID) : blocks.filter((x) => x.kind === "theory" && !x.daily && x.subplanId === sub.id && x.status !== "omitted").sort((x, y) => Number(y.status === "topic") - Number(x.status === "topic"))[0];
        if (!b) {
          b = { id: isExtra ? "extra-topics" : `pace-${sub.id}`, kind: "theory", label: isExtra ? "Temas extra" : `Temas de ${sub.area}`, status: "topic", minutes: 0, items: [], subplanId: sub.id, area: sub.area, ...(sub.areaId ? { areaId: sub.areaId } : {}) };
          blocks.push(b);
        }
        b.items.push(...items);
        b.status = "topic";
        delete b.note;
        b.minutes = b.items.reduce((n, i) => n + i.minutes, 0);
      }
      day.reviewMinutes = blocks.filter((x) => x.status === "review").reduce((n, x) => n + x.minutes, 0);
    }
  }

  // ── práctica extra del día ──
  for (const x of plan.extraPractice ?? []) {
    const day = dayByDate.get(x.date);
    if (!day) continue;
    const minutes = x.minutes ?? EXTRA_PRACTICE_MINUTES;
    (day.practice.extra ??= []).push({ ...x, minutes });
    day.practiceMinutes += minutes;
  }
  return { pacedDates };
}
