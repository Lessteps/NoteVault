// Sub-goal editor (side panel of the tree): schedule, measure, habits, notes.

import { Plus, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../lib/bridge";
import { REMINDERS } from "../../lib/calendar";
import type { GoalItem, Habit } from "../../lib/types";
import { useApp } from "../../store/app";
import { useGoals } from "../../store/goals";
import { Field, GhostButton, input, Label, PrimaryButton, PRIORITY_NAMES } from "../common/forms";
import { RepeatPicker } from "../common/RepeatPicker";
import { cn, confirmAction, IconButton } from "../ui";
import { TopicLinks } from "./TopicLinks";

export function HabitLinks({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const [habits, setHabits] = useState<Habit[]>([]);
  useEffect(() => {
    api.habitsList().then(setHabits).catch(() => setHabits([]));
  }, []);
  return (
    <div className="flex flex-wrap gap-1.5">
      {habits.map((h) => {
        const on = value.includes(h.id);
        return (
          <button key={h.id} type="button" aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== h.id) : [...value, h.id])}
            className={cn("rounded-full border px-2 py-0.5 text-[11.5px]", on ? "border-[#7c5af0] bg-[#7c5af0]/20 text-text" : "border-line text-dim hover:bg-hover")}>
            {h.icon} {h.name}
          </button>
        );
      })}
      {!habits.length && <span className="text-[11.5px] text-faint">No hay hábitos.</span>}
    </div>
  );
}

export function ItemEditor({ item, onClose }: { item: GoalItem; onClose: () => void }) {
  const detail = useGoals((s) => s.detail)!;
  const meta = useGoals((s) => s.meta);
  const refresh = useGoals((s) => s.refreshAfterWrite);
  const openSubmeta = useGoals((s) => s.openSubmeta);
  const toast = useApp((s) => s.toast);
  const [f, setF] = useState<Partial<GoalItem>>({});
  const [hint, setHint] = useState("");
  useEffect(() => {
    setF({ ...item });
    setHint("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);
  const set = (patch: Partial<GoalItem>) => setF((x) => ({ ...x, ...patch }));
  const g = detail.goal;
  const repeating = Boolean(f.repeat);

  const save = async () => {
    const target = f.target && Number(f.target) > 0 ? f.target : null;
    const time = f.due_time || "";
    const fields: Partial<GoalItem> = {
      name: f.name, category: f.category, is_priority: f.is_priority, priority: f.priority,
      repeat: f.repeat ?? "", start: repeating ? f.start || null : null, repeat_until: repeating ? f.repeat_until || null : null,
      due: repeating ? null : f.due || null, due_time: time,
      duration_min: time ? f.duration_min ?? null : null, reminder_min: time ? f.reminder_min ?? null : null,
      in_calendar: Boolean(f.in_calendar) || Boolean(!repeating && f.due && time),
      target, unit: target ? f.unit ?? "" : "", value: !repeating && f.value !== null && f.value !== undefined && String(f.value) !== "" ? f.value : null,
      habit_links: f.habit_links ?? [], topic_links: f.topic_links ?? [], notes: f.notes ?? "",
    };
    if (item.is_leaf) fields.status = f.status;
    if (fields.in_calendar && !repeating && !fields.due) {
      setHint("Para mostrarla en el calendario ponle una fecha o una repetición.");
      return;
    }
    try {
      await api.goalItemUpdate(g.id, item.id, fields);
      setHint("Guardado ✓");
      await refresh();
    } catch (e) {
      setHint((e as Error).message);
    }
  };

  return (
    <aside className="flex w-[400px] flex-none flex-col border-l border-line bg-panel" aria-label="Editor de submeta">
      <div className="flex h-11 flex-none items-center border-b border-line px-4">
        <span className="font-mono text-[11px] font-semibold uppercase text-faint">{item.is_leaf ? "Submeta" : "Submeta con hijas"}</span>
        <IconButton title="Cerrar" onClick={onClose} className="ml-auto"><X size={15} /></IconButton>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        <input aria-label="Nombre de la submeta" className={cn(input, "text-[14px] font-medium")} value={f.name ?? ""} onChange={(e) => set({ name: e.target.value })} />
        <div className="grid grid-cols-2 gap-2.5">
          {item.is_leaf && (
            <Field label="Estado">
              <select className={input} value={f.status} onChange={(e) => set({ status: e.target.value })}>
                {meta?.item_statuses.map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
          )}
          <Field label="Prioridad">
            <select className={input} value={f.priority} onChange={(e) => set({ priority: Number(e.target.value) })}>
              {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{PRIORITY_NAMES[n]}</option>)}
            </select>
          </Field>
          <Field label="Categoría">
            <input className={input} list="nv-goal-cats-editor" value={f.category ?? ""} onChange={(e) => set({ category: e.target.value })} />
            <datalist id="nv-goal-cats-editor">{detail.categories.map((c) => <option key={c} value={c} />)}</datalist>
          </Field>
          <label className="mt-5 flex items-center gap-2 text-[12px] text-dim">
            <input type="checkbox" checked={Boolean(f.is_priority)} onChange={(e) => set({ is_priority: e.target.checked })} /> ⭐ Prioritaria
          </label>
        </div>
        <div><Label>Repetición</Label><RepeatPicker value={f.repeat ?? ""} onChange={(repeat) => set({ repeat })} /></div>
        {repeating ? (
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Empieza"><input type="date" className={input} value={f.start ?? ""} onChange={(e) => set({ start: e.target.value || null })} /></Field>
            <Field label="Repetir hasta"><input type="date" className={input} value={f.repeat_until ?? ""} onChange={(e) => set({ repeat_until: e.target.value || null })} /></Field>
          </div>
        ) : (
          <Field label="Fecha límite"><input type="date" className={input} value={f.due ?? ""} onChange={(e) => set({ due: e.target.value || null, in_calendar: e.target.value ? true : f.in_calendar })} /></Field>
        )}
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Hora"><input type="time" className={input} value={f.due_time ?? ""} onChange={(e) => set({ due_time: e.target.value, in_calendar: e.target.value ? true : f.in_calendar })} /></Field>
          <Field label="Duración (min)"><input type="number" min={0} className={input} value={f.duration_min ?? ""} onChange={(e) => set({ duration_min: e.target.value ? Number(e.target.value) : null })} /></Field>
          <Field label="Aviso">
            <select className={input} value={f.reminder_min === null || f.reminder_min === undefined ? "" : String(f.reminder_min)}
              onChange={(e) => set({ reminder_min: e.target.value === "" ? null : Number(e.target.value) })}>
              {REMINDERS.map(([v, l]) => <option key={l} value={v === null ? "" : String(v)}>{l}</option>)}
            </select>
          </Field>
          <label className="mt-5 flex items-center gap-2 text-[12px] text-dim">
            <input type="checkbox" checked={Boolean(f.in_calendar)} onChange={(e) => set({ in_calendar: e.target.checked })} /> Mostrar en el calendario
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Objetivo (medible)"><input className={input} value={f.target ?? ""} placeholder="p. ej. 3" onChange={(e) => set({ target: e.target.value === "" ? null : (e.target.value as unknown as number) })} /></Field>
          <Field label="Unidad"><input className={input} value={f.unit ?? ""} placeholder="h, páginas, km…" onChange={(e) => set({ unit: e.target.value })} /></Field>
          {!repeating && f.target ? (
            <Field label="Llevas"><input className={input} value={f.value ?? ""} onChange={(e) => set({ value: e.target.value === "" ? null : (e.target.value as unknown as number) })} /></Field>
          ) : null}
        </div>
        <div><Label>Hábitos vinculados</Label><HabitLinks value={f.habit_links ?? []} onChange={(habit_links) => set({ habit_links })} /></div>
        <div>
          <Label>Temas de estudio</Label>
          <TopicLinks value={f.topic_links ?? []} onChange={(topic_links) => set({ topic_links })} />
          {(f.topic_links ?? []).length > 0 && <p className="mt-1 text-[11px] text-faint">Se cumple sola cuando el estudio de esos temas está dominado.</p>}
        </div>
        <Field label="Notas">
          <textarea rows={4} className={cn(input, "resize-y")} value={f.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} />
        </Field>
      </div>
      <div className="flex flex-none items-center gap-2 border-t border-line p-3">
        <GhostButton danger onClick={async () => {
          const n = detail.items.filter((x) => x.parent === item.id).length;
          if (!(await confirmAction("Eliminar submeta", `¿Eliminar «${item.name}»${n ? " y sus submetas" : ""}? Se mueve a la papelera.`, "Eliminar", true))) return;
          try {
            await api.goalItemDelete(g.id, item.id);
            onClose();
            await refresh();
          } catch (e) {
            toast("error", (e as Error).message);
          }
        }}><Trash2 size={13} /></GhostButton>
        <GhostButton onClick={async () => {
          try {
            await api.goalItemCreate(g.id, "Nueva submeta", item.id);
            await refresh();
          } catch (e) {
            toast("error", (e as Error).message);
          }
        }}><Plus size={13} /> Submeta</GhostButton>
        <GhostButton onClick={() => openSubmeta(item.id)}>🔍 Interfaz ›</GhostButton>
        <span className="min-w-0 flex-1 truncate text-[11px] text-faint">{hint}</span>
        <PrimaryButton onClick={() => void save()}>Guardar</PrimaryButton>
      </div>
    </aside>
  );
}
