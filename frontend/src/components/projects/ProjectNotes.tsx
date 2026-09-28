// Notas: the project's working folders. Three zones — the tree of linked Windows
// folders, the open files, and (later) the outline/tasks panel — over a status bar.
//
// Phase 1 of the brief: linking, the explorer, opening/creating/renaming/deleting
// and the destination folder. The WYSIWYG editor, the outline and the linked tasks
// build on top of this shell.

import { ExternalLink, FileText, FolderPlus, Image as ImageIcon, Link2, Plus, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../lib/bridge";
import type { ProjectFolder } from "../../lib/types";
import { useApp } from "../../store/app";
import { useProjects } from "../../store/projects";
import { askText, cn } from "../ui";
import { NotesTree, type OpenTarget } from "./NotesTree";
import { NoteEditor } from "./NoteEditor";

interface OpenDoc {
  folderId: string;
  rel: string;
  name: string;
  kind: "markdown" | "text" | "code" | "binary";
  /** The text as it is on disk right now (what we compare against). */
  disk: string;
  /** The text the editor was built from: it only changes on an open or a reload. */
  loaded: string;
  /** Bumped to force the editor to rebuild (another file, or a reload). */
  revision: number;
  /** What the editor holds; saved 800ms after the last keystroke. */
  text: string;
  /** mtime of the read, so the API can refuse to overwrite someone else's write. */
  modified: number;
  readonly: boolean;
  binary?: { data_url: string; mime: string };
  /** The file changed on disk while we had unsaved edits. */
  conflict?: boolean;
}

const keyOf = (t: OpenTarget) => `${t.folderId}:${t.rel}`;
const nameOf = (rel: string) => rel.split("/").pop() ?? rel;
const isBinaryExt = (rel: string) => /\.(png|jpe?g|gif|webp|svg|bmp|pdf)$/i.test(rel);

export function ProjectNotes() {
  const detail = useProjects((s) => s.detail)!;
  const reloadProject = useProjects((s) => s.reload);
  const toast = useApp((s) => s.toast);
  const pid = detail.project.id;

  const [folders, setFolders] = useState<ProjectFolder[]>(detail.project.folders ?? []);
  const [docs, setDocs] = useState<Record<string, OpenDoc>>({});
  const [order, setOrder] = useState<string[]>([]);
  const [activeKey, setActiveKey] = useState<string>("");
  const [saving, setSaving] = useState<Record<string, "saving" | "saved" | "dirty">>({});
  const [sideWidth, setSideWidth] = useState(260);
  const timers = useRef<Record<string, number | undefined>>({});
  const dragging = useRef(false);

  useEffect(() => {
    setFolders(detail.project.folders ?? []);
  }, [detail.project.id, detail.project.folders]);

  const fail = (e: unknown) => toast("error", (e as Error).message);
  const active = activeKey ? docs[activeKey] : undefined;

  /** Writes the open documents that still have pending edits. */
  // The debounce fires later: it must read the documents as they are *now*, not as
  // they were when the timer was armed (that stale closure silently dropped saves).
  const docsRef = useRef(docs);
  docsRef.current = docs;
  const flush = useCallback(async (key?: string) => {
    const current = docsRef.current;
    const keys = key ? [key] : Object.keys(timers.current);
    for (const k of keys) {
      window.clearTimeout(timers.current[k]);
      timers.current[k] = undefined;
      const doc = current[k];
      if (!doc || doc.readonly || doc.text === doc.disk) continue;
      setSaving((s) => ({ ...s, [k]: "saving" }));
      try {
        const r = await api.projectFileWrite(pid, doc.folderId, doc.rel, doc.text, doc.modified);
        if (r.conflict) {
          setDocs((d) => ({ ...d, [k]: { ...d[k]!, conflict: true } }));
          setSaving((s) => ({ ...s, [k]: "dirty" }));
          continue;
        }
        setDocs((d) => (d[k] ? { ...d, [k]: { ...d[k]!, disk: d[k]!.text, modified: r.modified, conflict: false } } : d));
        setSaving((s) => ({ ...s, [k]: "saved" }));
      } catch (e) {
        setSaving((s) => ({ ...s, [k]: "dirty" }));
        fail(e);
      }
    }
  }, [pid]);

  // Leaving the tab (or the project) must not lose anything: save what is pending.
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => () => void flushRef.current(), []);

  const abrir = async (t: OpenTarget) => {
    const key = keyOf(t);
    setActiveKey(key);
    if (docs[key]) return;
    try {
      const meta = await api.projectFileRead(pid, t.folderId, t.rel);
      const doc: OpenDoc = {
        folderId: t.folderId,
        rel: t.rel,
        name: nameOf(t.rel),
        kind: (meta.kind as OpenDoc["kind"]) ?? "text",
        disk: meta.raw,
        loaded: meta.raw,
        revision: 0,
        text: meta.raw,
        modified: meta.modified,
        readonly: meta.readonly,
      };
      if (isBinaryExt(t.rel)) {
        const data = await api.projectFileData(pid, t.folderId, t.rel);
        doc.binary = { data_url: data.data_url, mime: data.mime };
        doc.kind = "binary";
      }
      setDocs((d) => ({ ...d, [key]: doc }));
      setOrder((o) => (o.includes(key) ? o : [...o, key]));
      setSaving((s) => ({ ...s, [key]: "saved" }));
    } catch (e) {
      fail(e);
    }
  };

  const cerrar = (key: string) => {
    void flush(key);
    setDocs((d) => {
      const next = { ...d };
      delete next[key];
      return next;
    });
    setOrder((o) => {
      const next = o.filter((x) => x !== key);
      if (key === activeKey) setActiveKey(next[next.length - 1] ?? "");
      return next;
    });
  };

  /** A new .md in the destination folder, opened straight away. */
  const nuevaNota = async () => {
    const target = folders.find((f) => f.target);
    if (!target) return;
    const name = await askText("Nueva nota", "", "Crear");
    if (!name) return;
    try {
      const r = await api.projectFileCreate(pid, target.id, "", name, false);
      await abrir({ folderId: target.id, rel: r.entry.rel });
    } catch (e) {
      fail(e);
    }
  };

  const editar = (text: string) => {
    setDocs((d) => ({ ...d, [activeKey]: { ...d[activeKey]!, text, conflict: false } }));
    setSaving((s) => ({ ...s, [activeKey]: "dirty" }));
    window.clearTimeout(timers.current[activeKey]);
    timers.current[activeKey] = window.setTimeout(() => void flush(activeKey), 800);
  };

  const vincular = async () => {
    try {
      const picked = await api.pickFolder();
      if (!picked.path) return;
      const r = await api.projectFolderLink(pid, picked.path);
      setFolders(r.folders);
      await reloadProject();
      if (r.warning) toast("info", r.warning);
      else toast("info", `«${r.folder.name}» vinculada.`);
    } catch (e) {
      fail(e);
    }
  };

  const recargarCarpetas = async () => {
    try {
      const list = await api.projectFolders(pid);
      setFolders(list);
      await reloadProject();
    } catch (e) {
      fail(e);
    }
  };

  // The sidebar is resizable, as asked for in the layout.
  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!dragging.current) return;
      setSideWidth(Math.min(520, Math.max(180, e.clientX - 24)));
    };
    const up = () => {
      dragging.current = false;
      document.body.style.cursor = "";
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, []);

  const estado = (key: string): string => {
    const doc = docs[key];
    if (!doc) return "";
    if (doc.conflict) return "Modificado externamente";
    if (saving[key] === "saving") return "Guardando…";
    if (saving[key] === "dirty") return "Modificado";
    return "Guardado";
  };
  const estadoColor = (key: string): string => {
    const doc = docs[key];
    if (!doc) return "text-faint";
    if (doc.conflict) return "text-danger";
    if (saving[key] === "dirty") return "text-warn";
    if (saving[key] === "saving") return "text-dim";
    return "text-mint";
  };

  const destino = folders.find((f) => f.target);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Zone: tool bar */}
      <div className="flex flex-none flex-wrap items-center gap-2 px-5 pb-2 pt-2.5">
        <button type="button" onClick={() => void vincular()}
          className="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-[12.5px] text-dim hover:bg-hover hover:text-text">
          <FolderPlus size={13} /> Vincular carpeta
        </button>
        <button type="button" disabled={!destino} onClick={() => void nuevaNota()}
          title={destino ? `Nueva nota en ${destino.name}` : "Vincula una carpeta primero"}
          className={cn("flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-[12.5px]",
            destino ? "text-dim hover:bg-hover hover:text-text" : "cursor-not-allowed text-faint")}>
          <Plus size={13} /> Nueva nota
        </button>
        {destino && (
          <span className="flex min-w-0 items-center gap-1.5 text-[11.5px] text-faint">
            <Link2 size={12} className="flex-none" />
            <span className="truncate">Destino: {destino.path}</span>
          </span>
        )}
      </div>

      <div className="flex min-h-0 flex-1 gap-3 px-5 pb-2">
        {/* Zone: explorer */}
        <aside className="flex flex-none flex-col rounded-xl border border-line bg-panel" style={{ width: sideWidth }}>
          <div className="flex h-8 flex-none items-center border-b border-line px-3">
            <span className="font-mono text-[10.5px] font-semibold uppercase tracking-wider text-faint">Explorador</span>
          </div>
          <NotesTree pid={pid} folders={folders} active={active ? { folderId: active.folderId, rel: active.rel } : null}
            onOpen={(t) => void abrir(t)} onFolders={() => void recargarCarpetas()} className="min-h-0 flex-1" />
        </aside>
        <div
          onMouseDown={() => {
            dragging.current = true;
            document.body.style.cursor = "col-resize";
          }}
          title="Arrastra para redimensionar"
          className="w-1 flex-none cursor-col-resize rounded bg-transparent hover:bg-accent-soft"
        />

        {/* Zone: open files */}
        <section className="flex min-w-0 flex-1 flex-col rounded-xl border border-line bg-card">
          {order.length > 0 && (
            <div className="flex flex-none items-center gap-1 overflow-x-auto border-b border-line px-2 py-1.5">
              {order.map((key) => {
                const doc = docs[key];
                if (!doc) return null;
                const dirty = doc.text !== doc.disk;
                return (
                  <span key={key}
                    className={cn("group flex max-w-[220px] flex-none items-center gap-1.5 rounded-md px-2 py-1 text-[12px]",
                      key === activeKey ? "bg-accent-soft text-text" : "text-dim hover:bg-hover")}>
                    <FileText size={12} className="flex-none text-accent-text" />
                    <button type="button" title={doc.rel} onClick={() => setActiveKey(key)} className="min-w-0 truncate">
                      {doc.name}
                    </button>
                    {dirty && <span className="h-1.5 w-1.5 flex-none rounded-full bg-warn" title="Sin guardar" />}
                    <button type="button" title="Cerrar" onClick={() => cerrar(key)} className="flex-none text-faint hover:text-text">
                      <X size={12} />
                    </button>
                  </span>
                );
              })}
            </div>
          )}

          <div className="flex min-h-0 flex-1 flex-col">
            {!active && (
              <div className="grid flex-1 place-items-center text-[13px] text-faint">
                {folders.length ? "Selecciona o crea un archivo" : "Vincula una carpeta para empezar"}
              </div>
            )}
            {active && active.conflict && (
              <div className="flex flex-none flex-wrap items-center gap-2 border-b border-danger/40 bg-danger-soft px-3 py-2 text-[12px] text-danger">
                <span className="min-w-0 flex-1">El archivo cambió en el disco mientras lo tenías abierto. Nada se ha sobrescrito.</span>
                <button type="button" className="rounded-md border border-line px-2 py-0.5 text-text hover:bg-hover"
                  onClick={() => {
                    setDocs((d) => ({ ...d, [activeKey]: { ...d[activeKey]!, conflict: false } }));
                    void flush(activeKey);
                  }}>Conservar el mío</button>
                <button type="button" className="rounded-md border border-line px-2 py-0.5 text-text hover:bg-hover"
                  onClick={async () => {
                    try {
                      const meta = await api.projectFileRead(pid, active.folderId, active.rel);
                      setDocs((d) => ({ ...d, [activeKey]: {
                        ...d[activeKey]!,
                        disk: meta.raw,
                        loaded: meta.raw,
                        text: meta.raw,
                        modified: meta.modified,
                        conflict: false,
                        revision: (d[activeKey]!.revision ?? 0) + 1,
                      } }));
                    } catch (e) {
                      fail(e);
                    }
                  }}>Cargar del disco</button>
              </div>
            )}
            {active && active.readonly && !active.binary && (
              <div className="flex-none border-b border-warn/40 bg-warn-soft px-3 py-1.5 text-[11.5px] text-warn">
                Archivo grande: se abre en solo lectura.
              </div>
            )}
            {active && active.binary && (
              <div className="grid min-h-0 flex-1 place-items-center overflow-auto p-4">
                {active.binary.mime.startsWith("image/") ? (
                  <img src={active.binary.data_url} alt={active.name} className="max-h-full max-w-full rounded-lg" />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-[12.5px] text-dim">
                    <ImageIcon size={28} className="text-faint" />
                    <span>{active.name}</span>
                    <button type="button" onClick={() => void api.projectFileOpen(pid, active.folderId, active.rel).catch(fail)}
                      className="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-text hover:bg-hover">
                      <ExternalLink size={13} /> Abrir con el programa predeterminado
                    </button>
                  </div>
                )}
              </div>
            )}
            {active && !active.binary && active.kind === "markdown" && (
              <NoteEditor initial={active.loaded} revision={active.revision} readOnly={active.readonly}
                onMarkdown={editar} onSave={() => void flush(activeKey)} />
            )}
            {active && !active.binary && active.kind !== "markdown" && (
              <textarea
                aria-label="Archivo"
                value={active.text}
                readOnly={active.readonly}
                onChange={(e) => editar(e.target.value)}
                onBlur={() => void flush(activeKey)}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
                    e.preventDefault();
                    void flush(activeKey);
                  }
                }}
                placeholder="Escribe en Markdown…"
                className="min-h-0 flex-1 resize-none bg-transparent p-4 font-mono text-[13px] leading-relaxed text-text outline-none placeholder:text-faint"
              />
            )}
          </div>

          {/* Zone: status bar */}
          <div className="flex flex-none items-center gap-2 border-t border-line px-3 py-1 text-[10.5px]">
            <span className="min-w-0 flex-1 truncate text-faint">
              {active ? `${folders.find((f) => f.id === active.folderId)?.path ?? ""}\\${active.rel.split("/").join("\\")}` : "Sin archivo abierto"}
            </span>
            {active && <span className={estadoColor(activeKey)}>{estado(activeKey)}</span>}
          </div>
        </section>
      </div>
    </div>
  );
}
