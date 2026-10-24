// Mentor — «Añadir práctica»: añade a mano un elemento de PRÁCTICA DIARIA a un día (hoy por defecto): un kata, el ejercicio de un tema o texto libre.
// Botón + diálogo; guarda con `mentor_plan_extra_practice_add`. Pieza reutilizable por props: quien la monte recoge el plan nuevo en `onChanged`.

import { Plus } from "lucide-react";
import { useState } from "react";
import { api } from "../../lib/bridge";
import type { ExtraPracticeKind } from "../../lib/planPace";
import type { MentorPlan } from "../../lib/types";
import { useApp } from "../../store/app";
import { Field, GhostButton, input, Modal, PrimaryButton } from "../common/forms";
import { cn } from "../ui";

export interface AddExtraPracticeProps {
  planId: string;
  /** día al que se añade (AAAA-MM-DD); en el diálogo se puede cambiar */
  date: string;
  /** el área (id de subplan) a la que pertenece la práctica; sin él es práctica general del día */
  area?: string;
  /** temas entre los que elegir el ejercicio a practicar (los de hoy, por ejemplo) */
  topics?: ReadonlyArray<{ folder: string; title: string }>;
  minDate?: string;
  maxDate?: string;
  onChanged: (plan: MentorPlan) => void;
  label?: string;
  className?: string;
}

const KINDS: ReadonlyArray<{ id: ExtraPracticeKind; label: string }> = [
  { id: "custom", label: "Libre" },
  { id: "kata", label: "Kata" },
  { id: "exercise", label: "Ejercicio de un tema" },
];

export function AddExtraPractice({ planId, date, area, topics = [], minDate, maxDate, onChanged, label = "Añadir práctica", className }: AddExtraPracticeProps) {
  const toast = useApp((s) => s.toast);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<ExtraPracticeKind>("custom");
  const [title, setTitle] = useState("");
  const [minutes, setMinutes] = useState("");
  const [note, setNote] = useState("");
  const [folder, setFolder] = useState("");
  const [day, setDay] = useState(date);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const reset = (): void => {
    setKind("custom");
    setTitle("");
    setMinutes("");
    setNote("");
    setFolder("");
    setError("");
  };
  const close = (): void => {
    setOpen(false);
    reset();
  };
  const submit = async (): Promise<void> => {
    const m = minutes.trim() === "" ? undefined : Number(minutes);
    if (!title.trim() && !(kind === "exercise" && folder)) return void setError("Escribe un título para la práctica.");
    if (m !== undefined && (!Number.isInteger(m) || m < 1 || m > 600)) return void setError("Los minutos deben ser un entero de 1 a 600.");
    const linked = topics.find((t) => t.folder === folder);
    const finalTitle = title.trim() || (linked ? `Ejercicios de ${linked.title}` : "");
    setBusy(true);
    setError("");
    try {
      const plan = await api.mentorPlanExtraPracticeAdd({
        id: planId,
        title: finalTitle,
        kind,
        date: day,
        ...(m ? { minutes: m } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(area ? { area } : {}),
        ...(kind === "exercise" && folder ? { folder } : {}),
      });
      onChanged(plan);
      toast("info", `Práctica añadida al ${day}.`);
      close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <GhostButton large="md" className={cn(className)} onClick={() => { setDay(date); setOpen(true); }} aria-expanded={open} data-testid="add-extra-practice">
        <Plus size={15} aria-hidden /> {label}
      </GhostButton>
      {open && (
        <Modal
          title="Añadir práctica diaria"
          onClose={close}
          footer={
            <>
              <PrimaryButton large disabled={busy} onClick={() => void submit()}>Añadir práctica</PrimaryButton>
              <GhostButton large onClick={close}>Cancelar</GhostButton>
            </>
          }
        >
          <div role="radiogroup" aria-label="Tipo de práctica" className="flex flex-wrap gap-2">
            {KINDS.map((k) => (
              <label key={k.id} className={cn("flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border px-3 text-[14px]", kind === k.id ? "border-accent bg-accent-soft text-text" : "border-line text-dim")}>
                <input type="radio" name="extra-practice-kind" className="sr-only" checked={kind === k.id} onChange={() => setKind(k.id)} />
                {k.label}
              </label>
            ))}
          </div>
          {kind === "exercise" && topics.length > 0 && (
            <Field label="Tema">
              <select className={input} value={folder} onChange={(e) => setFolder(e.target.value)} aria-label="Tema del ejercicio">
                <option value="">Elige un tema…</option>
                {topics.map((t) => <option key={t.folder} value={t.folder}>{t.title}</option>)}
              </select>
            </Field>
          )}
          <Field label="Título">
            <input autoFocus className={input} value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} placeholder={kind === "kata" ? "Kata de listas…" : "Qué vas a practicar"} aria-label="Título de la práctica" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Minutos (opcional)">
              <input type="number" min={1} max={600} className={input} value={minutes} onChange={(e) => setMinutes(e.target.value)} aria-label="Minutos" />
            </Field>
            <Field label="Día">
              <input type="date" className={input} value={day} min={minDate} max={maxDate} onChange={(e) => e.target.value && setDay(e.target.value)} aria-label="Día" />
            </Field>
          </div>
          <Field label="Nota (opcional)">
            <textarea className={cn(input, "min-h-16 resize-y")} value={note} maxLength={400} onChange={(e) => setNote(e.target.value)} aria-label="Nota" />
          </Field>
          {error && <p role="alert" className="text-[14px] text-danger">{error}</p>}
        </Modal>
      )}
    </>
  );
}
