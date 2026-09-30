// The audio of a listening exercise (dictation, gist, detail, gap, speed variation). The app reads the text
// aloud with the system's English voice and the text stays HIDDEN until the exercise is graded: the learner
// works from what they hear. Speed can be changed and the clip replayed as often as the exercise allows.

import { Eye, Pause, Play, Repeat2, Volume2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "../ui";

const SPEEDS: Array<[string, number]> = [["0.7×", 0.7], ["1×", 1], ["1.25×", 1.25]];

/** The system's English voice, if it has one (voices load asynchronously). */
function englishVoice(): SpeechSynthesisVoice | null {
  return window.speechSynthesis?.getVoices().find((v) => /^en[-_]/i.test(v.lang)) ?? null;
}

export function AudioClip({ text, revealed }: { text: string; revealed: boolean }) {
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [plays, setPlays] = useState(0);
  const [voice, setVoice] = useState<boolean>(() => (supported ? englishVoice() !== null : false));
  const utterance = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    if (!supported) return;
    const update = () => setVoice(englishVoice() !== null);
    window.speechSynthesis.addEventListener?.("voiceschanged", update);
    update();
    return () => {
      window.speechSynthesis.removeEventListener?.("voiceschanged", update);
      window.speechSynthesis.cancel();
    };
  }, [supported]);

  const stop = useCallback(() => {
    window.speechSynthesis?.cancel();
    setPlaying(false);
  }, []);

  const play = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    const v = englishVoice();
    if (v) u.voice = v;
    u.rate = rate;
    u.onend = () => setPlaying(false);
    u.onerror = () => setPlaying(false);
    utterance.current = u;
    setPlaying(true);
    setPlays((n) => n + 1);
    window.speechSynthesis.speak(u);
  }, [supported, text, rate]);

  return (
    <section aria-label="Audio del ejercicio">
      <h2 className="mb-1.5 font-mono text-[10.5px] uppercase tracking-wider text-faint">Audio</h2>
      <div className="rounded-xl border border-line bg-card px-4 py-3">
        {!supported || !voice ? (
          <p className="text-[12.5px] text-warn">
            {!supported
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
                onClick={() => setRate(value)}
                className={cn("rounded-md border px-2 py-0.5 font-mono text-[11px]", rate === value ? "border-accent bg-accent-soft text-accent-text" : "border-line text-dim hover:text-text")}
              >
                {label}
              </button>
            ))}
            <span className="ml-auto font-mono text-[11px] text-faint">{plays ? `${plays} reproducción(es)` : "aún sin escuchar"}</span>
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
