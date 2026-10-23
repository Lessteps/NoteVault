// Mentor — de los enlaces de `mentorNav` a los ítems de la barra lateral (con sus iconos).

import { BookOpenCheck, CalendarDays, ClipboardList, Dumbbell, FolderKanban, Layers, MessageSquareText, NotebookText, PackageCheck, Sun } from "lucide-react";
import type { ReactNode } from "react";
import type { MentorPlan } from "../../lib/types";
import type { SidebarItem } from "../ModuleSidebar";
import { focusColour } from "./agendaKit";
import { ejecucionLinks, PLAN_NAV_PREFIX, planeacionLinks, type NavLink, type RunLink, type RunLinkOptions } from "./mentorNav";

const dot = (colour?: string): ReactNode => <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: colour ?? "currentColor" }} />;

const PLAN_ICON: Record<string, ReactNode> = {
  plan: <ClipboardList />,
  agenda: <CalendarDays />,
  practica: <Dumbbell />,
  entregables: <PackageCheck />,
  cambios: <MessageSquareText />,
};

const toItem = (l: NavLink, icon: ReactNode): SidebarItem => ({
  id: l.id,
  label: l.label,
  icon,
  ...(l.hint ? { hint: l.hint } : {}),
  ...(l.badge ? { badge: l.badge } : {}),
  ...(l.subs?.length ? { subItems: l.subs.map((s) => toItem(s, dot())) } : {}),
});

export function planeacionItems(plan: Pick<MentorPlan, "programmingPractice">, pendingDeliverables: number): SidebarItem[] {
  return planeacionLinks(plan, pendingDeliverables).map((l) => toItem(l, PLAN_ICON[l.id.slice(PLAN_NAV_PREFIX.length)] ?? <ClipboardList />));
}

const runIcon = (l: RunLink): ReactNode =>
  l.tab === "general" ? <Sun /> : l.tab === "bases" ? <Layers /> : l.tab === "proyectos" ? <FolderKanban /> : l.tab === "registros" ? <NotebookText /> : l.tab.startsWith("area:") ? dot(focusColour(l.areaId)) : <BookOpenCheck />;

export function ejecucionItems(plan: Pick<MentorPlan, "subplans">, opts?: RunLinkOptions): SidebarItem[] {
  return ejecucionLinks(plan, opts).map((l) => toItem(l, runIcon(l)));
}
