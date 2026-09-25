/**
 * NoteVault Knowledge Graph Engine
 * Builds an interactive pedagogical graph of learning entities, wikilinks, and typed relationships.
 * Relationship types: prerequisite, related, part_of, uses, applied_by, practiced_by, common_error.
 * Ported from notevault_app/core/knowledge_graph.py.
 */

import * as path from "node:path";
import { parseFrontmatter } from "./frontmatter";
import { VaultManager } from "./vaultManager";

export interface KnowledgeGraphNode {
  id: string;
  title: string;
  subject: string;
  topic: string;
  type: string;
  difficulty: number;
  mastery: number;
}

export interface KnowledgeGraphEdge {
  source: string;
  target: string;
  relation_type: string;
}

export interface KnowledgeGraphData {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
  total_nodes: number;
  total_edges: number;
}

function safeInt(value: unknown, defaultValue = 0): number {
  try {
    const n = Math.trunc(Number(value));
    return Number.isNaN(n) ? defaultValue : n;
  } catch {
    return defaultValue;
  }
}

function safeFloat(value: unknown, defaultValue = 0.0): number {
  try {
    const n = Number(value);
    return Number.isNaN(n) ? defaultValue : n;
  } catch {
    return defaultValue;
  }
}

export class KnowledgeGraph {
  vaultRoot: string;
  vault: VaultManager;

  constructor(vaultRoot: string) {
    this.vaultRoot = path.resolve(vaultRoot);
    this.vault = new VaultManager(this.vaultRoot);
  }

  buildGraph(): KnowledgeGraphData {
    const notes = this.vault.allNotes();
    const nodes: KnowledgeGraphNode[] = [];
    const edges: KnowledgeGraphEdge[] = [];
    const nodesByTitle = new Map<string, string>(); // title.toLowerCase() -> nodeId

    const fmByNote = new Map<string, Record<string, any>>();

    // 1. Build nodes
    for (const note of notes) {
      const nodeId = note.relPath.replace(/\\/g, "/");
      const [fm] = parseFrontmatter(note.raw);
      fmByNote.set(nodeId, fm);

      const subj = String(fm.subject || "general").toLowerCase();
      const topic = String(fm.topic || "").trim();
      const ntype = String(fm.type || "concept").toLowerCase();
      const difficulty = safeInt(fm.difficulty, 1);
      const mastery = safeFloat(fm.mastery, 0.0);

      nodes.push({
        id: nodeId,
        title: note.title,
        subject: subj,
        topic,
        type: ntype,
        difficulty,
        mastery,
      });
      nodesByTitle.set(note.title.toLowerCase(), nodeId);
    }

    const edgePairs = new Set<string>();

    // 2. Build edges from frontmatter relations and wikilinks
    for (const note of notes) {
      const sourceId = note.relPath.replace(/\\/g, "/");
      const fm = fmByNote.get(sourceId) || {};

      // Prerequisite relations
      const rawPrereqs = fm.prerequisites || fm.requires || [];
      const prereqs = Array.isArray(rawPrereqs)
        ? rawPrereqs
        : typeof rawPrereqs === "string"
          ? [rawPrereqs]
          : [];

      for (const p of prereqs) {
        const targetTitle = String(p).trim().toLowerCase();
        const targetId = nodesByTitle.get(targetTitle);
        if (targetId && !edgePairs.has(`${targetId}|${sourceId}`)) {
          edgePairs.add(`${targetId}|${sourceId}`);
          edges.push({
            source: targetId,
            target: sourceId,
            relation_type: "prerequisite",
          });
        }
      }

      // Uses / Used by
      const rawUses = fm.uses || [];
      const usesList = Array.isArray(rawUses)
        ? rawUses
        : typeof rawUses === "string"
          ? [rawUses]
          : [];

      for (const u of usesList) {
        const targetTitle = String(u).trim().toLowerCase();
        const targetId = nodesByTitle.get(targetTitle);
        if (targetId && !edgePairs.has(`${sourceId}|${targetId}`)) {
          edgePairs.add(`${sourceId}|${targetId}`);
          edges.push({
            source: sourceId,
            target: targetId,
            relation_type: "uses",
          });
        }
      }

      // Wikilinks (general bidirectional related links)
      for (const link of note.wikilinks) {
        const targetTitle = link.trim().toLowerCase();
        const targetId = nodesByTitle.get(targetTitle);
        if (targetId && targetId !== sourceId && !edgePairs.has(`${sourceId}|${targetId}`)) {
          edgePairs.add(`${sourceId}|${targetId}`);
          edges.push({
            source: sourceId,
            target: targetId,
            relation_type: "related",
          });
        }
      }
    }

    return {
      nodes,
      edges,
      total_nodes: nodes.length,
      total_edges: edges.length,
    };
  }

  build_graph(): KnowledgeGraphData {
    return this.buildGraph();
  }
}
