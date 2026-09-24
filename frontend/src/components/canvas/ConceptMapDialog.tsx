// Concept-map generator: an order (plus context notes and a template) goes
// to the AI, which answers a YAML spec that becomes a .canvas map.

import { Copy, FilePlus2, LayoutDashboard, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { create } from "zustand";
import { api } from "../../lib/bridge";
import { copyText } from "../../lib/clipboard";
import { useApp } from "../../store/app";
import { useCanvas } from "../../store/canvas";
import { Field, GhostButton, input, Modal, PrimaryButton } from "../common/forms";
import { PathPicker } from "./PathPicker";

export const useConceptMap = create<{ open: boolean; set: (o: boolean) => void }>((set) => ({ open: false, set: (open) => set({ open }) }));

export function ConceptMapDialog() {
  const open = useConceptMap((s) => s.open);
  const close = () => useConceptMap.getState().set(false);
  const active = useApp((s) => s.active);
  const [order, setOrder] = useState("");
  const [context, setContext] = useState<string[]>([]);
  const [templates, setTemplates] = useState<Array<{ name: string; yaml: string }>>([]);
  const [template, setTemplate] = useState("");
  const [extra, setExtra] = useState("");
  const [folder, setFolder] = useState("");
  const [name, setName] = useState("Mapa");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [paste, setPaste] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFolder(active?.includes("/") ? active.slice(0, active.lastIndexOf("/")) : "");
    setStatus(null);
    setCreated(null);
    setPrompt(null);
    api.mapTemplates().then(setTemplates).catch(() => setTemplates([]));
  }, [open, active]);

  if (!open) return null;

  const done = (r: { ok: boolean; path?: string; errors?: string[] }) => {
    if (r.ok && r.path) {
      setCreated(r.path);
      setStatus({ text: `Mapa creado: ${r.path}` });
      useApp.getState().refreshTree();
    } else if (r.errors?.length) {
      setStatus({ text: r.errors.join("\n"), error: true });
    }
  };

  const generate = async () => {
    setBusy(true);
    setStatus({ text: "Generando…" });
    try {
      const r = await api.mapGenerate(order, context, extra, template, folder, name);
      if (r.bridge && r.prompt) {
        setPrompt(r.prompt);
        await copyText(r.prompt);
        if (r.url) void api.openExternal(r.url).catch(() => undefined);
        setStatus({ text: "Proveedor web: prompt copiado. Pégalo en tu IA, trae el YAML y pégalo abajo → «Crear desde YAML pegado»." });
      } else {
        if (r.prompt) setPrompt(r.prompt);
        done(r);
      }
    } catch (e) {
      setStatus({ text: (e as Error).message, error: true });
    } finally {
      setBusy(false);
    }
  };

  const build = async () => {
    try {
      done(await api.mapBuild(paste, folder, name));
    } catch (e) {
      setStatus({ text: (e as Error).message, error: true });
    }
  };

  const tplYaml = templates.find((t) => t.name === template)?.yaml ?? "";

  return (
    <Modal title="Generador de mapas conceptuales" onClose={close} width={640}
      footer={
        <>
          <PrimaryButton disabled={busy || !order.trim()} onClick={() => void generate()}><Sparkles size={14} /> Generar</PrimaryButton>
          {prompt && <GhostButton onClick={() => void copyText(prompt).then(() => setStatus({ text: "Prompt copiado." }))}><Copy size={14} /> Copiar prompt</GhostButton>}
          <div className="flex-1" />
          {created && (
            <PrimaryButton onClick={() => {
              close();
              useApp.getState().setModule("notas");
              void useCanvas.getState().open(created);
            }}><LayoutDashboard size={14} /> Abrir mapa</PrimaryButton>
          )}
        </>
      }>
      <Field label="Orden">
        <textarea value={order} onChange={(e) => setOrder(e.target.value)} rows={4} className={input}
          placeholder="Describe el mapa: idea central, conceptos y la forma (radial / árbol / lista). También puedes pegar un YAML de spec." />
      </Field>
      <div>
        <div className="mb-1 flex items-center">
          <span className="font-mono text-[10.5px] uppercase tracking-wider text-faint">Notas de contexto</span>
          <button type="button" onClick={() => setPicking(true)} className="ml-auto flex items-center gap-1 text-[12px] text-accent-text hover:underline">
            <FilePlus2 size={13} /> Añadir nota
          </button>
        </div>
        {context.length === 0 && <div className="text-[12px] text-faint">Ninguna (opcional).</div>}
        <div className="flex flex-wrap gap-1.5">
          {context.map((c) => (
            <span key={c} className="flex items-center gap-1 rounded-md bg-hover px-2 py-0.5 text-[12px] text-text">
              {c.split("/").pop()}
              <button type="button" aria-label={`Quitar ${c}`} onClick={() => setContext(context.filter((x) => x !== c))} className="text-faint hover:text-text"><X size={12} /></button>
            </span>
          ))}
        </div>
      </div>
      <Field label="Plantilla">
        <select value={template} onChange={(e) => setTemplate(e.target.value)} className={input}>
          <option value="">(ninguna)</option>
          {templates.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
        </select>
      </Field>
      {tplYaml && <pre className="max-h-32 overflow-auto rounded-lg bg-panel p-2 font-mono text-[11px] text-dim">{tplYaml}</pre>}
      <Field label="Contexto / órdenes adicionales">
        <textarea value={extra} onChange={(e) => setExtra(e.target.value)} rows={2} className={input} placeholder="Instrucciones extra (opcional)." />
      </Field>
      <div className="flex gap-3">
        <Field label="Carpeta de destino (en el vault)" className="flex-1">
          <input value={folder} onChange={(e) => setFolder(e.target.value)} className={input} placeholder="(raíz del vault)" />
        </Field>
        <Field label="Nombre" className="w-48">
          <input value={name} onChange={(e) => setName(e.target.value)} className={input} />
        </Field>
      </div>
      {prompt && (
        <>
          <Field label="YAML de la IA">
            <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={5} className={`${input} font-mono text-[12px]`}
              placeholder="Pega aquí el YAML que devolvió la IA…" />
          </Field>
          <GhostButton onClick={() => void build()}>Crear desde YAML pegado</GhostButton>
        </>
      )}
      {status && <p role="status" className={`whitespace-pre-wrap text-[12.5px] ${status.error ? "text-danger" : "text-dim"}`}>{status.text}</p>}
      {picking && (
        <PathPicker kind="note" onClose={() => setPicking(false)} onPick={(p) => {
          setPicking(false);
          if (!context.includes(p)) setContext([...context, p].slice(0, 12));
        }} />
      )}
    </Modal>
  );
}
