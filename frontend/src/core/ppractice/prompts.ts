/**
 * `programming_practice` — the prompts of the four phases and the parsers of what comes back.
 *
 * Every call asks for JSON only and is parsed here, so DeepSeek over HTTP and an agent answering a handoff file
 * return the same shape and nothing downstream knows which one answered.
 */

import { type CheckResult, summarizeChecks } from "./checks.js";
import { type Focus, FOCUSES, type ClientKind, type ProjectSpec, SCOPE } from "./spec.js";
import { type Postmortem } from "./profile.js";

export type Msg = { role: "system" | "user"; content: string };

/** The focus decides the client when it implies one; otherwise web. */
export const clientForFocus = (focus: Focus): ClientKind => (focus === "desktop" ? "desktop" : focus === "mobile" ? "mobile" : "web");

/** Focuses for the next `n` weeks: the learner's weakest first, then a rotation that never repeats the previous one. */
export function planFocuses(n: number, weakest: Focus | null, used: readonly string[]): Focus[] {
  const out: Focus[] = [];
  let last = used.length ? used[used.length - 1] : "";
  const counts = new Map<string, number>(FOCUSES.map((f) => [f, used.filter((u) => u === f).length]));
  // When two focuses were done the same number of times, the one done longest ago goes first.
  const lastUse = new Map<string, number>(FOCUSES.map((f) => [f, used.lastIndexOf(f)]));
  for (let i = 0; i < n; i++) {
    let pick: Focus;
    if (i === 0 && weakest && weakest !== last) pick = weakest;
    else {
      const pool = FOCUSES.filter((f) => f !== last);
      pick = [...pool].sort((a, b) => (counts.get(a)! - counts.get(b)!) || (lastUse.get(a)! - lastUse.get(b)!) || FOCUSES.indexOf(a) - FOCUSES.indexOf(b))[0]!;
    }
    out.push(pick);
    counts.set(pick, (counts.get(pick) ?? 0) + 1);
    lastUse.set(pick, used.length + i);
    last = pick;
  }
  return out;
}

const RULES = [
  "THE RULE THAT NEVER BENDS: every project is FULL STACK. A database, a backend and a client are mandatory, every time.",
  "Automation is an optional extra and never replaces a layer. The focus only adds criteria.",
  `Size: ${SCOPE.tables.min}-${SCOPE.tables.max} tables, ${SCOPE.endpoints.min}-${SCOPE.endpoints.max} endpoints, ${SCOPE.screens.min}-${SCOPE.screens.max} screens, 4-16 hours.`,
  "The backend has a layered architecture. The client has an architecture, named design patterns and Atomic Design (atoms, molecules, organisms).",
  "Every acceptance criterion must be CHECKABLE (a status code, a command, an observable result).",
  "THE LEARNER'S STACK: PostgreSQL is the database of every web and mobile project (stack.database must say PostgreSQL); SQLite is ONLY for desktop projects (client = desktop). Backend in Python (FastAPI) or TypeScript, client in TypeScript (React for web).",
].join("\n");

const SPEC_SHAPE = `{
  "folder": "Link shortener with stats",
  "title": "…", "problem": "2-4 sentences", "client": "web|desktop|mobile", "focus": "backend|databases|frontend|desktop|mobile|automation", "hours": 10,
  "stack": { "database": "SQLite", "backend": "FastAPI", "client": "React + TypeScript" },
  "database": { "summary": "…", "tables": ["links(id, code, url, created_at)", "…"], "criteria": ["…", "…", "…"] },
  "backend": { "summary": "…", "architecture": ["routes", "services", "repository"], "endpoints": ["POST /links", "GET /{code}"], "criteria": ["…", "…", "…"] },
  "clientLayer": { "summary": "…", "screens": ["…"], "architecture": ["…"], "patterns": ["custom hook for … (used in …)"],
    "atomic": { "atoms": ["Button", "Input"], "molecules": ["LinkForm"], "organisms": ["LinkTable"] }, "criteria": ["…", "…", "…"] },
  "focusCriteria": ["…", "…"],
  "automation": { "summary": "…", "criteria": ["…", "…"] },
  "topics": ["exact syllabus topic names, at least 3"],
  "rubric": [{ "criterion": "…", "weight": 25 }],
  "defenseQuestions": ["…", "…", "…", "…"]
}`;

export interface IdeaRequest {
  skill: string;
  profile: string;
  previous: readonly string[];
  focus?: Focus;
  client?: ClientKind;
  notes?: string;
  count?: number;
}

export function ideasMessages(r: IdeaRequest): Msg[] {
  const count = r.count ?? 3;
  const system = [
    "You are the project designer of a developer in training whose stack is Desktop (Electron + TypeScript), Backend, Frontend (React + TypeScript), Databases, Automation and Mobile.",
    `You propose ${count} ideas for ONE weekly project. Each idea is a small, real tool someone would actually use, with concrete data and behaviour. Never a todo list.`,
    RULES,
    "Answer ONLY with JSON: " + '{"ideas":[{"title":"…","problem":"one or two sentences","client":"web|desktop|mobile","focus":"backend|databases|frontend|desktop|mobile|automation","hours":10,"why":"why it suits this learner now"}]}',
    r.skill ? `\nFollow this vault skill:\n${r.skill.slice(0, 3500)}` : "",
  ].filter(Boolean).join("\n");
  const user = [
    r.focus ? `Focus of the week: ${r.focus}.` : "Choose the focus where the learner is weakest (see the profile), otherwise vary it.",
    r.client ? `Client: ${r.client}.` : "",
    r.notes?.trim() ? `The learner asks: ${r.notes.trim()}` : "",
    r.previous.length ? `Projects already done or specified (do not repeat them): ${r.previous.join("; ")}.` : "",
    r.profile ? `\nLearner profile:\n${r.profile}` : "\nNo history yet: start with a gentle but complete project.",
    "\nReturn ONLY the JSON.",
  ].filter(Boolean).join("\n");
  return [{ role: "system", content: system }, { role: "user", content: user }];
}

export interface SpecRequest {
  skill: string;
  profile: string;
  focus: Focus;
  client: ClientKind;
  idea: string;
  topics: readonly string[];
  previous: readonly string[];
  /** Problems found in the previous attempt, so the model fixes exactly those. */
  fix?: readonly string[];
}

export function specMessages(r: SpecRequest): Msg[] {
  const system = [
    "You write the SPECIFICATION of a weekly programming project for a developer in training. The learner will build it themself; you never write the application code.",
    RULES,
    `Focus: ${r.focus}. Client: ${r.client}. The focus adds at least 2 extra checkable criteria in "focusCriteria"; if the focus is automation include the "automation" section, otherwise include it only if it adds real value.`,
    "Everything in English. Acceptance criteria are observable facts, 3 or more per layer.",
    "The rubric weights add up to exactly 100 and reward the focus. \"topics\" must be chosen from the syllabus list given by the user, with the exact names.",
    "The learner's weaknesses (if any) must become things the project REQUIRES to be done correctly.",
    "Answer ONLY with JSON in exactly this shape:\n" + SPEC_SHAPE,
    r.skill ? `\nFollow this vault skill:\n${r.skill.slice(0, 4000)}` : "",
  ].filter(Boolean).join("\n");
  const user = [
    `Idea to specify: ${r.idea}`,
    r.previous.length ? `Do not duplicate: ${r.previous.join("; ")}.` : "",
    r.profile ? `\nLearner profile:\n${r.profile}` : "",
    `\nSyllabus topics you may link (exact names):\n${r.topics.slice(0, 260).join("; ")}`,
    r.fix?.length ? `\nYour previous specification was REJECTED for these reasons. Fix every one and keep the rest:\n${r.fix.map((f) => `- ${f}`).join("\n")}` : "",
    "\nReturn ONLY the JSON.",
  ].filter(Boolean).join("\n");
  return [{ role: "system", content: system }, { role: "user", content: user }];
}

export interface PlanRequest {
  skill: string;
  profile: string;
  focuses: readonly Focus[];
  previous: readonly string[];
  notes?: string;
}

export function planMessages(r: PlanRequest): Msg[] {
  const system = [
    "You plan a sequence of weekly projects for a developer in training. One idea per week, in the order given, each with the focus assigned to that week.",
    RULES,
    "Difficulty rises gently across the weeks; consecutive projects must not repeat a domain or a data model.",
    'Answer ONLY with JSON: {"weeks":[{"week":1,"title":"…","problem":"one or two sentences","client":"web|desktop|mobile","focus":"…","hours":10,"why":"…"}]}',
    r.skill ? `\nFollow this vault skill:\n${r.skill.slice(0, 3000)}` : "",
  ].filter(Boolean).join("\n");
  const user = [
    `Plan ${r.focuses.length} weeks with exactly these focuses, in order: ${r.focuses.map((f, i) => `week ${i + 1} = ${f} (client ${clientForFocus(f)})`).join("; ")}.`,
    r.notes?.trim() ? `The learner asks: ${r.notes.trim()}` : "",
    r.previous.length ? `Already done or specified (do not repeat): ${r.previous.join("; ")}.` : "",
    r.profile ? `\nLearner profile:\n${r.profile}` : "",
    "\nReturn ONLY the JSON.",
  ].filter(Boolean).join("\n");
  return [{ role: "system", content: system }, { role: "user", content: user }];
}

const REVIEW_SHAPE = '{"layer":"database|backend|client","verdict":"pass|partial|fail","criteria":[{"criterion":"…","met":true,"evidence":"file and what it shows"}],"issues":[{"severity":"high|medium|low","file":"path","line":12,"problem":"…","why":"…","fix":"…"}],"strengths":["…"],"notJudgeable":["what could not be judged from the files shown"]}';

export interface ReviewRequest {
  skill: string;
  spec: string;
  layer: "database" | "backend" | "client";
  criteria: readonly string[];
  focusCriteria: readonly string[];
  files: string;
  checks: string;
  profile: string;
  /** Issues of the previous defence, so a re-review verifies whether they were fixed. */
  previous?: string;
}

export function reviewMessages(r: ReviewRequest): Msg[] {
  const clientExtra = r.layer === "client"
    ? "Also judge the ARCHITECTURE, the design patterns the spec demanded (are they really used, and where?) and ATOMIC DESIGN (is there a real atoms → molecules → organisms hierarchy, or only big components?)."
    : r.layer === "backend"
      ? "Also judge the layered architecture the spec demanded: is the business logic out of the route handlers, is data access isolated, are errors returned with the agreed contract?"
      : "Also judge constraints, keys, the migration and whether every query the backend needs has an index where it matters.";
  const system = [
    `You review the ${r.layer.toUpperCase()} layer of a learner's weekly project against its specification. You are strict and fair.`,
    "Find BEHAVIOURAL problems (wrong on some input, unsafe, missing validation, race, leak, hidden assumption) located by file and line. No style nitpicks. Never call correct code wrong.",
    "If something cannot be judged from the files shown, list it in notJudgeable instead of guessing.",
    clientExtra,
    "Answer ONLY with JSON: " + REVIEW_SHAPE,
    r.skill ? `\nFollow this vault skill:\n${r.skill.slice(0, 2500)}` : "",
  ].join("\n");
  const user = [
    `Specification of the project:\n${r.spec.slice(0, 5000)}`,
    `\nCriteria of the ${r.layer} layer:\n${r.criteria.map((c) => `- ${c}`).join("\n")}`,
    r.focusCriteria.length ? `\nFocus criteria (judge the ones that belong to this layer):\n${r.focusCriteria.map((c) => `- ${c}`).join("\n")}` : "",
    `\nAutomatic checks already run:\n${r.checks}`,
    r.previous ? `\nIssues reported in the PREVIOUS review: say for each whether it is now fixed, still present or cannot be judged:\n${r.previous}` : "",
    r.profile ? `\nKnown weaknesses of this learner (look for them first):\n${r.profile}` : "",
    `\nFiles:\n${r.files || "(no files in this layer)"}`,
    "\nReturn ONLY the JSON.",
  ].filter(Boolean).join("\n");
  return [{ role: "system", content: system }, { role: "user", content: user }];
}

export interface LayerReport {
  layer: string;
  verdict: "pass" | "partial" | "fail";
  criteria: Array<{ criterion: string; met: boolean; evidence: string }>;
  issues: Array<{ severity: "high" | "medium" | "low"; file: string; line?: number; problem: string; why: string; fix: string }>;
  strengths: string[];
  notJudgeable: string[];
}

export interface FinalReport {
  functional: boolean;
  score: number;
  summary: string;
  mustFix: string[];
  questions: Array<{ id: string; question: string; why: string }>;
}

export function finalMessages(spec: string, reports: readonly LayerReport[], checks: readonly CheckResult[], profile: string): Msg[] {
  const brief = reports.map((r) => `### ${r.layer}: ${r.verdict}\nunmet: ${r.criteria.filter((c) => !c.met).map((c) => c.criterion).join(" | ") || "none"}\nissues: ${r.issues.map((i) => `[${i.severity}] ${i.file}${i.line ? `:${i.line}` : ""} ${i.problem}`).join(" | ") || "none"}`).join("\n\n");
  const system = [
    "You close the review of a learner's weekly project. Decide if it is FUNCTIONAL end to end, score it against the rubric (0-100), list what must be fixed, and write 6 DEFENCE questions.",
    "The defence questions are about the learner's OWN decisions in THIS code (why this structure, what happens when X fails, what changes at 10x the load, what they would do differently). They point at concrete files or behaviours; never generic trivia.",
    "Answer ONLY with JSON: " + '{"functional":true,"score":0,"summary":"3-5 sentences","mustFix":["…"],"questions":[{"id":"q1","question":"…","why":"what understanding it probes"}]}',
  ].join("\n");
  const user = [`Specification:\n${spec.slice(0, 4500)}`, `\nAutomatic checks:\n${summarizeChecks(checks)}`, `\nLayer reviews:\n${brief}`, profile ? `\nLearner profile:\n${profile}` : "", "\nReturn ONLY the JSON."].filter(Boolean).join("\n");
  return [{ role: "system", content: system }, { role: "user", content: user }];
}

export function gradeDefenseMessages(spec: string, final: FinalReport, qa: ReadonlyArray<{ id: string; question: string; answer: string }>): Msg[] {
  const system = [
    "You grade a learner's oral defence of their own project, given as written answers. Grade understanding of the mechanism, not wording. An answer that is vague, memorised or contradicts the code scores low.",
    "Answer ONLY with JSON: " + '{"score":0,"items":[{"id":"q1","verdict":"good|partial|weak","feedback":"what was right, what was missing"}],"summary":"2-4 sentences","gaps":["concepts to review"]}',
  ].join("\n");
  const user = [`Specification (short):\n${spec.slice(0, 2500)}`, `\nReview summary: ${final.summary}`, `\nQuestions and answers:\n${qa.map((q) => `${q.id}. ${q.question}\nANSWER: ${q.answer.trim() || "(no answer)"}`).join("\n\n")}`, "\nReturn ONLY the JSON."].join("\n");
  return [{ role: "system", content: system }, { role: "user", content: user }];
}

const PM_SHAPE = '{"kind":"project","project":"…","score":0,"focus":"…","summary":"3-5 sentences","coveredLayers":["database","backend","client"],"weaknesses":[{"label":"specific recurring mistake","layer":"database|backend|client|desktop|mobile|automation|tests|process|logic","category":"conceptual|logical|procedural|implementation","evidence":[{"file":"path","line":1,"note":"…"}]}],"strengths":["…"],"styleNotes":["how the learner writes code"],"nextFocus":"…"}';

export function postmortemMessages(input: { kind: "project" | "kata"; project: string; skill: string; spec: string; reviewSummary: string; defenseSummary: string; profile: string; evidence?: string }): Msg[] {
  const system = [
    `You write the POSTMORTEM of ${input.kind === "kata" ? "a period of daily logic katas" : "a learner's weekly project"}: what went right, what went wrong, and what the next work should push on.`,
    "Weaknesses must be SPECIFIC, recurring-type mistakes with evidence, never \"weak at backend\". If a known weakness (see the profile) shows up again, reuse its exact label.",
    "Only list a layer in coveredLayers if this work really exercised it. Style notes describe how the learner writes code, observed from the evidence.",
    "Answer ONLY with JSON: " + PM_SHAPE,
    input.skill ? `\nFollow this vault skill:\n${input.skill.slice(0, 2500)}` : "",
  ].filter(Boolean).join("\n");
  const user = [
    `Project: ${input.project}`,
    input.spec ? `Specification (short):\n${input.spec.slice(0, 2500)}` : "",
    input.reviewSummary ? `\nReview:\n${input.reviewSummary.slice(0, 4500)}` : "",
    input.defenseSummary ? `\nDefence:\n${input.defenseSummary.slice(0, 1800)}` : "",
    input.evidence ? `\nEvidence:\n${input.evidence.slice(0, 4000)}` : "",
    input.profile ? `\nExisting profile:\n${input.profile}` : "",
    "\nReturn ONLY the JSON.",
  ].filter(Boolean).join("\n");
  return [{ role: "system", content: system }, { role: "user", content: user }];
}

// ── parsing ────────────────────────────────────────────────────────────────

/** Extracts the first JSON object of a reply (fenced or bare). Throws a readable error. */
export function parseJsonReply(reply: string): any {
  let text = String(reply ?? "").trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  if (fence) text = fence[1]!.trim();
  const a = text.indexOf("{");
  const b = text.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("The AI did not return JSON.");
  try {
    return JSON.parse(text.slice(a, b + 1));
  } catch {
    throw new Error("The AI returned invalid JSON.");
  }
}

const str = (v: unknown): string => String(v ?? "").trim();
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
const num = (v: unknown, d = 0): number => (Number.isFinite(Number(v)) ? Number(v) : d);

export interface Idea { title: string; problem: string; client: ClientKind; focus: Focus; hours: number; why: string }

export function parseIdeas(reply: string): Idea[] {
  const raw = parseJsonReply(reply);
  const list = Array.isArray(raw?.ideas) ? raw.ideas : [];
  const out: Idea[] = list.map((i: any) => {
    const focus = (FOCUSES as readonly string[]).includes(str(i?.focus).toLowerCase()) ? (str(i.focus).toLowerCase() as Focus) : ("backend" as Focus);
    return { title: str(i?.title), problem: str(i?.problem), client: clientForFocus(focus) === "web" && ["web", "desktop", "mobile"].includes(str(i?.client)) ? (str(i.client) as ClientKind) : clientForFocus(focus), focus, hours: num(i?.hours, 10), why: str(i?.why) };
  }).filter((i: Idea) => i.title && i.problem);
  if (!out.length) throw new Error("The AI proposed no usable ideas.");
  return out;
}

export function parsePlan(reply: string): Array<Idea & { week: number }> {
  const raw = parseJsonReply(reply);
  const list = Array.isArray(raw?.weeks) ? raw.weeks : [];
  const out = list.map((w: any, i: number) => {
    const focus = (FOCUSES as readonly string[]).includes(str(w?.focus).toLowerCase()) ? (str(w.focus).toLowerCase() as Focus) : ("backend" as Focus);
    return { week: num(w?.week, i + 1), title: str(w?.title), problem: str(w?.problem), client: clientForFocus(focus) === "web" && ["web", "desktop", "mobile"].includes(str(w?.client)) ? (str(w.client) as ClientKind) : clientForFocus(focus), focus, hours: num(w?.hours, 10), why: str(w?.why) };
  }).filter((w: { title: string }) => w.title);
  if (!out.length) throw new Error("The AI returned an empty plan.");
  return out;
}

export function parseReview(reply: string, layer: string): LayerReport {
  const raw = parseJsonReply(reply);
  const verdict = ["pass", "partial", "fail"].includes(str(raw?.verdict)) ? (str(raw.verdict) as LayerReport["verdict"]) : "partial";
  return {
    layer,
    verdict,
    criteria: (Array.isArray(raw?.criteria) ? raw.criteria : []).map((c: any) => ({ criterion: str(c?.criterion), met: c?.met === true, evidence: str(c?.evidence) })).filter((c: { criterion: string }) => c.criterion),
    issues: (Array.isArray(raw?.issues) ? raw.issues : []).map((i: any) => ({ severity: ["high", "medium", "low"].includes(str(i?.severity)) ? (str(i.severity) as "high") : ("medium" as const), file: str(i?.file), ...(Number.isFinite(Number(i?.line)) && Number(i.line) > 0 ? { line: Number(i.line) } : {}), problem: str(i?.problem), why: str(i?.why), fix: str(i?.fix) })).filter((i: { problem: string }) => i.problem),
    strengths: strs(raw?.strengths),
    notJudgeable: strs(raw?.notJudgeable),
  };
}

export function parseFinal(reply: string): FinalReport {
  const raw = parseJsonReply(reply);
  const questions = (Array.isArray(raw?.questions) ? raw.questions : []).map((q: any, i: number) => ({ id: str(q?.id) || `q${i + 1}`, question: str(q?.question), why: str(q?.why) })).filter((q: { question: string }) => q.question);
  if (questions.length < 3) throw new Error("The AI wrote too few defence questions.");
  return { functional: raw?.functional === true, score: Math.max(0, Math.min(100, Math.round(num(raw?.score)))), summary: str(raw?.summary), mustFix: strs(raw?.mustFix), questions };
}

export interface DefenseGrade { score: number; items: Array<{ id: string; verdict: "good" | "partial" | "weak"; feedback: string }>; summary: string; gaps: string[] }

export function parseDefenseGrade(reply: string): DefenseGrade {
  const raw = parseJsonReply(reply);
  return {
    score: Math.max(0, Math.min(100, Math.round(num(raw?.score)))),
    items: (Array.isArray(raw?.items) ? raw.items : []).map((i: any) => ({ id: str(i?.id), verdict: ["good", "partial", "weak"].includes(str(i?.verdict)) ? (str(i.verdict) as "good") : ("partial" as const), feedback: str(i?.feedback) })),
    summary: str(raw?.summary),
    gaps: strs(raw?.gaps),
  };
}

export function parsePostmortem(reply: string, fallback: { kind: "project" | "kata"; project: string }): Postmortem {
  const raw = parseJsonReply(reply);
  return {
    kind: fallback.kind,
    project: str(raw?.project) || fallback.project,
    score: Math.max(0, Math.min(100, Math.round(num(raw?.score)))),
    ...(str(raw?.focus) ? { focus: str(raw.focus) } : {}),
    summary: str(raw?.summary),
    coveredLayers: strs(raw?.coveredLayers),
    weaknesses: (Array.isArray(raw?.weaknesses) ? raw.weaknesses : []).map((w: any) => ({ label: str(w?.label), layer: str(w?.layer) || "logic", category: str(w?.category) || "implementation", evidence: (Array.isArray(w?.evidence) ? w.evidence : []).map((e: any) => ({ file: str(e?.file) || undefined, line: Number(e?.line) > 0 ? Number(e.line) : undefined, note: str(e?.note) })) })).filter((w: { label: string }) => w.label),
    strengths: strs(raw?.strengths),
    styleNotes: strs(raw?.styleNotes),
    ...(str(raw?.nextFocus) ? { nextFocus: str(raw.nextFocus) } : {}),
  };
}

export function specFromReply(reply: string): unknown {
  return parseJsonReply(reply);
}

export type { ProjectSpec };
