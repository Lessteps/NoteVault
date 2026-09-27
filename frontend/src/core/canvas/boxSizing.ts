/**
 * Box sizing for existing canvases: every text box must show all of its text.
 *
 * The canvas builder sizes a card from its content when it *builds* a map, but
 * the maps already in a vault were written with fixed heights, so the renderer
 * (which clips its overflow) cuts the text off. This pass recomputes the height
 * of every text card the same way the builder does and, when a card grows,
 * pushes the cards below it (inside the same column) and the groups around them
 * so nothing ends up overlapping.
 *
 * Grow-only and idempotent: running it twice changes nothing the second time.
 */

import { CanvasDoc, CanvasNode } from "./canvasFormat.js";
import { LINE_H, NODE_OVERHEAD } from "./canvasBuilder.js";

/** Same estimate the builder uses for `<w>` wide text: ~8 px per character. */
export function requiredTextHeight(text: string, width: number): number {
  const charsPerLine = Math.max(8, (width - 32) / 8);
  const lines = text.split("\n").reduce((acc, line) => acc + Math.max(1, Math.ceil((line.length || 1) / charsPerLine)), 0);
  return Math.max(70, NODE_OVERHEAD + lines * LINE_H);
}

interface Rect { x: number; y: number; width: number; height: number }

const overlapsX = (a: Rect, b: Rect): boolean => {
  const shared = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  return shared > Math.min(a.width, b.width) * 0.35;
};

const overlapsY = (a: Rect, b: Rect): boolean => a.y < b.y + b.height && b.y < a.y + a.height;

const contains = (outer: Rect, inner: Rect): boolean =>
  inner.x >= outer.x && inner.y >= outer.y &&
  inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;

export interface BoxFix {
  grown: number;
  moved: number;
  groups: number;
}

export interface BoxFixResult {
  doc: CanvasDoc;
  fix: BoxFix;
}

/**
 * Returns a copy of `doc` whose text cards fit their text.
 * `gap` is the vertical breathing room left between two cards.
 */
export function fixCanvasBoxes(doc: CanvasDoc, gap = 24): BoxFixResult {
  const nodes = doc.nodes.map((n) => new CanvasNode({ ...n.toDict(), id: n.id, type: n.type } as never));
  const fix: BoxFix = { grown: 0, moved: 0, groups: 0 };
  const groups = nodes.filter((n) => n.type === "group").sort((a, b) => a.y - b.y);
  const cards = nodes.filter((n) => n.type !== "group");

  // 1. Membership first, on the *original* geometry: a card belongs to the
  //    innermost group that wraps it, so the group can follow it later.
  const membership = new Map<string, CanvasNode>();
  for (const card of cards) {
    const wrapper = groups
      .filter((g) => contains(g, card))
      .sort((a, b) => a.width * a.height - b.width * b.height)[0];
    if (wrapper) membership.set(card.id, wrapper);
  }

  // 2. Grow every text card to fit its content.
  for (const card of cards) {
    if (card.type !== "text") continue;
    const need = requiredTextHeight(card.text ?? "", card.width);
    if (need > card.height + 1) {
      card.height = Math.ceil(need);
      fix.grown += 1;
    }
  }

  // 3. Push down whatever now collides, top to bottom, card by card.
  const placed: CanvasNode[] = [];
  const ordered = [...cards].sort((a, b) => a.y - b.y || a.x - b.x);
  for (const node of ordered) {
    let guard = 0;
    for (;;) {
      const clash = placed.find(
        (p) => membership.get(p.id)?.id === membership.get(node.id)?.id && overlapsX(p, node) && overlapsY(p, node),
      );
      if (!clash || guard++ > 200) break;
      const delta = clash.y + clash.height + gap - node.y;
      if (delta <= 0) break;
      node.y += delta;
      fix.moved += 1;
    }
    placed.push(node);
  }

  // 4. Grow the groups so they still wrap their cards.
  for (const g of groups) {
    const inside = cards.filter((n) => membership.get(n.id)?.id === g.id);
    if (!inside.length) continue;
    const bottom = Math.max(...inside.map((n) => n.y + n.height));
    const right = Math.max(...inside.map((n) => n.x + n.width));
    const newHeight = Math.max(g.height, Math.ceil(bottom - g.y + 30));
    const newWidth = Math.max(g.width, Math.ceil(right - g.x + 30));
    if (newHeight !== g.height || newWidth !== g.width) {
      g.height = newHeight;
      g.width = newWidth;
      fix.groups += 1;
    }
  }

  return { doc: new CanvasDoc([...groups, ...cards], doc.edges), fix };
}

/** How many text cards of `doc` are shorter than their text (a health check). */
export function shortBoxes(doc: CanvasDoc): CanvasNode[] {
  return doc.nodes.filter((n) => n.type === "text" && requiredTextHeight(n.text ?? "", n.width) > n.height + 1);
}
