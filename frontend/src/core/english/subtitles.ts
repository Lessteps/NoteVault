// Ported from notevault_app/core/english/subtitles.py
// Subtitle files (.srt / .vtt): parsing, EN+ES pairing and cue lookup.
// Times are integer milliseconds.

import * as fs from "node:fs";
import * as path from "node:path";

export const SUBTITLE_EXTS = [".srt", ".vtt"];
const ENCODINGS = ["utf-8", "windows-1252", "latin1"] as const;

export const EN_TAGS = new Set(["en", "eng", "english", "en-us", "en-gb", "ingles", "inglés"]);
export const ES_TAGS = new Set(["es", "spa", "spanish", "es-419", "es-es", "es-mx", "espanol", "español"]);

const TIME = String.raw`(?:(\d{1,3}):)?(\d{1,2}):(\d{1,2})(?:[,.](\d{1,3}))?`;
const TIMING_RE = new RegExp(String.raw`^\s*${TIME}\s*-->\s*${TIME}`);
const TAG_RE = /<[^>\n]*>/g;
const ASS_RE = /\{\\[^}]*\}/g;
const SPACES_RE = /[ \t]+/g;

export class Cue {
  constructor(public start: number, public end: number, public text: string) {}
  get line(): string {
    return this.text
      .split("\n")
      .map((p) => p.trim())
      .filter((p) => p)
      .join(" ");
  }
}

export interface SentencePair {
  start: number;
  end: number;
  en: string;
  es: string;
}

function ms(h: string | undefined, m: string, s: string, frac: string | undefined): number {
  const f = (frac || "0").padEnd(3, "0").slice(0, 3);
  return ((Number(h || 0) * 60 + Number(m)) * 60 + Number(s)) * 1000 + Number(f);
}

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
};

function htmlUnescape(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X"
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return body.toLowerCase() in ENTITIES ? ENTITIES[body.toLowerCase()]! : whole;
  });
}

export function cleanText(text: string): string {
  let out = (text || "").replace(ASS_RE, "");
  out = out.replace(TAG_RE, "");
  out = htmlUnescape(out).replace(/ /g, " ");
  return out
    .split("\n")
    .map((ln) => ln.replace(SPACES_RE, " ").trim())
    .filter((ln) => ln)
    .join("\n");
}

export function parseSubtitles(text: string): Cue[] {
  const lines = (text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/^﻿/, "")
    .split("\n");
  const cues: Cue[] = [];
  let current: [number, number] | null = null;
  let body: string[] = [];
  let skipping = false;

  const flush = (beforeTiming = false) => {
    if (current === null) return;
    while (beforeTiming && body.length && /^\d+$/.test(body[body.length - 1]!.trim())) {
      body.pop();
    }
    const cleaned = cleanText(body.join("\n"));
    if (cleaned && current[1] > current[0]) {
      cues.push(new Cue(current[0], current[1], cleaned));
    }
  };

  for (const raw of lines) {
    const m = TIMING_RE.exec(raw);
    if (m) {
      flush(true);
      current = [ms(m[1], m[2]!, m[3]!, m[4]), ms(m[5], m[6]!, m[7]!, m[8])];
      body = [];
      skipping = false;
      continue;
    }
    const stripped = raw.trim();
    if (current === null || skipping) {
      if (!stripped) skipping = false;
      continue;
    }
    if (!stripped) {
      flush();
      current = null;
      body = [];
      continue;
    }
    if (!body.length && /^(NOTE|STYLE|REGION)\b/.test(stripped)) {
      skipping = true;
      continue;
    }
    body.push(raw);
  }
  flush();
  cues.sort((a, b) => a.start - b.start || a.end - b.end);
  return cues;
}

export function readTextFile(p: string): string {
  const data = fs.readFileSync(p);
  for (const enc of ENCODINGS) {
    try {
      return new TextDecoder(enc, { fatal: true }).decode(data);
    } catch {
      continue;
    }
  }
  return new TextDecoder("utf-8").decode(data);
}

export function loadSubtitles(p: string): Cue[] {
  return parseSubtitles(readTextFile(p));
}

/** Index of the last element with start <= value (bisect_right - 1). */
function bisectRight(starts: number[], value: number): number {
  let lo = 0;
  let hi = starts.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (value < starts[mid]!) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

export function pairTracks(primary: Cue[], secondary: Cue[] | null = null): SentencePair[] {
  const assigned = new Map<number, Cue[]>();
  const starts = primary.map((c) => c.start);
  for (const sub of secondary || []) {
    const lo = Math.max(0, bisectRight(starts, sub.start) - 3);
    let best = -1;
    let bestOverlap = 0;
    for (let i = lo; i < primary.length; i++) {
      const cue = primary[i]!;
      if (cue.start >= sub.end) break;
      const overlap = Math.min(cue.end, sub.end) - Math.max(cue.start, sub.start);
      if (overlap > bestOverlap) {
        best = i;
        bestOverlap = overlap;
      }
    }
    if (best >= 0) {
      if (!assigned.has(best)) assigned.set(best, []);
      assigned.get(best)!.push(sub);
    }
  }
  return primary.map((c, i) => ({
    start: c.start,
    end: c.end,
    en: c.line,
    es: (assigned.get(i) || []).map((s) => s.line).join(" "),
  }));
}

export function cueAt(cues: Cue[], msValue: number): number {
  const i = bisectRight(cues.map((c) => c.start), msValue) - 1;
  return i >= 0 && msValue < cues[i]!.end ? i : -1;
}

export function cueBefore(cues: Cue[], msValue: number): number {
  return bisectRight(cues.map((c) => c.start), msValue) - 1;
}

export function subtitleTag(media: string, candidate: string): string | null {
  const name = path.basename(candidate).toLowerCase();
  const stem = path.parse(media).name.toLowerCase();
  const ext = path.extname(candidate).toLowerCase();
  if (!SUBTITLE_EXTS.includes(ext) || !name.startsWith(stem + ".")) return null;
  let tag = name.slice(stem.length + 1, name.length - ext.length);
  tag = tag.replace(/^\.+/, "").replace(/\.+$/, "");
  if (!tag) return "";
  const last = tag.split(".").pop()!;
  if (EN_TAGS.has(last)) return "en";
  if (ES_TAGS.has(last)) return "es";
  return null;
}

export function findSiblingSubtitles(media: string): [string | null, string | null] {
  const found: Record<string, string> = {};
  let entries: string[];
  try {
    entries = fs.readdirSync(path.dirname(media));
  } catch {
    return [null, null];
  }
  entries.sort((a, b) => {
    const aSrt = path.extname(a).toLowerCase() !== ".srt";
    const bSrt = path.extname(b).toLowerCase() !== ".srt";
    if (aSrt !== bSrt) return aSrt ? 1 : -1;
    return a < b ? -1 : a > b ? 1 : 0;
  });
  for (const name of entries) {
    const full = path.join(path.dirname(media), name);
    if (!fs.statSync(full).isFile()) continue;
    const tag = subtitleTag(media, full);
    if (tag !== null && !(tag in found)) found[tag] = full;
  }
  return [found.en ?? found[""] ?? null, found.es ?? null];
}

export const parse_subtitles = parseSubtitles;
export const load_subtitles = loadSubtitles;
export const clean_text = cleanText;
export const pair_tracks = pairTracks;
export const cue_at = cueAt;
export const cue_before = cueBefore;
export const subtitle_tag = subtitleTag;
export const find_sibling_subtitles = findSiblingSubtitles;
