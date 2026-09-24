// Gestionar hábitos: the list (reorder, add, remove) and the editor.

import { ArrowDown, ArrowUp, Plus, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { formatRepeat, parseRepeat, WEEKDAYS } from "../../lib/tasks";
import type { Habit, HabitFields } from "../../lib/types";
import { useHabits } from "../../store/habits";
import { cn, confirmAction, IconButton } from "../ui";
import { Header } from "./parts";

const base = "rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] text-text outline-none focus:border-accent";
const field = `${base} w-full`;
const labelCls = "mb-1 block font-mono text-[10.5px] uppercase tracking-wider text-faint";

type Mode = "weekdays" | "every" | "monthly";

function Schedule({ habit, onSave }: { habit: Habit; onSave: (f: HabitFields) => void }) {
  const rule = parseRepeat(habit.repeat);
  const mode: Mode = rule.kind === "every" ? "every" : rule.kind === "monthly" ? "monthly" : "weekdays";
  const [monthDays, setMonthDays] = useState(rule.monthDays.join(", "));
  useEffect(() => setMonthDays(parseRepeat(habit.repeat).monthDays.join(", ")), [habit.repeat]);

  return (
    <div className="space-y-2">
      <select
        className={field}
        value={mode}
        onChange={(e) => {
          const m = e.target.value as Mode;
          if (m === "weekdays") onSave({ days: [0, 1, 2, 3, 4, 5, 6], repeat: "" });
          else if (m === "every") onSave({ repeat: "every:2" });
          else onSave({ repeat: "monthly:1" });
        }}
      >
        <option value="weekdays">Días de la semana</option>
        <option value="every">Cada N días</option>
        <option value="monthly">Días del mes</option>
      </select>
      {mode === "weekdays" && (
        <div className="flex gap-1">
          {WEEKDAYS.map((w, i) => {
            const on = habit.days.includes(i);
            return (
              <button
                key={w}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  const next = on ? habit.days.filter((d) => d !== i) : [...habit.days, i];
                  if (next.length) onSave({ days: next.sort(), repeat: "" });
                }}
                className={cn(
                  "h-8 w-8 rounded-lg border text-[12px] font-medium",
                  on ? "border-transparent bg-accent text-white" : "border-line text-dim hover:bg-hover",
                )}
              >
                {w}
              </button>
            );
          })}
        </div>
      )}
      {mode === "every" && (
        <label className="flex items-center gap-2 text-[13px] text-dim">
          Cada
          <input
            type="number"
            min={2}
            max={365}
            defaultValue={rule.every}
            key={habit.repeat}
            onBlur={(e) => onSave({ repeat: formatRepeat({ ...rule, kind: "every", every: Number(e.target.value) || 2 }) })}
            className={cn(base, "w-20")}
          />
          días
        </label>
      )}
      {mode === "monthly" && (
        <input
          value={monthDays}
          onChange={(e) => setMonthDays(e.target.value)}
          onBlur={() => {
            const text = formatRepeat({ ...parseRepeat(`monthly:${monthDays.replace(/\s/g, "")}`), kind: "monthly" });
            if (text) onSave({ repeat: text });
            else setMonthDays(rule.monthDays.join(", "));
          }}
          placeholder="1, 15"
          className={field}
        />
      )}
      <p className="text-[11.5px] text-faint">{habit.schedule}</p>
    </div>
  );
}

function Editor({ habit }: { habit: Habit }) {
  const update = useHabits((s) => s.update);
  const remove = useHabits((s) => s.remove);
  const addSubtask = useHabits((s) => s.addSubtask);
  const removeSubtask = useHabits((s) => s.removeSubtask);
  const edit = useHabits((s) => s.edit);
  const [sub, setSub] = useState("");
  const save = (f: HabitFields) => void update(habit.id, f);

  // Text fields save on blur; `key` resets them when the habit changes.
  const text = (k: "name" | "icon" | "notes" | "area", placeholder = "") => (
    <input
      key={`${habit.id}-${k}-${habit[k] ?? ""}`}
      defaultValue={habit[k] ?? ""}
      placeholder={placeholder}
      onBlur={(e) => {
        if (e.target.value !== (habit[k] ?? "")) save({ [k]: e.target.value });
      }}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      className={field}
    />
  );
  const date = (k: "start_date" | "end_date" | "paused_from") => (
    <input
      type="date"
      value={habit[k] ?? ""}
      onChange={(e) => save({ [k]: e.target.value || null } as HabitFields)}
      className={field}
    />
  );
  const num = (k: "duration_min" | "reminder_min") => (
    <input
      key={`${habit.id}-${k}-${habit[k] ?? ""}`}
      type="number"
      min={0}
      max={1440}
      defaultValue={habit[k] ?? ""}
      placeholder="—"
      onBlur={(e) => save({ [k]: e.target.value === "" ? null : Number(e.target.value) } as HabitFields)}
      className={field}
    />
  );

  return (
    <aside className="flex w-[380px] flex-none flex-col border-l border-line bg-panel">
      <div className="flex h-12 flex-none items-center gap-2 border-b border-line px-4">
        <span className="text-[18px]">{habit.icon}</span>
        <span className="truncate text-[13.5px] font-semibold text-text">{habit.name}</span>
        <IconButton title="Cerrar" onClick={() => edit(null)} className="ml-auto"><X size={15} /></IconButton>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <div className="grid grid-cols-[64px_1fr] gap-2">
          <div><span className={labelCls}>Icono</span>{text("icon")}</div>
          <div><span className={labelCls}>Nombre</span>{text("name")}</div>
        </div>
        <div><span className={labelCls}>Se repite</span><Schedule habit={habit} onSave={save} /></div>
        <div className="grid grid-cols-2 gap-2">
          <div><span className={labelCls}>Desde</span>{date("start_date")}</div>
          <div><span className={labelCls}>Hasta</span>{date("end_date")}</div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className={labelCls}>Hora</span>
            <input type="time" value={habit.time ?? ""} onChange={(e) => save({ time: e.target.value || null } as HabitFields)} className={field} />
          </div>
          <div><span className={labelCls}>Duración (min)</span>{num("duration_min")}</div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><span className={labelCls}>Aviso (min antes)</span>{num("reminder_min")}</div>
          <div>
            <span className={labelCls}>Color</span>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={habit.colour ?? "#8b7cf6"}
                onChange={(e) => save({ colour: e.target.value })}
                className="h-8 w-10 cursor-pointer rounded border border-line bg-transparent"
              />
              {habit.colour && (
                <button type="button" onClick={() => save({ colour: "" })} className="text-[11.5px] text-faint hover:text-text">
                  Quitar
                </button>
              )}
            </div>
          </div>
        </div>
        <label className="flex items-center gap-2 text-[13px] text-dim">
          <input
            type="checkbox"
            className="accent-[var(--nv-accent)]"
            checked={Boolean(habit.in_calendar)}
            onChange={(e) => save({ in_calendar: e.target.checked })}
          />
          Mostrar en el calendario
        </label>
        <div>
          <span className={labelCls}>Pausado desde</span>
          {date("paused_from")}
        </div>
        <div><span className={labelCls}>Área</span>{text("area", "Salud, estudio…")}</div>
        <div><span className={labelCls}>Notas</span>{text("notes")}</div>
        <div>
          <span className={labelCls}>Subtareas</span>
          <ul className="mb-2 space-y-1">
            {habit.subtasks.map((s) => (
              <li key={s.id} className="group flex items-center gap-2 rounded-md px-1 text-[13px] text-dim hover:bg-hover">
                <span className="flex-1 truncate">{s.name}</span>
                <IconButton title="Quitar subtarea" onClick={() => void removeSubtask(habit.id, s.id)} className="opacity-0 group-hover:opacity-100">
                  <X size={13} />
                </IconButton>
              </li>
            ))}
          </ul>
          <input
            value={sub}
            onChange={(e) => setSub(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && sub.trim()) {
                void addSubtask(habit.id, sub.trim());
                setSub("");
              }
            }}
            placeholder="Añadir subtarea…"
            className={field}
          />
        </div>
      </div>
      <div className="border-t border-line p-3">
        <button
          type="button"
          onClick={async () => {
            if (await confirmAction("Eliminar hábito", `«${habit.name}» deja de aparecer. Los registros de días pasados se conservan.`, "Eliminar", true)) {
              void remove(habit.id);
            }
          }}
          className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12.5px] text-danger hover:bg-danger-soft"
        >
          <Trash2 size={14} /> Eliminar hábito
        </button>
      </div>
    </aside>
  );
}

export function HabitManage() {
  const habits = useHabits((s) => s.habits);
  const editingId = useHabits((s) => s.editingId);
  const edit = useHabits((s) => s.edit);
  const add = useHabits((s) => s.add);
  const move = useHabits((s) => s.move);
  const editing = habits.find((h) => h.id === editingId);

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <Header title="Gestionar hábitos">
          <button
            type="button"
            onClick={() => void add()}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-accent-strong"
          >
            <Plus size={14} /> Nuevo hábito
          </button>
        </Header>
        <ul className="flex-1 space-y-1.5 overflow-y-auto p-6">
          {habits.map((h, i) => (
            <li
              key={h.id}
              className={cn(
                "group flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5",
                h.id === editingId ? "border-accent" : "border-line",
              )}
            >
              <span className="h-6 w-1.5 rounded-full" style={{ background: h.colour || "var(--nv-line-strong)" }} />
              <button type="button" onClick={() => edit(h.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <span className="w-6 text-center text-[16px]">{h.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] text-text">{h.name}</span>
                  <span className="block truncate text-[11.5px] text-faint">
                    {h.schedule}{h.subtasks.length ? ` · ${h.subtasks.length} subtareas` : ""}{h.area ? ` · ${h.area}` : ""}
                  </span>
                </span>
              </button>
              <span className="flex opacity-0 group-hover:opacity-100">
                <IconButton title="Subir" disabled={i === 0} onClick={() => void move(h.id, -1)}><ArrowUp size={14} /></IconButton>
                <IconButton title="Bajar" disabled={i === habits.length - 1} onClick={() => void move(h.id, 1)}><ArrowDown size={14} /></IconButton>
              </span>
            </li>
          ))}
          {!habits.length && <li className="text-[13px] text-faint">No hay hábitos. Crea uno con «Nuevo hábito».</li>}
        </ul>
      </div>
      {editing && <Editor key={editing.id} habit={editing} />}
    </div>
  );
}
