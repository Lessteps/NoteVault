// The audio of a listening exercise (dictation, gist, detail, gap, speed variation). The text stays HIDDEN
// until the exercise is graded: the learner works from what they hear.
//
// The audio is, in this order: the stretch of the vault's media file the exercise came from (a dictation made
// in the player), or the app reading the text aloud with the system's English voice. Speed can be changed and
// the clip replayed as often as wanted.

import { Eye, Pause, Play, Repeat2, Volume2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../lib/bridge";
import { cn } from "../ui";

const SPEEDS: Array<[string, number]> = [["0.7×", 0.7], ["1×", 1], ["1.25×", 1.25]];

export interface MediaClip {
  file: string;
  start: number;
  end: number;
}

/** The system's English voice, if it has one (voices load asynchronously). */
function englishVoice(): SpeechSynthesisVoice | null {
  return window.speechSynthesis?.getVoices().find((v) => /^en[-_]/i.test(v.lang)) ?? null;
}

export function AudioClip({ text, media = null, revealed }: { text: string; media?: MediaClip | null; revealed: boolean }) {
  const speech = typeof window !== "undefined" && "speechSynthesis" in window;
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [plays, setPlays] = useState(0);
  const [voice, setVoice] = useState<boolean>(() => (speech ? englishVoice() !== null : false));
  const [mediaOk, setMediaOk] = useState<boolean>(media !== null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const url = useRef("");

  useEffect(() => {
    if (!speech) return;
    const update = () => setVoice(englishVoice() !== null);
    window.speechSynthesis.addEventListener?.("voiceschanged", update);
    update();
    return () => {
      window.speechSynthesis.removeEventListener?.("voiceschanged", update);
      window.speechSynthesis.cancel();
    };
  }, [speech]);

  useEffect(
    () => () => {
      audio.current?.pause();
    },
    [],
  );

  const stop = useCallback(() => {
    window.speechSynthesis?.cancel();
    audio.current?.pause();
    setPlaying(false);
  }, []);

  const speak = useCallback(() => {
    if (!speech) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    const v = englishVoice();
    if (v) u.voice = v;
    u.rate = rate;
    u.onend = () => setPlaying(false);
    u.onerror = () => setPlaying(false);
    setPlaying(true);
    setPlays((n) => n + 1);
    window.speechSynthesis.speak(u);
  }, [speech, text, rate]);

  /** The stretch of the original media; when it cannot be played it falls back to the app's voice. */
  const playMedia = useCallback(async () => {
    if (!media) return;
    try {
      if (!url.current) url.current = (await api.enPlayerOpen(media.file, 0)).url;
      const el = audio.current ?? new Audio();
      audio.current = el;
      el.src = url.current;
      el.playbackRate = rate;
      el.ontimeupdate = () => {
        if (media.end > 0 && el.currentTime >= media.end) {
          el.pause();
          setPlaying(false);
        }
      };
      el.onended = () => setPlaying(false);
      el.currentTime = media.start;
      await el.play();
      setPlaying(true);
      setPlays((n) => n + 1);
    } catch {
      setMediaOk(false);
      speak();
    }
  }, [media, rate, speak]);

  const play = mediaOk && media ? () => void playMedia() : speak;
  const canPlay = (mediaOk && media !== null) || (speech && voice);

  return (
    <section aria-label="Audio del ejercicio">
      <h2 className="mb-1.5 font-mono text-[10.5px] uppercase tracking-wider text-faint">Audio</h2>
      <div className="rounded-xl border border-line bg-card px-4 py-3">
        {!canPlay ? (
          <p className="text-[12.5px] text-warn">
            {!speech
              ? "Este sistema no puede leer texto en voz alta."
              : "No hay una voz en inglés instalada. Añádela en Windows: Configuración › Hora e idioma › Voz."}
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={playing ? stop : play}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-accent-strong"
            >
              {playing ? <Pause size={13} /> : <Play size={13} />} {playing ? "Detener" : plays ? "Escuchar otra vez" : "Escuchar"}
            </button>
            <button type="button" title="Repetir desde el principio" onClick={play} className="grid h-8 w-8 place-items-center rounded-lg border border-line text-dim hover:text-text">
              <Repeat2 size={14} />
            </button>
            <span className="ml-1 flex items-center gap-1 text-[11px] text-faint"><Volume2 size={12} /> Velocidad</span>
            {SPEEDS.map(([label, value]) => (
              <button
                key={label}
                type="button"
                aria-pressed={rate === value}
                onClick={() => {
                  setRate(value);
                  if (audio.current) audio.current.playbackRate = value;
                }}
                className={cn("rounded-md border px-2 py-0.5 font-mono text-[11px]", rate === value ? "border-accent bg-accent-soft text-accent-text" : "border-line text-dim hover:text-text")}
              >
                {label}
              </button>
            ))}
            <span className="ml-auto font-mono text-[11px] text-faint">
              {mediaOk && media ? "audio original · " : ""}
              {plays ? `${plays} reproducción(es)` : "aún sin escuchar"}
            </span>
          </div>
        )}
        {revealed ? (
          <div className="mt-3 rounded-lg border border-line bg-panel px-3 py-2">
            <div className="mb-1 flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-wider text-faint"><Eye size={11} /> Texto del audio</div>
            <p className="text-[13.5px] leading-relaxed text-text">{text}</p>
          </div>
        ) : (
          <p className="mt-2 text-[11px] text-faint">El texto se muestra cuando corriges el ejercicio.</p>
        )}
      </div>
    </section>
  );
}
