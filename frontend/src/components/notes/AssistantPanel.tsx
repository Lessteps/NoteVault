// Asistente: chat about the open note; answers can go into the note.

import { ClipboardPaste, Copy, FilePlus, Settings2, Sparkles, Trash2, X, CornerDownLeft } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/bridge";
import { copyText, readClipboard } from "../../lib/clipboard";
import { renderMarkdown } from "../../lib/markdown";
import type { AiConfig, AiProvider } from "../../lib/types";
import { useApp } from "../../store/app";
import { useAssistant, type ChatMessage } from "../../store/assistant";
import { Field, GhostButton, input, Modal, PrimaryButton } from "../common/forms";
import { cn, IconButton } from "../ui";
import { editorSelection, insertAtCursor } from "./SourceEditor";

function Bubble({ m }: { m: ChatMessage }) {
  const toast = useApp((s) => s.toast);
  const html = useMemo(() => (m.role === "assistant" ? renderMarkdown(m.content) : ""), [m]);
  if (m.role === "system") return <div className="rounded-lg bg-elevated px-3 py-2 text-[12px] text-dim">{m.content}</div>;
  if (m.role === "user") return <div className="ml-8 whitespace-pre-wrap rounded-xl rounded-br-sm bg-accent-soft px-3 py-2 text-[12.5px] text-text">{m.content}</div>;
  const insert = () => {
    const app = useApp.getState();
    const note = app.active ? app.notes[app.active] : undefined;
    if (insertAtCursor(`\n${m.content}\n`)) return;
    if (!note || note.kind !== "note") return toast("error", "Abre una nota para insertar la respuesta.");
    app.editRaw(note.path, `${note.raw.replace(/\s*$/, "")}\n\n${m.content}\n`);
    toast("info", "Añadido al final de la nota");
  };
  const asNote = async () => {
    const title = (/^#+\s*(.+)$/m.exec(m.content)?.[1] ?? m.content.split("\n")[0] ?? "Respuesta").replace(/[\\/:*?"<>|#]/g, "").trim().slice(0, 60) || "Respuesta";
    try {
      const r = await api.createNote(title, "");
      const app = useApp.getState();
      app.refreshTree();
      await app.openNote(r.path);
      const n = useApp.getState().notes[r.path];
      if (n) useApp.getState().editRaw(r.path, `${m.content}\n`);
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };
  return (
    <div className="group">
      <div className="nv-prose rounded-xl rounded-bl-sm border border-line bg-card px-3 py-2 text-[12.5px]" dangerouslySetInnerHTML={{ __html: html }} />
      <div className="mt-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <IconButton title="Copiar" onClick={() => void copyText(m.content)}><Copy size={12} /></IconButton>
        <IconButton title="Insertar en la nota" onClick={insert}><CornerDownLeft size={12} /></IconButton>
        <IconButton title="Crear nota nueva con la respuesta" onClick={() => void asNote()}><FilePlus size={12} /></IconButton>
      </div>
    </div>
  );
}

export function AiSettingsDialog() {
  const open = useAssistant((s) => s.settingsOpen);
  const setOpen = useAssistant((s) => s.setSettings);
  const toast = useApp((s) => s.toast);
  const [providers, setProviders] = useState<AiProvider[]>([]);
  const [cfg, setCfg] = useState<AiConfig | null>(null);
  const [key, setKey] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  useEffect(() => {
    if (!open) return;
    setKey("");
    setStatus("");
    api.aiSettings().then((r) => { setProviders(r.providers); setCfg(r.config); }).catch((e) => toast("error", (e as Error).message));
  }, [open, toast]);
  if (!open || !cfg) return null;
  const info = providers.find((p) => p.key === cfg.provider);
  const save = async (andTest = false) => {
    try {
      const saved = await api.aiSettingsSave({ ...cfg, ...(key ? { api_key: key } : {}) });
      setCfg(saved);
      setKey("");
      if (andTest) {
        setStatus("Probando…");
        const r = await api.aiTest();
        setStatus(`✓ ${r.reply}`);
      } else setOpen(false);
    } catch (e) {
      setStatus(`⚠ ${(e as Error).message}`);
    }
  };
  return (
    <Modal title="¿Cómo quieres conectar la IA?" onClose={() => setOpen(false)} width={520}
      footer={<><span className="min-w-0 flex-1 truncate text-[11.5px] text-dim">{status}</span>
        <GhostButton onClick={() => void save(true)}>Probar</GhostButton><PrimaryButton onClick={() => void save()}>Guardar</PrimaryButton></>}>
      <Field label="Proveedor">
        <select className={input} value={cfg.provider} onChange={(e) => {
          const p = providers.find((x) => x.key === e.target.value)!;
          setCfg({ ...cfg, provider: p.key, base_url: p.default_url || cfg.base_url, model: p.default_model || cfg.model });
          setModels([]);
        }}>
          {providers.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
      </Field>
      {info && <p className="text-[12px] text-dim">{info.hint}</p>}
      {!info?.bridge && (
        <>
          <Field label="URL del servidor"><input className={input} value={cfg.base_url} onChange={(e) => setCfg({ ...cfg, base_url: e.target.value })} /></Field>
          <div className="flex items-end gap-2">
            <Field label="Modelo" className="flex-1">
              <input className={input} list="nv-ai-models" value={cfg.model} onChange={(e) => setCfg({ ...cfg, model: e.target.value })} />
              <datalist id="nv-ai-models">{models.map((m) => <option key={m} value={m} />)}</datalist>
            </Field>
            <GhostButton onClick={async () => {
              try {
                await api.aiSettingsSave(cfg);
                const ms = await api.aiModels();
                setModels(ms);
                setStatus(ms.length ? `${ms.length} modelos disponibles` : "El servidor no devolvió modelos.");
              } catch (e) {
                setStatus(`⚠ ${(e as Error).message}`);
              }
            }}>Buscar modelos</GhostButton>
          </div>
          <Field label={`API key${cfg.has_key ? " (guardada)" : ""}`}>
            <div className="flex gap-2">
              <input type="password" className={input} value={key} autoComplete="off" placeholder={cfg.has_key ? "•••••••• (déjalo vacío para conservarla)" : "Solo para OpenAI o Anthropic"} onChange={(e) => setKey(e.target.value)} />
              {cfg.has_key && <GhostButton onClick={async () => { const c = await api.aiSettingsSave({ ...cfg, clear_key: true }); setCfg(c); }}>Borrar</GhostButton>}
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Temperatura"><input type="number" step={0.1} min={0} max={2} className={input} value={cfg.temperature} onChange={(e) => setCfg({ ...cfg, temperature: Number(e.target.value) })} /></Field>
            <Field label="Máx. tokens"><input type="number" min={64} max={32000} className={input} value={cfg.max_tokens} onChange={(e) => setCfg({ ...cfg, max_tokens: Number(e.target.value) })} /></Field>
          </div>
        </>
      )}
      <label className="flex items-center gap-2 text-[12.5px] text-dim">
        <input type="checkbox" checked={cfg.include_note} onChange={(e) => setCfg({ ...cfg, include_note: e.target.checked })} /> Enviar la nota abierta como contexto
      </label>
    </Modal>
  );
}

export function AssistantPanel() {
  const messages = useAssistant((s) => s.messages);
  const busy = useAssistant((s) => s.busy);
  const ask = useAssistant((s) => s.ask);
  const clear = useAssistant((s) => s.clear);
  const setOpen = useAssistant((s) => s.setOpen);
  const setSettings = useAssistant((s) => s.setSettings);
  const awaiting = useAssistant((s) => s.awaitingPaste);
  const pasteReply = useAssistant((s) => s.pasteReply);
  const [q, setQ] = useState("");
  const [label, setLabel] = useState("");
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    api.aiSettings().then((r) => setLabel(r.providers.find((p) => p.key === r.config.provider)?.label ?? "")).catch(() => undefined);
  }, [messages.length]);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [messages.length, busy]);
  const send = () => {
    if (!q.trim()) return;
    void ask(q, editorSelection());
    setQ("");
  };
  return (
    <aside className="flex w-[340px] flex-none flex-col border-l border-line bg-panel" aria-label="Asistente">
      <div className="flex h-11 flex-none items-center gap-1.5 border-b border-line px-3">
        <Sparkles size={15} className="text-accent-text" />
        <span className="text-[13px] font-semibold text-text">Asistente</span>
        <button type="button" onClick={() => setSettings(true)} className="ml-1 truncate rounded px-1.5 text-[11px] text-faint hover:bg-hover hover:text-text">{label}</button>
        <span className="flex-1" />
        <IconButton title="Ajustes de IA" onClick={() => setSettings(true)}><Settings2 size={14} /></IconButton>
        <IconButton title="Limpiar conversación" onClick={clear}><Trash2 size={14} /></IconButton>
        <IconButton title="Cerrar" onClick={() => setOpen(false)}><X size={14} /></IconButton>
      </div>
      <div ref={list} className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3">
        {!messages.length && (
          <div className="rounded-xl border border-dashed border-line-strong p-3 text-[12.5px] leading-relaxed text-dim">
            Pregunta sobre la nota abierta: explicar, resumir, generar ejercicios… Si seleccionas un fragmento, se envía también.
            Las acciones de estudio sobre la nota también llegan aquí.
          </div>
        )}
        {messages.map((m, i) => <Bubble key={i} m={m} />)}
        {busy && <div className="text-[12px] text-faint">Pensando…</div>}
      </div>
      {awaiting && (
        <div className="flex-none border-t border-line px-3 py-2">
          <GhostButton onClick={async () => pasteReply(await readClipboard())} className="w-full justify-center"><ClipboardPaste size={13} /> Pegar respuesta</GhostButton>
        </div>
      )}
      <div className="flex-none border-t border-line p-3">
        <textarea rows={3} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Pregunta al asistente"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Pregunta algo sobre esta nota… (Enter envía, Shift+Enter salto de línea)"
          className={cn(input, "resize-none")} />
        <PrimaryButton onClick={send} disabled={busy || !q.trim()} className="mt-2 w-full justify-center">{busy ? "Pensando…" : "Enviar"}</PrimaryButton>
      </div>
    </aside>
  );
}
