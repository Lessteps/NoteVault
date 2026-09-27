/**
 * Repairs the maps of an existing vault so every text box shows all its text
 * (see `core/canvas/boxSizing.ts`). Grow-only, idempotent, and it reports what it
 * changed:
 *
 *   const report = fixVaultCanvasBoxes("C:/PROGRAMMING/Matemáticas");
 *   console.log(report.details.join("\n"));
 *
 * Run it through vitest (this repo's TS runner), like the other tools here.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { dump, load } from "../src/core/canvas/canvasFormat";
import { fixCanvasBoxes, shortBoxes } from "../src/core/canvas/boxSizing";

const IGNORED = new Set(["node_modules", ".git", ".trash", "__pycache__", ".venv", "venv", "dist", "build"]);

export interface CanvasFixReport {
  /** canvases seen */
  files: number;
  /** canvases written back */
  touched: number;
  grown: number;
  moved: number;
  groups: number;
  /** text cards still too short after the pass (must be 0) */
  remaining: number;
  details: string[];
}

export function fixVaultCanvasBoxes(rootAbs: string, opts: { dryRun?: boolean } = {}): CanvasFixReport {
  const report: CanvasFixReport = { files: 0, touched: 0, grown: 0, moved: 0, groups: 0, remaining: 0, details: [] };

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
      if (!entry.name.endsWith(".canvas")) continue;

      report.files += 1;
      let doc;
      try {
        doc = load(full);
      } catch (e) {
        report.details.push(`  ! ${full}: ${(e as Error).message}`);
        continue;
      }
      const { doc: fixed, fix } = fixCanvasBoxes(doc);
      const left = shortBoxes(fixed).length;
      report.remaining += left;
      report.grown += fix.grown;
      report.moved += fix.moved;
      report.groups += fix.groups;

      if (fix.grown || fix.moved || fix.groups) {
        report.touched += 1;
        report.details.push(`  ${path.basename(full)}: ${fix.grown} cajas crecidas, ${fix.moved} movidas, ${fix.groups} grupos`);
        if (!opts.dryRun) dump(full, fixed);
      }
    }
  };

  visit(path.resolve(rootAbs), 0);
  return report;
}
