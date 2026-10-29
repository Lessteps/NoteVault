// Temas por crear — LA COLA de un área, en tres pasos lineales y sin elegir nada a mano:
//   1. «Solo lo esencial» (o «Todo lo que falta»): la app escribe las tareas por lotes y UN archivo maestro que las encadena.
//   2. «Copiar instrucción»: una sola frase para pegar en Antigravity; el agente hace las tareas una detrás de otra.
//   3. «Ya terminó — validar todo» y «Añadir al plan». «Empezar de nuevo» descarta lo pendiente.
// Es idempotente: pulsar otra vez no duplica tareas. La selección a mano sigue existiendo debajo, plegada.

import { CheckCircle2, ClipboardCopy, Loader2, RotateCcw, Rocket } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { copyText } from "../../lib/clipboard";
import { useApp } from "../../store/app";
import { useCurriculum, type CurriculumHandoffState } from "../../store/curriculum";
import { GhostButton, PrimaryButton } from "../common/forms";
import { ProgressBar } from "../mentor/parts";
import { AddToPlan, refreshEverything } from "./CurriculumHandoffPanel";

export function CurriculumQueue({ areaId, areaTitle, missing, essentials, withExercises }: { areaId: string; areaTitle: string; missing: number; essentials: number; withExercises: boolean }) {
  const toast = useApp((s) => s.toast);
  const allPending = useCurriculum((s) => s.pending);
  const queue = useMemo(() => allPending.filter((h) => h.areaId === areaId), [allPending, areaId]);
  const [busy, setBusy] = useState<"" | "make" | "validate" | "discard">("");
  const [prompt, setPrompt] = useState("");
  const [done, setDone] = useState<CurriculumHandoffState[]>([]);
  const [copied, setCopied] = useState(false);

  // al volver a la pantalla con una cola ya hecha, se recupera la frase del maestro (no añade tareas)
  useEffect(() => {
    if (!queue.length || prompt) return;
    useCurriculum.getState().createBatches({ areaId, refreshOnly: true, withExercises }).then((q) => setPrompt(q.master.shortPrompt)).catch(() => undefined);
  }, [queue.length, prompt, areaId, withExercises]);

  const topics = queue.reduce((n, h) => n + h.entries.length, 0);
  const validatedTopics = done.filter((h) => h.status === "validated");
  const total = queue.length + validatedTopics.length;
  const failed = queue.filter((h) => h.status === "failed");
  const folders = validatedTopics.flatMap((h) => h.entries.map((e) => e.folder));

  const make = async (importance?: string): Promise<void> => {
    setBusy("make");
    try {
      const q = await useCurriculum.getState().createBatches({ areaId, ...(importance ? { importance } : {}), withExercises });
      setPrompt(q.master.shortPrompt);
      setDone([]);
      toast("info", `Cola lista: ${q.tasks.length} ${q.tasks.length === 1 ? "tarea" : "tareas"}. Copia la instrucción y pégala en Antigravity.`);
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy("");
    }
  };
  const copy = async (): Promise<void> => {
    const ok = await copyText(prompt);
    setCopied(ok);
    toast(ok ? "info" : "error", ok ? "Copiado: pégalo en Antigravity." : "No se pudo copiar.");
  };
  const validate = async (): Promise<void> => {
    setBusy("validate");
    try {
      const list = await useCurriculum.getState().validateAll(areaId);
      setDone((d) => [...d, ...list.filter((h) => h.status === "validated")]);
      const ok = list.filter((h) => h.status === "validated").length;
      toast(ok === list.length ? "info" : "error", ok === list.length ? `Todo validado (${ok} ${ok === 1 ? "tarea" : "tareas"}).` : `${ok} de ${list.length} validadas; el resto aún no está terminado o tiene problemas.`);
      refreshEverything();
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy("");
    }
  };
  const discard = async (): Promise<void> => {
    if (!window.confirm(`¿Descartar las ${queue.length} tareas pendientes de ${areaTitle}? No se borra ninguna carpeta de temas.`)) return;
    setBusy("discard");
    try {
      const n = await useCurriculum.getState().discard(areaId);
      setPrompt("");
      setDone([]);
      toast("info", `${n} ${n === 1 ? "tarea descartada" : "tareas descartadas"}.`);
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy("");
    }
  };

  if (!queue.length && !validatedTopics.length) {
    if (missing === 0) return null;
    return (
      <section className="rounded-2xl border border-accent bg-accent-soft/20 p-4" data-testid="curriculum-queue" data-state="empty" aria-label={`Crear los temas que faltan de ${areaTitle}`}>
        <h3 className="text-[16px] font-bold text-text">Crear los temas que faltan</h3>
        <p className="mb-3 mt-0.5 text-[13.5px] text-dim">Un clic y la app deja todo listo, en orden: tú solo copias <strong>una</strong> frase y la pegas en Antigravity.</p>
        <div className="flex flex-wrap gap-2">
          <PrimaryButton large onClick={() => void make("esencial")} disabled={busy !== "" || essentials === 0} data-testid="queue-essential">
            {busy === "make" ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Rocket size={15} aria-hidden />} Solo lo esencial ({essentials})
          </PrimaryButton>
          <GhostButton large="md" onClick={() => void make()} disabled={busy !== ""} data-testid="queue-all">Todo lo que falta ({missing})</GhostButton>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3 rounded-2xl border border-accent bg-accent-soft/20 p-4" data-testid="curriculum-queue" data-state="queue" aria-label={`Cola de ${areaTitle}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className="text-[16px] font-bold text-text">Cola de {areaTitle}</h3>
        <span className="text-[13.5px] text-dim" data-testid="queue-count">{validatedTopics.length} de {total} {total === 1 ? "tarea" : "tareas"} validadas · {topics} {topics === 1 ? "tema" : "temas"} por crear</span>
      </div>
      <ProgressBar pct={total ? (validatedTopics.length / total) * 100 : 0} label={`Tareas validadas de ${areaTitle}`} />

      {queue.length > 0 && (
        <ol className="space-y-2" aria-label="Pasos">
          <li className="flex flex-wrap items-center gap-2" data-testid="queue-step-copy">
            <span className="w-6 flex-none text-right font-bold text-accent-text">1</span>
            <PrimaryButton large onClick={() => void copy()} disabled={!prompt} data-testid="queue-copy">
              {copied ? <CheckCircle2 size={15} aria-hidden /> : <ClipboardCopy size={15} aria-hidden />} {copied ? "Copiado" : "Copiar instrucción para Antigravity"}
            </PrimaryButton>
            <span className="text-[13px] text-dim">Pégala una vez: el agente hace las {queue.length} tareas, una detrás de otra.</span>
          </li>
          <li className="flex flex-wrap items-center gap-2" data-testid="queue-step-validate">
            <span className="w-6 flex-none text-right font-bold text-accent-text">2</span>
            <GhostButton large onClick={() => void validate()} disabled={busy !== ""} data-testid="queue-validate">
              {busy === "validate" ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <CheckCircle2 size={15} aria-hidden />} Ya terminó — validar todo
            </GhostButton>
            <span className="text-[13px] text-dim">Cuando Antigravity avise que acabó (puedes validar antes: lo que falte queda marcado).</span>
          </li>
        </ol>
      )}

      {failed.length > 0 && (
        <details className="rounded-lg border border-line bg-card p-2 text-[13px]" data-testid="queue-failed">
          <summary className="cursor-pointer font-medium text-warn">{failed.length} {failed.length === 1 ? "tarea" : "tareas"} con algo por terminar</summary>
          <ul className="mt-1 space-y-1">
            {failed.slice(0, 8).map((h) => {
              const bad = h.entries.find((e) => e.problems.length);
              return <li key={h.id} className="break-words text-dim">{h.entries.length} temas · {bad ? `«${bad.title}»: ${bad.problems[0]}` : "pendiente"}</li>;
            })}
          </ul>
        </details>
      )}

      {folders.length > 0 && (
        <div className="space-y-1" data-testid="queue-step-plan">
          <p className="text-[13.5px] font-semibold text-text"><span className="mr-2 font-bold text-accent-text">3</span>{folders.length} temas validados, listos para tu plan</p>
          <AddToPlan folders={folders} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-2">
        {queue.length > 0 && (
          <details className="min-w-0 flex-1 text-[13px] text-dim">
            <summary className="cursor-pointer">Ver las {queue.length} tareas</summary>
            <ol className="mt-1 list-decimal space-y-0.5 pl-6">
              {queue.map((h) => <li key={h.id} className="break-all">{h.entries.length} temas · <code>{h.taskPath}</code></li>)}
            </ol>
          </details>
        )}
        {queue.length > 0 && (
          <GhostButton onClick={() => void discard()} disabled={busy !== ""} data-testid="queue-discard"><RotateCcw size={14} aria-hidden /> Empezar de nuevo</GhostButton>
        )}
      </div>
    </section>
  );
}
