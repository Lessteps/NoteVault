// Práctica de inglés — audio: Listening (dictation) and Speaking.

import { Mic, Square, Volume2 } from "lucide-react";
import { useEffect, useState } from "react";
import { create } from "zustand";
import { api } from "../../lib/bridge";
import { copyText } from "../../lib/clipboard";
import { useAssistant } from "../../store/assistant";
import { GhostButton, input, Modal, PrimaryButton } from "../common/forms";
import { cn } from "../ui";

export const useEnglishAudio = create<{ tab: "listening" | "speaking" | null; show: (t: "listening" | "speaking" | null) => void }>((set) => ({
  tab: null, show: (tab) => set({ tab }),
}));

const PROMPTS = [
  "Describe your ideal programming workflow in 3-5 sentences.",
  "Explain what recursion is as if talking to a beginner.",
  "Talk about a technical problem you solved recently.",
  "Describe the differences between a stack and a queue.",
  "Explain why writing clean code is important.",
];

function speak(text: string) {
  const synth = window.speechSynthesis;
  if (synth && typeof SpeechSynthesisUtterance !== "undefined") {
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = 0.95;
    synth.speak(u);
  } else {
    void api.englishSpeak(text).catch(() => undefined);
  }
}

function Listening() {
  const [items, setItems] = useState<string[]>([]);
  const [i, setI] = useState(0);
  const [answer, setAnswer] = useState("");
  const [shown, setShown] = useState(false);
  useEffect(() => {
    api.englishSentences().then(setItems).catch(() => setItems([]));
  }, []);
  const s = items[i % Math.max(1, items.length)] ?? "";
  const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9' ]/g, "").split(/\s+/).filter(Boolean);
  const hit = shown ? norm(answer).filter((w) => norm(s).includes(w)).length : 0;
  return (
    <div className="space-y-3">
      <p className="text-[12.5px] text-dim">Escucha la oración y escribe lo que oíste. Luego revela para comparar.</p>
      <div className="flex items-center gap-2">
        <PrimaryButton onClick={() => speak(s)}><Volume2 size={14} /> Reproducir</PrimaryButton>
        <GhostButton onClick={() => window.speechSynthesis?.cancel()}><Square size={12} /> Detener</GhostButton>
        <span className="ml-auto font-mono text-[11.5px] text-faint">{items.length ? (i % items.length) + 1 : 0} / {items.length}</span>
      </div>
      <textarea rows={3} className={cn(input, "resize-none")} placeholder="Escribe lo que oíste…" value={answer} onChange={(e) => setAnswer(e.target.value)} />
      {shown && (
        <div className="rounded-lg border border-line bg-elevated px-3 py-2 text-[13px] text-text">
          {s}
          <div className="mt-1 text-[11px] text-faint">Palabras acertadas: {hit}/{norm(s).length}</div>
        </div>
      )}
      <div className="flex gap-2">
        <GhostButton onClick={() => setShown(true)}>Revelar</GhostButton>
        <GhostButton onClick={() => { setI(i + 1); setAnswer(""); setShown(false); }}>Siguiente ›</GhostButton>
      </div>
    </div>
  );
}

function Speaking() {
  const [i, setI] = useState(0);
  const [recording, setRecording] = useState(false);
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  const prompt = PROMPTS[i % PROMPTS.length]!;
  const evaluation = `Prompt de speaking:\n${prompt}\n\nLo que el usuario dijo:\n${text}\n\nPor favor evalúa: gramática, vocabulario, claridad y coherencia. Da una puntuación del 1 al 10 y sugerencias concretas de mejora.`;
  return (
    <div className="space-y-3">
      <p className="text-[12.5px] text-dim">Lee el prompt, presiona Grabar, habla en voz alta y luego transcribe lo que dijiste.</p>
      <div className="rounded-lg border border-line bg-elevated px-3 py-2.5 text-[13.5px] text-text">{prompt}</div>
      <div className="flex items-center gap-2">
        <GhostButton onClick={() => speak(prompt)}><Volume2 size={13} /> Escuchar</GhostButton>
        <button type="button" onClick={() => setRecording(!recording)}
          className={cn("flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium", recording ? "bg-warn text-black" : "bg-danger text-white")}>
          {recording ? <><Square size={12} /> Detener</> : <><Mic size={13} /> Grabar</>}
        </button>
        <span className={cn("text-[11.5px]", recording ? "text-danger" : "text-faint")}>{recording ? "● Grabando…" : "Listo"}</span>
        <span className="ml-auto font-mono text-[11.5px] text-faint">{(i % PROMPTS.length) + 1} / {PROMPTS.length}</span>
      </div>
      <textarea rows={4} className={cn(input, "resize-none")} placeholder="Escribe aquí lo que acabas de decir…" value={text} onChange={(e) => setText(e.target.value)} />
      <div className="flex flex-wrap gap-2">
        <GhostButton onClick={() => { setI(i + 1); setText(""); setMsg(""); }}>Siguiente prompt ›</GhostButton>
        <GhostButton onClick={async () => { if (!text.trim()) return setMsg("Escribe tu transcripción primero."); await copyText(evaluation); setMsg("✓ Copiado al portapapeles."); }}>Copiar para evaluación</GhostButton>
        <PrimaryButton onClick={() => { if (!text.trim()) return setMsg("Escribe tu transcripción primero."); useEnglishAudio.getState().show(null); void useAssistant.getState().ask(evaluation); }}>Evaluar con el asistente</PrimaryButton>
      </div>
      {msg && <p className="text-[11.5px] text-dim">{msg}</p>}
    </div>
  );
}

export function EnglishAudioDialog() {
  const tab = useEnglishAudio((s) => s.tab);
  const show = useEnglishAudio((s) => s.show);
  if (!tab) return null;
  return (
    <Modal title="Práctica de inglés — audio" onClose={() => { window.speechSynthesis?.cancel(); show(null); }} width={560}>
      <div className="flex gap-1.5">
        {(["listening", "speaking"] as const).map((t) => (
          <button key={t} type="button" onClick={() => show(t)}
            className={cn("rounded-lg px-3 py-1 text-[12.5px]", tab === t ? "bg-accent-soft text-accent-text" : "text-dim hover:bg-hover")}>
            {t === "listening" ? "🎧 Listening" : "🎙 Speaking"}
          </button>
        ))}
      </div>
      {tab === "listening" ? <Listening /> : <Speaking />}
    </Modal>
  );
}
