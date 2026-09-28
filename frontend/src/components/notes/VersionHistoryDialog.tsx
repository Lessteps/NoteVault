// "Ver el historial de versiones": past revisions of a file, straight from the
// vault's git repository (the vault is a repo, so this is the real history of
// the file — no parallel snapshots). Read-only: it shows what a revision had,
// it never writes.

import { useEffect, useState } from "react";
import { Clock, X } from "lucide-react";
import { api, type VersionRevision } from "../../lib/bridge";
import { cn } from "../ui";

function when(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Date(t).toLocaleString("es", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function VersionHistoryDialog({
  rel,
  onClose,
}: {
  rel: string;
  onClose: () => void;
}) {
  const [revisions, setRevisions] = useState<VersionRevision[] | null>(null);
  const [selected, setSelected] = useState<VersionRevision | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .versionHistory(rel)
      .then((list) => {
        if (!alive) return;
        setRevisions(list);
        if (list.length) setSelected(list[0]!);
      })
      .catch((e) => alive && setError((e as Error).message));
    return () => {
      alive = false;
    };
  }, [rel]);

  useEffect(() => {
    if (!selected) return;
    let alive = true;
    setContent(null);
    api
      .versionFile(rel, selected.hash)
      .then((r) => alive && setContent(r.content))
      .catch((e) => alive && setError((e as Error).message));
    return () => {
      alive = false;
    };
  }, [rel, selected]);

  const name = rel.split("/").pop() ?? rel;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/45" onMouseDown={onClose}>
      <div
        className="flex h-[76vh] w-[900px] flex-col overflow-hidden rounded-xl border border-line-strong bg-card shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Historial de versiones"
      >
        <div className="flex flex-none items-center gap-2 border-b border-line px-3 py-2">
          <Clock size={14} className="text-dim" />
          <span className="truncate text-[12.5px] font-medium">Historial de «{name}»</span>
          {revisions && (
            <span className="text-[11px] text-faint">
              {revisions.length} {revisions.length === 1 ? "revisión" : "revisiones"}
            </span>
          )}
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="ml-auto grid h-7 w-7 place-items-center rounded-md text-dim hover:bg-hover hover:text-text"
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          <div className="w-[290px] flex-none overflow-y-auto border-r border-line p-1.5">
            {revisions === null && <div className="px-2 py-3 text-[12px] text-faint">Leyendo el historial…</div>}
            {revisions?.length === 0 && (
              <div className="px-2 py-3 text-[12px] text-faint">
                Sin historial: el vault todavía no tiene revisiones de este archivo.
              </div>
            )}
            {revisions?.map((rev) => (
              <button
                key={rev.hash}
                type="button"
                onClick={() => setSelected(rev)}
                className={cn(
                  "mb-0.5 flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left",
                  selected?.hash === rev.hash ? "bg-accent-soft text-text" : "text-dim hover:bg-hover hover:text-text",
                )}
              >
                <span className="truncate text-[12.5px] text-text">{rev.subject || "(sin mensaje)"}</span>
                <span className="text-[11px] text-faint">
                  {when(rev.date)} · {rev.author} · {rev.hash.slice(0, 7)}
                </span>
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-3">
            {error && <div className="text-[12px] text-danger">{error}</div>}
            {!error && content === null && selected && (
              <div className="text-[12px] text-faint">Cargando la revisión…</div>
            )}
            {content !== null && (
              <pre className="whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-dim">{content}</pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
