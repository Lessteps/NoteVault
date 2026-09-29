/**
 * Fase 1 · migración de tipos de tema.
 *
 * Da a cada manifiesto de tema un `topic_type` (teórico · procedimental · mixto) y,
 * solo cuando el tema lleva **el catálogo entero de la materia** (el defecto que
 * hacía que lógica y demostración ofreciesen «Cálculo rápido»), lo estrecha a lo que
 * recomienda el catálogo para su tipo. Un tema con skills propias y más cortas se
 * deja como está: eso fue una decisión, no el defecto.
 *
 * Idempotente y textual: se toca el bloque de frontmatter línea a línea (nunca se
 * re-serializa YAML, que recita comillas y convierte `number: "1.1"` en número) y el
 * cuerpo queda byte a byte. Dry run por defecto.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { parseFrontmatter } from "../src/core/frontmatter";
import { MODES, PRACTICE_ALIASES } from "../src/core/practice/modes";
import { catalogFor, recommendSkillsForTopic, theoreticalSkills } from "../src/core/practice/skillSelection";
import { detectTopicType, type TopicType } from "../src/core/practice/topicType";

const SKIP_DIRS = new Set([
  ".git", ".trash", ".notevault", "node_modules", "dist", "build", "release",
  "__pycache__", ".venv", "PROJECTS", ".codegraph", ".idea",
]);

export interface PlanItem {
  /** Vault-relative POSIX path of the `.practica` file. */
  file: string;
  title: string;
  subject: string;
  type: TopicType;
  /** De dónde salió el tipo. */
  source: string;
  why: string;
  skillsBefore: string[];
  skillsAfter: string[];
  /** `none` cuando la segunda pasada no tiene nada que hacer. */
  action: "none" | "topic_type" | "topic_type+skills";
  /** Texto nuevo del fichero (undefined cuando no hay cambios). */
  next?: string;
}

function walkPracticas(dir: string, out: string[] = []): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
      walkPracticas(path.join(dir, entry.name), out);
    } else if (entry.name.toLowerCase().endsWith(".practica.md")) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value === "string") {
    return value.replace(/^\[|\]$/g, "").split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
  }
  return [];
}

/** The `practice:` modes of a topic's own exercises, as the notes write them. */
function exerciseModes(topicFolder: string): string[] {
  const out: string[] = [];
  const dir = path.join(topicFolder, "Ejercicios");
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".md")) continue;
    try {
      const [fm] = parseFrontmatter(fs.readFileSync(path.join(dir, entry.name), "utf-8"));
      const raw = String(fm.practice ?? fm.skill ?? fm.mode ?? "").trim().toLowerCase();
      if (!raw) continue;
      out.push(MODES[raw] ? raw : (PRACTICE_ALIASES[raw] ?? raw));
    } catch {
      // Un ejercicio ilegible no decide el tipo del tema.
    }
  }
  return out;
}

/** The frontmatter block of a note, as text and with its offsets. */
function frontmatterBlock(raw: string): { text: string; end: number } | null {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  if (!m) return null;
  return { text: m[1]!, end: m[0].length };
}

/** Rewrite the frontmatter block: `topic_type` and, if narrowed, `skills`. */
function rewrite(raw: string, item: { type: TopicType; skillsAfter: string[] | null }): string {
  const block = frontmatterBlock(raw);
  if (!block) return raw;
  const opening = /^---(\r?\n)/.exec(raw);
  const prefixLen = opening ? 3 + opening[1]!.length : 0;
  const lines = block.text.split(/\r?\n/);
  const eol = block.text.includes("\r\n") ? "\r\n" : "\n";

  // Insert `topic_type` right after `title:` (or at the end of the block).
  const titleAt = lines.findIndex((l) => /^title:/.test(l.trim()));
  const typeLine = `topic_type: ${item.type}`;
  const withoutOld = lines.filter((l) => !/^topic_type:/.test(l.trim()));
  const insertAt = titleAt >= 0 ? titleAt + 1 : withoutOld.length;
  withoutOld.splice(insertAt, 0, typeLine);

  if (item.skillsAfter) {
    const skillsAt = withoutOld.findIndex((l) => /^skills:/.test(l.trim()));
    const line = `skills: [${item.skillsAfter.join(", ")}]`;
    if (skillsAt >= 0) withoutOld[skillsAt] = line;
    else withoutOld.splice(insertAt + 1, 0, line);
  }

  const nextBlock = withoutOld.join(eol);
  return raw.slice(0, prefixLen) + nextBlock + raw.slice(prefixLen + block.text.length);
}

export function planTopicTypes(root: string, subjectFilter?: string): PlanItem[] {
  const items: PlanItem[] = [];
  for (const file of walkPracticas(root)) {
    const raw = fs.readFileSync(file, "utf-8");
    const [fm] = parseFrontmatter(raw);
    const subject = String(fm.subject ?? "mathematics").trim().toLowerCase();
    if (subjectFilter && subject !== subjectFilter.toLowerCase()) continue;
    const title = String(fm.title ?? path.basename(file).replace(/\.practica\.md$/i, "")).trim();
    const currentType = String(fm.topic_type ?? "").trim().toLowerCase();
    const modes = exerciseModes(path.dirname(file));
    const verdict = detectTopicType({ name: title, practiceModes: modes, theoreticalModes: theoreticalSkills(subject) });
    const before = stringList(fm.skills);
    const full = catalogFor(subject).map((s) => s.id);
    const isFullCatalogue = full.length > 0 && full.every((id) => before.includes(id));
    const recommended = recommendSkillsForTopic({
      subject,
      topicType: verdict.type,
      title,
      practiceModes: modes,
      topicTypeWhy: verdict.why,
    }).skills;
    // Solo se estrechan los que llevan el catálogo entero; una lista corta es una decisión.
    const narrow = isFullCatalogue && recommended.join(",") !== before.join(",");
    const after = narrow ? recommended : before;

    const needsType = currentType !== verdict.type;
    const item: PlanItem = {
      file: path.relative(root, file).split(path.sep).join("/"),
      title,
      subject,
      type: verdict.type,
      source: verdict.source,
      why: verdict.why,
      skillsBefore: before,
      skillsAfter: after,
      action: !needsType && !narrow ? "none" : narrow ? "topic_type+skills" : "topic_type",
    };
    if (item.action !== "none") item.next = rewrite(raw, { type: verdict.type, skillsAfter: narrow ? after : null });
    items.push(item);
  }
  return items.sort((a, b) => a.file.localeCompare(b.file));
}

export function applyTopicTypes(root: string, apply: boolean, subjectFilter?: string): {
  plan: PlanItem[];
  written: string[];
} {
  const plan = planTopicTypes(root, subjectFilter);
  const written: string[] = [];
  if (apply) {
    for (const item of plan) {
      if (item.action === "none" || !item.next) continue;
      fs.writeFileSync(path.join(root, item.file), item.next, "utf-8");
      written.push(item.file);
    }
  }
  return { plan, written };
}
