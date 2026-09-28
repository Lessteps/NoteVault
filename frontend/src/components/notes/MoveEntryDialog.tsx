// "Mover a otra carpeta…": every folder of the vault, searchable, with the
// current parent marked so it is clear nothing would change.

import { useEffect, useMemo, useState } from "react";
import { Folder, FolderInput, Search, X } from "lucide-react";
import { api } from "../../lib/bridge";
import { useApp } from "../../store/app";
import { cn } from "../ui";

interface FolderOption {
  path: string;
  label: string;
}

/** Every folder of the vault, depth first, skipping hidden ones. */
async function listFolders(root = "", depth = 0): Promise<FolderOption[]> {
  if (depth > 4) return [];
  let entries: Array<{ type: string; path: string; name: string }> = [];
  try {
    entries = (await api.listDir(root)) as Array<{ type: string; path: string; name: string }>;
  } catch {
    return [];
  }
  const out: FolderOption[] = [];
  for (const entry of entries) {
    if (entry.type !== "folder" || entry.name.startsWith(".")) continue;
    out.push({ path: entry.path, label: entry.path });
    out.push(...(await listFolders(entry.path, depth + 1)));
  }
  return out;
}

export function MoveEntryDialog({
  entry,
  onClose,
  onDone,
}: {
  entry: { path: string; name: string; type: "folder" | "note" };
  onClose: () => void;
  onDone: () => void;
}) {
  const [folders, setFolders] = useState<FolderOption[] | null>(null);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentParent = entry.path.split("/").slice(0, -1).join("/");

  useEffect(() => {
    let alive = true;
    void listFolders("").then((all) => {
      if (alive) setFolders(all);
    });
    return () => {
      alive = false;
    };
  }, []);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const all = folders ?? [];
    return q ? all.filter((f) => f.label.toLowerCase().includes(q)) : all;
  }, [folders, filter]);

  async function move(dest: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { path } = await api.move(entry.path, dest);
      const s = useApp.getState();
      s.pathRenamed(entry.path, path);
      s.refreshTree();
      s.toast("info", `«${entry.name}» se movió a ${dest || "la raíz del vault"}.`);
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/45" onMouseDown={onClose}>
      <div
        className="flex h-[70vh] w-[520px] flex-col overflow-hidden rounded-xl border border-line-strong bg-card shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Mover a otra carpeta"
      >
        <div className="flex flex-none items-center gap-2 border-b border-line px-3 py-2">
          <FolderInput size={14} className="text-dim" />
          <span className="truncate text-[12.5px] font-medium">Mover «{entry.name}»</span>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="ml-auto grid h-7 w-7 place-items-center rounded-md text-dim hover:bg-hover hover:text-text"
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex flex-none items-center gap-2 border-b border-line px-3 py-2">
          <Search size={13} className="text-faint" />
          <input
            autoFocus
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtrar carpetas…"
            className="h-7 w-full bg-transparent text-[12.5px] text-text outline-none placeholder:text-faint"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {folders === null && <div className="px-2 py-3 text-[12px] text-faint">Leyendo el vault…</div>}
          {folders !== null && (
            <button
              type="button"
              disabled={busy || currentParent === ""}
              onClick={() => void move("")}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px]",
                currentParent === "" ? "text-faint" : "text-text hover:bg-hover",
              )}
            >
              <Folder size={14} className="text-dim" />
              Raíz del vault
            </button>
          )}
          {visible.map((f) => {
            const isCurrent = f.path === currentParent;
            return (
              <button
                key={f.path}
                type="button"
                disabled={busy || isCurrent}
                onClick={() => void move(f.path)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px]",
                  isCurrent ? "text-faint" : "text-text hover:bg-hover",
                )}
              >
                <Folder size={14} className="text-dim" />
                <span className="truncate">{f.label}</span>
                {isCurrent && <span className="ml-auto text-[11px] text-faint">aquí está</span>}
              </button>
            );
          })}
          {folders !== null && visible.length === 0 && (
            <div className="px-2 py-3 text-[12px] text-faint">Sin carpetas que coincidan.</div>
          )}
        </div>

        {error && <div className="flex-none border-t border-line px-3 py-2 text-[12px] text-danger">{error}</div>}
      </div>
    </div>
  );
}
