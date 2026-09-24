// Espacios de estudio: create the Mathematics / Programming / English
// folders at the vault root with one click.

import { useCallback, useEffect, useState } from "react";
import { create } from "zustand";
import { api } from "../../lib/bridge";
import { useApp } from "../../store/app";
import { GhostButton, Modal, PrimaryButton } from "../common/forms";

export const useStudyFolders = create<{ open: boolean; set: (o: boolean) => void }>((set) => ({ open: false, set: (open) => set({ open }) }));

export function StudyFoldersDialog() {
  const open = useStudyFolders((s) => s.open);
  const close = () => useStudyFolders.getState().set(false);
  const [items, setItems] = useState<Array<{ id: string; name: string; icon: string; exists: boolean; index: string }>>([]);
  const [structure, setStructure] = useState(true);

  const load = useCallback(() => {
    api.studyFolders().then(setItems).catch(() => setItems([]));
  }, []);
  useEffect(() => {
    if (open) load();
  }, [open, load]);
  if (!open) return null;

  const s = useApp.getState();
  const createOne = async (id: string) => {
    try {
      const r = await api.studyFolderCreate(id, structure);
      s.refreshTree();
      load();
      return r.index;
    } catch (e) {
      s.toast("error", (e as Error).message);
      return "";
    }
  };
  const openIndex = (rel: string) => {
    if (!rel) return;
    close();
    s.setModule("notas");
    void s.openNote(rel);
  };

  return (
    <Modal title="Espacios de estudio" onClose={close} width={480}
      footer={
        <>
          <PrimaryButton disabled={items.every((i) => i.exists)} onClick={async () => {
            let last = "";
            for (const i of items.filter((x) => !x.exists)) last = (await createOne(i.id)) || last;
            openIndex(last);
          }}>Crear las tres</PrimaryButton>
          <div className="flex-1" />
          <GhostButton onClick={close}>Cerrar</GhostButton>
        </>
      }>
      <p className="text-[12.5px] text-dim">
        Crea las carpetas de estudio en la raíz de tu vault. Las herramientas de cada materia (práctica, panel Estudio, acciones de estudio) se activan al abrir notas dentro de ellas.
      </p>
      <label className="flex items-center gap-2 text-[12.5px] text-dim">
        <input type="checkbox" checked={structure} onChange={(e) => setStructure(e.target.checked)} /> Crear estructura sugerida (subcarpetas)
      </label>
      {items.map((i) => (
        <div key={i.id} className="flex items-center gap-3 rounded-xl border border-line bg-card px-4 py-3">
          <span className="text-[26px]">{i.icon}</span>
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold text-text">{i.name}</div>
            <div className={i.exists ? "text-[11px] text-mint" : "text-[11px] text-faint"}>{i.exists ? "✓ Existe" : "No existe todavía"}</div>
          </div>
          {i.exists
            ? <GhostButton onClick={() => openIndex(i.index)}>Abrir</GhostButton>
            : <PrimaryButton onClick={() => void createOne(i.id).then(openIndex)}>Crear</PrimaryButton>}
        </div>
      ))}
    </Modal>
  );
}
