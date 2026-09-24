import { FunnelX, PanelRightOpen, Plus, Repeat, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { applyFilters, useTasks } from "../../store/tasks";
import type { Task } from "../../lib/types";
import { confirmAction, cn } from "../ui";
import { DateInput, PriorityStars, StatusSelect } from "./controls";

function NameCell({ task }: { task: Task }) {
  const update = useTasks((s) => s.update);
  const [draft, setDraft] = useState<string | null>(null);
  if (draft !== null) {
    const commit = () => {
      const name = draft.trim() || "Sin título";
      setDraft(null);
      if (name !== task.name) void update(task.id, { name });
    };
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setDraft(null);
        }}
        className="w-full rounded-md border border-accent bg-surface px-2 py-1 text-[13px] text-text outline-none"
      />
    );
  }
  return (
    <button
      type="button"
      title="Doble clic para renombrar"
      onDoubleClick={(e) => {
        e.stopPropagation();
        setDraft(task.name);
      }}
      className={cn(
        "flex min-w-0 items-center gap-1.5 truncate text-left text-[13px]",
        task.done ? "text-faint line-through" : "text-text",
      )}
    >
      <span className="truncate">{task.name}</span>
      {task.repeat && <Repeat size={12} className="flex-none text-accent-text" />}
    </button>
  );
}

function SubjectCell({ task, subjects }: { task: Task; subjects: string[] }) {
  const update = useTasks((s) => s.update);
  return (
    <>
      <input
        list="nv-subjects"
        defaultValue={task.subject}
        key={task.subject}
        placeholder="—"
        onClick={(e) => e.stopPropagation()}
        onBlur={(e) => e.target.value.trim() !== task.subject && void update(task.id, { subject: e.target.value.trim() })}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        className="w-full rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-[12.5px] text-accent-text outline-none placeholder:text-faint hover:border-line focus:border-accent"
      />
      <datalist id="nv-subjects">
        {subjects.map((s) => <option key={s} value={s} />)}
      </datalist>
    </>
  );
}

export function TaskTable() {
  const tasks = useTasks((s) => s.tasks);
  const meta = useTasks((s) => s.meta);
  const filters = useTasks((s) => s.filters);
  const setFilters = useTasks((s) => s.setFilters);
  const clearFilters = useTasks((s) => s.clearFilters);
  const update = useTasks((s) => s.update);
  const remove = useTasks((s) => s.remove);
  const create = useTasks((s) => s.create);
  const open = useTasks((s) => s.open);
  const openId = useTasks((s) => s.openId);
  const rows = useMemo(() => applyFilters(tasks, filters), [tasks, filters]);
  const statuses = meta?.statuses ?? [];
  const doneStatus = meta?.done_status ?? "Completado";
  const filtered = JSON.stringify(filters) !== JSON.stringify({ query: "", status: "", subject: "", priority: 0, hideDone: false });

  const select = "h-8 rounded-lg border border-line bg-surface px-2 text-[12px] text-dim outline-none focus:border-accent";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-none flex-wrap items-center gap-2 border-b border-line px-5 py-3">
        <label className="flex h-8 w-64 items-center gap-2 rounded-lg border border-line bg-surface px-2.5 focus-within:border-accent">
          <Search size={13} className="text-faint" />
          <input
            value={filters.query}
            onChange={(e) => setFilters({ query: e.target.value })}
            placeholder="Buscar tareas…"
            className="min-w-0 flex-1 bg-transparent text-[12.5px] text-text outline-none placeholder:text-faint"
          />
        </label>
        <select className={select} value={filters.status} onChange={(e) => setFilters({ status: e.target.value })}>
          <option value="">Estado (todos)</option>
          {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className={select} value={filters.subject} onChange={(e) => setFilters({ subject: e.target.value })}>
          <option value="">Asignatura (todas)</option>
          {(meta?.subjects ?? []).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          className={select}
          value={filters.priority}
          onChange={(e) => setFilters({ priority: Number(e.target.value) })}
        >
          <option value={0}>Prioridad (todas)</option>
          <option value={1}>★</option>
          <option value={2}>★★</option>
          <option value={3}>★★★</option>
        </select>
        <label className="flex items-center gap-2 text-[12px] text-dim">
          <input
            type="checkbox"
            checked={filters.hideDone}
            onChange={(e) => setFilters({ hideDone: e.target.checked })}
            className="accent-[var(--nv-accent)]"
          />
          Ocultar completadas
        </label>
        {filtered && (
          <button type="button" onClick={clearFilters} className="flex items-center gap-1 rounded-md px-2 py-1 text-[12px] text-dim hover:bg-hover hover:text-text">
            <FunnelX size={13} /> Limpiar
          </button>
        )}
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => void create()}
          className="flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-[12.5px] font-semibold text-white hover:bg-accent-strong"
        >
          <Plus size={15} /> Nueva tarea
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
        <div className="min-w-[980px] overflow-hidden rounded-xl border border-line bg-card">
          <div className="grid grid-cols-[40px_minmax(220px,1fr)_150px_140px_90px_120px_150px_170px_64px] items-center border-b border-line bg-panel px-2 font-mono text-[10.5px] font-semibold uppercase tracking-wider text-faint">
            <span className="py-2.5 text-center">✓</span>
            <span className="py-2.5">Nombre</span>
            <span>Asignatura</span>
            <span>Estado</span>
            <span>Prioridad</span>
            <span>Salida</span>
            <span>Fecha límite</span>
            <span>Aviso</span>
            <span />
          </div>
          {rows.length === 0 && (
            <div className="px-4 py-10 text-center text-[13px] text-faint">
              {tasks.length ? "No hay tareas que coincidan con los filtros." : "No hay tareas. Pulsa «Nueva tarea» para crear la primera."}
            </div>
          )}
          {rows.map((t) => (
            <div
              key={t.id}
              onClick={() => open(t.id)}
              className={cn(
                "group/row grid cursor-pointer grid-cols-[40px_minmax(220px,1fr)_150px_140px_90px_120px_150px_170px_64px] items-center border-b border-line px-2 py-1.5 last:border-b-0",
                openId === t.id ? "bg-accent-soft" : "hover:bg-hover/60",
              )}
            >
              <span className="flex justify-center" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  title="Marcar como completada"
                  checked={t.done}
                  onChange={(e) => void update(t.id, { status: e.target.checked ? doneStatus : (statuses[0] ?? "Sin empezar") })}
                  className="h-4 w-4 cursor-pointer accent-[var(--nv-accent)]"
                />
              </span>
              <NameCell task={t} />
              <SubjectCell task={t} subjects={meta?.subjects ?? []} />
              <span><StatusSelect value={t.status} statuses={statuses} onChange={(v) => void update(t.id, { status: v })} /></span>
              <PriorityStars value={t.priority} max={meta?.priority_max ?? 3} onChange={(v) => void update(t.id, { priority: v })} />
              <DateInput title="Fecha de salida" value={t.start} onChange={(v) => void update(t.id, { start: v })} />
              <DateInput
                title="Fecha límite"
                value={t.due}
                onChange={(v) => void update(t.id, { due: v })}
                className={t.overdue ? "!text-danger" : ""}
              />
              <DateInput
                type="datetime-local"
                title="Fecha y hora del aviso"
                value={t.reminder}
                onChange={(v) => void update(t.id, { reminder: v })}
              />
              <span className="flex justify-end gap-0.5 pr-1" onClick={(e) => e.stopPropagation()}>
                <button type="button" title="Abrir detalle" onClick={() => open(t.id)} className="grid h-7 w-7 place-items-center rounded-md text-faint hover:bg-hover hover:text-text">
                  <PanelRightOpen size={14} />
                </button>
                <button
                  type="button"
                  title="Eliminar (a la papelera)"
                  onClick={async () => {
                    if (await confirmAction("Eliminar tarea", `«${t.name}» se moverá a la papelera del vault.`, "Eliminar", true)) {
                      void remove(t.id);
                    }
                  }}
                  className="grid h-7 w-7 place-items-center rounded-md text-faint hover:bg-danger-soft hover:text-danger"
                >
                  <Trash2 size={14} />
                </button>
              </span>
            </div>
          ))}
        </div>
        <div className="mt-2 font-mono text-[10.5px] text-faint">
          {rows.length} de {tasks.length} tareas
        </div>
      </div>
    </div>
  );
}
