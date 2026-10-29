// Mentor — «Verificar metodología»: junto a «Agregar nuevos temas». Mira el alcance donde estás (todas las áreas, un área o una asignatura) y dice
// qué falta frente al currículo de referencia —con HTML, CSS y los métodos de un lenguaje contados pieza a pieza— y qué temas habría que partir en
// subtemas. Sin IA local: (1) «Crear con Antigravity» escribe la tarea para el agente externo; (2) «Copiar prompt de revisión» deja el texto listo
// para pegar en cualquier IA. La app no crea temas por sí misma.

import { ClipboardCheck, ClipboardCopy, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { copyText } from "../../lib/clipboard";
import { curriculumIdsOfScope, reviewPrompt, type MethodologyScope, type ScopeTopic } from "../../lib/methodologyScope";
import { useApp } from "../../store/app";
import { useCoverage } from "../../store/curriculum";
import { Chip, GhostButton, Modal } from "../common/forms";
import { cn } from "../ui";
import { CoverageRing, LEVEL_COLOUR, LEVEL_LABEL } from "../study/CurriculumBadges";
import { CurriculumGaps } from "../study/CurriculumGaps";

export function MethodologyCheckButton({ scope, topics, label = "Verificar metodología", className, testid = "methodology-check" }: { scope: MethodologyScope; topics: readonly ScopeTopic[]; label?: string; className?: string; testid?: string }) {
  const toast = useApp((s) => s.toast);
  const { areas, loaded, error } = useCoverage();
  const [open, setOpen] = useState(false);
  const [gapsId, setGapsId] = useState<string | null>(null);

  const ids = useMemo(() => curriculumIdsOfScope(scope, areas.map((a) => a.areaId)), [scope, areas]);
  const mine = areas.filter((a) => ids.includes(a.areaId));
  const missing = mine.reduce((n, a) => n + a.missing, 0);
  const folders = mine.map((a) => `${a.space}/${a.areaFolder}`);

  const copyPrompt = async (): Promise<void> => {
    const ok = await copyText(reviewPrompt(scope, topics, folders));
    toast(ok ? "info" : "error", ok ? "Prompt copiado: pégalo en tu IA." : "No se pudo copiar el prompt.");
  };
  const close = (): void => {
    setOpen(false);
    setGapsId(null);
  };

  return (
    <>
      <GhostButton large="md" className={cn(className)} onClick={() => setOpen(true)} aria-expanded={open} data-testid={testid}>
        <ClipboardCheck size={15} aria-hidden /> {label}
      </GhostButton>
      {open && (
        <Modal title={gapsId ? "Temas por crear" : `Verificar metodología · ${scope.label}`} onClose={close} width={gapsId ? 980 : 720}>
          {gapsId ? (
            <div className="-mx-5 -my-4 flex max-h-[70vh] min-h-0 flex-col">
              <CurriculumGaps areaId={gapsId} onBack={() => setGapsId(null)} />
            </div>
          ) : (
            <>
              <p className="text-[14px] text-dim" data-testid="methodology-intro">
                Compara lo que tienes con lo que esta materia necesita. En HTML, CSS y los métodos de un lenguaje se aprende <strong>pieza a pieza</strong>: una nota por elemento, propiedad o función, y los temas grandes se parten en subtemas en orden. Aquí ves qué falta y cómo crearlo, aunque no tengas una IA local.
              </p>
              {error && <p role="alert" className="text-[14px] text-danger">{error}</p>}
              {!loaded && !error && <p role="status" className="text-[14px] text-dim">Leyendo el currículo…</p>}
              {loaded && mine.length === 0 && (
                <p className="rounded-xl border border-dashed border-line p-3 text-[14px] text-dim" data-testid="methodology-no-reference">
                  Para «{scope.label}» todavía no hay un currículo de referencia con el que comparar. Usa «Copiar prompt de revisión» y una IA revisa tus temas con las mismas reglas.
                </p>
              )}
              <ul className="space-y-2" data-testid="methodology-areas">
                {mine.map((a) => (
                  <li key={a.areaId} className="flex flex-wrap items-center gap-3 rounded-xl border border-line px-3 py-2.5" data-testid="methodology-area" data-area={a.areaId}>
                    <CoverageRing pct={a.pct} level={a.level} size={48} />
                    <span className="min-w-0 flex-1 basis-48">
                      <span className="flex flex-wrap items-center gap-2 text-[14.5px] font-semibold text-text">
                        {a.title}
                        <Chip colour={LEVEL_COLOUR[a.level]}>{LEVEL_LABEL[a.level]}</Chip>
                      </span>
                      <span className="block text-[13px] text-dim">{a.covered} cubiertos · {a.partial} parciales · {a.missing} faltan · {a.total} temas de referencia (cada elemento o propiedad cuenta)</span>
                    </span>
                    <GhostButton large="md" onClick={() => setGapsId(a.areaId)} disabled={a.missing === 0 && a.partial === 0} data-testid={`methodology-open-${a.areaId}`}>
                      {a.missing === 0 && a.partial === 0 ? "Completa" : "Ver y crear lo que falta"} <ChevronRight size={14} aria-hidden />
                    </GhostButton>
                  </li>
                ))}
              </ul>
              {mine.length > 0 && <p className="text-[13.5px] text-dim" data-testid="methodology-total">En total faltan {missing} {missing === 1 ? "tema" : "temas"} de referencia en este alcance.</p>}
              <div className="flex flex-wrap gap-2 border-t border-line pt-3">
                <GhostButton large="md" onClick={() => void copyPrompt()} data-testid="methodology-copy-prompt">
                  <ClipboardCopy size={15} aria-hidden /> Copiar prompt de revisión
                </GhostButton>
              </div>
              <p className="text-[12.5px] text-faint">El prompt lleva tus {topics.length} {topics.length === 1 ? "tema" : "temas"} de «{scope.label}» y las reglas de metodología; la IA te dice qué partir y qué añadir.</p>
            </>
          )}
        </Modal>
      )}
    </>
  );
}
