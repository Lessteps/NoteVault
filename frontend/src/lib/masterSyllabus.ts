// TEMARIO GENERAL: UN archivo (Markdown + su gemelo JSON) con TODA la ruta de estudio, para que cualquier IA —o persona— sepa qué hay, cómo se divide y en qué
// estado está, sin leer el JSON interno de la app. Jerarquía: ruta (plan) → área → asignatura (grupo) → tema → piezas, con número, minutos, semana del plan y
// estado (nota, mapa, práctica, ejercicios, completado). Además, la biblioteca: lo que hay en la vault y no está en ningún plan.
//
// PURO y determinista (sin fechas dentro: el mismo contenido da los mismos bytes, así no ensucia git). Lo escribe `api/modules/masterSyllabus.ts` cada vez que
// se sincroniza el plan; nadie lo edita a mano.

import { compareKeys, numberKey } from "./planOrganize.js";

export interface MasterTopicState {
  theory: boolean;
  map: boolean;
  practice: boolean;
  exercises: number;
}

/** Un tema real de la vault (tiene manifiesto de práctica). */
export interface VaultTopic extends MasterTopicState {
  folder: string;
  title: string;
  skills: readonly string[];
}

export interface PlanTopicRef {
  folder: string;
  title: string;
  estMinutes: number;
  targetWeek: number;
  group?: string;
  route?: string;
  completedAt?: string;
}

export interface PlanGroupRef {
  id: string;
  title: string;
  kind?: string;
  order?: number;
}

export interface PlanAreaRef {
  id: string;
  area: string;
  objective?: string;
  groups?: readonly PlanGroupRef[];
  topics: readonly PlanTopicRef[];
}

export interface PlanRef {
  id: string;
  name?: string;
  start: string;
  end: string;
  hoursPerWeek?: number;
  subplans: readonly PlanAreaRef[];
}

export interface MasterInput {
  /** carpeta de primer nivel («Programación») */
  space: string;
  topics: readonly VaultTopic[];
  plans: readonly PlanRef[];
  /** archivos de índice que la IA debe conocer (rutas relativas a la vault) */
  indexFiles?: readonly string[];
}

export interface MasterTopicJson {
  /** número de la carpeta: `2.1.4.2` */
  number: string;
  folder: string;
  title: string;
  /** piezas: temas más profundos que cuelgan de este */
  parent: string | null;
  estMinutes?: number;
  targetWeek?: number;
  route?: string;
  done?: boolean;
  theory: boolean;
  map: boolean;
  practice: boolean;
  exercises: number;
}

export interface MasterJson {
  version: 1;
  space: string;
  summary: { topics: number; withTheory: number; withMap: number; withPractice: number; withExercises: number; exercises: number; plans: number; topicsInPlans: number; notInAnyPlan: number };
  indexFiles: string[];
  routes: Array<{
    planId: string;
    name: string;
    start: string;
    end: string;
    hoursPerWeek: number | null;
    areas: Array<{ id: string; area: string; objective: string; subjects: Array<{ id: string; title: string; kind: string; minutes: number; topics: MasterTopicJson[] }> }>;
  }>;
  library: Array<{ areaFolder: string; topics: MasterTopicJson[] }>;
}

const base = (folder: string): string => folder.replace(/\\/g, "/").split("/").pop() ?? folder;
const numOf = (folder: string): string => numberKey(folder)?.join(".") ?? "";
const areaFolderOf = (folder: string): string => folder.replace(/\\/g, "/").split("/").slice(0, 2).join("/");
const hours = (min: number): string => (min >= 60 ? `${Math.round((min / 60) * 10) / 10} h` : `${min} min`);

/** El tema del que cuelga (su número es prefijo del suyo y hay un tema así en la lista), o null. */
function parentsOf(folders: readonly string[]): Map<string, string | null> {
  const byKey = new Map<string, string>();
  for (const f of folders) {
    const k = numOf(f);
    if (k && !byKey.has(`${areaFolderOf(f)}|${k}`)) byKey.set(`${areaFolderOf(f)}|${k}`, f);
  }
  const out = new Map<string, string | null>();
  for (const f of folders) {
    const parts = numOf(f).split(".").filter(Boolean);
    let parent: string | null = null;
    for (let n = parts.length - 1; n >= 1 && !parent; n--) parent = byKey.get(`${areaFolderOf(f)}|${parts.slice(0, n).join(".")}`) ?? null;
    out.set(f, parent);
  }
  return out;
}

const flag = (s: MasterTopicState): string => `${s.theory ? "T" : "·"}${s.map ? "M" : "·"}${s.practice ? "P" : "·"} E${s.exercises}`;

export function buildMasterSyllabus(input: MasterInput): { markdown: string; json: MasterJson } {
  const vault = new Map(input.topics.map((t) => [t.folder, t]));
  const stateOf = (folder: string): MasterTopicState => vault.get(folder) ?? { theory: false, map: false, practice: false, exercises: 0 };
  const inPlan = new Set<string>();

  const routes: MasterJson["routes"] = input.plans.map((plan) => ({
    planId: plan.id,
    name: plan.name?.trim() || plan.id,
    start: plan.start,
    end: plan.end,
    hoursPerWeek: plan.hoursPerWeek ?? null,
    areas: plan.subplans.map((s) => {
      const groupDefs = [...(s.groups ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const ids = groupDefs.map((g) => g.id);
      const live = s.topics.filter((t) => t.route !== "skipped");
      const parents = parentsOf(live.map((t) => t.folder));
      const topicJson = (t: PlanTopicRef): MasterTopicJson => ({
        number: numOf(t.folder),
        folder: t.folder,
        title: t.title,
        parent: parents.get(t.folder) ?? null,
        estMinutes: t.estMinutes,
        targetWeek: t.targetWeek,
        ...(t.route ? { route: t.route } : {}),
        done: !!t.completedAt,
        ...stateOf(t.folder),
      });
      const subjectOf = (t: PlanTopicRef): string => (t.group && ids.includes(t.group) ? t.group : (ids[0] ?? "core"));
      const subjects = (groupDefs.length ? groupDefs : [{ id: "core", title: s.area, kind: "knowledge" }]).map((g) => {
        const mine = live.filter((t) => subjectOf(t) === g.id).sort((a, b) => compareKeys(numberKey(a.folder) ?? [], numberKey(b.folder) ?? []) || a.folder.localeCompare(b.folder));
        for (const t of mine) inPlan.add(t.folder);
        return { id: g.id, title: g.title, kind: g.kind ?? "knowledge", minutes: mine.reduce((n, t) => n + t.estMinutes, 0), topics: mine.map(topicJson) };
      });
      return { id: s.id, area: s.area, objective: s.objective ?? "", subjects: subjects.filter((g) => g.topics.length) };
    }),
  }));

  const rest = input.topics.filter((t) => !inPlan.has(t.folder));
  const libraryTopics = (folders: readonly VaultTopic[]): MasterTopicJson[] => {
    const parents = parentsOf(folders.map((t) => t.folder));
    return [...folders]
      .sort((a, b) => compareKeys(numberKey(a.folder) ?? [], numberKey(b.folder) ?? []) || a.folder.localeCompare(b.folder))
      .map((t) => ({ number: numOf(t.folder), folder: t.folder, title: t.title, parent: parents.get(t.folder) ?? null, theory: t.theory, map: t.map, practice: t.practice, exercises: t.exercises }));
  };
  const byArea = new Map<string, VaultTopic[]>();
  for (const t of rest) byArea.set(areaFolderOf(t.folder), [...(byArea.get(areaFolderOf(t.folder)) ?? []), t]);
  const library = [...byArea.entries()]
    .sort((a, b) => compareKeys(numberKey(`x/${a[0].split("/").pop()} x`) ?? [], numberKey(`x/${b[0].split("/").pop()} x`) ?? []) || a[0].localeCompare(b[0]))
    .map(([areaFolderName, ts]) => ({ areaFolder: areaFolderName, topics: libraryTopics(ts) }));

  const all = input.topics;
  const summary: MasterJson["summary"] = {
    topics: all.length,
    withTheory: all.filter((t) => t.theory).length,
    withMap: all.filter((t) => t.map).length,
    withPractice: all.filter((t) => t.practice).length,
    withExercises: all.filter((t) => t.exercises > 0).length,
    exercises: all.reduce((n, t) => n + t.exercises, 0),
    plans: routes.length,
    topicsInPlans: inPlan.size,
    notInAnyPlan: rest.length,
  };
  const indexFiles = [...(input.indexFiles ?? [])];
  const json: MasterJson = { version: 1, space: input.space, summary, indexFiles, routes, library };

  // ── Markdown ──
  const L: string[] = [];
  const line = (t: MasterTopicJson, depth: number): string => {
    const where = t.estMinutes !== undefined ? ` · ${hours(t.estMinutes)} · week ${t.targetWeek}` : "";
    const done = t.done ? " ✓ done" : "";
    return `${"  ".repeat(depth)}- \`${t.number}\` [[${base(t.folder)}]]${where} · ${flag(t)}${done}`;
  };
  const tree = (topics: readonly MasterTopicJson[]): string[] => {
    const present = new Set(topics.map((t) => t.folder));
    const kids = new Map<string, MasterTopicJson[]>();
    const roots: MasterTopicJson[] = [];
    for (const t of topics) {
      if (t.parent && present.has(t.parent)) kids.set(t.parent, [...(kids.get(t.parent) ?? []), t]);
      else roots.push(t);
    }
    const out: string[] = [];
    const walk = (t: MasterTopicJson, depth: number): void => {
      out.push(line(t, depth));
      for (const k of kids.get(t.folder) ?? []) walk(k, depth + 1);
    };
    for (const r of roots) walk(r, 0);
    return out;
  };

  L.push(`# Master syllabus — ${input.space}`, "", "<!-- nv:master-syllabus — generated by NoteVault every time the plan syncs; do not edit by hand. Machine-readable twin: `00 Master syllabus.json`. -->", "");
  L.push("**What this file is.** The single, always-current map of the whole study route: every route (plan) → area → subject (group) → topic → pieces, with each topic's number, time, week in the plan and what already exists.", "");
  L.push("**Reading a line.** `2.1.4.2` is the folder number (a topic with a longer number is a *piece* of the shorter one it starts with). `T M P` = theory note, concept map, practice manifest exist (`·` = missing); `E7` = 7 exercise files; `✓ done` = completed in the plan.", "");
  L.push("**For an AI that must create or change something.** Read the rules first: `_skills/subtemas_skill.md` (add a topic inside an area), `_skills/resumen_teorico_skill.md`, `mapa_skill.md`, `practica_skill.md`. Never renumber or move existing topics; add new ones at the next free number. NoteVault detects new topics and adds them to the plan by itself.", "");
  if (indexFiles.length) L.push(`**Other index files:** ${indexFiles.map((f) => `\`${f}\``).join(" · ")}. If \`00 Temario.md\` (the linked outline) disagrees with this file, this file is the current one.`, "");
  L.push("## Summary", "");
  L.push(`| Topics | Theory | Map | Practice | With exercises | Exercise files | Routes | In a route | Not in any route |`, `|---:|---:|---:|---:|---:|---:|---:|---:|---:|`);
  L.push(`| ${summary.topics} | ${summary.withTheory} | ${summary.withMap} | ${summary.withPractice} | ${summary.withExercises} | ${summary.exercises} | ${summary.plans} | ${summary.topicsInPlans} | ${summary.notInAnyPlan} |`, "");

  for (const r of routes) {
    L.push(`## Route: ${r.name}`, "", `Period ${r.start} → ${r.end}${r.hoursPerWeek ? ` · ${r.hoursPerWeek} h/week` : ""} · plan id \`${r.planId}\``, "");
    for (const a of r.areas) {
      L.push(`### Area: ${a.area}`, "");
      if (a.objective) L.push(`*${a.objective}*`, "");
      for (const g of a.subjects) {
        L.push(`#### Subject: ${g.title} (${g.kind}) — ${g.topics.length} topics · ${hours(g.minutes)}`, "", ...tree(g.topics), "");
      }
    }
  }

  if (library.length) {
    L.push("## Library: in the vault but not in any route", "", "Topics that exist and are not scheduled in a plan. They can be added to a plan from the Mentor.", "");
    for (const a of library) L.push(`### ${base(a.areaFolder)} (${a.topics.length})`, "", ...tree(a.topics), "");
  }
  return { markdown: L.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n", json };
}
