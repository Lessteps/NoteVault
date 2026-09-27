/**
 * Migration: `_tema.md` → visible study view files.
 *
 * For every topic folder it writes `<folder>.practica.md` (the manifest, visible)
 * and `<folder>.teorica.md` (the theory entry point), and for the subject root
 * and every grouping area a `<folder>.resumen.md` overview. The legacy marker is
 * removed only once the `practica` file exists and parses as a topic manifest.
 *
 * Idempotent: run it as often as you like; nothing is overwritten.
 * See `core/practice/viewFiles.ts` for the convention.
 *
 * This repo runs its TypeScript tools through vitest, so call `runMigration`
 * from a test/script rather than with `node`:
 *
 *   const { text } = runMigration({ vault: "C:/PROGRAMMING/Matemáticas" });
 *   console.log(text);
 */

import { migrateVault, type MigrationReport } from "../src/core/practice/viewFiles";

export interface RunOptions {
  /** Vault (or subject root) to migrate. */
  vault: string;
  /** Report what would happen without writing anything. */
  dryRun?: boolean;
  /** Folder (relative to `vault`) that gets the subject-root overview. */
  overviewRoot?: string;
}

export interface RunResult {
  report: MigrationReport;
  text: string;
}

export function runMigration(opts: RunOptions): RunResult {
  const report = migrateVault(opts.vault, { dryRun: opts.dryRun, overviewRoot: opts.overviewRoot });
  return { report, text: formatReport(opts.vault, report, Boolean(opts.dryRun)) };
}

export function formatReport(vault: string, r: MigrationReport, dryRun = false): string {
  const lines: string[] = [];
  lines.push(`Study view files — ${dryRun ? "DRY RUN" : "migration"} of ${vault}`);
  lines.push("");
  lines.push(`Topic folders: ${r.topicFolders.length}`);
  lines.push(`Areas + root:  ${r.areas.length}`);
  lines.push(`Created:       ${r.created.length}`);
  lines.push(`Already there: ${r.skipped.length}`);
  lines.push(`Legacy _tema:  ${r.deleted.length} removed`);
  if (r.errors.length) {
    lines.push("");
    lines.push(`WARNINGS (${r.errors.length}):`);
    for (const e of r.errors) lines.push(`  ! ${e}`);
  }
  const group = (label: string, files: string[]) => {
    if (!files.length) return;
    lines.push("");
    lines.push(`${label}:`);
    for (const f of files) lines.push(`  ${f}`);
  };
  group("CREATED", r.created);
  group("REMOVED", r.deleted);
  group("SKIPPED (already present)", r.skipped);
  return lines.join("\n");
}
