/**
 * Maintenance script to generate topic manifests (_tema.md) for concrete topic folders
 * under the Matemáticas knowledge base.
 *
 * Idempotent: Never overwrites an existing _tema.md or tema.md.
 * Inactive inference: Infers title from folder name, exam_group from area name,
 * and prioritizes skills represented in existing exercises.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { parseFrontmatter } from "../src/core/frontmatter";
import { modeFor } from "../src/core/practice/modes";
import { MATHEMATICS_SKILLS } from "../src/core/practice/skills";
import {
  DEFAULT_MASTERY_CONFIG,
  parseTopicManifest,
  serializeTopicManifest,
  type TopicManifest,
} from "../src/core/practice/topic";

export interface ManifestGenerationResult {
  area: string;
  topicTitle: string;
  folderPath: string;
  manifestPath: string;
  status: "created" | "skipped" | "error";
  reason?: string;
  skillsFound?: string[];
  skillsDeclared?: string[];
  examGroup?: string;
}

export interface GenerationReport {
  mathRoot: string;
  totalTopicsScanned: number;
  createdCount: number;
  skippedCount: number;
  errorCount: number;
  results: ManifestGenerationResult[];
}

/**
 * Normalizes an area folder name into a clean exam_group slug.
 * e.g. "1 Aritmética elemental y operativa" -> "aritmetica-elemental-y-operativa"
 */
export function inferExamGroup(areaFolderName: string): string {
  const clean = areaFolderName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .toLowerCase()
    .replace(/^[\d_]+/, "") // strip leading numbers/underscores
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return clean || "matematicas";
}

/**
 * Scans a topic directory (including an Ejercicios subfolder) for existing exercise files
 * and discovers the practice modes/skills they represent.
 */
export function discoverTopicExerciseSkills(topicDir: string): {
  skills: string[];
  exerciseCount: number;
} {
  const discoveredSkills = new Set<string>();
  let exerciseCount = 0;

  const candidateDirs = [topicDir];
  try {
    const entries = fs.readdirSync(topicDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.toLowerCase() === "ejercicios") {
        candidateDirs.push(path.join(topicDir, entry.name));
      }
    }
  } catch {
    return { skills: [], exerciseCount: 0 };
  }

  for (const dir of candidateDirs) {
    if (!fs.existsSync(dir)) continue;
    let files: fs.Dirent[] = [];
    try {
      files = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const f of files) {
      if (!f.isFile() || !f.name.endsWith(".md")) continue;
      if (f.name.startsWith("_tema") || f.name.startsWith("tema")) continue;

      const fullPath = path.join(dir, f.name);
      try {
        const content = fs.readFileSync(fullPath, "utf-8");
        const [fm] = parseFrontmatter(content);
        if (fm && (fm.type === "exercise" || fm.practice || fm.mode || /^[0-9.]+-E[0-9]+/.test(f.name))) {
          exerciseCount++;
          const mode = modeFor(fm);
          if (mode && mode.id) {
            discoveredSkills.add(mode.id);
          }
        }
      } catch {
        // Ignore unparseable files
      }
    }
  }

  return {
    skills: Array.from(discoveredSkills),
    exerciseCount,
  };
}

/**
 * Builds a manifest for a single topic directory.
 */
export function buildTopicManifest(
  topicDir: string,
  areaName: string,
): { manifest: TopicManifest; skillsFound: string[] } {
  const folderName = path.basename(topicDir);
  const examGroup = inferExamGroup(areaName);
  const { skills: skillsFound } = discoverTopicExerciseSkills(topicDir);

  const availableMathSkills = MATHEMATICS_SKILLS.map((s) => s.id);
  const declaredSkills: string[] = [];

  // Present skills first
  for (const skill of skillsFound) {
    if (availableMathSkills.includes(skill) && !declaredSkills.includes(skill)) {
      declaredSkills.push(skill);
    }
  }
  // Then remaining math skills
  for (const skill of availableMathSkills) {
    if (!declaredSkills.includes(skill)) {
      declaredSkills.push(skill);
    }
  }

  const manifest: TopicManifest = {
    type: "topic",
    subject: "mathematics",
    title: folderName,
    skills: declaredSkills,
    mastery: { ...DEFAULT_MASTERY_CONFIG },
    exam_group: examGroup,
    folder: topicDir,
  };

  return { manifest, skillsFound };
}

/**
 * Processes a concrete topic folder, creating _tema.md if absent.
 */
export function processSingleTopic(
  topicDir: string,
  areaName: string,
  options?: { dryRun?: boolean },
): ManifestGenerationResult {
  const folderName = path.basename(topicDir);
  const manifestPath = path.join(topicDir, "_tema.md");
  const altManifestPath = path.join(topicDir, "tema.md");

  // Idempotency: skip if either _tema.md or tema.md exists
  if (fs.existsSync(manifestPath) || fs.existsSync(altManifestPath)) {
    return {
      area: areaName,
      topicTitle: folderName,
      folderPath: topicDir,
      manifestPath,
      status: "skipped",
      reason: "Manifest already exists",
    };
  }

  try {
    const { manifest, skillsFound } = buildTopicManifest(topicDir, areaName);
    const serialized = serializeTopicManifest(manifest);

    // Verify it parses cleanly
    const parsed = parseTopicManifest(serialized, folderName);
    if (!parsed) {
      return {
        area: areaName,
        topicTitle: folderName,
        folderPath: topicDir,
        manifestPath,
        status: "error",
        reason: "Failed to validate serialized topic manifest",
      };
    }

    if (!options?.dryRun) {
      fs.writeFileSync(manifestPath, serialized, "utf-8");
    }

    return {
      area: areaName,
      topicTitle: folderName,
      folderPath: topicDir,
      manifestPath,
      status: "created",
      skillsFound,
      skillsDeclared: manifest.skills,
      examGroup: manifest.exam_group,
    };
  } catch (err: any) {
    return {
      area: areaName,
      topicTitle: folderName,
      folderPath: topicDir,
      manifestPath,
      status: "error",
      reason: err?.message || String(err),
    };
  }
}

/**
 * Scans a full mathematics knowledge tree and creates manifests for all concrete topic folders.
 */
export function processMathTree(
  mathRoot: string,
  options?: { dryRun?: boolean; areaFilter?: string },
): GenerationReport {
  const report: GenerationReport = {
    mathRoot,
    totalTopicsScanned: 0,
    createdCount: 0,
    skippedCount: 0,
    errorCount: 0,
    results: [],
  };

  if (!fs.existsSync(mathRoot)) {
    throw new Error(`Math root path not found: ${mathRoot}`);
  }

  const areaEntries = fs.readdirSync(mathRoot, { withFileTypes: true });

  for (const areaEntry of areaEntries) {
    if (!areaEntry.isDirectory()) continue;
    if (areaEntry.name.startsWith(".")) continue;
    if (options?.areaFilter && !areaEntry.name.toLowerCase().includes(options.areaFilter.toLowerCase())) {
      continue;
    }

    const areaPath = path.join(mathRoot, areaEntry.name);
    const topicEntries = fs.readdirSync(areaPath, { withFileTypes: true });

    for (const topicEntry of topicEntries) {
      if (!topicEntry.isDirectory()) continue;
      if (topicEntry.name.startsWith(".")) continue;

      // Concrete topic folders typically start with numbers like "1.1", "2.1", etc.
      const topicPath = path.join(areaPath, topicEntry.name);

      report.totalTopicsScanned++;
      const res = processSingleTopic(topicPath, areaEntry.name, options);
      report.results.push(res);

      if (res.status === "created") report.createdCount++;
      else if (res.status === "skipped") report.skippedCount++;
      else if (res.status === "error") report.errorCount++;
    }
  }

  return report;
}

/**
 * Formats a report for console output.
 */
export function formatReport(report: GenerationReport): string {
  const lines: string[] = [];
  lines.push("================================================================================");
  lines.push(`Math Knowledge Base Topic Manifest Generation Report`);
  lines.push(`Root: ${report.mathRoot}`);
  lines.push(`Topics Scanned: ${report.totalTopicsScanned} | Created: ${report.createdCount} | Skipped: ${report.skippedCount} | Errors: ${report.errorCount}`);
  lines.push("================================================================================");

  for (const r of report.results) {
    const symbol = r.status === "created" ? "[+ CREATED]" : r.status === "skipped" ? "[- SKIPPED]" : "[! ERROR]";
    lines.push(`${symbol} [${r.area}] ${r.topicTitle}`);
    if (r.status === "created") {
      lines.push(`    Exam Group: ${r.examGroup}`);
      lines.push(`    Found Skills: [${r.skillsFound?.join(", ") || "none"}]`);
      lines.push(`    Declared Skills (${r.skillsDeclared?.length}): [${r.skillsDeclared?.join(", ")}]`);
      lines.push(`    Manifest: ${r.manifestPath}`);
    } else if (r.status === "skipped") {
      lines.push(`    Reason: ${r.reason}`);
    } else if (r.status === "error") {
      lines.push(`    Error: ${r.reason}`);
    }
  }
  lines.push("================================================================================");
  return lines.join("\n");
}

// CLI Execution entry point
if (process.argv[1] && (process.argv[1].endsWith("generate_math_topic_manifests.ts") || process.argv[1].endsWith("generate_math_topic_manifests.js"))) {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const areaFilterArgIdx = args.indexOf("--area");
  const areaFilter = areaFilterArgIdx !== -1 ? args[areaFilterArgIdx + 1] : undefined;

  let targetRoot = args.find((a) => !a.startsWith("--") && a !== areaFilter);
  if (!targetRoot) {
    const candidates = [
      "C:/PROGRAMMING/Matemáticas",
      "c:/PROGRAMMING/Matemáticas",
      path.resolve(process.cwd(), "../../Matemáticas"),
      path.resolve(process.cwd(), "../Matemáticas"),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        targetRoot = c;
        break;
      }
    }
  }

  if (!targetRoot || !fs.existsSync(targetRoot)) {
    console.error(`Error: Math root directory not found. Specify path as argument.`);
    process.exit(1);
  }

  console.log(`Starting manifest generation for: ${targetRoot} (dry-run: ${dryRun})`);
  const report = processMathTree(targetRoot, { dryRun, areaFilter });
  console.log(formatReport(report));
}
