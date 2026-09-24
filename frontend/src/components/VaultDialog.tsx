// Elige tu vault: recent vaults, open another folder, or create a new one.

import { FolderOpen, FolderPlus, Gem } from "lucide-react";
import { useEffect, useState } from "react";
import { create } from "zustand";
import { api } from "../lib/bridge";
import type { VaultInfo } from "../lib/types";
import { flushAll, useApp } from "../store/app";
import { GhostButton, input, Modal, PrimaryButton } from "./common/forms";
import { askText, cn, confirmAction } from "./ui";

export const useVaultDialog = create<{ open: boolean; set: (open: boolean) => void }>((set) => ({
  open: false, set: (open) => set({ open }),
}));

function describe(v: Partial<VaultInfo>): string {
  if (v.exists === false) return "la carpeta ya no existe";
  const bits = [];
  if (v.obsidian) bits.push("vault de Obsidian");
  bits.push(`${v.markdown ?? 0}${v.truncated ? "+" : ""} notas`, `${v.folders ?? 0} carpetas`);
  return bits.join(" · ");
}

export function VaultDialog() {
  const open = useVaultDialog((s) => s.open);
  const setOpen = useVaultDialog((s) => s.set);
  const toast = useApp((s) => s.toast);
  const [list, setList] = useState<VaultInfo[]>([]);
  const [path, setPath] = useState("");
  const [manual, setManual] = useState(false);

  useEffect(() => {
    if (open) api.vaultList().then(setList).catch((e) => toast("error", (e as Error).message));
  }, [open, toast]);
  if (!open) return null;

  const choose = async (v: Partial<VaultInfo> & { path: string }) => {
    if (!v.obsidian && (v.code_markers ?? 0) > 0 && (v.markdown ?? 0) <= 2) {
      const ok = await confirmAction("¿Seguro que es una vault?",
        `«${v.name ?? v.path}» parece una carpeta de código, no de notas: el explorador se llenará de carpetas que no son notas. ¿Abrirla de todas formas?`, "Abrir igualmente");
      if (!ok) return;
    }
    try {
      await flushAll();
      await api.vaultOpen(v.path);
      // Every module reloads from the new vault.
      window.location.reload();
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };

  return (
    <Modal title="Elige tu vault" onClose={() => setOpen(false)} width={560}
      footer={<>
        <GhostButton onClick={async () => {
          const r = await api.vaultPick().catch((e) => { toast("error", (e as Error).message); return null; });
          if (r?.fallback) setManual(true);
          else if (r?.ok && r.path) void choose(r as VaultInfo);
        }}><FolderOpen size={14} /> Abrir otra carpeta…</GhostButton>
        <GhostButton onClick={async () => {
          const name = await askText("Nombre de la nueva vault", "Mis notas", "Elegir dónde…");
          if (!name) return;
          const r = await api.vaultCreate(name).catch((e) => { toast("error", (e as Error).message); return null; });
          if (r?.fallback) setManual(true);
          else if (r?.ok && r.path) void choose({ path: r.path, name, markdown: 1, folders: 0, code_markers: 0, truncated: false, obsidian: false });
        }}><FolderPlus size={14} /> Crear vault…</GhostButton>
        <span className="flex-1" />
        <GhostButton onClick={() => setOpen(false)}>Cerrar</GhostButton>
      </>}>
      <p className="text-[12.5px] text-dim">Una vault es una carpeta con tus notas en Markdown. Puedes usar la de Obsidian.</p>
      <ul className="space-y-1.5">
        {list.map((v) => (
          <li key={v.path}>
            <button type="button" disabled={v.current || v.exists === false} onClick={() => void choose(v)}
              className={cn("flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left", v.current ? "border-accent bg-accent-soft" : "border-line hover:border-line-strong disabled:opacity-50")}>
              <Gem size={16} className="flex-none text-accent-text" />
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-medium text-text">{v.name}{v.current && <span className="ml-2 text-[11px] text-accent-text">actual</span>}</span>
                <span className="block truncate font-mono text-[10.5px] text-faint">{v.path}</span>
                <span className="block text-[11.5px] text-dim">{describe(v)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {manual && (
        <div className="flex gap-2">
          <input className={input} value={path} placeholder="Ruta de la carpeta" onChange={(e) => setPath(e.target.value)} />
          <PrimaryButton onClick={() => path.trim() && void choose({ path: path.trim(), name: path.trim(), markdown: 1, folders: 0, code_markers: 0, truncated: false, obsidian: false })}>Abrir</PrimaryButton>
        </div>
      )}
    </Modal>
  );
}
