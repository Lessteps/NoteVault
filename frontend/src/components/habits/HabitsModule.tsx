import { CalendarDays, CalendarRange, LayoutGrid, ListChecks, Settings2, Sun } from "lucide-react";
import { useEffect } from "react";
import { pct } from "../../lib/habits";
import { useHabits, type HabitsView } from "../../store/habits";
import { ModuleSidebar } from "../ModuleSidebar";
import { HabitDaily } from "./HabitDaily";
import { HabitMonth, HabitWeek } from "./HabitGrid";
import { HabitManage } from "./HabitManage";
import { HabitOverview } from "./HabitOverview";
import { HabitYear } from "./HabitYear";
import { Bar, Empty } from "./parts";

function SideStats() {
  const stats = useHabits((s) => s.stats);
  const rows: Array<[string, number]> = [
    ["Hoy", stats?.day ?? 0], ["Semana", stats?.week ?? 0], ["Mes", stats?.month ?? 0], ["Año", stats?.year ?? 0],
  ];
  return (
    <div className="px-4 pt-4">
      <div className="mb-2 font-mono text-[10.5px] font-semibold uppercase tracking-wider text-faint">Estadísticas</div>
      <div className="space-y-2.5">
        {rows.map(([l, v]) => (
          <div key={l}>
            <div className="mb-1 flex text-[12px] text-dim"><span>{l}</span><span className="ml-auto font-mono">{pct(v)}</span></div>
            <Bar value={v} />
          </div>
        ))}
        <div className="pt-1 text-[12px] text-dim">
          Racha actual: <b className="text-text">{stats?.streak ?? 0}</b> {stats?.streak === 1 ? "día" : "días"}
        </div>
      </div>
    </div>
  );
}

export function HabitsModule() {
  const view = useHabits((s) => s.view);
  const setView = useHabits((s) => s.setView);
  const load = useHabits((s) => s.load);
  const loaded = useHabits((s) => s.loaded);
  const habits = useHabits((s) => s.habits);
  const log = useHabits((s) => s.log);
  const add = useHabits((s) => s.add);

  useEffect(() => {
    void load();
  }, [load]);

  const pendingToday = log ? log.active.filter((id) => !log.completed[id]).length : 0;

  return (
    <div className="flex min-w-0 flex-1">
      <ModuleSidebar
        title="Hábitos"
        active={view}
        onSelect={(id) => setView(id as HabitsView)}
        items={[
          { id: "general", label: "Vista general", hint: "Rachas y porcentajes", icon: <LayoutGrid /> },
          { id: "diaria", label: "Diaria", hint: "Checklist y diario", icon: <Sun />, badge: pendingToday },
          { id: "semanal", label: "Semanal", icon: <CalendarRange /> },
          { id: "mensual", label: "Mensual", icon: <CalendarDays /> },
          { id: "anual", label: "Anual", icon: <ListChecks /> },
          { id: "gestionar", label: "Gestionar hábitos", hint: `${habits.length} hábitos`, icon: <Settings2 /> },
        ]}
      >
        <SideStats />
      </ModuleSidebar>
      <main className="flex min-w-0 flex-1 flex-col bg-surface">
        {!loaded ? (
          <div className="grid flex-1 place-items-center text-[13px] text-faint">Cargando hábitos…</div>
        ) : !habits.length && view !== "gestionar" ? (
          <Empty onAdd={() => {
            setView("gestionar");
            void add();
          }} />
        ) : view === "general" ? <HabitOverview />
          : view === "diaria" ? <HabitDaily />
            : view === "semanal" ? <HabitWeek />
              : view === "mensual" ? <HabitMonth />
                : view === "anual" ? <HabitYear />
                  : <HabitManage />}
      </main>
    </div>
  );
}
