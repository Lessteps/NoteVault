// Mentor — Ejecución: la PRÁCTICA EXTRA de un día (la que el estudiante añade a mano a la «Práctica diaria»): su lista con casilla de hecho y quitar,
// y el botón «Más práctica». Va dentro de la tarjeta «Práctica diaria» del área (o suelta, si el área no tiene práctica propia) y en el Hoy general.

import { Trash2 } from "lucide-react";
import { useState } from "react";
import { api } from "../../lib/bridge";
import { EXTRA_PRACTICE_MINUTES, type ExtraPractice } from "../../lib/planPace";
import type { MentorPlan } from "../../lib/types";
import { useApp } from "../../store/app";
import { cn } from "../ui";
import { AddExtraPractice } from "./AddExtraPractice";
import { bumpPlanVersion } from "./extraKit";

const KIND_LABEL = { kata: "Kata", exercise: "Ejercicio", custom: "Práctica libre" } as const;

function PracticeRow({ planId, x, areaName }: { planId: string; x: ExtraPractice; areaName?: string | undefined }) {
  const toast = useApp((s) => s.toast);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>): Promise<void> => {
    setBusy(true);
    try {
      await fn();
      bumpPlanVersion();
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const done = !!x.done;
  return (
    <li className="flex items-center gap-3 rounded-xl border border-line bg-surface/50 px-3 py-2" data-testid="extra-practice-row" data-done={done}>
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        disabled={busy}
        aria-label={`${done ? "Quitar la marca de" : "Marcar como hecha"}: ${x.title}`}
        onClick={() => void run(() => api.mentorPlanExtraPracticeUpdate({ id: planId, practiceId: x.id, done: !done }))}
        className="grid h-5 w-5 flex-none place-items-center rounded-md border border-line text-[12px] font-bold text-white"
        style={done ? { background: "var(--nv-accent)", borderColor: "var(--nv-accent)" } : undefined}
        data-testid="extra-practice-check"
      >
        {done ? "✓" : null}
      </button>
      <span className={cn("min-w-0 flex-1 text-[15px] leading-snug", done && "text-faint line-through decoration-faint/60")}>
        {x.title}
        <span className="block text-[13.5px] font-normal text-dim">
          Extra · {KIND_LABEL[x.kind]} · {x.minutes ?? EXTRA_PRACTICE_MINUTES} min{areaName ? ` · ${areaName}` : ""}{x.note ? ` · ${x.note}` : ""}
        </span>
      </span>
      <button type="button" disabled={busy} aria-label={`Quitar la práctica extra ${x.title}`} title="Quitar esta práctica" onClick={() => void run(() => api.mentorPlanExtraPracticeRemove({ id: planId, practiceId: x.id }))} className="grid h-8 w-8 flex-none place-items-center rounded-lg text-dim hover:bg-hover hover:text-danger" data-testid="extra-practice-remove">
        <Trash2 size={15} aria-hidden />
      </button>
    </li>
  );
}

/**
 * La práctica extra de `date`: la de un área (`subplanId`) o, con `all`, la de todo el día. `topics` = los temas de hoy a elegir para un
 * «ejercicio de un tema». `standalone` pinta además la tarjeta «Práctica diaria» (cuando el área no tiene práctica propia).
 */
export function ExtraPracticeSection({ plan, date, subplanId, all, topics, standalone, onChanged }: {
  plan: MentorPlan;
  date: string;
  subplanId?: string;
  all?: boolean;
  topics?: ReadonlyArray<{ folder: string; title: string }>;
  standalone?: boolean;
  /** el plan nuevo (además de subir `planVersion`) */
  onChanged?: (p: MentorPlan) => void;
}) {
  const list = (plan.extraPractice ?? []).filter((x) => x.date === date && (all || (subplanId ? x.area === subplanId : !x.area)));
  const nameOf = (id?: string): string | undefined => (id ? plan.subplans.find((s) => s.id === id)?.area : undefined);
  const body = (
    <>
      {list.length > 0 && (
        <ul className="space-y-2" aria-label="Práctica extra de hoy" data-testid="extra-practice-list">
          {list.map((x) => <PracticeRow key={x.id} planId={plan.id} x={x} areaName={all ? nameOf(x.area) : undefined} />)}
        </ul>
      )}
      <div className={cn(list.length > 0 && "mt-2")}>
        <AddExtraPractice
          planId={plan.id}
          date={date}
          {...(subplanId ? { area: subplanId } : {})}
          {...(topics ? { topics } : {})}
          minDate={plan.start}
          maxDate={plan.end}
          label="Más práctica"
          onChanged={(p) => {
            onChanged?.(p);
            bumpPlanVersion();
          }}
        />
      </div>
    </>
  );
  if (!standalone) return <div data-testid="extra-practice" className="mt-3 border-t border-line pt-3">{body}</div>;
  return (
    <div className="rounded-2xl border border-line bg-card p-4" data-testid="extra-practice">
      <h3 className="mb-3 text-[16px] font-bold">Práctica diaria</h3>
      {body}
    </div>
  );
}
