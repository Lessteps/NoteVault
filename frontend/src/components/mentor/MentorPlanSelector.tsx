// Mentor — el selector de plan al pie de la barra lateral (como el selector de vault del explorador de notas): enseña el plan en pantalla y, al
// pulsarlo, abre una lista con los planes y los planes en construcción para elegir uno, más «Crear plan» y «Todos los planes».

import { CalendarRange, ChevronsUpDown, LayoutList, ListChecks, Plus } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { planViewId, useMentor } from "../../store/mentor";
import { useNavState } from "../../store/navState";
import { cn } from "../ui";
import { BUILD_PREFIX, CREATE_VIEW, OVERVIEW_VIEW } from "./mentorNav";
import { STATUS_LABEL } from "./planShared";

export function MentorPlanSelector({ currentPlanId, currentBuildId }: { currentPlanId?: string; currentBuildId?: string }) {
  const plans = useMentor((s) => s.plans);
  const builds = useMentor((s) => s.builds);
  const hasPlanDraft = useMentor((s) => (s.turns.find((t) => t.id === s.pending)?.planDraft ? 1 : 0));
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent): void => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const goto = (view: string): void => {
    useNavState.getState().set("mentor.view", view);
    setOpen(false);
  };
  const current = plans.find((p) => p.id === currentPlanId)?.name ?? builds.find((b) => b.id === currentBuildId)?.name;
  const label = current ?? (plans.length || builds.length ? "Elegir plan" : "Sin plan");

  return (
    <div ref={box} className="relative" data-testid="mentor-plan-selector">
      <button
        type="button"
        title="Cambiar de plan"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        data-testid="mentor-plan-selector-btn"
        className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[12px] text-mint hover:bg-hover hover:text-text"
      >
        <CalendarRange size={13} className="flex-none" aria-hidden />
        <span className="min-w-0 flex-1 truncate" data-testid="mentor-plan-current">{label}</span>
        <ChevronsUpDown size={12} className="flex-none text-faint" aria-hidden />
      </button>
      {open && (
        <div role="listbox" aria-label="Planes" className="absolute bottom-full left-0 right-0 z-30 mb-1 max-h-[60vh] overflow-y-auto rounded-lg border border-line bg-panel p-1 shadow-lg" data-testid="mentor-plan-list">
          {builds.map((b) => (
            <Option key={b.id} on={b.id === currentBuildId} onClick={() => goto(`${BUILD_PREFIX}${b.id}`)} testid={`plan-option-build-${b.id}`} icon={<ListChecks size={14} aria-hidden />} name={b.name} hint={`en construcción · etapa ${b.stageNumber}/${b.stages}`} />
          ))}
          {plans.map((p) => (
            <Option key={p.id} on={p.id === currentPlanId} onClick={() => goto(planViewId(p.id))} testid={`plan-option-${p.id}`} icon={<CalendarRange size={14} aria-hidden />} name={p.name} hint={`${p.period} · ${STATUS_LABEL[p.status]} · ${p.pct} %`} />
          ))}
          {plans.length === 0 && builds.length === 0 && <p className="px-2 py-2 text-[12px] text-faint">Aún no tienes ningún plan.</p>}
          <div className="mt-1 flex flex-col gap-0.5 border-t border-line pt-1">
            <button type="button" onClick={() => goto(CREATE_VIEW)} data-testid="plan-create" className="flex items-center gap-2 rounded-md bg-accent px-2 py-1.5 text-left text-[12.5px] font-semibold text-white hover:opacity-90">
              <Plus size={14} aria-hidden /> Crear plan
            </button>
            <button type="button" onClick={() => goto(OVERVIEW_VIEW)} data-testid="plan-all" className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] text-dim hover:bg-hover hover:text-text">
              <LayoutList size={14} aria-hidden /> <span className="flex-1">Todos los planes</span>
              {hasPlanDraft > 0 && <span className="rounded-md bg-accent-soft px-1.5 font-mono text-[10.5px] text-accent-text">borrador</span>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Option({ on, onClick, testid, icon, name, hint }: { on: boolean; onClick: () => void; testid: string; icon: ReactNode; name: string; hint: string }) {
  return (
    <button type="button" role="option" aria-selected={on} onClick={onClick} data-testid={testid} className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left", on ? "bg-accent-soft text-text" : "text-dim hover:bg-hover hover:text-text")}>
      <span className={cn("flex-none", on && "text-accent-text")}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px]">{name}</span>
        <span className="block truncate text-[11px] text-faint">{hint}</span>
      </span>
    </button>
  );
}
