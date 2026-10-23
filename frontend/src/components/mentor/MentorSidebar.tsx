// Mentor — la barra lateral: los ítems del modo en curso arriba y, al pie, el interruptor Planeación | Ejecución y el selector de plan.

import { ModuleSidebar, type SidebarItem } from "../ModuleSidebar";
import { MentorModeSwitch } from "./MentorModeSwitch";
import { MentorPlanSelector } from "./MentorPlanSelector";
import type { MentorMode } from "./mentorNav";

export function MentorSidebar({ items, active, onSelect, mode, onMode, currentPlanId, currentBuildId }: {
  items: SidebarItem[];
  active: string;
  onSelect: (id: string) => void;
  mode: MentorMode;
  onMode: (m: MentorMode) => void;
  currentPlanId?: string;
  currentBuildId?: string;
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
        </div>
      }
    />
  );
}
