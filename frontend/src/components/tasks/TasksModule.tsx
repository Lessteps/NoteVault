import { Bell, CalendarDays, Table2 } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useTasks, type TasksView } from "../../store/tasks";
import { ModuleSidebar } from "../ModuleSidebar";
import { TaskCalendar } from "./TaskCalendar";
import { TaskDrawer } from "./TaskDrawer";
import { pendingReminders, TaskReminders } from "./TaskReminders";
import { TaskTable } from "./TaskTable";

export function TasksModule() {
  const view = useTasks((s) => s.view);
  const setView = useTasks((s) => s.setView);
  const tasks = useTasks((s) => s.tasks);
  const load = useTasks((s) => s.load);
  const loaded = useTasks((s) => s.loaded);
  const setFilters = useTasks((s) => s.setFilters);
  const meta = useTasks((s) => s.meta);

  useEffect(() => {
    void load();
  }, [load]);

  const reminders = useMemo(() => pendingReminders(tasks).length, [tasks]);
  const overdue = useMemo(() => tasks.filter((t) => t.overdue).length, [tasks]);
  const open = tasks.filter((t) => !t.done).length;

  return (
    <div className="flex min-w-0 flex-1">
      <ModuleSidebar
        title="Tareas"
        active={view}
        onSelect={(id) => setView(id as TasksView)}
        items={[
          { id: "tabla", label: "Tabla", hint: "Base de datos", icon: <Table2 />, badge: open },
          { id: "calendario", label: "Calendario", hint: "Por fecha límite", icon: <CalendarDays /> },
          { id: "recordatorios", label: "Recordatorios", hint: "Avisos programados", icon: <Bell />, badge: reminders },
        ]}
      >
        <div className="px-4 pt-4">
          {overdue > 0 && (
            <button
              type="button"
              onClick={() => setView("tabla")}
              className="mb-4 w-full rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-left text-[12px] text-danger"
            >
              {overdue} {overdue === 1 ? "tarea atrasada" : "tareas atrasadas"}
            </button>
          )}
          {(meta?.subjects.length ?? 0) > 0 && (
            <>
              <div className="mb-1.5 font-mono text-[10.5px] font-semibold uppercase tracking-wider text-faint">Asignaturas</div>
              {meta!.subjects.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setView("tabla");
                    setFilters({ subject: s });
                  }}
                  className="block w-full truncate rounded-md px-2 py-1 text-left text-[12.5px] text-dim hover:bg-hover hover:text-text"
                >
                  {s}
                </button>
              ))}
            </>
          )}
        </div>
      </ModuleSidebar>
      <main className="flex min-w-0 flex-1 flex-col bg-surface">
        {!loaded ? (
          <div className="grid flex-1 place-items-center text-[13px] text-faint">Cargando tareas…</div>
        ) : view === "tabla" ? (
          <TaskTable />
        ) : view === "calendario" ? (
          <TaskCalendar />
        ) : (
          <TaskReminders />
        )}
      </main>
      <TaskDrawer />
    </div>
  );
}
