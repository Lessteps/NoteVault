/**
 * Study view files.
 *
 * A *view file* is a note that opens a dedicated React surface instead of the
 * markdown editor, one per folder, so a folder has a visible, meaningful entry
 * point (Notion-style) instead of a machine file nobody understands:
 *
 *   <folder>.teorica.md    the theory of a topic         (type: teorica)
 *   <folder>.practica.md   the practice of a topic       (type: practica)
 *   <folder>.resumen.md    the overview of an area/root  (type: resumen)
 *
 * The `practica` file *is* the topic manifest: its frontmatter carries subject,
 * skills and mastery, so no `_tema.md` has to sit next to the notes. The
 * functions here are the single source of truth for the convention, shared by
 * the in-app "create view" action and the vault migration tool.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { dumpFrontmatter, parseFrontmatter } from "./../frontmatter.js";
import {
  findAncestorTopicManifest,
  parseTopicManifest,
  type TopicManifest,
} from "./topic.js";

export const VIEW_FILE_KINDS = ["teorica", "practica", "resumen"] as const;
export type ViewFileKind = (typeof VIEW_FILE_KINDS)[number];

/** The manifest file every `practica` view carries the topic inside of. */
export const TOPIC_MARKER_FILE = "_tema.md";

/** `type:` of a note → the view it opens, or null when it opens as markdown. */
export function viewFileKind(frontmatter: Record<string, unknown> | null | undefined): ViewFileKind | null {
  const type = String(frontmatter?.type ?? "").trim().toLowerCase();
  return (VIEW_FILE_KINDS as readonly string[]).includes(type) ? (type as ViewFileKind) : null;
}

/** `<folder name>.practica.md` */
export function viewFileName(folderName: string, kind: ViewFileKind): string {
  return `${folderName}.${kind}.md`;
}

export function viewFileRel(folderRel: string, kind: ViewFileKind): string {
  const name = folderRel.split("/").filter(Boolean).pop() ?? folderRel;
  const file = viewFileName(name, kind);
  return folderRel ? `${folderRel}/${file}` : file;
}

/** Absolute path of the view file of `kind` for a folder, or null when absent. */
export function existingViewFile(folderAbs: string, kind: ViewFileKind): string | null {
  const candidate = path.join(folderAbs, viewFileName(path.basename(folderAbs), kind));
  return fs.existsSync(candidate) ? candidate : null;
}

/** True when the folder carries a topic manifest (view file or legacy marker). */
export function isTopicFolder(rootAbs: string, folderAbs: string): boolean {
  return findAncestorTopicManifest(folderAbs, rootAbs)?.topicFolder === path.resolve(folderAbs);
}

/**
 * True when the folder holds topic folders somewhere below it: that is what
 * makes it a *grouping* folder with an overview of its own (as opposed to a
 * plain folder, which gets no view file just because it was clicked).
 */
export function folderHasTopicsBelow(rootAbs: string, folderAbs: string, maxDepth = 6): boolean {
  const root = path.resolve(folderAbs);
  const isTopic = (dir: string): boolean => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return false;
    }
    const files = entries.filter((e) => e.isFile()).map((e) => e.name.toLowerCase());
    const name = path.basename(dir);
    return (
      files.includes(TOPIC_MARKER_FILE) ||
      files.includes(viewFileName(name, "practica").toLowerCase())
    );
  };
  const visit = (dir: string, depth: number): boolean => {
    if (depth > maxDepth) return false;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return false;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const base = entry.name;
      if (base.startsWith(".") || IGNORED.has(base)) continue;
      const child = path.join(dir, base);
      if (isTopic(child) || visit(child, depth + 1)) return true;
    }
    return false;
  };
  void rootAbs;
  return visit(root, 0);
}

/** The topic manifest of a folder, from its `practica` view or a legacy `_tema.md`. */
export function topicManifestOf(rootAbs: string, folderAbs: string): TopicManifest | null {
  const found = findAncestorTopicManifest(folderAbs, rootAbs);
  if (!found) return null;
  return path.resolve(found.topicFolder) === path.resolve(folderAbs) ? found.manifest : null;
}

// ── Writing ─────────────────────────────────────────────────────────────────

/** Frontmatter + body of a `practica` view file: the topic manifest, visible. */
export function practiceFileText(manifest: TopicManifest): string {
  const body = [
    `# Práctica — ${manifest.title}`,
    "",
    "Vista de práctica del tema: elige competencia, dificultad, cantidad y ayuda,",
    "o consulta el resumen de progreso (matriz competencia × dificultad).",
    "",
  ].join("\n");
  // Flat mastery keys: `dumpFrontmatter` writes strings/numbers/arrays only, and
  // `parseTopicManifest` reads both the nested and the flat shape.
  return dumpFrontmatter({
    type: "practica",
    subject: manifest.subject,
    title: manifest.title,
    skills: manifest.skills,
    min_per_skill: manifest.mastery.min_per_skill,
    target_difficulty: manifest.mastery.target_difficulty,
    exam: manifest.mastery.exam,
    ...(manifest.exam_group ? { exam_group: manifest.exam_group } : {}),
  }) + "\n" + body;
}

/** Frontmatter + body of a `teorica` view file, pointing at the theory note. */
export function theoryFileText(
  title: string,
  subject: string,
  theoryRel: string | null,
  canvasRel: string | null = null,
): string {
  const body = theoryRel
    ? ["# Teoría", "", `La teoría de este tema está en \`${theoryRel}\`.`, ""].join("\n")
    : ["# Teoría", "", "Todavía no hay una nota de teoría para este tema.", ""].join("\n");
  return dumpFrontmatter({
    type: "teorica",
    subject,
    title,
    ...(theoryRel ? { teoria: theoryRel } : {}),
    ...(canvasRel ? { mapa: canvasRel } : {}),
  }) + "\n" + body;
}

/** The concept map of a topic folder, when it has one (`<folder> — mapa.canvas`). */
export function mapNoteOf(folderAbs: string): string | null {
  const folderName = path.basename(folderAbs);
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(folderAbs, { withFileTypes: true });
  } catch {
    return null;
  }
  const canvases = entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".canvas"))
    .map((e) => e.name);
  if (!canvases.length) return null;
  const preferred = canvases.find((n) => n.startsWith(folderName) && !n.toLowerCase().includes(".nuevo"));
  return path.join(folderAbs, preferred ?? canvases[0]!);
}

/** Frontmatter + body of a `resumen` view file for an area or the subject root. */
export function overviewFileText(title: string, subject: string, scopeRel: string): string {
  const body = [
    `# Resumen — ${title}`,
    "",
    "Vista general del área: progreso por tema, competencias y dificultades,",
    "errores comunes y acceso a practicar el área completa.",
    "",
  ].join("\n");
  return dumpFrontmatter({ type: "resumen", subject, title, scope: scopeRel }) + "\n" + body;
}

// ── The concept (theory) note of a topic folder ─────────────────────────────

/**
 * The theory note of a topic folder: `<folder name>.md` when it exists (the
 * concept note the vault already has — canvases point at it by path), else the
 * first other markdown note that is not an exercise or a view file.
 */
export function theoryNoteOf(folderAbs: string): string | null {
  const folderName = path.basename(folderAbs);
  const concept = path.join(folderAbs, `${folderName}.md`);
  if (fs.existsSync(concept)) return concept;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(folderAbs, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".md")) continue;
    const lower = entry.name.toLowerCase();
    if (lower === TOPIC_MARKER_FILE || VIEW_FILE_KINDS.some((k) => lower.endsWith(`.${k}.md`))) continue;
    const candidate = path.join(folderAbs, entry.name);
    try {
      const [fm] = parseFrontmatter(fs.readFileSync(candidate, "utf-8"));
      // Only a concept note carries the theory; loose notes do not.
      if (String((fm as Record<string, unknown>).type ?? "").trim().toLowerCase() !== "concept") continue;
    } catch {
      continue;
    }
    return candidate;
  }
  return null;
}

// ── Creating them (idempotent) ──────────────────────────────────────────────

export interface CreateResult {
  created: string[];
  /** view files that were already there */
  skipped: string[];
  /** theory notes marked `type: teorica` so they open as the topic's theory */
  tagged: string[];
  /** the folder had nothing to build a view from (no manifest / no theory) */
  errors: string[];
}

function writeIfMissing(fileAbs: string, text: string, out: CreateResult, dryRun = false): void {
  if (fs.existsSync(fileAbs)) {
    out.skipped.push(fileAbs);
    return;
  }
  if (!dryRun) {
    fs.mkdirSync(path.dirname(fileAbs), { recursive: true });
    fs.writeFileSync(fileAbs, text, "utf-8");
  }
  out.created.push(fileAbs);
}

/** Creates `practica` + `teorica` for a topic folder; never overwrites. */
export function ensureTopicViewFiles(rootAbs: string, folderAbs: string, dryRun = false): CreateResult {
  const out: CreateResult = { created: [], skipped: [], tagged: [], errors: [] };
  const manifest = topicManifestOf(rootAbs, folderAbs);
  if (!manifest) {
    out.errors.push(folderAbs);
    return out;
  }
  const folderName = path.basename(folderAbs);
  writeIfMissing(path.join(folderAbs, viewFileName(folderName, "practica")), practiceFileText(manifest), out, dryRun);

  // The theory note the vault already has — the one the maps link by path — *is*
  // the topic's theory view: it gets `type: teorica` in place, and is never
  // renamed nor duplicated. Only a folder with no theory note at all gets a new
  // `<name>.teorica.md`, so the topic still has a visible door to its theory.
  const theory = theoryNoteOf(folderAbs);
  if (theory) {
    if (markTheoryNote(theory, out, dryRun)) out.tagged.push(theory);
  } else {
    const map = mapNoteOf(folderAbs);
    const mapRel = map ? path.relative(rootAbs, map).split(path.sep).join("/") : null;
    writeIfMissing(
      path.join(folderAbs, viewFileName(folderName, "teorica")),
      theoryFileText(manifest.title, manifest.subject, null, mapRel),
      out,
      dryRun,
    );
  }
  return out;
}

/**
 * Marks a note as the topic's theory view by editing its frontmatter *textually*:
 * the body and every other key keep their exact formatting (re-serialising the
 * YAML would requote values and turn `"1.1"` into a number). `type` is replaced
 * when present and inserted right after the opening fence when it is not.
 * Returns true when the file changed.
 */
export function markTheoryNote(fileAbs: string, out: CreateResult, dryRun = false): boolean {
  let raw: string;
  try {
    raw = fs.readFileSync(fileAbs, "utf-8");
  } catch {
    return false;
  }
  // Never mark a manifest: the practice view carries the topic's frontmatter.
  if (parseTopicManifest(raw)) {
    out.skipped.push(fileAbs);
    return false;
  }
  const type = String((parseFrontmatter(raw)[0] as Record<string, unknown>).type ?? "").trim().toLowerCase();
  if (type === "teorica") {
    out.skipped.push(fileAbs);
    return false;
  }
  const marked = frontmatterWithType(raw, "teorica");
  if (marked === null || marked === raw) {
    out.skipped.push(fileAbs);
    return false;
  }
  if (!dryRun) fs.writeFileSync(fileAbs, marked, "utf-8");
  return true;
}

/** `raw` with `type: <value>` set in its frontmatter, or null when it has none. */
export function frontmatterWithType(raw: string, value: string): string | null {
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  const lines = raw.split(/\r?\n/);
  if ((lines[0] ?? "").trim() !== "---") return null;
  const end = lines.findIndex((line, i) => i > 0 && line.trim() === "---");
  if (end < 0) return null;
  const fm = lines.slice(1, end);
  const at = fm.findIndex((line) => /^type\s*:/.test(line.trim()));
  if (at >= 0) fm[at] = `type: ${value}`;
  else fm.unshift(`type: ${value}`);
  return ["---", ...fm, ...lines.slice(end)].join(eol);
}

/** Creates the `resumen` overview of an area folder (or the subject root). */
export function ensureOverviewFile(rootAbs: string, folderAbs: string, title?: string, dryRun = false): CreateResult {
  const out: CreateResult = { created: [], skipped: [], tagged: [], errors: [] };
  const folderName = path.basename(folderAbs || rootAbs);
  const scopeRel = path.resolve(folderAbs) === path.resolve(rootAbs)
    ? ""
    : path.relative(rootAbs, folderAbs).split(path.sep).join("/");
  const name = title ?? folderName;
  writeIfMissing(
    path.join(folderAbs, viewFileName(folderName, "resumen")),
    overviewFileText(name, "mathematics", scopeRel),
    out,
    dryRun,
  );
  return out;
}

// ── Migration ───────────────────────────────────────────────────────────────

export interface MigrationReport {
  topicFolders: string[];
  areas: string[];
  created: string[];
  /** theory notes marked `type: teorica` */
  tagged: string[];
  skipped: string[];
  deleted: string[];
  errors: string[];
}

interface Walk {
  /** folders that hold a topic manifest `.practica.md` */
  topics: string[];
  /** folders with a legacy `_tema.md` */
  legacy: string[];
  /** folders that only group topics (or notes) */
  areas: string[];
}

const IGNORED = new Set(["node_modules", ".git", "__pycache__", ".venv", "venv", "site-packages", "dist", "build", ".trash", "attachments", "Attachments"]);

function walk(rootAbs: string): Walk {
  const out: Walk = { topics: [], legacy: [], areas: [] };

  /** Returns true when the subtree (the folder itself included) has a topic. */
  const visit = (dir: string, depth: number): boolean => {
    if (depth > 8) return false;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return false;
    }
    const files = entries.filter((e) => e.isFile()).map((e) => e.name);
    const name = path.basename(dir);
    const dirs = entries
      .filter((e) => e.isDirectory())
      .map((e) => path.join(dir, e.name))
      .filter((p) => !IGNORED.has(path.basename(p)) && !path.basename(p).startsWith("."));

    const isLegacy = files.some((f) => f.toLowerCase() === TOPIC_MARKER_FILE);
    const hasPracticeView = files.some((f) => f.toLowerCase() === viewFileName(name, "practica").toLowerCase());

    let topicBelow = false;
    for (const child of dirs) {
      if (visit(child, depth + 1)) topicBelow = true;
    }

    if (isLegacy) out.legacy.push(dir);
    if (hasPracticeView) out.topics.push(dir);
    // A grouping folder: it holds topics somewhere below and is not one itself.
    if (topicBelow && !isLegacy && !hasPracticeView) out.areas.push(dir);

    return topicBelow || isLegacy || hasPracticeView;
  };

  visit(path.resolve(rootAbs), 0);
  return out;
}

/**
 * Turns a vault into the study-view model, idempotently:
 *
 *   `_tema.md`  →  `<folder>.practica.md` (the manifest, visible) + `<folder>.teorica.md`
 *   grouping folders and the subject root  →  `<folder>.resumen.md`
 *
 * The legacy marker is only removed once the `practica` file exists and parses
 * as a topic manifest, so a failed write never loses topic detection. Existing
 * files are never overwritten.
 */
export function migrateVault(
  rootAbs: string,
  opts: {
    dryRun?: boolean;
    /**
     * Folder (relative to `rootAbs`) that gets the subject-root overview. Use it
     * when the folder paths stored in the frontmatter must be relative to a
     * *higher* vault root than the subject being migrated (the app resolves note
     * paths from the vault root, not from the subject).
     */
    overviewRoot?: string;
  } = {},
): MigrationReport {
  const root = path.resolve(rootAbs);
  const report: MigrationReport = { topicFolders: [], areas: [], created: [], tagged: [], skipped: [], deleted: [], errors: [] };
  const before = walk(root);

  for (const folder of before.legacy) {
    report.topicFolders.push(folder);
    const marker = path.join(folder, TOPIC_MARKER_FILE);
    const [fm] = parseFrontmatter(read(marker) ?? "");
    const manifest = parseTopicManifest(fm as Record<string, unknown>, path.basename(folder));
    if (!manifest) {
      report.errors.push(`${marker}: no topic manifest in _tema.md`);
      continue;
    }
    const result = ensureTopicViewFiles(root, folder, Boolean(opts.dryRun));
    report.created.push(...result.created);
    report.tagged.push(...result.tagged);
    report.skipped.push(...result.skipped);
    report.errors.push(...result.errors);

    const practiceFile = path.join(folder, viewFileName(path.basename(folder), "practica"));
    const written = opts.dryRun || fs.existsSync(practiceFile);
    const parses = opts.dryRun || parseTopicManifest(read(practiceFile) ?? "") !== null;
    if (written && parses) {
      if (!opts.dryRun) fs.rmSync(marker, { force: true });
      report.deleted.push(marker);
    } else {
      report.errors.push(`${marker}: kept (the practica view could not be written)`);
    }
  }

  // Topic folders that already use the view model (no legacy marker).
  for (const folder of before.topics) {
    if (report.topicFolders.includes(folder)) continue;
    report.topicFolders.push(folder);
    const result = ensureTopicViewFiles(root, folder, Boolean(opts.dryRun));
    report.created.push(...result.created);
    report.tagged.push(...result.tagged);
    report.skipped.push(...result.skipped);
    report.errors.push(...result.errors);
  }

  // Overviews: the subject root plus every grouping folder.
  const overviewBase = opts.overviewRoot ? path.resolve(root, opts.overviewRoot) : root;
  const overviews = new Set<string>([overviewBase]);
  for (const area of before.areas) {
    // The vault root is not an "area" when the subject root is someone else.
    if (area === root && overviewBase !== root) continue;
    overviews.add(area);
  }
  for (const folder of overviews) {
    report.areas.push(folder);
    const result = ensureOverviewFile(root, folder, undefined, Boolean(opts.dryRun));
    report.created.push(...result.created);
    report.tagged.push(...result.tagged);
    report.skipped.push(...result.skipped);
    report.errors.push(...result.errors);
  }

  return report;
}

function read(file: string): string | null {
  try {
    return fs.readFileSync(file, "utf-8");
  } catch {
    return null;
  }
}
