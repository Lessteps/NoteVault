import { Award, CheckCircle2, ChevronLeft, ChevronRight, Clock, Loader2, PenTool, Send, X, XCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { MathDrawingInput } from "../practice/MathDrawingInput";
import { api } from "../../lib/bridge";
import { renderMarkdown } from "../../lib/markdown";
import type {
  ExamExerciseItem,
  ExamItemGradingResult,
  ExamRecord,
  ExamSession,
  TopicManifest,
} from "../../lib/types";
import { useApp } from "../../store/app";
import { cn, confirmAction } from "../ui";
import { useStudyVersion } from "./StudyPanel";

interface ExamRunnerModalProps {
  topicFolder: string;
  manifest: TopicManifest;
  onClose: () => void;
  onExamFinished: () => void;
}

export function ExamRunnerModal({
  topicFolder,
  manifest,
  onClose,
  onExamFinished,
}: ExamRunnerModalProps) {
  const toast = useApp((s) => s.toast);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<ExamSession | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [secondsRemaining, setSecondsRemaining] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);
  const [showDrawing, setShowDrawing] = useState(false);
  const [result, setResult] = useState<{
    record: ExamRecord;
    item_results: ExamItemGradingResult[];
  } | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 1. Assemble exam on mount
  useEffect(() => {
    let cancelled = false;
    async function init() {
      setLoading(true);
      try {
        const res = await api.studyExamAssemble(
          topicFolder,
          manifest.exam_group,
          manifest.mastery.target_difficulty,
        );
        if (cancelled) return;
        if (res.ok && res.session) {
          setSession(res.session);
          setSecondsRemaining(res.session.timeLimitMinutes * 60);
        } else {
          toast("error", "No se pudo generar el examen.");
          onClose();
        }
      } catch (err: any) {
        if (!cancelled) {
          toast("error", err?.message || "Error al ensamblar examen");
          onClose();
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    init();
    return () => {
      cancelled = true;
    };
  }, [topicFolder, manifest, toast, onClose]);

  // 2. Countdown timer
  useEffect(() => {
    if (!session || result || submitting) return;
    timerRef.current = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [session, result, submitting]);

  const formatTimer = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins}:${s < 10 ? "0" : ""}${s}`;
  };

  const handleAnswerChange = (text: string) => {
    if (!session) return;
    const currentItem = session.items[currentIndex];
    if (!currentItem) return;
    setAnswers((prev) => ({ ...prev, [currentItem.id]: text }));
  };

  const currentItem: ExamExerciseItem | undefined = session?.items[currentIndex];

  const handleSubmitExam = useCallback(async () => {
    if (!session || submitting) return;

    // Check for empty answers
    const unansweredCount = session.items.filter(
      (it) => !(answers[it.id] || "").trim(),
    ).length;

    if (unansweredCount > 0) {
      const ok = await confirmAction(
        "Preguntas sin responder",
        `Tienes ${unansweredCount} pregunta(s) sin responder. ¿Deseas entregar el examen de todos modos?`,
        "Entregar examen",
        true,
      );
      if (!ok) return;
    }

    setSubmitting(true);
    try {
      const submissions = session.items.map((it) => ({
        itemId: it.id,
        answerText: answers[it.id] || "",
      }));

      const res = await api.studyExamSubmit(session, submissions);
      if (res.ok) {
        setResult({
          record: res.record,
          item_results: res.item_results,
        });
        useStudyVersion.getState().bump();
      } else {
        toast("error", "Error al procesar el examen.");
      }
    } catch (err: any) {
      toast("error", err?.message || "Error al calificar el examen");
    } finally {
      setSubmitting(false);
    }
  }, [session, submitting, answers, toast]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-line-strong bg-panel shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Award className="text-accent-text" size={18} />
            <div>
              <h2 className="text-[14px] font-bold text-ink">
                {session ? session.title : "Cargando Examen..."}
              </h2>
              <div className="text-[11px] text-faint">
                Certificación a máxima dificultad ({manifest.mastery.target_difficulty}/3) · Sin asistencia
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {session && !result && (
              <span
                className={cn(
                  "flex items-center gap-1 rounded-full px-2.5 py-1 font-mono text-[12px] font-semibold",
                  secondsRemaining < 300
                    ? "bg-danger-soft text-danger animate-pulse"
                    : "bg-card text-dim border border-line",
                )}
              >
                <Clock size={13} /> {formatTimer(secondsRemaining)}
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1 text-faint hover:bg-card hover:text-ink"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 text-dim">
              <Loader2 className="animate-spin text-accent-text" size={32} />
              <p className="mt-3 text-[13px]">
                Ensamblando preguntas de certificación para {manifest.title}...
              </p>
            </div>
          )}

          {!loading && result && (
            /* Results View */
            <div className="flex flex-col items-center gap-4 py-2">
              <div
                className={cn(
                  "flex h-16 w-16 items-center justify-center rounded-full",
                  result.record.passed ? "bg-mint-soft text-mint" : "bg-danger-soft text-danger",
                )}
              >
                {result.record.passed ? <CheckCircle2 size={36} /> : <XCircle size={36} />}
              </div>

              <div className="text-center">
                <h3 className="text-[18px] font-bold text-ink">
                  {result.record.passed ? "¡Examen Aprobado!" : "Examen No Aprobado"}
                </h3>
                <p className="text-[13px] text-dim">
                  Puntuación global:{" "}
                  <span className="font-bold text-ink">{result.record.score} / 100</span>
                </p>
              </div>

              {/* Skills Verdict Table */}
              <div className="w-full overflow-hidden rounded-xl border border-line bg-card mt-2">
                <table className="w-full border-collapse text-left text-[12px]">
                  <thead>
                    <tr className="border-b border-line bg-panel/70 font-mono text-[10px] text-faint uppercase">
                      <th className="py-2 pl-3">Competencia / Skill</th>
                      <th className="py-2 text-center">Puntaje</th>
                      <th className="py-2 pr-3 text-right">Resultado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(result.record.skills).map(([skill, ver]) => (
                      <tr key={skill} className="border-b border-line/40 last:border-0">
                        <td className="py-2 pl-3 font-medium text-ink capitalize">
                          {skill.replace(/_/g, " ")}
                        </td>
                        <td className="py-2 text-center font-mono font-semibold text-ink">
                          {ver.score}/100
                        </td>
                        <td className="py-2 pr-3 text-right">
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[10.5px] font-semibold",
                              ver.passed
                                ? "bg-mint-soft text-mint"
                                : "bg-danger-soft text-danger",
                            )}
                          >
                            {ver.passed ? "✓ Aprobado" : "✗ Repetir"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button
                type="button"
                onClick={() => {
                  onExamFinished();
                  onClose();
                }}
                className="mt-3 rounded-lg bg-accent px-6 py-2 text-[13px] font-semibold text-white hover:bg-accent-strong"
              >
                Volver al tema
              </button>
            </div>
          )}

          {!loading && !result && session && currentItem && (
            /* Active Exam Question */
            <div className="flex flex-col gap-4">
              {/* Question Navigation Tabs */}
              <div className="flex flex-wrap items-center gap-1.5 border-b border-line pb-3">
                {session.items.map((it, idx) => {
                  const hasAnswer = (answers[it.id] || "").trim().length > 0;
                  const isCurrent = idx === currentIndex;
                  return (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => setCurrentIndex(idx)}
                      className={cn(
                        "flex h-7 w-7 items-center justify-center rounded-lg text-[11.5px] font-mono font-semibold transition-colors",
                        isCurrent
                          ? "bg-accent text-white"
                          : hasAnswer
                            ? "bg-card border border-line-strong text-ink"
                            : "bg-panel border border-line text-faint hover:text-dim",
                      )}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>

              {/* Question Card */}
              <div className="rounded-xl border border-line bg-card p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-mono text-[10.5px] font-semibold uppercase tracking-wider text-accent-text">
                    Pregunta {currentIndex + 1} de {session.items.length} · Habilidad: {currentItem.skill}
                  </span>
                  <span className="rounded-full bg-panel px-2 py-0.5 text-[10.5px] font-semibold text-dim border border-line">
                    Dificultad {currentItem.difficulty} / 3
                  </span>
                </div>

                <h4 className="text-[13.5px] font-bold text-ink">{currentItem.title}</h4>

                <div
                  className="prose prose-sm mt-3 text-[12.5px] text-dim"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(currentItem.statement) }}
                />
              </div>

              {/* Answer Input */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="block font-mono text-[10px] font-semibold uppercase tracking-wider text-faint">
                    Tu respuesta completa (justifica todos los pasos)
                  </label>
                  {(manifest.subject === "mathematics" || ["prove", "solve", "process", "counterexample", "true_false", "find_error", "drill", "explain"].includes(currentItem.skill)) && (
                    <button
                      type="button"
                      onClick={() => setShowDrawing(!showDrawing)}
                      className={cn(
                        "flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-semibold transition-colors",
                        showDrawing
                          ? "bg-accent text-white"
                          : "border border-line bg-card text-dim hover:text-ink hover:border-accent",
                      )}
                    >
                      <PenTool size={11} /> {showDrawing ? "Ocultar dibujo" : "✏️ Dibujar (LaTeX)"}
                    </button>
                  )}
                </div>

                {showDrawing && (
                  <div className="mb-3">
                    <MathDrawingInput
                      onInsertLatex={(latex) => {
                        const cur = answers[currentItem.id] || "";
                        handleAnswerChange(cur ? `${cur.trimEnd()}\n${latex}` : latex);
                      }}
                      onClose={() => setShowDrawing(false)}
                    />
                  </div>
                )}

                <textarea
                  value={answers[currentItem.id] || ""}
                  onChange={(e) => handleAnswerChange(e.target.value)}
                  placeholder="Escribe tu razonamiento detallado, demostración o solución aquí..."
                  rows={6}
                  className="w-full rounded-xl border border-line bg-card p-3 font-mono text-[12.5px] text-ink placeholder:text-faint focus:border-accent focus:outline-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        {!loading && !result && session && (
          <div className="flex items-center justify-between border-t border-line px-5 py-3 bg-panel/50">
            <button
              type="button"
              disabled={currentIndex === 0}
              onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
              className="flex items-center gap-1 rounded-lg border border-line bg-card px-3 py-1.5 text-[12px] font-medium text-dim hover:text-ink disabled:opacity-40"
            >
              <ChevronLeft size={14} /> Anterior
            </button>

            <div className="flex items-center gap-2">
              {currentIndex < session.items.length - 1 ? (
                <button
                  type="button"
                  onClick={() => setCurrentIndex((prev) => Math.min(session.items.length - 1, prev + 1))}
                  className="flex items-center gap-1 rounded-lg border border-line bg-card px-3 py-1.5 text-[12px] font-medium text-dim hover:text-ink"
                >
                  Siguiente <ChevronRight size={14} />
                </button>
              ) : null}

              <button
                type="button"
                disabled={submitting}
                onClick={handleSubmitExam}
                className="flex items-center gap-1.5 rounded-lg bg-mint px-4 py-1.5 text-[12.5px] font-semibold text-white hover:bg-mint-strong disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 size={13} className="animate-spin" /> Evaluando por IA...
                  </>
                ) : (
                  <>
                    <Send size={13} /> Entregar Examen
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
