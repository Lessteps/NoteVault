// Una generación de tema a la vez (por proceso): «Ejecutar plan» y «Regenerar» comparten este turno para no escribir en la misma carpeta a la vez.

let generationLock: Promise<void> = Promise.resolve();

export async function withGenerationLock<T>(fn: () => Promise<T>): Promise<T> {
  const turn = generationLock.then(() => undefined);
  let release!: () => void;
  generationLock = new Promise<void>((ok) => (release = ok));
  await turn;
  try {
    return await fn();
  } finally {
    release();
  }
}
