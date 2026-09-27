import { useEffect, useRef, useState } from "react";
import { Globe, PanelRight } from "lucide-react";
import { useApp } from "../../store/app";
import { EditorArea } from "./EditorArea";
import { Explorer } from "./Explorer";
import { Inspector } from "./Inspector";
import { AiSettingsDialog, AssistantPanel } from "./AssistantPanel";
import { EnglishAudioDialog } from "./EnglishAudio";
import { PropertiesDialog } from "./PropertiesDialog";
import { useAssistant } from "../../store/assistant";
import { useCanvas } from "../../store/canvas";
import { CanvasView } from "../canvas/CanvasView";
import { ConceptMapDialog } from "../canvas/ConceptMapDialog";
import { StudyFoldersDialog } from "../study/StudyFoldersDialog";

const WIDTH_KEY = "nv.explorer.width";

export function NotesModule() {
  const explorerOpen = useApp((s) => s.explorerOpen);
  const inspectorOpen = useApp((s) => s.inspectorOpen);
  const assistantOpen = useAssistant((s) => s.open);
  const canvasPath = useCanvas((s) => s.path);
  const [width, setWidth] = useState(() => Number(localStorage.getItem(WIDTH_KEY)) || 290);
  const drag = useRef<{ x: number; w: number } | null>(null);

  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!drag.current) return;
      setWidth(Math.min(520, Math.max(220, drag.current.w + e.clientX - drag.current.x)));
    };
    const up = () => {
      if (drag.current) localStorage.setItem(WIDTH_KEY, String(width));
      drag.current = null;
      document.body.style.cursor = "";
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [width]);

  return (
    <div className="flex min-w-0 flex-1">
      {explorerOpen && (
        <>
          <Explorer width={width} />
          <div
            className="-ml-[3px] w-[5px] flex-none cursor-col-resize hover:bg-accent/40"
            onMouseDown={(e) => {
              drag.current = { x: e.clientX, w: width };
              document.body.style.cursor = "col-resize";
            }}
          />
        </>
      )}
      {canvasPath ? <CanvasView /> : <EditorArea />}
      {!canvasPath && (
        assistantOpen ? (
          <AssistantPanel />
        ) : inspectorOpen ? (
          <Inspector />
        ) : (
          <aside
            aria-label="Acceso panel lateral"
            className="flex w-10 flex-none flex-col items-center gap-2 border-l border-line bg-panel py-3"
          >
            <button
              type="button"
              title="Abrir Navegador web"
              onClick={() => {
                useApp.getState().toggleInspector();
                localStorage.setItem("nv.inspector.tab", "browser");
                window.dispatchEvent(new CustomEvent("nv-set-inspector-tab", { detail: "browser" }));
              }}
              className="grid h-8 w-8 place-items-center rounded-lg text-dim transition-colors hover:bg-hover hover:text-text"
            >
              <Globe size={16} />
            </button>
            <button
              type="button"
              title="Abrir panel lateral"
              onClick={() => useApp.getState().toggleInspector()}
              className="grid h-8 w-8 place-items-center rounded-lg text-dim transition-colors hover:bg-hover hover:text-text"
            >
              <PanelRight size={16} />
            </button>
          </aside>
        )
      )}
      <AiSettingsDialog />
      <PropertiesDialog />
      <ConceptMapDialog />
      <StudyFoldersDialog />
      <EnglishAudioDialog />
    </div>
  );
}
