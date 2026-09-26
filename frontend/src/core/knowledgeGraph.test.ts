import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { KnowledgeGraph } from "./knowledgeGraph";

describe("KnowledgeGraph", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nv-kg-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("builds nodes and typed edges for prerequisites and wikilinks", () => {
    // Note 1: Functions
    fs.writeFileSync(
      path.join(tempDir, "Functions.md"),
      "---\nsubject: mathematics\ntopic: calculus\ntype: concept\n---\n# Functions",
      "utf-8",
    );

    // Note 2: Derivatives (requires Functions)
    fs.writeFileSync(
      path.join(tempDir, "Derivatives.md"),
      "---\nsubject: mathematics\ntopic: calculus\nrequires: [Functions]\n---\n# Derivatives\nSee also [[Optimization]]",
      "utf-8",
    );

    // Note 3: Optimization
    fs.writeFileSync(
      path.join(tempDir, "Optimization.md"),
      "---\nsubject: mathematics\ntopic: calculus\n---\n# Optimization",
      "utf-8",
    );

    const kg = new KnowledgeGraph(tempDir);
    const graph = kg.build_graph();

    expect(graph.total_nodes).toBe(3);
    expect(graph.total_edges).toBe(2);

    // Prerequisite edge
    const prereqEdge = graph.edges.find((e) => e.relation_type === "prerequisite");
    expect(prereqEdge).toBeDefined();
    expect(prereqEdge?.source).toBe("Functions.md");
    expect(prereqEdge?.target).toBe("Derivatives.md");

    // Related wikilink edge
    const relatedEdge = graph.edges.find((e) => e.relation_type === "related");
    expect(relatedEdge).toBeDefined();
    expect(relatedEdge?.source).toBe("Derivatives.md");
    expect(relatedEdge?.target).toBe("Optimization.md");
  });

  it("resolves wikilinks with extensions, subfolders, and aliases", () => {
    const subDir = path.join(tempDir, "Calculus");
    fs.mkdirSync(subDir, { recursive: true });

    fs.writeFileSync(
      path.join(subDir, "Limits.md"),
      "---\nsubject: mathematics\ntopic: calculus\n---\n# Limits",
      "utf-8",
    );

    fs.writeFileSync(
      path.join(subDir, "Continuity.md"),
      "---\nsubject: mathematics\ntopic: calculus\n---\n# Continuity\nRequires [[Calculus/Limits.md|Limites]] and [[Limits]]",
      "utf-8",
    );

    const kg = new KnowledgeGraph(tempDir);
    const graph = kg.buildGraph();

    expect(graph.total_nodes).toBe(2);
    expect(graph.total_edges).toBe(1);
    expect(graph.edges[0]?.source).toBe("Calculus/Continuity.md");
    expect(graph.edges[0]?.target).toBe("Calculus/Limits.md");
    expect(graph.edges[0]?.relation_type).toBe("related");
  });
});
