// Ported from notevault_app/config.py
//
// Manages vault paths, UI settings and recent vaults. Settings live in
// ~/.notevault/settings.json (app data, never inside a vault). Paths are
// returned as absolute strings (the TS core works with string paths).

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// NV_E2E_HOME redirige el home solo en tests E2E Playwright (aisla
// ~/.notevault y ~/NoteVault sin tocar USERPROFILE/APPDATA, que
// Playwright/Chromium necesitan intactos).
const HOMEDIR = process.env.NV_E2E_HOME || os.homedir();
export const APP_DATA_DIR = path.join(HOMEDIR, ".notevault");
export const SETTINGS_FILE = path.join(APP_DATA_DIR, "settings.json");
export const DEFAULT_VAULT = path.join(HOMEDIR, "NoteVault");

export type RenderingMode = "auto" | "hardware" | "software";
export type AngleBackend = "default" | "d3d11" | "d3d11on12" | "gl" | "d3d9" | "vulkan";

export interface Rendering {
  mode: RenderingMode;
  angle: AngleBackend;
  liteEffects: boolean;
  reduceMotion: boolean;
}

export const DEFAULT_RENDERING: Rendering = {
  mode: "auto",
  angle: "default",
  liteEffects: false,
  reduceMotion: false,
};

try {
  fs.mkdirSync(APP_DATA_DIR, { recursive: true });
} catch {
  /* best effort */
}

let customSettingsFile: string | null = null;
export function _setSettingsFileForTest(p: string | null): void {
  customSettingsFile = p;
}

function getSettingsPath(): string {
  return customSettingsFile ?? SETTINGS_FILE;
}

type Settings = Record<string, any>;

function read(): Settings {
  try {
    const target = getSettingsPath();
    if (fs.existsSync(target)) {
      return JSON.parse(fs.readFileSync(target, "utf-8"));
    }
  } catch {
    /* fall through */
  }
  return {};
}

function write(data: Settings): void {
  try {
    const target = getSettingsPath();
    fs.writeFileSync(target, JSON.stringify(data, null, 2), "utf-8");
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

  // ── Rendering & Performance ────────────────────────────────────────────────
  get_rendering(): Rendering {
    const raw = read().rendering ?? {};
    return {
      mode: ["auto", "hardware", "software"].includes(raw.mode) ? raw.mode : DEFAULT_RENDERING.mode,
      angle: ["default", "d3d11", "d3d11on12", "gl", "d3d9", "vulkan"].includes(raw.angle)
        ? raw.angle
        : DEFAULT_RENDERING.angle,
      liteEffects: typeof raw.liteEffects === "boolean" ? raw.liteEffects : DEFAULT_RENDERING.liteEffects,
      reduceMotion: typeof raw.reduceMotion === "boolean" ? raw.reduceMotion : DEFAULT_RENDERING.reduceMotion,
    };
  },
  set_rendering(patch: Partial<Rendering>): Rendering {
    const s = read();
    const current = AppConfig.get_rendering();
    const next: Rendering = {
      mode:
        patch.mode !== undefined && ["auto", "hardware", "software"].includes(patch.mode)
          ? patch.mode
          : current.mode,
      angle:
        patch.angle !== undefined && ["default", "d3d11", "d3d11on12", "gl", "d3d9", "vulkan"].includes(patch.angle)
          ? patch.angle
          : current.angle,
      liteEffects: patch.liteEffects !== undefined ? Boolean(patch.liteEffects) : current.liteEffects,
      reduceMotion: patch.reduceMotion !== undefined ? Boolean(patch.reduceMotion) : current.reduceMotion,
    };
    s.rendering = next;
    write(s);
    return next;
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

  /** Chat history lives beside the settings, never inside a vault: the vault is
   * synced between devices and a tutoring conversation is private to this one. */
  get_conversations_dir(): string {
    return path.join(APP_DATA_DIR, "conversations");
  },

  /** Conversaciones del Coach de Ejercicio, totalmente aisladas de las de Notas. */
  get_exercise_coach_conversations_dir(): string {
    return path.join(APP_DATA_DIR, "exercise_coach_conversations");
  },

  /** Conversaciones del Coach de Finanzas, totalmente aisladas de Notas, Mentor y Ejercicio. */
  get_finance_coach_conversations_dir(): string {
    return path.join(APP_DATA_DIR, "finance_coach_conversations");
  },

  /** Conversaciones del Asesor Nutricional, totalmente aisladas de Notas, Mentor, Ejercicio y Finanzas. */
  get_nutrition_coach_conversations_dir(): string {
    return path.join(APP_DATA_DIR, "nutrition_coach_conversations");
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
