// Una generación de tema a la vez (por proceso): «Ejecutar plan» y «Regenerar» comparten este turno para no escribir en la misma carpeta a la vez.

let generationLock: Promise<void> = Promise.resolve();
/** Turnos pedidos y aún sin terminar (el que corre + los que esperan): lo que el chat consulta para no competir. */
let pending = 0;

/** ¿Hay una generación (Ejecutar plan, Regenerar…) en curso o en cola? */
export const generationBusy = (): boolean => pending > 0;

export async function withGenerationLock<T>(fn: () => Promise<T>): Promise<T> {
  pending += 1;
  const turn = generationLock.then(() => undefined);
  let release!: () => void;
  generationLock = new Promise<void>((ok) => (release = ok));
  await turn;
  try {
    return await fn();
  } finally {
    pending -= 1;
    release();
  }
}
