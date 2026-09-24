// The bar over a note: its study workspace, the actions that send the note
// (or the selection) to the assistant, and quick buttons.

import { FolderOpen, MoreHorizontal, SlidersHorizontal, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../lib/bridge";
import { actionPrompt, WORKSPACE_ACTIONS } from "../../lib/studyActions";
import { useApp, type OpenNote } from "../../store/app";
import { actionContext, useAssistant } from "../../store/assistant";
import { openMenu } from "../ui";
import { editorSelection } from "./SourceEditor";
import { useProperties } from "./PropertiesDialog";
import { useEnglishAudio } from "./EnglishAudio";

export function runStudyAction(id: string) {
  if (id === "listening" || id === "speaking") {
    useEnglishAudio.getState().show(id);
    return;
  }
  const sel = editorSelection();
  void useAssistant.getState().ask(actionPrompt(id, actionContext(sel)), sel);
}

export function StudyBar({ note }: { note: OpenNote }) {
  const toast = useApp((s) => s.toast);
  const [ws, setWs] = useState<{ id: string; name: string; icon: string } | null>(null);
  useEffect(() => {
    let live = true;
    api.aiWorkspace(note.path).then((w) => live && setWs(w)).catch(() => live && setWs(null));
    return () => { live = false; };
  }, [note.path, note.frontmatter?.subject, note.frontmatter?.workspace]);
  const actions = WORKSPACE_ACTIONS[ws?.id ?? "general"] ?? WORKSPACE_ACTIONS.general!;
  return (
    <div className="flex h-9 flex-none items-center gap-1.5 overflow-x-auto border-b border-line bg-surface px-3">
      <button type="button" title="Mostrar en el explorador del sistema" onClick={() => void api.revealInOs(note.path).catch((e) => toast("error", (e as Error).message))}
        className="flex flex-none items-center gap-1 rounded-md border border-line px-2 py-0.5 text-[11px] text-dim hover:border-accent hover:text-text">
        <FolderOpen size={12} /> Ver en carpeta
      </button>
      {ws && ws.id !== "general" && (
        <span className="flex-none rounded-md border border-accent/40 bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent-text">{ws.icon} {ws.name}</span>
      )}
      <button type="button" onClick={() => useProperties.getState().show(note.path)}
        className="flex flex-none items-center gap-1 rounded-md border border-line px-2 py-0.5 text-[11px] text-dim hover:border-accent hover:text-text">
        <SlidersHorizontal size={12} /> Propiedades
      </button>
      <span className="flex-1" />
      {actions.filter((a) => !a.menuOnly).map((a) => (
        <button key={a.id} type="button" title={a.tip} onClick={() => runStudyAction(a.id)}
          className="flex flex-none items-center gap-1 rounded-md border border-line bg-card px-2 py-0.5 text-[11px] text-text hover:border-accent hover:bg-accent-soft">
          <Sparkles size={11} className="text-accent-text" /> {a.label}
        </button>
      ))}
      <button type="button" title={`Acciones de estudio (${ws?.name ?? "General"})`} aria-label="Más acciones de estudio"
        onClick={(e) => openMenu(e, actions.map((a) => ({ label: a.tip, onSelect: () => runStudyAction(a.id) })))}
        className="grid h-6 w-6 flex-none place-items-center rounded-md text-dim hover:bg-hover hover:text-text">
        <MoreHorizontal size={14} />
      </button>
    </div>
  );
}
