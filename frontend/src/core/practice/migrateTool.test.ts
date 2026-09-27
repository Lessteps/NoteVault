// The migration tool on top of the view-file core: same behaviour, plus the
// report the user reads.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { formatReport, runMigration } from "../../../tools/migrate_study_view_files";

const MANIFEST = `---
type: topic
subject: mathematics
title: "1.1 X"
skills: [solve, prove]
mastery:
  min_per_skill: 6
  target_difficulty: 3
  exam: required
---
`;

function tinyVault(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nv-migrate-"));
  const topic = path.join(root, "Matemáticas", "1 Área", "1.1 X");
  fs.mkdirSync(topic, { recursive: true });
  fs.writeFileSync(path.join(topic, "_tema.md"), MANIFEST, "utf-8");
  fs.writeFileSync(path.join(topic, "1.1 X.md"), "---\ntype: concept\n---\n# X\n", "utf-8");
  return root;
}

describe("migrate_study_view_files", () => {
  it("migrates a vault and reports what it did", () => {
    const root = tinyVault();
    try {
      const { report, text } = runMigration({ vault: root });
      expect(report.topicFolders).toHaveLength(1);
      expect(report.created.some((f) => f.endsWith("1.1 X.practica.md"))).toBe(true);
      expect(report.created.some((f) => f.endsWith("1.1 X.teorica.md"))).toBe(true);
      expect(report.created.some((f) => f.endsWith("Matemáticas.resumen.md"))).toBe(true);
      expect(report.created.some((f) => f.endsWith("1 Área.resumen.md"))).toBe(true);
      expect(report.deleted.some((f) => f.endsWith("_tema.md"))).toBe(true);

      expect(text).toContain("Study view files");
      expect(text).toContain("CREATED");
      expect(text).toContain("Legacy _tema:  1 removed");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not touch anything in a dry run", () => {
    const root = tinyVault();
    try {
      const { report } = runMigration({ vault: root, dryRun: true });
      expect(report.topicFolders).toHaveLength(1);
      const topic = path.join(root, "Matemáticas", "1 Área", "1.1 X");
      expect(fs.existsSync(path.join(topic, "_tema.md"))).toBe(true);
      expect(fs.existsSync(path.join(topic, "1.1 X.practica.md"))).toBe(false);
      expect(formatReport(root, report, true)).toContain("DRY RUN");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
