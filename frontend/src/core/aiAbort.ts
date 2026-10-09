/**
 * Señal de cancelación AMBIENTAL para las llamadas a la IA: una tarea larga (p. ej. «Ejecutar plan») corre sus funciones de generación dentro de
 * `withAiSignal(signal, …)` y todas las llamadas a la IA que hagan por debajo (`askStructured` → `sendChat`) usan esa señal, de modo que cancelar
 * MATA la petición o el proceso de Claude Code sin tener que cambiar la firma de cada función. Sin señal ambiente no cambia nada.
 */

import { AsyncLocalStorage } from "node:async_hooks";

const store = new AsyncLocalStorage<{ signal: AbortSignal }>();

/** Ejecuta `fn` con `signal` como señal ambiental de las llamadas a la IA (se propaga por sus promesas). */
export function withAiSignal<T>(signal: AbortSignal, fn: () => T): T {
  return store.run({ signal }, fn);
}

/** La señal ambiental, si hay una. */
export const currentAiSignal = (): AbortSignal | undefined => store.getStore()?.signal;
