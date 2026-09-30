// The micro player: a floating audio player in the bottom-right corner (like a podcast app's mini player). It plays a
// library source (podcast) with its transcript: the current sentence under the controls, the whole transcript on
// demand (click a sentence to jump), and exercises made from the exact point being played.

import { Captions, ChevronDown, ChevronUp, Headphones, Maximize2, Pause, Play, Repeat, RotateCcw, RotateCw, Volume2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/bridge";
import { clock, cueAt, durationMs } from "../../lib/player";
import { useApp } from "../../store/app";
import { useMini } from "../../store/miniPlayer";
import { usePlayer } from "../../store/player";
import { cn } from "../ui";

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];
const BACK = 10;
const FORWARD = 30;

export function MiniPlayer() {
  const media = useMini((s) => s.media);
  const source = useMini((s) => s.source);
  const plain = useMini((s) => s.plain);
  const expanded = useMini((s) => s.expanded);
  const setExpanded = useMini((s) => s.setExpanded);
  const close = useMini((s) => s.close);
  const module = useApp((s) => s.module);
  const toast = useApp((s) => s.toast);
  const audio = useRef<HTMLAudioElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [text, setText] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const el = audio.current;
    if (!el || !media) return;
    setError("");
    setPos(media.seconds * 1000);
    setDur(0);
    el.currentTime = media.seconds;
    el.defaultPlaybackRate = speed;
    el.playbackRate = speed;
    void el.play().catch(() => setError("Pulsa reproducir para empezar."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media]);

  // Keep the whole transcript scrolled to the sentence that is playing.
  const pairs = media?.pairs ?? [];
  const current = cueAt(pairs, pos);
  useEffect(() => {
    if (!text || current < 0) return;
    listRef.current?.querySelector<HTMLElement>(`[data-cue="${current}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [text, current]);

  // The full player and the mini one never play at once.
  useEffect(() => {
    if (module === "player") audio.current?.pause();
  }, [module]);

  if (!media || module === "player") return null;

  const el = () => audio.current;
  const seek = (ms: number) => {
    const a = el();
    if (!a) return;
    const limit = dur > 0 ? dur : Number.MAX_SAFE_INTEGER;
    a.currentTime = Math.min(Math.max(0, ms), limit) / 1000;
    setPos(Math.min(Math.max(0, ms), limit));
  };
  const toggle = () => {
    const a = el();
    if (!a) return;
    if (a.paused) void a.play().catch(() => setError("Este archivo no se puede reproducir aquí. Prueba con MP3, M4A o WAV."));
    else a.pause();
  };
  const setRate = (r: number) => {
    setSpeed(r);
    if (el()) {
      el()!.defaultPlaybackRate = r;
      el()!.playbackRate = r;
    }
  };
  const line = current >= 0 ? pairs[current]! : null;

  const exercise = async (kind: "dictation" | "shadowing" | "podcast") => {
    try {
      const r = await api.enPlayerDictation(media.id, pos / 1000, kind);
      if (!r.ok || !r.path) {
        toast("error", r.message ?? "No se pudo crear el ejercicio.");
        return;
      }
      toast("info", "Ejercicio creado en la rama Escucha.");
      el()?.pause();
      await useApp.getState().openNote(r.path);
      useApp.getState().setMode("read");
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };

  const openFull = () => {
    el()?.pause();
    usePlayer.setState({ media: { ...media, seconds: pos / 1000 } });
    useApp.getState().setModule("player");
  };

  const iconBtn = "grid h-8 w-8 place-items-center rounded-lg text-dim hover:bg-hover hover:text-text disabled:opacity-40";

  return (
    <div
      role="region"
      aria-label="Micro reproductor"
      className={cn("fixed bottom-9 right-14 z-40 rounded-2xl border border-line-strong bg-card shadow-2xl", expanded ? "w-[380px]" : "w-[300px]")}
    >
      <audio
        ref={audio}
        src={media.url}
        preload="metadata"
        onTimeUpdate={(e) => {
          setPos(e.currentTarget.currentTime * 1000);
          const d = durationMs(e.currentTarget);
          if (d > 0) setDur((prev) => (Math.abs(prev - d) > 500 ? d : prev));
        }}
        onLoadedMetadata={(e) => setDur(durationMs(e.currentTarget))}
        onDurationChange={(e) => setDur(durationMs(e.currentTarget))}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onError={() => setError("Este archivo no se puede reproducir aquí. Prueba con MP3, M4A o WAV.")}
      />

      <div className="flex items-center gap-1.5 px-3 pt-2.5">
        <Headphones size={13} className="flex-none text-accent-text" />
        <div className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-text" title={source?.title ?? media.name}>{source?.title ?? media.name}</div>
        {!expanded && (
          <button type="button" aria-label={playing ? "Pausa" : "Reproducir"} onClick={toggle} className="grid h-7 w-7 place-items-center rounded-full bg-accent text-white">
            {playing ? <Pause size={13} /> : <Play size={13} />}
          </button>
        )}
        <button type="button" title={expanded ? "Minimizar" : "Ampliar"} aria-label={expanded ? "Minimizar" : "Ampliar"} onClick={() => setExpanded(!expanded)} className="grid h-6 w-6 place-items-center rounded text-faint hover:text-text">
          {expanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
        <button type="button" title="Cerrar el reproductor" aria-label="Cerrar reproductor" onClick={() => { el()?.pause(); close(); }} className="grid h-6 w-6 place-items-center rounded text-faint hover:text-text">
          <X size={14} />
        </button>
      </div>

      {expanded && (
        <div className="px-3 pb-3 pt-1">
          <div className="flex items-center justify-center gap-2">
            <button type="button" title={`Atrás ${BACK} s`} aria-label={`Atrás ${BACK} segundos`} onClick={() => seek(pos - BACK * 1000)} className={iconBtn}><RotateCcw size={17} /></button>
            <button type="button" title="Reproducir / pausa" aria-label={playing ? "Pausa" : "Reproducir"} onClick={toggle} className="grid h-10 w-10 place-items-center rounded-full bg-accent text-white hover:bg-accent-strong">
              {playing ? <Pause size={18} /> : <Play size={18} />}
            </button>
            <button type="button" title={`Adelante ${FORWARD} s`} aria-label={`Adelante ${FORWARD} segundos`} onClick={() => seek(pos + FORWARD * 1000)} className={iconBtn}><RotateCw size={17} /></button>
          </div>

          <input
            type="range"
            aria-label="Posición"
            min={0}
            max={Math.max(1, dur)}
            value={Math.min(pos, Math.max(1, dur))}
            onChange={(e) => seek(Number(e.target.value))}
            className="mt-1 w-full accent-[var(--nv-accent)]"
          />
          <div className="flex items-center justify-between font-mono text-[10.5px] text-faint">
            <span>{clock(pos)}</span>
            <div className="flex items-center gap-1">
              <Volume2 size={11} />
              {SPEEDS.map((r) => (
                <button key={r} type="button" aria-pressed={speed === r} onClick={() => setRate(r)} className={cn("rounded px-1 py-0.5", speed === r ? "bg-accent-soft text-accent-text" : "hover:text-text")}>
                  {r}×
                </button>
              ))}
            </div>
            <span>{dur > 0 ? clock(dur) : "--:--"}</span>
          </div>

          {error && <p className="mt-1 text-[11px] text-warn">{error}</p>}

          {(line || plain) && (
            <p className="mt-2 rounded-lg bg-panel px-2.5 py-1.5 text-[12.5px] leading-snug text-text">
              {line ? line.en : plain.split("\n").find((l) => l.trim())?.slice(0, 160)}
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {pairs.length > 0 && (
              <>
                <button type="button" onClick={() => void exercise("dictation")} title="Un dictado con la frase que suena" className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-0.5 text-[11px] font-semibold text-dim hover:border-accent hover:text-text"><Headphones size={11} /> Dictado</button>
                <button type="button" onClick={() => void exercise("shadowing")} title="Un shadowing con la frase que suena" className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-0.5 text-[11px] font-semibold text-dim hover:border-accent hover:text-text"><Repeat size={11} /> Shadowing</button>
                <button type="button" onClick={() => void exercise("podcast")} title="Una comprensión con los siguientes 45 segundos" className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-0.5 text-[11px] font-semibold text-dim hover:border-accent hover:text-text"><Volume2 size={11} /> Podcast</button>
              </>
            )}
            <div className="flex-1" />
            {(pairs.length > 0 || plain) && (
              <button type="button" aria-pressed={text} title="Ver la transcripción" onClick={() => setText((v) => !v)} className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px]", text ? "bg-accent-soft text-accent-text" : "text-dim hover:text-text")}><Captions size={12} /> Texto</button>
            )}
            <button type="button" title="Abrir en el reproductor completo" aria-label="Abrir en el reproductor completo" onClick={openFull} className="grid h-6 w-6 place-items-center rounded text-faint hover:text-text"><Maximize2 size={12} /></button>
          </div>

          {text && (
            <div ref={listRef} className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-line bg-panel p-1.5">
              {pairs.length > 0
                ? pairs.map((p, i) => (
                    <button
                      key={i}
                      type="button"
                      data-cue={i}
                      onClick={() => seek(p.start)}
                      className={cn("block w-full rounded px-1.5 py-1 text-left text-[12px] leading-snug", i === current ? "bg-accent-soft text-text" : "text-dim hover:bg-hover")}
                    >
                      <span className="mr-1.5 font-mono text-[10px] text-faint">{clock(p.start)}</span>
                      {p.en || p.es}
                    </button>
                  ))
                : plain.split(/\n+/).map((l, i) => <p key={i} className="px-1.5 py-1 text-[12px] leading-snug text-dim">{l}</p>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
