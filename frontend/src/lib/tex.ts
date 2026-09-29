// KaTeX to HTML with a small cache: the editor re-renders the visible formulas on
// every cursor move, and the same formula should not be typeset twice.

import katex from "katex";
import { escapeHtml } from "./markdown";

const cache = new Map<string, string>();
const CACHE_MAX = 300;

export function renderTex(tex: string, display: boolean): string {
  const key = `${display ? "D" : "I"}${tex}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  let html: string;
  try {
    html = katex.renderToString(tex, { throwOnError: false, displayMode: display });
  } catch {
    html = `<code>${escapeHtml(tex)}</code>`;
  }
  cache.set(key, html);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
  return html;
}
