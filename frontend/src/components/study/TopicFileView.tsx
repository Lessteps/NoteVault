// The `type: practica` view file: the practice surface of a topic folder.
//
// It is a *file* (so the explorer shows something meaningful and the folder has
// an entry point) but it renders the topic's own interface in a full-screen tab:
// **Resumen** — the skill × difficulty matrix and the topic's completeness — and
// **Practicar** — the configurator (competencia, dificultad, cantidad, ayuda).
// The practice engine itself is untouched: a session is started exactly the way
// the right panel used to start it (`studyTopicSessionBuild` → first exercise).

import { AlertTriangle, BarChart3, ListChecks, RefreshCw, Sparkles } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/bridge";
import type { StudySnapshot, TopicData } from "../../lib/types";
import { useApp, type OpenNote } from "../../store/app";
import { cn } from "../ui";
import { useStudyVersion } from "./StudyPanel";
import { TopicConfiguratorDialog } from "./TopicConfiguratorDialog";
import { TopicGeneralView } from "./TopicGeneralView";

type Tab = "resumen" | "practicar";

export function TopicFileView({ note }: { note: OpenNote }) {
  const toast = useApp((s) => s.toast);
  const openNote = useApp((s) => s.openNote);
  const setMode = useApp((s) => s.setMode);
  const version = useStudyVersion((s) => s.v);

  const [tab, setTab] = useState<Tab>("resumen");
  const [topicData, setTopicData] = useState<TopicData | null>(null);
  const [snap, setSnap] = useState<StudySnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [t, s] = await Promise.all([
        api.studyTopicGet(note.path),
        api.studySnapshot(note.path).catch(() => null),
      ]);
      setTopicData(t);
      setSnap(s);
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [note.path, toast]);

  useEffect(() => {
    void refresh();
  }, [refresh, version]);

  /** Same contract as the old study panel: opening an exercise runs the session. */
  const practice = (rel: string) => {
    void openNote(rel);
    setMode("read");
  };

  const pct = topicData?.progress?.completenessPct;
  const title = topicData?.topic?.title ?? note.title;

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <header className="flex flex-none flex-wrap items-center gap-3 border-b border-line px-5 py-3">
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[10px] font-semibold uppercase tracking-wider text-accent-text">
            Práctica del tema
          </div>
          <h1 className="truncate text-[16px] font-bold text-text" title={note.path}>{title}</h1>
        </div>
        {pct !== undefined && <Completeness pct={pct} />}
        <div className="flex items-center gap-1 rounded-lg border border-line bg-panel p-0.5" role="tablist" aria-label="Vista del tema">
          {([["resumen", "Resumen", BarChart3], ["practicar", "Practicar", ListChecks]] as const).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] transition-colors",
                tab === id ? "bg-accent-soft font-medium text-accent-text" : "text-dim hover:bg-hover hover:text-text",
              )}
            >
              <Icon size={14} strokeWidth={1.8} /> {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          title="Recargar"
          aria-label="Recargar"
          onClick={() => void refresh()}
          className="grid h-7 w-7 place-items-center rounded-md text-faint hover:bg-hover hover:text-text"
        >
          <RefreshCw size={14} className={cn(loading && "animate-spin")} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && !topicData ? (
          <p className="p-5 text-[13px] text-faint">Cargando el tema…</p>
        ) : !topicData?.is_topic ? (
          <NoTopic folder={topicData?.folder || ""} onConverted={refresh} />
        ) : tab === "resumen" ? (
          snap && topicData ? (
            <TopicGeneralView
              topicData={topicData}
              snap={snap}
              onOpenConfigurator={() => setTab("practicar")}
              onPractice={practice}
            />
          ) : (
            <p className="p-5 text-[13px] text-faint">No se pudo leer el progreso del tema.</p>
          )
        ) : (
          <div className="mx-auto w-full max-w-[760px] p-5">
            <TopicConfiguratorDialog topicData={topicData} inline onClose={() => setTab("resumen")} onStarted={practice} />
          </div>
        )}
      </div>
    </div>
  );
}

function Completeness({ pct }: { pct: number }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-line bg-panel px-3 py-1.5" title="Tema completado">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-mint" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
      </div>
      <span className="font-mono text-[11px] text-mint">{pct}%</span>
    </div>
  );
}

/** The folder has no topic manifest yet: offer to create one (`_tema`-free). */
function NoTopic({ folder, onConverted }: { folder: string; onConverted: () => Promise<void> }) {
  const toast = useApp((s) => s.toast);
  const [busy, setBusy] = useState(false);
  return (
    <div className="grid place-items-center p-8">
      <div className="max-w-md text-center">
        <AlertTriangle size={22} className="mx-auto text-warn" />
        <p className="mt-2 text-[13px] text-dim">
          Esta carpeta ({folder || "?"}) no es todavía un tema, así que no hay progreso que mostrar.
        </p>
        <button
          type="button"
          disabled={busy || !folder}
          onClick={() => {
            setBusy(true);
            void api.studyTopicConvert(folder)
              .then(() => { toast("info", "Tema creado."); return onConverted(); })
              .catch((e: Error) => toast("error", e.message))
              .finally(() => setBusy(false));
          }}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-accent-strong disabled:opacity-50"
        >
          <Sparkles size={14} /> Convertir en tema
        </button>
      </div>
    </div>
  );
}
