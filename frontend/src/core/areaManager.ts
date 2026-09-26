/**
 * Áreas de vida shared by Metas, Proyectos and Hábitos.
 * Ported from notevault_app/core/area_manager.py.
 *
 *     .notevault/areas/<area-id>.json
 *     {"id": "programacion", "name": "Programación", "icon": "💻",
 *      "colour": "#3f51b5", "order": 2, "archived": false}
 *
 * One file per area, so creating an area on the phone and another on the
 * desktop never collide. Deleting an area only archives it: goals, projects
 * and habits that point to it keep their `area` and show as "Sin área" while
 * it is archived.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { loadJson, slug, writeJson } from "./store";
import { AREA_KEYS, isSyncConflict, LAYOUT } from "./vaultFormat";

export const NO_AREA = "";

export const SUGGESTED_AREAS: readonly [string, string, string][] = [
  ["Programación", "💻", "#3f51b5"],
  ["Estudio", "📚", "#8e24aa"],
  ["Salud", "💪", "#33b679"],
  ["Finanzas", "💰", "#f6bf26"],
  ["Personal", "🌱", "#e67c73"],
];

export interface Area {
  id: string;
  name: string;
  icon: string;
  colour: string;
  order: number;
  archived: boolean;
}

export function sanitizeArea(raw: unknown, fallbackId = ""): Area {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const order = r.order;
  return {
    id: String(r.id || fallbackId),
    name: String(r.name || "Área"),
    icon: String(r.icon || ""),
    colour: String(r.colour || "#7986cb"),
    order: typeof order === "number" && !Number.isNaN(order) ? order : 0,
    archived: Boolean(r.archived),
  };
}

export class AreaManager {
  vaultRoot: string;
  dir: string;
  private _cache: Area[] | null = null;
  private _stamp: string | null = null;

  constructor(vaultRoot: string) {
    this.vaultRoot = path.resolve(vaultRoot);
    this.dir = path.join(this.vaultRoot, LAYOUT.areas_dir);
  }

  private _path(areaId: string): string {
    return path.join(this.vaultRoot, LAYOUT.area.replace("{id}", areaId));
  }

  private _dirStamp(): [string, number][] {
    try {
      if (!fs.existsSync(this.dir)) return [];
      const files = fs.readdirSync(this.dir).filter((f) => f.endsWith(".json")).sort();
      return files.map((f) => {
        const stat = fs.statSync(path.join(this.dir, f));
        return [f, stat.mtimeMs];
      });
    } catch {
      return [];
    }
  }

  areas(includeArchived = false): Area[] {
    const stamp = this._dirStamp();
    const stampKey = stamp.map(([name, mtime]) => `${name}:${mtime}`).join(";");
    if (this._cache === null || stampKey !== this._stamp) {
      const out: Area[] = [];
      for (const [name] of stamp) {
        const p = path.join(this.dir, name);
        if (isSyncConflict(name)) continue;
        const data = loadJson<Record<string, unknown>>(p);
        if (data && typeof data === "object") {
          out.push(sanitizeArea(data, path.parse(name).name));
        }
      }
      out.sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order;
        return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      });
      this._cache = out;
      this._stamp = stampKey;
    }
    return this._cache
      .filter((a) => includeArchived || !a.archived)
      .map((a) => ({ ...a }));
  }

  get(areaId: string): Area | null {
    return this.areas(true).find((a) => a.id === areaId) ?? null;
  }

  nameOf(areaId: string): string {
    const area = areaId ? this.get(areaId) : null;
    return area && !area.archived ? area.name : "Sin área";
  }

  name_of(areaId: string): string {
    return this.nameOf(areaId);
  }

  private _save(area: Area): void {
    writeJson(this._path(area.id), sanitizeArea(area));
    this._cache = null;
  }

  create(name: string, icon = "", colour = "#7986cb"): Area {
    const existing = new Set(this.areas(true).map((a) => a.id));
    const base = slug(name);
    let areaId = base;
    let n = 2;
    while (existing.has(areaId)) {
      areaId = `${base}-${n}`;
      n += 1;
    }
    const current = this.areas(true);
    const maxOrder = current.length > 0 ? Math.max(...current.map((a) => a.order)) : 0;
    const order = maxOrder + 1;
    const area = sanitizeArea({
      id: areaId,
      name: name.trim() || "Área",
      icon,
      colour,
      order,
    });
    this._save(area);
    return area;
  }

  update(areaId: string, fields: Partial<Area>): Area | null {
    const area = this.get(areaId);
    if (!area) return null;
    for (const [k, v] of Object.entries(fields)) {
      if ((AREA_KEYS as readonly string[]).includes(k) && k !== "id") {
        (area as any)[k] = v;
      }
    }
    this._save(area);
    return area;
  }

  archive(areaId: string, archived = true): Area | null {
    return this.update(areaId, { archived });
  }

  reorder(ids: string[]): void {
    for (let i = 0; i < ids.length; i++) {
      const area = this.get(ids[i]!);
      if (area && area.order !== i) {
        area.order = i;
        this._save(area);
      }
    }
  }

  createSuggested(): void {
    const have = new Set(this.areas(true).map((a) => a.name.toLowerCase()));
    for (const [name, icon, colour] of SUGGESTED_AREAS) {
      if (!have.has(name.toLowerCase())) {
        this.create(name, icon, colour);
      }
    }
  }

  create_suggested(): void {
    this.createSuggested();
  }
}
