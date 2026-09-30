// El detalle de un ejercicio de la Biblioteca.
//
// Vive en su propio archivo porque lo consumen dos cosas —el panel derecho y
// el botón grande— y porque crece: instrucción, rutina existente, avisos.

import { muscleName } from "../../lib/muscles";
import { getInstructions, type LibraryEntry } from "../../lib/exerciseLibrary";
import { PrimaryButton } from "../common/forms";
import type { Exercise } from "../../lib/types";

/** Los días de la rutina en los que ya está un ejercicio con ese nombre. */
export function daysAlreadyInRoutine(name: string, routine: Exercise[]): string[] {
  const seen: string[] = [];
  for (const e of routine) {
    if (e.name.toLowerCase() !== name.toLowerCase()) continue;
    if (!seen.includes(e.day)) seen.push(e.day);
  }
  return seen;
}

export function Detail({
  entry,
  routine,
  dayName,
  busy,
  onAdd,
}: {
  entry: LibraryEntry;
  /** La rutina actual, para avisar de lo que ya está dentro. */
  routine: Exercise[];
  /** El nombre legible del día al que se añadirá. */
  dayName: string;
  busy?: boolean;
  onAdd: (slug: string) => void;
}) {
  const ins = getInstructions(entry.slug);
  const steps = ins?.steps_es.length ? ins.steps_es : (ins?.steps_en ?? []);
  const already = daysAlreadyInRoutine(entry.name, routine);

  return (
    <div className="flex flex-col gap-2.5 p-3">
      <div className="text-[13px] font-semibold text-text">{entry.name}</div>

      <PrimaryButton className="w-full justify-center" onClick={() => onAdd(entry.slug)}>
        {busy ? "Añadiendo…" : `Añadir a hoy · ${dayName}`}
      </PrimaryButton>

      {already.length > 0 && (
        <div
          data-library-in-routine
          className="rounded-xl px-2.5 py-1.5 text-[11.5px]"
          style={{ background: "var(--nv-warn-soft)", color: "var(--nv-warn)" }}
        >
          Ya en tu rutina: {already.join(", ")}.
        </div>
      )}

      {/* El arte es blanco monocromo: fondo oscuro o no se ve. */}
      <div className="flex gap-2">
        {entry.frames.map(
          (src, i) =>
            src && (
              <img
                key={i}
                src={src}
                alt={`${entry.name} frame ${i + 1}`}
                loading="lazy"
                className="h-20 w-20 rounded-lg border border-line object-contain"
                style={{ background: "#141414" }}
              />
            ),
        )}
      </div>

      <dl className="space-y-1 text-[12px] text-dim">
        <div className="flex gap-2">
          <dt className="w-24 flex-none text-faint">Equipo</dt>
          <dd>{entry.equipment}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-24 flex-none text-faint">Tipo</dt>
          <dd>{entry.exerciseType}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-24 flex-none text-faint">Principal</dt>
          <dd>
            {entry.guidePrimary}
            {entry.localPrimary.length
              ? ` → ${entry.localPrimary.map(muscleName).join(", ")}`
              : ""}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-24 flex-none text-faint">Secundarios</dt>
          <dd>{entry.guideSecondary.join(", ") || "—"}</dd>
        </div>
      </dl>

      {steps.length > 0 ? (
        <div>
          <div className="mb-1 text-[12px] font-semibold text-text">Cómo hacerlo</div>
          <ol className="list-decimal space-y-1 pl-5 text-[12px] leading-relaxed text-dim">
            {steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </div>
      ) : (
        <p className="text-[11.5px] text-faint">Sin instrucciones todavía para este ejercicio.</p>
      )}

      <p className="mt-auto pt-1 text-[11px] text-faint">
        Ilustración: Bryl Lim / Everkinetic (CC BY-SA 4.0) · offline.
      </p>
    </div>
  );
}