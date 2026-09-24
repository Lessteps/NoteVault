// Goal editor, "submeta con checklist" and the area editor.

import { useEffect, useState } from "react";
import { api } from "../../lib/bridge";
import { todayIso } from "../../lib/tasks";
import type { Goal } from "../../lib/types";
import { useApp } from "../../store/app";
import { useGoals } from "../../store/goals";
import { ColourRow, Field, GhostButton, input, Modal, PrimaryButton, PRIORITY_NAMES } from "../common/forms";
import { cn, confirmAction } from "../ui";

const GOAL_COLOURS = ["#3f51b5", "#8e24aa", "#33b679", "#f6bf26", "#e67c73", "#039be5", "#f4511e", "#0b8043", "#7986cb", "#616161"];

export function GoalDialog() {
  const editing = useGoals((s) => s.editing);
  const setEditing = useGoals((s) => s.setEditing);
  const meta = useGoals((s) => s.meta);
  const areas = useGoals((s) => s.areas);
  const area = useGoals((s) => s.area);
  const detail = useGoals((s) => s.detail);
  const cards = useGoals((s) => s.cards);
  const loadAll = useGoals((s) => s.loadAll);
  const open = useGoals((s) => s.open);
  const reload = useGoals((s) => s.reload);
  const toast = useApp((s) => s.toast);
  const [f, setF] = useState<Partial<Goal>>({});
  const [lines, setLines] = useState("");

  useEffect(() => {
    if (editing === null) return;
    const g: Partial<Goal> | undefined = editing ? (detail?.goal.id === editing ? detail.goal : cards.find((c) => c.id === editing)) : undefined;
    setF(g ? { ...g } : {
      name: "", icon: "🎯", area: area !== "*" ? area : "", status: meta?.statuses[0] ?? "Activa", priority: 2,
      start: todayIso(), end: null, colour: "#3f51b5", description: "",
    });
    setLines("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  if (editing === null) return null;
  const set = (patch: Partial<Goal>) => setF((x) => ({ ...x, ...patch }));
  const save = async () => {
    const fields: Partial<Goal> = {
      name: f.name, icon: f.icon, area: f.area, status: f.status, priority: f.priority,
      start: f.start || null, end: f.end || null, colour: f.colour, description: f.description,
    };
    try {
      if (editing) {
        await api.goalsUpdate(editing, fields);
        setEditing(null);
        await Promise.all([loadAll(), reload()]);
      } else {
        const g = await api.goalsCreate(fields, lines.split("\n").map((l) => l.replace(/^\s*[-*]\s*(\[[ xX]\]\s*)?/, "").trim()).filter(Boolean));
        setEditing(null);
        await loadAll();
        await open(g.id);
      }
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };

  return (
    <Modal title={editing ? "Editar meta" : "Nueva meta"} onClose={() => setEditing(null)} width={580}
      footer={<><span className="flex-1" /><GhostButton onClick={() => setEditing(null)}>Cancelar</GhostButton>
        <PrimaryButton onClick={() => void save()}>{editing ? "Guardar" : "Crear meta"}</PrimaryButton></>}>
      <div className="grid grid-cols-[70px_1fr] gap-3">
        <Field label="Icono"><input className={input} value={f.icon ?? ""} onChange={(e) => set({ icon: e.target.value })} /></Field>
        <Field label="Nombre"><input autoFocus className={input} value={f.name ?? ""} placeholder="p. ej. Ser desarrollador backend" onChange={(e) => set({ name: e.target.value })} /></Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Área">
          <select className={input} value={f.area ?? ""} onChange={(e) => set({ area: e.target.value })}>
            <option value="">Sin área</option>
            {areas.map((a) => <option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}
          </select>
        </Field>
        <Field label="Estado">
          <select className={input} value={f.status} onChange={(e) => set({ status: e.target.value })}>
            {meta?.statuses.map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Prioridad">
          <select className={input} value={f.priority} onChange={(e) => set({ priority: Number(e.target.value) })}>
            {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{PRIORITY_NAMES[n]}</option>)}
          </select>
        </Field>
        <Field label="Inicio"><input type="date" className={input} value={f.start ?? ""} onChange={(e) => set({ start: e.target.value || null })} /></Field>
        <Field label="Fin"><input type="date" className={input} value={f.end ?? ""} onChange={(e) => set({ end: e.target.value || null })} /></Field>
      </div>
      <Field label="Color"><ColourRow colours={GOAL_COLOURS} value={f.colour ?? "#3f51b5"} onChange={(colour) => set({ colour })} /></Field>
      <Field label="Descripción">
        <textarea rows={3} className={cn(input, "resize-y")} value={f.description ?? ""} placeholder="Por qué importa y cómo sabrás que la lograste"
          onChange={(e) => set({ description: e.target.value })} />
      </Field>
      {!editing && (
        <Field label="Submetas iniciales (checklist: 1 por línea)">
          <textarea rows={4} className={cn(input, "resize-y")} value={lines} placeholder={"Aprender SQL\nConstruir una API REST\nDesplegar en la nube"}
            onChange={(e) => setLines(e.target.value)} />
        </Field>
      )}
    </Modal>
  );
}

const CATEGORIES = ["Teoría", "Práctica", "Ejercicios", "Proyectos", "Lectura", "Conceptos", "Repaso"];

export function ChecklistDialog() {
  const parent = useGoals((s) => s.checklistFor);
  const setFor = useGoals((s) => s.setChecklistFor);
  const detail = useGoals((s) => s.detail);
  const refresh = useGoals((s) => s.refreshAfterWrite);
  const openSubmeta = useGoals((s) => s.openSubmeta);
  const toast = useApp((s) => s.toast);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [priority, setPriority] = useState(true);
  const [lines, setLines] = useState("");

  useEffect(() => {
    if (parent !== null) {
      setName("");
      setCategory("");
      setPriority(true);
      setLines("");
    }
  }, [parent]);

  if (parent === null || !detail) return null;
  const cats = [...new Set([...CATEGORIES, ...detail.categories])];
  const save = async () => {
    try {
      const it = await api.goalItemCreate(detail.goal.id, name.trim() || "Nueva submeta", parent,
        { category, is_priority: priority }, lines.split("\n").map((l) => l.replace(/^\s*[-*]\s*(\[[ xX]\]\s*)?/, "").trim()).filter(Boolean));
      setFor(null);
      await refresh();
      if (priority && !parent) openSubmeta(it.id);
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };
  return (
    <Modal title="Nueva submeta con checklist" onClose={() => setFor(null)}
      footer={<><span className="flex-1" /><GhostButton onClick={() => setFor(null)}>Cancelar</GhostButton>
        <PrimaryButton onClick={() => void save()}>Crear</PrimaryButton></>}>
      <Field label="Nombre"><input autoFocus className={input} value={name} placeholder="p. ej. Módulo de Autenticación y JWT" onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Categoría">
        <input className={input} list="nv-goal-cats" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Sin categoría" />
        <datalist id="nv-goal-cats">{cats.map((c) => <option key={c} value={c} />)}</datalist>
      </Field>
      <label className="flex items-center gap-2 text-[12.5px] text-dim">
        <input type="checkbox" checked={priority} onChange={(e) => setPriority(e.target.checked)} /> ⭐ Prioritaria (tarjeta detallada con interfaz propia)
      </label>
      <Field label="Subtareas (checklist: 1 por línea)">
        <textarea rows={6} className={cn(input, "resize-y")} value={lines} onChange={(e) => setLines(e.target.value)}
          placeholder={"Leer la documentación\nImplementar login\nEscribir pruebas"} />
      </Field>
    </Modal>
  );
}

export function AreaDialog() {
  const editing = useGoals((s) => s.areaEditing);
  const setEditing = useGoals((s) => s.setAreaEditing);
  const areas = useGoals((s) => s.areas);
  const loadAll = useGoals((s) => s.loadAll);
  const toast = useApp((s) => s.toast);
  const area = editing ? areas.find((a) => a.id === editing) : undefined;
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const [colour, setColour] = useState("#3f51b5");
  useEffect(() => {
    if (editing === null) return;
    setName(area?.name ?? "");
    setIcon(area?.icon ?? "");
    setColour(area?.colour ?? "#3f51b5");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);
  if (editing === null) return null;
  const save = async () => {
    try {
      await api.areasSave(editing, { name, icon, colour });
      setEditing(null);
      await loadAll();
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };
  return (
    <Modal title={area ? "Editar área" : "Nueva área"} onClose={() => setEditing(null)} width={440}
      footer={<>
        {area && <GhostButton danger onClick={async () => {
          if (!(await confirmAction("Archivar área", `Las metas y proyectos de «${area.name}» quedan como «Sin área» mientras esté archivada.`, "Archivar", true))) return;
          try {
            await api.areasArchive(area.id, true);
            setEditing(null);
            await loadAll();
          } catch (e) {
            toast("error", (e as Error).message);
          }
        }}>Archivar área</GhostButton>}
        <span className="flex-1" /><GhostButton onClick={() => setEditing(null)}>Cancelar</GhostButton>
        <PrimaryButton onClick={() => void save()}>{area ? "Guardar" : "Crear área"}</PrimaryButton></>}>
      <div className="grid grid-cols-[70px_1fr] gap-3">
        <Field label="Icono"><input className={input} value={icon} placeholder="💻" onChange={(e) => setIcon(e.target.value)} /></Field>
        <Field label="Nombre"><input autoFocus className={input} value={name} placeholder="p. ej. Programación" onChange={(e) => setName(e.target.value)} /></Field>
      </div>
      <Field label="Color"><ColourRow colours={GOAL_COLOURS} value={colour} onChange={setColour} /></Field>
    </Modal>
  );
}
