// Mentor — Ejecución: el AVISO DE CONSTANCIA. Compara lo repartido hasta hoy con lo que de verdad está completo y dice cuánto hay que hacer por
// día de estudio para llegar a la fecha de fin. Módulo PURO: sin DOM ni node.

export interface CatchUpDay {
  date: string;
  study: boolean;
  topics: ReadonlyArray<{ folder: string; title: string; minutes: number; done: boolean; area: string }>;
}

export interface CatchUp {
  /** temas que tocaban antes de hoy y siguen sin completarse */
  late: Array<{ folder: string; title: string; area: string }>;
  lateByArea: Array<{ area: string; count: number }>;
  /** temas sin completar en todo el plan */
  remaining: number;
  remainingMinutes: number;
  /** días de estudio que quedan (hoy incluido) hasta el fin */
  daysLeft: number;
  /** temas / minutos por día de estudio para terminar a tiempo */
  perDay: number;
  minutesPerDay: number;
  /** minutos que el plan reserva a la teoría un día de estudio normal (0 = no se sabe) */
  capacityPerDay: number;
}

export function catchUpOf(days: readonly CatchUpDay[], today: string, end: string, isDone: (folder: string) => boolean = () => false, capacityPerDay = 0): CatchUp {
  const finished = (t: { folder: string; done: boolean }): boolean => t.done || isDone(t.folder);
  const doneSet = new Set<string>();
  for (const d of days) for (const t of d.topics) if (finished(t)) doneSet.add(t.folder);
  const late = new Map<string, { folder: string; title: string; area: string }>();
  const rest = new Map<string, number>();
  for (const d of days) {
    for (const t of d.topics) {
      if (doneSet.has(t.folder)) continue;
      rest.set(t.folder, (rest.get(t.folder) ?? 0) + t.minutes);
      if (d.date < today && !late.has(t.folder)) late.set(t.folder, { folder: t.folder, title: t.title, area: t.area });
    }
  }
  const lateList = [...late.values()];
  const byArea = new Map<string, number>();
  for (const l of lateList) byArea.set(l.area, (byArea.get(l.area) ?? 0) + 1);
  const remainingMinutes = Math.round([...rest.values()].reduce((n, m) => n + m, 0));
  const daysLeft = days.filter((d) => d.study && d.date >= today && d.date <= end).length;
  const perDay = daysLeft > 0 ? Math.round((rest.size / daysLeft) * 10) / 10 : rest.size;
  return {
    late: lateList,
    lateByArea: [...byArea].map(([area, count]) => ({ area, count })),
    remaining: rest.size,
    remainingMinutes,
    daysLeft,
    perDay,
    minutesPerDay: daysLeft > 0 ? Math.round(remainingMinutes / daysLeft) : remainingMinutes,
    capacityPerDay,
  };
}
