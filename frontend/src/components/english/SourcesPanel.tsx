// Reproductor: the right-panel face with the learner's library of sources (podcasts, films, TED talks), each with its
// transcript. From here a podcast opens in the micro player (a film or talk in the full player), and practice
// sessions are built from a source: what the learner writes or says is compared with the transcript.
// A transcript can be pasted as text (it is saved as a file in the space's `Fuentes/` folder); the app never
// downloads content, the files are the learner's own.

import { ClipboardPaste, FileText, Headphones, Mic, Play, Plus, Repeat, Trash2, Volume2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { create } from "zustand";
import { api } from "../../lib/bridge";
import type { EnglishSource } from "../../lib/types";
import { useApp } from "../../store/app";
import { useMini } from "../../store/miniPlayer";
import { usePlayer } from "../../store/player";
import { cn, IconButton } from "../ui";
import { input } from "../common/forms";

export const useSourcesPanel = create<{ open: boolean; setOpen: (v: boolean) => void }>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));

const KINDS: Array<{ id: EnglishSource["kind"] | "all"; label: string }> = [
  { id: "all", label: "Todo" },
  { id: "podcast", label: "Podcasts" },
  { id: "movie", label: "Películas" },
  { id: "ted", label: "TED" },
];
const KIND_LABEL: Record<EnglishSource["kind"], string> = { podcast: "Podcast", movie: "Película", ted: "TED Talk" };

type Adding = null | { mode: "file" | "paste"; attachTo: string };

export function SourcesPanel() {
  const setOpen = useSourcesPanel((s) => s.setOpen);
  const toast = useApp((s) => s.toast);
  const openNote = useApp((s) => s.openNote);
  const [items, setItems] = useState<EnglishSource[]>([]);
  const [folder, setFolder] = useState("");
  const [tab, setTab] = useState<EnglishSource["kind"] | "all">("all");
  const [adding, setAdding] = useState<Adding>(null);
  const [form, setForm] = useState<{ kind: EnglishSource["kind"]; title: string; copy: boolean; text: string }>({ kind: "podcast", title: "", copy: true, text: "" });
  const [busy, setBusy] = useState("");

  const refresh = useCallback(async () => {
    try {
      const r = await api.enSourceList();
      setItems(r.items);
      setFolder(r.folder);
    } catch (e) {
      toast("error", (e as Error).message);
    }
  }, [toast]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const kindButtons = (
    <div className="mb-2 flex gap-1.5">
      {(["podcast", "movie", "ted"] as const).map((k) => (
        <button
          key={k}
          type="button"
          aria-pressed={form.kind === k}
          onClick={() => setForm({ ...form, kind: k, copy: k !== "movie" })}
          className={cn("rounded-md border px-2 py-0.5 text-[11.5px]", form.kind === k ? "border-accent bg-accent-soft text-accent-text" : "border-line text-dim")}
        >
          {KIND_LABEL[k]}
        </button>
      ))}
    </div>
  );

  const addFile = async () => {
    setBusy("add");
    try {
      const r = await api.enSourceAdd(form.kind, form.title.trim(), true, form.copy);
      if (r.ok && r.source) {
        setAdding(null);
        setForm({ ...form, title: "" });
        await refresh();
        toast("info", r.source.transcript ? `«${r.source.title}» añadida con su transcripción.` : `«${r.source.title}» añadida sin transcripción: pégala o añade un .srt para practicar.`);
      }
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy("");
    }
  };

  const paste = async () => {
    try {
      const r = await api.enSourcePaste(form.kind, form.title.trim(), form.text, adding?.attachTo ?? "");
      if (r.ok) {
        setAdding(null);
        setForm({ ...form, title: "", text: "" });
        await refresh();
        toast("info", r.timed ? "Transcripción con tiempos guardada." : "Transcripción guardada como texto: la voz de la app leerá las frases.");
      }
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };

  const open = async (s: EnglishSource) => {
    if (s.kind === "podcast") await useMini.getState().openSource(s.id);
    else await usePlayer.getState().openSource(s.id);
  };

  const session = async (s: EnglishSource, kind: "dictation" | "shadowing" | "podcast", count: number) => {
    setBusy(`${s.id}:${kind}`);
    try {
      const r = await api.enSourceSession(s.id, kind, count);
      if (!r.ok || !r.first) {
        toast("error", r.message ?? "No se pudo crear la sesión.");
        return;
      }
      toast("info", `Sesión de ${r.count} ejercicio(s) creada en Escucha${r.audio === "voz" ? " (la voz de la app lee las frases)" : ""}.`);
      await openNote(r.first);
      useApp.getState().setMode("read");
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy("");
    }
  };

  const shown = items.filter((s) => tab === "all" || s.kind === tab);
  const small = "inline-flex items-center gap-1 rounded-md border border-line px-2 py-0.5 text-[11px] font-semibold text-dim hover:border-accent hover:text-text disabled:opacity-40";

  return (
    <aside className="flex h-full w-[340px] flex-none flex-col border-l border-line bg-panel" aria-label="Reproductor">
      <div className="flex h-9 flex-none items-center gap-2 border-b border-line px-3">
        <Headphones size={14} className="text-accent-text" />
        <span className="text-[12px] font-semibold text-text">Reproductor</span>
        <div className="flex-1" />
        <IconButton title="Añadir una fuente (audio o video con su transcripción)" onClick={() => setAdding(adding ? null : { mode: "file", attachTo: "" })} active={adding !== null}>
          <Plus size={14} />
        </IconButton>
        <IconButton title="Cerrar" onClick={() => setOpen(false)}>
          <X size={14} />
        </IconButton>
      </div>

      <div className="flex flex-none gap-1 border-b border-line px-3 py-2">
        {KINDS.map((k) => (
          <button
            key={k.id}
            type="button"
            aria-pressed={tab === k.id}
            onClick={() => setTab(k.id)}
            className={cn("rounded-md px-2 py-0.5 text-[11.5px] font-medium", tab === k.id ? "bg-accent-soft text-accent-text" : "text-dim hover:bg-hover hover:text-text")}
          >
            {k.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {adding && (
          <div className="mb-3 rounded-xl border border-line bg-card p-3">
            {adding.attachTo === "" && kindButtons}
            {adding.attachTo === "" && (
              <div className="mb-2 flex gap-1.5">
                <button type="button" aria-pressed={adding.mode === "file"} onClick={() => setAdding({ ...adding, mode: "file" })} className={cn("rounded-md px-2 py-0.5 text-[11.5px]", adding.mode === "file" ? "bg-accent-soft text-accent-text" : "text-dim")}>Con archivo</button>
                <button type="button" aria-pressed={adding.mode === "paste"} onClick={() => setAdding({ ...adding, mode: "paste" })} className={cn("rounded-md px-2 py-0.5 text-[11.5px]", adding.mode === "paste" ? "bg-accent-soft text-accent-text" : "text-dim")}>Solo transcripción (pegar)</button>
              </div>
            )}
            {adding.attachTo === "" && <input aria-label="Título de la fuente" className={input} placeholder="Título (p. ej. 6 Minute English — episodio 12)" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />}
            {adding.mode === "paste" ? (
              <>
                <textarea
                  aria-label="Transcripción"
                  rows={8}
                  className={cn(input, "mt-2 resize-y font-sans text-[12px]")}
                  placeholder="Pega aquí la transcripción: con tiempos (formato .srt o .vtt) o texto normal, frase por frase."
                  value={form.text}
                  onChange={(e) => setForm({ ...form, text: e.target.value })}
                />
                <button type="button" onClick={() => void paste()} disabled={form.text.trim().length < 20} className="mt-2 w-full rounded-lg bg-accent px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-accent-strong disabled:opacity-50">
                  Guardar la transcripción
                </button>
                <p className="mt-1.5 text-[10.5px] leading-snug text-faint">Se guarda como archivo en <span className="font-mono">{folder}/Transcripciones</span>. Sin tiempos, la voz de la app lee las frases en los ejercicios.</p>
              </>
            ) : (
              <>
                <label className="mt-2 flex items-center gap-1.5 text-[11.5px] text-dim">
                  <input type="checkbox" checked={form.copy} onChange={(e) => setForm({ ...form, copy: e.target.checked })} />
                  Copiar los archivos a <span className="font-mono">{folder || "Fuentes"}</span>
                </label>
                <button type="button" disabled={busy === "add"} onClick={() => void addFile()} className="mt-2 w-full rounded-lg bg-accent px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-accent-strong disabled:opacity-50">
                  {busy === "add" ? "Copiando…" : "Elegir el archivo y su transcripción…"}
                </button>
                <p className="mt-1.5 text-[10.5px] leading-snug text-faint">Primero el audio o video; luego su subtítulo con tiempos (.srt o .vtt). Si hay un .srt junto al archivo se usa solo. Las películas grandes conviene dejarlas donde están.</p>
              </>
            )}
          </div>
        )}

        {items.length === 0 && !adding && (
          <p className="text-[12px] leading-relaxed text-faint">
            Aún no hay fuentes. Añade un podcast, una película o una charla TED con su transcripción (o pega solo el texto) y practicarás con ese material en concreto: lo que escribas o digas se compara con la transcripción.
          </p>
        )}

        <div className="flex flex-col gap-2">
          {shown.map((s) => (
            <div key={s.id} className="rounded-xl border border-line bg-card px-3 py-2.5">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-semibold text-text" title={s.title}>{s.title}</div>
                  <div className="text-[10.5px] text-faint">
                    {KIND_LABEL[s.kind]}
                    {!s.media && <span> · solo transcripción</span>}
                    {s.media && !s.has_media && <span className="text-warn"> · falta el archivo</span>}
                    {!s.has_transcript && <span className="text-warn"> · sin transcripción</span>}
                    {s.has_transcript && !s.timed && <span> · texto sin tiempos</span>}
                  </div>
                </div>
                <button
                  type="button"
                  title="Quitar de la biblioteca (no borra tus archivos)"
                  onClick={async () => {
                    await api.enSourceRemove(s.id);
                    await refresh();
                  }}
                  className="text-faint hover:text-danger"
                >
                  <Trash2 size={13} />
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {s.media && (
                  <button type="button" disabled={!s.has_media} onClick={() => void open(s)} className={cn(small, "text-text")}>
                    <Play size={11} /> Abrir
                  </button>
                )}
                {!s.media && s.has_transcript && !s.transcript.startsWith("/") && !/^[A-Za-z]:/.test(s.transcript) && (
                  <button type="button" onClick={() => void openNote(s.transcript)} className={cn(small, "text-text")}>
                    <FileText size={11} /> Leer
                  </button>
                )}
                {!s.has_transcript && (
                  <>
                    <button type="button" onClick={() => { setForm({ ...form, title: s.title, text: "" }); setAdding({ mode: "paste", attachTo: s.id }); }} className={small}>
                      <ClipboardPaste size={11} /> Pegar transcripción
                    </button>
                    {s.has_media && (
                      <button
                        type="button"
                        onClick={async () => {
                          await api.enSourceTranscript(s.id);
                          await refresh();
                        }}
                        className={small}
                      >
                        Elegir .srt
                      </button>
                    )}
                  </>
                )}
                {s.has_transcript && (
                  <>
                    <button type="button" disabled={busy !== ""} onClick={() => void session(s, "dictation", 5)} title="5 dictados repartidos por el texto, comparados con la transcripción" className={small}>
                      <Headphones size={11} /> Dictados
                    </button>
                    <button type="button" disabled={busy !== ""} onClick={() => void session(s, "shadowing", 5)} title="5 frases para escuchar y replicar" className={small}>
                      <Repeat size={11} /> Shadowing
                    </button>
                    <button type="button" disabled={busy !== ""} onClick={() => void session(s, "podcast", 2)} title="2 fragmentos de unos 45 s con idea general, detalles y resumen" className={small}>
                      <Volume2 size={11} /> Podcast
                    </button>
                  </>
                )}
              </div>
              {busy.startsWith(s.id) && (
                <p className="mt-1.5 flex items-center gap-1 text-[10.5px] text-faint">
                  <Mic size={10} /> Preparando la sesión…
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
