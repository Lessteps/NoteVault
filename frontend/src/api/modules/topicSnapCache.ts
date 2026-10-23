// Mentor — caché de la «foto de los temas» (`topicSnaps`): reconstruirla lee TODOS los intentos y los exámenes de la vault, y el Mentor la pide en
// cada `mentor_plan_get` / `mentor_plan_list` (cada vez que se cambia de vista). Se reutiliza SOLO si nada de lo que la alimenta cambió:
//   · el escaneo de la vault (notas, manifiestos, ejercicios) es el mismo objeto — `vaultScan` lo renueva al caducar y se vacía en cada escritura de
//     estudio / ejecución del plan (`clearVaultScanCache`);
//   · la firma de las carpetas de intentos y de exámenes (nombre + fecha de modificación + tamaño de cada .json, sin leerlos) no cambió;
//   · no pasó el TTL de seguridad (por si un cambio no deja rastro en esas firmas).
// Nunca devuelve datos viejos tras una escritura: cualquiera de las tres condiciones que falle recalcula.

import fs from "node:fs";
import path from "node:path";
import { examDir } from "../../core/practice/exams.js";
import { LAYOUT } from "../../core/vaultFormat.js";

/** Vida máxima de una foto aunque las firmas no cambien (red de seguridad). */
export const TOPIC_SNAP_TTL_MS = 5_000;

/** Firma barata de una carpeta: nombre, fecha de modificación y tamaño de cada .json (no los lee). */
export function dirStamp(dir: string): string {
  let names: string[];
  try {
    names = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  } catch {
    return "-";
  }
  const parts: string[] = [];
  for (const f of names) {
    try {
      const st = fs.statSync(path.join(dir, f));
      parts.push(`${f}:${st.mtimeMs}:${st.size}`);
    } catch {
      parts.push(`${f}:?`);
    }
  }
  return parts.join("|");
}

/** Firma de lo que alimenta la foto de los temas fuera del escaneo: los intentos y los exámenes de la vault. */
export function topicSnapStamp(root: string): string {
  return `${dirStamp(path.join(path.resolve(root), LAYOUT.study_attempts_dir))}#${dirStamp(examDir(root))}`;
}

interface Entry<T> {
  scan: object;
  stamp: string;
  at: number;
  value: T;
}

const CACHE = new Map<string, Entry<unknown>>();

/**
 * La foto de la vault `root`: la guardada si `scan` (el escaneo de la vault vigente) y la firma siguen iguales y no caducó; si no, `compute()`.
 * `now` solo existe para las pruebas.
 */
export function cachedTopicSnaps<T>(root: string, scan: object, compute: () => T, now: () => number = Date.now): T {
  const stamp = topicSnapStamp(root);
  const hit = CACHE.get(root) as Entry<T> | undefined;
  const t = now();
  if (hit && hit.scan === scan && hit.stamp === stamp && t - hit.at < TOPIC_SNAP_TTL_MS) return hit.value;
  const value = compute();
  CACHE.set(root, { scan, stamp, at: t, value });
  return value;
}

/** Olvida la foto de una vault (o de todas): para las rutas de escritura que conviene invalidar al instante. */
export function clearTopicSnapCache(root?: string): void {
  if (root) CACHE.delete(root);
  else CACHE.clear();
}
