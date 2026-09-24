// Fast-calculation sprint: one item at a time, checked by Python (the
// answers never reach the page before they are given).

import { Play } from "lucide-react";
import { useRef, useState } from "react";
import { api } from "../../lib/bridge";
import type { PracticeGraded } from "../../lib/types";
import { useApp } from "../../store/app";
import { cn } from "../ui";

export function DrillPanel({ rel, drill, difficulty, onStart, onFinish, seconds }: {
  rel: string;
  drill: { kind: string; label: string; items: number };
  difficulty: number;
  onStart: () => void;
  onFinish: (r: PracticeGraded) => void;
  seconds: () => number;
}) {
  const [session, setSession] = useState<{ id: string; prompts: string[] } | null>(null);
  const [index, setIndex] = useState(0);
  const [given, setGiven] = useState("");
  const [last, setLast] = useState<{ ok: boolean; answer: string } | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const started = useRef(0);
  const busy = useRef(false);

  const start = async () => {
    try {
      const s = await api.practiceDrillStart(rel);
      setSession({ id: s.session, prompts: s.prompts });
      setIndex(0);
      setGiven("");
      setLast(null);
      setDone(null);
      started.current = performance.now();
      onStart();
    } catch (e) {
      useApp.getState().toast("error", (e as Error).message);
    }
  };

  const finish = async (id: string) => {
    try {
      const r = await api.practiceDrillFinish(id, seconds());
      setDone(r.result.feedback);
      setSession(null);
      onFinish(r);
    } catch (e) {
      useApp.getState().toast("error", (e as Error).message);
    }
  };

  const answer = async () => {
    if (!session || !given.trim() || busy.current) return;
    busy.current = true;
    try {
      const secs = (performance.now() - started.current) / 1000;
      const r = await api.practiceDrillCheck(session.id, index, given, secs);
      setLast(r);
      setGiven("");
      started.current = performance.now();
      if (index + 1 >= session.prompts.length) await finish(session.id);
      else setIndex(index + 1);
    } catch (e) {
      useApp.getState().toast("error", (e as Error).message);
    } finally {
      busy.current = false;
    }
  };

  if (!session) {
    return (
      <section className="flex flex-col items-start gap-3 rounded-xl border border-line bg-card px-5 py-4">
        <p className="text-[14px] text-text">
          <b>{drill.items} ejercicios de {drill.label}</b> (dificultad {difficulty}).
        </p>
        <p className="text-[13px] text-dim">
          Escribe cada resultado y pulsa Enter. Se comprueba al instante; al final se guarda tu precisión y tu velocidad.
        </p>
        {done && <p className="text-[13px] text-text">{done}</p>}
        <button type="button" onClick={() => void start()}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-accent-strong">
          <Play size={14} /> {done ? "Repetir el sprint" : "Empezar"}
        </button>
      </section>
    );
  }

  return (
    <section className="flex flex-col items-center gap-4 rounded-xl border border-line bg-card px-5 py-8">
      <span className="font-mono text-[12px] text-faint">{index + 1} / {session.prompts.length}</span>
      <span className="font-mono text-[28px] font-semibold text-text">{session.prompts[index]}</span>
      <input
        autoFocus
        aria-label="Resultado"
        value={given}
        onChange={(e) => setGiven(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void answer();
        }}
        className="w-60 rounded-lg border border-line bg-panel px-3 py-2 text-center font-mono text-[18px] text-text outline-none focus:border-accent"
      />
      <span className={cn("h-5 text-[13px]", last?.ok ? "text-mint" : "text-danger")}>
        {last && (last.ok ? "✓ Correcto" : `✗ Era ${last.answer}`)}
      </span>
      <button type="button" onClick={() => void finish(session.id)}
        className="text-[12px] text-faint hover:text-text">Terminar ahora</button>
    </section>
  );
}
