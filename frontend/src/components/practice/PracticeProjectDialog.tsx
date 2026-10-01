// `programming_practice`: the weekly project pipeline in one dialog — build (specification), construct (the folder),
// defend (review + oral defence) and postmortem (the profile the next build reads). Opened from the assistant panel, and
// only offered when the open note lives in the programming_practice area. Every exchange with the model is also written
// to a chat conversation, so it can be read.

import { CheckCircle2, CircleDot, FolderPlus, Hammer, Loader2, ShieldCheck, Swords, Target } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { create } from "zustand";
import { api } from "../../lib/bridge";
import type { PpDefense, PpEstimate, PpGrade, PpIdea, PpProject, PpStatus } from "../../lib/types";
import { useApp } from "../../store/app";
import { useAssistant } from "../../store/assistant";
import { Field, GhostButton, input, Modal, PrimaryButton } from "../common/forms";
import { cn } from "../ui";

export const usePracticeDialog = create<{ open: boolean; show: () => void; close: () => void }>((set) => ({
  open: false,
  show: () => set({ open: true }),
  close: () => set({ open: false }),
}));

/** The practice tools belong to the programming_practice folder only. */
export const isPracticePath = (path: string | null | undefined): boolean => /(^|[\\/])programming_practice([\\/]|$)/i.test(path ?? "");

const FOCUSES = ["backend", "databases", "frontend", "desktop", "mobile", "automation"];
const STATE_LABEL: Record<PpProject["state"], string> = { spec: "Especificado", building: "En construcción", defended: "Defendido", done: "Cerrado" };

const LAYER_LABEL: Record<string, string> = { database: "Base de datos", backend: "Backend", client: "Cliente" };
const SEVERITY: Record<string, string> = { high: "text-danger", medium: "text-warn", low: "text-faint" };

function showChat(conversationId: string): void {
  const a = useAssistant.getState();
  a.setOpen(true);
  void a.openConversation(conversationId);
}

export function PracticeProjectDialog() {
  const open = usePracticeDialog((s) => s.open);
  const close = usePracticeDialog((s) => s.close);
  const toast = useApp((s) => s.toast);
  const openNote = useApp((s) => s.openNote);

  const [status, setStatus] = useState<PpStatus | null>(null);
  const [busy, setBusy] = useState("");
  const [focus, setFocus] = useState("");
  const [notes, setNotes] = useState("");
  const [weeks, setWeeks] = useState(4);
  const [ideas, setIdeas] = useState<PpIdea[]>([]);
  const [plan, setPlan] = useState<Array<PpIdea & { week: number }>>([]);
  const [defending, setDefending] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStatus(await api.ppStatus());
    } catch (e) {
      toast("error", (e as Error).message);
    }
  }, [toast]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  if (!open) return null;

  /** Runs one action with a busy label and a toast on failure. */
  const run = async <T,>(label: string, fn: () => Promise<T>, after?: (v: T) => void): Promise<void> => {
    setBusy(label);
    try {
      const v = await fn();
      after?.(v);
      await refresh();
      useApp.getState().refreshTree();
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy("");
    }
  };

  const specify = (idea: Partial<PpIdea>, week?: number) =>
    run(`build:${idea.title}`, () => api.ppBuild({ idea, focus: idea.focus, client: idea.client, notes: idea.title ? "" : notes, week }), (r) => {
      toast("info", `Especificación creada: ${r.folder}`);
      showChat(r.conversationId);
      void openNote(r.rel);
    });

  return (
    <Modal
      title="Práctica de programación"
      width={760}
      onClose={close}
      footer={
        <>
          <GhostButton
            onClick={() => {
              close();
              void openNote(`${status?.space}/programming_practice/kata/kata.practica.md`);
            }}
            title="Abre la vista de práctica del reto diario"
          >
            <Target size={13} /> Reto de lógica de hoy
          </GhostButton>
          <GhostButton
            onClick={() => void run("kata-pm", () => api.ppKataPostmortem(), (r) => { toast("info", "Postmortem de los retos guardado en tu perfil."); showChat(r.conversationId); })}
            title="Busca el patrón detrás de los retos que has fallado"
          >
            {busy === "kata-pm" && <Loader2 size={13} className="animate-spin" />} Postmortem de retos
          </GhostButton>
          <span className="flex-1" />
          <GhostButton onClick={close}>Cerrar</GhostButton>
        </>
      }
    >
      {!status ? (
        <p className="text-[12px] text-faint">Cargando…</p>
      ) : !status.space ? (
        <p className="text-[12.5px] text-warn">No hay un espacio de Programación en esta bóveda.</p>
      ) : !status.ready ? (
        <div className="space-y-2">
          <p className="text-[12.5px] leading-relaxed text-dim">
            El área <b>programming_practice</b> todavía no existe. Se crea con sus skills (editables), el reto diario y la carpeta de proyectos.
            No toca nada de lo que ya tienes.
          </p>
          <PrimaryButton onClick={() => void run("init", () => api.ppInit(), () => toast("info", "Área creada."))}>
            {busy === "init" ? <Loader2 size={13} className="animate-spin" /> : <FolderPlus size={13} />} Crear el área
          </PrimaryButton>
        </div>
      ) : defending ? (
        <DefendPanel folder={defending} onBack={() => { setDefending(null); void refresh(); }} />
      ) : (
        <>
          <section className="rounded-xl border border-line px-3 py-2.5">
            <span className="font-mono text-[10.5px] uppercase tracking-wider text-faint">Tu perfil</span>
            {status.weaknesses.length ? (
              <>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {status.weaknesses.map((w) => (
                    <span key={w.label} title={`${w.count}× · ${w.status}`} className="rounded-md border border-line bg-elevated px-1.5 py-0.5 text-[11px] text-dim">
                      <b className="text-faint">{w.layer}</b> {w.label}
                    </span>
                  ))}
                </div>
                {status.suggestedFocus && <p className="mt-1.5 text-[11.5px] text-dim">El próximo proyecto apuntará a <b className="text-text">{status.suggestedFocus}</b>.</p>}
              </>
            ) : (
              <p className="mt-1 text-[12px] text-faint">Aún sin historial: tras el primer postmortem, cada proyecto se adaptará a tus puntos débiles.</p>
            )}
          </section>

          <section className="space-y-2">
            <span className="font-mono text-[10.5px] uppercase tracking-wider text-faint">1 · Especificar (pp_build)</span>
            <p className="text-[11.5px] leading-relaxed text-faint">
              Todo proyecto lleva base de datos, backend y cliente; la automatización es un extra. La especificación se valida: si falta una capa, la IA la rehace.
            </p>
            <div className="grid grid-cols-[150px_1fr] gap-2">
              <Field label="Foco">
                <select className={input} value={focus} onChange={(e) => setFocus(e.target.value)}>
                  <option value="">Automático{status.suggestedFocus ? ` (${status.suggestedFocus})` : ""}</option>
                  {FOCUSES.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </Field>
              <Field label="Qué quieres (opcional)">
                <input className={input} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Una herramienta para…" />
              </Field>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <PrimaryButton onClick={() => void run("ideas", () => api.ppIdeas({ focus, notes }), (r) => { setIdeas(r.ideas); showChat(r.conversationId); })} disabled={!!busy}>
                {busy === "ideas" ? <Loader2 size={13} className="animate-spin" /> : <Hammer size={13} />} Proponer ideas
              </PrimaryButton>
              {notes.trim() && (
                <GhostButton onClick={() => void specify({ title: "", problem: "", focus: focus || undefined })}>Especificar lo que escribí</GhostButton>
              )}
              <span className="flex-1" />
              <input type="number" min={1} max={12} className={cn(input, "!w-16")} value={weeks} onChange={(e) => setWeeks(Number(e.target.value) || 1)} aria-label="Semanas" />
              <GhostButton onClick={() => void run("plan", () => api.ppPlan({ weeks, notes }), (r) => { setPlan(r.plan); showChat(r.conversationId); toast("info", `Plan guardado en ${r.rel}`); })}>
                {busy === "plan" && <Loader2 size={13} className="animate-spin" />} Planear semanas
              </GhostButton>
            </div>
            {[...ideas.map((i) => ({ ...i, week: 0 })), ...plan].map((i) => (
              <div key={`${i.week}:${i.title}`} className="rounded-lg border border-line px-3 py-2">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="block text-[12.5px] font-semibold text-text">{i.week ? `Semana ${i.week} · ` : ""}{i.title}</span>
                    <span className="block text-[11.5px] text-dim">{i.problem}</span>
                    <span className="block font-mono text-[10.5px] text-faint">{i.focus} · {i.client} · {i.hours} h</span>
                  </div>
                  <PrimaryButton onClick={() => void specify(i, i.week || undefined)} disabled={!!busy}>
                    {busy === `build:${i.title}` && <Loader2 size={13} className="animate-spin" />} Especificar
                  </PrimaryButton>
                </div>
              </div>
            ))}
          </section>

          <section className="space-y-2">
            <span className="font-mono text-[10.5px] uppercase tracking-wider text-faint">Proyectos</span>
            {status.projects.length === 0 && <p className="text-[12px] text-faint">Ninguno todavía.</p>}
            {status.projects.map((p) => (
              <div key={p.folder} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2">
                {p.state === "done" ? <CheckCircle2 size={14} className="flex-none text-mint" /> : <CircleDot size={14} className="flex-none text-faint" />}
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-semibold text-text">{p.title}</span>
                  <span className="block font-mono text-[10.5px] text-faint">{STATE_LABEL[p.state]} · {p.focus} · {p.client}{p.score !== undefined ? ` · ${p.score}/100` : ""}</span>
                </div>
                {p.state === "spec" ? (
                  <>
                    <GhostButton onClick={() => void openNote(`${status.space}/programming_practice/projects/_specs/${p.folder}.md`)}>Ver</GhostButton>
                    <PrimaryButton onClick={() => void run(`construct:${p.folder}`, () => api.ppConstruct(p.folder), (r) => { toast("info", `Carpeta creada: ${r.rel}`); void openNote(`${r.rel}/SPEC.md`); })} disabled={!!busy}>
                      {busy === `construct:${p.folder}` ? <Loader2 size={13} className="animate-spin" /> : <Hammer size={13} />} Construir
                    </PrimaryButton>
                  </>
                ) : (
                  <>
                    <GhostButton onClick={() => void openNote(`${status.space}/programming_practice/projects/${p.folder}/SPEC.md`)}>Especificación</GhostButton>
                    <PrimaryButton onClick={() => setDefending(p.folder)}><Swords size={13} /> {p.state === "building" ? "Defender" : "Abrir defensa"}</PrimaryButton>
                  </>
                )}
              </div>
            ))}
          </section>
        </>
      )}
    </Modal>
  );
}

/** Phase 3 and 4 for one project: what a review would cost, the review, the oral defence and the postmortem. */
function DefendPanel({ folder, onBack }: { folder: string; onBack: () => void }) {
  const toast = useApp((s) => s.toast);
  const openNote = useApp((s) => s.openNote);
  const [estimate, setEstimate] = useState<PpEstimate | null>(null);
  const [runChecks, setRunChecks] = useState(true);
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [report, setReport] = useState<PpDefense | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [grade, setGrade] = useState<PpGrade | null>(null);
  const [post, setPost] = useState<string>("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    api.ppDefendEstimate(folder, onlyChanged).then(setEstimate).catch((e) => toast("error", (e as Error).message));
  }, [folder, onlyChanged, toast]);

  const step = async <T,>(label: string, fn: () => Promise<T>, after: (v: T) => void) => {
    setBusy(label);
    try {
      after(await fn());
      useApp.getState().refreshTree();
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="space-y-3">
      <GhostButton onClick={onBack}>← Proyectos</GhostButton>
      <h3 className="text-[14px] font-semibold text-text">{folder}</h3>

      {!report && (
        <section className="space-y-2 rounded-xl border border-line px-3 py-2.5">
          <span className="font-mono text-[10.5px] uppercase tracking-wider text-faint">Antes de enviar nada</span>
          {estimate ? (
            <>
              <p className="text-[12px] text-dim">
                Se enviarán unos <b className="text-text">{estimate.totalTokens.toLocaleString("es")}</b> tokens en 4 llamadas
                ({estimate.layers.map((l) => `${LAYER_LABEL[l.layer] ?? l.layer}: ${l.files} archivos${l.left ? `, ${l.left} no caben` : ""}`).join(" · ")}).
                {estimate.skipped > 0 && ` ${estimate.skipped} elementos se omiten (dependencias, compilados, secretos).`}
              </p>
              <label className="flex items-center gap-2 text-[12px] text-text">
                <input type="checkbox" checked={runChecks} onChange={(e) => setRunChecks(e.target.checked)} />
                Ejecutar primero las comprobaciones (sin gastar tokens): {estimate.checks.length ? estimate.checks.map((c) => `${c.label}${c.skip ? ` — ${c.skip}` : ""}`).join("; ") : "no hay scripts de prueba o compilación"}
              </label>
              {estimate.previousDefenses > 0 && (
                <label className="flex items-center gap-2 text-[12px] text-text">
                  <input type="checkbox" checked={onlyChanged} onChange={(e) => setOnlyChanged(e.target.checked)} />
                  Enviar solo lo que cambió desde la última defensa ({estimate.changed ?? 0} archivos)
                </label>
              )}
            </>
          ) : (
            <p className="text-[12px] text-faint">Calculando…</p>
          )}
          <PrimaryButton onClick={() => void step("review", () => api.ppDefend(folder, { runChecks, onlyChanged }), (r) => { setReport(r); showChat(r.conversationId); })} disabled={!!busy || !estimate}>
            {busy === "review" ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />} Revisar mi proyecto
          </PrimaryButton>
          {busy === "review" && <p className="text-[11.5px] text-faint">Revisando capa por capa… puedes seguir la conversación en el chat.</p>}
        </section>
      )}

      {report && (
        <>
          <section className="rounded-xl border border-line px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-semibold", report.final.functional ? "bg-mint/15 text-mint" : "bg-danger-soft text-danger")}>
                {report.final.functional ? "Funcional" : "No funcional"}
              </span>
              <span className="text-[13px] font-semibold text-text">{report.final.score}/100</span>
              <span className="flex-1" />
              <GhostButton onClick={() => void openNote(report.rel)}>Abrir informe</GhostButton>
            </div>
            <p className="mt-1.5 text-[12px] leading-relaxed text-dim">{report.final.summary}</p>
            {report.final.mustFix.length > 0 && (
              <ul className="mt-1.5 list-disc pl-4 text-[12px] text-text">{report.final.mustFix.map((m) => <li key={m}>{m}</li>)}</ul>
            )}
            {report.checks.length > 0 && (
              <p className="mt-1.5 font-mono text-[10.5px] text-faint">{report.checks.map((c) => `${c.status.toUpperCase()} ${c.label}`).join(" · ")}</p>
            )}
          </section>

          {report.layers.map((l) => (
            <section key={l.layer} className="rounded-xl border border-line px-3 py-2">
              <span className="text-[12.5px] font-semibold text-text">{LAYER_LABEL[l.layer] ?? l.layer} <span className="font-normal text-faint">· {l.verdict}</span></span>
              {l.issues.length === 0 && <p className="text-[11.5px] text-faint">Sin problemas de comportamiento.</p>}
              {l.issues.map((i) => (
                <div key={`${i.file}:${i.line}:${i.problem}`} className="mt-1.5 text-[12px]">
                  <span className={cn("font-semibold", SEVERITY[i.severity])}>{i.severity}</span> <span className="font-mono text-[11px] text-faint">{i.file}{i.line ? `:${i.line}` : ""}</span>
                  <span className="block text-text">{i.problem}</span>
                  <span className="block text-dim">Arreglo: {i.fix}</span>
                </div>
              ))}
            </section>
          ))}

          <section className="space-y-2 rounded-xl border border-line px-3 py-2.5">
            <span className="font-mono text-[10.5px] uppercase tracking-wider text-faint">Defensa: respóndete como si te preguntaran en una entrevista</span>
            {report.final.questions.map((q) => (
              <Field key={q.id} label={`${q.id} · ${q.question}`}>
                <textarea className={cn(input, "min-h-[64px]")} value={answers[q.id] ?? ""} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))} />
              </Field>
            ))}
            <PrimaryButton onClick={() => void step("grade", () => api.ppDefendGrade(folder, answers), (r) => { setGrade(r.grade); showChat(r.conversationId); })} disabled={!!busy || !Object.values(answers).some((a) => a.trim())}>
              {busy === "grade" && <Loader2 size={13} className="animate-spin" />} Calificar mi defensa
            </PrimaryButton>
            {grade && (
              <div className="text-[12px] text-dim">
                <b className="text-text">{grade.score}/100</b> — {grade.summary}
                <ul className="mt-1 list-disc pl-4">{grade.items.map((i) => <li key={i.id}><b>{i.id}</b> {i.verdict}: {i.feedback}</li>)}</ul>
                {grade.gaps.length > 0 && <p className="mt-1">A repasar: {grade.gaps.join("; ")}</p>}
              </div>
            )}
          </section>

          <section className="space-y-2 rounded-xl border border-line px-3 py-2.5">
            <span className="font-mono text-[10.5px] uppercase tracking-wider text-faint">4 · Postmortem</span>
            <p className="text-[11.5px] text-faint">Guarda lo que hiciste bien y mal en tu perfil; el próximo proyecto se diseñará con eso.</p>
            <PrimaryButton onClick={() => void step("post", () => api.ppPostmortem(folder), (r) => { setPost(r.summary); showChat(r.conversationId); void openNote(r.rel ?? ""); })} disabled={!!busy}>
              {busy === "post" && <Loader2 size={13} className="animate-spin" />} Cerrar el proyecto con un postmortem
            </PrimaryButton>
            {post && <pre className="whitespace-pre-wrap text-[11.5px] text-dim">{post}</pre>}
          </section>
        </>
      )}
    </div>
  );
}
