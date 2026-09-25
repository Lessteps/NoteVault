/**
 * Proof ladder: practice levels for theorem (proof) notes.
 *
 * L1 strategy recall · L2 order the shuffled steps (checked locally) · L3 fill the hidden
 * steps · L4 justify every step · L5 blank proof · L6 prove a variant. Every level is its
 * own SRS item (`entity_type="proof_L<n>"`); passing a level unlocks the next one and
 * failing drops one level. The note is only read: `parse_proof` is the one place that
 * knows its format.
 */

import * as path from "node:path";
import { parseFrontmatter } from "../frontmatter.js";
import { ERROR_CATEGORIES } from "../studyErrorManager.js";
import { ExerciseNote } from "./exerciseNote.js";
import { JSON_CONTRACT, type GradeResult } from "./grading.js";

export const PASS_SCORE = 75;
export const MAX_RECENT_ERRORS = 15;
export const PROOF_TYPES = new Set([
  "theorem",
  "teorema",
  "proof",
  "demostracion",
  "demostraci\u00f3n",
  "lemma",
  "lema",
  "proposition",
  "proposicion",
  "proposici\u00f3n",
  "corollary",
  "corolario",
]);
export const MIN_STEPS = 2;

export interface ProofStep {
  text: string;
  why: string;
}

export interface ProofNote {
  path: string | null;
  note_id: string;
  title: string;
  frontmatter: Record<string, any>;
  subject: string;
  difficulty: number;
  technique: string;
  statement: string;
  hypotheses: string[];
  conclusion: string;
  strategy: string;
  key_idea: string;
  steps: ProofStep[];
  variants: string[];
}

export interface Level {
  number: number;
  label: string;
  task: string;
  act: string;
  timer: string;
}

export const LEVELS: Record<number, Level> = {
  1: {
    number: 1,
    label: "Estrategia",
    task:
      "Sin mirar la demostraci\u00f3n, escribe la estrategia (qu\u00e9 t\u00e9cnica usas y sobre qu\u00e9) " +
      "y la idea clave que hace funcionar la prueba.",
    act:
      "Strategy recall: the learner states the proof technique, what it is applied to " +
      "and the key idea, without writing the proof.",
    timer: "5m",
  },
  2: {
    number: 2,
    label: "Ordenar pasos",
    task:
      "Los pasos de la demostraci\u00f3n est\u00e1n desordenados. Arr\u00e1stralos hasta dejarlos en " +
      "el orden en que se deducen.",
    act: "Order the shuffled steps of the proof.",
    timer: "stopwatch",
  },
  3: {
    number: 3,
    label: "Completar pasos",
    task:
      "Algunos pasos est\u00e1n ocultos. Escribe cada paso que falta, con su justificaci\u00f3n.",
    act:
      "Fill the hidden steps: the learner sees the other steps and writes each missing " +
      "step with its justification.",
    timer: "10m",
  },
  4: {
    number: 4,
    label: "Justificar",
    task:
      "Tienes todos los pasos. Escribe para cada uno por qu\u00e9 es v\u00e1lido: qu\u00e9 hip\u00f3tesis, " +
      "definici\u00f3n o resultado lo permite.",
    act:
      "Justify each step: every step is shown and the learner writes why it is valid " +
      "(which hypothesis, definition, previous step or result allows it).",
    timer: "15m",
  },
  5: {
    number: 5,
    label: "En blanco",
    task:
      "Escribe la demostraci\u00f3n completa desde cero, paso a paso y justificando cada paso.",
    act: "Blank proof: the learner writes the complete proof from scratch.",
    timer: "pomodoro",
  },
  6: {
    number: 6,
    label: "Variante",
    task:
      "Demuestra la variante elegida. Puedes reutilizar la t\u00e9cnica de la demostraci\u00f3n " +
      "original, pero la prueba tiene que valer para el nuevo enunciado.",
    act:
      "Prove a variant of the theorem. The original proof is only a reference for the " +
      "technique; the judge must check the learner's proof of the variant on its own " +
      "merits (if the variant asks to find where a proof breaks or to decide whether a " +
      "claim is true, judge that answer instead).",
    timer: "pomodoro",
  },
};

// ── Parsing ───────────────────────────────────────────────────────────────

function _fold(text: string): string {
  const plain = text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  return plain
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .trim()
    .split(/\s+/)
    .join(" ");
}

const _SECTIONS: Record<string, string> = {
  enunciado: "statement",
  statement: "statement",
  teorema: "statement",
  hipotesis: "hypotheses",
  hypotheses: "hypotheses",
  conclusion: "conclusion",
  estrategia: "strategy",
  strategy: "strategy",
  "idea clave": "key_idea",
  "key idea": "key_idea",
  demostracion: "proof",
  prueba: "proof",
  proof: "proof",
  "variantes para practicar": "variants",
  variantes: "variants",
  variants: "variants",
};

const _FENCE_RE = /^\s*(```|~~~)/;
const _NUM_ITEM_RE = /^\s{0,3}\d+[.)]\s+(.*)$/;
const _BULLET_RE = /^\s{0,3}(?:[-*+]|\d+[.)])\s+(.*)$/;

function _label(w: string): string {
  return `(?:(?:\\*\\*|__|\\*|_)\\s*\\b${w}\\s*:?\\s*(?:\\*\\*|__|\\*|_)\\s*:?|\\b${w}\\s*:)`;
}

const _STEP_RE = new RegExp(`\\s*${_label("(?:paso|step)(?:\\s*\\d+)?")}`, "i");
const _WHY_RE = new RegExp(
  _label("(?:por\\s*qu[e\u00e9]|porque|justificaci[o\u00f3]n|raz[o\u00f3]n|why)"),
  "i"
);

function _splitH2(body: string): [string[], Record<string, string>] {
  const head: string[] = [];
  const sections: Record<string, string[]> = {};
  let current: string | null = null;
  let inFence = false;

  for (const line of (body || "").split(/\r?\n/)) {
    if (_FENCE_RE.test(line)) {
      inFence = !inFence;
    } else if (!inFence && line.startsWith("## ")) {
      const key = _SECTIONS[_fold(line.slice(3))];
      current = key && !sections[key] ? key : null;
      if (current) {
        sections[current] = [];
      }
      continue;
    }
    if (current) {
      if (!sections[current]) sections[current] = [];
      sections[current]!.push(line);
    } else if (Object.keys(sections).length === 0) {
      head.push(line);
    }
  }

  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(sections)) {
    out[k] = v.join("\n").trim();
  }
  return [head, out];
}

function _bullets(text: string): string[] {
  const items: string[] = [];
  for (const line of (text || "").split(/\r?\n/)) {
    const m = _BULLET_RE.exec(line);
    if (m && m[1]) {
      items.push(m[1].trim());
    } else if (line.trim() && items.length > 0) {
      items[items.length - 1] += " " + line.trim();
    }
  }
  return items.filter(Boolean);
}

function _splitStep(text: string): ProofStep {
  const trimmed = text.trim();
  const stepM = _STEP_RE.exec(trimmed);
  let start = 0;
  if (stepM && stepM.index === 0) {
    start = stepM[0].length;
  }
  const sub = trimmed.slice(start);
  const whyM = _WHY_RE.exec(sub);
  let body: string;
  let why: string;
  if (whyM) {
    body = sub.slice(0, whyM.index);
    why = sub.slice(whyM.index + whyM[0].length);
  } else {
    body = sub;
    why = "";
  }
  return {
    text: body.trim().split(/\s+/).join(" "),
    why: why.trim().split(/\s+/).join(" "),
  };
}

function _proofSteps(text: string): ProofStep[] {
  let chunks: string[][] = [];
  let inFence = false;
  for (const line of (text || "").split(/\r?\n/)) {
    if (_FENCE_RE.test(line)) {
      inFence = !inFence;
    }
    const m = inFence ? null : _NUM_ITEM_RE.exec(line);
    if (m && m[1]) {
      chunks.push([m[1]]);
    } else if (chunks.length > 0) {
      chunks[chunks.length - 1]!.push(line.trim());
    }
  }
  if (chunks.length === 0) {
    const parts: string[][] = [];
    for (const line of (text || "").split(/\r?\n/)) {
      if (line.startsWith("### ")) {
        parts.push([]);
      } else if (parts.length > 0) {
        parts[parts.length - 1]!.push(line.trim());
      }
    }
    chunks = parts;
  }
  const steps = chunks.map((c) => _splitStep(c.join("\n")));
  return steps.filter((s) => Boolean(s.text));
}

function _int(value: any, fallback: number): number {
  const n = parseInt(String(value), 10);
  return Number.isNaN(n) ? fallback : n;
}

export function isProofFrontmatter(fm: any): boolean {
  return typeof fm === "object" && fm !== null && PROOF_TYPES.has(_fold(String(fm.type || "")));
}

export const is_proof_frontmatter = isProofFrontmatter;

export function parseProof(text: string, filePath?: string | null): ProofNote {
  const [data, body] = parseFrontmatter(text || "");
  const fm = (data as Record<string, any>) || {};
  const [head, sec] = _splitH2(body);
  let h1 = "";
  for (const line of head) {
    if (line.startsWith("# ")) {
      h1 = line.slice(2).trim();
      break;
    }
  }
  const stem = filePath ? path.basename(filePath, path.extname(filePath)) : "";

  return {
    path: filePath ? path.resolve(filePath) : null,
    note_id: String(fm.id ?? "").trim() || stem,
    title: String(fm.title ?? "").trim() || h1 || stem,
    frontmatter: fm,
    subject: String(fm.subject ?? "mathematics").trim().toLowerCase(),
    difficulty: Math.max(1, Math.min(5, _int(fm.difficulty, 2))),
    technique: String(fm.technique ?? "").trim(),
    statement: sec.statement || "",
    hypotheses: _bullets(sec.hypotheses || ""),
    conclusion: sec.conclusion || "",
    strategy: sec.strategy || "",
    key_idea: sec.key_idea || "",
    steps: _proofSteps(sec.proof || ""),
    variants: _bullets(sec.variants || ""),
  };
}

export const parse_proof = parseProof;

export function ladderNote(text: string, filePath?: string | null): ProofNote | null {
  try {
    const [data] = parseFrontmatter(text || "");
    const fm = (data as Record<string, any>) || {};
    if (!isProofFrontmatter(fm)) {
      return null;
    }
    const proof = parseProof(text, filePath);
    return proof.steps.length >= MIN_STEPS ? proof : null;
  } catch {
    return null;
  }
}

export const ladder_note = ladderNote;

// ── Levels and progress ───────────────────────────────────────────────────

export function availableLevels(proof: ProofNote): number[] {
  return [1, 2, 3, 4, 5, ...(proof.variants && proof.variants.length > 0 ? [6] : [])];
}

export const available_levels = availableLevels;

export function modeId(level: number): string {
  return `proof_L${Math.floor(level)}`;
}

export const mode_id = modeId;

export function levelOf(mode: any): number {
  const m = /^proof_L(\d)$/.exec(String(mode || ""));
  return m && m[1] ? parseInt(m[1], 10) : 0;
}

export const level_of = levelOf;

export function passed(score: any, solutionSeen: boolean = false): boolean {
  return _int(score, 0) >= PASS_SCORE && !solutionSeen;
}

export function nextLevel(current: number, level: number, ok: boolean, top: number): number {
  if (ok) {
    return Math.min(top, Math.max(current, level + 1));
  }
  return Math.max(1, Math.min(current, level - 1));
}

export const next_level = nextLevel;

export class LadderState {
  current: number;
  top: number;
  passed: Set<number>;
  best: Record<number, number>;
  count: Record<number, number>;

  constructor(top: number = 5) {
    this.current = 1;
    this.top = top;
    this.passed = new Set();
    this.best = {};
    this.count = {};
  }

  unlocked(level: number): boolean {
    return 1 <= level && level <= this.current;
  }
}

export function ladderState(attempts: Array<Record<string, any>>, top: number): LadderState {
  const state = new LadderState(top);
  for (const att of attempts) {
    const level = levelOf(att.mode);
    if (!(1 <= level && level <= top)) {
      continue;
    }
    const score = _int(att.score, 0);
    const ok = passed(score, Boolean(att.solution_seen));
    state.count[level] = (state.count[level] || 0) + 1;
    state.best[level] = Math.max(state.best[level] || 0, score);
    if (ok) {
      state.passed.add(level);
    }
    state.current = nextLevel(state.current, level, ok, top);
  }
  return state;
}

export const ladder_state = ladderState;

// ── Level content ─────────────────────────────────────────────────────────

function createRng(seed: any): () => number {
  let h = 0;
  const s = String(seed);
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return function () {
    h = Math.imul(h ^ (h >>> 15), 1 | h);
    h ^= h + Math.imul(h ^ (h >>> 7), 61 | h) ^ h;
    return ((h ^ (h >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffledOrder(n: number, seed: any): number[] {
  const order = Array.from({ length: n }, (_, i) => i);
  if (n < 2) return order;
  const rng = createRng(seed);
  const isSorted = (arr: number[]) => arr.every((v, i) => v === i);
  while (isSorted(order)) {
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = order[i]!;
      order[i] = order[j]!;
      order[j] = tmp;
    }
  }
  return order;
}

export const shuffled_order = shuffledOrder;

export function checkOrder(order: number[]): boolean[] {
  return order.map((step, pos) => step === pos);
}

export const check_order = checkOrder;

export function hiddenSteps(n: number, seed: any): number[] {
  const k = Math.max(1, Math.floor(n / 2));
  const pool = Array.from({ length: n }, (_, i) => i);
  const rng = createRng(seed);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = pool[i]!;
    pool[i] = pool[j]!;
    pool[j] = tmp;
  }
  const sample = pool.slice(0, k);
  sample.sort((a, b) => a - b);
  return sample;
}

export const hidden_steps = hiddenSteps;

export function rubricFor(
  proof: ProofNote,
  level: number,
  hidden?: number[] | null
): string[] {
  const n = proof.steps.length;
  if (level === 1) {
    return [
      "Nombra la t\u00e9cnica de demostraci\u00f3n adecuada",
      "Dice sobre qu\u00e9 se aplica (variable, objeto, caso de partida)",
      "Formula la idea clave que hace funcionar la prueba",
    ];
  }
  if (level === 2) {
    return Array.from({ length: n }, (_, i) => `Paso ${i + 1} en su lugar`);
  }
  if (level === 3) {
    return (hidden || []).map((i) => `Paso ${i + 1} correcto y justificado`);
  }
  if (level === 4) {
    return Array.from({ length: n }, (_, i) => `Justificaci\u00f3n del paso ${i + 1}`);
  }
  return [
    "Plantea una estrategia que sirve para el enunciado",
    "No falta ning\u00fan paso necesario",
    "Cada paso est\u00e1 justificado",
    "Usa las hip\u00f3tesis donde hacen falta",
    "Llega exactamente a la conclusi\u00f3n, sin circularidad",
  ];
}

export const rubric_for = rubricFor;

export function proofMarkdown(proof: ProofNote, withWhy: boolean = true): string {
  const lines: string[] = [];
  proof.steps.forEach((step, idx) => {
    lines.push(`${idx + 1}. **Paso:** ${step.text}`);
    if (withWhy && step.why) {
      lines.push(`   **Por qu\u00e9:** ${step.why}`);
    }
  });
  return lines.join("\n");
}

export const proof_markdown = proofMarkdown;

export function statementMarkdown(proof: ProofNote): string {
  const parts: string[] = [proof.statement.trim() || `_${proof.title}_`];
  if (proof.hypotheses && proof.hypotheses.length > 0) {
    parts.push(
      "**Hip\u00f3tesis**\n\n" + proof.hypotheses.map((h) => `- ${h}`).join("\n")
    );
  }
  if (proof.conclusion.trim()) {
    parts.push(`**Conclusi\u00f3n:** ${proof.conclusion.trim()}`);
  }
  return parts.join("\n\n");
}

export const statement_markdown = statementMarkdown;

export function levelExercise(
  proof: ProofNote,
  level: number,
  rubric: string[]
): ExerciseNote {
  return new ExerciseNote({
    path: proof.path,
    note_id: proof.note_id,
    title: `${proof.title} \u00b7 L${level}`,
    frontmatter: proof.frontmatter,
    subject: proof.subject || "mathematics",
    discipline: "math_general",
    skill: "01",
    mode: modeId(level),
    difficulty: proof.difficulty,
    minutes: 0,
    timer: LEVELS[level]?.timer || "pomodoro",
    assistance: "helper",
    level: "",
    statement: statementMarkdown(proof),
    solution: proofMarkdown(proof),
    rubric: [...rubric],
  });
}

export const level_exercise = levelExercise;

export function localOrderResult(order: number[]): GradeResult {
  const hits = checkOrder(order);
  const n = hits.length;
  const wrong: number[] = [];
  hits.forEach((ok, i) => {
    if (!ok) wrong.push(i + 1);
  });
  const score = n ? Math.round((100 * (n - wrong.length)) / n) : 0;
  if (wrong.length === 0) {
    return {
      score: 100,
      verdict: "correct",
      rubric: hits,
      errors: [],
      feedback: "Orden correcto: cada paso se apoya solo en los anteriores.",
      next_step: "Sube al nivel 3: completa los pasos ocultos.",
      example: "",
      raw: "",
    };
  }
  const positions = wrong.join(", ");
  return {
    score,
    verdict: score >= 40 ? "partial" : "incorrect",
    rubric: hits,
    errors: [
      {
        category: "logical",
        anchor: "",
        description: `Proof steps placed out of order at positions ${positions}.`,
        evidence: "",
        fix: "Place each step after every step it relies on.",
      },
    ],
    feedback: `Hay ${wrong.length} paso(s) fuera de su lugar (posiciones ${positions}). Preg\u00fantate de qu\u00e9 pasos anteriores depende cada uno.`,
    next_step: "Lee de nuevo la estrategia y repite el orden sin mirar la nota.",
    example: "",
    raw: "",
  };
}

export const local_order_result = localOrderResult;

// ── Grading messages ──────────────────────────────────────────────────────

function _formatError(err: Record<string, any>): string {
  const parts = [`[x${err.repeat_count || 1}] ${err.category || ""}`];
  if (err.anchor) {
    parts.push(`anchor: "${err.anchor}"`);
  }
  const text =
    err.description_en || err.explanation || err.wrong_answer || "";
  return "- " + parts.join(" \u00b7 ") + (text ? ` \u2014 ${text}` : "");
}

function _section(title: string, body: string): string {
  return `## ${title}\n${body.trim() || "(none)"}`;
}

export function buildLadderMessages(
  proof: ProofNote,
  level: number,
  answer: string,
  options: {
    rubric: string[];
    shown: string;
    seconds: number;
    solution_seen: boolean;
    recent_errors?: Record<string, any>[];
    variant?: string;
  }
): Array<{ role: string; content: string }> {
  const lv = LEVELS[level] || { label: `L${level}`, act: "", task: "" };
  const system = [
    "You are NoteVault's practice judge: a demanding but kind mathematics teacher " +
      "grading one level of a proof-practice ladder.",
    "",
    `Subject: ${proof.subject}. Level L${level} (${lv.label}): ${lv.act}`,
    "What to check: every claim is correct and justified, hypotheses are used where " +
      "needed, there is no circular reasoning, and the answer reaches exactly what the " +
      "task asks. Accept any valid equivalent argument or wording, not only the model.",
    "",
    "Grading rules:",
    "- Score 0-100. Mark each rubric item true only when the answer clearly satisfies it.",
    `- Classify every real error with one category of: ${ERROR_CATEGORIES.join(", ")}.`,
    '- Write "feedback" and "next_step" in Spanish; write "description" and "fix" ' +
      "in English. Use LaTeX between $...$ for formulas.",
    '- Never reveal the full proof unless the verdict is "correct". Otherwise name the ' +
      'concept that blocks the learner and ask one guiding question in "next_step".',
    '- Always include a short corrected "example" when there is an error.',
    "- If the learner repeats one of their recent errors, say so in the feedback.",
    "",
    "Reply with ONLY one JSON object, no prose before or after it, with this shape:",
    JSON_CONTRACT,
  ].join("\n");

  const model: string[] = [];
  if (proof.strategy) {
    model.push(`Strategy: ${proof.strategy}`);
  }
  if (proof.key_idea) {
    model.push(`Key idea: ${proof.key_idea}`);
  }
  model.push(proofMarkdown(proof));

  const rubricTxt = options.rubric.map((item, i) => `${i + 1}. ${item}`).join("\n");
  const recentErrList = (options.recent_errors || []).slice(0, MAX_RECENT_ERRORS);
  const recent = recentErrList.map(_formatError).join("\n");
  const totalSeconds = Math.max(0, Math.floor(options.seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;

  const parts = [
    `# Proof: ${proof.title} (${proof.note_id}) \u2014 level L${level}`,
    _section("Theorem", statementMarkdown(proof)),
    options.variant ? _section("Variant the learner must prove", options.variant) : "",
    _section("Task given to the learner", lv.task),
    options.shown ? _section("What the learner was shown", options.shown) : "",
    _section(
      `Rubric (${options.rubric.length} items, return one boolean per item in order)`,
      rubricTxt
    ),
    _section(
      "Model proof of the original theorem (for the judge only, do not reveal unless correct)",
      model.join("\n\n")
    ),
    _section("Learner's recent unresolved errors in this subject", recent),
    _section("Learner's answer", answer),
    _section(
      "Context",
      `Time spent: ${minutes} min ${secs} s. Model proof seen before answering: ${options.solution_seen ? "yes" : "no"}.`
    ),
  ];

  return [
    { role: "system", content: system },
    { role: "user", content: parts.filter(Boolean).join("\n\n") },
  ];
}

export const build_ladder_messages = buildLadderMessages;
