// Mentor — «Ver carpeta»: dos formas de verla. Dentro de NoteVault (el explorador de notas se abre en esa carpeta) o en el Explorador de Windows.

import { ChevronDown, FolderOpen, FolderTree, MonitorUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/bridge";
import { useApp } from "../../store/app";
import { GhostButton } from "../common/forms";

export function FolderOpenMenu({ dir, label = "Ver carpeta", testid = "folder-open" }: { dir: string; label?: string; testid?: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent): void => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const inVault = (): void => {
    setOpen(false);
    useApp.getState().showFolder(dir);
  };
  const inWindows = (): void => {
    setOpen(false);
    api.revealPath(dir).catch((e: Error) => useApp.getState().toast("error", e.message));
  };
  const item = "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[14px] hover:bg-hover";
  return (
    <span ref={box} className="relative inline-flex" data-testid={testid}>
      <GhostButton onClick={() => setOpen((o) => !o)} aria-expanded={open} data-testid={`${testid}-toggle`}>
        <FolderOpen size={15} aria-hidden /> {label} <ChevronDown size={14} aria-hidden />
      </GhostButton>
      {open && (
        <div role="menu" className="absolute left-0 top-full z-30 mt-1 w-64 rounded-xl border border-line bg-card p-1 shadow-lg" data-testid={`${testid}-menu`}>
          <button type="button" role="menuitem" className={item} onClick={inVault} data-testid={`${testid}-vault`}>
            <FolderTree size={16} aria-hidden className="text-accent-text" /> Ver en NoteVault
          </button>
          <button type="button" role="menuitem" className={item} onClick={inWindows} data-testid={`${testid}-windows`}>
            <MonitorUp size={16} aria-hidden className="text-mint" /> Abrir en el Explorador de Windows
          </button>
        </div>
      )}
    </span>
  );
}
