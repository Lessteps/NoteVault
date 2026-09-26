/**
 * Grading prompt for the AI judge and parsing of its JSON reply.
 * Ported from notevault_app/core/practice/grading.py.
 */

import { DISCIPLINES, skill_of } from "./disciplineCatalog";
import { ExerciseNote } from "./exerciseNote";
import { MODES } from "./modes";

export const ERROR_CATEGORIES = [
  "conceptual",
  "logical",
  "procedural",
  "calculation",
  "syntax",
  "implementation",
  "grammar",
  "vocabulary",
  "listening",
  "reading",
  "pronunciation",
] as const;

export type ErrorCategory = (typeof ERROR_CATEGORIES)[number];

export const MAX_RECENT_ERRORS = 15;

export const JSON_CONTRACT = `{
  "score": 0,
  "verdict": "correct | partial | incorrect",
  "rubric": [true, false, true, true, false],
  "errors": [
    {"category": "one of: ${ERROR_CATEGORIES.join(", ")}",
     "anchor": "exact anchor text from the list, or \\"\\"",
     "description": "English, one sentence",
     "evidence": "short quote from the answer",
     "fix": "English, how to fix it"}
  ],
  "feedback": "Spanish, 2-5 sentences, teacher voice",
  "next_step": "Spanish, one concrete action",
  "example": "short corrected snippet (code, SQL, command, formula or sentence)"
}`;

const _VERDICTS: Record<string, string> = {
  correct: "correct",
  correcto: "correct",
  correcta: "correct",
  partial: "partial",
  "partially correct": "partial",
  parcial: "partial",
  incorrect: "incorrect",
  incorrecto: "incorrect",
  incorrecta: "incorrect",
  wrong: "incorrect",
};

const _TRUE_WORDS = new Set(["true", "yes", "si", "sí", "1", "x", "ok"]);
const _FENCED_JSON_RE = /```(?:json)?\s*\n([\s\S]*?)```/gi;

export interface GradeError {
  category: string;
  anchor: string;
  description: string;
  evidence: string;
  fix: string;
}

export interface GradeResult {
  score: number;
  verdict: string;
  rubric: boolean[];
  errors: GradeError[];
  feedback: string;
  next_step: string;
  example: string;
  raw?: string;
}

export class GradeParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GradeParseError";
  }
}

function _section(title: str, body: string): string {
  return `## ${title}\n${body.trim() || "(none)"}`;
}

type str = string;

function _systemMessage(ex: ExerciseNote): string {
  const mode = MODES[ex.mode] || MODES["solve"]!;
  const discipline = DISCIPLINES[ex.discipline] || DISCIPLINES["math_general"]!;
  const skill = skill_of(discipline, ex.skill);

  const lines = [
    "You are NoteVault's practice judge: a demanding but kind teacher. You never execute " +
      "code, SQL or commands; you read them and reason about their behaviour, as a teacher " +
      "would on paper.",
    "",
    `Subject: ${ex.subject}. Discipline: ${discipline.id} (${discipline.title}).`,
    `Cognitive act (mode '${mode.id}'): ${mode.act}`,
    `What to check for this act: ${mode.judge_focus}`,
    `Exercise framing rules: ${discipline.framing}`,
  ];

  if (skill) {
    lines.push(`Target skill ${skill.code}: ${skill.title}.`);
    lines.push(
      'Known failure modes (anchors) for this skill; when an error matches one, copy its text exactly into the error\'s "anchor" field:',
    );
    for (const a of skill.anchors) {
      lines.push(`- ${a}`);
    }
  }

  if (ex.frontmatter.chapter) {
    lines.push(`Current chapter (mandatory focus): ${ex.frontmatter.chapter}`);
  }
  if (ex.level) {
    lines.push(
      `Target CEFR level: ${ex.level}. Judge accuracy and range against that level; do not penalize the absence of structures above it.`,
    );
  }

  lines.push(
    "",
    "Grading rules:",
    "- Score 0-100. Mark each rubric item true only when the answer clearly satisfies it.",
    `- Classify every real error with one category of: ${ERROR_CATEGORIES.join(", ")}.`,
    '- Write "feedback" and "next_step" in Spanish; write "description" and "fix" in English.',
    '- Never reveal the full solution unless the verdict is "correct". Otherwise name ' +
      'the concept that blocks the learner and ask one guiding question in "next_step".',
    '- Always include a short corrected "example" when there is an error.',
    "- If the learner repeats one of their recent errors, say so in the feedback.",
    "",
    "Reply with ONLY one JSON object, no prose before or after it, with this shape:",
    JSON_CONTRACT,
  );

  return lines.join("\n");
}

function _formatError(err: Record<string, any>): string {
  const parts = [`[x${err.repeat_count || 1}] ${err.category || ""}`];
  if (err.anchor) {
    parts.push(`anchor: "${err.anchor}"`);
  }
  const text = err.description_en || err.explanation || err.wrong_answer || "";
  return "- " + parts.join(" · ") + (text ? ` — ${text}` : "");
}

export function buildGradingMessages(
  ex: ExerciseNote,
  answer: string,
  hintsUsedOrOptions?:
    | number
    | {
        hints_used?: number;
        seconds?: number;
        solution_seen?: boolean;
        recent_errors?: Record<string, any>[];
      },
  seconds = 0,
  solutionSeen = false,
  recentErrors: Record<string, any>[] = [],
): Array<{ role: string; content: string }> {
  let hintsUsed = 0;
  let sec = seconds;
  let seen = solutionSeen;
  let errors = recentErrors;

  if (typeof hintsUsedOrOptions === "object" && hintsUsedOrOptions !== null) {
    hintsUsed = hintsUsedOrOptions.hints_used ?? 0;
    sec = hintsUsedOrOptions.seconds ?? 0;
    seen = hintsUsedOrOptions.solution_seen ?? false;
    errors = hintsUsedOrOptions.recent_errors ?? [];
  } else if (typeof hintsUsedOrOptions === "number") {
    hintsUsed = hintsUsedOrOptions;
  }

  let code = "";
  if (ex.code) {
    code = `\`\`\`${ex.code_lang}\n${ex.code}\n\`\`\``;
  }
  const rubric = ex.rubric.map((item, i) => `${i + 1}. ${item}`).join("\n");
  const typical = ex.typical_errors.map(([cat, text]) => `- ${cat || "general"}: ${text}`).join("\n");
  const recent = errors
    .slice(0, MAX_RECENT_ERRORS)
    .map(_formatError)
    .join("\n");

  const totalSecs = Math.max(0, Math.trunc(sec));
  const minutes = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;

  const parts = [
    `# Exercise: ${ex.title} (${ex.note_id})`,
    _section("Statement", ex.statement),
    code ? _section("Given code", code) : "",
    _section(`Rubric (${ex.rubric.length} items, return one boolean per item in order)`, rubric),
    _section("Model solution (for the judge only, do not reveal unless correct)", ex.solution),
    _section("Typical errors (for the judge only)", typical),
    ex.mastery_signal ? _section("Mastery signal (for the judge only)", ex.mastery_signal) : "",
    _section("Learner's recent unresolved errors in this subject", recent),
    _section("Learner's answer", answer),
    _section(
      "Context",
      `Hints used: ${hintsUsed} of ${ex.hints.length}. ` +
        `Time spent: ${minutes} min ${secs} s. ` +
        `Model solution seen before answering: ${seen ? "yes" : "no"}.`,
    ),
  ];

  return [
    { role: "system", content: _systemMessage(ex) },
    { role: "user", content: parts.filter(Boolean).join("\n\n") },
  ];
}
export const build_grading_messages = buildGradingMessages;

function _findJsonObject(text: string): Record<string, any> | null {
  const stripped = text.trim();
  const candidates: string[] = [stripped];

  let match: RegExpExecArray | null;
  const fenceRe = new RegExp(_FENCED_JSON_RE.source, "gi");
  while ((match = fenceRe.exec(text)) !== null) {
    candidates.push(match[1]!.trim());
  }

  for (const candidate of candidates) {
    try {
      const data = JSON.parse(candidate);
      if (typeof data === "object" && data !== null && !Array.isArray(data)) {
        return data;
      }
    } catch {
      // continue
    }
  }

  // Scan for balanced braces {...}
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "{") {
      let depth = 0;
      let inString = false;
      let escape = false;
      for (let j = i; j < text.length; j++) {
        const c = text[j]!;
        if (escape) {
          escape = false;
          continue;
        }
        if (c === "\\") {
          escape = true;
          continue;
        }
        if (c === '"') {
          inString = !inString;
          continue;
        }
        if (!inString) {
          if (c === "{") depth++;
          else if (c === "}") {
            depth--;
            if (depth === 0) {
              const sub = text.slice(i, j + 1);
              try {
                const data = JSON.parse(sub);
                if (typeof data === "object" && data !== null && !Array.isArray(data)) {
                  return data;
                }
              } catch {
                // continue search
              }
              break;
            }
          }
        }
      }
    }
  }

  return null;
}

function _asBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  return _TRUE_WORDS.has(String(value ?? "").trim().toLowerCase());
}

function _asScore(value: unknown): number {
  if (typeof value === "number") {
    return Math.max(0, Math.min(100, Math.round(value)));
  }
  const s = String(value ?? "");
  const m = /-?\d+(?:\.\d+)?/.exec(s);
  if (m) {
    const n = Math.round(parseFloat(m[0]!));
    return Math.max(0, Math.min(100, Number.isFinite(n) ? n : 0));
  }
  return 0;
}

function _verdict(value: unknown, score: number): string {
  const v = _VERDICTS[String(value ?? "").trim().toLowerCase()];
  if (v) return v;
  return score >= 90 ? "correct" : score >= 40 ? "partial" : "incorrect";
}

function _gradeError(item: unknown): GradeError | null {
  let obj: Record<string, any>;
  if (typeof item === "string") {
    obj = { description: item };
  } else if (typeof item === "object" && item !== null) {
    obj = item as Record<string, any>;
  } else {
    return null;
  }
  const category = String(obj.category || "").trim().toLowerCase();
  const validCat = (ERROR_CATEGORIES as readonly string[]).includes(category)
    ? category
    : "conceptual";
  return {
    category: validCat,
    anchor: String(obj.anchor || "").trim(),
    description: String(obj.description || "").trim(),
    evidence: String(obj.evidence || "").trim(),
    fix: String(obj.fix || "").trim(),
  };
}

export function parseGradeReply(text: string, rubricLen: number): GradeResult {
  const data = _findJsonObject(text || "");
  if (!data) {
    throw new GradeParseError(
      "No se encontró un objeto JSON con la corrección en la respuesta de la IA.",
    );
  }

  const score = _asScore(data.score);
  const rawRubric = Array.isArray(data.rubric) ? data.rubric : [];
  let rubric = rawRubric.map(_asBool);
  while (rubric.length < rubricLen) {
    rubric.push(false);
  }
  rubric = rubric.slice(0, Math.max(0, rubricLen));

  const rawErrors = Array.isArray(data.errors) ? data.errors : [];
  const errors: GradeError[] = rawErrors.map(_gradeError).filter((e): e is GradeError => e !== null);

  return {
    score,
    verdict: _verdict(data.verdict, score),
    rubric,
    errors,
    feedback: String(data.feedback || "").trim(),
    next_step: String(data.next_step || "").trim(),
    example: String(data.example || "").trim(),
    raw: text || "",
  };
}
export const parse_grade_reply = parseGradeReply;

export function qualityFrom(
  result: GradeResult,
  hintsUsed: number,
  solutionSeen: boolean,
): number {
  const score = result.score;
  let quality =
    score >= 90
      ? 5
      : score >= 75
        ? 4
        : score >= 60
          ? 3
          : score >= 40
            ? 2
            : score >= 20
              ? 1
              : 0;
  if (hintsUsed >= 2) {
    quality -= 1;
  }
  if (solutionSeen) {
    quality = Math.min(quality, 2);
  }
  return Math.max(0, quality);
}
export const quality_from = qualityFrom;
