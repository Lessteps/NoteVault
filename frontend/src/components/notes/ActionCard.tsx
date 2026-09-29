// The card under an assistant reply that proposes files (a syllabus, a topic, a
// canvas, a skill). It shows exactly what would be created and writes nothing
// until the user presses "Aplicar".

import { Check, FilePlus2, FolderPlus, Loader2, RefreshCw, Wand2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../lib/bridge";
import type { ParsedAction } from "../../lib/assistantModes";
import { useApp } from "../../store/app";
import { cn } from "../ui";

type Preview = Awaited<ReturnType<typeof api.assistantActionPreview>>;

const MAX_ROWS = 14;

export function ActionCard({ action }: { action: ParsedAction }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [state, setState] = useState<"idle" | "applying" | "applied" | "dismissed">("idle");
  const [result, setResult] = useState<{ written: number; skipped: number } | null>(null);
  const key = JSON.stringify(action);

  useEffect(() => {
    let live = true;
    setPreview(null);
    setError("");
    api
      .assistantActionPreview(action)
      .then((p) => live && setPreview(p))
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
    // The card is keyed by the action's content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (state === "dismissed") return null;

  const apply = async () => {
    const app = useApp.getState();
    setState("applying");
    try {
      const res = await api.assistantActionApply(action);
      setResult({ written: res.written.length, skipped: res.skipped.length });
      setState("applied");
      app.refreshTree();
      app.toast("info", `${res.written.length} archivo(s) creado(s)${res.skipped.length ? `, ${res.skipped.length} ya existían` : ""}.`);
      if (res.open) {
        if (res.open.toLowerCase().endsWith(".canvas")) app.openTab({ kind: "canvas", path: res.open });
        else await app.openNote(res.open);
      }
    } catch (e) {
      setError((e as Error).message);
      setState("idle");
    }
  };

  const writes = preview?.ops.filter((o) => o.kind === "write") ?? [];
  const folders = preview?.ops.filter((o) => o.kind === "mkdir" && !o.exists).length ?? 0;

  return (
    <div className="mt-2 rounded-xl border border-accent/40 bg-accent-soft/40 p-3">
      <div className="flex items-center gap-2">
        <Wand2 size={14} className="flex-none text-accent-text" />
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-text">
          {preview?.title ?? "Propuesta del asistente"}
        </span>
      </div>

      {error && <p className="mt-1.5 text-[11.5px] text-danger">{error}</p>}
      {!preview && !error && (
        <p className="mt-1.5 flex items-center gap-1.5 text-[11.5px] text-faint">
          <Loader2 size={12} className="animate-spin" /> Comprobando…
        </p>
      )}

      {preview && (
        <>
          <ul className="mt-2 flex flex-col gap-0.5">
            {folders > 0 && (
              <li className="flex items-center gap-1.5 text-[11.5px] text-dim">
                <FolderPlus size={12} className="flex-none text-faint" /> {folders} carpeta(s) nueva(s)
              </li>
            )}
            {writes.slice(0, MAX_ROWS).map((o) => (
              <li key={o.rel} className="flex items-center gap-1.5 text-[11.5px]">
                {o.exists && o.overwrite ? (
                  <RefreshCw size={12} className="flex-none text-warn" />
                ) : (
                  <FilePlus2 size={12} className={cn("flex-none", o.exists ? "text-faint" : "text-mint")} />
                )}
                <span className={cn("min-w-0 truncate font-mono", o.exists && !o.overwrite ? "text-faint line-through" : "text-text")} title={o.rel}>
                  {o.rel}
                </span>
                {o.exists && <span className="flex-none text-[10px] text-faint">{o.overwrite ? "reemplaza" : "ya existe"}</span>}
              </li>
            ))}
            {writes.length > MAX_ROWS && <li className="text-[11px] text-faint">…y {writes.length - MAX_ROWS} archivo(s) más</li>}
          </ul>
          {preview.warnings.map((w) => (
            <p key={w} className="mt-1.5 text-[11px] text-warn">{w}</p>
          ))}
        </>
      )}

      <div className="mt-2.5 flex items-center gap-2">
        {state === "applied" ? (
          <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-mint">
            <Check size={13} /> Aplicado{result ? ` (${result.written} creado(s)${result.skipped ? `, ${result.skipped} ya existían` : ""})` : ""}
          </span>
        ) : (
          <>
            <button
              type="button"
              disabled={!preview || state === "applying"}
              onClick={() => void apply()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1 text-[12px] font-semibold text-white hover:bg-accent-strong disabled:opacity-50"
            >
              {state === "applying" ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Aplicar
            </button>
            <button
              type="button"
              onClick={() => setState("dismissed")}
              className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-[12px] text-dim hover:text-text"
            >
              <X size={12} /> Descartar
            </button>
          </>
        )}
      </div>
    </div>
  );
}
