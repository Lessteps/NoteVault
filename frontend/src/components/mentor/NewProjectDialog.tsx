// Mentor — «Nuevo proyecto»: añadir un proyecto propio al plan, a mano (título, qué es, cuándo está hecho, área y fecha) o pidiéndoselo al Mentor con una idea en una
// frase. Entra como entregable del plan (operación `add_deliverable`, con historial y «Deshacer») y se ve en «Proyectos propios». Para que lo diseñe otra IA
// (Antigravity) sin la app abierta está «Preguntas y ajustes → Preguntar con otra IA».

import { Sparkles } from "lucide-react";
import { useState } from "react";
import { api } from "../../lib/bridge";
import type { PlanDeliverable } from "../../lib/planAreas";
import type { MentorPlan } from "../../lib/types";
import { useApp } from "../../store/app";
import { useMentor } from "../../store/mentor";
import { Field, GhostButton, input, Modal, PrimaryButton } from "../common/forms";
import { cn } from "../ui";

export function NewProjectDialog({ plan, onClose, edit }: { plan: MentorPlan; onClose: () => void; /** un proyecto propio (`x:n`) para editarlo en vez de crear uno */ edit?: PlanDeliverable }) {
  const toast = useApp((s) => s.toast);
  const [mode, setMode] = useState<"manual" | "ia">("manual");
  const [title, setTitle] = useState(edit?.title ?? "");
  const [description, setDescription] = useState(edit?.description ?? "");
  const [criteria, setCriteria] = useState((edit?.criteria ?? []).join("\n"));
  const [subplan, setSubplan] = useState(plan.subplans.find((s) => edit?.areaId && (s.areaId ?? s.id) === edit.areaId)?.id ?? "");
  const [due, setDue] = useState(edit?.dueDate ?? plan.end);
  const [idea, setIdea] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (body: Parameters<typeof api.mentorPlanChange>[0], okText: string): Promise<void> => {
    setBusy(true);
    try {
      let r = await api.mentorPlanChange(body);
      for (let i = 0; r.loading && i < 40; i++) {
        await new Promise((ok) => setTimeout(ok, 1500));
        r = await api.mentorPlanChange(body);
      }
      if (r.loading) throw new Error("El índice de la vault tarda demasiado en estar listo. Inténtalo de nuevo en un momento.");
      if (!r.applied) {
        toast("error", r.entry.summary || "No pude añadir el proyecto: prueba a describirlo con más detalle.");
        return;
      }
      toast("info", `${okText} Puedes deshacerlo en «Preguntas y ajustes».`);
      useMentor.setState((st) => ({ planVersion: st.planVersion + 1 }));
      onClose();
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const save = (): Promise<void> =>
    edit
      ? run({ id: plan.id, label: `Editar el proyecto «${title.trim()}»`, ops: [{ op: "edit_deliverable", id: edit.id, title: title.trim(), description: description.trim(), criteria: criteria.split("\n").map((c) => c.trim()).filter(Boolean), subplan, dueDate: due }] }, `Proyecto «${title.trim()}» actualizado.`)
      : addManual();
  const addManual = (): Promise<void> =>
    run(
      { id: plan.id, label: `Añadir el proyecto «${title.trim()}»`, ops: [{ op: "add_deliverable", title: title.trim(), description: description.trim(), criteria: criteria.split("\n").map((c) => c.trim()).filter(Boolean), ...(subplan ? { subplan } : {}), dueDate: due }] },
      `Proyecto «${title.trim()}» añadido.`,
    );
  const askAi = (): Promise<void> => run({ id: plan.id, comment: `Añade un proyecto al plan: ${idea.trim()}`, intent: "adjust" }, "El Mentor añadió el proyecto.");

  return (
    <Modal title={edit ? "Editar proyecto" : "Nuevo proyecto"} onClose={onClose} width={620}>
      <div className="space-y-3" data-testid="new-project">
        {!edit && <div className="inline-flex rounded-lg border border-line bg-card p-0.5" role="group" aria-label="Cómo crearlo">
          {([["manual", "Lo escribo yo"], ["ia", "Que el Mentor lo proponga"]] as const).map(([id, label]) => (
            <button key={id} type="button" aria-pressed={mode === id} onClick={() => setMode(id)} data-testid={`new-project-${id}`} className={cn("min-h-8 rounded-md px-2.5 text-[13px] font-medium", mode === id ? "bg-accent text-white" : "text-dim hover:bg-hover hover:text-text")}>{label}</button>
          ))}
        </div>}
        {mode === "manual" || edit ? (
          <>
            <Field label="Título"><input className={input} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} placeholder="Ej.: API de reservas con autenticación" data-testid="new-project-title" /></Field>
            <Field label="Qué es"><textarea className={cn(input, "min-h-20")} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={600} placeholder="Qué construyes y para qué sirve" /></Field>
            <Field label="Cuándo está hecho (uno por línea)"><textarea className={cn(input, "min-h-20")} value={criteria} onChange={(e) => setCriteria(e.target.value)} placeholder={"Se arranca con un comando\nTiene pruebas que pasan"} /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Área"><select className={input} value={subplan} onChange={(e) => setSubplan(e.target.value)}><option value="">Todo el plan</option>{plan.subplans.map((s) => <option key={s.id} value={s.id}>{s.area}</option>)}</select></Field>
              <Field label="Fecha de entrega"><input type="date" className={input} value={due} min={plan.start} max={plan.end} onChange={(e) => e.target.value && setDue(e.target.value)} /></Field>
            </div>
            <div className="flex justify-end gap-2"><GhostButton onClick={onClose}>Cancelar</GhostButton><PrimaryButton onClick={() => void save()} disabled={busy || !title.trim()} data-testid="new-project-add">{edit ? "Guardar cambios" : "Añadir al plan"}</PrimaryButton></div>
          </>
        ) : (
          <>
            <p className="text-[13.5px] text-dim">Cuéntale la idea en una frase: el Mentor la convierte en un proyecto con descripción, criterios, área y fecha, y lo añade al plan. Si la IA de la app no está configurada, usa «Preguntar con otra IA» en «Preguntas y ajustes».</p>
            <Field label="Tu idea"><textarea className={cn(input, "min-h-24")} value={idea} onChange={(e) => setIdea(e.target.value)} maxLength={600} placeholder="Ej.: un proyecto de Databases con un modelo de reservas y 5 consultas con joins" data-testid="new-project-idea" /></Field>
            <div className="flex justify-end gap-2"><GhostButton onClick={onClose}>Cancelar</GhostButton><PrimaryButton onClick={() => void askAi()} disabled={busy || idea.trim().length < 8} data-testid="new-project-ask"><Sparkles size={15} aria-hidden /> Pedírselo al Mentor</PrimaryButton></div>
          </>
        )}
      </div>
    </Modal>
  );
}
