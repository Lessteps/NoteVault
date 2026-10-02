// Buscador sobre la biblioteca, dentro del formulario del programa. Escribe,
// elige uno y el formulario se rellena con su nombre, sus músculos y su
// "cómo hacerlo"; el día lo elige quien añade.
//
// Lo que ya tienes en la rutina sale marcado: son duplicados, no candidatos.
//
// Estuvo dentro de `Routine.tsx` junto al programa y al formulario. Ahora tiene
// su propio fichero porque no comparte estado con ninguno de los dos.

import { useMemo, useState } from "react";
import { searchLibrary } from "../../lib/exerciseLibrary";
import type { LibraryUserEntry } from "../../lib/libraryTypes";
import { input } from "../common/forms";
import { cn } from "../ui";

export function LibraryPicker({
  onPick,
  usedSlugs,
  userEntries,
}: {
  onPick: (slug: string) => void;
  /** Slugs que ya usas. Dato, no comparación de nombres: «Mi press» con
   * `source: bench-press` cuenta como bench-press aunque el nombre no coincida. */
  usedSlugs: Set<string>;
  /** Tus propias entradas: para que aparezcan al buscar. */
  userEntries: LibraryUserEntry[];
}) {
  const [q, setQ] = useState("");
  const rows = useMemo(
    () => (q.trim() ? searchLibrary(q, userEntries).slice(0, 8) : []),
    [q, userEntries],
  );
  return (
    <div data-library-picker className="space-y-1.5">
      <input
        className={input}
        placeholder="Buscar en la biblioteca…"
        aria-label="Buscar en la biblioteca"
        value={q}
        // Solo `onChange`: había también un `onInput` que hacía lo mismo, así
        // que cada tecla pasaba por los dos.
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            setQ("");
          }
        }}
      />
      {rows.length > 0 && (
        <div className="max-h-[188px] space-y-0.5 overflow-y-auto">
          {rows.map((r) => {
            const already = usedSlugs.has(r.slug);
            return (
              <button
                key={r.slug}
                type="button"
                data-library-pick={r.slug}
                data-in-routine={already ? "true" : undefined}
                onClick={() => onPick(r.slug)}
                className={cn(
                  "flex w-full items-center gap-1.5 rounded-lg border border-line px-2 py-1 text-left text-[12px]",
                  "text-dim hover:border-accent hover:text-text",
                )}
              >
                <span className="min-w-0 flex-1 truncate">
                  {r.name}
                  <span className="ml-1 text-[10.5px] text-faint">· {r.guidePrimary}</span>
                </span>
                {already && (
                  <span className="flex-none text-[10px]" style={{ color: "var(--nv-mint)" }}>
                    ya en tu rutina
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}