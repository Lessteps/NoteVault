// Grabaciones: the right-panel face to record your own voice, keep the recordings in the vault
// (`Fuentes/Grabaciones/`) and play them back at any speed to compare with a model.

import { Mic, Pause, Pencil, Play, Square, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { create } from "zustand";
import { api } from "../../lib/bridge";
import { clock, durationMs } from "../../lib/player";
import type { EnglishRecording } from "../../lib/types";
import { useApp } from "../../store/app";
import { cn, IconButton } from "../ui";
import { input } from "../common/forms";

export const useRecordingsPanel = create<{ open: boolean; setOpen: (v: boolean) => void }>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(new Error("No se pudo leer la grabación."));
    r.readAsDataURL(blob);
  });
}

export function RecordingsPanel() {
  const setOpen = useRecordingsPanel((s) => s.setOpen);
  const toast = useApp((s) => s.toast);
  const [items, setItems] = useState<EnglishRecording[]>([]);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [pending, setPending] = useState<Blob | null>(null);
  const [name, setName] = useState("");
  const [current, setCurrent] = useState<string>("");
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const pendingUrl = useMemo(() => (pending ? URL.createObjectURL(pending) : ""), [pending]);
  useEffect(() => () => { if (pendingUrl) URL.revokeObjectURL(pendingUrl); }, [pendingUrl]);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      setItems((await api.enRecordingList()).items);
    } catch (e) {
      toast("error", (e as Error).message);
    }
  }, [toast]);
  useEffect(() => {
    void refresh();
    return () => {
      audio.current?.pause();
      if (timer.current) window.clearInterval(timer.current);
      recorder.current?.stream.getTracks().forEach((t) => t.stop());
    };
  }, [refresh]);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setPending(new Blob(chunks, { type: rec.mimeType || "audio/webm" }));
        setRecording(false);
        if (timer.current) window.clearInterval(timer.current);
      };
      audio.current?.pause();
      rec.start();
      recorder.current = rec;
      setRecording(true);
      setSeconds(0);
      setPending(null);
      timer.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      toast("error", "No se pudo usar el micrófono. Revisa el permiso en Windows (Privacidad › Micrófono).");
    }
  };

  const save = async () => {
    if (!pending) return;
    try {
      await api.enRecordingSave(name.trim() || "Grabación", await toBase64(pending), "webm");
      setPending(null);
      setName("");
      await refresh();
      toast("info", "Grabación guardada en Fuentes/Grabaciones.");
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };

  const play = async (r: EnglishRecording) => {
    const a = audio.current;
    if (!a) return;
    if (current === r.id) {
      if (a.paused) void a.play();
      else a.pause();
      return;
    }
    try {
      a.src = (await api.enRecordingUrl(r.id)).url;
      a.defaultPlaybackRate = speed;
      a.playbackRate = speed;
      a.preservesPitch = true;
      setCurrent(r.id);
      setPos(0);
      setDur(0);
      await a.play();
    } catch (e) {
      toast("error", (e as Error).message || "No se pudo reproducir.");
    }
  };

  const setRate = (r: number) => {
    setSpeed(r);
    if (audio.current) {
      // Loading a new file resets the rate to the default one, so the chosen speed is the default too.
      audio.current.defaultPlaybackRate = r;
      audio.current.playbackRate = r;
    }
  };

  return (
    <aside className="flex h-full w-[340px] flex-none flex-col border-l border-line bg-panel" aria-label="Grabaciones">
      <div className="flex h-9 flex-none items-center gap-2 border-b border-line px-3">
        <Mic size={14} className="text-accent-text" />
        <span className="text-[12px] font-semibold text-text">Grabaciones</span>
        <div className="flex-1" />
        <IconButton title="Cerrar" onClick={() => setOpen(false)}>
          <X size={14} />
        </IconButton>
      </div>

      <audio
        ref={audio}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => {
          setPos(e.currentTarget.currentTime * 1000);
          const d = durationMs(e.currentTarget);
          if (d > 0) setDur(d);
        }}
        onLoadedMetadata={(e) => setDur(durationMs(e.currentTarget))}
        onDurationChange={(e) => setDur(durationMs(e.currentTarget))}
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="rounded-xl border border-line bg-card p-3">
          {recording ? (
            <div className="flex items-center gap-3">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-danger" />
              <span className="font-mono text-[13px] text-text">{clock(seconds * 1000)}</span>
              <div className="flex-1" />
              <button type="button" onClick={() => recorder.current?.stop()} className="inline-flex items-center gap-1.5 rounded-lg bg-danger px-3 py-1.5 text-[12px] font-semibold text-white">
                <Square size={12} /> Parar
              </button>
            </div>
          ) : pending ? (
            <div className="flex flex-col gap-2">
              <audio controls src={pendingUrl} className="w-full" />
              <input aria-label="Nombre de la grabación" className={input} placeholder="Nombre (p. ej. Vocales largas)" value={name} onChange={(e) => setName(e.target.value)} />
              <div className="flex gap-2">
                <button type="button" onClick={() => void save()} className="flex-1 rounded-lg bg-accent px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-accent-strong">Guardar</button>
                <button type="button" onClick={() => setPending(null)} className="rounded-lg border border-line px-3 py-1.5 text-[12px] text-dim hover:text-text">Descartar</button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => void start()} className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2 text-[12.5px] font-semibold text-white hover:bg-accent-strong">
              <Mic size={14} /> Grabar mi voz
            </button>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between">
          <span className="font-mono text-[10.5px] uppercase tracking-wider text-faint">Velocidad de reproducción</span>
          <div className="flex gap-1">
            {SPEEDS.map((r) => (
              <button key={r} type="button" aria-pressed={speed === r} onClick={() => setRate(r)} className={cn("rounded px-1.5 py-0.5 font-mono text-[10.5px]", speed === r ? "bg-accent-soft text-accent-text" : "text-dim hover:text-text")}>
                {r}×
              </button>
            ))}
          </div>
        </div>

        {items.length === 0 && <p className="mt-3 text-[12px] leading-relaxed text-faint">Aún no hay grabaciones. Grábate leyendo una frase, una lista de palabras o hablando de un tema, y compárate con el modelo escuchándote a distintas velocidades.</p>}

        <div className="mt-2 flex flex-col gap-2">
          {items.map((r) => {
            const active = current === r.id;
            return (
              <div key={r.id} className="rounded-xl border border-line bg-card px-3 py-2">
                <div className="flex items-center gap-2">
                  <button type="button" aria-label={active && playing ? "Pausa" : "Reproducir"} onClick={() => void play(r)} className="grid h-7 w-7 flex-none place-items-center rounded-full bg-accent text-white">
                    {active && playing ? <Pause size={12} /> : <Play size={12} />}
                  </button>
                  {renaming?.id === r.id ? (
                    <input
                      autoFocus
                      aria-label="Nuevo nombre"
                      className={cn(input, "min-w-0 flex-1 py-0.5 text-[12px]")}
                      value={renaming.name}
                      onChange={(e) => setRenaming({ id: r.id, name: e.target.value })}
                      onKeyDown={async (e) => {
                        if (e.key === "Escape") setRenaming(null);
                        if (e.key === "Enter") {
                          try {
                            const out = await api.enRecordingRename(r.id, renaming.name);
                            if (active) setCurrent(out.id);
                            setRenaming(null);
                            await refresh();
                          } catch (err) {
                            toast("error", (err as Error).message);
                          }
                        }
                      }}
                    />
                  ) : (
                    <div className="min-w-0 flex-1 truncate text-[12px] font-medium text-text" title={r.name}>{r.name}</div>
                  )}
                  <button type="button" title="Renombrar" onClick={() => setRenaming({ id: r.id, name: r.name })} className="text-faint hover:text-text"><Pencil size={12} /></button>
                  <button
                    type="button"
                    title="Borrar la grabación"
                    onClick={async () => {
                      if (active) audio.current?.pause();
                      await api.enRecordingRemove(r.id);
                      if (active) setCurrent("");
                      await refresh();
                    }}
                    className="text-faint hover:text-danger"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
                {active && (
                  <div className="mt-1.5">
                    <input
                      type="range"
                      aria-label="Posición de la grabación"
                      min={0}
                      max={Math.max(1, dur)}
                      value={Math.min(pos, Math.max(1, dur))}
                      onChange={(e) => {
                        if (audio.current) audio.current.currentTime = Number(e.target.value) / 1000;
                        setPos(Number(e.target.value));
                      }}
                      className="w-full accent-[var(--nv-accent)]"
                    />
                    <div className="flex justify-between font-mono text-[10px] text-faint">
                      <span>{clock(pos)}</span>
                      <span>{dur > 0 ? clock(dur) : "--:--"}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
