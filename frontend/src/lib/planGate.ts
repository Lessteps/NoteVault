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

export interface GateAreaDay {
  date: string;
  topics: ReadonlyArray<{ folder: string; done: boolean; subplanId: string }>;
}

export interface AreaGates {
  /** el frente más antiguo de todas las áreas */
  frontier: string | null;
  /** lo que falta en el área (o áreas) con el frente más antiguo */
  blockers: string[];
  /** carpeta bloqueada → fecha que hay que cerrar antes en SU área */
  locked: Map<string, string>;
  /** la ruta sólida de cada área (`subplanId`) */
  byArea: Map<string, PlanGate>;
}

/**
 * La ruta sólida POR ÁREA: cada área avanza por su propia ruta, así que un día pendiente de Frontend no bloquea Backend (ni al revés).
 * Un tema que está repartido en varias áreas (los fundamentos) solo se bloquea si está bloqueado en TODAS ellas.
 */
export function planGateByArea(days: readonly GateAreaDay[], isDone: (folder: string) => boolean = () => false): AreaGates {
  const ids = [...new Set(days.flatMap((d) => d.topics.map((t) => t.subplanId)))];
  const byArea = new Map<string, PlanGate>();
  const appears = new Map<string, Set<string>>();
  for (const id of ids) {
    const mine: GateDay[] = days.map((d) => ({ date: d.date, topics: d.topics.filter((t) => t.subplanId === id) })).filter((d) => d.topics.length > 0);
    for (const d of mine) for (const t of d.topics) (appears.get(t.folder) ?? appears.set(t.folder, new Set()).get(t.folder)!).add(id);
    byArea.set(id, planGate(mine, isDone));
  }
  const locked = new Map<string, string>();
  for (const [folder, where] of appears) {
    const dates: string[] = [];
    for (const id of where) {
      const d = byArea.get(id)?.locked.get(folder);
      if (!d) break;
      dates.push(d);
    }
    if (dates.length === where.size) locked.set(folder, dates.sort()[0]!);
  }
  const fronts = [...byArea.values()].map((g) => g.frontier).filter((f): f is string => !!f).sort();
  const frontier = fronts[0] ?? null;
  const blockers = frontier ? [...new Set([...byArea.values()].filter((g) => g.frontier === frontier).flatMap((g) => g.blockers))] : [];
  return { frontier, blockers, locked, byArea };
}
