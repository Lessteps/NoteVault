// Mentor — Sistema de práctica por área (ver `lib/areaPracticeSystem.ts` y docs/VAULT_FORMAT.md, «Sistema de práctica por área»).
//
//  - mentor_area_practice({ id }) -> { areas, ppReady, today }: por área del plan, su sistema (habilidades, kata de hoy, seguimiento de la semana,
//    racha, proyecto de la semana, proyectos por semana y mensual) con el estado DERIVADO del ledger y de las marcas manuales. SOLO LEE.
//  - mentor_area_practice_on({ id, date }) -> { items }: la práctica por área que toca en una fecha (un kata por área), para el calendario y la agenda.
//  - mentor_area_kata_open({ id, areaId }) -> { rel, created }: el acceso directo al kata que toca del área. Si su archivo aún no existe lo crea (junto con
//    la estructura mínima del área; NUNCA sobrescribe) y devuelve la ruta para abrirlo. Solo se llama cuando la persona pulsa «Abrir kata».
//  - mentor_area_practice_setup({ id }) -> { created, view }: deja en `programming_practice/` la carpeta de CADA área del plan con su README, su
//    `<área>.practica.md`, sus habilidades y la estructura de katas y proyectos. Nunca sobrescribe y no crea katas (esos salen al abrirlos).
//  - mentor_area_kata_mark({ id, areaId, date, status }) -> { areas }: la persona marca un kata como hecho / saltado (o lo quita con `status: null`).
//    Escribe SOLO `.notevault/mentor/area-practice/<plan>.json` (datos de la app), nunca notas de la vault.

import * as path from "node:path";
import { ApiError } from "../../core/errors.js";
import { createAreaPracticeFolders } from "../../core/mentor/areaPracticeFolders.js";
import { AreaPracticeStore, deriveAreaPractice, existingAreaFiles } from "../../core/mentor/areaPracticeState.js";
import { PLAN_ID_RE, PlanStore, type Plan } from "../../core/mentor/plan.js";
import { ppAreaDir } from "../../core/mentor/practiceState.js";
import { loadAllAttempts } from "../../core/practice/ledger.js";
import { areaPracticeFor, isPracticeAreaId, practiceAreasOf } from "../../lib/areaPracticeSystem.js";
import type { AppState } from "../appState.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function mentorAreaPracticeApi(app: AppState, hooks: { today: () => string }) {
  const planOf = (opts: unknown): Plan => {
    const id = String(((opts && typeof opts === "object" ? opts : {}) as Record<string, any>).id ?? "");
    if (!PLAN_ID_RE.test(id)) throw new ApiError("Plan inválido.");
    const plan = new PlanStore(app.root).load(id);
    if (!plan) throw new ApiError("Ese plan ya no existe.");
    return plan;
  };
  const viewOf = (plan: Plan) => {
    const ppDir = ppAreaDir(app.root);
    const areaIds = practiceAreasOf(plan).map((a) => a.areaId);
    return {
      today: hooks.today(),
      ppReady: !!ppDir,
      /** ruta de `programming_practice` en la vault (para abrir un kata: `<ppBase>/<área>/katas/<archivo>`) */
      ppBase: ppDir ? app.rel(ppDir).replace(/\\/g, "/") : "",
      areas: deriveAreaPractice({
        plan,
        today: hooks.today(),
        attempts: loadAllAttempts(app.root),
        marks: new AreaPracticeStore(app.root).load(plan.id),
        existing: existingAreaFiles(ppDir, areaIds),
      }),
    };
  };
  return {
    mentor_area_practice(opts: unknown) {
      return viewOf(planOf(opts));
    },

    mentor_area_practice_on(opts: unknown) {
      const plan = planOf(opts);
      const date = String((opts as Record<string, unknown>)?.date ?? "");
      if (!DATE_RE.test(date)) throw new ApiError("Fecha inválida (AAAA-MM-DD).");
      return { items: areaPracticeFor(plan, date).map((d) => ({ areaId: d.areaId, label: d.label, day: d.day, rel: d.rel, title: d.kata.title, skill: d.kata.skillName, level: d.kata.level, minutes: d.kata.minutes })) };
    },

    mentor_area_practice_setup(opts: unknown) {
      const plan = planOf(opts);
      const ppDir = ppAreaDir(app.root);
      if (!ppDir) throw new ApiError("No se encontró la carpeta programming_practice en tu vault.");
      const areas = practiceAreasOf(plan).map((a) => a.areaId);
      const r = createAreaPracticeFolders({ ppDir, areas });
      return { created: r.created, folders: r.folders, view: viewOf(plan) };
    },

    mentor_area_kata_open(opts: unknown) {
      const o = (opts && typeof opts === "object" ? opts : {}) as Record<string, any>;
      const plan = planOf(o);
      const areaId = String(o.areaId ?? "");
      if (!isPracticeAreaId(areaId) || !practiceAreasOf(plan).some((a) => a.areaId === areaId)) throw new ApiError("Esa área no está en el plan.");
      const ppDir = ppAreaDir(app.root);
      if (!ppDir) throw new ApiError("No se encontró la carpeta programming_practice en tu vault.");
      const area = viewOf(plan).areas.find((a) => a.areaId === areaId);
      if (!area) throw new ApiError("Esa área no está en el plan.");
      // un kata concreto (`date`: de los atrasados) o, sin fecha, el de hoy / el siguiente
      const wanted = o.date === undefined || o.date === "" ? "" : String(o.date);
      if (wanted && !DATE_RE.test(wanted)) throw new ApiError("Fecha inválida (AAAA-MM-DD).");
      const target = wanted
        ? area.kata.due.find((d) => d.date === wanted) ?? (area.kata.next?.date === wanted ? { day: area.kata.next.kata.day, date: wanted, rel: area.kata.next.rel } : undefined)
        : area.kata.next
          ? { day: area.kata.next.kata.day, date: area.kata.next.date, rel: area.kata.next.rel }
          : undefined;
      if (!target) throw new ApiError("Ese día no tiene kata en esta área.");
      const r = createAreaPracticeFolders({ ppDir, areas: [areaId], katasPerArea: 1, fromDay: target.day, levels: { [areaId]: area.level } });
      const base = app.rel(ppDir).split(path.sep).join("/");
      const rel = `${base}/${target.rel}`;
      if (r.failed.length && !r.created.length && !r.skipped.length) throw new ApiError(`No se pudo crear el kata: ${r.failed[0]!.reason}`);
      return { rel, created: r.created.includes(target.rel), date: target.date };
    },

    mentor_area_kata_mark(opts: unknown) {
      const o = (opts && typeof opts === "object" ? opts : {}) as Record<string, any>;
      const plan = planOf(o);
      const areaId = String(o.areaId ?? "");
      const date = String(o.date ?? "");
      if (!isPracticeAreaId(areaId) || !practiceAreasOf(plan).some((a) => a.areaId === areaId)) throw new ApiError("Esa área no está en el plan.");
      if (!DATE_RE.test(date) || date > hooks.today()) throw new ApiError("Solo se pueden marcar katas de hoy o de días pasados.");
      const status = o.status === "done" || o.status === "skipped" ? o.status : o.status === null || o.status === undefined ? null : undefined;
      if (status === undefined) throw new ApiError("Estado inválido.");
      new AreaPracticeStore(app.root).mark(plan.id, areaId, date, status);
      return viewOf(plan);
    },
  };
}
