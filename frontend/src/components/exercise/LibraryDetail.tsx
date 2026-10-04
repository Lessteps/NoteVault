// El detalle de un ejercicio de la Biblioteca.
//
// Vive en su propio archivo porque lo consumen dos cosas —el panel derecho y
// el botón grande— y porque crece: instrucción, rutina existente, avisos.

import { muscleName } from "../../lib/muscles";
import { Trash2 } from "lucide-react";
import { GhostButton } from "../common/forms";
import { getInstructions, type LibraryEntry } from "../../lib/exerciseLibrary";
import type { LibraryUserEntry } from "../../lib/libraryTypes";
import { PrimaryButton } from "../common/forms";
import type { Exercise } from "../../lib/types";

/**
 * Los días de la rutina en los que ya usas esta entrada.
 *
 * Se decide por `source`, no por el nombre: dos ejercicios con el mismo nombre
 * pero de entradas distintas **no** son el mismo, y al revés, uno tuyo con
 * otro nombre sí lo es.
 */
export function daysAlreadyInRoutine(
  entry: { slug: string },
  routine: Exercise[],
): string[] {
  const seen: string[] = [];
  for (const e of routine) {
    if (e.source !== entry.slug) continue;
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
  userEntries = [],
  onRemove,
  videoUrl,
  onPickVideo,
  onRemoveVideo,
}: {
  entry: LibraryEntry;
  /** La rutina actual, para avisar de lo que ya está dentro. */
  routine: Exercise[];
  /** El nombre legible del día al que se añadirá. */
  dayName: string;
  busy?: boolean;
  onAdd: (slug: string) => void;
  /** Tus entradas: sin ellas, un ejercicio tuyo se vería «sin instrucciones». */
  userEntries?: LibraryUserEntry[];
  /** Quita tu entrada de la biblioteca. Es el «deshacer» de una edición. */
  onRemove?: () => void;
  /** URL servida del video propio, si lo tiene y se resolvió. */
  videoUrl?: string;
  /** Elegir video para la entrada propia. */
  onPickVideo?: () => void;
  /** Quitar el video de la entrada propia. */
  onRemoveVideo?: () => void;
}) {
  // Hay algo tuyo que deshacer si **este** slug está en tu fichero. No se mira
  // `entry.own`: esa marca solo la llevan las entradas con slug propio, y aquí
  // también cuenta editar un ejercicio del catálogo, que se guarda con su slug.
  const isOwn = userEntries.some((u) => u.slug === entry.slug);
  const ins = getInstructions(entry.slug, userEntries);
  const steps = ins?.steps_es.length ? ins.steps_es : (ins?.steps_en ?? []);
  // «Ya en tu rutina» se decide por el origen, no por el nombre: un ejercicio
  // tuyo con otro nombre sigue siendo el mismo.
  const already = daysAlreadyInRoutine(entry, routine);

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
      {entry.frames.length > 0 ? (
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
      ) : videoUrl ? (
        <video
          data-library-video
          src={videoUrl}
          controls
          className="h-28 w-full rounded-lg border border-line object-contain"
          style={{ background: "#141414" }}
        />
      ) : entry.video_path ? (
        <p className="text-[12px] text-dim">Video: {entry.video_path.split(/[\\/]/).pop()}</p>
      ) : (
        // Los ejercicios que escribes tú no traen los tres frames del paquete.
        // Una tira de recuadros vacíos parece un fallo de carga, así que se dice
        // lo que pasa. El resto del detalle sigue igual.
        <p className="text-[12px] text-faint">Sin imágenes</p>
      )}
      {isOwn && (
        <div className="flex flex-wrap gap-2">
          {onPickVideo && (
            <GhostButton data-library-pick-video onClick={onPickVideo} className="self-start">
              Elegir video…
            </GhostButton>
          )}
          {onRemoveVideo && (
            <GhostButton data-library-remove-video onClick={onRemoveVideo} className="self-start">
              Quitar video
            </GhostButton>
          )}
        </div>
      )}

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

      {isOwn && onRemove && (
        <GhostButton data-library-remove onClick={onRemove} className="mt-1 self-start">
          <Trash2 size={13} /> Quitar de la biblioteca
        </GhostButton>
      )}

      <p className="mt-auto pt-1 text-[11px] text-faint">
        Ilustración: Bryl Lim / Everkinetic (CC BY-SA 4.0) · offline.
      </p>
    </div>
  );
}