// Mentor — qué se trabaja en el bloque del Pomodoro: temas del plan, proyectos y tareas escritas a mano. Se usa en la sesión de cada área y, con la
// misma lógica, en el selector de la barra superior. Lo asignado viaja con el bloque: queda en la nota del registro de horas y en la evaluación.
//
// Está pensado para no abrumar: por defecto es un resumen de una línea («Nada asignado» o lo asignado) con un botón «Asignar»; las sugerencias y el
// campo para escribir a mano solo aparecen al abrirlo (en la barra superior viene abierto, porque ahí es un formulario de empezar).

import { Plus, X } from "lucide-react";
import { useState } from "react";
import { ASSIGN_KIND_LABEL, manualAssignment, type AssignedTopic } from "../../lib/pomodoro";
import { usePomodoro } from "../../store/pomodoro";
import { cn } from "../ui";

export function AssignPanel({ suggestions = [], todayTopics = [], defaultOpen = false, children }: {
  /** proyectos u otras piezas que se ofrecen con un clic (p. ej. el proyecto diario de hoy) */
  suggestions?: AssignedTopic[];
  /** los temas de hoy de esta área: se asignan todos con un botón */
  todayTopics?: AssignedTopic[];
  defaultOpen?: boolean;
  /** más cosas que ofrecer dentro del formulario abierto (la barra superior pone aquí su buscador de temas) */
  children?: React.ReactNode;
}) {
  const assigned = usePomodoro((s) => s.p.assignedTopics);
  const { assignTopic, removeAssignedTopic } = usePomodoro.getState();
  const [open, setOpen] = useState(defaultOpen);
  const [text, setText] = useState("");
  const [kind, setKind] = useState<"task" | "project">("task");
  const free = suggestions.filter((s) => !assigned.some((a) => a.folder === s.folder));
  const freeToday = todayTopics.filter((s) => !assigned.some((a) => a.folder === s.folder));

  const add = (): void => {
    if (!text.trim()) return;
    assignTopic(manualAssignment(kind, text));
    setText("");
  };
  const row = "flex w-full items-center gap-2.5 rounded-lg border border-line bg-card px-3 py-2 text-left text-[13.5px] hover:border-accent";

  return (
    <div className="space-y-3 text-left" data-testid="assign-panel">
      <div className="flex items-center gap-2">
        <h4 className="text-[14px] font-semibold text-text">Qué vas a trabajar</h4>
        {assigned.length > 0 && <span className="rounded-full bg-hover px-2 text-[12px] text-dim">{assigned.length}</span>}
        <span className="flex-1" />
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="text-[13.5px] text-accent-text hover:underline" data-testid="assign-toggle">
          {open ? "Cerrar" : "Asignar"}
        </button>
      </div>

      {assigned.length === 0 && !open && <p className="text-[13.5px] text-faint" data-testid="assign-empty">Nada asignado: es una sesión libre.</p>}

      {assigned.length > 0 && (
        <ul className="space-y-1.5" aria-label="Asignado a este bloque" data-testid="assigned-list">
          {assigned.map((t) => (
            <li key={t.folder} className="flex items-center gap-2.5 rounded-lg bg-surface px-3 py-2 text-[13.5px]" data-testid="assigned-item">
              <span className="flex-none rounded-md border border-line px-1.5 py-px text-[11.5px] text-faint">{ASSIGN_KIND_LABEL[t.kind ?? "topic"]}</span>
              <span className="min-w-0 flex-1 truncate text-text" title={t.title}>{t.title}</span>
              <button type="button" onClick={() => removeAssignedTopic(t.folder)} aria-label={`Quitar ${t.title}`} className="grid h-7 w-7 flex-none place-items-center rounded-md text-faint hover:bg-hover hover:text-danger"><X size={13} aria-hidden /></button>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div className="space-y-4 rounded-xl bg-surface p-3.5" data-testid="assign-form">
          {children}
          {(free.length > 0 || freeToday.length > 0) && (
            <div className="space-y-1.5" data-testid="assign-suggestions">
              <p className="text-[12.5px] font-medium text-dim">Sugerencias</p>
              {freeToday.length > 0 && (
                <button type="button" onClick={() => freeToday.forEach((t) => assignTopic(t))} className={row} data-testid="assign-today">
                  <Plus size={14} aria-hidden className="flex-none text-accent-text" /> Los {freeToday.length} temas de hoy
                </button>
              )}
              {free.map((s) => (
                <button key={s.folder} type="button" onClick={() => assignTopic(s)} className={cn(row, "items-start")} data-testid="assign-suggestion">
                  <Plus size={14} aria-hidden className="mt-0.5 flex-none text-accent-text" /> <span className="min-w-0 flex-1">{s.title}</span>
                </button>
              ))}
            </div>
          )}

          <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); add(); }}>
            <p className="text-[12.5px] font-medium text-dim">O escribe algo a mano</p>
            <input value={text} onChange={(e) => setText(e.target.value)} maxLength={120} placeholder="Una tarea o un proyecto…" aria-label="Tarea o proyecto a mano" className="min-h-10 w-full rounded-lg border border-line bg-card px-3 text-[14px] text-text outline-none focus:border-accent" data-testid="assign-text" />
            <div className="flex items-center gap-2">
              <select value={kind} onChange={(e) => setKind(e.target.value as "task" | "project")} aria-label="Tipo" className="min-h-9 flex-1 rounded-lg border border-line bg-card px-2.5 text-[13.5px] text-text" data-testid="assign-kind">
                <option value="task">Tarea</option>
                <option value="project">Proyecto</option>
              </select>
              <button type="button" onClick={add} disabled={!text.trim()} className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent px-3 text-[13.5px] font-medium text-white hover:opacity-90 disabled:opacity-40" data-testid="assign-add">
                <Plus size={14} aria-hidden /> Asignar
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
