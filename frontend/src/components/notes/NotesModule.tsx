import { useEffect, useRef, useState } from "react";
import { useApp } from "../../store/app";
import { EditorArea } from "./EditorArea";
import { Explorer } from "./Explorer";
import { Inspector } from "./Inspector";
import { AiSettingsDialog, AssistantPanel } from "./AssistantPanel";
import { EnglishAudioDialog } from "./EnglishAudio";
import { PropertiesDialog } from "./PropertiesDialog";
import { useAssistant } from "../../store/assistant";

const WIDTH_KEY = "nv.explorer.width";

export function NotesModule() {
  const explorerOpen = useApp((s) => s.explorerOpen);
  const inspectorOpen = useApp((s) => s.inspectorOpen);
  const assistantOpen = useAssistant((s) => s.open);
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
      <EditorArea />
      {assistantOpen ? <AssistantPanel /> : inspectorOpen && <Inspector />}
      <AiSettingsDialog />
      <PropertiesDialog />
      <EnglishAudioDialog />
    </div>
  );
}
