// Ported from notevault_app/config.py
//
// Manages vault paths, UI settings and recent vaults. Settings live in
// ~/.notevault/settings.json (app data, never inside a vault). Paths are
// returned as absolute strings (the TS core works with string paths).

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export const APP_DATA_DIR = path.join(os.homedir(), ".notevault");
export const SETTINGS_FILE = path.join(APP_DATA_DIR, "settings.json");
export const DEFAULT_VAULT = path.join(os.homedir(), "NoteVault");

try {
  fs.mkdirSync(APP_DATA_DIR, { recursive: true });
} catch {
  /* best effort */
}

type Settings = Record<string, any>;

function read(): Settings {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"));
    }
  } catch {
    /* fall through */
  }
  return {};
}

function write(data: Settings): void {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (e) {
    console.error(`Error saving settings: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function exists(p: string): boolean {
  return fs.existsSync(p);
}

export const AppConfig = {
  // ── Theme ────────────────────────────────────────────────────────────────
  get_theme(): string {
    return read().theme ?? "dark";
  },
  set_theme(theme: string): void {
    const s = read();
    s.theme = theme === "light" ? "light" : "dark";
    write(s);
  },

  // ── Active vault ───────────────────────────────────────────────────────────
  get_active_vault(): string {
    const p = read().active_vault;
    if (p && isDir(String(p))) return String(p);
    fs.mkdirSync(DEFAULT_VAULT, { recursive: true });
    return DEFAULT_VAULT;
  },
  set_active_vault(vaultPath: string): void {
    const s = read();
    s.active_vault = vaultPath;
    const recent: string[] = Array.isArray(s.recent_vaults) ? s.recent_vaults : [];
    const idx = recent.indexOf(vaultPath);
    if (idx !== -1) recent.splice(idx, 1);
    recent.unshift(vaultPath);
    s.recent_vaults = recent.slice(0, 10);
    write(s);
  },
  get_recent_vaults(): string[] {
    const out: string[] = [];
    for (const p of read().recent_vaults ?? []) {
      if (isDir(String(p))) out.push(String(p));
    }
    return out;
  },

  // ── Last open note ─────────────────────────────────────────────────────────
  get_last_note(vault: string): string | null {
    const vs = (read().vaults ?? {})[vault] ?? {};
    const p = vs.last_note;
    if (p && exists(String(p))) return String(p);
    return null;
  },
  set_last_note(vault: string, notePath: string): void {
    const s = read();
    const vaults = (s.vaults ??= {});
    const vs = (vaults[vault] ??= {});
    vs.last_note = notePath;
    write(s);
  },

  get_pinned_tabs(vault: string): string[] {
    const rels: string[] = (read().vaults ?? {})[vault]?.pinned_tabs ?? [];
    const out: string[] = [];
    for (const rel of rels) {
      const candidate = path.join(vault, rel);
      if (exists(candidate)) out.push(candidate);
    }
    return out;
  },
  set_pinned_tabs(vault: string, paths: string[]): void {
    const rels: string[] = [];
    for (const p of paths) {
      const rel = path.relative(vault, p);
      if (rel && !rel.startsWith("..") && !path.isAbsolute(rel)) {
        rels.push(rel.split(path.sep).join("/"));
      }
    }
    const s = read();
    const vaults = (s.vaults ??= {});
    const vs = (vaults[vault] ??= {});
    vs.pinned_tabs = rels;
    write(s);
  },

  get_assistant_visible(): boolean {
    return read().assistant_visible ?? true;
  },
  set_assistant_visible(visible: boolean): void {
    const s = read();
    s.assistant_visible = Boolean(visible);
    write(s);
  },

  // ── AI assistant ───────────────────────────────────────────────────────────
  get_ai_config(): Record<string, unknown> {
    return read().ai ?? {};
  },
  set_ai_config(cfg: Record<string, unknown>): void {
    const s = read();
    s.ai = cfg;
    write(s);
  },

  // ── Window geometry ──────────────────────────────────────────────────────
  get_window_state(): Record<string, unknown> {
    return read().window ?? {};
  },
  set_window_state(state: Record<string, unknown>): void {
    const s = read();
    s.window = state;
    write(s);
  },

  // ── Calendar filters ───────────────────────────────────────────────────────
  get_calendar_filters(): Record<string, boolean> {
    const defaults: Record<string, boolean> = {
      routine: true,
      event: true,
      habit: true,
      exercise: true,
      task: true,
      project: true,
      issue: true,
      goal_item: true,
      saving: true,
    };
    return { ...defaults, ...(read().calendar_filters ?? {}) };
  },
  set_calendar_filters(filters: Record<string, boolean>): void {
    const s = read();
    s.calendar_filters = filters;
    write(s);
  },

  // ── Templates ──────────────────────────────────────────────────────────────
  get_templates_dir(vaultRoot: string): string {
    const stored = read().templates_dir;
    if (stored && path.isAbsolute(String(stored))) return String(stored);
    return path.join(vaultRoot, "Plantillas");
  },
  set_templates_dir(p: string): void {
    const s = read();
    s.templates_dir = p;
    write(s);
  },

  // ── Daily Notes ──────────────────────────────────────────────────────────
  get_daily_notes_dir(vaultRoot: string): string {
    const stored = read().daily_notes_dir;
    if (stored && path.isAbsolute(String(stored))) return String(stored);
    return path.join(vaultRoot, "Diario");
  },
  set_daily_notes_dir(p: string): void {
    const s = read();
    s.daily_notes_dir = p;
    write(s);
  },
  get_daily_notes_template(): string | null {
    const stored = read().daily_notes_template;
    return stored ? String(stored) : null;
  },
  set_daily_notes_template(p: string | null): void {
    const s = read();
    if (p) s.daily_notes_template = p;
    else delete s.daily_notes_template;
    write(s);
  },

  // ── Hotkeys ────────────────────────────────────────────────────────────────
  get_hotkeys(): Record<string, string> {
    return read().hotkeys ?? {};
  },
  set_hotkey(commandId: string, keySequence: string): void {
    const s = read();
    const hotkeys = (s.hotkeys ??= {});
    if (keySequence) hotkeys[commandId] = keySequence;
    else delete hotkeys[commandId];
    write(s);
  },
  clear_hotkey(commandId: string): void {
    AppConfig.set_hotkey(commandId, "");
  },
};
