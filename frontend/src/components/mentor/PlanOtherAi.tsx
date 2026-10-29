// Mentor — «Preguntar y ajustar» con OTRA IA, sin la app abierta: genera el dosier del plan para Antigravity (una frase para pegar) y, cuando la IA responde con
// cambios en un bloque json, los lee, los valida y los aplica con el mismo camino de siempre (historial y «Deshacer»). La IA da la lógica; la app la aplica y la muestra.

import { ClipboardCopy, FileText, Loader2 } from "lucide-react";
import { useState } from "react";
import { api } from "../../lib/bridge";
import { copyText } from "../../lib/clipboard";
import { parseOpsReply } from "../../lib/planDossier";
import type { MentorPlan } from "../../lib/types";
import { useApp } from "../../store/app";
import { useMentor } from "../../store/mentor";
import { GhostButton, PrimaryButton } from "../common/forms";

export function PlanOtherAi({ planId, question, onApplied }: { planId: string; question: string; onApplied: (plan: MentorPlan, changed: string[]) => void }) {
  const toast = useApp((s) => s.toast);
  const [busy, setBusy] = useState<"" | "dossier" | "apply">("");
  const [made, setMade] = useState<{ rel: string; answerRel: string; shortPrompt: string; topics: number } | null>(null);
  const [pasted, setPasted] = useState("");
  const parsed = pasted.trim() ? parseOpsReply(pasted) : null;

  const makeDossier = async (): Promise<void> => {
    setBusy("dossier");
    try {
      setMade(await api.mentorPlanDossier({ id: planId, question }));
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy("");
    }
  };
  const copy = async (): Promise<void> => {
    if (!made) return;
    const ok = await copyText(made.shortPrompt);
    toast(ok ? "info" : "error", ok ? "Copiado: pégalo en Antigravity (conversación nueva)." : "No se pudo copiar.");
  };
  const apply = async (): Promise<void> => {
    if (!parsed?.ops.length) return;
    setBusy("apply");
    try {
      const body = { id: planId, ops: parsed.ops, label: "Cambios propuestos por otra IA" };
      let r = await api.mentorPlanChange(body);
      for (let i = 0; r.loading && i < 40; i++) {
        await new Promise((ok) => setTimeout(ok, 1500));
        r = await api.mentorPlanChange(body);
      }
      if (r.loading) throw new Error("El índice de la vault tarda demasiado en estar listo. Inténtalo de nuevo en un momento.");
      if (!r.applied) toast("info", "Esos cambios no modifican nada del plan.");
      else {
        toast("info", `Cambios aplicados: ${r.entry.summary || "plan actualizado"}. Puedes deshacerlos en el historial.${parsed.discarded.length ? ` (Se descartaron ${parsed.discarded.length} no válidos.)` : ""}`);
        useMentor.setState((st) => ({ planVersion: st.planVersion + 1 }));
        onApplied(r.plan, r.entry.changed);
        setPasted("");
      }
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy("");
    }
  };

  return (
    <section className="mt-5 space-y-3 rounded-xl border border-line p-4" aria-label="Preguntar con otra IA" data-testid="plan-other-ai">
      <div>
        <h3 className="text-[16px] font-semibold">Preguntar con otra IA (Antigravity, un chat)</h3>
        <p className="mt-0.5 text-[14px] text-dim">Genera un archivo con TODO el plan —áreas, temas por semana, proyectos y su avance, cambios recientes— y tu pregunta. La IA lo lee y responde <strong>sin que la app esté abierta</strong>. Usa el cuadro de arriba para escribir la pregunta (puede ir vacía: pedirá una evaluación del plan).</p>
      </div>
      <PrimaryButton large onClick={() => void makeDossier()} disabled={busy !== ""} data-testid="dossier-make">
        {busy === "dossier" ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <FileText size={15} aria-hidden />} Generar el archivo para Antigravity
      </PrimaryButton>
      {made && (
        <div className="space-y-2 rounded-lg border border-line bg-surface p-3 text-[13.5px]" data-testid="dossier-made">
          <p>Listo: <code className="break-all">{made.rel}</code> ({made.topics} temas). La IA escribirá su respuesta en <code className="break-all">{made.answerRel}</code>.</p>
          <GhostButton large="md" onClick={() => void copy()} data-testid="dossier-copy"><ClipboardCopy size={15} aria-hidden /> Copiar la instrucción para Antigravity</GhostButton>
        </div>
      )}
      <div className="space-y-1.5">
        <label className="block text-[13.5px] font-medium">¿La IA propuso cambios? Pega aquí su respuesta
          <textarea value={pasted} onChange={(e) => setPasted(e.target.value)} rows={4} className="mt-1 w-full rounded-lg border border-line bg-card p-2 text-[13.5px] text-text" data-testid="dossier-paste" />
        </label>
        {pasted.trim() && (
          <p className="text-[13px] text-dim" data-testid="dossier-parsed">{parsed ? (parsed.ops.length ? `Cambios válidos encontrados: ${parsed.ops.map((o) => String(o.op)).join(", ")}${parsed.discarded.length ? ` · descartados: ${parsed.discarded.join(", ")}` : ""}.` : "El bloque no trae ninguna operación válida.") : "No encuentro un bloque json con «ops» en esa respuesta."}</p>
        )}
        <GhostButton large="md" onClick={() => void apply()} disabled={busy !== "" || !parsed?.ops.length} data-testid="dossier-apply">Aplicar los cambios de esa respuesta</GhostButton>
      </div>
    </section>
  );
}
