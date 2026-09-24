import { Plus, Trash2, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import {
  addSubtask, formatRepeat, parseRepeat, parseSubtasks, removeSubtask, setSubtask, WEEKDAYS,
  type Repeat, type RepeatKind,
} from "../../lib/tasks";
import type { Task } from "../../lib/types";
import { useTasks } from "../../store/tasks";
import { cn, confirmAction } from "../ui";
import { DateInput, PriorityStars, StatusSelect } from "./controls";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] items-center gap-3 py-1.5">
      <span className="text-[12px] text-faint">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

const REPEAT_OPTIONS: Array<[RepeatKind, string]> = [
  ["none", "No se repite"],
  ["daily", "Todos los días"],
  ["workdays", "Días laborables"],
  ["weekly", "Días de la semana…"],
  ["every", "Cada N días…"],
  ["monthly", "Días del mes…"],
];

function RepeatEditor({ task }: { task: Task }) {
  const update = useTasks((s) => s.update);
  const [r, setR] = useState<Repeat>(() => parseRepeat(task.repeat));
  useEffect(() => setR(parseRepeat(task.repeat)), [task.repeat]);
  const save = (next: Repeat) => {
    setR(next);
    const text = formatRepeat(next);
    if (text !== task.repeat && (next.kind === "none" || text)) void update(task.id, { repeat: text });
  };
  return (
    <div className="flex flex-col gap-2">
      <select
        value={r.kind}
        onChange={(e) => {
          const kind = e.target.value as RepeatKind;
          const today = (new Date().getDay() + 6) % 7;
          save({
            ...r,
            kind,
            weekdays: kind === "weekly" && !r.weekdays.length ? [today] : r.weekdays,
            monthDays: kind === "monthly" && !r.monthDays.length ? [new Date().getDate()] : r.monthDays,
          });
        }}
        className="h-8 w-full rounded-lg border border-line bg-surface px-2 text-[12.5px] text-text outline-none focus:border-accent"
      >
        {REPEAT_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      {r.kind === "weekly" && (
        <div className="flex gap-1">
          {WEEKDAYS.map((d, i) => {
            const on = r.weekdays.includes(i);
            return (
              <button
                key={d}
                type="button"
                onClick={() => {
                  const days = on ? r.weekdays.filter((x) => x !== i) : [...r.weekdays, i];
                  if (days.length) save({ ...r, weekdays: days });
                }}
                className={cn(
                  "h-7 w-7 rounded-md border text-[11.5px] font-semibold",
                  on ? "border-accent bg-accent text-white" : "border-line text-dim hover:bg-hover",
                )}
              >
                {d}
              </button>
            );
          })}
        </div>
      )}
      {r.kind === "every" && (
        <label className="flex items-center gap-2 text-[12.5px] text-dim">
          Cada
          <input
            type="number"
            min={2}
            max={365}
            value={r.every}
            onChange={(e) => save({ ...r, every: Number(e.target.value) || 2 })}
            className="h-7 w-16 rounded-md border border-line bg-surface px-2 text-text outline-none focus:border-accent"
          />
          días
        </label>
      )}
      {r.kind === "monthly" && (
        <input
          defaultValue={r.monthDays.join(", ")}
          key={task.repeat}
          placeholder="1, 15"
          onBlur={(e) => {
            const days = e.target.value.split(",").map((x) => Number(x.trim())).filter((n) => n >= 1 && n <= 31);
            if (days.length) save({ ...r, monthDays: days });
          }}
          className="h-8 w-full rounded-lg border border-line bg-surface px-2 text-[12.5px] text-text outline-none focus:border-accent"
        />
      )}
      {task.repeat && <span className="text-[11.5px] text-accent-text">{task.repeat_label}</span>}
    </div>
  );
}

function Subtasks({ task }: { task: Task }) {
  const update = useTasks((s) => s.update);
  const [draft, setDraft] = useState("");
  const subs = parseSubtasks(task.body);
  const done = subs.filter((s) => s.done).length;
  return (
    <section className="border-t border-line px-5 py-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-mono text-[10.5px] font-semibold uppercase tracking-wider text-faint">Subtareas</h3>
        {subs.length > 0 && <span className="font-mono text-[10.5px] text-faint">{done}/{subs.length}</span>}
      </div>
      {subs.length > 0 && (
        <div className="mb-2 h-1 overflow-hidden rounded-full bg-elevated">
          <div className="h-full bg-mint transition-all" style={{ width: `${(done / subs.length) * 100}%` }} />
        </div>
      )}
      <div className="flex flex-col">
        {subs.map((s) => (
          <div key={s.line} className="group flex items-center gap-2 rounded-md px-1 py-1 hover:bg-hover">
            <input
              type="checkbox"
              checked={s.done}
              onChange={(e) => void update(task.id, { body: setSubtask(task.body, s.line, e.target.checked) })}
              className="h-4 w-4 cursor-pointer accent-[var(--nv-accent)]"
            />
            <span className={cn("flex-1 text-[13px]", s.done ? "text-faint line-through" : "text-text")}>{s.title}</span>
            <button
              type="button"
              title="Quitar"
              onClick={() => void update(task.id, { body: removeSubtask(task.body, s.line) })}
              className="text-faint opacity-0 hover:text-danger group-hover:opacity-100"
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
      <form
        className="mt-1 flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.trim()) return;
          void update(task.id, { body: addSubtask(task.body, draft) });
          setDraft("");
        }}
      >
        <Plus size={14} className="text-faint" />
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Añadir subtarea…"
          className="h-8 flex-1 bg-transparent text-[13px] text-text outline-none placeholder:text-faint"
        />
      </form>
    </section>
  );
}

export function TaskDrawer() {
  const task = useTasks((s) => s.tasks.find((t) => t.id === s.openId));
  const meta = useTasks((s) => s.meta);
  const update = useTasks((s) => s.update);
  const remove = useTasks((s) => s.remove);
  const close = () => useTasks.getState().open(null);
  const [body, setBody] = useState("");
  const [name, setName] = useState("");

  useEffect(() => {
    setBody(task?.body ?? "");
    setName(task?.name ?? "");
  }, [task?.id, task?.body, task?.name]);

  if (!task) return null;
  const statuses = meta?.statuses ?? [];

  return (
    <aside className="flex w-[400px] flex-none flex-col border-l border-line bg-panel">
      <div className="flex h-10 flex-none items-center gap-2 border-b border-line px-4">
        <span className="font-mono text-[10.5px] font-semibold uppercase tracking-wider text-faint">Tarea</span>
        <div className="flex-1" />
        <button
          type="button"
          title="Eliminar (a la papelera)"
          onClick={async () => {
            if (await confirmAction("Eliminar tarea", `«${task.name}» se moverá a la papelera del vault.`, "Eliminar", true)) {
              void remove(task.id);
            }
          }}
          className="grid h-7 w-7 place-items-center rounded-md text-faint hover:bg-danger-soft hover:text-danger"
        >
          <Trash2 size={14} />
        </button>
        <button type="button" title="Cerrar" onClick={close} className="grid h-7 w-7 place-items-center rounded-md text-faint hover:bg-hover hover:text-text">
          <X size={15} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="px-5 pb-3 pt-4">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name.trim() !== task.name && void update(task.id, { name: name.trim() || "Sin título" })}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            className="w-full bg-transparent text-[18px] font-semibold tracking-tight text-text outline-none"
          />
        </div>
        <div className="px-5 pb-4">
          <Field label="Estado">
            <StatusSelect value={task.status} statuses={statuses} onChange={(v) => void update(task.id, { status: v })} />
          </Field>
          <Field label="Asignatura">
            <input
              list="nv-subjects-drawer"
              defaultValue={task.subject}
              key={task.id + task.subject}
              placeholder="Historia, Cálculo…"
              onBlur={(e) => e.target.value.trim() !== task.subject && void update(task.id, { subject: e.target.value.trim() })}
              className="h-8 w-full rounded-lg border border-line bg-surface px-2 text-[12.5px] text-text outline-none placeholder:text-faint focus:border-accent"
            />
            <datalist id="nv-subjects-drawer">
              {(meta?.subjects ?? []).map((s) => <option key={s} value={s} />)}
            </datalist>
          </Field>
          <Field label="Prioridad">
            <PriorityStars value={task.priority} max={meta?.priority_max ?? 3} onChange={(v) => void update(task.id, { priority: v })} size={16} />
          </Field>
          <Field label="Fecha de salida">
            <div className="flex gap-1">
              <DateInput value={task.start} onChange={(v) => void update(task.id, { start: v })} className="border-line" />
              <DateInput type="time" value={task.start_time} onChange={(v) => void update(task.id, { start_time: v })} className="border-line" />
            </div>
          </Field>
          <Field label="Fecha límite">
            <div className="flex gap-1">
              <DateInput value={task.due} onChange={(v) => void update(task.id, { due: v })} className={cn("border-line", task.overdue && "!text-danger")} />
              <DateInput type="time" value={task.due_time} onChange={(v) => void update(task.id, { due_time: v })} className="border-line" />
            </div>
          </Field>
          <Field label="Repetición">
            <RepeatEditor task={task} />
          </Field>
          {task.repeat && (
            <Field label="Repetir hasta">
              <DateInput value={task.repeat_until} onChange={(v) => void update(task.id, { repeat_until: v })} className="border-line" />
            </Field>
          )}
          <Field label="Recordatorio">
            <DateInput type="datetime-local" value={task.reminder} onChange={(v) => void update(task.id, { reminder: v })} className="border-line" />
          </Field>
          <Field label="Creada">
            <span className="font-mono text-[11.5px] text-faint">{task.created ?? "—"}</span>
          </Field>
        </div>
        <Subtasks task={task} />
        <section className="border-t border-line px-5 py-4">
          <h3 className="mb-2 font-mono text-[10.5px] font-semibold uppercase tracking-wider text-faint">Notas</h3>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onBlur={() => body !== task.body && void update(task.id, { body })}
            placeholder="Notas de la tarea (markdown)…"
            rows={8}
            className="w-full resize-y rounded-lg border border-line bg-surface p-3 font-mono text-[12.5px] leading-relaxed text-text outline-none placeholder:text-faint focus:border-accent"
          />
        </section>
      </div>
    </aside>
  );
}
