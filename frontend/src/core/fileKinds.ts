/**
 * What the notes explorer shows, and how each kind of file is labelled.
 * Ported from notevault_app/core/file_kinds.py.
 */

import * as path from "node:path";

export const NOTE_EXTS = new Set([".md"]);

export const CANVAS_EXTS = new Set([".canvas"]);

/** extension -> [badge text, badge colour] */
export const CODE_EXTS: Record<string, [string, string]> = {
  ".py": ["PY", "#3776ab"],
  ".pyw": ["PY", "#3776ab"],
  ".js": ["JS", "#d4b106"],
  ".mjs": ["JS", "#d4b106"],
  ".cjs": ["JS", "#d4b106"],
  ".jsx": ["JSX", "#1f9fc2"],
  ".ts": ["TS", "#3178c6"],
  ".tsx": ["TSX", "#3178c6"],
  ".java": ["JV", "#b07219"],
  ".kt": ["KT", "#a97bff"],
  ".kts": ["KT", "#a97bff"],
  ".go": ["GO", "#00add8"],
  ".rs": ["RS", "#b7410e"],
  ".c": ["C", "#5c6bc0"],
  ".h": ["H", "#5c6bc0"],
  ".cpp": ["C++", "#f34b7d"],
  ".cc": ["C++", "#f34b7d"],
  ".hpp": ["H++", "#f34b7d"],
  ".cs": ["C#", "#178600"],
  ".rb": ["RB", "#cc342d"],
  ".php": ["PHP", "#777bb4"],
  ".swift": ["SW", "#f05138"],
  ".dart": ["DT", "#00b4ab"],
  ".lua": ["LUA", "#000080"],
  ".r": ["R", "#198ce7"],
  ".scala": ["SC", "#c22d40"],
  ".pl": ["PL", "#0298c3"],
  ".sh": ["SH", "#4eaa25"],
  ".bash": ["SH", "#4eaa25"],
  ".zsh": ["SH", "#4eaa25"],
  ".ps1": ["PS", "#2671be"],
  ".bat": ["BAT", "#6b6b74"],
  ".cmd": ["CMD", "#6b6b74"],
  ".sql": ["SQL", "#e38c00"],
  ".vb": ["VB", "#945db7"],
};

export type FileKind = "note" | "canvas" | "code" | "";

/** 'note', 'code', 'canvas' or '' for files the explorer does not list. */
export function kindFor(filePath: string): FileKind {
  const ext = path.extname(String(filePath)).toLowerCase();
  if (NOTE_EXTS.has(ext)) return "note";
  if (CANVAS_EXTS.has(ext)) return "canvas";
  if (ext in CODE_EXTS) return "code";
  return "";
}

/** Returns [badgeText, badgeColour] for a file path. */
export function badgeFor(filePath: string): [string, string] {
  const ext = path.extname(String(filePath)).toLowerCase();
  return CODE_EXTS[ext] ?? ["TXT", "#6b6b74"];
}
