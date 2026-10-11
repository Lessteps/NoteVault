// Ruta sólida: los temas del plan no avanzan hasta que se terminan TODOS los temas del día pendiente más antiguo.
//
// La agenda reparte los temas por días. El «frente» es el primer día (en orden) que aún tiene algún tema sin completar. Todo lo que está
// repartido hasta ese día (incluido) está disponible; lo repartido en días posteriores queda BLOQUEADO hasta que se cierre el frente.
// Un tema ya completado nunca se bloquea y un tema que no está en la agenda (fuera de ruta) no se toca.

export interface GateDay {
  date: string;
  topics: ReadonlyArray<{ folder: string; done: boolean }>;
}

export interface PlanGate {
  /** primer día con temas sin completar (null = no queda nada pendiente) */
  frontier: string | null;
  /** carpetas pendientes del día del frente: lo que hay que terminar para avanzar */
  blockers: string[];
  /** carpeta del tema bloqueado → fecha del día que hay que terminar antes */
  locked: Map<string, string>;
}

export function planGate(days: readonly GateDay[], isDone: (folder: string) => boolean = () => false): PlanGate {
  const done = (t: { folder: string; done: boolean }): boolean => t.done || isDone(t.folder);
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const front = sorted.find((d) => d.topics.some((t) => !done(t)));
  if (!front) return { frontier: null, blockers: [], locked: new Map() };
  const open = new Set<string>();
  const locked = new Map<string, string>();
  for (const d of sorted) {
    if (d.date <= front.date) for (const t of d.topics) open.add(t.folder);
  }
  for (const d of sorted) {
    if (d.date <= front.date) continue;
    for (const t of d.topics) if (!open.has(t.folder) && !done(t) && !locked.has(t.folder)) locked.set(t.folder, front.date);
  }
  return { frontier: front.date, blockers: [...new Set(front.topics.filter((t) => !done(t)).map((t) => t.folder))], locked };
}
