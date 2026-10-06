import { BarChart3, CalendarDays, CalendarRange, Sun, Tag, Target } from "lucide-react";
import { useEffect } from "react";
import { formatMoney } from "../../lib/money";
import { useFinance, type FinView } from "../../store/finance";
import { ModuleSidebar } from "../ModuleSidebar";
import { Categories, CategoryDialog } from "./Categories";
import { Diario } from "./Diario";
import { FinGoalDialog, FinGoals } from "./Goals";
import { MovementDialog } from "./MovementDialog";
import { Sheet } from "./Sheets";

export function FinanceModule() {
  const view = useFinance((s) => s.view);
  const setView = useFinance((s) => s.setView);
  const load = useFinance((s) => s.load);
  const loaded = useFinance((s) => s.loaded);
  const sidebar = useFinance((s) => s.sidebar);
  const openGoal = useFinance((s) => s.openGoal);

  useEffect(() => {
    void load();
  }, [load]);

  const m = sidebar?.month;
  return (
    <div className="flex min-w-0 flex-1">
      <ModuleSidebar title="Finanzas" active={view} onSelect={(id) => setView(id as FinView)}
        items={[
          { id: "diario", label: "Diario", icon: <Sun />, badge: sidebar?.pending || "" },
          { id: "semanal", label: "Semanal", icon: <CalendarRange /> },
          { id: "mensual", label: "Mensual", icon: <CalendarDays /> },
          { id: "anual", label: "Anual", icon: <BarChart3 /> },
          { id: "metas", label: "Metas financieras", icon: <Target /> },
          { id: "categorias", label: "Categorías", icon: <Tag /> },
        ]}>
        {m && (
          <div className="space-y-4 px-4 pt-4">
            <div>
              <div className="mb-1 font-mono text-[10.5px] font-semibold uppercase tracking-wider text-faint">Ahorro total</div>
              <div className="text-[18px] font-semibold text-text">{formatMoney(sidebar!.total_saved)}</div>
              {sidebar!.goals.map((g) => (
                <button key={g.id} type="button" onClick={() => openGoal(g.id)} className="block w-full truncate text-left text-[11.5px] text-dim hover:text-text">
                  {g.icon} {g.name}: {formatMoney(g.saved)}
                </button>
              ))}
              {sidebar!.general !== 0 && <div className="text-[11.5px] text-faint">General: {formatMoney(sidebar!.general)}</div>}
            </div>
          </div>
        )}
      </ModuleSidebar>
      <main className="flex min-w-0 flex-1 flex-col bg-surface">
        {!loaded ? <div className="grid flex-1 place-items-center text-[13px] text-faint">Cargando finanzas…</div>
          : view === "diario" ? <Diario />
            : view === "semanal" || view === "mensual" || view === "anual" ? <Sheet key={view} kind={view} />
              : view === "metas" ? <FinGoals /> : <Categories />}
      </main>
      <MovementDialog />
      <FinGoalDialog />
      <CategoryDialog />
    </div>
  );
}
