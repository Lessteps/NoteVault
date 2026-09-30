// Reproductor: the right-panel face with the learner's library of sources (podcasts, films, TED talks), each with its
// transcript. From here a source opens in the player, and practice sessions are built from it: what the learner writes
// or says is compared with the transcript. The app never downloads content; the files are the learner's own.

import { Headphones, Mic, Play, Plus, Repeat, Trash2, Volume2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { create } from "zustand";
import { api } from "../../lib/bridge";
import type { EnglishSource } from "../../lib/types";
import { useApp } from "../../store/app";
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

export function SourcesPanel() {
  const setOpen = useSourcesPanel((s) => s.setOpen);
  const toast = useApp((s) => s.toast);
  const openNote = useApp((s) => s.openNote);
  const [items, setItems] = useState<EnglishSource[]>([]);
  const [tab, setTab] = useState<EnglishSource["kind"] | "all">("all");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<{ kind: EnglishSource["kind"]; title: string }>({ kind: "podcast", title: "" });
  const [busy, setBusy] = useState("");

  const refresh = useCallback(async () => {
    try {
      setItems((await api.enSourceList()).items);
    } catch (e) {
      toast("error", (e as Error).message);
    }
  }, [toast]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const add = async () => {
    try {
      const r = await api.enSourceAdd(form.kind, form.title.trim(), true);
      if (r.ok && r.source) {
        setAdding(false);
        setForm({ ...form, title: "" });
        await refresh();
        toast("info", r.source.transcript ? `«${r.source.title}» añadida con su transcripción.` : `«${r.source.title}» añadida sin transcripción: añádela para practicar.`);
      }
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };

  const session = async (s: EnglishSource, kind: "dictation" | "shadowing" | "podcast", count: number) => {
    setBusy(`${s.id}:${kind}`);
    try {
      const r = await api.enSourceSession(s.id, kind, count);
      if (!r.ok || !r.first) {
        toast("error", r.message ?? "No se pudo crear la sesión.");
        return;
      }
      toast("info", `Sesión de ${r.count} ejercicio(s) creada en Escucha.`);
      await openNote(r.first);
      useApp.getState().setMode("read");
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy("");
    }
  };

  const shown = items.filter((s) => tab === "all" || s.kind === tab);

  return (
    <aside className="flex h-full w-[340px] flex-none flex-col border-l border-line bg-panel" aria-label="Reproductor">
      <div className="flex h-9 flex-none items-center gap-2 border-b border-line px-3">
        <Headphones size={14} className="text-accent-text" />
        <span className="text-[12px] font-semibold text-text">Reproductor</span>
        <div className="flex-1" />
        <IconButton title="Añadir una fuente (audio o video con su transcripción)" onClick={() => setAdding((v) => !v)} active={adding}>
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
            <div className="mb-2 flex gap-1.5">
              {(["podcast", "movie", "ted"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={form.kind === k}
                  onClick={() => setForm({ ...form, kind: k })}
                  className={cn("rounded-md border px-2 py-0.5 text-[11.5px]", form.kind === k ? "border-accent bg-accent-soft text-accent-text" : "border-line text-dim")}
                >
                  {KIND_LABEL[k]}
                </button>
              ))}
            </div>
            <input aria-label="Título de la fuente" className={input} placeholder="Título (p. ej. 6 Minute English — episodio 12)" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <button type="button" onClick={() => void add()} className="mt-2 w-full rounded-lg bg-accent px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-accent-strong">
              Elegir el archivo y su transcripción…
            </button>
            <p className="mt-1.5 text-[10.5px] leading-snug text-faint">Primero el audio o video; luego su subtítulo o transcripción con tiempos (.srt o .vtt). Si hay un .srt junto al archivo se usa solo.</p>
          </div>
        )}

        {items.length === 0 && !adding && (
          <p className="text-[12px] leading-relaxed text-faint">
            Aún no hay fuentes. Añade un podcast, una película o una charla TED con su transcripción y practicarás con ese audio en concreto: lo que escribas o digas se compara con la transcripción.
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
                    {!s.has_media && <span className="text-warn"> · falta el archivo</span>}
                    {s.has_media && !s.has_transcript && <span className="text-warn"> · sin transcripción</span>}
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
                <button type="button" disabled={!s.has_media} onClick={() => void usePlayer.getState().openSource(s.id)} className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-0.5 text-[11px] font-semibold text-text hover:border-accent disabled:opacity-40">
                  <Play size={11} /> Abrir
                </button>
                {!s.has_transcript && s.has_media && (
                  <button
                    type="button"
                    onClick={async () => {
                      await api.enSourceTranscript(s.id);
                      await refresh();
                    }}
                    className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-0.5 text-[11px] font-semibold text-dim hover:border-accent hover:text-text"
                  >
                    Añadir transcripción
                  </button>
                )}
                {s.has_media && s.has_transcript && (
                  <>
                    <button type="button" disabled={busy !== ""} onClick={() => void session(s, "dictation", 5)} title="5 dictados repartidos por el episodio, comparados con la transcripción" className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-0.5 text-[11px] font-semibold text-dim hover:border-accent hover:text-text disabled:opacity-40">
                      <Headphones size={11} /> Dictados
                    </button>
                    <button type="button" disabled={busy !== ""} onClick={() => void session(s, "shadowing", 5)} title="5 frases para escuchar y replicar" className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-0.5 text-[11px] font-semibold text-dim hover:border-accent hover:text-text disabled:opacity-40">
                      <Repeat size={11} /> Shadowing
                    </button>
                    <button type="button" disabled={busy !== ""} onClick={() => void session(s, "podcast", 2)} title="2 fragmentos de unos 45 s con idea general, detalles y resumen" className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-0.5 text-[11px] font-semibold text-dim hover:border-accent hover:text-text disabled:opacity-40">
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
