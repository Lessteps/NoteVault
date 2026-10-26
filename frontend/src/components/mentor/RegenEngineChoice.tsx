// Mentor — «¿Con qué regenerar?»: el selector de motor de los diálogos de confirmación (un tema y lote). Tres opciones: la IA de la app, Claude (API key o
// conexión) y un agente externo (Antigravity / Claude Code) por tarea en la vault. Lo disponible depende de los ajustes de IA: con la IA en «puente»
// solo queda el agente externo. La elección se recuerda; no se guarda ninguna clave nueva (si falta, se manda a los ajustes de IA).

import { Bot, Cpu, Settings2, Terminal } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../lib/bridge";
import type { RegenEngineId, RegenEnginesView } from "../../lib/types";
import { useAssistant } from "../../store/assistant";
import { useRegenEngine } from "../../store/regenEngine";
import { GhostButton } from "../common/forms";
import { cn } from "../ui";

const ICON: Record<RegenEngineId, typeof Cpu> = { app: Cpu, claude: Bot, handoff: Terminal };

/** Los motores disponibles ahora mismo; `null` mientras carga o si no se pudo saber (se asume la IA de la app). */
export function useRegenEngines(): RegenEnginesView | null {
  const [view, setView] = useState<RegenEnginesView | null>(null);
  const resolve = useRegenEngine((s) => s.resolve);
  useEffect(() => {
    let alive = true;
    const fn = api.studyRegenEngines;
    Promise.resolve(typeof fn === "function" ? fn() : null)
      .then((v) => {
        if (!alive) return;
        const ok = v && Array.isArray(v.engines) ? v : null;
        setView(ok);
        resolve(ok);
      })
      .catch(() => alive && resolve(null));
    return () => {
      alive = false;
    };
  }, [resolve]);
  return view;
}

export function RegenEngineChoice({ aiCalls = 0 }: { /** llamadas a la IA aproximadas que costaría hacerlo con la app / Claude */ aiCalls?: number }) {
  const view = useRegenEngines();
  const effective = useRegenEngine((s) => s.effective);
  const setChoice = useRegenEngine((s) => s.setChoice);
  const info = (id: RegenEngineId) => view?.engines.find((e) => e.id === id);
  const using = view ? `${view.providerLabel}${view.model ? ` · ${view.model}` : ""}` : "";

  const ids: RegenEngineId[] = ["app", "claude", "handoff"];
  return (
    <fieldset className="space-y-2" data-testid="engine-choice">
      <legend className="mb-1 text-[13.5px] font-semibold">¿Con qué lo regeneramos?</legend>
      {ids.map((id) => {
        const e = info(id);
        const off = !!e && !e.available;
        const Icon = ICON[id];
        const label = e?.label ?? { app: "Con la app", claude: "Con Claude (API key)", handoff: "Con Antigravity / Claude Code" }[id];
        const checked = effective === id && !off;
        return (
          <label
            key={id}
            className={cn("flex cursor-pointer items-start gap-2.5 rounded-xl border p-2.5 text-[13.5px]", checked ? "border-accent bg-hover" : "border-line", off && "cursor-not-allowed opacity-60")}
            data-testid={`engine-${id}-row`}
          >
            <input type="radio" name="regen-engine" className="mt-1 accent-[var(--nv-accent)]" checked={checked} disabled={off} onChange={() => setChoice(id)} data-testid={`engine-${id}`} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 font-medium"><Icon size={14} aria-hidden /> {label}</span>
              <span className="mt-0.5 block text-dim">{e?.detail ?? ""}</span>
              {off && <span className="mt-0.5 block text-warn" data-testid={`engine-${id}-reason`}>{e!.reason}</span>}
            </span>
          </label>
        );
      })}

      {effective !== "handoff" && (
        <p className="text-[13px] text-dim" data-testid="engine-cost">
          {using ? <>Se usará <strong>{using}</strong>. </> : null}
          {aiCalls > 0 ? <>Llamadas a la IA aproximadas: <strong>{aiCalls}</strong> (cada una puede tardar un minuto y cuenta contra tu cuota o tus tokens).</> : <>No hace llamadas a la IA.</>}
        </p>
      )}
      {effective === "handoff" && (
        <p className="text-[13px] text-dim" data-testid="engine-cost">
          La app no llama a la IA: consume el uso de tu agente ({aiCalls > 0 ? `unas ${aiCalls} generaciones` : "sin generaciones"}). La app solo respalda, escribe la tarea y valida.
        </p>
      )}
      {view && (info("app")?.available === false || info("claude")?.available === false) && (
        <GhostButton onClick={() => useAssistant.getState().setSettings(true)} data-testid="engine-settings">
          <Settings2 size={14} aria-hidden /> Abrir los ajustes de IA
        </GhostButton>
      )}
    </fieldset>
  );
}
