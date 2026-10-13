// Mentor — «Mi plan»: PLAN PARA ANTIGRAVITY. Esquematiza lo que falta crear (teoría, mapas y ejercicios) en planes pequeños y ordenados y deja
// generarlos poco a poco: cada plan es un documento (en inglés, con la lista exacta de temas y celdas) que se le pasa a otra IA.
//
// El reparto es determinista (a partir del informe de ejecución); la IA, si se activa, solo ordena y pone nombre a los planes. Solo escribe el
// documento del plan que se pide, en `<materia>/_handoff/`; no toca notas ni ejercicios.

import { ClipboardCopy, FileText, ListOrdered, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../lib/bridge";
import { copyText } from "../../lib/clipboard";
import { MAX_FILES_CHOICES, promptFor } from "../../lib/handoffPlan";
import type { MentorHandoffScheme } from "../../lib/types";
import { useApp } from "../../store/app";
import { Chip, GhostButton, PrimaryButton } from "../common/forms";
import { ThinkingStatus } from "./parts";
import { SectionHeading } from "./planKit";

const COLD_RETRY_MS = 1500;
const COLD_RETRY_MAX = 40;
const KIND_LABEL = { theory: "Teoría y mapas", exercises: "Ejercicios" } as const;

export function HandoffPanel({ planId, aiConfigured }: { planId: string; aiConfigured: boolean }) {
  const toast = useApp((s) => s.toast);
  const [scheme, setScheme] = useState<MentorHandoffScheme | null>(null);
  const [perCell, setPerCell] = useState(3);
  const [maxFiles, setMaxFiles] = useState<number>(150);
  const [ladder, setLadder] = useState(false);
  const [useAi, setUseAi] = useState(aiConfigured);
  const [busy, setBusy] = useState(false);
  const [writing, setWriting] = useState<string>("");
  const [note, setNote] = useState("");
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => setUseAi(aiConfigured), [aiConfigured]);

  useEffect(() => {
    void api.mentorHandoffGet(planId).then((r) => {
      if (!alive.current || !r?.scheme) return;
      setScheme(r.scheme);
      setPerCell(r.scheme.options.perCell);
      setMaxFiles(r.scheme.options.maxFiles);
      setLadder(r.scheme.options.ladder);
    }).catch(() => undefined);
  }, [planId]);

  const build = useCallback(async () => {
    setBusy(true);
    setNote("");
    try {
      const body = { perCell, maxFiles, ladder, ai: useAi };
      let r = await api.mentorHandoffScheme(planId, body);
      for (let i = 0; r.loading && i < COLD_RETRY_MAX; i++) {
        await new Promise((ok) => setTimeout(ok, COLD_RETRY_MS));
        r = await api.mentorHandoffScheme(planId, body);
      }
      if (r.loading) throw new Error("El índice de la vault tarda demasiado en estar listo. Inténtalo de nuevo en un momento.");
      if (alive.current) {
        setScheme(r.scheme);
        setNote(r.scheme?.note ?? (r.scheme ? `Esquema listo: ${r.scheme.totals.packages} ${r.scheme.totals.packages === 1 ? "plan" : "planes"}.` : ""));
      }
    } catch (e) {
      if (alive.current) setNote((e as Error).message);
    } finally {
      if (alive.current) setBusy(false);
    }
  }, [planId, perCell, maxFiles, ladder, useAi]);

  const write = async (id: string): Promise<void> => {
    setWriting(id);
    try {
      const r = await api.mentorHandoffWrite(planId, id);
      setScheme(r.scheme);
      await copyText(r.prompt);
      toast("info", "Plan escrito y la instrucción para Antigravity copiada al portapapeles.");
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setWriting("");
    }
  };
  const writeAll = async (): Promise<void> => {
    for (const p of scheme?.packages.filter((x) => !x.written) ?? []) {
      // eslint-disable-next-line no-await-in-loop
      await write(p.id);
    }
  };

  const pending = scheme?.packages.filter((p) => !p.written) ?? [];
  const select = "min-h-10 rounded-lg border border-line bg-panel px-2.5 text-[14px] text-text";
  return (
    <section aria-labelledby="ho-h" data-testid="handoff-panel" className="min-w-0 rounded-2xl border border-line bg-card p-4 @3xl:p-5">
      <SectionHeading id="ho-h" hint="Lo que falta por crear puede ser enorme. Aquí se reparte en planes pequeños y ordenados (una sesión de trabajo cada uno) y los generas poco a poco, cuando quieras.">
        Plan para Antigravity
      </SectionHeading>

      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <label className="text-[14px]">
          <span className="block text-dim">Ejercicios por skill y dificultad</span>
          <select value={perCell} onChange={(e) => setPerCell(Number(e.target.value))} className={select} data-testid="handoff-percell">
            <option value={1}>1 (lo mínimo que pide la cobertura)</option>
            <option value={3}>3 (una sesión de práctica real)</option>
            <option value={5}>5</option>
          </select>
        </label>
        <label className="text-[14px]">
          <span className="block text-dim">Archivos por plan</span>
          <select value={maxFiles} onChange={(e) => setMaxFiles(Number(e.target.value))} className={select} data-testid="handoff-maxfiles">
            {MAX_FILES_CHOICES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label className="flex min-h-10 items-center gap-2 text-[14px]">
          <input type="checkbox" checked={ladder} onChange={(e) => setLadder(e.target.checked)} data-testid="handoff-ladder" /> Incluir la escalera de dificultad (2 y 3)
        </label>
        <label className="flex min-h-10 items-center gap-2 text-[14px]" title={aiConfigured ? "" : "La IA no está configurada"}>
          <input type="checkbox" checked={useAi && aiConfigured} disabled={!aiConfigured} onChange={(e) => setUseAi(e.target.checked)} data-testid="handoff-ai" />
          <Sparkles size={14} aria-hidden /> La IA ordena y nombra los planes
        </label>
        <PrimaryButton large onClick={() => void build()} disabled={busy} data-testid="handoff-build">
          <ListOrdered size={16} aria-hidden /> {scheme ? "Volver a esquematizar" : "Esquematizar lo que falta"}
        </PrimaryButton>
      </div>

      {busy && <div className="mt-3"><ThinkingStatus label={useAi && aiConfigured ? "Repartiendo lo que falta y pidiéndole a la IA el orden…" : "Repartiendo lo que falta en planes…"} elapsed={0} /></div>}
      {note && !busy && <p role="status" className="mt-3 rounded-lg border border-line bg-surface px-3 py-2 text-[14px]" data-testid="handoff-note">{note}</p>}

      {scheme && scheme.packages.length > 0 && (
        <div className="mt-4" data-testid="handoff-list">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[14.5px]">
            <strong>{scheme.totals.packages} {scheme.totals.packages === 1 ? "plan" : "planes"}</strong>
            <span className="text-dim">{scheme.totals.files} archivos · {scheme.totals.topics} temas</span>
            <Chip large colour={scheme.source === "ai" ? "var(--nv-accent)" : "var(--nv-faint)"}>{scheme.source === "ai" ? "Ordenado por la IA" : "Orden por reglas"}</Chip>
            {pending.length > 0 && <GhostButton onClick={() => void writeAll()} disabled={!!writing} data-testid="handoff-all">Generar los {pending.length} pendientes</GhostButton>}
          </p>
          <ol className="mt-3 space-y-2">
            {scheme.packages.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line bg-surface px-3.5 py-2.5" data-testid="handoff-package" data-state={p.written ? "written" : "pending"}>
                <span aria-hidden className="grid h-7 w-7 flex-none place-items-center rounded-md bg-hover text-[13px] font-semibold">{p.order}</span>
                <div className="min-w-0 flex-1 basis-72">
                  <p className="flex flex-wrap items-center gap-2 text-[15px] font-semibold">
                    {p.title} <Chip>{KIND_LABEL[p.kind]}</Chip>
                  </p>
                  <p className="text-[13.5px] text-dim">{p.files} archivos · {p.topics.length} {p.topics.length === 1 ? "tema" : "temas"} · semanas {p.weeks[0]}–{p.weeks[1]}{p.why ? ` · ${p.why}` : ""}</p>
                  {p.written && <p className="break-all text-[12.5px] text-faint" data-testid="handoff-path">{p.written.path}</p>}
                </div>
                {p.written && (
                  <GhostButton onClick={() => void copyText(promptFor(p.written!.path)).then(() => toast("info", "Instrucción copiada."))} aria-label={`Copiar la instrucción del plan ${p.order}`}>
                    <ClipboardCopy size={14} aria-hidden /> Copiar instrucción
                  </GhostButton>
                )}
                <PrimaryButton onClick={() => void write(p.id)} disabled={writing === p.id} data-testid="handoff-write">
                  <FileText size={14} aria-hidden /> {p.written ? "Volver a generar" : "Generar este plan"}
                </PrimaryButton>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
