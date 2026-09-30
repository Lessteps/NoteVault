/**
 * The learner's SOURCES for listening and speaking: a podcast episode, a film or a TED talk, each an audio or video
 * file of their own plus its transcript (a subtitle file, `.srt` / `.vtt`). The app never searches for or downloads
 * content; a source only points at the files the learner already has.
 *
 * Stored one JSON per source in `.notevault/estudio/fuentes/`. Paths inside the vault are kept relative to it (so the
 * vault can move between devices); anything else is kept as given.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { loadJson, newId, writeJson } from "../store.js";
import { isSyncConflict } from "../vaultFormat.js";

export const SOURCE_KINDS = ["podcast", "movie", "ted"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export const SOURCE_KIND_LABELS: Record<SourceKind, string> = { podcast: "Podcast", movie: "Película", ted: "TED Talk" };

export interface Source {
  id: string;
  kind: SourceKind;
  title: string;
  /** the audio or video file */
  media: string;
  /** the transcript with times (`.srt` / `.vtt`); empty when the source has none yet */
  transcript: string;
  added: string;
}

const dirOf = (root: string): string => path.join(root, ".notevault", "estudio", "fuentes");

const isInside = (root: string, p: string): boolean => {
  const rel = path.relative(root, p);
  return !!rel && !rel.startsWith("..") && !path.isAbsolute(rel);
};

/** How a path is stored: relative to the vault when it lives there. */
export function storedPath(root: string, p: string): string {
  const abs = path.resolve(p);
  return isInside(root, abs) ? path.relative(root, abs).replace(/\\/g, "/") : abs;
}

/** The absolute path of a stored one. */
export function absolutePath(root: string, stored: string): string {
  return path.isAbsolute(stored) ? stored : path.join(root, ...stored.split("/"));
}

const asKind = (v: unknown): SourceKind => ((SOURCE_KINDS as readonly string[]).includes(String(v)) ? (String(v) as SourceKind) : "podcast");

export function listSources(root: string): Source[] {
  const dir = dirOf(root);
  if (!fs.existsSync(dir)) return [];
  const out: Source[] = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith(".json") || isSyncConflict(name)) continue;
    const raw = loadJson<Record<string, unknown>>(path.join(dir, name));
    if (!raw || typeof raw !== "object" || !raw.media) continue;
    out.push({
      id: String(raw.id ?? path.parse(name).name),
      kind: asKind(raw.kind),
      title: String(raw.title ?? "").trim() || path.parse(String(raw.media)).name,
      media: String(raw.media),
      transcript: String(raw.transcript ?? ""),
      added: String(raw.added ?? ""),
    });
  }
  return out.sort((a, b) => b.added.localeCompare(a.added) || a.title.localeCompare(b.title));
}

export function getSource(root: string, id: string): Source | null {
  return listSources(root).find((s) => s.id === id) ?? null;
}

export function addSource(root: string, input: { kind: string; title: string; media: string; transcript?: string }): Source {
  const media = path.resolve(input.media);
  const source: Source = {
    id: newId("f"),
    kind: asKind(input.kind),
    title: input.title.trim().slice(0, 120) || path.parse(media).name,
    media: storedPath(root, media),
    transcript: input.transcript ? storedPath(root, input.transcript) : "",
    added: new Date().toISOString(),
  };
  fs.mkdirSync(dirOf(root), { recursive: true });
  writeJson(path.join(dirOf(root), `${source.id}.json`), source);
  return source;
}

/** Sets or replaces the transcript of a source (e.g. after the learner finds the subtitle file). */
export function setTranscript(root: string, id: string, transcript: string): Source | null {
  const found = getSource(root, id);
  if (!found) return null;
  const next = { ...found, transcript: transcript ? storedPath(root, transcript) : "" };
  writeJson(path.join(dirOf(root), `${id}.json`), next);
  return next;
}

export function removeSource(root: string, id: string): boolean {
  const file = path.join(dirOf(root), `${id}.json`);
  if (!fs.existsSync(file)) return false;
  fs.rmSync(file);
  return true;
}
