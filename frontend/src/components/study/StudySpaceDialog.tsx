// "Generar espacio de estudio" / "Añadir área": the AI proposes a subject's areas and
// topics, the user picks which areas to build and which parts to generate, and the
// generation runs in the background while EVERY exchange with the model is written to
// a chat conversation that opens in the assistant — so it can be read as it happens.

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { create } from "zustand";
import { api } from "../../lib/bridge";
import { useApp } from "../../store/app";
import { useAssistant } from "../../store/assistant";
import { Field, GhostButton, input, Modal, PrimaryButton } from "../common/forms";
import { cn } from "../ui";

type Mode = "space" | "area";

export const useStudySpaceDialog = create<{
  open: boolean;
  mode: Mode;
  openWith: (mode: Mode) => void;
  close: () => void;
}>((set) => ({
  open: false,
  mode: "space",
  openWith: (mode) => set({ open: true, mode }),
  close: () => set({ open: false }),
}));

type Area = { name: string; topics: Array<{ name: string }> };

let follower: number | null = null;

/** Keeps the chat conversation of a running job on screen and reports when it ends. */
function followJob(jobId: string, conversationId: string): void {
  if (follower) window.clearInterval(follower);
  const assistant = useAssistant.getState();
  assistant.setOpen(true);
  void assistant.openConversation(conversationId);
  follower = window.setInterval(async () => {
    try {
      const st = await api.studySpaceStatus(jobId);
      const a = useAssistant.getState();
      // Only refresh while the user is still reading that conversation.
      if (a.conversationId === conversationId && !a.busy) await a.openConversation(conversationId);
      if (st.done) {
        if (follower) window.clearInterval(follower);
        follower = null;
        useApp.getState().refreshTree();
        useApp.getState().toast(st.error ? "error" : "info", st.error || `Espacio «${st.folder}» generado.`);
      }
    } catch {
      if (follower) window.clearInterval(follower);
      follower = null;
    }
  }, 3000);
}

export function StudySpaceDialog() {
  const open = useStudySpaceDialog((s) => s.open);
  const mode = useStudySpaceDialog((s) => s.mode);
  const close = useStudySpaceDialog((s) => s.close);
  const toast = useApp((s) => s.toast);

  const [subject, setSubject] = useState("");
  const [folder, setFolder] = useState("");
  const [spaces, setSpaces] = useState<string[]>([]);
  const [scope, setScope] = useState("");
  const [objective, setObjective] = useState("");
  const [areas, setAreas] = useState<Area[] | null>(null);
  const [conversationId, setConversationId] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [steps, setSteps] = useState({ theory: true, practice: true, map: true });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAreas(null);
    setConversationId("");
    void api.studySpaceList().then((list) => {
      setSpaces(list);
      if (mode === "area") {
        setFolder((f) => f || list[0] || "");
        setSubject((s) => s || (list[0] ?? "").replace(/\s*\d+\s*$/, ""));
      }
    });
  }, [open, mode]);

  if (!open) return null;

  const propose = async () => {
    if (!subject.trim()) return;
    setBusy(true);
    try {
      const res = await api.studySpacePropose(subject.trim(), scope, objective, mode === "area" ? folder : "");
      setAreas(res.areas);
      setConversationId(res.conversationId);
      setPicked(new Set(res.areas.map((a) => a.name)));
      // A NEW space never lands in an existing folder: "Matemáticas" is taken, so "Matemáticas 1".
      if (mode === "space" && !folder.trim()) {
        const base = subject.trim();
        let n = 1;
        while (spaces.includes(`${base} ${n}`)) n += 1;
        setFolder(spaces.includes(base) ? `${base} ${n}` : base);
      }
      // The proposal is already a chat: show it.
      useAssistant.getState().setOpen(true);
      void useAssistant.getState().openConversation(res.conversationId);
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
      const res = await api.studySpaceGenerate({ folder: folder.trim(), subject: subject.trim(), areas: chosen, steps, conversationId });
      followJob(res.jobId, res.conversationId);
      toast("info", "Generando… lo verás paso a paso en el chat.");
      close();
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const total = areas?.filter((a) => picked.has(a.name)).reduce((n, a) => n + a.topics.length, 0) ?? 0;
  const title = mode === "area" ? "Añadir un área a un espacio" : "Generar espacio de estudio";

  return (
    <Modal
      title={title}
      onClose={close}
      width={640}
      footer={
        areas ? (
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
            <PrimaryButton onClick={() => void propose()} disabled={busy || !subject.trim() || (mode === "area" && !folder)}>
              {busy && <Loader2 size={13} className="animate-spin" />} Proponer {mode === "area" ? "áreas" : "temario"}
            </PrimaryButton>
          </>
        )
      }
    >
      {!areas ? (
        <>
          <p className="text-[12px] leading-relaxed text-dim">
            La IA propone las áreas y los temas; después eliges qué crear. Nada se escribe hasta que pulses «Generar», y todo lo que
            hable con la IA queda registrado en el chat.
          </p>
          {mode === "area" && (
            <Field label="Espacio al que añadir el área">
              <select className={input} value={folder} onChange={(e) => setFolder(e.target.value)}>
                {spaces.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              {spaces.length === 0 && <span className="mt-1 block text-[11px] text-warn">No hay ningún espacio todavía: crea uno primero.</span>}
            </Field>
          )}
          <Field label="Materia">
            <input className={input} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Matemáticas, JavaScript, Cálculo diferencial…" autoFocus />
          </Field>
          <Field label={mode === "area" ? "Qué área quieres añadir" : "Alcance (opcional)"}>
            <input className={input} value={scope} onChange={(e) => setScope(e.target.value)} placeholder={mode === "area" ? "Álgebra elemental e intermedia" : "Solo el área de Aritmética elemental…"} />
          </Field>
          <Field label="Objetivo (opcional)">
            <input className={input} value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="Qué quieres lograr al estudiarlo" />
          </Field>
        </>
      ) : (
        <>
          <Field label="Carpeta del espacio">
            <input className={input} value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="Matemáticas 1" readOnly={mode === "area"} />
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
            <span className="mb-1 block font-mono text-[10.5px] uppercase tracking-wider text-faint">Qué generar ({total} temas)</span>
            <div className="flex flex-col gap-1 text-[12.5px] text-text">
              <label className="flex items-center gap-2 text-dim"><input type="checkbox" checked disabled /> Temario: carpetas, vistas de resumen y de práctica</label>
              {([
                ["theory", "Teoría de cada tema (la escribe la IA, cada una tarda ~1 min)"],
                ["map", "Mapas: del tema (desde su teoría), del área y del espacio"],
                ["practice", "Matriz de competencias de cada tema (la IA decide skills y cantidades)"],
              ] as const).map(([key, label]) => (
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
