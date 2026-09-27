// The study view-file convention: `<folder>.practica.md` / `.teorica.md` /
// `.resumen.md`, and the vault migration that replaces `_tema.md` with them.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { findAncestorTopicManifest, parseTopicManifest } from "./topic";
import {
  ensureTopicViewFiles,
  folderHasTopicsBelow,
  migrateVault,
  practiceFileText,
  theoryNoteOf,
  topicManifestOf,
  viewFileKind,
  viewFileName,
} from "./viewFiles";

const MANIFEST = `---
type: topic
subject: mathematics
title: "1.1 Números naturales"
skills: [solve, process, true_false, prove, counterexample, find_error, drill, explain]
mastery:
  min_per_skill: 6
  target_difficulty: 3
  exam: required
exam_group: "aritmetica"
---
`;

const CONCEPT = `---
id: mat.aritmetica.enteros
title: Números naturales, enteros y recta numérica
type: concept
subject: mathematics
---

# Números naturales
`;

/** A small vault shaped like the real one: two areas, four topics. */
function makeVault(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nv-viewfiles-"));
  const topics = [
    ["Matemáticas", "1 Aritmética", "1.1 Números naturales"],
    ["Matemáticas", "1 Aritmética", "1.2 Suma y resta"],
    ["Matemáticas", "2 Álgebra", "2.1 Términos"],
    ["Matemáticas", "2 Álgebra", "2.2 Ecuaciones"],
  ];
  for (const [subject, area, topic] of topics) {
    const dir = path.join(root, subject!, area!, topic!);
    fs.mkdirSync(path.join(dir, "Ejercicios"), { recursive: true });
    fs.writeFileSync(path.join(dir, "_tema.md"), MANIFEST.replace("1.1 Números naturales", topic!), "utf-8");
    fs.writeFileSync(path.join(dir, `${topic}.md`), CONCEPT, "utf-8");
    fs.writeFileSync(path.join(dir, "Ejercicios", "E01.md"), "---\ntype: exercise\nsubject: mathematics\n---\n", "utf-8");
  }
  fs.writeFileSync(path.join(root, "Matemáticas", "00 Índice.md"), "# Índice\n", "utf-8");
  return root;
}

const rel = (root: string, p: string) => path.relative(root, p).split(path.sep).join("/");

describe("view file convention", () => {
  it("recognises the view kinds and no others", () => {
    expect(viewFileKind({ type: "practica" })).toBe("practica");
    expect(viewFileKind({ type: "Teorica" })).toBe("teorica");
    expect(viewFileKind({ type: "resumen" })).toBe("resumen");
    expect(viewFileKind({ type: "concept" })).toBeNull();
    expect(viewFileKind({})).toBeNull();
  });

  it("names the files after their folder", () => {
    expect(viewFileName("1.1 Números naturales", "practica")).toBe("1.1 Números naturales.practica.md");
  });

  it("writes a practica file that is itself the topic manifest", () => {
    const manifest = parseTopicManifest(MANIFEST)!;
    const text = practiceFileText(manifest);
    const parsed = parseTopicManifest(text);
    expect(parsed).not.toBeNull();
    expect(parsed!.subject).toBe("mathematics");
    expect(parsed!.skills).toHaveLength(8);
    expect(parsed!.mastery.min_per_skill).toBe(6);
    expect(parsed!.exam_group).toBe("aritmetica");
  });
});

describe("migrateVault", () => {
  it("turns every _tema.md into a visible practica + teorica pair", () => {
    const root = makeVault();
    try {
      const report = migrateVault(root);
      expect(report.errors).toEqual([]);
      expect(report.topicFolders).toHaveLength(4);

      const topic = path.join(root, "Matemáticas", "1 Aritmética", "1.1 Números naturales");
      expect(fs.existsSync(path.join(topic, "_tema.md"))).toBe(false);
      expect(fs.existsSync(path.join(topic, "1.1 Números naturales.practica.md"))).toBe(true);
      expect(fs.existsSync(path.join(topic, "1.1 Números naturales.teorica.md"))).toBe(true);

      // The theory view points at the concept note the canvases already link to.
      const theoryView = fs.readFileSync(path.join(topic, "1.1 Números naturales.teorica.md"), "utf-8");
      expect(theoryView).toContain("type: teorica");
      expect(theoryView).toContain("teoria: Matemáticas/1 Aritmética/1.1 Números naturales/1.1 Números naturales.md");

      // Overviews: the subject root and each grouping area.
      for (const p of [
        "Matemáticas/Matemáticas.resumen.md",
        "Matemáticas/1 Aritmética/1 Aritmética.resumen.md",
        "Matemáticas/2 Álgebra/2 Álgebra.resumen.md",
      ]) {
        expect(report.created.map((c) => rel(root, c)), `missing ${p}`).toContain(p);
      }
      // A topic folder is not an area: no resumen inside it.
      expect(fs.existsSync(path.join(topic, "1.1 Números naturales.resumen.md"))).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps topic detection working from a note two levels below the manifest", () => {
    const root = makeVault();
    try {
      migrateVault(root);
      const exercise = path.join(root, "Matemáticas", "2 Álgebra", "2.2 Ecuaciones", "Ejercicios", "E01.md");
      const found = findAncestorTopicManifest(exercise, root);
      expect(found).not.toBeNull();
      expect(path.basename(found!.topicFolder)).toBe("2.2 Ecuaciones");
      expect(found!.manifest.title).toBe("2.2 Ecuaciones");

      // …and from the practica file itself.
      const practica = path.join(root, "Matemáticas", "2 Álgebra", "2.2 Ecuaciones", "2.2 Ecuaciones.practica.md");
      expect(topicManifestOf(root, path.dirname(practica))?.title).toBe("2.2 Ecuaciones");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("is idempotent and never overwrites a view file", () => {
    const root = makeVault();
    try {
      migrateVault(root);
      const topic = path.join(root, "Matemáticas", "1 Aritmética", "1.1 Números naturales");
      const practiceFile = path.join(topic, "1.1 Números naturales.practica.md");
      fs.appendFileSync(practiceFile, "\n<!-- edited by hand -->\n", "utf-8");

      const second = migrateVault(root);
      expect(second.created).toEqual([]);
      expect(second.deleted).toEqual([]);
      expect(second.skipped.length).toBeGreaterThan(0);
      expect(fs.readFileSync(practiceFile, "utf-8")).toContain("edited by hand");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not delete the legacy marker when the praticar view cannot be written", () => {
    const root = makeVault();
    try {
      const topic = path.join(root, "Matemáticas", "1 Aritmética", "1.2 Suma y resta");
      // A directory where the practica file wants to be: the write fails.
      fs.mkdirSync(path.join(topic, "1.2 Suma y resta.practica.md"), { recursive: true });
      const report = migrateVault(root);
      expect(report.errors.join(" ")).toContain("kept");
      expect(fs.existsSync(path.join(topic, "_tema.md"))).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("finds the theory note of a folder", () => {
    const root = makeVault();
    try {
      const topic = path.join(root, "Matemáticas", "2 Álgebra", "2.1 Términos");
      expect(path.basename(theoryNoteOf(topic)!)).toBe("2.1 Términos.md");
      // The subject root is not a topic folder: it has no concept note of its own.
      expect(theoryNoteOf(path.join(root, "Matemáticas"))).toBeNull();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("creates the pair for one folder on demand (the in-app action)", () => {
    const root = makeVault();
    try {
      const topic = path.join(root, "Matemáticas", "1 Aritmética", "1.1 Números naturales");
      const first = ensureTopicViewFiles(root, topic);
      expect(first.created.map((c) => path.basename(c)).sort()).toEqual([
        "1.1 Números naturales.practica.md",
        "1.1 Números naturales.teorica.md",
      ]);
      const again = ensureTopicViewFiles(root, topic);
      expect(again.created).toEqual([]);
      expect(again.skipped).toHaveLength(2);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("folderHasTopicsBelow", () => {
  it("tells a grouping folder from a plain one", () => {
    const root = makeVault();
    try {
      migrateVault(root);
      const mat = path.join(root, "Matemáticas");
      expect(folderHasTopicsBelow(root, mat)).toBe(true);
      expect(folderHasTopicsBelow(root, path.join(mat, "1 Aritmética"))).toBe(true);
      // A topic folder holds exercises, not topics.
      expect(folderHasTopicsBelow(root, path.join(mat, "1 Aritmética", "1.1 Números naturales"))).toBe(false);

      fs.mkdirSync(path.join(root, "Suelta"), { recursive: true });
      expect(folderHasTopicsBelow(root, path.join(root, "Suelta"))).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
