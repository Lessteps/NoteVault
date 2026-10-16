// Modal de evaluación obligatoria al finalizar un bloque de foco (Pomodoro o cronómetro).
// Impide iniciar un nuevo bloque hasta que el estudiante responda qué aprendió, qué duda le queda y cómo de bien lo entendió. Las respuestas se guardan
// en el registro de horas del plan (`mentor_timelog_assess`); si no se pueden guardar el modal se queda abierto (no se pierde nada en silencio).

import { CheckCircle2, Sparkles } from "lucide-react";
import { useState } from "react";
import { api } from "../../lib/bridge";
import { localDay } from "../../lib/timeLog";
import { useApp } from "../../store/app";
import { usePomodoro } from "../../store/pomodoro";
import { PrimaryButton } from "../common/forms";

export function PomodoroAssessmentModal() {
  const assessment = usePomodoro((s) => s.p.pendingAssessment);
  const clearAssessment = usePomodoro((s) => s.clearAssessment);
  const toast = useApp((s) => s.toast);

  const [learned, setLearned] = useState("");
  const [doubt, setDoubt] = useState("");
  const [understanding, setUnderstanding] = useState<number>(4);
  const [busy, setBusy] = useState(false);

  if (!assessment) return null;

  const topicsList = assessment.topics.length ? assessment.topics.map((t) => t.title).join(", ") : "Sesión libre de estudio";
  const ready = !!learned.trim() && !!doubt.trim();

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    try {
      await api.mentorTimeLogAssess({
        id: assessment.planId,
        areaKey: assessment.areaKey,
        date: localDay(new Date(assessment.finishedAt)),
        minutes: assessment.minutes,
        topics: assessment.topics.map((t) => t.title),
        understanding,
        learned: learned.trim(),
        doubt: doubt.trim(),
      });
      usePomodoro.getState().bump();
      setLearned("");
      setDoubt("");
      setUnderstanding(4);
      clearAssessment();
    } catch (err) {
      toast("error", `No se pudo guardar la evaluación: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="assess-h" data-testid="assessment-modal">
      <div className="w-full max-w-lg space-y-4 rounded-2xl border border-line bg-card p-6 shadow-2xl">
        <header className="space-y-1">
          <div className="flex items-center gap-2 text-accent">
            <Sparkles size={18} aria-hidden />
            <span className="font-mono text-[12px] font-bold uppercase tracking-wider">Evaluación de progreso requerida</span>
          </div>
          <h2 id="assess-h" className="text-[20px] font-bold text-text">Sesión finalizada: {assessment.minutes} minutos de foco</h2>
          <p className="text-[13.5px] text-dim">
            Antes de empezar otro bloque, responde estas preguntas para consolidar lo aprendido en <strong className="text-text">{topicsList}</strong>.
          </p>
        </header>

        <form onSubmit={(e) => void submit(e)} className="space-y-4 text-[14px]">
          <div className="space-y-1.5">
            <label htmlFor="assess-learned" className="block font-medium text-text">1. ¿Cuál fue el concepto o idea principal que aprendiste o resolviste en esta sesión? *</label>
            <textarea id="assess-learned" required rows={2} value={learned} onChange={(e) => setLearned(e.target.value)} data-testid="assess-learned" className="w-full rounded-xl border border-line bg-surface p-2.5 text-[13.5px] text-text outline-none focus:border-accent" />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="assess-doubt" className="block font-medium text-text">2. ¿Qué duda, obstáculo o detalle queda pendiente por profundizar? *</label>
            <textarea id="assess-doubt" required rows={2} value={doubt} onChange={(e) => setDoubt(e.target.value)} data-testid="assess-doubt" className="w-full rounded-xl border border-line bg-surface p-2.5 text-[13.5px] text-text outline-none focus:border-accent" />
          </div>

          <fieldset className="space-y-1.5">
            <legend className="font-medium text-text">3. ¿Cómo evalúas tu nivel de comprensión en esta sesión?</legend>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  aria-pressed={understanding === lvl}
                  onClick={() => setUnderstanding(lvl)}
                  data-testid={`assess-level-${lvl}`}
                  className={`flex-1 rounded-lg border py-1.5 text-center text-[13px] font-semibold transition-colors ${understanding === lvl ? "border-accent bg-accent text-white" : "border-line bg-surface text-dim hover:bg-hover hover:text-text"}`}
                >
                  {lvl}★
                </button>
              ))}
            </div>
          </fieldset>

          <div className="flex items-center justify-end gap-2 border-t border-line pt-3">
            <PrimaryButton large disabled={busy || !ready} type="submit" data-testid="assess-submit">
              <CheckCircle2 size={16} aria-hidden /> {busy ? "Guardando…" : "Completar evaluación y desbloquear"}
            </PrimaryButton>
          </div>
        </form>
      </div>
    </div>
  );
}
