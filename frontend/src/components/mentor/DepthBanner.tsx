// Mentor — PROFUNDIDAD: avisa de los capítulos que son un solo tema grande (sin las piezas mínimas) y da, ya escrita, la instrucción para que otra IA los
// desglose. La app mide y dice qué pedir; la persona solo copia y pega. Solo lee el plan; al pulsar escribe el archivo de la tarea en la vault.

import { Layers } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../lib/bridge";
import { copyText } from "../../lib/clipboard";
import { useApp } from "../../store/app";
import { useMentor } from "../../store/mentor";
import { GhostButton } from "../common/forms";

type Gap = Awaited<ReturnType<typeof api.mentorPlanDepth>>["gaps"][number];

export function DepthBanner({ planId, subplanId }: { planId: string; subplanId?: string }) {
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [min, setMin] = useState(3);
  const [busy, setBusy] = useState("");
  const version = useMentor((s) => s.planVersion);

  useEffect(() => {
    let live = true;
    void api
      .mentorPlanDepth({ planId })
      .then((r) => {
        if (!live) return;
        setGaps(Array.isArray(r?.gaps) ? r.gaps : []);
        setMin(r?.standard?.minPieces ?? 3);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [planId, version]);

  // dentro de un área solo sus asignaturas (los fundamentos «Bases» tienen su propia pestaña); en el plan entero, todo
  const shown = gaps.filter((g) => (subplanId ? g.subplanId === subplanId && g.groupKind !== "bases" : true));
  if (!shown.length) return null;

  const ask = async (g: Gap): Promise<void> => {
    const key = `${g.subplanId}:${g.groupId}`;
    setBusy(key);
    try {
      const r = await api.mentorPlanDepthHandoff({ planId, subplanId: g.subplanId, groupId: g.groupId });
      const ok = await copyText(r.shortPrompt);
      useApp.getState().toast("info", ok ? `Instrucción copiada (${r.chapters} capítulos). Pégala en Antigravity. El archivo está en ${r.rel}.` : `Archivo escrito en ${r.rel}. Pega esta frase en Antigravity: ${r.shortPrompt}`);
    } catch (e) {
      useApp.getState().toast("error", (e as Error).message);
    } finally {
      setBusy("");
    }
  };

  return (
    <section role="region" aria-label="Profundidad del temario" data-testid="depth-banner" className="space-y-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-text">
      <div className="flex items-start gap-3">
        <Layers className="mt-0.5 flex-none text-amber-500" size={20} aria-hidden />
        <div className="min-w-0 flex-1 space-y-2">
          <h4 className="text-[15px] font-bold text-amber-400">Temas demasiado grandes: faltan piezas</h4>
          <p className="text-[13px] text-dim">
            Un capítulo debe tener al menos {min} piezas (una por concepto). Estos son un solo tema grande: no se pueden estudiar ni practicar con detalle. Pulsa el botón y pega la instrucción en Antigravity: crea las piezas y entran solas al plan.
          </p>
          <ul className="space-y-2">
            {shown.map((g) => (
              <li key={`${g.subplanId}:${g.groupId}`} className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-card/60 p-3" data-testid="depth-gap" data-group={g.groupId}>
                <span className="min-w-0 flex-1 basis-56 text-[13.5px]">
                  <strong className="text-text">{g.area} · {g.groupTitle}</strong>
                  <span className="block text-dim">{g.coarseCount} de {g.chapters} capítulos sin desglosar · faltan al menos {g.missingPieces} piezas</span>
                  {g.sample.length > 0 && <span className="block truncate text-faint">p. ej. {g.sample.join(" · ")}</span>}
                </span>
                <GhostButton large="md" disabled={busy === `${g.subplanId}:${g.groupId}`} onClick={() => void ask(g)} data-testid="depth-copy">
                  Copiar instrucción para Antigravity
                </GhostButton>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
