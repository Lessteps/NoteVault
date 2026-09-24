import { BellOff, BellRing } from "lucide-react";
import { useMemo } from "react";
import { useTasks } from "../../store/tasks";
import { cn } from "../ui";

function when(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("es", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function pendingReminders(tasks: ReturnType<typeof useTasks.getState>["tasks"]) {
  return tasks
    .filter((t) => t.reminder && !t.reminder_done)
    .sort((a, b) => (a.reminder! < b.reminder! ? -1 : 1));
}

export function TaskReminders() {
  const tasks = useTasks((s) => s.tasks);
  const open = useTasks((s) => s.open);
  const update = useTasks((s) => s.update);
  const list = useMemo(() => pendingReminders(tasks), [tasks]);
  const now = new Date().toISOString().slice(0, 16);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
      <div className="mx-auto max-w-2xl">
        <h2 className="mb-1 text-[16px] font-semibold text-text">Recordatorios</h2>
        <p className="mb-4 text-[12.5px] text-dim">
          Avisos programados. Cuando llega la hora, NoteVault te avisa dentro de la app.
        </p>
        {list.length === 0 && (
          <div className="rounded-xl border border-dashed border-line-strong px-4 py-8 text-center text-[13px] text-faint">
            No hay recordatorios pendientes. Añade uno desde la tabla o el detalle de una tarea.
          </div>
        )}
        <div className="flex flex-col gap-2">
          {list.map((t) => {
            const late = t.reminder! <= now;
            return (
              <div
                key={t.id}
                className="flex items-center gap-3 rounded-xl border border-line bg-card px-4 py-3"
              >
                <BellRing size={16} className={cn("flex-none", late ? "text-warn" : "text-accent-text")} />
                <button type="button" onClick={() => open(t.id)} className="min-w-0 flex-1 text-left">
                  <div className="truncate text-[13px] text-text">{t.name}</div>
                  <div className={cn("font-mono text-[11px]", late ? "text-warn" : "text-faint")}>
                    {when(t.reminder!)}
                    {t.subject && ` · ${t.subject}`}
                  </div>
                </button>
                <button
                  type="button"
                  title="Quitar recordatorio"
                  onClick={() => void update(t.id, { reminder: null })}
                  className="grid h-7 w-7 place-items-center rounded-md text-faint hover:bg-hover hover:text-text"
                >
                  <BellOff size={14} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
