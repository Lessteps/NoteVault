import { Award, CheckCircle2, Clock, Play, Sparkles } from "lucide-react";
import { useState } from "react";
import type { StudySnapshot, TopicData } from "../../lib/types";
import { cn } from "../ui";
import { ExamRunnerModal } from "./ExamRunnerModal";

interface TopicGeneralViewProps {
  topicData: TopicData;
  snap: StudySnapshot;
  onOpenConfigurator: () => void;
  onPractice: (path: string) => void;
}

export function TopicGeneralView({
  topicData,
  snap,
  onOpenConfigurator,
  onPractice,
}: TopicGeneralViewProps) {
  const [showExamModal, setShowExamModal] = useState(false);
  const manifest = topicData.topic;
  const progress = topicData.progress;

  if (!manifest || !progress) {
    return (
      <div className="p-4 text-[12px] text-faint">
        No se encontró información de progreso para este tema.
      </div>
    );
  }

  // Find due SRS items for this topic from the daily queue
  const normFolder = topicData.folder.replace(/\\/g, "/");
  const topicSrsItems = snap.queue.items.filter((item) => {
    if (item.exercise) {
      const p = item.exercise.path.replace(/\\/g, "/");
      return p.includes(normFolder);
    }
    return false;
  });

  const skillsList = manifest.skills
    .map((s) => progress.skills[s])
    .filter((s): s is NonNullable<typeof s> => s !== undefined);
  const missingSkills = skillsList.filter((s) => s.status === "not_started");

  return (
    <div className="flex flex-col gap-4">
      {/* Topic Mastery Summary Card */}
      <div className="rounded-xl border border-line-strong bg-card p-3.5">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10.5px] font-semibold uppercase tracking-wider text-accent-text">
            Dominio del tema
          </span>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10.5px] font-semibold",
              progress.isComplete
                ? "border border-mint/40 bg-mint-soft text-mint"
                : "border border-line bg-panel text-dim",
            )}
          >
            {progress.isComplete ? "✓ Tema dominado" : `${progress.completenessPct}% completado`}
          </span>
        </div>

        {/* Progress Bar */}
        <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-panel">
          <div
            className={cn(
              "h-full transition-all duration-500",
              progress.isComplete ? "bg-mint" : "bg-accent",
            )}
            style={{ width: `${progress.completenessPct}%` }}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-faint">
          <span>
            Objetivo: Dificultad {manifest.mastery.target_difficulty} (min{" "}
            {manifest.mastery.min_per_skill} por skill)
          </span>
          {manifest.mastery.exam === "required" && (
            <span className="flex items-center gap-1">
              <Award size={12} className={progress.examPassed ? "text-mint" : "text-warn"} />
              {progress.examPassed
                ? `Examen aprobado (${progress.examScore}/100)`
                : "Examen pendiente"}
            </span>
          )}
        </div>

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onOpenConfigurator}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent py-1.5 text-[12.5px] font-semibold text-white hover:bg-accent-strong"
          >
            <Sparkles size={13} /> Practicar tema
          </button>
          {manifest.mastery.exam === "required" && (
            <button
              type="button"
              onClick={() => setShowExamModal(true)}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-semibold transition-colors",
                progress.examPassed
                  ? "border-mint/30 bg-mint-soft text-mint hover:bg-mint/20"
                  : "border-warn/40 bg-warn-soft text-warn hover:bg-warn/20",
              )}
            >
              <Award size={13} /> {progress.examPassed ? "Repetir examen" : "Tomar examen"}
            </button>
          )}
        </div>
      </div>

      {/* Skill x Difficulty Matrix */}
      <div>
        <h3 className="mb-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-faint">
          Matriz de competencias (Skill × Dificultad)
        </h3>
        <div className="overflow-hidden rounded-xl border border-line bg-card">
          <table className="w-full border-collapse text-left text-[11.5px]">
            <thead>
              <tr className="border-b border-line bg-panel/60 font-mono text-[10px] text-faint">
                <th className="py-2 pl-3 pr-2 font-semibold">Skill</th>
                <th className="px-1.5 py-2 text-center font-semibold">★ Fac</th>
                <th className="px-1.5 py-2 text-center font-semibold">★★ Med</th>
                <th className="px-1.5 py-2 text-center font-semibold">★★★ Dif</th>
                <th className="py-2 pl-1.5 pr-3 text-right font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody>
              {skillsList.map((sp) => {
                if (!sp) return null;
                return (
                  <tr
                    key={sp.skill}
                    className="border-b border-line/60 last:border-none hover:bg-hover/50"
                  >
                    <td className="py-2 pl-3 pr-2 font-medium text-text">
                      <div className="truncate max-w-[120px]" title={sp.label}>
                        {sp.label}
                      </div>
                    </td>
                    {([1, 2, 3] as const).map((d) => {
                      const cell = sp.cells[d];
                      const hasPass = cell && cell.passes > 0;
                      return (
                        <td key={d} className="px-1.5 py-2 text-center font-mono">
                          {cell && cell.attempts > 0 ? (
                            <span
                              className={cn(
                                "rounded px-1.5 py-0.5 text-[10px]",
                                hasPass ? "bg-mint-soft text-mint font-semibold" : "text-faint",
                              )}
                              title={`${cell.passes} aprobados de ${cell.attempts} intentos. Mejor: ${cell.bestScore ?? "—"}`}
                            >
                              {cell.passes}/{cell.attempts}
                            </span>
                          ) : (
                            <span className="text-line-strong">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="py-2 pl-1.5 pr-3 text-right">
                      {sp.mastered ? (
                        <span className="inline-flex items-center gap-1 rounded border border-mint/40 bg-mint-soft px-1.5 py-0.5 text-[9.5px] font-semibold text-mint">
                          <CheckCircle2 size={10} /> Dominada
                        </span>
                      ) : sp.consolidated ? (
                        <span className="rounded bg-mint-soft px-1.5 py-0.5 text-[9.5px] text-mint">
                          Consolidada
                        </span>
                      ) : sp.status === "practicing" ? (
                        <span className="rounded bg-warn-soft px-1.5 py-0.5 text-[9.5px] text-warn">
                          En práctica
                        </span>
                      ) : (
                        <span className="text-[10px] text-faint">Pendiente</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Missing Skills Warning */}
      {missingSkills.length > 0 && (
        <div className="rounded-xl border border-warn/30 bg-warn-soft/60 p-3 text-[11.5px] text-dim">
          <div className="font-semibold text-warn">Competencias sin iniciar:</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {missingSkills.map((ms) => (
              <span
                key={ms.skill}
                className="rounded-md border border-warn/40 bg-card px-2 py-0.5 text-[10.5px] font-medium text-text"
              >
                {ms.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Spaced Repetition Due for this Topic */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <h3 className="font-mono text-[10px] font-semibold uppercase tracking-wider text-faint">
            Repasos pendientes (SRS) de este tema
          </h3>
          <span className="font-mono text-[10.5px] text-faint">
            {topicSrsItems.length}
          </span>
        </div>

        {topicSrsItems.length === 0 ? (
          <div className="rounded-xl border border-line bg-card p-3 text-center text-[11.5px] text-faint">
            Todos los repasos espaciados de este tema están al día.
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {topicSrsItems.map((item, idx) => {
              const ex = item.exercise;
              if (!ex) return null;
              return (
                <div
                  key={idx}
                  className="flex items-center justify-between rounded-xl border border-line bg-card p-2.5 hover:border-dim"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] font-semibold text-text">
                      {ex.title}
                    </div>
                    <div className="flex items-center gap-1.5 text-[10.5px] text-faint">
                      <Clock size={11} />
                      <span>{ex.mode}</span>
                      <span>·</span>
                      <span className="text-warn">{"★".repeat(ex.difficulty)}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onPractice(ex.path)}
                    className="ml-2 flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-[11px] font-medium text-text hover:bg-hover"
                  >
                    <Play size={10} /> Repasar
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showExamModal && (
        <ExamRunnerModal
          topicFolder={topicData.folder}
          manifest={manifest}
          onClose={() => setShowExamModal(false)}
          onExamFinished={() => {
            setShowExamModal(false);
          }}
        />
      )}
    </div>
  );
}
