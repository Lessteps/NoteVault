// Mentor — Ritmo diario y extras del día: lo que el estudiante ELIGE a mano sobre el reparto automático del plan.
//
//  · RITMO (`Plan.pace`): cuántos TEMAS estudiar cada día de estudio, por área (`perDay`), y un mínimo diario (`minPerDay`). Sin ritmo manda el
//    reparto automático por minutos de siempre. Un valor por ÁREA (`areas[subplanId]`) gana sobre el global campo a campo; `0` en el valor de
//    un área = «automático» para ese campo aunque haya un global.
//  · TEMAS EXTRA (`Plan.extraTopics`): temas que el estudiante ADELANTA a un día (los siguientes de la ruta; la API admite además un tema de la vault
//    fuera del plan, que la interfaz ya no ofrece). Se cuentan en el día y no alteran el orden estricto del resto.
//  · PRÁCTICA EXTRA (`Plan.extraPractice`): elementos de práctica diaria añadidos a mano (los katas y ejercicios YA PLANEADOS que se adelantan; la API sigue aceptando texto libre).
//
// Módulo PURO y compartido (núcleo, API y renderer): sin node:* ni DOM. El reparto que usa todo esto está en `planPaceSchedule.ts`.

export const PACE_MAX = 20;
/** el «área» de los temas extra que no pertenecen a ningún área del plan */
export const EXTRA_SUBPLAN_ID = "extra";
export const EXTRA_AREA_LABEL = "Extra";
/** minutos de un tema extra de la vault cuyo tiempo no se conoce, y de un elemento de práctica extra sin minutos */
export const EXTRA_TOPIC_MINUTES = 30;
export const EXTRA_PRACTICE_MINUTES = 15;
export const MAX_EXTRA_TOPICS = 500;
export const MAX_EXTRA_PRACTICE = 500;

export interface PaceSetting {
  /** temas a estudiar cada día de estudio (0 / ausente = automático) */
  perDay?: number;
  /** mínimo de temas por día de estudio mientras queden en la ruta (0 / ausente = sin mínimo) */
  minPerDay?: number;
}
export interface DailyPace extends PaceSetting {
  /** excepciones por área (id del subplan): sus campos mandan sobre el global */
  areas?: Record<string, PaceSetting>;
}

export interface ExtraTopic {
  /** AAAA-MM-DD */
  date: string;
  folder: string;
  /** subplan al que atribuirlo cuando el tema no está en el plan; ausente = cubo «Extra» */
  area?: string;
  addedAt: string;
  source: "manual";
  /** título y minutos conocidos al añadirlo (un tema de la vault no está en el plan: el reparto no puede leerlos) */
  title?: string;
  estMinutes?: number;
  /** cuándo se completó (lo anota el avance real); los extra de la vault no tienen otra forma de saberlo */
  doneAt?: string;
}

export type ExtraPracticeKind = "kata" | "exercise" | "custom";
export const EXTRA_PRACTICE_KINDS: readonly ExtraPracticeKind[] = ["kata", "exercise", "custom"];
export interface ExtraPractice {
  id: string;
  date: string;
  /** subplan al que pertenece (ausente = práctica general del día) */
  area?: string;
  title: string;
  minutes?: number;
  note?: string;
  kind: ExtraPracticeKind;
  done?: boolean;
  /** carpeta del tema cuyo ejercicio se practica (opcional) */
  folder?: string;
  /** archivo de la vault al que está ligada (un ejercicio de un tema: su nota; un kata: su archivo) */
  rel?: string;
  /** kata planeado del área que se adelantó: la fecha en que le tocaba (con `area` basta para abrirlo) */
  kataDate?: string;
}

const DATE_OK = /^\d{4}-\d{2}-\d{2}$/;
export const isIsoDate = (s: unknown): s is string => typeof s === "string" && DATE_OK.test(s) && !Number.isNaN(Date.parse(s));
const oneLine = (v: unknown, max: number): string => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

// ── Validación estricta (la API) ────────────────────────────────────────

function intField(raw: unknown, label: string): number | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > PACE_MAX) throw new Error(`«${label}» debe ser un número entero de 0 a ${PACE_MAX}.`);
  return n;
}

function parseSetting(raw: unknown, where: string, keepZero: boolean): PaceSetting {
  if (raw !== undefined && raw !== null && (typeof raw !== "object" || Array.isArray(raw))) throw new Error(`El ritmo${where} no es válido.`);
  const o = (raw ?? {}) as Record<string, unknown>;
  const perDay = intField(o.perDay, "Temas por día");
  const minPerDay = intField(o.minPerDay, "Mínimo diario");
  if (perDay && minPerDay && minPerDay > perDay) throw new Error(`El mínimo diario (${minPerDay}) no puede superar los temas por día (${perDay})${where}.`);
  return {
    ...(perDay !== undefined && (perDay > 0 || keepZero) ? { perDay } : {}),
    ...(minPerDay !== undefined && (minPerDay > 0 || keepZero) ? { minPerDay } : {}),
  };
}

/**
 * Valida y normaliza un ritmo (lanza `Error` con un mensaje claro si no es válido). `areaIds` = ids de subplan permitidos. Devuelve `undefined` si no
 * queda nada (= volver al reparto automático). Enteros 0..20; el mínimo no puede superar los temas por día, ni en el global ni, ya mezclado con el
 * global, en cada área.
 */
export function parsePace(raw: unknown, areaIds?: readonly string[]): DailyPace | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "object" || Array.isArray(raw)) throw new Error("El ritmo diario no es válido.");
  const o = raw as Record<string, unknown>;
  const global = parseSetting(o, "", false);
  const areas: Record<string, PaceSetting> = {};
  if (o.areas !== undefined && o.areas !== null) {
    if (typeof o.areas !== "object" || Array.isArray(o.areas)) throw new Error("Los ritmos por área no son válidos.");
    for (const [id, v] of Object.entries(o.areas as Record<string, unknown>)) {
      if (areaIds && !areaIds.includes(id)) throw new Error("Ese área ya no existe en el plan.");
      const s = parseSetting(v, ` de esa área`, true);
      // el área y el global se mezclan campo a campo: el resultado tampoco puede tener el mínimo por encima de los temas por día
      const eff = mergeSetting(global, s);
      if (eff.perDay && eff.minPerDay && eff.minPerDay > eff.perDay) throw new Error(`El mínimo diario (${eff.minPerDay}) no puede superar los temas por día (${eff.perDay}) de esa área.`);
      if (s.perDay !== undefined || s.minPerDay !== undefined) areas[id] = s;
    }
  }
  const out: DailyPace = { ...global, ...(Object.keys(areas).length ? { areas } : {}) };
  return out.perDay || out.minPerDay || out.areas ? out : undefined;
}

// ── Lectura tolerante (al cargar el plan) ───────────────────────────────

const lenient = (v: unknown): number | undefined => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 0 ? Math.min(PACE_MAX, n) : undefined;
};
function sanitizeSetting(raw: unknown, keepZero: boolean): PaceSetting {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const perDay = lenient(o.perDay);
  let minPerDay = lenient(o.minPerDay);
  if (perDay && minPerDay && minPerDay > perDay) minPerDay = perDay;
  return {
    ...(perDay !== undefined && (perDay > 0 || keepZero) ? { perDay } : {}),
    ...(minPerDay !== undefined && (minPerDay > 0 || keepZero) ? { minPerDay } : {}),
  };
}
/** Un ritmo guardado, saneado sin lanzar (valores fuera de rango se acotan). */
export function sanitizePace(raw: unknown): DailyPace | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const global = sanitizeSetting(o, false);
  const areas: Record<string, PaceSetting> = {};
  if (o.areas && typeof o.areas === "object" && !Array.isArray(o.areas)) {
    for (const [id, v] of Object.entries(o.areas as Record<string, unknown>)) {
      const s = sanitizeSetting(v, true);
      const eff = mergeSetting(global, s);
      if (eff.perDay && eff.minPerDay && eff.minPerDay > eff.perDay) s.minPerDay = eff.perDay;
      if (id && (s.perDay !== undefined || s.minPerDay !== undefined)) areas[String(id).slice(0, 60)] = s;
    }
  }
  const out: DailyPace = { ...global, ...(Object.keys(areas).length ? { areas } : {}) };
  return out.perDay || out.minPerDay || out.areas ? out : undefined;
}

function mergeSetting(global: PaceSetting, area: PaceSetting | undefined): PaceSetting {
  const perDay = area?.perDay !== undefined ? area.perDay : global.perDay;
  const minPerDay = area?.minPerDay !== undefined ? area.minPerDay : global.minPerDay;
  return { ...(perDay ? { perDay } : {}), ...(minPerDay ? { minPerDay } : {}) };
}

/** El ritmo EFECTIVO de un área (subplan): su excepción gana campo a campo sobre el global; `0` = automático. `{}` = reparto automático. */
export function paceFor(pace: DailyPace | undefined, subplanId: string): PaceSetting {
  if (!pace) return {};
  return mergeSetting(pace, pace.areas?.[subplanId]);
}

/** ¿Hay algún ritmo manual en el plan? */
export const hasPace = (pace: DailyPace | undefined): boolean => !!pace && !!(pace.perDay || pace.minPerDay || Object.values(pace.areas ?? {}).some((a) => a.perDay || a.minPerDay));

/** «3 temas al día (mínimo 2)» / «Automático». */
export function paceText(s: PaceSetting): string {
  if (!s.perDay && !s.minPerDay) return "Automático";
  const per = s.perDay ? `${s.perDay} ${s.perDay === 1 ? "tema" : "temas"} al día` : "automático";
  return s.minPerDay ? `${per} (mínimo ${s.minPerDay})` : per;
}

// ── Extras: lectura tolerante ───────────────────────────────────────────

const cleanFolder = (v: unknown): string => String(v ?? "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").trim();

export function sanitizeExtraTopics(raw: unknown): ExtraTopic[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: ExtraTopic[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const folder = cleanFolder(o.folder);
    if (!folder || !isIsoDate(o.date)) continue;
    const key = `${o.date}|${folder}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const area = oneLine(o.area, 60);
    const title = oneLine(o.title, 160);
    const est = Math.round(Number(o.estMinutes));
    out.push({
      date: o.date,
      folder,
      ...(area ? { area } : {}),
      addedAt: typeof o.addedAt === "string" && !Number.isNaN(Date.parse(o.addedAt)) ? o.addedAt.slice(0, 40) : new Date(0).toISOString(),
      source: "manual",
      ...(title ? { title } : {}),
      ...(est > 0 ? { estMinutes: Math.min(600, est) } : {}),
      ...(isIsoDate(o.doneAt) ? { doneAt: o.doneAt } : {}),
    });
    if (out.length >= MAX_EXTRA_TOPICS) break;
  }
  return out;
}

export function sanitizeExtraPractice(raw: unknown): ExtraPractice[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: ExtraPractice[] = [];
  raw.forEach((r, i) => {
    if (!r || typeof r !== "object" || out.length >= MAX_EXTRA_PRACTICE) return;
    const o = r as Record<string, unknown>;
    const title = oneLine(o.title, 160);
    if (!title || !isIsoDate(o.date)) return;
    let id = oneLine(o.id, 40).replace(/[^\w-]/g, "");
    if (!id || seen.has(id)) id = `xp-${i}-${Date.parse(String(o.date)).toString(36)}`;
    seen.add(id);
    const kind = (EXTRA_PRACTICE_KINDS as readonly unknown[]).includes(o.kind) ? (o.kind as ExtraPracticeKind) : "custom";
    const minutes = Math.round(Number(o.minutes));
    const area = oneLine(o.area, 60);
    const note = oneLine(o.note, 400);
    const folder = cleanFolder(o.folder);
    const rel = cleanFolder(o.rel);
    out.push({
      id,
      date: o.date,
      ...(area ? { area } : {}),
      title,
      ...(minutes > 0 ? { minutes: Math.min(600, minutes) } : {}),
      ...(note ? { note } : {}),
      kind,
      ...(o.done === true ? { done: true } : {}),
      ...(folder ? { folder } : {}),
      ...(rel ? { rel } : {}),
      ...(isIsoDate(o.kataDate) ? { kataDate: o.kataDate } : {}),
    });
  });
  return out;
}
