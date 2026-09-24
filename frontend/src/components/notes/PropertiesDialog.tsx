// Metadatos y configuración de estudio of a note (subject, topic, type,
// difficulty, status, mastery, tags), written into its frontmatter.

import { useEffect, useState } from "react";
import { create } from "zustand";
import { api } from "../../lib/bridge";
import { useApp } from "../../store/app";
import { Field, GhostButton, input, Modal, PrimaryButton } from "../common/forms";

export const useProperties = create<{ path: string | null; show: (p: string | null) => void }>((set) => ({
  path: null, show: (path) => set({ path }),
}));

const SUBJECTS: Record<string, string> = { mathematics: "📐 Matemáticas", programming: "💻 Programación", english: "🌐 Inglés", general: "📝 General" };
const DIFF = ["1 — Muy básico", "2 — Básico", "3 — Intermedio", "4 — Avanzado", "5 — Experto / Maestría"];

export function PropertiesDialog() {
  const path = useProperties((s) => s.path);
  const show = useProperties((s) => s.show);
  const note = useApp((s) => (path ? s.notes[path] : undefined));
  const toast = useApp((s) => s.toast);
  const [meta, setMeta] = useState<{ subjects: string[]; types: string[]; statuses: string[] } | null>(null);
  const [f, setF] = useState({ subject: "general", topic: "", type: "concept", difficulty: 1, status: "learning", mastery: 0, tags: "" });

  useEffect(() => {
    if (!path || !note) return;
    if (!meta) api.notePropertiesMeta().then(setMeta).catch(() => undefined);
    const fm = note.frontmatter ?? {};
    const tags = Array.isArray(fm.tags) ? fm.tags.join(", ") : String(fm.tags ?? "");
    setF({
      subject: String(fm.subject ?? "general").toLowerCase(), topic: String(fm.topic ?? ""),
      type: String(fm.type ?? "concept").toLowerCase(), difficulty: Number(fm.difficulty ?? 1) || 1,
      status: String(fm.status ?? "learning").toLowerCase(), mastery: Math.round((Number(fm.mastery ?? 0) || 0) * 100), tags,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);
  if (!path || !note) return null;

  const save = async () => {
    const app = useApp.getState();
    try {
      if (note.dirty) await app.save(path);
      const cur = useApp.getState().notes[path];
      const r = await api.noteSetProperties(path, {
        subject: f.subject, topic: f.topic, type: f.type, difficulty: f.difficulty, status: f.status,
        mastery: f.mastery / 100, tags: f.tags.split(",").map((t) => t.trim()).filter(Boolean),
      }, cur?.modified ?? null);
      if (r.conflict) return toast("error", "La nota cambió fuera de NoteVault; recárgala antes de editar sus propiedades.");
      await app.reload(path);
      show(null);
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  return (
    <Modal title="Metadatos y configuración de estudio" onClose={() => show(null)} width={480}
      footer={<><span className="flex-1" /><GhostButton onClick={() => show(null)}>Cancelar</GhostButton><PrimaryButton onClick={() => void save()}>Guardar propiedades</PrimaryButton></>}>
      <p className="text-[12px] text-dim">Estas propiedades clasifican «{note.title}» para el motor de ejercicios, SRS y maestría.</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Disciplina">
          <select className={input} value={f.subject} onChange={(e) => set({ subject: e.target.value })}>
            {(meta?.subjects ?? Object.keys(SUBJECTS)).map((s) => <option key={s} value={s}>{SUBJECTS[s] ?? s}</option>)}
          </select>
        </Field>
        <Field label="Tema / Topic"><input className={input} value={f.topic} placeholder="p. ej. Derivadas, Arrays, Past Simple" onChange={(e) => set({ topic: e.target.value })} /></Field>
        <Field label="Tipo de entidad">
          <select className={input} value={f.type} onChange={(e) => set({ type: e.target.value })}>
            {(meta?.types ?? [f.type]).map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
          </select>
        </Field>
        <Field label="Dificultad">
          <select className={input} value={f.difficulty} onChange={(e) => set({ difficulty: Number(e.target.value) })}>
            {DIFF.map((l, i) => <option key={l} value={i + 1}>{l}</option>)}
          </select>
        </Field>
        <Field label="Estado">
          <select className={input} value={f.status} onChange={(e) => set({ status: e.target.value })}>
            {(meta?.statuses ?? [f.status]).map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
          </select>
        </Field>
        <Field label={`Maestría · ${f.mastery} %`}>
          <input type="range" min={0} max={100} value={f.mastery} onChange={(e) => set({ mastery: Number(e.target.value) })} className="w-full accent-[var(--nv-accent)]" />
        </Field>
      </div>
      <Field label="Etiquetas"><input className={input} value={f.tags} placeholder="calculo, formulas, derivadas" onChange={(e) => set({ tags: e.target.value })} /></Field>
    </Modal>
  );
}
