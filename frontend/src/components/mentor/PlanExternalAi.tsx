// Mentor — «Crear el plan con otra IA»: sin clave de API ni modelo local. La app escribe en la vault el mismo pedido que le haría a su IA (reglas del Mentor,
// precondiciones fijas, catálogo real de temas); Antigravity (o un chat) lo lee y escribe el plan; la app lo valida y lo crea como «propuesto».

import { ClipboardCopy, FileText, Loader2, Sparkles } from "lucide-react";
import { useState } from "react";
import { api } from "../../lib/bridge";
import { copyText } from "../../lib/clipboard";
import type { PlanPreconditions } from "../../lib/planTime";
import { useApp } from "../../store/app";
import { useMentor } from "../../store/mentor";
import { GhostButton, PrimaryButton } from "../common/forms";
import { coldRetryDelay } from "./planShared";

const COLD_RETRY_MAX = 40;

interface Made {
  rel: string;
  answerRel: string;
  shortPrompt: string;
  chatPrompt: string;
  topics: number;
}

export function PlanExternalAi({ pre, disabled, onCreated }: { pre: PlanPreconditions; disabled: boolean; onCreated: (planId: string) => void }) {
  const toast = useApp((s) => s.toast);
  const [busy, setBusy] = useState<"" | "make" | "accept">("");
  const [made, setMade] = useState<Made | null>(null);
  const [pasted, setPasted] = useState("");

  const waitCold = async <T extends { loading: boolean }>(fn: () => Promise<T>): Promise<Exclude<T, { loading: true }>> => {
    let r = await fn();
    for (let i = 0; r.loading && i < COLD_RETRY_MAX; i++) {
      await new Promise((ok) => setTimeout(ok, coldRetryDelay(i)));
      r = await fn();
    }
    if (r.loading) throw new Error("El índice de la vault tarda demasiado en estar listo. Inténtalo de nuevo en un momento.");
    return r as Exclude<T, { loading: true }>;
  };

  const make = async (): Promise<void> => {
    setBusy("make");
    try {
      const r = await waitCold(() => api.mentorPlanExternalPrompt(pre));
      setMade({ rel: r.rel, answerRel: r.answerRel, shortPrompt: r.shortPrompt, chatPrompt: r.chatPrompt, topics: r.topics });
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy("");
    }
  };
  const copy = async (text: string, ok: string): Promise<void> => {
    const done = await copyText(text);
    toast(done ? "info" : "error", done ? ok : "No se pudo copiar.");
  };
  const accept = async (from: { reply?: string; answerRel?: string }): Promise<void> => {
    setBusy("accept");
    try {
      const r = await waitCold(() => api.mentorPlanExternalAccept(pre, from));
      useMentor.setState((st) => ({ planVersion: st.planVersion + 1 }));
      void useMentor.getState().loadChat();
      toast("info", "Plan propuesto creado con la respuesta de la otra IA. Revísalo y mantenlo o bórralo.");
      onCreated(r.planId);
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy("");
    }
  };

  return (
    <section className="space-y-3 rounded-xl border border-line bg-surface p-3" aria-label="Crear el plan con otra IA" data-testid="plan-external-ai">
      <div>
        <h3 className="text-[15px] font-semibold">Crear el plan con otra IA (Antigravity, un chat)</h3>
        <p className="mt-0.5 text-[14px] text-dim">
          <strong>No necesita clave de API ni modelo local.</strong> La app escribe un archivo con tus precondiciones y los temas reales de tu vault; la otra IA lo lee, diseña el plan y lo escribe al lado; tú lo traes de vuelta y la app lo valida (solo temas que existen, fechas y tiempos intactos).
        </p>
      </div>
      <PrimaryButton large onClick={() => void make()} disabled={disabled || busy !== ""} data-testid="external-make">
        {busy === "make" ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <FileText size={15} aria-hidden />} 1. Generar el archivo y la instrucción
      </PrimaryButton>
      {made && (
        <div className="space-y-2 rounded-lg border border-line bg-card p-3 text-[13.5px]" data-testid="external-made">
          <p>
            Listo: <code className="break-all">{made.rel}</code> ({made.topics} temas del catálogo). La IA escribirá el plan en <code className="break-all">{made.answerRel}</code>.
          </p>
          <div className="flex flex-wrap gap-2">
            <GhostButton large="md" onClick={() => void copy(made.shortPrompt, "Copiado: pégalo en Antigravity (conversación nueva).")} data-testid="external-copy-short">
              <ClipboardCopy size={15} aria-hidden /> 2. Copiar la instrucción para Antigravity
            </GhostButton>
            <GhostButton large="md" onClick={() => void copy(made.chatPrompt, "Copiado el pedido completo: pégalo en un chat que no lee archivos.")} data-testid="external-copy-chat">
              <ClipboardCopy size={15} aria-hidden /> O copiar el pedido completo (chat web)
            </GhostButton>
          </div>
          <PrimaryButton large onClick={() => void accept({ answerRel: made.answerRel })} disabled={busy !== ""} data-testid="external-read-file">
            {busy === "accept" ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Sparkles size={15} aria-hidden />} 3. La IA ya terminó: crear el plan desde su archivo
          </PrimaryButton>
        </div>
      )}
      <div className="space-y-1.5">
        <label className="block text-[13.5px] font-medium">
          ¿Prefieres pegar su respuesta? (el bloque json que te dio en el chat)
          <textarea value={pasted} onChange={(e) => setPasted(e.target.value)} rows={4} className="mt-1 w-full rounded-lg border border-line bg-card p-2 text-[13.5px] text-text" data-testid="external-paste" />
        </label>
        <GhostButton large="md" onClick={() => void accept({ reply: pasted })} disabled={disabled || busy !== "" || !pasted.trim()} data-testid="external-accept-paste">
          Crear el plan con lo pegado
        </GhostButton>
      </div>
    </section>
  );
}
