// Center Peek: the issue editor as a centred, blurred modal instead of the right
// side panel. Presentation only — every value goes to the same field, through the
// same handler and the same save() call the panel used.

import {
  Bell, Calendar, CalendarCheck, CalendarDays, ChevronLeft, CircleDot, Clock, FileText, Flag, Folder,
  GitBranch, Maximize2, Minimize2, Paperclip, Plus, Repeat, Tag, Tags, Timer, Trash2, X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/bridge";
import type { Issue } from "../../lib/types";
import { useApp } from "../../store/app";
import { descendants, issueById, useProjects } from "../../store/projects";
import { Attachments } from "../common/Attachments";
import { GhostButton, PrimaryButton, PRIORITY_COLOURS, PRIORITY_GLYPHS, PRIORITY_NAMES } from "../common/forms";
import { LinkedNotes } from "../common/LinkedNotes";
import {
  PeekCheck, PeekDate, PeekDateTime, PeekMenu, PeekRow, PeekTags, PeekText, PeekTime,
  PEEK_LABEL, PEEK_TEXT, type PeekOption,
} from "../common/peek";
import { RepeatPicker } from "../common/RepeatPicker";
import { cn, confirmAction, IconButton } from "../ui";
import { parentOptions } from "./ProjectDialogs";
import { RubricDialog, type RubricResult } from "./RubricDialog";

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
    <section>
      <div className="mb-1.5 font-mono text-[10.5px] uppercase tracking-wider" style={{ color: PEEK_LABEL }}>{label}</div>
      {children}
    </section>
  );
}

export function IssuePeek() {
  const detail = useProjects((s) => s.detail);
  const issueId = useProjects((s) => s.issueId);
  const openIssue = useProjects((s) => s.openIssue);
  const reload = useProjects((s) => s.reload);
  const moveIssue = useProjects((s) => s.moveIssue);
  const meta = useProjects((s) => s.meta);
  const toast = useApp((s) => s.toast);
  const issue = issueId ? issueById(detail, issueId) : undefined;
  const [f, setF] = useState<Partial<Issue>>({});
  const [child, setChild] = useState("");
  const [sub, setSub] = useState("");
  /** Which subtask the inline "add a subtask" field sits under (null: only the one at the end). */
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [hint, setHint] = useState("");
  const [rubric, setRubric] = useState<RubricResult | null>(null);
  const [rubricOpen, setRubricOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!issue) return;
    setF({ ...issue });
    setHint("");
    setChild("");
    setSub("");
    setAddingFor(null);
    setExpanded(false);
    // Only when another issue is opened: a reload (an attachment added, a child
    // ticked) must not wipe fields being edited here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issue?.id]);

  const set = (patch: Partial<Issue>) => setF((x) => ({ ...x, ...patch }));

  // The title grows with its text; it has no input box of its own.
  useEffect(() => {
    const el = title.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [f.title, issueId]);

  // Esc closes the peek, unless a dialog of its own (rúbrica, confirmación) is on top.
  const closeRef = useRef<() => void>(() => undefined);
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

  if (!detail || !issue) return null;
  const p = detail.project;
  const checks = (f.description ?? "").match(/- \[[ xX]\]/g) ?? [];
  const ticked = (f.description ?? "").match(/- \[[xX]\]/g)?.length ?? 0;
  const checkValid = (): boolean => {
    if (f.repeat && !f.due) {
      setHint("Un issue que se repite necesita una fecha de vencimiento.");
      return false;
    }
    return true;
  };

  /** The panel's save(), unchanged: same fields, same call, same reload. */
  const save = async (): Promise<boolean> => {
    if (!checkValid()) return false;
    try {
      await api.issueUpdate(p.id, issue.id, {
        title: f.title, type: f.type, status: f.status, priority: f.priority, parent: f.parent,
        start: f.start || null, due: f.due || null, due_time: f.due_time || "", estimate_min: f.estimate_min ?? null,
        reminder: f.reminder || null, in_calendar: f.in_calendar, repeat: f.repeat ?? "", labels: f.labels,
        description: f.description, linked_folder: f.linked_folder, linked_notes: f.linked_notes,
      });
      setHint("Guardado ✓");
      await reload();
      return true;
    } catch (e) {
      setHint((e as Error).message);
      return false;
    }
  };

  /** Esc, the overlay and the X all fire the very same save before closing. */
  const close = async () => {
    if (await save()) openIssue(null);
  };
  closeRef.current = () => void close();

  const remove = async () => {
    const n = issue.children.length;
    if (!(await confirmAction("Eliminar issue", `¿Eliminar ${issue.key} «${issue.title}»${n ? ` y sus hijas` : ""}? Se mueve a la papelera de la vault.`, "Eliminar", true))) return;
    try {
      await api.issueDelete(p.id, issue.id);
      openIssue(null);
      await reload();
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };

  const parent = issue.parent ? issueById(detail, issue.parent) : undefined;

  /** The whole subtree of this issue, flattened with its depth (same data as the list view). */
  const tree: Array<{ k: Issue; depth: number }> = [];
  {
    const seen = new Set<string>();
    const walk = (ids: string[], depth: number) => {
      for (const id of ids) {
        if (seen.has(id)) continue;
        seen.add(id);
        const it = issueById(detail, id);
        if (!it) continue;
        tree.push({ k: it, depth });
        walk(it.children, depth + 1);
      }
    };
    walk(issue.children, 0);
  }

  /** Deleting a subtask can take a whole branch: ask first, as deleting the issue does. */
  const removeKid = async (k: Issue) => {
    const n = descendants(detail, k.id).size;
    if (!(await confirmAction("Eliminar subtarea", `¿Eliminar ${k.key} «${k.title}»${n ? ` y sus ${n} subtareas` : ""}? Se mueve a la papelera de la vault.`, "Eliminar", true))) return;
    try {
      await api.issueDelete(p.id, k.id);
      await reload();
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };

  /** A subtask of a subtask: the same call the field at the end makes, with another parent. */
  const addUnder = async (parentId: string) => {
    const t = sub.trim();
    if (!t) return;
    try {
      await api.issueCreate(p.id, { title: t, parent: parentId, type: "Subtarea" });
      setSub("");
      setAddingFor(null);
      await reload();
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };

  const typeOptions: PeekOption[] = (meta?.types ?? []).map((t) => ({ value: t, label: `${meta?.type_icons[t] ?? ""} ${t}`.trim() }));
  const statusOptions: PeekOption[] = p.columns.map((c) => ({
    value: c,
    label: `${c === p.done_column ? "✓ " : ""}${c}`,
    colour: meta?.status_colours[c],
  }));
  const priorityOptions: PeekOption[] = [1, 2, 3, 4].map((n) => ({
    value: String(n),
    label: `${PRIORITY_GLYPHS[n]} ${PRIORITY_NAMES[n]}`,
    colour: PRIORITY_COLOURS[n],
  }));
  const parentMenuOptions: PeekOption[] = [{ value: "", label: "Sin padre" },
    ...parentOptions(detail, issue.id).map((o) => ({ value: o.id, label: `${o.icon} ${o.key} ${o.title}` }))];
  // That picker hides Subtarea parents (the API allows nesting subtasks): show the
  // real one, so the row never claims "Sin padre" while the issue does have one.
  if (f.parent && !parentMenuOptions.some((o) => o.value === f.parent)) {
    const cur = issueById(detail, f.parent);
    if (cur) parentMenuOptions.splice(1, 0, { value: cur.id, label: `${cur.icon} ${cur.key} ${cur.title}` });
  }

  return (
    <div
      className="nv-fade fixed inset-0 z-40 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
      onMouseDown={() => void close()}
    >
      <div
        ref={panel}
        role="dialog"
        aria-label="Detalle del issue"
        onMouseDown={(e) => e.stopPropagation()}
        className="nv-peek flex flex-col overflow-hidden rounded-xl border border-line-strong shadow-2xl"
        style={{
          width: expanded ? "96vw" : "min(900px, 90vw)",
          height: expanded ? "92vh" : "min(85vh, 780px)",
          background: "var(--nv-elevated)",
        }}
      >
        <div className="flex h-11 flex-none items-center gap-2 border-b border-line px-3">
          <IconButton title={expanded ? "Contraer" : "Expandir"} onClick={() => setExpanded((v) => !v)}>
            {expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </IconButton>
          {parent && (
            <button type="button" title={`Volver a ${parent.key} — ${parent.title}`} onClick={() => openIssue(parent.id)}
              className="flex flex-none items-center gap-1 rounded-md px-1.5 py-0.5 text-[11.5px] text-dim hover:bg-hover hover:text-text">
              <ChevronLeft size={13} /> {parent.key}
            </button>
          )}
          <span className="font-mono text-[12px] font-semibold text-faint">{issue.icon} {issue.key}</span>
          <span className="truncate text-[10.5px] text-faint">
            {issue.updated ? `· Modificado ${issue.updated.replace("T", " ")}` : issue.created ? `· Creado ${issue.created}` : ""}
          </span>
          <span className="flex-1" />
          <IconButton title="Cerrar" onClick={() => void close()}><X size={15} /></IconButton>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[720px] px-14 py-8">
            <div className="flex items-start gap-3">
              <span className="mt-1 text-[26px] leading-none">{issue.icon}</span>
              <textarea
                ref={title}
                rows={1}
                aria-label="Título del issue"
                placeholder="Sin título"
                value={f.title ?? ""}
                onChange={(e) => set({ title: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    (e.target as HTMLTextAreaElement).blur();
                  }
                }}
                className="min-w-0 flex-1 resize-none overflow-hidden rounded-md bg-transparent px-1 font-bold leading-tight outline-none placeholder:text-faint focus:bg-white/[0.04]"
                style={{ color: PEEK_TEXT, fontSize: 40 }}
              />
            </div>

            <div className="mt-6 grid grid-cols-2 gap-x-4">
              <PeekRow icon={<Tag />} label="Tipo">
                <PeekMenu ariaLabel="Tipo" value={f.type ?? ""} options={typeOptions} onChange={(type) => set({ type })} />
              </PeekRow>
              <PeekRow icon={<CircleDot />} label="Estado">
                <PeekMenu ariaLabel="Estado" chip value={f.status ?? ""} options={statusOptions} onChange={(status) => set({ status })} />
              </PeekRow>
              <PeekRow icon={<Flag />} label="Prioridad">
                <PeekMenu ariaLabel="Prioridad" chip value={String(f.priority ?? "")} options={priorityOptions}
                  onChange={(v) => set({ priority: Number(v) })} />
              </PeekRow>
              <PeekRow icon={<GitBranch />} label="Padre">
                <PeekMenu ariaLabel="Padre" value={f.parent ?? ""} options={parentMenuOptions} placeholder="Sin padre"
                  onChange={(parent) => set({ parent })} menuWidth={300} />
              </PeekRow>
              <PeekRow icon={<CalendarDays />} label="Inicio">
                <PeekDate ariaLabel="Inicio" value={f.start ?? ""} onChange={(start) => set({ start: start || null })} />
              </PeekRow>
              <PeekRow icon={<CalendarCheck />} label="Vence">
                <PeekDate ariaLabel="Vence" value={f.due ?? ""} onChange={(due) => set({ due: due || null })} />
              </PeekRow>
              <PeekRow icon={<Clock />} label="Hora">
                <PeekTime ariaLabel="Hora" value={f.due_time ?? ""} onChange={(due_time) => set({ due_time })} />
              </PeekRow>
              <PeekRow icon={<Timer />} label="Estimación">
                <PeekText ariaLabel="Estimación (min)" digits placeholder="Sin estimar"
                  value={f.estimate_min === null || f.estimate_min === undefined ? "" : String(f.estimate_min)}
                  onChange={(v) => set({ estimate_min: v ? Number(v) : null })} />
                {f.estimate_min ? <span className="flex-none pr-1 text-[13px]" style={{ color: PEEK_LABEL }}>min</span> : null}
              </PeekRow>
              <PeekRow icon={<Bell />} label="Recordatorio">
                <PeekDateTime ariaLabel="Recordatorio" value={f.reminder ?? ""} onChange={(reminder) => set({ reminder: reminder || null })} />
              </PeekRow>
              <PeekRow icon={<Calendar />} label="En el calendario">
                <PeekCheck ariaLabel="En el calendario" checked={Boolean(f.in_calendar)} onChange={(in_calendar) => set({ in_calendar })} />
              </PeekRow>
              <PeekRow icon={<Repeat />} label="Repetición" wide>
                <RepeatPicker menu value={f.repeat ?? ""} onChange={(repeat) => set({ repeat })} />
              </PeekRow>
              <PeekRow icon={<Tags />} label="Etiquetas" wide>
                <PeekTags ariaLabel="Etiquetas" value={f.labels ?? []} onChange={(labels) => set({ labels })} />
              </PeekRow>
              <PeekRow icon={<Folder />} label="Carpeta del vault" wide>
                <PeekText ariaLabel="Carpeta del vault" placeholder="Carpeta del vault (opcional)"
                  value={f.linked_folder ?? ""} onChange={(linked_folder) => set({ linked_folder })} />
              </PeekRow>
              <PeekRow icon={<FileText />} label="Notas vinculadas" wide>
                <LinkedNotes part="notes" notes={f.linked_notes ?? []} folder={f.linked_folder ?? ""}
                  onChange={(linked_notes, linked_folder) => set({ linked_notes, linked_folder })} />
              </PeekRow>
              <PeekRow icon={<Paperclip />} label="Adjuntos" wide>
                <Attachments module="proyectos" owner={issue.id} refs={issue.attachments}
                  onChange={async (attachments) => {
                    try {
                      await api.issueUpdate(p.id, issue.id, { attachments });
                      await reload();
                    } catch (e) {
                      toast("error", (e as Error).message);
                    }
                  }} />
              </PeekRow>
            </div>

            <hr className="my-6 border-line" />

            <Section label={`Subtareas${tree.length ? ` · ${tree.filter(({ k }) => k.done).length}/${tree.length}` : ""}`}>
              <ul className="space-y-0.5">
                {tree.map(({ k, depth }) => (
                  <li key={k.id}>
                    <div className="group flex items-center gap-2 rounded-md px-1 py-0.5 hover:bg-white/[0.04]">
                      <span className="flex-none" style={{ width: depth * 18 }} />
                      <Tick checked={k.done} ariaLabel={`Hecha: ${k.title}`}
                        onChange={(done) => void moveIssue(k.id, done ? p.done_column : p.columns[0]!, 10 ** 6)} />
                      <button type="button" title={`Abrir ${k.key}`} onClick={() => openIssue(k.id)}
                        className={cn("min-w-0 flex-1 truncate text-left text-[13px] hover:underline", k.done ? "text-faint line-through" : "text-text")}>
                        <span className="mr-1.5 font-mono text-[11px] text-faint">{k.key}</span>{k.title}
                      </button>
                      <PeekMenu ariaLabel={`Estado de ${k.key}`} chip menuWidth={200} value={k.status}
                        options={p.columns.map((c) => ({
                          value: c,
                          label: `${c === p.done_column ? "✓ " : ""}${c}`,
                          colour: meta?.status_colours[c],
                        }))}
                        onChange={(status) => void moveIssue(k.id, status, 10 ** 6)} />
                      <IconButton title={`Añadir subtarea a ${k.key}`} className="opacity-0 group-hover:opacity-100"
                        onClick={() => { setSub(""); setAddingFor(addingFor === k.id ? null : k.id); }}><Plus size={12} /></IconButton>
                      <IconButton title="Eliminar subtarea" className="opacity-0 group-hover:opacity-100 hover:text-danger"
                        onClick={() => void removeKid(k)}><Trash2 size={12} /></IconButton>
                    </div>
                    {addingFor === k.id && (
                      <div className="flex items-center gap-1.5 rounded-md px-1 py-0.5 text-[13px] focus-within:bg-white/[0.04]"
                        style={{ paddingLeft: 4 + (depth + 1) * 18 }}>
                        <span className="text-faint">↳</span>
                        <input autoFocus className="min-w-0 flex-1 bg-transparent py-0.5 outline-none placeholder:text-faint" style={{ color: PEEK_TEXT }}
                          value={sub} placeholder={`Añadir subtarea a ${k.key}…`} aria-label={`Añadir subtarea a ${k.key}`}
                          onChange={(e) => setSub(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void addUnder(k.id);
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
                  value={child} placeholder={`Añadir subtarea a ${issue.key}…`} aria-label="Añadir subtarea"
                  onChange={(e) => setChild(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key !== "Enter" || !child.trim()) return;
                    try {
                      await api.issueCreate(p.id, { title: child.trim(), parent: issue.id, type: "Subtarea" });
                      setChild("");
                      await reload();
                    } catch (err) {
                      toast("error", (err as Error).message);
                    }
                  }} />
              </div>
            </Section>

            <div className="mt-6">
              <Section label="Descripción">
                <textarea rows={6} aria-label="Descripción"
                  className="w-full resize-y rounded-md bg-transparent px-1 font-mono text-[12.5px] leading-relaxed outline-none placeholder:text-faint focus:bg-white/[0.03]"
                  style={{ color: PEEK_TEXT }}
                  value={f.description ?? ""}
                  placeholder="Markdown. Usa «- [ ] paso» para una checklist."
                  onChange={(e) => set({ description: e.target.value })} />
                {checks.length > 0 && (
                  <div className="px-1 text-[11.5px]" style={{ color: PEEK_LABEL }}>Checklist: {ticked}/{checks.length}</div>
                )}
              </Section>
            </div>
          </div>
        </div>

        <div className="flex flex-none items-center gap-2 border-t border-line px-3 py-2.5">
          <GhostButton danger onClick={() => void remove()}><Trash2 size={13} /> Eliminar</GhostButton>
          <GhostButton onClick={() => setRubricOpen(true)} title="Evaluar este issue con rúbrica">📊 Rúbrica</GhostButton>
          <span className="min-w-0 flex-1 truncate text-[11.5px] text-faint">{rubric ? `Rúbrica: ${rubric.total}/${rubric.max} (${rubric.pct}%)` : hint}</span>
          <PrimaryButton onClick={() => void save()}>Guardar</PrimaryButton>
        </div>
      </div>
      {rubricOpen && (
        <div className="contents" onMouseDown={(e) => e.stopPropagation()}>
          <RubricDialog title={`${issue.key} — ${issue.title}`} initial={rubric?.scores ?? null}
            onClose={() => setRubricOpen(false)} onDone={(r) => { setRubric(r); setRubricOpen(false); }} />
        </div>
      )}
    </div>
  );
}
