// Project editor (create / edit, with its Kanban flow) and the create-issue form.

import { ArrowDown, ArrowUp, Check, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../lib/bridge";
import { todayIso } from "../../lib/tasks";
import { useApp } from "../../store/app";
import { descendants, useProjects } from "../../store/projects";
import { cn, IconButton } from "../ui";
import { ColourRow, Field, GhostButton, input, inputBase, Modal, PrimaryButton, PRIORITY_NAMES } from "../common/forms";

interface Col { name: string; was: string | null }

export function ProjectDialog() {
  const editing = useProjects((s) => s.editing);
  const setEditing = useProjects((s) => s.setEditing);
  const meta = useProjects((s) => s.meta);
  const areas = useProjects((s) => s.areas);
  const cards = useProjects((s) => s.cards);
  const open = useProjects((s) => s.open);
  const reload = useProjects((s) => s.reload);
  const loadAll = useProjects((s) => s.loadAll);
  const toast = useApp((s) => s.toast);
  const project = editing ? cards.find((c) => c.id === editing) : undefined;

  const [f, setF] = useState<Record<string, unknown>>({});
  const [cols, setCols] = useState<Col[]>([]);
  const [done, setDone] = useState("");
  const [newCol, setNewCol] = useState("");

  useEffect(() => {
    if (editing === null) return;
    const p = project;
    setF({
      name: p?.name ?? "", key: p?.key ?? "", icon: p?.icon ?? "", status: p?.status ?? meta?.statuses[0] ?? "Planeado",
      area: p?.area ?? "", start: p?.start ?? todayIso(), deadline: p?.deadline ?? "",
      colour: p?.colour ?? meta?.palette[cards.length % (meta?.palette.length || 1)] ?? "#2383e2",
      in_calendar: p?.in_calendar ?? false, description: p?.description ?? "",
    });
    const c = p?.columns ?? meta?.default_columns ?? ["Por hacer", "En curso", "En revisión", "Hecho"];
    setCols(c.map((name) => ({ name, was: p ? name : null })));
    setDone(p?.done_column ?? c[c.length - 1]!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  if (editing === null) return null;
  const set = (patch: Record<string, unknown>) => setF((x) => ({ ...x, ...patch }));

  const save = async () => {
    const columns = cols.map((c) => c.name.trim()).filter(Boolean);
    const renames: Record<string, string> = {};
    for (const c of cols) if (c.was && c.was !== c.name.trim() && c.name.trim()) renames[c.was] = c.name.trim();
    const doneName = cols.find((c) => c.was === done || c.name === done)?.name.trim() ?? columns[columns.length - 1];
    const fields = { ...f, columns, done_column: doneName, renames, deadline: f.deadline || null, start: f.start || null };
    if (!project) delete (fields as Record<string, unknown>).key;
    try {
      if (project) {
        await api.projectsUpdate(project.id, fields);
        setEditing(null);
        await reload();
        await loadAll();
      } else {
        const p = await api.projectsCreate(fields);
        setEditing(null);
        await loadAll();
        await open(p.id);
      }
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };

  return (
    <Modal title={project ? "Editar proyecto" : "Nuevo proyecto"} onClose={() => setEditing(null)} width={600}
      footer={<><span className="flex-1" /><GhostButton onClick={() => setEditing(null)}>Cancelar</GhostButton>
        <PrimaryButton onClick={() => void save()}>{project ? "Guardar" : "Crear proyecto"}</PrimaryButton></>}>
      <div className="grid grid-cols-[70px_1fr_100px] gap-3">
        <Field label="Icono"><input className={input} value={String(f.icon ?? "")} onChange={(e) => set({ icon: e.target.value })} placeholder="🌐" /></Field>
        <Field label="Nombre"><input className={input} autoFocus value={String(f.name ?? "")} onChange={(e) => set({ name: e.target.value })} placeholder="p. ej. Portafolio web" /></Field>
        {project && <Field label="Clave"><input className={input} value={String(f.key ?? "")} onChange={(e) => set({ key: e.target.value.toUpperCase() })} /></Field>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Estado">
          <select className={input} value={String(f.status)} onChange={(e) => set({ status: e.target.value })}>
            {meta?.statuses.map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Área">
          <select className={input} value={String(f.area ?? "")} onChange={(e) => set({ area: e.target.value })}>
            <option value="">Sin área</option>
            {areas.map((a) => <option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}
          </select>
        </Field>
        <Field label="Inicio"><input type="date" className={input} value={String(f.start ?? "")} onChange={(e) => set({ start: e.target.value })} /></Field>
        <Field label="Entrega"><input type="date" className={input} value={String(f.deadline ?? "")} onChange={(e) => set({ deadline: e.target.value })} /></Field>
      </div>
      <Field label="Color"><ColourRow colours={meta?.palette ?? []} value={String(f.colour ?? "#2383e2")} onChange={(c) => set({ colour: c })} /></Field>
      <label className="flex items-center gap-2 text-[12.5px] text-dim">
        <input type="checkbox" className="accent-[var(--nv-accent)]" checked={Boolean(f.in_calendar)} onChange={(e) => set({ in_calendar: e.target.checked })} />
        Mostrar sus issues con fecha en el calendario general
      </label>
      <div>
        <Field label="Flujo (columnas del tablero)"><span /></Field>
        <ul className="space-y-1">
          {cols.map((c, i) => (
            <li key={i} className="flex items-center gap-1.5">
              <input className={cn(inputBase, "flex-1")} value={c.name}
                onChange={(e) => setCols(cols.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <button type="button" title="Columna de «hecho»" onClick={() => setDone(c.was ?? c.name)}
                className={cn("grid h-7 w-7 place-items-center rounded-md", (c.was ?? c.name) === done ? "bg-mint-soft text-mint" : "text-faint hover:bg-hover")}>
                <Check size={14} />
              </button>
              <IconButton title="Subir" disabled={i === 0} onClick={() => { const n = [...cols]; [n[i - 1], n[i]] = [n[i]!, n[i - 1]!]; setCols(n); }}><ArrowUp size={13} /></IconButton>
              <IconButton title="Bajar" disabled={i === cols.length - 1} onClick={() => { const n = [...cols]; [n[i + 1], n[i]] = [n[i]!, n[i + 1]!]; setCols(n); }}><ArrowDown size={13} /></IconButton>
              <IconButton title="Quitar" disabled={cols.length < 2} onClick={() => setCols(cols.filter((_, j) => j !== i))}><X size={13} /></IconButton>
            </li>
          ))}
        </ul>
        <div className="mt-1.5 flex gap-1.5">
          <input className={cn(inputBase, "flex-1")} value={newCol} placeholder="Nueva columna"
            onChange={(e) => setNewCol(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && newCol.trim()) { setCols([...cols, { name: newCol.trim(), was: null }]); setNewCol(""); } }} />
          <GhostButton onClick={() => { if (newCol.trim()) { setCols([...cols, { name: newCol.trim(), was: null }]); setNewCol(""); } }}><Plus size={13} /></GhostButton>
        </div>
        <p className="mt-1 text-[11.5px] text-faint">✓ marca la columna de «hecho». Los issues de una columna quitada pasan a la primera.</p>
      </div>
      <Field label="Descripción">
        <textarea rows={3} className={cn(input, "resize-y")} value={String(f.description ?? "")} onChange={(e) => set({ description: e.target.value })} />
      </Field>
    </Modal>
  );
}

export function CreateIssueDialog() {
  const creating = useProjects((s) => s.creating);
  const setCreating = useProjects((s) => s.setCreating);
  const detail = useProjects((s) => s.detail);
  const meta = useProjects((s) => s.meta);
  const reload = useProjects((s) => s.reload);
  const openIssue = useProjects((s) => s.openIssue);
  const toast = useApp((s) => s.toast);
  const [title, setTitle] = useState("");
  const [type, setType] = useState("Tarea");
  const [status, setStatus] = useState("");
  const [parent, setParent] = useState("");
  const [priority, setPriority] = useState(2);

  useEffect(() => {
    if (!creating || !detail) return;
    const par = detail.issues.find((i) => i.id === creating.parent);
    setTitle("");
    setType(creating.type ?? (par && par.type !== "Submeta" ? "Subtarea" : "Tarea"));
    setStatus(creating.status ?? detail.project.columns[0]!);
    setParent(creating.parent ?? "");
    setPriority(2);
  }, [creating, detail]);

  if (!creating || !detail) return null;
  const p = detail.project;
  const save = async () => {
    try {
      const x = await api.issueCreate(p.id, { title: title.trim() || "Nuevo issue", type, status, parent, priority });
      setCreating(null);
      await reload();
      openIssue(parent ? parent : x.id);
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };
  return (
    <Modal title={`Crear issue en ${p.key}`} onClose={() => setCreating(null)}
      footer={<><span className="flex-1" /><GhostButton onClick={() => setCreating(null)}>Cancelar</GhostButton>
        <PrimaryButton onClick={() => void save()}>Crear</PrimaryButton></>}>
      <Field label="Título">
        <input autoFocus className={input} value={title} onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void save()} placeholder="¿Qué hay que hacer?" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tipo">
          <select className={input} value={type} onChange={(e) => setType(e.target.value)}>
            {meta?.types.map((t) => <option key={t} value={t}>{meta.type_icons[t]} {t}</option>)}
          </select>
        </Field>
        <Field label="Estado">
          <select className={input} value={status} onChange={(e) => setStatus(e.target.value)}>
            {p.columns.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Prioridad">
          <select className={input} value={priority} onChange={(e) => setPriority(Number(e.target.value))}>
            {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{PRIORITY_NAMES[n]}</option>)}
          </select>
        </Field>
        <Field label="Padre">
          <select className={input} value={parent} onChange={(e) => setParent(e.target.value)}>
            <option value="">Sin padre</option>
            {detail.issues.filter((i) => i.type !== "Subtarea").map((i) => <option key={i.id} value={i.id}>{i.icon} {i.key} {i.title}</option>)}
          </select>
        </Field>
      </div>
    </Modal>
  );
}

export function parentOptions(d: NonNullable<ReturnType<typeof useProjects.getState>["detail"]>, id: string) {
  const banned = descendants(d, id);
  banned.add(id);
  return d.issues.filter((i) => !banned.has(i.id) && i.type !== "Subtarea").sort((a, b) => a.number - b.number);
}
