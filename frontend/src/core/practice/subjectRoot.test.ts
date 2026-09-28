// The subject root (e.g. `Matemáticas`) groups areas: it has no practice of its
// own, so it must get an overview and never a `practica`/`teorica` view file.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { ensureOverviewFile, ensureTopicViewFiles, isSubjectRoot, folderHasTopicsBelow } from "./viewFiles";

const TOPIC = `---
type: topic
subject: mathematics
title: "1.1 Números"
skills: [solve]
---
`;

function makeVault(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nv-subject-"));
  const topic = path.join(root, "Matemáticas", "1 Aritmética", "1.1 Números");
  fs.mkdirSync(topic, { recursive: true });
  fs.writeFileSync(path.join(topic, "1.1 Números.practica.md"), TOPIC, "utf-8");
  fs.writeFileSync(path.join(topic, "1.1 Números.md"), "---\ntype: teorica\n---\n\n# Números\n", "utf-8");
  fs.writeFileSync(path.join(root, "Matemáticas", "1 Aritmética", "1 Aritmética.resumen.md"), "---\ntype: resumen\n---\n", "utf-8");
  return root;
}

describe("the subject root", () => {
  it("is recognised, and neither its areas nor its topics are", () => {
    const root = makeVault();
    const maths = path.join(root, "Matemáticas");
    expect(isSubjectRoot(root, maths)).toBe(true);
    expect(folderHasTopicsBelow(root, maths)).toBe(true);
    // An area holds topics directly; a topic holds its own manifest.
    expect(isSubjectRoot(root, path.join(maths, "1 Aritmética"))).toBe(false);
    expect(isSubjectRoot(root, path.join(maths, "1 Aritmética", "1.1 Números"))).toBe(false);
    expect(isSubjectRoot(root, path.join(root, "Matemáticas", "1 Aritmética", "1.1 Números"))).toBe(false);
  });

  it("is refused a practice and a theory view", () => {
    const root = makeVault();
    const maths = path.join(root, "Matemáticas");

    const result = ensureTopicViewFiles(root, maths);

    expect(result.created).toEqual([]);
    expect(result.tagged).toEqual([]);
    expect(result.errors).toEqual([maths]);
    expect(fs.existsSync(path.join(maths, "Matemáticas.practica.md"))).toBe(false);
    expect(fs.existsSync(path.join(maths, "Matemáticas.teorica.md"))).toBe(false);
  });

  it("gets only its overview, which is idempotent", () => {
    const root = makeVault();
    const maths = path.join(root, "Matemáticas");

    const first = ensureOverviewFile(root, maths);
    expect(first.created.map((c) => path.basename(c))).toEqual(["Matemáticas.resumen.md"]);
    expect(fs.readFileSync(path.join(maths, "Matemáticas.resumen.md"), "utf-8")).toContain("type: resumen");

    const again = ensureOverviewFile(root, maths);
    expect(again.created).toEqual([]);
    expect(again.skipped.map((c) => path.basename(c))).toEqual(["Matemáticas.resumen.md"]);
  });

  it("keeps a topic-folder view creation working next to it", () => {
    const root = makeVault();
    const area = path.join(root, "Matemáticas", "2 Álgebra");
    const topic = path.join(area, "2.1 Letras");
    fs.mkdirSync(topic, { recursive: true });
    fs.writeFileSync(path.join(topic, "_tema.md"), TOPIC, "utf-8");
    fs.writeFileSync(path.join(topic, "2.1 Letras.md"), "---\ntype: concept\n---\n\n# Letras\n", "utf-8");

    const result = ensureTopicViewFiles(root, topic);

    expect(result.created.map((c) => path.basename(c))).toEqual(["2.1 Letras.practica.md"]);
    expect(result.tagged.map((c) => path.basename(c))).toEqual(["2.1 Letras.md"]);
  });
});
