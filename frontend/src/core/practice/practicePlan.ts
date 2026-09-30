/**
 * Practice plan: which competencies a topic should train, and how many exercises
 * per difficulty. An AI pass reads the topic's theory and proposes it; this module
 * builds the prompt, validates the reply against the skill catalogue and stores
 * the result inside the topic's `.practica.md` (a visible table plus a JSON
 * comment the app reads back). Pure: no I/O, no AI client.
 */

import type { CatalogSkill } from "./skillSelection";
import type { DifficultyLevel } from "./skills";
import type { TopicType } from "./topicType";

export interface PracticePlanSkill {
  skill: string;
  /** exercises wanted per difficulty (0 = do not practise at that level) */
  counts: Record<DifficultyLevel, number>;
  why: string;
}

export interface PracticePlan {
  skills: PracticePlanSkill[];
  summary: string;
  topicType?: TopicType;
}

export const PLAN_START = "<!-- nv:plan:start -->";
export const PLAN_END = "<!-- nv:plan:end -->";
const DATA_RE = /<!--\s*nv:plan:data\s+([\s\S]*?)\s*-->/;
export const MAX_PER_CELL = 12;
const LEVELS: DifficultyLevel[] = [1, 2, 3];

export interface ReevaluationInput {
  subject: string;
  title: string;
  topicType: TopicType;
  catalog: readonly CatalogSkill[];
  theory: ReadonlyArray<{ title: string; content: string }>;
  /** The vault's `_skills/*.md` guidance (how exercises/notes are shaped). */
  templates?: ReadonlyArray<{ title: string; content: string }>;
  currentSkills?: readonly string[];
}

/** The prompt that asks the AI to choose competencies and quantities. */
export function buildReevaluationMessages(input: ReevaluationInput): Array<{ role: "system" | "user"; content: string }> {
  const catalog = input.catalog
    .map((s) => {
      const diffs = s.allowedDifficulties.join(",");
      return `- ${s.id}: ${s.label} — ${s.description} [difficulties allowed: ${diffs}; suits: ${s.topicTypes.join("/")}]`;
    })
    .join("\n");
  const theory = input.theory
    .slice(0, 6)
    .map((t) => `### ${t.title}\n${t.content.slice(0, 2500).trim()}`)
    .join("\n\n");
  const templates = (input.templates ?? [])
    .slice(0, 4)
    .map((t) => `### ${t.title}\n${t.content.slice(0, 1200).trim()}`)
    .join("\n\n");

  const system = [
    "You are NoteVault's practice designer. You read ONE topic and decide (1) what kind of topic it is and (2) which competencies (skills) a student must train to master exactly that topic.",
    "STEP 1 - topic_type. Decide it from what the student has to DO with the topic:",
    '  "theoretical": the topic is about definitions, concepts, representations, classifications, properties or proofs (what things are and how they relate). Examples: natural numbers, integers and the number line; what a fraction is; sets and notation.',
    '  "procedural": the topic is about executing a method or a calculation (operations, algorithms, conversions). Examples: adding and subtracting integers; long division; simplifying fractions; percentages.',
    '  "mixed": both weigh about the same (a method that must also be justified), e.g. gcd and lcm.',
    "STEP 2 - skills. Choose ONLY skill ids from the catalogue, and ONLY ones that suit the topic_type: each catalogue line says which types it suits. A skill that does not suit the type must NOT be chosen (for example `drill`, quick calculation, is never right for a theoretical topic).",
    "Prefer 3-6 skills that really serve THIS topic over covering the catalogue. For each give how many exercises at difficulty 1 (basic), 2 (intermediate) and 3 (advanced); 0 where a level makes no sense or is not allowed. Typical totals per skill: 3-10; central skills get more.",
    "Answer with ONE JSON object and nothing else:",
    '{"topic_type":"theoretical|procedural|mixed","skills":[{"skill":"<id>","difficulties":{"1":n,"2":n,"3":n},"why":"<one short sentence in Spanish>"}],"summary":"<one sentence in Spanish>"}',
    "",
    `Catalogue for subject "${input.subject}":`,
    catalog,
  ].join("\n");

  const user = [
    `Topic: "${input.title}" (subject: ${input.subject}). Decide its topic_type yourself.`,
    input.currentSkills?.length ? `Currently declared skills: ${input.currentSkills.join(", ")}.` : "",
    templates ? `\nVault guidance:\n${templates}\n` : "",
    theory ? `\nTheory of the topic:\n${theory}\n` : "\n(The topic has no theory notes yet: decide from its title and type.)\n",
    "Return ONLY the JSON object.",
  ]
    .filter(Boolean)
    .join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

function clampCount(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(MAX_PER_CELL, n);
}

/** Extracts and validates the AI's JSON. Unknown skills are dropped; disallowed levels are zeroed. */
export function parsePracticePlan(
  reply: string,
  catalog: readonly CatalogSkill[],
  fallbackType?: TopicType,
): PracticePlan | null {
  let text = String(reply ?? "").trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  if (fence) text = fence[1]!.trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let raw: any;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!raw || !Array.isArray(raw.skills)) return null;

  const declared = String(raw.topic_type ?? "").trim().toLowerCase();
  const topicType = (["theoretical", "procedural", "mixed"].includes(declared) ? declared : fallbackType) as TopicType | undefined;
  const byId = new Map(catalog.map((s) => [s.id.toLowerCase(), s]));
  const seen = new Set<string>();
  const skills: PracticePlanSkill[] = [];
  for (const item of raw.skills) {
    const id = String(item?.skill ?? "").trim().toLowerCase();
    const def = byId.get(id);
    if (!def || seen.has(id)) continue;
    // A skill that does not suit the topic's nature is dropped, whatever the model said.
    if (topicType && !def.topicTypes.includes(topicType)) continue;
    const d = item?.difficulties ?? item?.counts ?? {};
    const counts = { 1: 0, 2: 0, 3: 0 } as Record<DifficultyLevel, number>;
    for (const level of LEVELS) {
      counts[level] = def.allowedDifficulties.includes(level) ? clampCount(d[level] ?? d[String(level)]) : 0;
    }
    if (counts[1] + counts[2] + counts[3] === 0) continue;
    seen.add(id);
    skills.push({ skill: id, counts, why: String(item?.why ?? "").replace(/\s+/g, " ").trim() });
  }
  if (!skills.length) return null;
  return { skills, summary: String(raw.summary ?? "").replace(/\s+/g, " ").trim(), ...(topicType ? { topicType } : {}) };
}

/** The plan as the `plan:` frontmatter value, e.g. `solve=3/4/2, process=2/3/0`. */
export function planToString(plan: PracticePlan): string {
  return plan.skills.map((s) => `${s.skill}=${s.counts[1]}/${s.counts[2]}/${s.counts[3]}`).join(", ");
}

/** How many exercises the plan wants for a skill at a difficulty; null when it says nothing. */
export function planCount(plan: PracticePlan | null, skill: string, difficulty: DifficultyLevel): number | null {
  const entry = plan?.skills.find((s) => s.skill === skill.trim().toLowerCase());
  if (!entry) return null;
  const n = entry.counts[difficulty];
  return n > 0 ? n : null;
}

const STAR_HEAD = ["★ Fácil", "★★ Media", "★★★ Difícil"];

/** The markdown block that goes into the `.practica.md`. */
export function renderPlanSection(plan: PracticePlan, labels: Record<string, string> = {}): string {
  const cell = (n: number) => (n > 0 ? String(n) : "—");
  const rows = plan.skills.map(
    (s) =>
      `| ${labels[s.skill] ?? s.skill} (\`${s.skill}\`) | ${cell(s.counts[1])} | ${cell(s.counts[2])} | ${cell(s.counts[3])} | ${s.why.replace(/\|/g, "/")} |`,
  );
  return [
    PLAN_START,
    "## Plan de práctica (IA)",
    plan.summary ? `> ${plan.summary}` : "",
    "",
    `| Competencia | ${STAR_HEAD.join(" | ")} | Por qué |`,
    "|---|---|---|---|---|",
    ...rows,
    "",
    `<!-- nv:plan:data ${JSON.stringify(plan)} -->`,
    PLAN_END,
  ]
    .filter((l, i, a) => !(l === "" && a[i - 1] === ""))
    .join("\n");
}

/** Reads the plan back out of a `.practica.md`; null when it has none or it is corrupt. */
export function readPlanFromPractica(text: string): PracticePlan | null {
  const a = text.indexOf(PLAN_START);
  const b = text.indexOf(PLAN_END);
  if (a < 0 || b < a) return null;
  const m = DATA_RE.exec(text.slice(a, b));
  if (!m) return null;
  try {
    const plan = JSON.parse(m[1]!) as PracticePlan;
    return Array.isArray(plan?.skills) ? plan : null;
  } catch {
    return null;
  }
}

/** Replaces `key: value` inside the frontmatter, or inserts it right before the closing fence. */
function setFrontmatterKey(text: string, key: string, value: string): string {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const m = /^(---\r?\n)([\s\S]*?)(\r?\n---)/.exec(text);
  if (!m) return text;
  const lines = m[2]!.split(/\r?\n/);
  const at = lines.findIndex((l) => new RegExp(`^${key}\\s*:`).test(l));
  const line = `${key}: ${value}`;
  if (at >= 0) lines[at] = line;
  else lines.push(line);
  return m[1] + lines.join(eol) + m[3] + text.slice(m[0].length);
}

/**
 * Stores the plan in a `.practica.md`: the frontmatter `skills:` (and `topic_type`)
 * follow the plan, and the plan section replaces the previous one (or is appended).
 * Everything else in the file is left byte for byte.
 */
export function applyPlanToPractica(text: string, plan: PracticePlan, labels: Record<string, string> = {}): string {
  let out = setFrontmatterKey(text, "skills", `[${plan.skills.map((s) => s.skill).join(", ")}]`);
  // The competency matrix reads this line: rows are these skills, cells these counts.
  out = setFrontmatterKey(out, "plan", `"${planToString(plan)}"`);
  if (plan.topicType) out = setFrontmatterKey(out, "topic_type", plan.topicType);
  const section = renderPlanSection(plan, labels);
  const a = out.indexOf(PLAN_START);
  const b = out.indexOf(PLAN_END);
  if (a >= 0 && b > a) return out.slice(0, a) + section + out.slice(b + PLAN_END.length);
  const eol = out.includes("\r\n") ? "\r\n" : "\n";
  return out.replace(/\s*$/, "") + eol + eol + section + eol;
}
