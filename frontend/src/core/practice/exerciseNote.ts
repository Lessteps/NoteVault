/**
 * Parse a practice note (frontmatter `type: exercise`) into an ExerciseNote.
 * Ported from notevault_app/core/practice/exercise_note.py.
 */

import * as path from "node:path";
import { parseFrontmatter } from "../frontmatter";
import { discipline_for, normalize_skill_code } from "./disciplineCatalog";
import { mode_for } from "./modes";

const _SECTION_KEYS: Record<string, string> = {
  enunciado: "statement",
  statement: "statement",
  codigo: "code",
  code: "code",
  pistas: "hints",
  hints: "hints",
  solucion: "solution",
  solution: "solution",
  rubrica: "rubric",
  rubric: "rubric",
  "errores tipicos": "typical_errors",
  "typical errors": "typical_errors",
  "senal de dominio": "mastery_signal",
  "mastery signal": "mastery_signal",
};

const _FENCE_RE = /^\s*(```|~~~)/;
const _CODE_BLOCK_RE = /^(```|~~~)[ \t]*([\w+#.-]*)[^\n]*\n([\s\S]*?)^\1[ \t]*$/m;
const _BULLET_RE = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/;
const _CHECKBOX_RE = /^\s*[-*+]\s+\[[ xX]\]\s*(?:\(\d+\)\s*)?(.*)$/;
const _TYPICAL_RE = /^\s*[-*+]\s+\*\*\s*([^*]+?)\s*:?\s*\*\*\s*:?\s*(.*)$/;

export class ExerciseNote {
  path: string | null;
  note_id: string;
  title: string;
  frontmatter: Record<string, any>;
  subject: string;
  discipline: string;
  skill: string;
  mode: string;
  difficulty: number;
  minutes: number;
  timer: string;
  assistance: string;
  level: string;
  statement: string;
  code: string;
  code_lang: string;
  hints: string[];
  solution: string;
  rubric: string[];
  typical_errors: [string, string][];
  mastery_signal: string;
  drill: string;
  items: number;

  constructor(fields: Partial<ExerciseNote>) {
    this.path = fields.path ?? null;
    this.note_id = fields.note_id ?? "";
    this.title = fields.title ?? "";
    this.frontmatter = fields.frontmatter ?? {};
    this.subject = fields.subject ?? "general";
    this.discipline = fields.discipline ?? "math_general";
    this.skill = fields.skill ?? "";
    this.mode = fields.mode ?? "solve";
    this.difficulty = fields.difficulty ?? 2;
    this.minutes = fields.minutes ?? 0;
    this.timer = fields.timer ?? "";
    this.assistance = fields.assistance ?? "helper";
    this.level = fields.level ?? "";
    this.statement = fields.statement ?? "";
    this.code = fields.code ?? "";
    this.code_lang = fields.code_lang ?? "";
    this.hints = fields.hints ?? [];
    this.solution = fields.solution ?? "";
    this.rubric = fields.rubric ?? [];
    this.typical_errors = fields.typical_errors ?? [];
    this.mastery_signal = fields.mastery_signal ?? "";
    this.drill = fields.drill ?? "";
    this.items = fields.items ?? 20;
  }
}

export function isPracticeFrontmatter(fm: unknown): boolean {
  return (
    typeof fm === "object" &&
    fm !== null &&
    String((fm as any).type || "").trim().toLowerCase() === "exercise"
  );
}
export const is_practice_frontmatter = isPracticeFrontmatter;

function _fold(text: string): string {
  const plain = (text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x00-\x7F]/g, "");
  return plain.toLowerCase().trim().split(/\s+/).join(" ");
}

function _splitHeadings(text: string, marker: string): [string[], [string, string][]] {
  const head: string[] = [];
  const parts: [string, string[]][] = [];
  let inFence = false;

  for (const line of text.split(/\r?\n/)) {
    if (_FENCE_RE.test(line)) {
      inFence = !inFence;
    } else if (!inFence && line.startsWith(marker)) {
      parts.push([line.slice(marker.length).trim(), []]);
      continue;
    }
    if (parts.length > 0) {
      parts[parts.length - 1]![1].push(line);
    } else {
      head.push(line);
    }
  }

  return [head, parts.map(([title, lines]) => [title, lines.join("\n").trim()])];
}

function _int(value: unknown, def: number): number {
  if (typeof value === "number") return Number.isFinite(value) ? Math.trunc(value) : def;
  const n = parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) ? n : def;
}

function _parseHints(text: string): string[] {
  const [head, subs] = _splitHeadings(text, "### ");
  if (subs.length > 0) {
    return subs.map(([, body]) => body).filter(Boolean);
  }
  const hints: string[] = [];
  for (const line of head) {
    const m = _BULLET_RE.exec(line);
    if (m) {
      hints.push(m[1]!.trim());
    } else if (line.trim() && hints.length > 0) {
      hints[hints.length - 1] += "\n" + line.trim();
    }
  }
  if (hints.length === 0 && text.trim()) {
    hints.push(text.trim());
  }
  return hints;
}

function _parseRubric(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const items: string[] = [];
  for (const line of lines) {
    const m = _CHECKBOX_RE.exec(line);
    if (m) items.push(m[1]!.trim());
  }
  if (items.length > 0) return items;

  for (const line of lines) {
    const m = _BULLET_RE.exec(line);
    if (m) items.push(m[1]!.trim());
  }
  return items;
}

function _parseTypicalErrors(text: string): [string, string][] {
  const out: [string, string][] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = _TYPICAL_RE.exec(line);
    if (m) {
      out.push([m[1]!.trim().toLowerCase(), m[2]!.trim()]);
    } else {
      const b = _BULLET_RE.exec(line);
      if (b) {
        out.push(["", b[1]!.trim()]);
      }
    }
  }
  return out;
}

export function parseExercise(text: string, filePath?: string | null): ExerciseNote {
  const [fm, body] = parseFrontmatter(text || "");
  const [head, parts] = _splitHeadings(body, "## ");
  const sections: Record<string, string> = {};

  for (const [title, content] of parts) {
    const key = _SECTION_KEYS[_fold(title)];
    if (key && !(key in sections)) {
      sections[key] = content;
    }
  }

  const h1Line = head.find((l) => l.startsWith("# "));
  const h1 = h1Line ? h1Line.slice(2).trim() : "";
  const stem = filePath ? path.parse(filePath).name : "";

  let code = sections.code || "";
  let codeLang = "";
  const block = _CODE_BLOCK_RE.exec(code);
  if (block) {
    codeLang = block[2]!.toLowerCase();
    code = block[3]!.replace(/\n$/, "");
  }

  const level = String(fm.level || "").trim().toUpperCase();
  let assistance = String(fm.assistance || "helper").trim().toLowerCase();
  if (assistance !== "helper" && assistance !== "nohelp") {
    assistance = "helper";
  }

  const timerVal = fm.timer;
  let timerStr = "";
  if (timerVal === false) {
    timerStr = "off";
  } else if (timerVal !== null && timerVal !== undefined) {
    timerStr = String(timerVal).trim();
  }

  return new ExerciseNote({
    path: filePath ?? null,
    note_id: String(fm.id || "").trim() || stem,
    title: String(fm.title || "").trim() || h1 || stem,
    frontmatter: fm,
    subject: String(fm.subject || "general").trim().toLowerCase(),
    discipline: discipline_for(fm).id,
    skill: normalize_skill_code(fm.skill),
    mode: mode_for(fm).id,
    difficulty: Math.max(1, Math.min(5, _int(fm.difficulty, 2))),
    minutes: Math.max(0, _int(fm.minutes, 0)),
    timer: timerStr,
    assistance,
    level,
    statement: sections.statement || "",
    code,
    code_lang: codeLang,
    hints: _parseHints(sections.hints || ""),
    solution: sections.solution || "",
    rubric: _parseRubric(sections.rubric || ""),
    typical_errors: _parseTypicalErrors(sections.typical_errors || ""),
    mastery_signal: sections.mastery_signal || "",
    drill: String(fm.drill || "").trim().toLowerCase(),
    items: Math.max(1, _int(fm.items, 20)),
  });
}
export const parse_exercise = parseExercise;
