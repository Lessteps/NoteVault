/**
 * Concept cards: the `## Tarjetas` section of concept notes, indexed as SRS items.
 *
 * Format (docs/knowledge_base/templates/concept.md):
 *
 *     ## Tarjetas
 *     ### T1 · definicion
 *     **P:** question
 *     **R:** answer
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { SrsItem, StudySRSManager, generateSrsId } from "../studySrsManager.js";
import { CardNote, ExerciseRef, isTrue } from "./exerciseIndex.js";

export const ENTITY_TYPE = "card";
export const NEW_CARDS_PER_DAY = 10;

const _SECTION_NAMES = new Set(["tarjetas", "cards", "flashcards"]);
const _HEAD_RE = /^\s*T?\s*(\d+)\s*(?:[·\-—–:|.]\s*(.*))?$/i;
const _MARK_RE =
  /^\s*(?:[-*+]\s+)?(?:\*\*|__)?\s*(P|Q|R|A|Pregunta|Respuesta|Question|Answer)\s*(?:\*\*|__)?\s*[:：]\s*(?:\*\*|__)?\s*(.*)$/i;
const _FENCE_RE = /^\s*(```|~~~)/;
const _QUESTION = new Set(["p", "q", "pregunta", "question"]);

export interface Card {
  number: number;
  kind: string;
  question: string;
  answer: string;
}

function _fold(text: string): string {
  const plain = text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  return plain.toLowerCase().trim().split(/\s+/).join(" ");
}

function _cardsSection(text: string): string[] {
  const lines: string[] = [];
  let inside = false;
  let fence = false;
  for (const line of (text || "").split(/\r?\n/)) {
    if (_FENCE_RE.test(line)) {
      fence = !fence;
    }
    if (!fence && line.startsWith("## ") && !line.startsWith("### ")) {
      if (inside) {
        break;
      }
      inside = _SECTION_NAMES.has(_fold(line.slice(3)));
      continue;
    }
    if (!fence && line.startsWith("# ") && inside) {
      break;
    }
    if (inside) {
      lines.push(line);
    }
  }
  return lines;
}

export function parseCards(text: string): Card[] {
  const cards: Card[] = [];
  const blocks: Array<[string, string[]]> = [];
  for (const line of _cardsSection(text)) {
    if (line.startsWith("### ")) {
      blocks.push([line.slice(4).trim(), []]);
    } else if (blocks.length > 0) {
      blocks[blocks.length - 1]![1].push(line);
    }
  }
  for (let ordinal = 1; ordinal <= blocks.length; ordinal++) {
    const block = blocks[ordinal - 1];
    if (!block) continue;
    const [heading, body] = block;
    const m = _HEAD_RE.exec(heading);
    const number = m && m[1] ? parseInt(m[1], 10) : ordinal;
    const kind = (m && m[2] ? m[2] : heading).toLowerCase().trim().split(/\s+/).join(" ");
    const parts: Record<string, string[]> = { q: [], a: [] };
    let current: "q" | "a" | null = null;
    for (const line of body) {
      const mark = _MARK_RE.exec(line);
      if (mark && mark[1]) {
        current = _QUESTION.has(mark[1].toLowerCase()) ? "q" : "a";
        const val = (mark[2] || "").replace(/[* ]+$/, "").trim();
        parts[current]!.push(val);
      } else if (current && line.trim()) {
        parts[current]!.push(line.trim());
      }
    }
    const question = (parts.q || []).join("\n").trim();
    const answer = (parts.a || []).join("\n").trim();
    if (question) {
      cards.push({ number, kind, question, answer });
    }
  }
  return cards;
}

export const parse_cards = parseCards;

export function cardEntityId(conceptId: string, number: number): string {
  return `${conceptId}#T${number}`;
}

export const card_entity_id = cardEntityId;

export function splitEntityId(entityId: string): [string, number] {
  const s = String(entityId);
  const idx = s.lastIndexOf("#T");
  if (idx === -1) {
    return [s, 0];
  }
  const concept = s.slice(0, idx);
  const tail = s.slice(idx + 2);
  const num = parseInt(tail, 10);
  return Number.isNaN(num) ? [s, 0] : [concept, num];
}

export const split_entity_id = splitEntityId;

export function isStudied(
  note: CardNote,
  exercises: ExerciseRef[],
  attemptedIds: Set<string> | Iterable<string>
): boolean {
  const attempted = attemptedIds instanceof Set ? attemptedIds : new Set(attemptedIds);
  const fm = note.frontmatter || {};
  if (isTrue(fm.estudiado) || isTrue(fm.studied)) {
    return true;
  }
  return exercises.some((e) => e.concept === note.concept_id && attempted.has(e.note_id));
}

export const is_studied = isStudied;

export function indexCards(
  vaultRoot: string,
  cardNotes: CardNote[],
  exercises: ExerciseRef[] = [],
  attemptedIds: Set<string> | Iterable<string> = new Set(),
  srs?: StudySRSManager | null
): SrsItem[] {
  const srsMgr = srs || new StudySRSManager(vaultRoot);
  const existing = new Map<string, SrsItem>();
  for (const item of srsMgr.allItems()) {
    existing.set(item.id, item);
  }
  const items: SrsItem[] = [];
  const attemptedSet = attemptedIds instanceof Set ? attemptedIds : new Set(attemptedIds);

  for (const note of cardNotes) {
    if (!isStudied(note, exercises, attemptedSet)) {
      continue;
    }
    let diff = note.frontmatter?.difficulty;
    let difficulty = 2;
    if (diff !== undefined && diff !== null) {
      const parsed = parseInt(String(diff), 10);
      if (!Number.isNaN(parsed)) {
        difficulty = Math.max(1, Math.min(5, parsed));
      }
    }
    for (const card of parseCards(note.text)) {
      const entityId = cardEntityId(note.concept_id, card.number);
      const srsId = generateSrsId(note.subject, ENTITY_TYPE, entityId);
      const known = existing.get(srsId);
      if (known) {
        items.push(known);
      } else {
        const registered = srsMgr.registerItem(
          entityId,
          ENTITY_TYPE,
          note.subject,
          note.concept_id,
          note.rel,
          difficulty
        );
        items.push(registered);
      }
    }
  }
  return items;
}

export const index_cards = indexCards;

export function loadCard(vaultRoot: string, item: Record<string, any>): Card | null {
  const [, number] = splitEntityId(String(item.entity_id || ""));
  const filePath = path.join(path.resolve(vaultRoot), String(item.source_note || ""));
  try {
    const text = fs.readFileSync(filePath, "utf-8");
    return parseCards(text).find((c) => c.number === number) || null;
  } catch {
    return null;
  }
}

export const load_card = loadCard;
