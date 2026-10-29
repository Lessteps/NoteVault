// Cambios en la vault hechos FUERA de la app (un agente como Antigravity, git, otro editor): se agrupan en ráfagas y, al calmarse (o como mucho cada `maxMs`
// mientras siguen llegando), se avisa UNA vez. Así los temas nuevos aparecen solos, sin reindexar ni recargar pestañas, y escribir 140 notas seguidas
// no provoca 140 relecturas. Puro: el temporizador es inyectable para las pruebas.

export interface VaultChangeOpts {
  quietMs?: number;
  maxMs?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (t: unknown) => void;
  now?: () => number;
}

/** Devuelve la función que se llama por cada evento del vigilante; `flush` recibe las rutas distintas de la ráfaga. */
export function createVaultChangeNotifier(flush: (rels: string[]) => void, o: VaultChangeOpts = {}): (relPath: string) => void {
  const quietMs = o.quietMs ?? 800;
  const maxMs = o.maxMs ?? 4000;
  const set = o.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clear = o.clearTimer ?? ((t) => clearTimeout(t as ReturnType<typeof setTimeout>));
  const now = o.now ?? Date.now;
  const pending = new Set<string>();
  let timer: unknown = null;
  let first = 0;
  const fire = (): void => {
    if (timer !== null) clear(timer);
    timer = null;
    first = 0;
    const rels = [...pending];
    pending.clear();
    if (rels.length) flush(rels);
  };
  return (relPath: string): void => {
    pending.add(relPath);
    const t = now();
    if (!first) first = t;
    if (timer !== null) clear(timer);
    timer = set(fire, Math.max(0, Math.min(quietMs, first + maxMs - t)));
  };
}
