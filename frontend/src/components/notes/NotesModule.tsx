import { useEffect, useRef, useState } from "react";
import { useApp } from "../../store/app";
import { EditorArea } from "./EditorArea";
import { Explorer } from "./Explorer";
import { EnglishAudioDialog } from "./EnglishAudio";
import { PropertiesDialog } from "./PropertiesDialog";
import { useCanvas } from "../../store/canvas";
import { CanvasView } from "../canvas/CanvasView";
import { ConceptMapDialog } from "../canvas/ConceptMapDialog";
import { StudyFoldersDialog } from "../study/StudyFoldersDialog";
import { StudySpaceDialog } from "../study/StudySpaceDialog";
import { PracticeProjectDialog } from "../practice/PracticeProjectDialog";

const WIDTH_KEY = "nv.explorer.width";

export function NotesModule() {
  const explorerOpen = useApp((s) => s.explorerOpen);
  const canvasPath = useCanvas((s) => s.path);
  const openCanvas = useCanvas((s) => s.open);
  const closeCanvas = useCanvas((s) => s.close);
  // The view follows the active tab: a canvas tab loads its board, and moving to
  // any other tab leaves the canvas.
  const activeCanvas = useApp((s) => {
    const t = s.openTabs.find((x) => x.tabId === s.activeTabId);
    return t?.kind === "canvas" ? t.path : null;
  });
  const [width, setWidth] = useState(() => Number(localStorage.getItem(WIDTH_KEY)) || 290);
  const drag = useRef<{ x: number; w: number } | null>(null);

  useEffect(() => {
    if (activeCanvas === canvasPath) return;
    if (activeCanvas) void openCanvas(activeCanvas);
    else if (canvasPath) void closeCanvas();
  }, [activeCanvas, canvasPath, openCanvas, closeCanvas]);

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
      {/* El panel derecho vive en el armazón: es el mismo en todas las
          funcionalidades. */}
      <PropertiesDialog />
      <ConceptMapDialog />
      <StudyFoldersDialog />
      <StudySpaceDialog />
      <PracticeProjectDialog />
      <EnglishAudioDialog />
    </div>
  );
}
