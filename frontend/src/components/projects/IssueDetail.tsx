// Issue side panel, as in Jira: every field, children, description, links and attachments.

import { Plus, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../lib/bridge";
import type { Issue } from "../../lib/types";
import { useApp } from "../../store/app";
import { issueById, useProjects } from "../../store/projects";
import { Attachments } from "../common/Attachments";
import { Field, GhostButton, input, Label, PrimaryButton, PRIORITY_NAMES } from "../common/forms";
import { LinkedNotes } from "../common/LinkedNotes";
import { RepeatPicker } from "../common/RepeatPicker";
import { cn, confirmAction, IconButton } from "../ui";
import { parentOptions } from "./ProjectDialogs";
import { RubricDialog, type RubricResult } from "./RubricDialog";

export function IssueDetail() {
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
  const [hint, setHint] = useState("");
  const [rubric, setRubric] = useState<RubricResult | null>(null);
  const [rubricOpen, setRubricOpen] = useState(false);

  useEffect(() => {
    if (!issue) return;
    setF({ ...issue });
    setHint("");
    // Only when another issue is opened or it is saved from elsewhere.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issue?.id, issue?.updated]);

  if (!detail || !issue) return null;
  const p = detail.project;
  const set = (patch: Partial<Issue>) => setF((x) => ({ ...x, ...patch }));
  const checks = (f.description ?? "").match(/- \[[ xX]\]/g) ?? [];
  const ticked = (f.description ?? "").match(/- \[[xX]\]/g)?.length ?? 0;

  const save = async () => {
    if (f.repeat && !f.due) {
      setHint("Un issue que se repite necesita una fecha de vencimiento.");
      return;
    }
    try {
      await api.issueUpdate(p.id, issue.id, {
        title: f.title, type: f.type, status: f.status, priority: f.priority, parent: f.parent,
        start: f.start || null, due: f.due || null, due_time: f.due_time || "", estimate_min: f.estimate_min ?? null,
        reminder: f.reminder || null, in_calendar: f.in_calendar, repeat: f.repeat ?? "", labels: f.labels,
        description: f.description, linked_folder: f.linked_folder, linked_notes: f.linked_notes,
      });
      setHint("Guardado ✓");
      await reload();
    } catch (e) {
      setHint((e as Error).message);
    }
  };

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

  const kids = issue.children.map((id) => issueById(detail, id)).filter((x): x is Issue => Boolean(x));

  return (
    <aside className="flex w-[420px] flex-none flex-col border-l border-line bg-panel" aria-label="Detalle del issue">
      <div className="flex h-11 flex-none items-center gap-2 border-b border-line px-4">
        <span className="font-mono text-[12px] font-semibold text-faint">{issue.icon} {issue.key}</span>
        <span className="truncate text-[10.5px] text-faint">
          {issue.updated ? `· Modificado ${issue.updated.replace("T", " ")}` : issue.created ? `· Creado ${issue.created}` : ""}
        </span>
        <IconButton title="Cerrar" onClick={() => openIssue(null)} className="ml-auto"><X size={15} /></IconButton>
      </div>
      <div className="flex-1 space-y-3.5 overflow-y-auto p-4">
        <input aria-label="Título del issue" className={cn(input, "text-[15px] font-medium")} value={f.title ?? ""}
          onChange={(e) => set({ title: e.target.value })} onKeyDown={(e) => e.key === "Enter" && void save()} />
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Tipo">
            <select className={input} value={f.type} onChange={(e) => set({ type: e.target.value })}>
              {meta?.types.map((t) => <option key={t} value={t}>{meta.type_icons[t]} {t}</option>)}
            </select>
          </Field>
          <Field label="Estado">
            <select className={input} value={f.status} onChange={(e) => set({ status: e.target.value })}>
              {p.columns.map((c) => <option key={c} value={c}>{c === p.done_column ? "✓ " : ""}{c}</option>)}
            </select>
          </Field>
          <Field label="Prioridad">
            <select className={input} value={f.priority} onChange={(e) => set({ priority: Number(e.target.value) })}>
              {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{PRIORITY_NAMES[n]}</option>)}
            </select>
          </Field>
          <Field label="Padre">
            <select className={input} value={f.parent ?? ""} onChange={(e) => set({ parent: e.target.value })}>
              <option value="">Sin padre</option>
              {parentOptions(detail, issue.id).map((o) => <option key={o.id} value={o.id}>{o.icon} {o.key} {o.title}</option>)}
            </select>
          </Field>
        </div>

        <div>
          <Label>Subtareas {kids.length ? `· ${kids.filter((k) => k.done).length}/${kids.length}` : ""}</Label>
          <ul className="space-y-1">
            {kids.map((k) => (
              <li key={k.id} className="group flex items-center gap-2 rounded-md px-1 py-0.5 hover:bg-hover">
                <input type="checkbox" className="accent-[var(--nv-mint)]" checked={k.done} aria-label={`Hecha: ${k.title}`}
                  onChange={(e) => void moveIssue(k.id, e.target.checked ? p.done_column : p.columns[0]!, 10 ** 6)} />
                <button type="button" onClick={() => openIssue(k.id)} className={cn("min-w-0 flex-1 truncate text-left text-[12.5px]", k.done ? "text-faint line-through" : "text-text")}>
                  <span className="mr-1.5 font-mono text-[11px] text-faint">{k.key}</span>{k.title}
                </button>
                <select value={k.status} onChange={(e) => void moveIssue(k.id, e.target.value, 10 ** 6)}
                  className="rounded border border-line bg-surface px-1 text-[11px] text-dim outline-none">
                  {p.columns.map((c) => <option key={c}>{c}</option>)}
                </select>
                <IconButton title="Eliminar subtarea" className="opacity-0 group-hover:opacity-100"
                  onClick={async () => {
                    try {
                      await api.issueDelete(p.id, k.id);
                      await reload();
                    } catch (e) {
                      toast("error", (e as Error).message);
                    }
                  }}><Trash2 size={12} /></IconButton>
              </li>
            ))}
          </ul>
          <input className={cn(input, "mt-1")} value={child} placeholder="Añadir subtarea…" onChange={(e) => setChild(e.target.value)}
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

        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Inicio"><input type="date" className={input} value={f.start ?? ""} onChange={(e) => set({ start: e.target.value || null })} /></Field>
          <Field label="Vence"><input type="date" className={input} value={f.due ?? ""} onChange={(e) => set({ due: e.target.value || null })} /></Field>
          <Field label="Hora"><input type="time" className={input} value={f.due_time ?? ""} onChange={(e) => set({ due_time: e.target.value })} /></Field>
          <Field label="Estimación (min)">
            <input type="number" min={0} className={input} value={f.estimate_min ?? ""} placeholder="Sin estimar"
              onChange={(e) => set({ estimate_min: e.target.value ? Number(e.target.value) : null })} />
          </Field>
          <Field label="Recordatorio">
            <input type="datetime-local" className={input} value={f.reminder ?? ""} onChange={(e) => set({ reminder: e.target.value || null })} />
          </Field>
          <label className="mt-5 flex items-center gap-2 text-[12.5px] text-dim">
            <input type="checkbox" className="accent-[var(--nv-accent)]" checked={Boolean(f.in_calendar)} onChange={(e) => set({ in_calendar: e.target.checked })} />
            En el calendario
          </label>
        </div>
        <div><Label>Repetición</Label><RepeatPicker value={f.repeat ?? ""} onChange={(repeat) => set({ repeat })} /></div>
        <Field label="Etiquetas (separadas por coma)">
          <input className={input} value={(f.labels ?? []).join(", ")} placeholder="frontend, diseño"
            onChange={(e) => set({ labels: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
        </Field>
        <div>
          <Label>Descripción</Label>
          <textarea rows={6} className={cn(input, "resize-y font-mono text-[12.5px]")} value={f.description ?? ""}
            placeholder="Markdown. Usa «- [ ] paso» para una checklist." onChange={(e) => set({ description: e.target.value })} />
          {checks.length > 0 && <div className="mt-0.5 text-[11.5px] text-faint">Checklist: {ticked}/{checks.length}</div>}
        </div>
        <div>
          <Label>Carpeta y notas vinculadas</Label>
          <LinkedNotes notes={f.linked_notes ?? []} folder={f.linked_folder ?? ""}
            onChange={(linked_notes, linked_folder) => set({ linked_notes, linked_folder })} />
        </div>
        <div>
          <Label>Adjuntos</Label>
          <Attachments module="proyectos" owner={issue.id} refs={issue.attachments}
            onChange={async (attachments) => {
              try {
                await api.issueUpdate(p.id, issue.id, { attachments });
                await reload();
              } catch (e) {
                toast("error", (e as Error).message);
              }
            }} />
        </div>
      </div>
      <div className="flex flex-none items-center gap-2 border-t border-line p-3">
        <GhostButton danger onClick={() => void remove()}><Trash2 size={13} /> Eliminar</GhostButton>
        <GhostButton onClick={() => setRubricOpen(true)} title="Evaluar este issue con rúbrica">📊 Rúbrica</GhostButton>
        <span className="min-w-0 flex-1 truncate text-[11.5px] text-faint">{rubric ? `Rúbrica: ${rubric.total}/${rubric.max} (${rubric.pct}%)` : hint}</span>
        <PrimaryButton onClick={() => void save()}>Guardar</PrimaryButton>
      </div>
      {rubricOpen && (
        <RubricDialog title={`${issue.key} — ${issue.title}`} initial={rubric?.scores ?? null}
          onClose={() => setRubricOpen(false)} onDone={(r) => { setRubric(r); setRubricOpen(false); }} />
      )}
    </aside>
  );
}

export function NewChildButton({ parent }: { parent: string }) {
  const setCreating = useProjects((s) => s.setCreating);
  return (
    <IconButton title="Crear hija" onClick={() => setCreating({ parent })}><Plus size={13} /></IconButton>
  );
}
