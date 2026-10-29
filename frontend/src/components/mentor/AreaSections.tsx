// Mentor — un proyecto desglosado por ÁREA: qué hay que hacer, cómo hacerlo y el RESULTADO REAL que debe poder enseñarse.

import { CheckCircle2 } from "lucide-react";
import type { ProjectSection } from "../../lib/planAreaPractice";
import { cn } from "../ui";
import { focusColour } from "./agendaKit";

/** Un proyecto desglosado por área: qué hacer, cómo y el resultado real. */
export function AreaSections({ sections, testid }: { sections: ProjectSection[]; testid: string }) {
  if (!sections.length) return null;
  return (
    <ul className={cn("mt-3 grid items-start gap-3 [&>*]:min-w-0", sections.length > 1 && "@4xl:grid-cols-2")} aria-label="Desglose por área" data-testid={testid}>
      {sections.map((s) => {
        const colour = focusColour(s.areaId);
        return (
          <li key={s.areaId} className="rounded-xl border border-line bg-surface p-3.5" style={{ borderLeft: `4px solid ${colour}` }} data-testid="project-area" data-area={s.areaId}>
            <h4 className="text-[15.5px] font-bold">{s.area}</h4>
            <p className="mt-1 text-[11.5px] font-semibold uppercase tracking-wide text-faint">Qué hay que hacer</p>
            <p className="text-[14.5px]">{s.what}</p>
            <p className="mt-2 text-[11.5px] font-semibold uppercase tracking-wide text-faint">Cómo hacerlo</p>
            <ol className="list-decimal space-y-0.5 pl-5 text-[14.5px] text-dim">
              {s.how.map((h) => <li key={h}>{h}</li>)}
            </ol>
            <div className="mt-2.5 flex items-start gap-2 rounded-lg border border-mint/50 bg-mint-soft px-2.5 py-2 text-[14px]" data-testid="project-result">
              <CheckCircle2 size={16} aria-hidden className="mt-0.5 flex-none text-mint" />
              <span><span className="font-semibold text-mint">Resultado real:</span> {s.result}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
