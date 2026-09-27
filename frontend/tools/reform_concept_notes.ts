/**
 * Reforms concept notes to the study-as-files structure:
 *
 *   Idea en una frase · Definición formal · Notación · Ejemplos ·
 *   Contraejemplos y errores comunes · Resultados clave · Conexiones · Tarjetas
 *
 * - drops `## Intuición` (the concept map's root box is where the idea lives now)
 * - drops `## Práctica` (practice belongs to the topic's `.practica` view file)
 * - merges `## No-ejemplos` + `## Errores comunes` into one
 *   `## Contraejemplos y errores comunes` section, mirroring the canvas boxes
 *
 * Idempotent and report-driven; the body outside those sections is untouched
 * (so `## Tarjetas`, which the practice engine indexes, survives).
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { dumpFrontmatter, parseFrontmatter } from "../src/core/frontmatter";

const DROP_SECTIONS = ["intuición", "intuicion", "práctica", "practica"];
const NO_EXAMPLES = ["no-ejemplos", "no ejemplos", "contraejemplos"];
const COMMON_ERRORS = ["errores comunes", "errores frecuentes", "errores típicos", "errores tipicos"];
const MERGED_TITLE = "Contraejemplos y errores comunes";

interface Section {
  title: string;
  /** the raw block, `## Title` line included, without the trailing blank lines */
  body: string;
}

/** Splits a note body into its `## ` sections, keeping any preamble. */
function splitSections(body: string): { preamble: string; sections: Section[] } {
  const lines = body.split("\n");
  const sections: Section[] = [];
  let preamble: string[] = [];
  let current: Section | null = null;
  for (const line of lines) {
    const m = /^##\s+(.*\S)\s*$/.exec(line);
    if (m) {
      if (current) sections.push(current);
      else preamble = [...preamble];
      current = { title: m[1]!, body: line };
      continue;
    }
    if (current) current.body += `\n${line}`;
    else preamble.push(line);
  }
  if (current) sections.push(current);
  return { preamble: preamble.join("\n"), sections };
}

const norm = (t: string) => t.trim().toLowerCase().replace(/[:。]/g, "");

export interface ReformResult {
  changed: boolean;
  dropped: string[];
  merged: boolean;
}

/** Reform one note's text (frontmatter untouched). */
export function reformConceptNoteText(raw: string): { text: string; result: ReformResult } {
  const [fm, body] = parseFrontmatter(raw);
  const { preamble, sections } = splitSections(body);
  const result: ReformResult = { changed: false, dropped: [], merged: false };

  const kept: Section[] = [];
  const noExamples: Section[] = [];
  const errors: Section[] = [];

  for (const section of sections) {
    const key = norm(section.title);
    if (DROP_SECTIONS.includes(key)) {
      result.dropped.push(section.title);
      result.changed = true;
      continue;
    }
    if (NO_EXAMPLES.includes(key)) {
      noExamples.push(section);
      continue;
    }
    if (COMMON_ERRORS.includes(key)) {
      errors.push(section);
      continue;
    }
    kept.push(section);
  }

  if (noExamples.length || errors.length) {
    const parts: string[] = [`## ${MERGED_TITLE}`];
    for (const s of noExamples) {
      const inner = s.body.split("\n").slice(1).join("\n").replace(/^\s*\n/, "");
      if (inner.trim()) parts.push(inner.replace(/^###\s+(No-ejemplo|Contraejemplo)/gim, "### $1"));
    }
    for (const s of errors) {
      const inner = s.body.split("\n").slice(1).join("\n").replace(/^\s*\n/, "");
      if (inner.trim()) parts.push(inner);
    }
    const merged: Section = { title: MERGED_TITLE, body: parts.join("\n\n") };

    // Put it where the first of the two used to be, so the reading order holds.
    const order = sections.map((s) => norm(s.title));
    const at = Math.min(
      ...[...noExamples, ...errors].map((s) => order.indexOf(norm(s.title))).filter((i) => i >= 0),
      order.length,
    );
    const before = sections.slice(0, at).filter((s) => kept.includes(s)).length;
    kept.splice(Math.max(0, Math.min(before, kept.length)), 0, merged);
    result.merged = true;
    result.changed = true;
  }

  if (!result.changed) return { text: raw, result };

  const out = [preamble.replace(/\s+$/, ""), ...kept.map((s) => s.body.replace(/\s+$/, ""))]
    .filter((p) => p.length)
    .join("\n\n");
  return { text: `${dumpFrontmatter(fm as Record<string, unknown>)}${out}\n`, result };
}

export interface ConceptReformReport {
  files: number;
  changed: number;
  dropped: number;
  merged: number;
  details: string[];
}

const IGNORED = new Set(["node_modules", ".git", ".trash", "__pycache__", ".venv", "venv", "dist", "build"]);

/** Reform every concept note under `rootAbs` (grow-free, idempotent). */
export function reformConceptNotes(rootAbs: string, opts: { dryRun?: boolean } = {}): ConceptReformReport {
  const report: ConceptReformReport = { files: 0, changed: 0, dropped: 0, merged: 0, details: [] };

  const visit = (dir: string, depth: number) => {
    if (depth > 8) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith(".") && !IGNORED.has(entry.name)) visit(full, depth + 1);
        continue;
      }
      if (!entry.name.toLowerCase().endsWith(".md")) continue;

      let raw: string;
      try {
        raw = fs.readFileSync(full, "utf-8");
      } catch {
        continue;
      }
      const [fm] = parseFrontmatter(raw);
      const type = String((fm as Record<string, unknown>).type ?? "").trim().toLowerCase();
      if (type !== "concept" && type !== "teorica") continue;

      report.files += 1;
      const { text, result } = reformConceptNoteText(raw);
      if (!result.changed) continue;
      report.changed += 1;
      report.dropped += result.dropped.length;
      if (result.merged) report.merged += 1;
      report.details.push(`  ${path.relative(rootAbs, full)}: -${result.dropped.join(", -") || "nada"}${result.merged ? " · fusionada" : ""}`);
      if (!opts.dryRun) fs.writeFileSync(full, text, "utf-8");
    }
  };

  visit(path.resolve(rootAbs), 0);
  return report;
}
