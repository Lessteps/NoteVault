// What a click on a calendar block does: open the editor for events,
// routines and tasks; a small menu (tick / open the module) for the rest.

import { Check, ExternalLink, Pencil, Undo2 } from "lucide-react";
import type { Occurrence } from "../../lib/types";
import { useApp, type ModuleId } from "../../store/app";
import { useCalendar } from "../../store/calendar";
import { openMenu, type MenuItem } from "../ui";

const MODULE_OF: Record<string, [ModuleId, string]> = {
  metas: ["metas", "Metas"], proyectos: ["proyectos", "Proyectos"], finanzas: ["finanzas", "Finanzas"],
  habit: ["habits", "Hábitos"], exercise: ["ejercicio", "Ejercicio"], project: ["proyectos", "Proyectos"],
};

export function activate(occ: Occurrence, e: { clientX: number; clientY: number; preventDefault: () => void }) {
  const cal = useCalendar.getState();
  if (occ.kind === "event" || occ.kind === "routine" || occ.kind === "task") {
    void cal.openEdit(occ);
    return;
  }
  const items: MenuItem[] = [];
  if (occ.checkable) {
    items.push(occ.done
      ? { label: "Desmarcar", icon: <Undo2 />, onSelect: () => void cal.setDone(occ, false) }
      : { label: "Marcar como hecho", icon: <Check />, onSelect: () => void cal.setDone(occ, true) });
  }
  const target = MODULE_OF[occ.source] ?? MODULE_OF[occ.kind];
  if (target) {
    items.push({
      label: occ.id.startsWith("habit:") ? "Editar hábito…" : `Abrir en ${target[1]}`,
      icon: occ.id.startsWith("habit:") ? <Pencil /> : <ExternalLink />,
      onSelect: () => useApp.getState().setModule(target[0]),
    });
  }
  if (items.length) openMenu(e, items);
}

export function canDrag(occ: Occurrence): boolean {
  return Boolean(occ.start) && (occ.kind === "event" || occ.kind === "routine" || (occ.kind === "task" && occ.editable));
}
