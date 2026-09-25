/**
 * NoteVault Workspace Manager
 * Manages specialized learning workspace profiles (Mathematics, Programming, English, General).
 * Stores each profile in .notevault/workspaces/<workspace-id>.json.
 * Ported from notevault_app/core/workspace_manager.py.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { loadJson, writeJson } from "./store";
import { isSyncConflict, LAYOUT } from "./vaultFormat";

export const DETECT_MAX_DEPTH = 2;

export function _norm(text: unknown): string {
  return String(text ?? "")
    .normalize("NFC")
    .trim()
    .toLowerCase();
}

export interface WorkspaceFeatures {
  calculator?: boolean;
  graphing?: boolean;
  latex?: boolean;
  flashcards?: boolean;
  exercise_generation?: boolean;
  spaced_repetition?: boolean;
  code_execution?: boolean;
  debugging?: boolean;
  testing?: boolean;
  projects?: boolean;
  vocabulary?: boolean;
  grammar?: boolean;
  listening?: boolean;
  reading?: boolean;
  speaking?: boolean;
  writing?: boolean;
  [key: string]: boolean | undefined;
}

export interface Workspace {
  id: string;
  name: string;
  icon: string;
  folders: string[];
  starter_folders: string[];
  features: WorkspaceFeatures;
  system_prompt: string;
  [key: string]: unknown;
}

export const DEFAULT_WORKSPACES: readonly Workspace[] = [
  {
    id: "mathematics",
    name: "Matemáticas",
    icon: "📐",
    folders: ["Matemáticas", "Matematicas", "Math", "Mathematics"],
    starter_folders: ["Álgebra", "Cálculo", "Estadística", "Fórmulas"],
    features: {
      calculator: true,
      graphing: true,
      latex: true,
      flashcards: true,
      exercise_generation: true,
      spaced_repetition: true,
      code_execution: false,
      debugging: false,
      testing: false,
      vocabulary: false,
      grammar: false,
      listening: false,
      reading: false,
      speaking: false,
      writing: false,
    },
    system_prompt:
      "Actúa como un profesor experto y generador de ejercicios de matemáticas. " +
      "Prioriza el razonamiento paso a paso, la descomposición de fórmulas y la dificultad progresiva.",
  },
  {
    id: "programming",
    name: "Programación",
    icon: "💻",
    folders: ["Programación", "Programacion", "Programming", "Coding", "Code"],
    starter_folders: ["Fundamentos", "Algoritmos", "Proyectos", "Snippets"],
    features: {
      calculator: false,
      graphing: false,
      latex: false,
      flashcards: true,
      exercise_generation: true,
      spaced_repetition: true,
      code_execution: true,
      debugging: true,
      testing: true,
      projects: true,
      vocabulary: false,
      grammar: false,
      listening: false,
      reading: false,
      speaking: false,
      writing: false,
    },
    system_prompt:
      "Actúa como un mentor senior y generador de ejercicios de programación. " +
      "Prioriza el razonamiento transferible, la descomposición de problemas, algoritmos limpios y testing.",
  },
  {
    id: "english",
    name: "Inglés",
    icon: "🌐",
    folders: ["Inglés", "Ingles", "English", "Idiomas", "Languages"],
    starter_folders: ["Vocabulario", "Gramática", "Lecturas", "Writing"],
    features: {
      calculator: false,
      graphing: false,
      latex: false,
      flashcards: true,
      exercise_generation: true,
      spaced_repetition: true,
      code_execution: false,
      debugging: false,
      testing: false,
      vocabulary: true,
      grammar: true,
      listening: true,
      reading: true,
      speaking: true,
      writing: true,
    },
    system_prompt:
      "Act as an immersive English language tutor and exercise generator. " +
      "Prioritize contextual vocabulary retrieval, natural expressions, grammar accuracy, and active communication.",
  },
  {
    id: "general",
    name: "General",
    icon: "📝",
    folders: [],
    starter_folders: [],
    features: {
      calculator: false,
      graphing: false,
      latex: true,
      flashcards: true,
      exercise_generation: true,
      spaced_repetition: true,
      code_execution: false,
      debugging: false,
      testing: false,
      vocabulary: false,
      grammar: false,
      listening: false,
      reading: false,
      speaking: false,
      writing: false,
    },
    system_prompt:
      "Actúa como un tutor de estudio activo. Prioriza la comprensión conceptual, " +
      "la recuperación activa (active recall) y la síntesis clara.",
  },
];

export function sanitizeWorkspace(raw: Record<string, any>, fallbackId = ""): Workspace {
  const r = raw && typeof raw === "object" ? raw : {};
  const wsId = String(r.id || fallbackId || "general")
    .trim()
    .toLowerCase();
  const rawFeatures = r.features && typeof r.features === "object" ? r.features : {};

  let folders = r.folders;
  if (typeof folders === "string") {
    folders = [folders];
  } else if (!Array.isArray(folders)) {
    folders = [];
  }

  let starter = r.starter_folders;
  if (typeof starter === "string") {
    starter = [starter];
  } else if (!Array.isArray(starter)) {
    starter = [];
  }

  const features: WorkspaceFeatures = {};
  for (const [k, v] of Object.entries(rawFeatures)) {
    features[k] = Boolean(v);
  }

  return {
    id: wsId,
    name: String(r.name || wsId.charAt(0).toUpperCase() + wsId.slice(1)),
    icon: String(r.icon || "📁"),
    folders: folders.map(String),
    starter_folders: starter.map(String),
    features,
    system_prompt: String(r.system_prompt || ""),
  };
}
export const sanitize_workspace = sanitizeWorkspace;

export interface EnsureFolderResult {
  path: string;
  created: boolean;
  index: string | null;
  subfolders: string[];
}

export class WorkspaceManager {
  vaultRoot: string;
  dir: string;
  private _cache: Workspace[] | null = null;
  private _stamp: string | null = null;

  constructor(vaultRoot: string) {
    this.vaultRoot = path.resolve(vaultRoot);
    this.dir = path.join(this.vaultRoot, LAYOUT.workspaces_dir);
    this._ensureDefaults();
  }

  _path(wsId: string): string {
    return path.join(this.vaultRoot, LAYOUT.workspace.replace("{id}", wsId));
  }

  private _ensureDefaults(): void {
    fs.mkdirSync(this.dir, { recursive: true });
    for (const def of DEFAULT_WORKSPACES) {
      const p = this._path(def.id);
      if (!fs.existsSync(p)) {
        writeJson(p, sanitizeWorkspace(def));
      }
    }
  }

  private _dirStamp(): [string, number][] {
    try {
      if (!fs.existsSync(this.dir)) return [];
      const files = fs.readdirSync(this.dir).filter((f) => f.endsWith(".json")).sort();
      return files.map((f) => {
        const st = fs.statSync(path.join(this.dir, f));
        return [f, st.mtimeMs];
      });
    } catch {
      return [];
    }
  }

  workspaces(): Workspace[] {
    const stamp = this._dirStamp();
    const stampKey = stamp.map(([name, mtime]) => `${name}:${mtime}`).join(";");
    if (this._cache === null || stampKey !== this._stamp) {
      const out: Workspace[] = [];
      for (const [name] of stamp) {
        const p = path.join(this.dir, name);
        if (isSyncConflict(name)) continue;
        const data = loadJson<Record<string, any>>(p);
        if (data && typeof data === "object") {
          out.push(sanitizeWorkspace(data, path.parse(name).name));
        }
      }
      out.sort((a, b) => {
        const genA = a.id === "general" ? 1 : 0;
        const genB = b.id === "general" ? 1 : 0;
        if (genA !== genB) return genA - genB;
        return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      });
      this._cache = out;
      this._stamp = stampKey;
    }
    return this._cache.map((w) => ({
      ...w,
      folders: [...w.folders],
      starter_folders: [...w.starter_folders],
      features: { ...w.features },
    }));
  }

  get(wsId: string): Workspace | null {
    const id = wsId.trim().toLowerCase();
    return this.workspaces().find((w) => w.id === id) ?? null;
  }

  save(workspaceData: Record<string, any>): Workspace {
    const clean = sanitizeWorkspace(workspaceData);
    writeJson(this._path(clean.id), clean);
    this._cache = null;
    return clean;
  }

  folderName(wsId: string): string {
    const ws = this.get(wsId);
    if (ws && ws.folders && ws.folders.length > 0) {
      return ws.folders[0]!;
    }
    return (ws?.name || wsId.charAt(0).toUpperCase() + wsId.slice(1));
  }
  folder_name(wsId: string): string {
    return this.folderName(wsId);
  }

  findExistingFolder(wsId: string): string | null {
    const ws = this.get(wsId);
    if (!ws) return null;
    const variants = new Set(ws.folders.map(_norm));
    variants.add(_norm(ws.name));

    try {
      if (!fs.existsSync(this.vaultRoot)) return null;
      const entries = fs.readdirSync(this.vaultRoot);
      for (const entry of entries) {
        const full = path.join(this.vaultRoot, entry);
        try {
          if (fs.statSync(full).isDirectory() && variants.has(_norm(entry))) {
            return full;
          }
        } catch {
          continue;
        }
      }
    } catch {
      return null;
    }
    return null;
  }
  find_existing_folder(wsId: string): string | null {
    return this.findExistingFolder(wsId);
  }

  ensureFolder(wsId: string, withStructure = true): EnsureFolderResult {
    const ws = this.get(wsId);
    if (!ws) {
      throw new Error(`workspace desconocido: ${wsId}`);
    }

    const existing = this.findExistingFolder(wsId);
    const created = existing === null;
    const folder = existing || path.join(this.vaultRoot, this.folderName(wsId));
    fs.mkdirSync(folder, { recursive: true });

    const subfolders: string[] = [];
    if (withStructure) {
      for (const sub of ws.starter_folders || []) {
        const sp = path.join(folder, sub);
        if (!fs.existsSync(sp)) {
          fs.mkdirSync(sp, { recursive: true });
        }
        subfolders.push(sp);
      }
    }

    const indexPath = path.join(folder, "00 Índice.md");
    let indexWritten: string | null = indexPath;
    if (!fs.existsSync(indexPath)) {
      const body =
        `---\n` +
        `title: Índice de ${ws.name}\n` +
        `subject: ${ws.id}\n` +
        `topic: ${ws.name}\n` +
        `type: index\n` +
        `difficulty: 1\n` +
        `mastery: 0.0\n` +
        `tags: [estudio, ${ws.id}]\n` +
        `---\n\n` +
        `# ${ws.icon || ""} ${ws.name}\n\n` +
        `Espacio de estudio de ${ws.name}. ` +
        `Crea aquí tus notas; las herramientas de ${ws.name} se activan solas.\n`;
      try {
        fs.writeFileSync(indexPath, body, "utf-8");
      } catch {
        indexWritten = null;
      }
    }

    return {
      path: folder,
      created,
      index: indexWritten,
      subfolders,
    };
  }
  ensure_folder(wsId: string, withStructure = true): EnsureFolderResult {
    return this.ensureFolder(wsId, withStructure);
  }

  detectForPath(relPath: string, frontmatter?: Record<string, any> | null): Workspace {
    const allWs = this.workspaces();
    const general =
      this.get("general") || sanitizeWorkspace(DEFAULT_WORKSPACES[DEFAULT_WORKSPACES.length - 1]!);

    if (frontmatter && typeof frontmatter === "object") {
      const explicit = _norm(frontmatter.workspace || frontmatter.subject || "");
      if (explicit) {
        for (const ws of allWs) {
          if (_norm(ws.id) === explicit || _norm(ws.name) === explicit) {
            return ws;
          }
        }
      }
    }

    const cleanParts = relPath.replace(/\\/g, "/").split("/").filter(Boolean);
    const dirParts = cleanParts.slice(0, -1).map(_norm).slice(0, DETECT_MAX_DEPTH);

    for (const ws of allWs) {
      if (ws.id === "general") continue;
      const candidates = new Set(ws.folders.map(_norm));
      candidates.add(_norm(ws.id));
      candidates.add(_norm(ws.name));
      if (dirParts.some((part) => candidates.has(part))) {
        return ws;
      }
    }

    return general;
  }
  detect_for_path(relPath: string, frontmatter?: Record<string, any> | null): Workspace {
    return this.detectForPath(relPath, frontmatter);
  }
}
