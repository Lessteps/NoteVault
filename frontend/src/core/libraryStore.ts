// La biblioteca propia: los ejercicios que la persona escribe, sobre el catálogo
// de 302 que trae el paquete.
//
// Aquí solo se guarda y se lee. No sabe nada del catálogo ni de cómo se mezclan
// las dos mitades: de eso se encarga `lib/exerciseLibrary.ts`. Separarlo así
// permite probar el fichero corrupto, el slug repetido y la normalización sin
// levantar 302 ejercicios.
//
// Un fichero ilegible **no rompe nada**: es personalización, no datos de
// entrenamiento. Se trata como una biblioteca vacía.

import * as fs from "node:fs";
import * as path from "node:path";
import { LAYOUT } from "./vaultFormat";
// El tipo vive en lib/types y no aquí: `lib/` es el renderer, y este fichero es
// el proceso de Electron. Si el tipo estuviera aquí, `lib/exerciseLibrary.ts`
// acabaría importando `node:fs` para el navegador.
import type { LibraryUserEntry } from "../lib/libraryTypes.js";

export type { LibraryUserEntry };

function asString(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function asIdList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/**
 * Lee una entrada defendiendo cada campo. El fichero puede venir escrito a mano
 * o de una versión anterior del programa, así que nada de lo que llega se
 * asume: lo que no tiene la forma esperada se convierte en su valor vacío.
 */
function normalizeEntry(raw: unknown): LibraryUserEntry {
  const e = (raw ?? {}) as Record<string, unknown>;
  const muscles = (e.muscles ?? {}) as Record<string, unknown>;
  return {
    slug: asString(e.slug).trim(),
    name: asString(e.name),
    equipment: asString(e.equipment),
    muscles: { primary: asIdList(muscles.primary), secondary: asIdList(muscles.secondary) },
    how_to: asString(e.how_to),
  };
}

export class LibraryStore {
  private _configPath: string;
  private _entries: LibraryUserEntry[] | null = null;

  constructor(vaultRoot: string) {
    this._configPath = path.join(path.resolve(vaultRoot), LAYOUT.library);
  }

  /**
   * Las entradas propias, leídas del disco la primera vez. Si el slug está
   * repetido, **gana la última**: un fichero editado a mano puede llevar dos
   * veces la misma entrada y la segunda es la corrección.
   */
  entries(): LibraryUserEntry[] {
    if (this._entries === null) {
      this._entries = this._load();
    }
    return this._entries;
  }

  save(entries: LibraryUserEntry[]): void {
    this._entries = entries;
    fs.mkdirSync(path.dirname(this._configPath), { recursive: true });
    fs.writeFileSync(
      this._configPath,
      JSON.stringify({ entries: entries ?? [] }, null, 2),
      "utf-8",
    );
  }

  private _load(): LibraryUserEntry[] {
    if (!fs.existsSync(this._configPath)) return [];
    let parsed: unknown;
    try {
      parsed = JSON.parse(fs.readFileSync(this._configPath, "utf-8"));
    } catch {
      return [];
    }
    const raw = (Array.isArray(parsed) ? parsed : (parsed as Record<string, unknown>)?.entries);
    if (!Array.isArray(raw)) return [];
    const bySlug = new Map<string, LibraryUserEntry>();
    for (const item of raw) {
      const entry = normalizeEntry(item);
      // Sin slug no se puede editar ni borrar más tarde, así que no entra.
      if (entry.slug) bySlug.set(entry.slug, entry);
    }
    return [...bySlug.values()];
  }
}
