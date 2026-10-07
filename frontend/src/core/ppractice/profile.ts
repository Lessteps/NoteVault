/**
 * `programming_practice` — the learner's PROFILE (what `pp_postmortem` writes and `pp_build` reads).
 *
 * The AI does not learn in its weights between calls; what makes the next project target the learner's weak points is this
 * file: recurring mistakes with evidence, strengths, observations about how the learner writes code, and the history of
 * what was done. A short summary of it is injected into every `pp_build` prompt, so the effect is the one the learner wants
 * and it stays verifiable (the file can be opened and read).
 */

import * as path from "node:path";
import * as store from "../store.js";
import { formatLayout, LAYOUT } from "../vaultFormat.js";
import { FOCUSES, type Focus } from "./spec.js";

export const LAYERS = ["database", "backend", "client", "desktop", "mobile", "automation", "tests", "process", "logic"] as const;
export type Layer = (typeof LAYERS)[number];

export interface Evidence {
  project: string;
  file?: string;
  line?: number;
  note: string;
}

export interface Weakness {
  id: string;
  label: string;
  layer: Layer;
  category: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  /** Consecutive postmortems of a project that covered this layer without showing the mistake again. */
  cleanStreak: number;
  status: "open" | "improving" | "resolved";
  evidence: Evidence[];
}

export interface Strength {
  label: string;
  count: number;
  lastSeen: string;
}

export interface HistoryEntry {
  at: string;
  kind: "project" | "kata";
  project: string;
  score: number;
  focus?: string;
  summary: string;
  weaknesses: string[];
  strengths: string[];
}

export interface PracticeProfile {
  version: 1;
  weaknesses: Weakness[];
  strengths: Strength[];
  /** How the learner writes code, as observed (max 8, newest first). */
  style: string[];
  history: HistoryEntry[];
}

/** What the model returns from a postmortem. */
export interface Postmortem {
  kind: "project" | "kata";
  project: string;
  score: number;
  focus?: string;
  summary: string;
  /** Layers this work actually exercised (a weakness in an untouched layer is not "clean"). */
  coveredLayers: string[];
  weaknesses: Array<{ label: string; layer: string; category?: string; evidence?: Array<{ file?: string; line?: number; note?: string }> }>;
  strengths: string[];
  styleNotes: string[];
  nextFocus?: string;
}

const MAX_EVIDENCE = 5;
const MAX_STYLE = 8;
const MAX_HISTORY = 200;
/** Two clean runs in a row and a weakness is considered gone. */
const RESOLVE_AFTER = 2;

export const emptyProfile = (): PracticeProfile => ({ version: 1, weaknesses: [], strengths: [], style: [], history: [] });

export const weaknessId = (label: string): string =>
  String(label ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

const asLayer = (v: unknown): Layer => ((LAYERS as readonly string[]).includes(String(v)) ? (String(v) as Layer) : "logic");

export function profilePath(root: string): string {
  return path.join(path.resolve(root), formatLayout(LAYOUT.study_pp_profile, {}));
}

export function loadProfile(root: string): PracticeProfile {
  const raw = store.loadJson<Partial<PracticeProfile>>(profilePath(root), null);
  if (!raw || typeof raw !== "object") return emptyProfile();
  return {
    version: 1,
    weaknesses: Array.isArray(raw.weaknesses) ? raw.weaknesses : [],
    strengths: Array.isArray(raw.strengths) ? raw.strengths : [],
    style: Array.isArray(raw.style) ? raw.style.map(String) : [],
    history: Array.isArray(raw.history) ? raw.history : [],
  };
}

export function saveProfile(root: string, profile: PracticeProfile): void {
  store.writeJson(profilePath(root), profile);
}

/** Folds one postmortem into the profile (pure: returns a new profile). */
export function applyPostmortem(profile: PracticeProfile, pm: Postmortem, at: string): PracticeProfile {
  const next: PracticeProfile = JSON.parse(JSON.stringify(profile));
  const covered = new Set(pm.coveredLayers.map(asLayer));
  const seen = new Set<string>();

  for (const w of pm.weaknesses) {
    const id = weaknessId(w.label);
    if (!id) continue;
    seen.add(id);
    const evidence: Evidence[] = (w.evidence ?? []).map((e) => ({ project: pm.project, file: e.file, line: e.line, note: String(e.note ?? "").slice(0, 200) }));
    const existing = next.weaknesses.find((x) => x.id === id);
    if (existing) {
      existing.count += 1;
      existing.lastSeen = at;
      existing.cleanStreak = 0;
      existing.status = "open";
      existing.evidence = [...evidence, ...existing.evidence].slice(0, MAX_EVIDENCE);
    } else {
      next.weaknesses.push({
        id,
        label: String(w.label).slice(0, 120),
        layer: asLayer(w.layer),
        category: String(w.category ?? "implementation"),
        count: 1,
        firstSeen: at,
        lastSeen: at,
        cleanStreak: 0,
        status: "open",
        evidence: evidence.slice(0, MAX_EVIDENCE),
      });
    }
  }

  // A weakness whose layer was exercised and did NOT reappear moves towards resolved.
  for (const w of next.weaknesses) {
    if (seen.has(w.id) || w.status === "resolved" || !covered.has(w.layer)) continue;
    w.cleanStreak += 1;
    w.status = w.cleanStreak >= RESOLVE_AFTER ? "resolved" : "improving";
  }

  for (const label of pm.strengths) {
    const clean = String(label).trim().slice(0, 120);
    if (!clean) continue;
    const s = next.strengths.find((x) => x.label.toLowerCase() === clean.toLowerCase());
    if (s) {
      s.count += 1;
      s.lastSeen = at;
    } else next.strengths.push({ label: clean, count: 1, lastSeen: at });
  }

  const styleNew = pm.styleNotes.map((n) => String(n).trim()).filter(Boolean);
  next.style = [...styleNew, ...next.style.filter((old) => !styleNew.some((n) => n.toLowerCase() === old.toLowerCase()))].slice(0, MAX_STYLE);

  next.history.push({
    at,
    kind: pm.kind,
    project: pm.project,
    score: Math.max(0, Math.min(100, Math.round(pm.score))),
    ...(pm.focus ? { focus: pm.focus } : {}),
    summary: String(pm.summary).slice(0, 400),
    weaknesses: [...seen],
    strengths: pm.strengths.map(String).slice(0, 5),
  });
  if (next.history.length > MAX_HISTORY) next.history = next.history.slice(-MAX_HISTORY);
  return next;
}

/** Recency-weighted importance: repeats matter, and old open mistakes fade slowly. */
function weight(w: Weakness, nowMs: number): number {
  const days = Math.max(0, (nowMs - Date.parse(w.lastSeen || "")) / 86_400_000) || 0;
  const status = w.status === "open" ? 1 : w.status === "improving" ? 0.4 : 0;
  return w.count * status * Math.pow(0.97, days);
}

export function topWeaknesses(profile: PracticeProfile, n = 5, now = Date.now()): Weakness[] {
  return profile.weaknesses
    .filter((w) => w.status !== "resolved")
    .map((w) => ({ w, s: weight(w, now) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, n)
    .map((x) => x.w);
}

const LAYER_FOCUS: Partial<Record<Layer, Focus>> = { database: "databases", backend: "backend", client: "frontend", desktop: "desktop", mobile: "mobile", automation: "automation" };

/** The focus where the learner is weakest right now, or null when the profile says nothing about a layer. */
export function suggestFocus(profile: PracticeProfile, now = Date.now()): Focus | null {
  const scores = new Map<Focus, number>();
  for (const w of profile.weaknesses) {
    const focus = LAYER_FOCUS[w.layer];
    if (focus) scores.set(focus, (scores.get(focus) ?? 0) + weight(w, now));
  }
  let best: Focus | null = null;
  let top = 0;
  for (const f of FOCUSES) {
    const s = scores.get(f) ?? 0;
    if (s > top) {
      top = s;
      best = f;
    }
  }
  return best;
}

/** The short text that goes into `pp_build` prompts. Empty when there is no history yet. */
export function profileSummary(profile: PracticeProfile, maxChars = 1400, now = Date.now()): string {
  const weak = topWeaknesses(profile, 5, now);
  const strong = [...profile.strengths].sort((a, b) => b.count - a.count).slice(0, 3);
  const projects = profile.history.filter((h) => h.kind === "project");
  const lines: string[] = [];
  if (projects.length) {
    const last = projects.slice(-3).map((h) => `${h.project} (${h.score})`).join(", ");
    lines.push(`Recent projects: ${last}.`);
  }
  if (weak.length) {
    lines.push("Recurring weaknesses (most important first):");
    for (const w of weak) lines.push(`- [${w.layer}] ${w.label} — seen ${w.count}×${w.status === "improving" ? ", improving" : ""}${w.evidence[0]?.note ? `; e.g. ${w.evidence[0].note}` : ""}`);
  }
  if (strong.length) lines.push(`Strengths: ${strong.map((s) => s.label).join("; ")}.`);
  if (profile.style.length) lines.push(`How the learner writes code: ${profile.style.slice(0, 4).join("; ")}.`);
  return lines.join("\n").slice(0, maxChars);
}
