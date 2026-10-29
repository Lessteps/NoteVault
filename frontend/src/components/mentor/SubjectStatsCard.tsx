import type { MentorPlan, MentorSubplan } from "../../lib/types";
import { usePersistedNav } from "../../store/navState";
import { ProgressBar } from "./parts";

export function SubjectStatsCard({
  plan,
  sub,
}: {
  plan: MentorPlan;
  sub: MentorSubplan;
}) {
  const [selectedSubject, setSelectedSubject] = usePersistedNav<string>(
    `mentor.runSubject.${plan.id}.${sub.id}`,
    "all"
  );

  const groups = sub.groups && sub.groups.length > 0
    ? sub.groups
    : [{ id: "core", title: "Temas generales", kind: "knowledge" as const, order: 100 }];

  // Calcular estadísticas por asignatura
  const liveTopics = sub.topics.filter((t) => t.route !== "skipped");
  const statsByGroup = groups.map((g) => {
    const groupTopics = liveTopics.filter((t) => (t.group ?? "core") === g.id);
    const doneTopics = groupTopics.filter((t) => !!t.completedAt);
    const totalMin = groupTopics.reduce((acc, t) => acc + (t.estMinutes || 45), 0);
    const doneMin = doneTopics.reduce((acc, t) => acc + (t.estMinutes || 45), 0);
    const pct = groupTopics.length > 0 ? Math.round((doneTopics.length / groupTopics.length) * 100) : 0;
    return {
      group: g,
      total: groupTopics.length,
      done: doneTopics.length,
      pct,
      totalMin,
      doneMin,
    };
  });

  const activeStat = statsByGroup.find((s) => s.group.id === selectedSubject) ?? {
    group: { id: "all", title: "Todas las asignaturas", kind: "knowledge" as const, order: 0 },
    total: liveTopics.length,
    done: liveTopics.filter((t) => !!t.completedAt).length,
    pct: liveTopics.length > 0 ? Math.round((liveTopics.filter((t) => !!t.completedAt).length / liveTopics.length) * 100) : 0,
    totalMin: liveTopics.reduce((acc, t) => acc + (t.estMinutes || 45), 0),
    doneMin: liveTopics.filter((t) => !!t.completedAt).reduce((acc, t) => acc + (t.estMinutes || 45), 0),
  };

  return (
    <div
      className="space-y-3 rounded-2xl border border-line bg-card p-4"
      data-testid="pomodoro-subject-stats"
      data-subject={activeStat.group.id}
    >
      <div className="flex flex-wrap items-center justify-between gap-1 border-b border-line pb-2">
        <h4 className="text-[14px] font-bold text-text">Progreso de la Asignatura</h4>
        <span className="text-[12px] font-semibold text-accent-text">
          {activeStat.pct}% completado
        </span>
      </div>

      {groups.length > 1 && (
        <div className="flex flex-wrap gap-1" data-testid="subject-stats-tabs">
          <button
            type="button"
            onClick={() => setSelectedSubject("all")}
            className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors ${
              selectedSubject === "all"
                ? "bg-accent text-white"
                : "bg-surface text-dim hover:bg-hover hover:text-text"
            }`}
          >
            Todas
          </button>
          {groups.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => setSelectedSubject(g.id)}
              className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors ${
                selectedSubject === g.id
                  ? "bg-accent text-white"
                  : "bg-surface text-dim hover:bg-hover hover:text-text"
              }`}
            >
              {g.title}
            </button>
          ))}
        </div>
      )}

      <div>
        <p className="text-[13px] font-semibold text-text">{activeStat.group.title}</p>
        <div className="mt-1">
          <ProgressBar pct={activeStat.pct} label={`Avance de ${activeStat.group.title}`} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 pt-1 font-mono text-[12px]">
        <div className="rounded-xl border border-line bg-surface p-2">
          <span className="block text-[11px] font-sans text-dim">Temas</span>
          <span className="text-[14px] font-bold text-text">
            {activeStat.done} / {activeStat.total}
          </span>
        </div>
        <div className="rounded-xl border border-line bg-surface p-2">
          <span className="block text-[11px] font-sans text-dim">Tiempo estimado</span>
          <span className="text-[14px] font-bold text-text">
            {activeStat.doneMin} / {activeStat.totalMin}m
          </span>
        </div>
      </div>
    </div>
  );
}
