// The vault-wide manifest discovery: same topics as the per-folder climb, without
// re-reading the vault. The climb (`findAncestorTopicManifest`) is still the tool
// for "which topic is this note in?", but a dashboard that asks it once per folder
// pays a second full vault read for the answer.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { scanVault } from "./exerciseIndex.js";
import { findAncestorTopicManifest, manifestsFromNotes } from "./topic.js";

const PRACTICA = `---
type: practica
subject: mathematics
title: "1.1 Números"
skills: [solve]
mastery:
  min_per_skill: 6
  target_difficulty: 2
---
`;

const LEGACY = `---
type: topic
subject: mathematics
title: "1.2 Suma"
---
`;

describe("manifestsFromNotes", () => {
  let root: string;

  /** Every .md of the vault, absolute (what the app's vault walk yields). */
  const notePaths = (dir: string, out: string[] = []): string[] => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) notePaths(full, out);
      else if (entry.name.endsWith(".md")) out.push(full);
    }
    return out;
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "nv_manifests_"));
    const topic = path.join(root, "Matemáticas", "1 Aritmética", "1.1 Números");
    fs.mkdirSync(path.join(topic, "Ejercicios"), { recursive: true });
    fs.writeFileSync(path.join(topic, "1.1 Números.practica.md"), PRACTICA, "utf-8");
    fs.writeFileSync(path.join(topic, "1.1 Números.md"), "---\ntype: concept\n---\n\n# Números\n", "utf-8");
    fs.writeFileSync(path.join(topic, "Ejercicios", "e1.md"), "---\ntype: exercise\nskill: solve\ndifficulty: 2\n---\n#### Enunciado\n1+1\n", "utf-8");

    const legacy = path.join(root, "Matemáticas", "1 Aritmética", "1.2 Suma");
    fs.mkdirSync(legacy, { recursive: true });
    fs.writeFileSync(path.join(legacy, "_tema.md"), LEGACY, "utf-8");

    // A folder with no manifest at all, and a plain note: neither is a topic.
    const plain = path.join(root, "Matemáticas", "0 Sueltos");
    fs.mkdirSync(plain, { recursive: true });
    fs.writeFileSync(path.join(plain, "suelta.md"), "---\ntype: concept\n---\n\nNada.\n", "utf-8");
  });

  it("finds every topic of the vault, one per folder", () => {
    const scan = scanVault(root, notePaths(root));
    const found = manifestsFromNotes(scan.notes);
    const titles = found.map((f) => f.manifest.title).sort();
    expect(titles).toEqual(["1.1 Números", "1.2 Suma"]);
    for (const topic of found) {
      expect(path.basename(topic.topicFolder)).toBe(topic.manifest.title);
    }
  });

  it("agrees with the per-folder climb about which folder each topic is", () => {
    const scan = scanVault(root, notePaths(root));
    for (const topic of manifestsFromNotes(scan.notes)) {
      const climbed = findAncestorTopicManifest(topic.topicFolder, root);
      expect(climbed?.topicFolder).toBe(topic.topicFolder);
    }
  });

  it("takes the new view file when a folder carries both names", () => {
    const topic = path.join(root, "Matemáticas", "1 Aritmética", "1.1 Números");
    fs.writeFileSync(path.join(topic, "_tema.md"), LEGACY, "utf-8");
    const scan = scanVault(root, notePaths(root));
    const found = manifestsFromNotes(scan.notes);
    const one = found.find((f) => f.topicFolder === topic)!;
    expect(path.basename(one.manifestPath)).toBe("1.1 Números.practica.md");
  });
});
