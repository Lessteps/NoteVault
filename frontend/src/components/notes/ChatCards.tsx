// Interactive cards inside the chat, next to the file-action card:
//  · AskCard: a question from the assistant with buttons (it asks instead of guessing).
//  · SkillsCard: the competency checklist of a topic — the recommended ones ticked, every other
//    competency offered below with how it would probably be practised — that is applied to the
//    topic's matrix when accepted.
// What the user decides is remembered (lib/cardState): a resolved card comes back marked and
// cannot be answered again.

import { Check, ClipboardList, HelpCircle, Loader2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "../../lib/bridge";
import type { ParsedAsk, ParsedSkills } from "../../lib/assistantModes";
import { cardKey, getCardState, setCardState } from "../../lib/cardState";
import { useApp } from "../../store/app";
import { useAssistant } from "../../store/assistant";
import { cn } from "../ui";

export function AskCard({ ask }: { ask: ParsedAsk }) {
  const key = useMemo(() => cardKey(ask), [ask]);
  const [answered, setAnswered] = useState<string | null>(() => getCardState(key));
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const busy = useAssistant((s) => s.busy);

  const send = (values: string[]) => {
    if (!values.length || answered !== null) return;
    const text = values.join(", ");
    setCardState(key, text);
    setAnswered(text);
    void useAssistant.getState().ask(text);
  };

  return (
    <div className="mt-2 rounded-xl border border-accent/40 bg-accent-soft/40 p-3">
      <div className="flex items-start gap-2">
        <HelpCircle size={14} className="mt-0.5 flex-none text-accent-text" />
        <span className="text-[12.5px] font-semibold text-text">{ask.question}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {ask.options.map((o) => {
          const chosen = answered !== null ? answered.split(", ").includes(o.value) : picked.has(o.value);
          return (
            <button
              key={o.value}
              type="button"
              disabled={answered !== null || busy}
              onClick={() => {
                if (ask.multiple) {
                  setPicked((p) => {
                    const next = new Set(p);
                    if (next.has(o.value)) next.delete(o.value);
                    else next.add(o.value);
                    return next;
                  });
                } else send([o.value]);
              }}
              className={cn(
                "rounded-lg border px-2.5 py-1 text-[12px] transition-colors disabled:cursor-default",
                chosen ? "border-accent bg-accent text-white" : "border-line bg-panel text-text hover:border-accent",
                answered !== null && !chosen && "opacity-40",
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {ask.multiple && answered === null && (
        <button
          type="button"
          disabled={!picked.size || busy}
          onClick={() => send([...picked])}
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1 text-[12px] font-semibold text-white hover:bg-accent-strong disabled:opacity-50"
        >
          <Check size={12} /> Enviar
        </button>
      )}
      {answered !== null && <p className="mt-1.5 text-[11px] text-faint">Respondido: {answered}</p>}
    </div>
  );
}

const LEVEL_NAMES = ["Fácil", "Media", "Difícil"];

export function SkillsCard({ data }: { data: ParsedSkills }) {
  const key = useMemo(() => cardKey(data), [data]);
  const stored = getCardState(key);
  const [state, setState] = useState<"idle" | "applying" | "applied" | "dismissed">(
    stored === "applied" ? "applied" : stored === "dismissed" ? "dismissed" : "idle",
  );
  const [error, setError] = useState("");
  const [on, setOn] = useState<Record<string, boolean>>(() => Object.fromEntries(data.skills.map((s) => [s.skill, s.recommended])));
  const [levels, setLevels] = useState<Record<string, [number, number, number]>>(() => Object.fromEntries(data.skills.map((s) => [s.skill, [...s.levels] as [number, number, number]])));
  const locked = state !== "idle";
  const recommended = data.skills.filter((s) => s.recommended);
  const others = data.skills.filter((s) => !s.recommended);
  const chosen = data.skills.filter((s) => on[s.skill] && levels[s.skill]!.some((n) => n > 0));

  const apply = async () => {
    if (!chosen.length) {
      setError("Marca al menos una competencia con algún ejercicio.");
      return;
    }
    setState("applying");
    setError("");
    try {
      await api.assistantActionApply({
        action: "set_practice_plan",
        args: {
          topic: data.topic,
          topic_type: data.topicType,
          force: true,
          summary: data.summary ?? "",
          skills: chosen.map((s) => ({
            skill: s.skill,
            difficulties: { 1: levels[s.skill]![0], 2: levels[s.skill]![1], 3: levels[s.skill]![2] },
            why: s.why,
          })),
        },
      });
      setCardState(key, "applied");
      setState("applied");
      const app = useApp.getState();
      app.refreshTree();
      app.toast("info", `Matriz actualizada: ${chosen.length} competencia(s) en «${data.title}».`);
    } catch (e) {
      setError((e as Error).message);
      setState("idle");
    }
  };

  const row = (s: ParsedSkills["skills"][number]) => (
    <li key={s.skill} className={cn("rounded-lg border p-2", on[s.skill] ? "border-accent/50 bg-accent-soft/30" : "border-line bg-panel/60")}>
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          disabled={locked}
          checked={!!on[s.skill]}
          onChange={(e) => setOn((o) => ({ ...o, [s.skill]: e.target.checked }))}
        />
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-text">{s.label}</span>
        <span className="flex flex-none items-center gap-1">
          {LEVEL_NAMES.map((name, i) => (
            <input
              key={name}
              type="number"
              min={0}
              max={12}
              title={`${name}: ejercicios`}
              disabled={locked || !on[s.skill]}
              value={levels[s.skill]![i]}
              onChange={(e) =>
                setLevels((l) => {
                  const next = [...l[s.skill]!] as [number, number, number];
                  next[i] = Math.max(0, Math.min(12, Number(e.target.value) || 0));
                  return { ...l, [s.skill]: next };
                })
              }
              className="h-6 w-9 rounded border border-line bg-surface text-center font-mono text-[11px] text-text disabled:opacity-40"
            />
          ))}
        </span>
      </label>
      {s.why && <p className="mt-1 pl-6 text-[11px] leading-snug text-dim">{s.why}</p>}
      {s.how && <p className="mt-0.5 pl-6 text-[11px] leading-snug text-faint">Cómo se practicaría: {s.how}</p>}
    </li>
  );

  return (
    <div className="mt-2 rounded-xl border border-accent/40 bg-accent-soft/40 p-3">
      <div className="flex items-center gap-2">
        <ClipboardList size={14} className="flex-none text-accent-text" />
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-text">Competencias de «{data.title}»</span>
        {state === "applied" && <span className="flex-none text-[11px] font-semibold text-mint">Aplicado</span>}
        {state === "dismissed" && <span className="flex-none text-[11px] text-faint">Descartado</span>}
      </div>
      {data.summary && <p className="mt-1 text-[11.5px] leading-snug text-dim">{data.summary}</p>}
      <p className="mt-1.5 font-mono text-[10px] uppercase tracking-wider text-faint">
        Recomendadas · ejercicios {LEVEL_NAMES.join(" / ")}
      </p>
      <ul className="mt-1 flex flex-col gap-1.5">{recommended.map(row)}</ul>
      {others.length > 0 && (
        <>
          <p className="mt-2.5 font-mono text-[10px] uppercase tracking-wider text-faint">Otras competencias (opcionales)</p>
          <ul className="mt-1 flex flex-col gap-1.5">{others.map(row)}</ul>
        </>
      )}
      {error && <p className="mt-1.5 text-[11.5px] text-danger">{error}</p>}
      {state === "idle" || state === "applying" ? (
        <div className="mt-2.5 flex items-center gap-2">
          <button
            type="button"
            disabled={state === "applying"}
            onClick={() => void apply()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1 text-[12px] font-semibold text-white hover:bg-accent-strong disabled:opacity-50"
          >
            {state === "applying" ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Aplicar ({chosen.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setCardState(key, "dismissed");
              setState("dismissed");
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-[12px] text-dim hover:text-text"
          >
            <X size={12} /> Descartar
          </button>
        </div>
      ) : null}
    </div>
  );
}
