// "Generar espacio de estudio": the AI proposes a subject's areas and topics, the user
// chooses which areas to build and which parts to generate (syllabus is always
// created; theory, practice plan and area maps are optional), and a background job
// writes them while the dialog shows its progress.

import { CheckCircle2, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { create } from "zustand";
import { api } from "../../lib/bridge";
import { useApp } from "../../store/app";
import { Field, GhostButton, input, Modal, PrimaryButton } from "../common/forms";
import { cn } from "../ui";

export const useStudySpaceDialog = create<{ open: boolean; setOpen: (v: boolean) => void }>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));

type Area = { name: string; topics: Array<{ name: string }> };
type Job = Awaited<ReturnType<typeof api.studySpaceStatus>>;

export function StudySpaceDialog() {
  const open = useStudySpaceDialog((s) => s.open);
  const setOpen = useStudySpaceDialog((s) => s.setOpen);
  const toast = useApp((s) => s.toast);

  const [subject, setSubject] = useState("");
  const [folder, setFolder] = useState("");
  const [scope, setScope] = useState("");
  const [objective, setObjective] = useState("");
  const [areas, setAreas] = useState<Area[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [steps, setSteps] = useState({ theory: true, practice: true, map: true });
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => () => {
    if (timer.current) window.clearInterval(timer.current);
  }, []);

  if (!open) return null;

  const close = () => {
    if (job && !job.done) return;
    setOpen(false);
    setJob(null);
    setAreas(null);
  };

  const propose = async () => {
    if (!subject.trim()) return;
    setBusy(true);
    try {
      const res = await api.studySpacePropose(subject.trim(), scope, objective);
      setAreas(res.areas);
      setPicked(new Set(res.areas.map((a) => a.name)));
      if (!folder.trim()) setFolder(subject.trim());
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const generate = async () => {
    if (!areas || !folder.trim()) return;
    const chosen = areas.filter((a) => picked.has(a.name));
    if (!chosen.length) return;
    setBusy(true);
    try {
      const { jobId } = await api.studySpaceGenerate({ folder: folder.trim(), subject: subject.trim(), areas: chosen, steps });
      timer.current = window.setInterval(async () => {
        try {
          const st = await api.studySpaceStatus(jobId);
          setJob(st);
          if (st.done) {
            if (timer.current) window.clearInterval(timer.current);
            useApp.getState().refreshTree();
            setBusy(false);
          }
        } catch {
          if (timer.current) window.clearInterval(timer.current);
          setBusy(false);
        }
      }, 2000);
    } catch (e) {
      toast("error", (e as Error).message);
      setBusy(false);
    }
  };

  const total = areas?.filter((a) => picked.has(a.name)).reduce((n, a) => n + a.topics.length, 0) ?? 0;

  return (
    <Modal
      title="Generar espacio de estudio"
      onClose={close}
      width={640}
      footer={
        job ? (
          <PrimaryButton onClick={close} disabled={!job.done}>{job.done ? "Cerrar" : "Generando…"}</PrimaryButton>
        ) : areas ? (
          <>
            <GhostButton onClick={() => setAreas(null)}>Cambiar propuesta</GhostButton>
            <span className="flex-1" />
            <PrimaryButton onClick={() => void generate()} disabled={busy || !picked.size || !folder.trim()}>
              {busy && <Loader2 size={13} className="animate-spin" />} Generar {picked.size} área(s)
            </PrimaryButton>
          </>
        ) : (
          <>
            <span className="flex-1" />
            <PrimaryButton onClick={() => void propose()} disabled={busy || !subject.trim()}>
              {busy && <Loader2 size={13} className="animate-spin" />} Proponer temario
            </PrimaryButton>
          </>
        )
      }
    >
      {job ? (
        <>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-panel">
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${Math.round((100 * job.finished) / Math.max(1, job.total))}%` }} />
          </div>
          <p className="text-[11.5px] text-dim">{job.finished} de {job.total} pasos · carpeta «{job.folder}»</p>
          <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg border border-line bg-surface p-3 font-mono text-[11px] leading-relaxed text-dim">
            {job.log.join("\n")}
          </pre>
          {job.done && !job.error && (
            <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-mint"><CheckCircle2 size={14} /> Espacio creado. Ya está en el explorador.</p>
          )}
        </>
      ) : !areas ? (
        <>
          <p className="text-[12px] leading-relaxed text-dim">
            La IA propone las áreas y los temas; después eliges qué crear. Nada se escribe hasta que pulses «Generar».
          </p>
          <Field label="Materia o área principal">
            <input className={input} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Matemáticas, JavaScript, Cálculo diferencial…" autoFocus />
          </Field>
          <Field label="Alcance (opcional)">
            <input className={input} value={scope} onChange={(e) => setScope(e.target.value)} placeholder="Solo el área de Aritmética elemental…" />
          </Field>
          <Field label="Objetivo (opcional)">
            <input className={input} value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="Qué quieres lograr al estudiarlo" />
          </Field>
        </>
      ) : (
        <>
          <Field label="Carpeta del espacio">
            <input className={input} value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="Matemáticas 1" />
          </Field>
          <div>
            <span className="mb-1 block font-mono text-[10.5px] uppercase tracking-wider text-faint">Áreas a generar</span>
            <div className="flex flex-col gap-1.5">
              {areas.map((a) => (
                <label key={a.name} className={cn("flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2", picked.has(a.name) ? "border-accent bg-accent-soft/40" : "border-line")}>
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={picked.has(a.name)}
                    onChange={(e) =>
                      setPicked((p) => {
                        const next = new Set(p);
                        if (e.target.checked) next.add(a.name);
                        else next.delete(a.name);
                        return next;
                      })
                    }
                  />
                  <span className="min-w-0">
                    <span className="block text-[12.5px] font-semibold text-text">{a.name} <span className="font-normal text-faint">· {a.topics.length} temas</span></span>
                    <span className="block truncate text-[11px] text-faint">{a.topics.map((t) => t.name).join(" · ")}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <span className="mb-1 block font-mono text-[10.5px] uppercase tracking-wider text-faint">Qué generar de cada tema ({total} temas)</span>
            <div className="flex flex-col gap-1 text-[12.5px] text-text">
              <label className="flex items-center gap-2 text-dim"><input type="checkbox" checked disabled /> Temario: carpetas, vistas de resumen y de práctica</label>
              {([["map", "Mapa (canvas) de cada área"], ["theory", "Teoría de cada tema (la escribe la IA, tarda)"], ["practice", "Plan de práctica de cada tema (competencias y cantidades)"]] as const).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2">
                  <input type="checkbox" checked={steps[key]} onChange={(e) => setSteps((s) => ({ ...s, [key]: e.target.checked }))} /> {label}
                </label>
              ))}
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}
