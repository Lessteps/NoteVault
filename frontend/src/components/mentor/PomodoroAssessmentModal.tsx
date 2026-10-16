// Modal de evaluación obligatoria al finalizar un bloque de foco (Pomodoro o cronómetro).
// Impide iniciar un nuevo bloque hasta que el estudiante responda cómo fue la sesión: qué aprendió, qué duda le queda, cómo quedó cada tema o tarea
// asignados, si practicó, qué errores concretos tuvo y su comprensión y concentración. Es el REGISTRO de rendimiento que el Mentor lee después para
// repensar el plan. Se guarda en el registro de horas del plan (`mentor_timelog_assess`); si no se puede guardar el modal se queda abierto.

import { CheckCircle2, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../lib/bridge";
import { localDay } from "../../lib/timeLog";
import { useApp } from "../../store/app";
import { usePomodoro } from "../../store/pomodoro";
import { PrimaryButton } from "../common/forms";

type Status = "done" | "partial" | "none";
const STATUS_LABEL: Record<Status, string> = { done: "Completado", partial: "A medias", none: "No lo toqué" };

function Stars({ value, onPick, name }: { value: number; onPick: (n: number) => void; name: string }) {
  return (
    <div className="flex items-center gap-2">
      {[1, 2, 3, 4, 5].map((lvl) => (
        <button
          key={lvl}
          type="button"
          aria-pressed={value === lvl}
          onClick={() => onPick(lvl)}
          data-testid={`assess-${name}-${lvl}`}
          className={`flex-1 rounded-lg border py-1.5 text-center text-[13px] font-semibold transition-colors ${value === lvl ? "border-accent bg-accent text-white" : "border-line bg-surface text-dim hover:bg-hover hover:text-text"}`}
        >
          {lvl}★
        </button>
      ))}
    </div>
  );
}

export function PomodoroAssessmentModal() {
  const assessment = usePomodoro((s) => s.p.pendingAssessment);
  const clearAssessment = usePomodoro((s) => s.clearAssessment);
  const toast = useApp((s) => s.toast);

  const [learned, setLearned] = useState("");
  const [doubt, setDoubt] = useState("");
  const [errors, setErrors] = useState("");
  const [understanding, setUnderstanding] = useState(4);
  const [focus, setFocus] = useState(4);
  const [practiced, setPracticed] = useState(false);
  const [outcomes, setOutcomes] = useState<Record<string, Status>>({});
  const [busy, setBusy] = useState(false);
  const finishedAt = assessment?.finishedAt;
  // cada evaluación nueva empieza limpia
  useEffect(() => {
    setOutcomes({});
    setLearned("");
    setDoubt("");
    setErrors("");
    setUnderstanding(4);
    setFocus(4);
    setPracticed(false);
  }, [finishedAt]);

  if (!assessment) return null;

  const items = assessment.topics;
  const topicsList = items.length ? items.map((t) => t.title).join(", ") : "Sesión libre de estudio";
  const ready = !!learned.trim() && !!doubt.trim();
  const statusOf = (folder: string): Status => outcomes[folder] ?? "partial";

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
        topics: items.map((t) => t.title),
        understanding,
        focus,
        outcomes: items.map((t) => ({ title: t.title, status: statusOf(t.folder) })),
        practiced,
        learned: learned.trim(),
        doubt: doubt.trim(),
        errors: errors.trim(),
      });
      usePomodoro.getState().bump();
      clearAssessment();
    } catch (err) {
      toast("error", `No se pudo guardar la evaluación: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const field = "w-full rounded-xl border border-line bg-surface p-2.5 text-[13.5px] text-text outline-none focus:border-accent";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="assess-h" data-testid="assessment-modal">
      <div className="my-auto w-full max-w-xl space-y-4 rounded-2xl border border-line bg-card p-6 shadow-2xl">
        <header className="space-y-1">
          <div className="flex items-center gap-2 text-accent">
            <Sparkles size={18} aria-hidden />
            <span className="font-mono text-[12px] font-bold uppercase tracking-wider">Registro de la sesión (obligatorio)</span>
          </div>
          <h2 id="assess-h" className="text-[20px] font-bold text-text">Sesión finalizada: {assessment.minutes} minutos de foco</h2>
          <p className="text-[13.5px] text-dim">
            El Mentor lee este registro para saber cómo vas y repensar el plan. Responde antes de empezar otro bloque sobre <strong className="text-text">{topicsList}</strong>.
          </p>
        </header>

        <form onSubmit={(e) => void submit(e)} className="space-y-4 text-[14px]">
          {items.length > 0 && (
            <fieldset className="space-y-2" data-testid="assess-outcomes">
              <legend className="font-medium text-text">1. ¿Cómo quedó cada cosa que asignaste a este bloque?</legend>
              <ul className="space-y-1.5">
                {items.map((t) => (
                  <li key={t.folder} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-line px-2.5 py-1.5">
                    <span className="min-w-0 flex-1 basis-40 truncate text-[13.5px]">{t.title}</span>
                    <span role="group" aria-label={`Estado de ${t.title}`} className="inline-flex gap-1">
                      {(["done", "partial", "none"] as const).map((st) => (
                        <button
                          key={st}
                          type="button"
                          aria-pressed={statusOf(t.folder) === st}
                          onClick={() => setOutcomes((o) => ({ ...o, [t.folder]: st }))}
                          data-testid={`assess-outcome-${st}`}
                          className={`min-h-7 rounded-md border px-2 text-[12px] ${statusOf(t.folder) === st ? "border-accent bg-accent-soft text-accent-text" : "border-line text-dim hover:bg-hover"}`}
                        >
                          {STATUS_LABEL[st]}
                        </button>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </fieldset>
          )}

          <div className="space-y-1.5">
            <label htmlFor="assess-learned" className="block font-medium text-text">{items.length ? "2" : "1"}. ¿Cuál fue el concepto o idea principal que aprendiste o resolviste? *</label>
            <textarea id="assess-learned" required rows={2} value={learned} onChange={(e) => setLearned(e.target.value)} data-testid="assess-learned" className={field} />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="assess-doubt" className="block font-medium text-text">{items.length ? "3" : "2"}. ¿Qué duda, obstáculo o detalle queda pendiente por profundizar? *</label>
            <textarea id="assess-doubt" required rows={2} value={doubt} onChange={(e) => setDoubt(e.target.value)} data-testid="assess-doubt" className={field} />
          </div>

          <div className="space-y-1.5">
            <label className="flex items-center gap-2 font-medium text-text">
              <input type="checkbox" checked={practiced} onChange={(e) => setPracticed(e.target.checked)} className="h-4 w-4" data-testid="assess-practiced" />
              Hice ejercicios o un problema práctico en este bloque
            </label>
            <label htmlFor="assess-errors" className="block text-[13px] text-dim">¿Qué errores o problemas concretos tuviste? (opcional, pero es lo que más ayuda a repensar el plan)</label>
            <textarea id="assess-errors" rows={2} value={errors} onChange={(e) => setErrors(e.target.value)} data-testid="assess-errors" className={field} placeholder="Ej: confundí PUT con PATCH; la consulta con JOIN devolvía filas duplicadas…" />
          </div>

          <div className="grid gap-3 @xl:grid-cols-2 sm:grid-cols-2">
            <fieldset className="space-y-1.5">
              <legend className="font-medium text-text">Comprensión del tema</legend>
              <Stars value={understanding} onPick={setUnderstanding} name="level" />
            </fieldset>
            <fieldset className="space-y-1.5">
              <legend className="font-medium text-text">Concentración en el bloque</legend>
              <Stars value={focus} onPick={setFocus} name="focus" />
            </fieldset>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-line pt-3">
            <PrimaryButton large disabled={busy || !ready} type="submit" data-testid="assess-submit">
              <CheckCircle2 size={16} aria-hidden /> {busy ? "Guardando…" : "Guardar el registro y desbloquear"}
            </PrimaryButton>
          </div>
        </form>
      </div>
    </div>
  );
}
