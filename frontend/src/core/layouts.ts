/**
 * Saved panel distributions (layouts) for NoteVault.
 * Ported from notevault_app/core/layouts.py.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { DATA_DIR } from "./vaultFormat";

export const LAYOUTS_DIR = "layouts";

export interface LayoutData {
  version: number;
  splitter_sizes: number[];
  left_visible: boolean;
  right_visible: boolean;
  open_notes: string[];
  active_note?: string | null;
}

function layoutsDir(vaultRoot: string): string {
  const d = path.join(vaultRoot, DATA_DIR, LAYOUTS_DIR);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

/** Return layout names (stems of .json files) sorted alphabetically. */
export function listLayouts(vaultRoot: string): string[] {
  const d = layoutsDir(vaultRoot);
  if (!fs.existsSync(d)) return [];
  return fs
    .readdirSync(d)
    .filter((f) => f.endsWith(".json"))
    .map((f) => path.parse(f).name)
    .sort();
}

/** Serialize data to <layouts>/<name>.json. Overwrites if exists. */
export function saveLayout(vaultRoot: string, name: string, data: LayoutData): string {
  const sanitized = (name ?? "").trim().replace(/[/\\]/g, "_");
  if (!sanitized) {
    throw new Error("Layout name cannot be empty");
  }
  const p = path.join(layoutsDir(vaultRoot), `${sanitized}.json`);
  fs.writeFileSync(p, JSON.stringify(data, null, 2), "utf-8");
  return p;
}

export function loadLayout(vaultRoot: string, name: string): LayoutData | null {
  const sanitized = (name ?? "").trim().replace(/[/\\]/g, "_");
  const p = path.join(layoutsDir(vaultRoot), `${sanitized}.json`);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8")) as LayoutData;
  } catch {
    return null;
  }
}

export function deleteLayout(vaultRoot: string, name: string): boolean {
  const sanitized = (name ?? "").trim().replace(/[/\\]/g, "_");
  const p = path.join(layoutsDir(vaultRoot), `${sanitized}.json`);
  if (fs.existsSync(p)) {
    fs.rmSync(p, { force: true });
    return true;
  }
  return false;
}

export function captureLayout(
  splitterSizes: number[],
  leftVisible: boolean,
  rightVisible: boolean,
  openNotes: string[],
  activeNote?: string | null,
): LayoutData {
  return {
    version: 1,
    splitter_sizes: splitterSizes,
    left_visible: leftVisible,
    right_visible: rightVisible,
    open_notes: openNotes,
    active_note: activeNote ?? null,
  };
}
