// «Preguntar con otra IA»: el DOSIER del plan —todo lo que hace falta para responder una pregunta sobre él— en un solo markdown que una IA externa (Antigravity,
// un chat) lee SIN la app abierta. Y el camino de vuelta: si la IA propone cambios, los pone en un bloque ```json con `ops`; aquí se leen y se validan (solo
// operaciones seguras y sin carpetas inventadas) para aplicarlos desde la app. Puro: sin disco ni red.

import type { ChainMonth } from "./planChain.js";

export interface DossierTopic {
  folder: string;
  title: string;
  targetWeek: number;
  estMinutes: number;
  group?: string;
  route?: string;
  completedAt?: string;
}
export interface DossierArea {
  id: string;
  area: string;
  objective?: string;
  phase?: { fromWeek: number; toWeek: number };
  groups?: Array<{ id: string; title: string }>;
  topics: DossierTopic[];
}
export interface DossierPlan {
  id: string;
  name?: string;
  start: string;
  end: string;
  hoursPerWeek?: number;
  minutesPerDay?: number;
  studyDays?: number[];
  areaMode?: string;
  areaModeWhy?: string;
  areas: DossierArea[];
  openQuestions?: Array<{ id: string; text?: string }>;
}
export interface DossierChange {
  n: number;
  at: string;
  comment: string;
  summary: string;
  status: string;
}

export const ALLOWED_OPS = ["organize", "trim_to_fit", "extend_to", "raise_minutes", "lighter", "set_area_mode", "add_area"] as const;

const DAY = ["", "lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
const mark = (t: DossierTopic): string => (t.completedAt ? "✓" : t.route === "skipped" ? "✗ (fuera de ruta)" : t.route === "optional" ? "○ (opcional)" : "·");
const clean = (s: string): string => s.replace(/\s+/g, " ").trim();

export interface DossierInput {
  plan: DossierPlan;
  question: string;
  /** la ruta ABSOLUTA donde la IA debe escribir su respuesta */
  answerAbs: string;
  chain: readonly ChainMonth[];
  changes: readonly DossierChange[];
  today: string;
}

/** El dosier completo, en markdown. */
export function buildDossier(i: DossierInput): string {
  const { plan } = i;
  const all = plan.areas.flatMap((a) => a.topics);
  const done = all.filter((t) => t.completedAt).length;
  const L: string[] = [];
  const push = (...l: string[]): void => void L.push(...l);

  push(
    `# Plan dossier — ${plan.name ?? plan.id}`,
    "",
    "## 0. What you have to do",
    "",
    "You are answering a question about a personal study plan. **Everything you need is in this file; the NoteVault app does not need to be open.** Read it completely before answering.",
    "",
    `- Answer in the language of the question. Be concrete: name areas, weeks, topics and numbers from the data below; do not invent data that is not here.`,
    `- Write your answer to \`${i.answerAbs}\` (create the file). Do not modify anything else: not the app source, not the vault, not this file.`,
    "- If the question asks for changes, describe them in prose AND finish with ONE fenced ```json block `{ \"ops\": [ ... ] }` using ONLY these operations (the person will paste your answer into the app, which validates and applies them):",
    "  `{\"op\":\"organize\"}` · `{\"op\":\"trim_to_fit\"}` · `{\"op\":\"extend_to\",\"date\":\"YYYY-MM-DD\"}` · `{\"op\":\"raise_minutes\",\"minutes\":N}` · `{\"op\":\"lighter\"}` · `{\"op\":\"set_area_mode\",\"mode\":\"together\"|\"phased\"}` · `{\"op\":\"add_area\",\"areaId\":\"backend\"}`.",
    "  Do not invent other operations. If nothing should change, omit the block.",
    "",
    "## 1. The question",
    "",
    i.question.trim() ? `> ${clean(i.question)}` : "> (no specific question: give an honest evaluation of the plan — what is solid, what is missing or misordered, and what you would change first)",
    "",
    "## 2. The plan at a glance",
    "",
    `- Today: ${i.today} · plan: ${plan.start} → ${plan.end}`,
    `- Capacity: ${plan.minutesPerDay ? `${plan.minutesPerDay} min/day` : plan.hoursPerWeek ? `${plan.hoursPerWeek} h/week` : "not set"}${plan.studyDays?.length ? ` · study days: ${plan.studyDays.map((d) => DAY[d] ?? d).join(", ")}` : ""}`,
    `- Area mode: ${plan.areaMode ?? "phased"}${plan.areaModeWhy ? ` — ${clean(plan.areaModeWhy)}` : ""}`,
    `- Topics: ${all.length} total · ${done} completed · ${all.filter((t) => t.route === "optional").length} optional · ${all.filter((t) => t.route === "skipped").length} out of route`,
    `- Estimated minutes still to do: ${all.filter((t) => !t.completedAt && t.route !== "skipped").reduce((n, t) => n + t.estMinutes, 0)}`,
    "",
    "## 3. Areas",
    "",
    "| Area | Active weeks | Topics | Done | Subjects (groups) |",
    "|---|---|---|---|---|",
    ...plan.areas.map((a) => `| ${a.area} | ${a.phase ? `${a.phase.fromWeek}–${a.phase.toWeek}` : "all"} | ${a.topics.length} | ${a.topics.filter((t) => t.completedAt).length} | ${(a.groups ?? []).map((g) => g.title).join(", ") || "—"} |`),
    "",
    "## 4. Topics by area, in route order (✓ done · ○ optional · ✗ out of route · week in brackets)",
    "",
  );
  for (const a of plan.areas) {
    push(`### ${a.area}${a.objective ? ` — ${clean(a.objective)}` : ""}`, "");
    const gt = new Map((a.groups ?? []).map((g) => [g.id, g.title]));
    let last = "\u0000";
    for (const t of a.topics) {
      const g = t.group ? gt.get(t.group) ?? t.group : "";
      if (g !== last) {
        push(`**${g || "Topics"}**`);
        last = g;
      }
      push(`- ${mark(t)} [w${t.targetWeek}] ${t.title} (${t.estMinutes} min)`);
    }
    push("");
  }

  push("## 5. Projects: daily pieces → weekly milestones → monthly product", "");
  if (!i.chain.length) push("(no project chain: the plan has no study days with a project)", "");
  for (const m of i.chain) {
    push(`### ${m.title} — ${m.status}, ${m.pct}% (${m.done}/${m.total} pieces) · due ${m.dueDate}`, "", clean(m.goal), "", `Done when: ${m.criteria.map(clean).join(" · ")}`, "");
    for (const w of m.weeks) {
      push(`- Week ${w.week}: ${w.title} — ${w.status}, ${w.done}/${w.total} pieces${w.locked ? " (locked until the previous week is done)" : ""}`);
      const pending = w.pieces.filter((p) => !p.done);
      if (pending.length) push(`  - pending: ${pending.map((p) => `${p.date} ${p.title}`).join("; ")}`);
    }
    push("");
  }

  push("## 6. Recent changes to the plan", "");
  if (!i.changes.length) push("(none)", "");
  for (const c of i.changes.slice(-20)) push(`- #${c.n} ${c.at.slice(0, 10)} [${c.status}] ${clean(c.comment)}${c.summary ? ` → ${clean(c.summary)}` : ""}`);
  push("");
  if (plan.openQuestions?.length) push("## 7. Open questions of the plan", "", ...plan.openQuestions.map((q) => `- ${q.id}${q.text ? `: ${clean(q.text)}` : ""}`), "");
  push("## Done", "", "(When you finish, tell the person where your answer file is.)", "");
  return L.join("\n");
}

export interface ParsedOps {
  ops: Array<Record<string, unknown>>;
  /** operaciones del bloque que se descartaron (no permitidas o mal formadas) */
  discarded: string[];
}

/** Las operaciones que una IA propuso en el bloque ```json `{ "ops": [...] }` de su respuesta, ya validadas (nada fuera de la lista, fechas y números sensatos). */
export function parseOpsReply(text: string): ParsedOps | null {
  const blocks = [...String(text ?? "").matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map((m) => m[1]!);
  for (const b of blocks.reverse()) {
    let obj: { ops?: unknown };
    try {
      obj = JSON.parse(b);
    } catch {
      continue;
    }
    if (!Array.isArray(obj.ops)) continue;
    const ops: Array<Record<string, unknown>> = [];
    const discarded: string[] = [];
    for (const raw of obj.ops.slice(0, 20)) {
      const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
      const op = String(o.op ?? "");
      if (!(ALLOWED_OPS as readonly string[]).includes(op)) {
        discarded.push(op || "?");
        continue;
      }
      if (op === "extend_to" && !/^\d{4}-\d{2}-\d{2}$/.test(String(o.date ?? ""))) discarded.push(op);
      else if (op === "extend_to") ops.push({ op, date: String(o.date) });
      else if (op === "raise_minutes" && !(Number(o.minutes) > 0 && Number(o.minutes) <= 960)) discarded.push(op);
      else if (op === "raise_minutes") ops.push({ op, minutes: Math.round(Number(o.minutes)) });
      else if (op === "set_area_mode") (o.mode === "together" || o.mode === "phased" ? ops.push({ op, mode: o.mode }) : discarded.push(op));
      else if (op === "add_area") (/^[a-z][a-z0-9-]{1,30}$/.test(String(o.areaId ?? "")) ? ops.push({ op, areaId: String(o.areaId) }) : discarded.push(op));
      else ops.push({ op });
    }
    return { ops, discarded };
  }
  return null;
}
