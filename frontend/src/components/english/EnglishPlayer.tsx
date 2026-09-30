// English player: the learner's own films and audio with dual subtitles, a
// clickable sentence list, repeat / A-B loop, shadowing with the microphone
// and sentence mining. The app never searches for or downloads content.

import {
  Captions, Clipboard, FolderOpen, Headphones, Mic, Pause, Pickaxe, Play, Repeat, SkipBack, SkipForward, Square, Volume2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../lib/bridge";
import { copyText } from "../../lib/clipboard";
import { clock, cueAt, cueBefore, durationMs, nextTarget, previousTarget, SPEEDS, type Pair } from "../../lib/player";
import type { PlayerMedia } from "../../lib/types";
import { useApp } from "../../store/app";
import { usePersistedNav } from "../../store/navState";
import { usePlayer } from "../../store/player";
import { Field, GhostButton, input, Modal, PrimaryButton } from "../common/forms";
import { cn } from "../ui";


const HINT = "Espacio reproducir · A/D frase anterior/siguiente · S repetir · ←/→ 5 s · L bucle A-B · [ ] velocidad · E/T subtítulos · H sombra · R grabar · O original · V mi voz · Enter continuar · M minar";

export function EnglishPlayer() {
  const media = usePlayer((s) => s.media);
  const toast = useApp((s) => s.toast);
  const video = useRef<HTMLVideoElement>(null);
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [files, setFiles] = useState({ en: "", es: "" });
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [showEn, setShowEn] = useState(true);
  const [showEs, setShowEs] = useState(true);
  const [loop, setLoop] = useState<{ a: number | null; b: number | null }>({ a: null, b: null });
  const [shadow, setShadow] = useState(false);
  const [turn, setTurn] = useState(-1);
  const [status, setStatus] = useState(HINT);
  const [mining, setMining] = useState<Pair | null>(null);
  const segment = useRef<{ end: number; then?: () => void } | null>(null);
  const shadowDone = useRef(-1);
  const recorder = useRef<MediaRecorder | null>(null);
  const [recording, setRecording] = useState(false);
  const [voice, setVoice] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!media) return;
    setPairs(media.pairs);
    setFiles({ en: media.en_file, es: media.es_file });
    setLoop({ a: null, b: null });
    setTurn(-1);
    shadowDone.current = -1;
    const v = video.current;
    if (v) {
      v.currentTime = media.seconds;
      void v.play().catch(() => undefined);
    }
  }, [media]);

  useEffect(() => () => {
    if (voice) URL.revokeObjectURL(voice);
  }, [voice]);

  const v = () => video.current;
  // play() rejects when the file cannot be played here (codec, container).
  const safePlay = (el: HTMLMediaElement | null | undefined) => {
    el?.play().catch(() => setStatus("Este archivo no se puede reproducir aquí. Prueba con MP4 (H.264/AAC), WebM o MP3."));
  };
  const current = cueAt(pairs, pos);
  const shown = current >= 0 ? current : -1;

  const seekMs = (ms: number) => {
    const el = v();
    if (el) el.currentTime = Math.max(0, ms / 1000);
    setPos(Math.max(0, ms));
  };

  const playSegment = useCallback((i: number, then?: () => void) => {
    const p = pairs[i];
    const el = video.current;
    if (!p || !el) return;
    segment.current = { end: p.end, then };
    el.currentTime = p.start / 1000;
    safePlay(el);
  }, [pairs]);

  const enterTurn = () => {
    const i = cueBefore(pairs, (v()?.currentTime ?? 0) * 1000);
    setTurn(i);
    setStatus("Tu turno: repite la frase en voz alta (R para grabarte), O original, V tu voz, Enter para seguir.");
  };

  // The clock: subtitles, segment ends, A-B loop and shadowing pauses.
  const onTime = () => {
    const el = v();
    if (!el) return;
    const ms = el.currentTime * 1000;
    setPos(ms);
    // The duration can arrive after the metadata event (or never as a number the first time): keep it in sync.
    const d = durationMs(el);
    if (d > 0) setDur((prev) => (Math.abs(prev - d) > 500 ? d : prev));
    const seg = segment.current;
    if (seg && ms >= seg.end) {
      segment.current = null;
      el.pause();
      seg.then?.();
      return;
    }
    if (loop.a !== null && loop.b !== null && ms >= loop.b) {
      el.currentTime = loop.a / 1000;
      return;
    }
    if (shadow && !seg && turn < 0 && !el.paused) {
      const i = cueBefore(pairs, ms);
      if (i >= 0 && i > shadowDone.current && ms >= pairs[i]!.end - 60) {
        shadowDone.current = i;
        el.pause();
        enterTurn();
      }
    }
  };

  const toggle = () => {
    const el = v();
    if (!el) return;
    if (el.paused) safePlay(el);
    else el.pause();
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setVoice(URL.createObjectURL(new Blob(chunks, { type: rec.mimeType })));
        setRecording(false);
      };
      v()?.pause();
      rec.start();
      recorder.current = rec;
      setRecording(true);
    } catch {
      toast("error", "No se pudo usar el micrófono.");
    }
  };

  /** A listening exercise from what is playing (dictation, shadowing or podcast); without English subtitles it says why. */
  const makeDictation = async (kind: "dictation" | "shadowing" | "podcast" = "dictation") => {
    if (!media) return;
    try {
      const r = await api.enPlayerDictation(media.id, pos / 1000, kind);
      if (!r.ok || !r.path) {
        toast("error", r.message ?? "No se pudo crear el ejercicio.");
        return;
      }
      toast("info", "Ejercicio creado en la rama Escucha.");
      await useApp.getState().openNote(r.path);
      useApp.getState().setMode("read");
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };

  const actions: Record<string, () => void> = {
    toggle,
    prev: () => (pairs.length ? playFrom(previousTarget(pairs, pos)) : seekMs(pos - 5000)),
    next: () => (pairs.length ? playFrom(nextTarget(pairs, pos)) : seekMs(pos + 5000)),
    repeat: () => {
      const i = cueBefore(pairs, pos);
      if (i >= 0) {
        setTurn(-1);
        playSegment(i, shadow ? enterTurn : undefined);
      }
    },
    back: () => seekMs(pos - 5000),
    fwd: () => seekMs(pos + 5000),
    loop: () => {
      if (loop.a === null) {
        setLoop({ a: pos, b: null });
        setStatus(`Bucle: A = ${clock(pos)}. Pulsa L otra vez para marcar B.`);
      } else if (loop.b === null) {
        if (pos <= loop.a + 200) setStatus("B tiene que ir después de A.");
        else {
          setLoop({ a: loop.a, b: pos });
          seekMs(loop.a);
          safePlay(v());
          setStatus(`Bucle A-B: ${clock(loop.a)} → ${clock(pos)}. Pulsa L para quitarlo.`);
        }
      } else {
        setLoop({ a: null, b: null });
        setStatus("Bucle quitado.");
      }
    },
    slower: () => setRate(SPEEDS[Math.max(0, SPEEDS.indexOf(speed) - 1)]!),
    faster: () => setRate(SPEEDS[Math.min(SPEEDS.length - 1, SPEEDS.indexOf(speed) + 1)]!),
    en: () => setShowEn((x) => !x),
    es: () => setShowEs((x) => !x),
    shadow: () => {
      const on = !shadow;
      setShadow(on);
      setTurn(-1);
      shadowDone.current = cueAt(pairs, pos) >= 0 ? cueAt(pairs, pos) - 1 : cueBefore(pairs, pos);
      setStatus(on ? (pairs.length ? "Modo sombra: la pausa llegará al final de cada frase." : "El modo sombra necesita subtítulos.") : HINT);
    },
    record: () => {
      if (recorder.current?.state === "recording") recorder.current.stop();
      else void startRecording();
    },
    original: () => {
      const i = turn >= 0 ? turn : cueBefore(pairs, pos);
      if (i >= 0) playSegment(i, turn >= 0 ? () => undefined : undefined);
    },
    voice: () => {
      if (!voice) {
        setStatus("Todavía no hay grabación: pulsa «Grabar» (R).");
        return;
      }
      v()?.pause();
      void new Audio(voice).play().catch(() => undefined);
    },
    cont: () => {
      if (turn < 0) return;
      setTurn(-1);
      segment.current = null;
      setStatus("Modo sombra: la pausa llegará al final de cada frase.");
      safePlay(v());
    },
    mine: () => {
      const i = cueBefore(pairs, pos);
      if (i < 0) {
        setStatus("Abre un video con subtítulos para minar frases.");
        return;
      }
      v()?.pause();
      setMining(pairs[i]!);
    },
  };

  function playFrom(i: number) {
    const p = pairs[i];
    if (!p) return;
    seekMs(p.start);
    safePlay(v());
  }

  function setRate(r: number) {
    setSpeed(r);
    const el = v();
    if (el) el.playbackRate = r;
  }

  // Keyboard shortcuts (not while typing in a field).
  const keys = useRef(actions);
  keys.current = actions;
  useEffect(() => {
    const map: Record<string, string> = {
      " ": "toggle", a: "prev", d: "next", s: "repeat", ArrowLeft: "back", ArrowRight: "fwd", l: "loop",
      "[": "slower", "]": "faster", e: "en", t: "es", h: "shadow", r: "record", o: "original", v: "voice",
      Enter: "cont", m: "mine",
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if ((e.target as Element | null)?.closest?.("input, textarea, select, [role=dialog]")) return;
      const name = map[e.key.length === 1 ? e.key.toLowerCase() : e.key];
      if (!name) return;
      e.preventDefault();
      keys.current[name]!();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Keep the current sentence in view.
  useEffect(() => {
    if (shown < 0) return;
    listRef.current?.querySelector(`[data-i="${shown}"]`)?.scrollIntoView({ block: "nearest" });
  }, [shown]);

  const chooseSubs = async (track: "en" | "es") => {
    if (!media) return;
    try {
      const r = await api.enPlayerSubtitles(media.id, track);
      if (r.ok && r.pairs) {
        setPairs(r.pairs);
        setFiles({ en: r.en_file ?? "", es: r.es_file ?? "" });
      }
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };

  if (!media) {
    return (
      <div className="grid flex-1 place-items-center bg-surface">
        <div className="max-w-md text-center">
          <Captions size={30} className="mx-auto text-accent-text" />
          <div className="mt-2 text-[16px] font-semibold text-text">Reproductor de inglés</div>
          <p className="mt-2 text-[13px] leading-relaxed text-dim">
            Abre tus películas o audios con subtítulos en inglés y español (archivos .en.srt / .es.srt junto al video). Repite frases, haz sombra con tu micrófono y mina frases en notas de práctica.
          </p>
          <PrimaryButton className="mx-auto mt-4" onClick={() => void usePlayer.getState().pick()}><FolderOpen size={14} /> Abrir video o audio…</PrimaryButton>
        </div>
      </div>
    );
  }

  const sub = shown >= 0 ? pairs[shown]! : null;
  const btn = "grid h-8 w-8 place-items-center rounded-lg text-dim hover:bg-hover hover:text-text";

  return (
    <div className="flex min-w-0 flex-1 bg-surface">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-10 flex-none items-center gap-2 border-b border-line px-4">
          <span className="truncate text-[13px] font-semibold text-text">{media.name}</span>
          <span className="truncate text-[11px] text-faint">{files.en ? `EN: ${files.en}` : "sin subtítulos EN"}{files.es && ` · ES: ${files.es}`}</span>
          <div className="flex-1" />
          <GhostButton onClick={() => void chooseSubs("en")}>Subtítulos EN…</GhostButton>
          <GhostButton onClick={() => void chooseSubs("es")}>ES…</GhostButton>
          <GhostButton onClick={() => void usePlayer.getState().pick()}><FolderOpen size={13} /> Abrir…</GhostButton>
        </div>
        <div className="relative min-h-0 flex-1 bg-black">
          <video
            ref={video}
            src={media.url}
            className="h-full w-full"
            onTimeUpdate={onTime}
            onLoadedMetadata={(e) => setDur(durationMs(e.currentTarget))}
            onDurationChange={(e) => setDur(durationMs(e.currentTarget))}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onClick={toggle}
            onError={() => setStatus("Este archivo no se puede reproducir aquí. Prueba con MP4 (H.264/AAC), WebM o MP3.")}
          />
          {sub && (showEn || showEs) && (
            <div className="pointer-events-none absolute inset-x-0 bottom-6 flex flex-col items-center gap-1 px-8 text-center">
              {showEn && sub.en && <span className="rounded bg-black/70 px-2 py-0.5 text-[22px] font-semibold text-white">{sub.en}</span>}
              {showEs && sub.es && <span className="rounded bg-black/70 px-2 py-0.5 text-[17px] italic text-yellow-200">{sub.es}</span>}
            </div>
          )}
        </div>
        <input type="range" aria-label="Posición" min={0} max={Math.max(1, dur)} value={pos}
          onChange={(e) => seekMs(Number(e.target.value))} className="w-full flex-none accent-[var(--nv-accent)]" />
        <div className="flex flex-none items-center gap-1 px-3 py-2">
          <button type="button" title="Frase anterior (A)" onClick={actions.prev} className={btn}><SkipBack size={16} /></button>
          <button type="button" title="Reproducir / pausa (Espacio)" onClick={toggle} className={btn}>{playing ? <Pause size={17} /> : <Play size={17} />}</button>
          <button type="button" title="Frase siguiente (D)" onClick={actions.next} className={btn}><SkipForward size={16} /></button>
          <button type="button" title="Repetir frase (S)" onClick={actions.repeat} className={btn}><Repeat size={15} /></button>
          <span className="mx-2 font-mono text-[12px] text-dim">{clock(pos)} / {clock(dur)}</span>
          <button type="button" title="Bucle A-B (L)" onClick={actions.loop}
            className={cn("rounded-lg px-2 py-1 text-[12px]", loop.a !== null ? "bg-accent-soft text-text" : "text-dim hover:bg-hover")}>
            A-B{loop.a !== null && loop.b === null ? " · A" : ""}
          </button>
          <select aria-label="Velocidad" value={speed} onChange={(e) => setRate(Number(e.target.value))}
            className="rounded-md border border-line bg-surface px-1 py-0.5 text-[12px] text-text">
            {SPEEDS.map((s) => <option key={s} value={s}>{s}×</option>)}
          </select>
          <button type="button" title="Subtítulos en inglés (E)" onClick={actions.en}
            className={cn("rounded-lg px-2 py-1 text-[12px]", showEn ? "bg-accent-soft text-text" : "text-faint")}>EN</button>
          <button type="button" title="Subtítulos en español (T)" onClick={actions.es}
            className={cn("rounded-lg px-2 py-1 text-[12px]", showEs ? "bg-accent-soft text-text" : "text-faint")}>ES</button>
          <div className="flex-1" />
          <button type="button" title="Modo sombra (H)" onClick={actions.shadow}
            className={cn("flex items-center gap-1 rounded-lg px-2 py-1 text-[12px]", shadow ? "bg-accent text-white" : "text-dim hover:bg-hover")}>
            <Mic size={13} /> Sombra
          </button>
          <button type="button" title="Crear un dictado con la frase que suena (usa sus subtítulos en inglés)" onClick={() => void makeDictation("dictation")}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] text-dim hover:bg-hover hover:text-text"><Headphones size={13} /> Ej. dictado</button>
          <button type="button" title="Crear un ejercicio de shadowing: escuchar la frase que suena y replicarla" onClick={() => void makeDictation("shadowing")}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] text-dim hover:bg-hover hover:text-text"><Repeat size={13} /> Ej. shadowing</button>
          <button type="button" title="Crear una comprensión de podcast con los siguientes 45 segundos" onClick={() => void makeDictation("podcast")}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] text-dim hover:bg-hover hover:text-text"><Volume2 size={13} /> Ej. podcast</button>
          <button type="button" title="Minar la frase (M)" onClick={actions.mine}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] text-dim hover:bg-hover hover:text-text"><Pickaxe size={13} /> Minar</button>
          <button type="button" title="Copiar enlace a este momento" onClick={() => void api.enPlayerLink(media.id, pos / 1000)
            .then((r) => copyText(r.link)).then(() => setStatus("Enlace copiado: pégalo en una nota para volver a este momento."))}
            className={btn}><Clipboard size={14} /></button>
        </div>
        {shadow && (
          <div className="flex flex-none items-center gap-2 border-t border-line bg-panel px-4 py-2">
            <button type="button" onClick={actions.record}
              className={cn("flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold", recording ? "bg-danger text-white" : "bg-accent text-white")}>
              {recording ? <Square size={13} /> : <Mic size={13} />} {recording ? "Parar (R)" : "Grabar (R)"}
            </button>
            <GhostButton onClick={actions.original}><Volume2 size={13} /> Original (O)</GhostButton>
            <GhostButton onClick={actions.voice}>Mi voz (V)</GhostButton>
            <GhostButton onClick={actions.cont}>Continuar (Enter)</GhostButton>
          </div>
        )}
        <div className="flex-none truncate border-t border-line px-4 py-1.5 text-[11px] text-faint">{status}</div>
      </div>
      <aside className="flex w-[340px] flex-none flex-col border-l border-line bg-panel">
        <div className="flex-none border-b border-line px-4 py-2 font-mono text-[10.5px] uppercase tracking-wider text-faint">
          Frases {pairs.length > 0 && `· ${pairs.length}`}
        </div>
        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-2">
          {pairs.length === 0 && <p className="p-2 text-[12px] text-faint">Sin subtítulos. Pon un .srt con el mismo nombre junto al video, o elígelo arriba.</p>}
          {pairs.map((p, i) => (
            <button key={i} type="button" data-i={i} onClick={() => playFrom(i)}
              className={cn("block w-full rounded-lg px-2.5 py-1.5 text-left", i === shown ? "bg-accent-soft" : "hover:bg-hover")}>
              <span className="font-mono text-[10px] text-faint">{clock(p.start)}</span>
              {p.en && <div className="text-[13px] text-text">{p.en}</div>}
              {p.es && <div className="text-[12px] italic text-dim">{p.es}</div>}
            </button>
          ))}
        </div>
      </aside>
      {mining && <MineDialog media={media} pair={mining} onClose={() => setMining(null)} />}
    </div>
  );
}

function MineDialog({ media, pair, onClose }: { media: PlayerMedia; pair: Pair; onClose: () => void }) {
  const [sentence, setSentence] = useState(pair.en || pair.es);
  const [mode, setMode] = usePersistedNav<"translate" | "cloze">("player.mode", "translate");
  const [target, setTarget] = useState("");
  const [level, setLevel] = useState("B1");
  const [error, setError] = useState("");
  const create_ = async () => {
    try {
      const r = await api.enPlayerMine(media.id, { sentence, seconds: pair.start / 1000, mode, target, level, reference_es: pair.en ? pair.es : "" });
      useApp.getState().refreshTree();
      useApp.getState().toast("info", `Nota de práctica creada: ${r.path}`);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <Modal title="Minar frase" onClose={onClose}
      footer={<><div className="flex-1" /><GhostButton onClick={onClose}>Cancelar</GhostButton><PrimaryButton onClick={() => void create_()}>Crear nota de práctica</PrimaryButton></>}>
      <p className="text-[11.5px] text-faint">Frase en {clock(pair.start)} de «{media.name}»</p>
      <input aria-label="Frase" value={sentence} onChange={(e) => setSentence(e.target.value)} className={input} />
      {pair.en && pair.es && <p className="text-[12px] italic text-dim">ES: {pair.es}</p>}
      <div className="flex gap-4 text-[12.5px] text-text">
        <label className="flex items-center gap-1.5"><input type="radio" checked={mode === "translate"} onChange={() => setMode("translate")} /> Traducir al español</label>
        <label className="flex items-center gap-1.5"><input type="radio" checked={mode === "cloze"} onChange={() => setMode("cloze")} /> Completar hueco</label>
      </div>
      {mode === "cloze" && (
        <Field label="Palabra o expresión a ocultar"><input value={target} onChange={(e) => setTarget(e.target.value)} className={input} /></Field>
      )}
      <Field label="Nivel CEFR">
        <select value={level} onChange={(e) => setLevel(e.target.value)} className={input}>
          {["A1", "A2", "B1", "B2", "C1", "C2"].map((l) => <option key={l}>{l}</option>)}
        </select>
      </Field>
      {error && <p className="text-[12px] text-danger">{error}</p>}
    </Modal>
  );
}
