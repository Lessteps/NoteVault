// Temas por crear — la tarea para el agente externo ya está escrita: ruta del archivo, frase corta para pegar (Copiar), «Abrir carpeta», el avance
// por tema (carpeta / nota / manifiesto / ejercicios / mapa, mirado cada 4 s) y «Ya terminó — validar» con el resultado de cada tema. La app NO crea
// nada: solo escribió el archivo de la tarea. Al validar o cerrar se recalcula la cobertura y se refrescan las áreas.

import { CheckCircle2, ClipboardCopy, FolderOpen, ListPlus, Loader2, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/bridge";
import { copyText } from "../../lib/clipboard";
import { useApp } from "../../store/app";
import { useCurriculum, type CurriculumHandoffState, type EntryProgressKey } from "../../store/curriculum";
import type { MentorAddTopicsResult, MentorPlanRow } from "../../lib/types";
import { useMentor } from "../../store/mentor";
import { openPlanAreaTopics } from "../mentor/planShared";
import { GhostButton, PrimaryButton } from "../common/forms";
import { useStudyVersion } from "./StudyPanel";

export const HANDOFF_POLL_MS = 4000;
const PIECES: Array<[EntryProgressKey, string]> = [
  ["folder", "carpeta"],
  ["note", "nota"],
  ["manifest", "manifiesto"],
  ["exercises", "ejercicios"],
  ["map", "mapa"],
];

/** Tras crear o validar, las áreas y la cobertura se leen de nuevo para que los temas nuevos aparezcan. */
export function refreshEverything(): void {
  void useCurriculum.getState().refresh();
  useStudyVersion.getState().bump();
  useMentor.setState((s) => ({ planVersion: s.planVersion + 1 }));
}

/** El mensaje para pegar en el agente cuando la validación encontró problemas: los pide corregir sin tocar nada más y volver a avisar. */
export function problemsMessage(h: Pick<CurriculumHandoffState, "taskAbs" | "taskPath" | "entries">): string {
  const bad = h.entries.filter((e) => e.state === "error" && e.problems.length);
  const list = bad.map((e) => `- ${e.folder}\n${e.problems.map((p) => `  * ${p}`).join("\n")}`).join("\n");
  return `The app validated your work from \`${h.taskAbs || h.taskPath}\` and found these problems. Fix ONLY these topics (edit only the files named in each problem, change nothing else, do not touch other folders), re-run the example checks if you change code, and tell me when you are done:\n${list}`;
}

/** Los planes donde se pueden añadir los temas: no archivados ni terminados (los propuestos se pueden refinar). */
export const selectablePlans = (rows: readonly MentorPlanRow[]): MentorPlanRow[] => rows.filter((p) => !p.archived && p.status !== "terminado");

/** Tras validar: lleva los temas nuevos al final de la ruta de su área del plan elegido (Frontend o Java) para que el Mentor los ejecute. */
export function AddToPlan({ folders }: { folders: string[] }) {
  const toast = useApp((s) => s.toast);
  const addToPlan = useCurriculum((s) => s.addToPlan);
  const [plans, setPlans] = useState<MentorPlanRow[]>([]);
  const [planId, setPlanId] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ planId: string; res: MentorAddTopicsResult } | null>(null);
  useEffect(() => {
    let live = true;
    Promise.resolve()
      .then(() => api.mentorPlanList())
      .then((rows) => {
        if (!live) return;
        const ok = selectablePlans(Array.isArray(rows) ? rows : []);
        setPlans(ok);
        setPlanId((cur) => cur || (ok.find((p) => p.status === "activo") ?? ok[0])?.id || "");
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  const chosen = plans.find((p) => p.id === planId);
  const run = async (): Promise<void> => {
    if (!chosen) return;
    setBusy(true);
    try {
      const res = await addToPlan(chosen.id, folders);
      setResult({ planId: chosen.id, res });
      toast("info", res.message);
      useMentor.setState((s) => ({ planVersion: s.planVersion + 1 }));
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!plans.length) return <p className="text-dim" data-testid="curriculum-add-noplan">No hay un plan activo del Mentor donde añadir estos temas: crea o reactiva un plan y vuelve aquí.</p>;
  const areaId = result?.res.addedTo?.[0];
  return (
    <div className="space-y-1.5 rounded-lg border border-line bg-panel p-2.5" data-testid="curriculum-add-to-plan">
      <p className="font-semibold">Llevar estos temas a tu plan</p>
      <p className="text-dim">Entran al final de la ruta de su área (HTML, CSS y JavaScript en Frontend; Java en Java). No se mueve ni se cambia ningún tema que ya tengas.</p>
      <div className="flex flex-wrap items-center gap-2">
        {plans.length > 1 && (
          <select className="rounded-lg border border-line bg-card px-2 py-1.5" value={planId} onChange={(e) => setPlanId(e.target.value)} aria-label="Plan" data-testid="curriculum-add-plan-select">
            {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        <PrimaryButton onClick={() => void run()} disabled={busy || !chosen} data-testid="curriculum-add-to-plan-btn">
          {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <ListPlus size={14} aria-hidden />} Añadir al plan «{chosen?.name ?? ""}»
        </PrimaryButton>
        {result && areaId && (
          <GhostButton onClick={() => openPlanAreaTopics(result.planId, areaId)} data-testid="curriculum-add-view-plan">Ver en el plan</GhostButton>
        )}
      </div>
      {result && (
        <p role="status" className="text-mint" data-testid="curriculum-add-result">
          {result.res.message}
          {result.res.skipped.length > 0 && ` (${result.res.skipped.length} omitidos: ya estaban o no se pudieron añadir)`}
        </p>
      )}
    </div>
  );
}

export function CurriculumHandoffPanel({ handoff, onUpdate, onClose }: { handoff: CurriculumHandoffState; onUpdate: (h: CurriculumHandoffState) => void; onClose: () => void }) {
  const toast = useApp((s) => s.toast);
  const status = useCurriculum((s) => s.status);
  const validate = useCurriculum((s) => s.validate);
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const open = handoff.status === "waiting" || handoff.status === "failed";
  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => {
      status(handoff.id).then((h) => alive.current && onUpdate(h)).catch(() => undefined);
    }, HANDOFF_POLL_MS);
    return () => clearInterval(t);
  }, [open, handoff.id, status, onUpdate]);

  const run = async (): Promise<void> => {
    setBusy(true);
    try {
      const h = await validate(handoff.id);
      if (alive.current) onUpdate(h);
      if (h.status === "validated") {
        toast("info", `Se validaron ${h.entries.length === 1 ? `«${h.entries[0]!.title}»` : `${h.entries.length} temas`}. Ya aparecen en tus áreas.`);
        refreshEverything();
      } else {
        toast("error", "Hay temas que no pasaron la validación: mira el detalle.");
      }
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  const copy = async (): Promise<void> => {
    await copyText(handoff.shortPrompt);
    toast("info", "Instrucción copiada: pégala en Antigravity.");
  };
  const copyProblems = async (): Promise<void> => {
    await copyText(problemsMessage(handoff));
    toast("info", "Mensaje de correcciones copiado: pégalo en Antigravity.");
  };
  const total = handoff.entries.length;
  const done = handoff.entries.filter((e) => e.state === "created").length;
  const has = (e: CurriculumHandoffState["entries"][number], key: EntryProgressKey): boolean => (key === "exercises" ? (e.progress?.exercises ?? 0) > 0 : Boolean(e.progress?.[key]));
  const found = (key: EntryProgressKey): number => handoff.entries.filter((e) => has(e, key)).length;
  // sin ejercicios en la tarea, esa pieza no se espera
  const pieces = handoff.withExercises === false ? PIECES.filter(([k]) => k !== "exercises") : PIECES;

  return (
    <section className="space-y-2.5 rounded-xl border border-accent bg-card p-3 text-[13.5px]" data-testid="curriculum-handoff-panel" data-status={handoff.status} aria-label="Tarea para el agente">
      <p className="font-semibold">
        {handoff.status === "validated"
          ? `Listo: se validaron ${done} de ${total} temas.`
          : `Tarea para el agente: crear ${total === 1 ? `«${handoff.entries[0]!.title}»` : `${total} temas`}${handoff.withExercises === false ? " (sin ejercicios: la app los genera después)" : ""}.`}
      </p>

      {open && (
        <>
          <ol className="list-decimal space-y-1 pl-5 text-dim">
            <li>Abre Antigravity en tu vault y pega esta instrucción.</li>
            <li>Cuando el agente diga que terminó, pulsa «Ya terminó — validar».</li>
          </ol>
          <div className="flex flex-wrap items-stretch gap-2">
            <code className="min-w-0 flex-1 basis-64 break-all rounded-lg border border-line bg-panel px-2.5 py-1.5 text-[12.5px]" data-testid="curriculum-handoff-prompt">{handoff.shortPrompt}</code>
            <GhostButton onClick={() => void copy()} data-testid="curriculum-handoff-copy"><ClipboardCopy size={14} aria-hidden /> Copiar</GhostButton>
            <GhostButton onClick={() => void api.revealPath(handoff.taskAbs || handoff.taskPath).catch((e: Error) => toast("error", e.message))} data-testid="curriculum-handoff-folder"><FolderOpen size={14} aria-hidden /> Abrir carpeta</GhostButton>
          </div>
          <p className="text-dim">
            La tarea está en <code>{handoff.taskPath}</code>. La app solo escribió ese archivo; las carpetas y notas las crea el agente.
          </p>
          <p role="status" className="text-dim" data-testid="curriculum-handoff-ready">
            {pieces.map(([k, label]) => `${label} ${found(k)}/${total}`).join(" · ")}
          </p>
        </>
      )}

      <ul className="space-y-1" data-testid="curriculum-handoff-entries">
        {handoff.entries.map((e) => (
          <li key={e.entryId} data-testid="curriculum-handoff-entry" data-state={e.state} className={e.state === "error" ? "text-warn" : e.state === "created" ? "text-mint" : "text-dim"}>
            <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
              {e.state === "created" ? <CheckCircle2 size={13} aria-hidden /> : e.state === "error" ? <XCircle size={13} aria-hidden /> : null}
              <strong>{e.title}</strong>
              <span>{e.state === "created" ? "validado" : e.state === "error" ? "no pasó la validación" : "pendiente"}</span>
              {open && e.state !== "created" && (
                <span className="text-[12px] text-faint" aria-label={`Avance de ${e.title}`}>
                  {pieces.map(([k, label]) => `${has(e, k) ? "✓" : "·"} ${label}`).join("  ")}
                </span>
              )}
            </span>
            {e.problems.length > 0 && (
              <ul className="mt-0.5 list-disc space-y-0.5 pl-6 text-[13px]">
                {e.problems.slice(0, 6).map((p) => <li key={p}>{p}</li>)}
                {e.problems.length > 6 && <li>y {e.problems.length - 6} más</li>}
              </ul>
            )}
          </li>
        ))}
      </ul>

      {done > 0 && <AddToPlan folders={handoff.entries.filter((e) => e.state === "created").map((e) => e.folder)} />}

      <div className="flex flex-wrap items-center gap-2">
        {open && (
          <PrimaryButton onClick={() => void run()} disabled={busy} data-testid="curriculum-handoff-validate">
            {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : null} Ya terminó — validar
          </PrimaryButton>
        )}
        {handoff.status === "failed" && handoff.entries.some((e) => e.state === "error") && (
          <GhostButton onClick={() => void copyProblems()} data-testid="curriculum-handoff-copy-problems"><ClipboardCopy size={14} aria-hidden /> Copiar problemas para el agente</GhostButton>
        )}
        <GhostButton
          onClick={() => {
            refreshEverything();
            onClose();
          }}
          disabled={busy}
          data-testid="curriculum-handoff-close"
        >
          {open ? "Ocultar" : "Cerrar"}
        </GhostButton>
      </div>
    </section>
  );
}
