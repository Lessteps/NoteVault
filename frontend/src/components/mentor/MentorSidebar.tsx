// Mentor — la barra lateral: los ítems del modo en curso arriba y, al pie, el interruptor Planeación | Ejecución y el selector de plan.

import { LayoutGrid } from "lucide-react";
import { useNavState } from "../../store/navState";
import { cn } from "../ui";
import { ModuleSidebar, type SidebarItem } from "../ModuleSidebar";
import { MentorModeSwitch } from "./MentorModeSwitch";
import { MentorPlanSelector } from "./MentorPlanSelector";
import { AREAS_VIEW, type MentorMode } from "./mentorNav";

export function MentorSidebar({ items, active, onSelect, mode, onMode, currentPlanId, currentBuildId, areasActive }: {
  items: SidebarItem[];
  active: string;
  onSelect: (id: string) => void;
  mode: MentorMode;
  onMode: (m: MentorMode) => void;
  currentPlanId?: string;
  currentBuildId?: string;
  /** la ruta en pantalla es «Áreas» */
  areasActive?: boolean;
}) {
  return (
    <ModuleSidebar
      title="Mentor"
      items={items}
      active={active}
      onSelect={onSelect}
      footer={
        <div className="flex flex-none flex-col gap-1.5 border-t border-line p-2">
          <MentorModeSwitch mode={mode} onChange={onMode} />
          <MentorPlanSelector {...(currentPlanId ? { currentPlanId } : {})} {...(currentBuildId ? { currentBuildId } : {})} />
          <button
            type="button"
            onClick={() => useNavState.getState().set("mentor.view", AREAS_VIEW)}
            aria-current={areasActive ? "page" : undefined}
            title="Avance de cada espacio, área y tema (solo lectura)"
            data-testid="mentor-areas-link"
            className={cn("flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[12px] hover:bg-hover hover:text-text", areasActive ? "bg-accent-soft text-text" : "text-dim")}
          >
            <LayoutGrid size={13} className={cn("flex-none", areasActive && "text-accent-text")} aria-hidden />
            <span className="min-w-0 flex-1 truncate">Áreas</span>
          </button>
        </div>
      }
    />
  );
}
