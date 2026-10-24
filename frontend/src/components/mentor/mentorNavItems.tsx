// Mentor — de los enlaces de `mentorNav` a los ítems de la barra lateral (con sus iconos).

import { BookOpenCheck, ClipboardList, Dumbbell, FolderKanban, Layers, LayoutList, MessageSquareText, NotebookText, PackageCheck, Sun, Wrench } from "lucide-react";
import type { ReactNode } from "react";
import type { MentorPlan } from "../../lib/types";
import type { SidebarItem } from "../ModuleSidebar";
import { focusColour } from "./agendaKit";
import { ejecucionLinks, PLAN_NAV_PREFIX, planeacionLinks, type NavLink, type RunHint, type RunLink, type RunLinkOptions } from "./mentorNav";

const dot = (colour?: string): ReactNode => <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: colour ?? "currentColor" }} />;

/** Los ítems llevan un icono de línea (la Vista general, Bases y los de «Más») o un punto del color del área: nunca un emoji. */
const PLAN_ICON: Record<string, ReactNode> = {
  practica: <Dumbbell />,
  entregables: <PackageCheck />,
  registros: <NotebookText />,
  preparar: <Wrench />,
  cambios: <MessageSquareText />,
  general: <LayoutList />,
  bases: <Layers />,
};

const toItem = (l: NavLink, icon: ReactNode): SidebarItem => ({
  id: l.id,
  label: l.label,
  icon,
  ...(l.hint ? { hint: l.hint } : {}),
  ...(l.badge ? { badge: l.badge } : {}),
  ...(l.section ? { sectionLabel: l.section } : {}),
  ...(l.subs?.length ? { subItems: l.subs.map((s) => toItem(s, dot())) } : {}),
});

export function planeacionItems(plan: Pick<MentorPlan, "programmingPractice" | "subplans">, pendingDeliverables: number, hints?: ReadonlyMap<string, RunHint>): SidebarItem[] {
  return planeacionLinks(plan, pendingDeliverables, hints ? { hints } : {}).map((l) => toItem(l, l.areaId ? dot(focusColour(l.areaId)) : PLAN_ICON[l.id.slice(PLAN_NAV_PREFIX.length)] ?? <ClipboardList />));
}

const runIcon = (l: RunLink): ReactNode =>
  l.tab === "general" ? <Sun /> : l.tab === "bases" ? <Layers /> : l.tab === "proyectos" ? <FolderKanban /> : l.tab === "registros" ? <NotebookText /> : l.tab.startsWith("area:") ? dot(focusColour(l.areaId)) : <BookOpenCheck />;

export function ejecucionItems(plan: Pick<MentorPlan, "subplans">, opts?: RunLinkOptions): SidebarItem[] {
  return ejecucionLinks(plan, opts).map((l) => toItem(l, runIcon(l)));
}
