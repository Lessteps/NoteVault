// Repaso: the right-panel face that shows the spaced-repetition schedule of the
// study area the open note belongs to. Opened from the launcher strip, right
// below "Esquema de la nota".

import { CalendarClock, RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { create } from "zustand";
import { api } from "../../lib/bridge";
import type { StudySnapshot } from "../../lib/types";
import { useApp } from "../../store/app";
import { IconButton } from "../ui";
import { SrsCalendarView } from "./SrsCalendarView";
import { useStudyVersion } from "./StudyPanel";

export const useReviewPanel = create<{ open: boolean; setOpen: (v: boolean) => void }>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));

export function ReviewPanel() {
  const active = useApp((s) => s.active);
  const version = useStudyVersion((s) => s.v);
  const setOpen = useReviewPanel((s) => s.setOpen);
  const [snap, setSnap] = useState<StudySnapshot | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!active) {
      setSnap(null);
      setError("Abre una nota de una materia para ver su repaso.");
      return;
    }
    setLoading(true);
    try {
      setSnap(await api.studySnapshot(active));
      setError("");
    } catch (e) {
      setSnap(null);
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [active]);

  useEffect(() => {
    void refresh();
  }, [refresh, version]);

  return (
    <aside className="flex h-full w-[320px] flex-none flex-col border-l border-line bg-panel" aria-label="Repaso">
      <div className="flex h-9 flex-none items-center gap-2 border-b border-line px-3">
        <CalendarClock size={14} className="text-accent-text" />
        <span className="text-[12px] font-semibold text-text">Repaso</span>
        {snap && <span className="truncate text-[11px] text-faint">{snap.area.title}</span>}
        <div className="flex-1" />
        <IconButton title="Recargar" onClick={() => void refresh()}>
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
        </IconButton>
        <IconButton title="Cerrar" onClick={() => setOpen(false)}>
          <X size={14} />
        </IconButton>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {error ? <p className="text-[12px] text-faint">{error}</p> : snap ? <SrsCalendarView snap={snap} /> : null}
      </div>
    </aside>
  );
}
