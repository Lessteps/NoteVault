// Sub-goal peek: every property of a submeta in a centred, Obsidian-style sheet —
// the same look as the project's issue peek. Closing it (✕, Esc or the backdrop)
// saves what was edited.

import {
  Bell, Calendar, CalendarCheck, CalendarDays, ChevronLeft, CircleDot, Clock, Flag, Folder, Link2, Plus, Repeat,
  Ruler, Star, Tag, Target, Timer, Trash2, X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/bridge";
import { todayIso } from "../../lib/tasks";
import { REMINDERS } from "../../lib/calendar";
import type { GoalItem, Habit } from "../../lib/types";
import { useApp } from "../../store/app";
import { useGoals } from "../../store/goals";
import { GhostButton, PRIORITY_COLOURS, PRIORITY_GLYPHS, PRIORITY_NAMES } from "../common/forms";
import { LinkedNotes } from "../common/LinkedNotes";
import {
  PeekCheck, PeekDate, PeekMenu, PeekRow, PeekText, PeekTime, PEEK_LABEL, PEEK_TEXT, type PeekOption,
} from "../common/peek";
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

/** A checklist tick, restyled: the same checkbox, no native widget look. */
function Tick({ checked, ariaLabel, onChange }: { checked: boolean; ariaLabel: string; onChange: (v: boolean) => void }) {
  return (
    <label className="relative grid h-4 w-4 flex-none place-items-center">
      <input type="checkbox" aria-label={ariaLabel} checked={checked} onChange={(e) => onChange(e.target.checked)}
        className="peer absolute inset-0 cursor-pointer appearance-none rounded-[4px] border border-line-strong checked:border-accent checked:bg-accent" />
      <svg viewBox="0 0 24 24" className="pointer-events-none hidden h-3 w-3 text-white peer-checked:block" fill="none"
        stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
    </label>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <div className="mb-1.5 font-mono text-[10.5px] uppercase tracking-wider" style={{ color: PEEK_LABEL }}>{label}</div>
      {children}
    </section>
  );
}

export function ItemEditor({ item, onClose }: { item: GoalItem; onClose: () => void }) {
  const detail = useGoals((s) => s.detail)!;
  const meta = useGoals((s) => s.meta);
  const refresh = useGoals((s) => s.refreshAfterWrite);
  const openSubmeta = useGoals((s) => s.openSubmeta);
  const openItem = useGoals((s) => s.openItem);
  const [child, setChild] = useState("");
  const [sub, setSub] = useState("");
  /** Which submeta the inline "add a submeta" field sits under. */
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const toast = useApp((s) => s.toast);
  const [f, setF] = useState<Partial<GoalItem>>({});
  const [hint, setHint] = useState("");
  const initial = useRef("");
  const panel = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    setF({ ...item });
    initial.current = JSON.stringify(item);
    setHint("");
    setChild("");
    setSub("");
    setAddingFor(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);
  const set = (patch: Partial<GoalItem>) => setF((x) => ({ ...x, ...patch }));
  const g = detail.goal;
  const repeating = Boolean(f.repeat);

  // The title grows with its text; it has no input box of its own.
  useEffect(() => {
    const el = title.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [f.name, item.id]);

  const save = async (): Promise<boolean> => {
    const target = f.target && Number(f.target) > 0 ? f.target : null;
    const time = f.due_time || "";
    const fields: Partial<GoalItem> = {
      name: (f.name ?? "").trim() || item.name, category: f.category, is_priority: f.is_priority, priority: f.priority,
      repeat: f.repeat ?? "", start: repeating ? f.start || null : null, repeat_until: repeating ? f.repeat_until || null : null,
      due: repeating ? null : f.due || null, due_time: time,
      duration_min: time ? f.duration_min ?? null : null, reminder_min: time ? f.reminder_min ?? null : null,
      in_calendar: Boolean(f.in_calendar) || Boolean(!repeating && f.due && time),
      target, unit: target ? f.unit ?? "" : "", value: !repeating && f.value !== null && f.value !== undefined && String(f.value) !== "" ? f.value : null,
      habit_links: f.habit_links ?? [], topic_links: f.topic_links ?? [], notes: f.notes ?? "",
      linked_notes: f.linked_notes ?? [], linked_folder: f.linked_folder ?? "",
    };
    if (item.is_leaf) fields.status = f.status;
    if (fields.in_calendar && !repeating && !fields.due) {
      setHint("Para mostrarla en el calendario ponle una fecha o una repetición.");
      return false;
    }
    try {
      await api.goalItemUpdate(g.id, item.id, fields);
      initial.current = JSON.stringify({ ...item, ...f });
      setHint("Guardado ✓");
      await refresh();
      return true;
    } catch (e) {
      setHint((e as Error).message);
      return false;
    }
  };

  /** Closing saves, but only when something changed. */
  const close = async () => {
    if (JSON.stringify({ ...item, ...f }) === initial.current || (await save())) onClose();
  };
  const closeRef = useRef<() => void>(() => undefined);
  closeRef.current = () => void close();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const dialogs = document.querySelectorAll('[role="dialog"]');
      if (dialogs[dialogs.length - 1] !== panel.current) return;
      e.preventDefault();
      closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const dirty = () => JSON.stringify({ ...item, ...f }) !== initial.current;
  /** Moves the peek to another submeta, saving what was edited here first. */
  const go = async (id: string) => {
    if (dirty() && !(await save())) return;
    openItem(id);
  };
  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await refresh();
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };
  const addUnder = async (parentId: string, name: string) => {
    const t = name.trim();
    if (!t) return;
    await act(() => api.goalItemCreate(g.id, t, parentId));
  };
  const tree: Array<{ k: GoalItem; depth: number }> = [];
  const walk = (parent: string, depth: number) => {
    for (const k of detail.items.filter((x) => x.parent === parent).sort((a, b) => a.order - b.order)) {
      tree.push({ k, depth });
      walk(k.id, depth + 1);
    }
  };
  walk(item.id, 0);
  const parentItem = item.parent ? detail.items.find((x) => x.id === item.parent) : undefined;
  const today = todayIso();

  const statusOptions: PeekOption[] = (meta?.item_statuses ?? []).map((s) => ({
    value: s, label: s, colour: s === "Hecha" ? "#4ade80" : s === "En curso" ? "#2383e2" : undefined,
  }));
  const priorityOptions: PeekOption[] = [1, 2, 3, 4].map((n) => ({
    value: String(n), label: `${PRIORITY_GLYPHS[n]} ${PRIORITY_NAMES[n]}`, colour: PRIORITY_COLOURS[n],
  }));
  const reminderOptions: PeekOption[] = REMINDERS.map(([v, l]) => ({ value: v === null ? "" : String(v), label: l }));
  const categoryOptions: PeekOption[] = [{ value: "", label: "Sin categoría" }, ...detail.categories.map((c) => ({ value: c, label: c }))];
  if (f.category && !detail.categories.includes(f.category)) categoryOptions.push({ value: f.category, label: f.category });

  return (
    <div className="nv-fade fixed inset-0 z-40 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }} onMouseDown={() => void close()}>
      <div ref={panel} role="dialog" aria-label="Detalle de la submeta" onMouseDown={(e) => e.stopPropagation()}
        className="nv-peek flex flex-col overflow-hidden rounded-xl border border-line-strong shadow-2xl"
        style={{ width: "min(900px, 90vw)", height: "min(85vh, 780px)", background: "var(--nv-elevated)" }}>
        <div className="flex h-11 flex-none items-center gap-2 border-b border-line px-3">
          {parentItem && (
            <button type="button" title={`Volver a ${parentItem.name}`} onClick={() => void go(parentItem.id)}
              className="flex max-w-[160px] flex-none items-center gap-1 rounded-md px-1.5 py-0.5 text-[11.5px] text-dim hover:bg-hover hover:text-text">
              <ChevronLeft size={13} /> <span className="truncate">{parentItem.name}</span>
            </button>
          )}
          <span className="font-mono text-[12px] font-semibold text-faint">{f.is_priority ? "⭐" : "◆"} {item.is_leaf ? "Submeta" : "Submeta con hijas"}</span>
          <span className="truncate text-[10.5px] text-faint">{item.created ? `· Creada ${item.created}` : ""}</span>
          <span className="flex-1" />
          <IconButton title="Cerrar" onClick={() => void close()}><X size={15} /></IconButton>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[720px] px-14 py-8">
            <div className="flex items-start gap-3">
              <span className="mt-1 text-[26px] leading-none">{f.is_priority ? "⭐" : item.is_leaf ? "•" : "📁"}</span>
              <textarea ref={title} rows={1} aria-label="Nombre de la submeta" placeholder="Sin título" value={f.name ?? ""}
                onChange={(e) => set({ name: e.target.value })}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLTextAreaElement).blur(); } }}
                className="min-w-0 flex-1 resize-none overflow-hidden rounded-md bg-transparent px-1 font-bold leading-tight outline-none placeholder:text-faint focus:bg-white/[0.04]"
                style={{ color: PEEK_TEXT, fontSize: 40 }} />
            </div>

            <div className="mt-6 grid grid-cols-2 gap-x-4">
              {item.is_leaf && (
                <PeekRow icon={<CircleDot />} label="Estado">
                  <PeekMenu ariaLabel="Estado" chip value={f.status ?? ""} options={statusOptions} onChange={(status) => set({ status })} />
                </PeekRow>
              )}
              <PeekRow icon={<Flag />} label="Prioridad">
                <PeekMenu ariaLabel="Prioridad" chip value={String(f.priority ?? "")} options={priorityOptions} onChange={(v) => set({ priority: Number(v) })} />
              </PeekRow>
              <PeekRow icon={<Tag />} label="Categoría">
                <PeekMenu ariaLabel="Categoría" value={f.category ?? ""} options={categoryOptions} placeholder="Sin categoría" onChange={(category) => set({ category })} />
              </PeekRow>
              <PeekRow icon={<Star />} label="Prioritaria">
                <PeekCheck ariaLabel="Prioritaria" checked={Boolean(f.is_priority)} onChange={(is_priority) => set({ is_priority })} />
              </PeekRow>
              <PeekRow icon={<Repeat />} label="Repetición" wide>
                <RepeatPicker menu value={f.repeat ?? ""} onChange={(repeat) => set({ repeat })} />
              </PeekRow>
              {repeating ? (
                <>
                  <PeekRow icon={<CalendarDays />} label="Empieza">
                    <PeekDate ariaLabel="Empieza" value={f.start ?? ""} onChange={(start) => set({ start: start || null })} />
                  </PeekRow>
                  <PeekRow icon={<CalendarCheck />} label="Repetir hasta">
                    <PeekDate ariaLabel="Repetir hasta" value={f.repeat_until ?? ""} onChange={(repeat_until) => set({ repeat_until: repeat_until || null })} />
                  </PeekRow>
                </>
              ) : (
                <PeekRow icon={<CalendarCheck />} label="Fecha límite">
                  <PeekDate ariaLabel="Fecha límite" value={f.due ?? ""}
                    onChange={(due) => set({ due: due || null, in_calendar: due ? true : f.in_calendar })} />
                </PeekRow>
              )}
              <PeekRow icon={<Clock />} label="Hora">
                <PeekTime ariaLabel="Hora" value={f.due_time ?? ""} onChange={(due_time) => set({ due_time, in_calendar: due_time ? true : f.in_calendar })} />
              </PeekRow>
              <PeekRow icon={<Timer />} label="Duración">
                <PeekText ariaLabel="Duración (min)" digits placeholder="Sin duración" value={f.duration_min === null || f.duration_min === undefined ? "" : String(f.duration_min)}
                  onChange={(v) => set({ duration_min: v ? Number(v) : null })} />
                {f.duration_min ? <span className="flex-none pr-1 text-[13px]" style={{ color: PEEK_LABEL }}>min</span> : null}
              </PeekRow>
              <PeekRow icon={<Bell />} label="Aviso">
                <PeekMenu ariaLabel="Aviso" value={f.reminder_min === null || f.reminder_min === undefined ? "" : String(f.reminder_min)} options={reminderOptions}
                  onChange={(v) => set({ reminder_min: v === "" ? null : Number(v) })} />
              </PeekRow>
              <PeekRow icon={<Calendar />} label="En el calendario">
                <PeekCheck ariaLabel="En el calendario" checked={Boolean(f.in_calendar)} onChange={(in_calendar) => set({ in_calendar })} />
              </PeekRow>
              <PeekRow icon={<Target />} label="Objetivo">
                <PeekText ariaLabel="Objetivo (medible)" placeholder="p. ej. 3" value={f.target === null || f.target === undefined ? "" : String(f.target)}
                  onChange={(v) => set({ target: v === "" ? null : (v as unknown as number) })} />
              </PeekRow>
              <PeekRow icon={<Ruler />} label="Unidad">
                <PeekText ariaLabel="Unidad" placeholder="h, páginas, km…" value={f.unit ?? ""} onChange={(unit) => set({ unit })} />
              </PeekRow>
              {!repeating && f.target ? (
                <PeekRow icon={<Target />} label="Llevas">
                  <PeekText ariaLabel="Llevas" value={f.value === null || f.value === undefined ? "" : String(f.value)}
                    onChange={(v) => set({ value: v === "" ? null : (v as unknown as number) })} />
                </PeekRow>
              ) : null}
              <PeekRow icon={<Folder />} label="Carpeta del vault" wide>
                <PeekText ariaLabel="Carpeta del vault" placeholder="Carpeta del vault (opcional)" value={f.linked_folder ?? ""}
                  onChange={(linked_folder) => set({ linked_folder })} />
              </PeekRow>
              <PeekRow icon={<Link2 />} label="Notas vinculadas" wide>
                <LinkedNotes part="notes" notes={f.linked_notes ?? []} folder={f.linked_folder ?? ""}
                  onChange={(linked_notes, linked_folder) => set({ linked_notes, linked_folder })} />
              </PeekRow>
            </div>

            <hr className="my-6 border-line" />

            <Section label={`Submetas${tree.length ? ` · ${tree.filter(({ k }) => k.status === "Hecha" || k.progress >= 1).length}/${tree.length}` : ""}`}>
              <ul className="space-y-0.5">
                {tree.map(({ k, depth }) => (
                  <li key={k.id}>
                    <div className="group flex items-center gap-2 rounded-md px-1 py-0.5 hover:bg-white/[0.04]">
                      <span className="flex-none" style={{ width: depth * 18 }} />
                      <Tick checked={k.is_leaf ? k.status === "Hecha" || k.done_today : k.progress >= 1} ariaLabel={`Hecha: ${k.name}`}
                        onChange={(done) => {
                          // A submeta with children is finished by them.
                          if (!k.is_leaf) { void go(k.id); return; }
                          void act(() => api.goalSetDone(g.id, k.id, today, done));
                        }} />
                      <button type="button" title={`Abrir ${k.name}`} onClick={() => void go(k.id)}
                        className={cn("min-w-0 flex-1 truncate text-left text-[13px] hover:underline", k.status === "Hecha" ? "text-faint line-through" : "text-text")}>
                        {k.name}
                      </button>
                      {k.is_leaf ? (
                        <PeekMenu ariaLabel={`Estado de ${k.name}`} chip menuWidth={200} value={k.status} options={statusOptions}
                          onChange={(status) => void act(() => api.goalItemUpdate(g.id, k.id, { status }))} />
                      ) : (
                        <span className="font-mono text-[11px] text-faint">{k.counts[0]}/{k.counts[1]}</span>
                      )}
                      <IconButton title={`Añadir submeta a ${k.name}`} className="opacity-0 group-hover:opacity-100"
                        onClick={() => { setSub(""); setAddingFor(addingFor === k.id ? null : k.id); }}><Plus size={12} /></IconButton>
                      <IconButton title="Eliminar submeta" className="opacity-0 group-hover:opacity-100 hover:text-danger"
                        onClick={async () => {
                          const n = detail.items.filter((x) => x.parent === k.id).length;
                          if (!(await confirmAction("Eliminar submeta", `¿Eliminar «${k.name}»${n ? " y sus submetas" : ""}? Se mueve a la papelera.`, "Eliminar", true))) return;
                          void act(() => api.goalItemDelete(g.id, k.id));
                        }}><Trash2 size={12} /></IconButton>
                    </div>
                    {addingFor === k.id && (
                      <div className="flex items-center gap-1.5 rounded-md px-1 py-0.5 text-[13px] focus-within:bg-white/[0.04]"
                        style={{ paddingLeft: 4 + (depth + 1) * 18 }}>
                        <span className="text-faint">↳</span>
                        <input autoFocus className="min-w-0 flex-1 bg-transparent py-0.5 outline-none placeholder:text-faint" style={{ color: PEEK_TEXT }}
                          value={sub} placeholder={`Añadir submeta a ${k.name}…`} aria-label={`Añadir submeta a ${k.name}`}
                          onChange={(e) => setSub(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") { const t = sub; setSub(""); setAddingFor(null); void addUnder(k.id, t); }
                            if (e.key === "Escape") {
                              // Esc cancels this field, it must not close the whole peek.
                              e.nativeEvent.stopImmediatePropagation();
                              setAddingFor(null);
                            }
                          }}
                          onBlur={() => { if (!sub.trim()) setAddingFor(null); }} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              <div className="mt-1 flex items-center gap-1.5 rounded-md px-1 py-0.5 text-[13px] focus-within:bg-white/[0.04] hover:bg-white/[0.04]">
                <span className="text-faint">+</span>
                <input className="min-w-0 flex-1 bg-transparent py-0.5 outline-none placeholder:text-faint" style={{ color: PEEK_TEXT }}
                  value={child} placeholder={`Añadir submeta a «${item.name}»…`} aria-label="Añadir submeta"
                  onChange={(e) => setChild(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" || !child.trim()) return;
                    const t = child;
                    setChild("");
                    void addUnder(item.id, t);
                  }} />
              </div>
            </Section>

            <Section label="Hábitos vinculados">
              <HabitLinks value={f.habit_links ?? []} onChange={(habit_links) => set({ habit_links })} />
            </Section>
            <Section label="Temas de estudio">
              <TopicLinks value={f.topic_links ?? []} onChange={(topic_links) => set({ topic_links })} />
              {(f.topic_links ?? []).length > 0 && <p className="mt-1 text-[11px] text-faint">Se cumple sola cuando el estudio de esos temas está dominado.</p>}
            </Section>
            <Section label="Notas">
              <textarea rows={6} aria-label="Notas" placeholder="Resúmenes, enlaces a recursos o notas de esta submeta…" value={f.notes ?? ""}
                onChange={(e) => set({ notes: e.target.value })}
                className="w-full resize-y rounded-md bg-white/[0.03] px-2 py-1.5 text-[14px] outline-none placeholder:text-faint focus:bg-white/[0.06]"
                style={{ color: PEEK_TEXT }} />
            </Section>
          </div>
        </div>

        <div className="flex h-12 flex-none items-center gap-2 border-t border-line px-4">
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
          }}><Trash2 size={13} /> Eliminar</GhostButton>
          <GhostButton onClick={() => { onClose(); openSubmeta(item.id); }}>📊 Estadísticas ›</GhostButton>
          <span className="min-w-0 flex-1 truncate text-right text-[11px] text-faint">{hint}</span>
        </div>
      </div>
    </div>
  );
}
