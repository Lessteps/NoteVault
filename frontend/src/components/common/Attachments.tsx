// Thumbnails of an entity's attachments (images and PDF): add, view, remove.

import { FileText, Paperclip, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/bridge";
import { useApp } from "../../store/app";
import { confirmAction, IconButton } from "../ui";
import { GhostButton, readFileBase64 } from "./forms";

function Thumb({ refName, onOpen, onRemove }: { refName: string; onOpen: (url: string, mime: string, ref: string) => void; onRemove: () => void }) {
  const [data, setData] = useState<{ url: string; mime: string } | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let live = true;
    api.attachRead(refName)
      .then((r) => live && setData({ url: r.data_url, mime: r.mime }))
      .catch(() => live && setMissing(true));
    return () => {
      live = false;
    };
  }, [refName]);
  return (
    <div className="group relative h-16 w-16 overflow-hidden rounded-lg border border-line bg-elevated">
      <button type="button" title={refName.split("/").pop()} onClick={() => data && onOpen(data.url, data.mime, refName)}
        className="grid h-full w-full place-items-center text-[11px] text-dim">
        {missing ? "⚠" : !data ? "…" : data.mime.startsWith("image/")
          ? <img src={data.url} alt="" className="h-full w-full object-cover" />
          : <FileText size={20} />}
      </button>
      <span className="absolute right-0.5 top-0.5 hidden rounded bg-black/60 group-hover:block">
        <IconButton title="Quitar" onClick={onRemove} className="h-5 w-5 text-white"><Trash2 size={11} /></IconButton>
      </span>
    </div>
  );
}

export function Attachments({ module, owner, refs, onChange }: {
  module: "proyectos" | "finanzas"; owner: string; refs: string[]; onChange: (refs: string[]) => void;
}) {
  const toast = useApp((s) => s.toast);
  const file = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<{ url: string; mime: string } | null>(null);

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    const added: string[] = [];
    for (const f of Array.from(files)) {
      try {
        const { ref } = await api.attachAdd(module, owner, f.name, await readFileBase64(f));
        added.push(ref);
      } catch (e) {
        toast("error", `${f.name}: ${(e as Error).message}`);
      }
    }
    if (added.length) onChange([...refs, ...added]);
  };

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void add(e.dataTransfer.files);
      }}
      onPaste={(e) => {
        if (e.clipboardData.files.length) {
          e.preventDefault();
          void add(e.clipboardData.files);
        }
      }}
    >
      <div className="flex flex-wrap gap-2">
        {refs.map((r) => (
          <Thumb key={r} refName={r}
            onOpen={(url, mime, ref) => {
              // PDFs open in the system viewer: the page's CSP allows no frames.
              if (mime.startsWith("image/")) setView({ url, mime });
              else api.attachOpen(ref).catch((e) => toast("error", (e as Error).message));
            }}
            onRemove={async () => {
              if (!(await confirmAction("Quitar adjunto", "El archivo va a la papelera del vault.", "Quitar", true))) return;
              try {
                await api.attachRemove(r);
              } catch {
                /* already gone: still drop the reference */
              }
              onChange(refs.filter((x) => x !== r));
            }} />
        ))}
        <GhostButton onClick={() => file.current?.click()} className="h-16"><Paperclip size={14} /> Adjuntar</GhostButton>
      </div>
      <input ref={file} type="file" multiple hidden accept=".png,.jpg,.jpeg,.webp,.gif,.bmp,.pdf"
        onChange={(e) => {
          void add(e.target.files);
          e.target.value = "";
        }} />
      {view && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-6" onMouseDown={() => setView(null)}>
          <img src={view.url} alt="" className="max-h-full max-w-full rounded-lg" />
        </div>
      )}
    </div>
  );
}
