// Configurar rutinas: the weekly template (repeating blocks).

import { Plus, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../lib/bridge";
import { GCAL_COLOURS } from "../../lib/calendar";
import { formatRepeat, parseRepeat, WEEKDAYS } from "../../lib/tasks";
import type { CalRoutine } from "../../lib/types";
import { useApp } from "../../store/app";
import { useCalendar } from "../../store/calendar";
import { cn, confirmAction, IconButton } from "../ui";

const base = "rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] text-text outline-none focus:border-accent";
const field = `${base} w-full`;
const label = "mb-1 block font-mono text-[10.5px] uppercase tracking-wider text-faint";
const BLANK: Partial<CalRoutine> = { title: "", repeat: "weekly:0,1,2,3,4", start: "08:00", duration_min: 60, colour: "#039be5", notes: "" };

export function RoutinesDialog() {
  const open = useCalendar((s) => s.routinesOpen);
  const setOpen = useCalendar((s) => s.setRoutinesOpen);
  const reload = useCalendar((s) => s.load);
  const toast = useApp((s) => s.toast);
  const [list, setList] = useState<CalRoutine[]>([]);
  const [edit, setEdit] = useState<{ id: string | null; f: Partial<CalRoutine> } | null>(null);

  const refresh = () => api.calRoutines().then(setList).catch((e) => toast("error", (e as Error).message));
  useEffect(() => {
    if (open) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  if (!open) return null;

  const f = edit?.f ?? {};
  const rule = parseRepeat(f.repeat);
  const set = (patch: Partial<CalRoutine>) => setEdit((e) => (e ? { ...e, f: { ...e.f, ...patch } } : e));

  const save = async () => {
    if (!edit) return;
    try {
      await api.calRoutineSave(edit.id, edit.f);
      setEdit(null);
      await refresh();
      void reload();
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/45" onMouseDown={() => setOpen(false)}>
      <div role="dialog" aria-label="Rutinas" className="flex h-[78vh] w-[860px] max-w-[94vw] overflow-hidden rounded-2xl border border-line-strong bg-card shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex w-[360px] flex-none flex-col border-r border-line">
          <div className="flex h-12 items-center gap-2 border-b border-line px-4">
            <span className="text-[14px] font-semibold text-text">Plantilla semanal de rutinas</span>
          </div>
          <ul className="flex-1 space-y-1 overflow-y-auto p-2">
            {list.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => setEdit({ id: r.id, f: { ...r } })}
                  className={cn("flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-hover", edit?.id === r.id && "bg-accent-soft")}>
                  <span className="h-6 w-1.5 flex-none rounded-full" style={{ background: r.colour }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-text">{r.title}</span>
                    <span className="block truncate text-[11.5px] text-faint">{r.describe}{r.start ? ` · ${r.start}` : ""}</span>
                  </span>
                </button>
              </li>
            ))}
            {!list.length && <li className="p-3 text-[12.5px] text-faint">Todavía no hay rutinas.</li>}
          </ul>
          <div className="border-t border-line p-2">
            <button type="button" onClick={() => setEdit({ id: null, f: { ...BLANK } })}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-accent-strong">
              <Plus size={14} /> Nueva rutina
            </button>
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-12 items-center justify-end border-b border-line px-3">
            <IconButton title="Cerrar" onClick={() => setOpen(false)}><X size={15} /></IconButton>
          </div>
          {!edit ? (
            <div className="grid flex-1 place-items-center text-[13px] text-faint">Elige una rutina o crea una nueva.</div>
          ) : (
            <div className="flex-1 space-y-3.5 overflow-y-auto p-5">
              <div><span className={label}>Título</span>
                <input value={f.title ?? ""} onChange={(e) => set({ title: e.target.value })} placeholder="Ej. Estudio Backend" className={field} /></div>
              <div>
                <span className={label}>Días</span>
                <div className="flex gap-1">
                  {WEEKDAYS.map((w, i) => {
                    const on = rule.kind === "daily" || rule.weekdays.includes(i);
                    return (
                      <button key={w} type="button" aria-pressed={on}
                        onClick={() => {
                          const cur = rule.kind === "daily" ? [0, 1, 2, 3, 4, 5, 6] : rule.weekdays;
                          const next = on ? cur.filter((x) => x !== i) : [...cur, i];
                          if (next.length) set({ repeat: formatRepeat({ ...rule, kind: "weekly", weekdays: next }) });
                        }}
                        className={cn("h-8 w-8 rounded-lg text-[12px]", on ? "bg-accent text-white" : "border border-line text-dim hover:bg-hover")}>
                        {w}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><span className={label}>Inicio</span>
                  <input type="time" value={f.start ?? ""} onChange={(e) => set({ start: e.target.value || null })} className={field} /></div>
                <div><span className={label}>Duración (min)</span>
                  <input type="number" min={5} max={1440} value={f.duration_min ?? ""} onChange={(e) => set({ duration_min: e.target.value ? Number(e.target.value) : null })} className={field} /></div>
                <div><span className={label}>Activa desde</span>
                  <input type="date" value={f.active_from ?? ""} onChange={(e) => set({ active_from: e.target.value || null })} className={field} /></div>
                <div><span className={label}>Hasta</span>
                  <input type="date" value={f.active_until ?? ""} onChange={(e) => set({ active_until: e.target.value || null })} className={field} /></div>
              </div>
              <div>
                <span className={label}>Color</span>
                <div className="flex flex-wrap gap-1.5">
                  {GCAL_COLOURS.map(([hex, name]) => (
                    <button key={hex} type="button" title={name} aria-label={name} onClick={() => set({ colour: hex })}
                      className={cn("h-6 w-6 rounded-full", f.colour === hex && "ring-2 ring-text ring-offset-2 ring-offset-card")}
                      style={{ background: hex }} />
                  ))}
                </div>
              </div>
              <div><span className={label}>Notas</span>
                <textarea rows={3} value={f.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} className={cn(field, "resize-y")} /></div>
              <div className="flex items-center pt-1">
                {edit.id && (
                  <button type="button"
                    onClick={async () => {
                      if (!(await confirmAction("Eliminar rutina", `«${f.title}» deja de aparecer en el calendario.`, "Eliminar", true))) return;
                      try {
                        await api.calRoutineRemove(edit.id!);
                        setEdit(null);
                        await refresh();
                        void reload();
                      } catch (e) {
                        toast("error", (e as Error).message);
                      }
                    }}
                    className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] text-danger hover:bg-danger-soft">
                    <Trash2 size={14} /> Eliminar
                  </button>
                )}
                <button type="button" onClick={() => void save()}
                  className="ml-auto rounded-full bg-accent px-5 py-1.5 text-[13px] font-medium text-white hover:bg-accent-strong">
                  Guardar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
