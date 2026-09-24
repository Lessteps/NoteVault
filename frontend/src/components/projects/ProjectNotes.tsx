// Notas: the project's own documents (.notevault/proyectos/<id>/notas).

import { FilePlus, FileText, Folder, FolderPlus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/bridge";
import type { ProjectNoteEntry } from "../../lib/types";
import { clearPending, markPending, useApp } from "../../store/app";
import { useProjects } from "../../store/projects";
import { askText, cn, confirmAction, IconButton } from "../ui";

export function ProjectNotes() {
  const pid = useProjects((s) => s.detail!.project.id);
  const toast = useApp((s) => s.toast);
  const [list, setList] = useState<ProjectNoteEntry[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [status, setStatus] = useState("");
  const timer = useRef<number | undefined>(undefined);
  const pending = useRef<{ path: string; text: string } | null>(null);

  const refresh = () => api.projectNotesList(pid).then(setList).catch((e) => toast("error", (e as Error).message));
  const flush = async () => {
    window.clearTimeout(timer.current);
    const p = pending.current;
    pending.current = null;
    clearPending("project-note");
    if (!p) return;
    try {
      await api.projectNoteWrite(pid, p.path, p.text);
      setStatus("Guardado");
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };
  useEffect(() => {
    void refresh();
    return () => void flush();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pid]);

  const openDoc = async (path: string) => {
    await flush();
    try {
      const r = await api.projectNoteRead(pid, path);
      setSel(path);
      setText(r.raw);
      setStatus("");
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };

  const create = async (isFolder: boolean) => {
    const name = await askText(isFolder ? "Nueva carpeta" : "Nueva nota", "", "Crear");
    if (!name) return;
    const folder = sel && list.find((x) => x.path === sel)?.dir ? sel : sel?.includes("/") ? sel.slice(0, sel.lastIndexOf("/")) : "";
    try {
      const r = await api.projectNoteCreate(pid, folder, name, isFolder);
      await refresh();
      if (!isFolder) await openDoc(r.path);
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };

  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  return (
    <div className="flex min-h-0 flex-1 gap-3 px-5 pb-4 pt-3">
      <aside className="flex w-64 flex-none flex-col rounded-xl border border-line bg-panel">
        <div className="flex items-center gap-1 border-b border-line px-3 py-2">
          <span className="font-mono text-[10.5px] font-semibold uppercase tracking-wider text-faint">Documentos</span>
          <IconButton title="Nueva nota" className="ml-auto" onClick={() => void create(false)}><FilePlus size={14} /></IconButton>
          <IconButton title="Nueva carpeta" onClick={() => void create(true)}><FolderPlus size={14} /></IconButton>
        </div>
        <ul className="flex-1 overflow-y-auto p-1.5">
          {list.map((e) => (
            <li key={e.path} className="group flex items-center">
              <button type="button" onClick={() => (e.dir ? setSel(e.path) : void openDoc(e.path))}
                style={{ paddingLeft: 8 + (e.path.split("/").length - 1) * 14 }}
                className={cn("flex min-w-0 flex-1 items-center gap-2 rounded-md py-1 pr-2 text-left text-[12.5px]", sel === e.path ? "bg-accent-soft text-text" : "text-dim hover:bg-hover")}>
                {e.dir ? <Folder size={13} className="flex-none text-warn" /> : <FileText size={13} className="flex-none text-accent-text" />}
                <span className="truncate">{e.name}</span>
              </button>
              <IconButton title="A la papelera" className="opacity-0 group-hover:opacity-100"
                onClick={async () => {
                  if (!(await confirmAction("Eliminar", `«${e.name}» va a la papelera del vault.`, "Eliminar", true))) return;
                  try {
                    await api.projectNoteDelete(pid, e.path);
                    if (sel === e.path) { setSel(null); setText(""); }
                    await refresh();
                  } catch (err) {
                    toast("error", (err as Error).message);
                  }
                }}><Trash2 size={12} /></IconButton>
            </li>
          ))}
          {!list.length && <li className="p-3 text-[12px] text-faint">Sin documentos todavía.</li>}
        </ul>
      </aside>
      <section className="flex min-w-0 flex-1 flex-col rounded-xl border border-line bg-card">
        {sel && !list.find((x) => x.path === sel)?.dir ? (
          <>
            <div className="flex items-center gap-2 border-b border-line px-4 py-2">
              <span className="truncate text-[14px] font-semibold text-text">{sel.replace(/\.md$/, "")}</span>
              <span className="ml-auto text-[11px] text-faint">{status}</span>
            </div>
            <textarea aria-label="Documento" value={text} placeholder="Escribe aquí en formato Markdown…"
              onChange={(e) => {
                setText(e.target.value);
                setStatus("Sin guardar");
                pending.current = { path: sel, text: e.target.value };
                markPending("project-note", flush);
                window.clearTimeout(timer.current);
                timer.current = window.setTimeout(() => void flush(), 900);
              }}
              onBlur={() => void flush()}
              className="min-h-0 flex-1 resize-none bg-transparent p-4 font-mono text-[13px] leading-relaxed text-text outline-none" />
            <div className="border-t border-line px-4 py-1 text-right text-[10.5px] text-faint">{words} palabras · {text.length} caracteres</div>
          </>
        ) : (
          <div className="grid flex-1 place-items-center text-[13px] text-faint">Selecciona o crea una nota</div>
        )}
      </section>
    </div>
  );
}
