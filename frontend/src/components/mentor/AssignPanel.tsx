// Mentor — qué se trabaja en el bloque del Pomodoro: temas del plan, proyectos y tareas escritas a mano. Se usa en la sesión de cada área y, con la
// misma lógica, en el selector de la barra superior. Lo asignado viaja con el bloque: queda en la nota del registro de horas y en la evaluación.

import { ListPlus, Plus, X } from "lucide-react";
import { useState } from "react";
import { ASSIGN_KIND_LABEL, manualAssignment, type AssignedTopic } from "../../lib/pomodoro";
import { usePomodoro } from "../../store/pomodoro";
import { GhostButton } from "../common/forms";

export function AssignPanel({ suggestions = [], todayTopics = [] }: {
  /** proyectos u otras piezas que se ofrecen con un clic (p. ej. el proyecto diario de hoy) */
  suggestions?: AssignedTopic[];
  /** los temas de hoy de esta área: se asignan todos con un botón */
  todayTopics?: AssignedTopic[];
}) {
  const assigned = usePomodoro((s) => s.p.assignedTopics);
  const { assignTopic, removeAssignedTopic } = usePomodoro.getState();
  const [text, setText] = useState("");
  const [kind, setKind] = useState<"task" | "project">("task");
  const free = suggestions.filter((s) => !assigned.some((a) => a.folder === s.folder));
  const freeToday = todayTopics.filter((s) => !assigned.some((a) => a.folder === s.folder));

  const add = (): void => {
    if (!text.trim()) return;
    assignTopic(manualAssignment(kind, text));
    setText("");
  };

  return (
    <div className="mt-4 space-y-2 border-t border-line/60 pt-3 text-left" data-testid="assign-panel">
      <p className="flex items-center gap-1.5 text-[12px] font-semibold uppercase text-dim"><ListPlus size={13} aria-hidden /> Qué vas a trabajar en este bloque ({assigned.length})</p>

      {assigned.length > 0 && (
        <ul className="space-y-1" aria-label="Asignado a este bloque" data-testid="assigned-list">
          {assigned.map((t) => (
            <li key={t.folder} className="flex items-center gap-2 rounded-lg bg-card/80 px-2 py-1 text-[13px]" data-testid="assigned-item">
              <span className="flex-none rounded border border-line px-1 font-mono text-[10.5px] uppercase text-faint">{ASSIGN_KIND_LABEL[t.kind ?? "topic"]}</span>
              <span className="min-w-0 flex-1 truncate text-text">{t.title}</span>
              <button type="button" onClick={() => removeAssignedTopic(t.folder)} aria-label={`Quitar ${t.title}`} className="grid h-6 w-6 flex-none place-items-center rounded text-faint hover:text-danger"><X size={12} aria-hidden /></button>
            </li>
          ))}
        </ul>
      )}

      {(free.length > 0 || freeToday.length > 0) && (
        <div className="flex flex-wrap gap-1.5" data-testid="assign-suggestions">
          {freeToday.length > 0 && (
            <GhostButton onClick={() => freeToday.forEach((t) => assignTopic(t))} data-testid="assign-today">
              <Plus size={13} aria-hidden /> Los {freeToday.length} temas de hoy
            </GhostButton>
          )}
          {free.map((s) => (
            <GhostButton key={s.folder} onClick={() => assignTopic(s)} data-testid="assign-suggestion">
              <Plus size={13} aria-hidden /> {s.title}
            </GhostButton>
          ))}
        </div>
      )}

      <form className="flex flex-wrap items-center gap-1.5" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <select value={kind} onChange={(e) => setKind(e.target.value as "task" | "project")} aria-label="Tipo" className="min-h-8 rounded-lg border border-line bg-surface px-1.5 text-[12.5px] text-text" data-testid="assign-kind">
          <option value="task">Tarea</option>
          <option value="project">Proyecto</option>
        </select>
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={120} placeholder="Escribe una tarea o un proyecto…" aria-label="Tarea o proyecto a mano" className="min-h-8 min-w-0 flex-1 basis-40 rounded-lg border border-line bg-surface px-2 text-[13px] text-text" data-testid="assign-text" />
        <GhostButton onClick={add} disabled={!text.trim()} data-testid="assign-add"><Plus size={13} aria-hidden /> Asignar</GhostButton>
      </form>
    </div>
  );
}
