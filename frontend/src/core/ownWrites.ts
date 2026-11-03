// Las escrituras que HACE LA PROPIA APP (el autoguardado de una nota que se está editando) vuelven como eventos del vigilante de archivos. Tratarlas como
// «cambios de fuera» (invalidar los índices y mandar a la interfaz a releer planes, temas y estadísticas) congelaba el proceso principal 2–3 s tras cada
// autoguardado en una vault grande: justo lo que se notaba como «lagazos» al escribir. Aquí se anotan las escrituras propias para reconocer su eco.

import * as path from "node:path";

/** Cuánto tarda en llegar, como mucho, el eco de una escritura (el vigilante agrupa eventos). */
export const OWN_WRITE_ECHO_MS = 3000;

const recent = new Map<string, number>();

const key = (p: string): string => path.resolve(p);

/** Anota que la app acaba de escribir este archivo (que ya existía: editar una nota no cambia la estructura de la vault). */
export function markOwnWrite(fullPath: string, now: number = Date.now()): void {
  recent.set(key(fullPath), now);
  if (recent.size > 500) for (const [k, at] of recent) if (now - at > OWN_WRITE_ECHO_MS) recent.delete(k);
}

/** ¿Este evento del vigilante es el eco de una escritura propia reciente? Se puede preguntar varias veces (un guardado da más de un evento). */
export function isOwnWriteEcho(fullPath: string, now: number = Date.now()): boolean {
  const at = recent.get(key(fullPath));
  return at !== undefined && now - at < OWN_WRITE_ECHO_MS;
}

export function clearOwnWrites(): void {
  recent.clear();
}
