/**
 * Domains: which body of study a topic belongs to, and what classifies it inside that domain.
 *
 *   mathematics / programming → a topic TYPE (theoretical | procedural | mixed), as always
 *   english                   → a BRANCH (grammar | writing | reading | listening | speaking)
 *
 * Mathematics behaves exactly as before (`mathGolden.test.ts` freezes it). English has no type and,
 * above all, NO default: a topic whose branch is not declared (`branch:` in its `.practica.md`) and
 * not told by its folder (`Inglés/3 Lectura/…`) is UNCLASSIFIED — it is reported with a suggestion and
 * has to be resolved explicitly, never silently treated as "mixed".
 */

import {
  branchFromPath,
  ENGLISH_BRANCHES,
  type EnglishBranch,
  isEnglishBranch,
  suggestBranch,
} from "../../lib/englishSkillData.js";
import { detectTopicType, normaliseTopicType, type TopicType } from "./topicType.js";

export type Domain = "math" | "programming" | "english";

/** What a topic is classified by: a type (math, programming) or a branch (English). */
export type TopicKey = TopicType | EnglishBranch;

export function domainOfSubject(subject: string): Domain {
  const s = String(subject ?? "").trim().toLowerCase();
  if (s === "english" || s === "ingles" || s === "inglés") return "english";
  if (s === "programming" || s === "programacion" || s === "programación") return "programming";
  return "math";
}

export const isEnglishSubject = (subject: string): boolean => domainOfSubject(subject) === "english";

export type Classification =
  | { domain: "math" | "programming"; topicType: TopicType; branch?: undefined; via: "manifest" | "name" }
  | { domain: "english"; branch: EnglishBranch; topicType?: undefined; via: "manifest" | "path" };

export interface Unclassified {
  ok: false;
  domain: "english";
  /** what is missing, in Spanish, ready to show */
  reason: string;
  /** a guess from the topic's name, offered as a one-click choice — NEVER applied on its own */
  suggestion: EnglishBranch | null;
}

export type ClassifyResult = { ok: true; value: Classification } | Unclassified;

export interface ClassifyInput {
  subject: string;
  /** the topic's title (its manifest title, or its folder name) */
  name: string;
  /** vault-relative folder of the topic, when known */
  folderRel?: string;
  /** `topic_type:` of the manifest */
  manifestType?: string | null;
  /** `branch:` of the manifest */
  manifestBranch?: string | null;
}

export function classifyTopic(input: ClassifyInput): ClassifyResult {
  const domain = domainOfSubject(input.subject);
  if (domain !== "english") {
    // Identical to what the app did before English existed.
    const declared = normaliseTopicType(input.manifestType ?? undefined);
    return declared
      ? { ok: true, value: { domain, topicType: declared, via: "manifest" } }
      : { ok: true, value: { domain, topicType: detectTopicType({ name: input.name }).type, via: "name" } };
  }
  if (isEnglishBranch(input.manifestBranch)) {
    return { ok: true, value: { domain, branch: String(input.manifestBranch).trim().toLowerCase() as EnglishBranch, via: "manifest" } };
  }
  const fromPath = input.folderRel ? branchFromPath(input.folderRel) : null;
  if (fromPath) return { ok: true, value: { domain, branch: fromPath, via: "path" } };
  return {
    ok: false,
    domain,
    reason: "Este tema de inglés no dice a qué rama pertenece (gramática, escritura, lectura, escucha o habla): no está en una carpeta de rama ni tiene `branch:` en su archivo de práctica.",
    suggestion: suggestBranch(input.name),
  };
}

/** The classification key the skill catalogue fits against (a topic type or a branch). */
export function keyOf(c: Classification): TopicKey {
  return c.domain === "english" ? c.branch : c.topicType;
}

export const BRANCH_LABELS: Record<EnglishBranch, string> = Object.fromEntries(
  ENGLISH_BRANCHES.map((b) => [b.id, b.label]),
) as Record<EnglishBranch, string>;
