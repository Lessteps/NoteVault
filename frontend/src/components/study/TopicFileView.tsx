// The `type: practica` view file: the practice surface of a topic folder.
//
// It is a *file* (so the explorer shows something meaningful and the folder has
// an entry point) but it renders the topic's own interface in a full-screen tab:
// **Resumen** — the skill × difficulty matrix and the topic's completeness — and
// **Practicar** — the configurator (competencia, dificultad, cantidad, ayuda).
// The practice engine itself is untouched: a session is started exactly the way
// the right panel used to start it (`studyTopicSessionBuild` → first exercise).

import { AlertTriangle, BarChart3, CheckCircle2, Play, RefreshCw, Sparkles } from "lucide-react";
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
  const [configSkill, setConfigSkill] = useState<string | undefined>(undefined);

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

  /** The row's own "Practicar" opens the configurator with that skill selected. */
  const openConfigurator = (skill?: string) => {
    setConfigSkill(skill);
    setTab("practicar");
  };

  // "Espacio para practicar": the hint at the bottom is real, and it stays out of
  // the way while typing or while a dialog (exam, configurator…) is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (tab !== "resumen") return;
      e.preventDefault();
      openConfigurator();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const fullTitle = topicData?.topic?.title ?? note.title;
  const numbered = /^(\d+(?:\.\d+)*)\s+(.+)$/.exec(fullTitle);
  const number = numbered?.[1] ?? "";
  const title = numbered?.[2] ?? fullTitle;
  const srsDue = snap?.queue.counts.srs_exercises ?? 0;
  const subjectTitle = snap?.area?.subject_title ?? "";
  const initials =
    subjectTitle
      .split(/\s+/)
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "NV";

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <header className="flex flex-none flex-col gap-2 border-b border-line px-5 pb-3 pt-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent-soft px-2.5 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-wider text-accent-text">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" /> Práctica del tema
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-wider",
              srsDue ? "border-warn/40 bg-warn-soft text-warn" : "border-mint/40 bg-mint-soft text-mint",
            )}
          >
            <CheckCircle2 size={11} /> {srsDue ? `${srsDue} repasos pendientes` : "SRS al día"}
          </span>

          <div className="ml-auto flex items-center gap-2">
            <div
              className="flex items-center gap-1 rounded-full border border-line bg-panel p-0.5"
              role="tablist"
              aria-label="Vista del tema"
            >
              {([["resumen", "Resumen", BarChart3], ["practicar", "Practicar tema", Play]] as const).map(
                ([id, label, Icon]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={tab === id}
                    onClick={() => setTab(id)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
                      tab === id
                        ? "bg-accent text-white shadow-sm"
                        : "text-dim hover:bg-hover hover:text-text",
                    )}
                  >
                    <Icon size={13} strokeWidth={2} /> {label}
                  </button>
                ),
              )}
            </div>
            <button
              type="button"
              title="Recargar"
              aria-label="Recargar"
              onClick={() => void refresh()}
              className="grid h-8 w-8 place-items-center rounded-full border border-line bg-panel text-faint transition-colors hover:text-text"
            >
              <RefreshCw size={13} className={cn(loading && "animate-spin")} />
            </button>
            <span
              title={subjectTitle || "Vault"}
              className="grid h-8 w-8 place-items-center rounded-full bg-accent text-[10.5px] font-bold text-white"
            >
              {initials}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-baseline gap-2">
          {number && <span className="font-mono text-[15px] font-semibold text-faint">{number}</span>}
          <h1 className="truncate text-[22px] font-bold leading-tight text-text" title={note.path}>
            {title}
          </h1>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {loading && !topicData ? (
          <p className="p-5 text-[13px] text-faint">Cargando el tema…</p>
        ) : !topicData?.is_topic ? (
          <NoTopic folder={topicData?.folder || ""} onConverted={refresh} />
        ) : tab === "resumen" ? (
          snap && topicData ? (
            <TopicGeneralView
              topicData={topicData}
              snap={snap}
              onOpenConfigurator={openConfigurator}
              onPractice={practice}
            />
          ) : (
            <p className="p-5 text-[13px] text-faint">No se pudo leer el progreso del tema.</p>
          )
        ) : (
          <div className="mx-auto w-full max-w-[980px] p-5">
            <TopicConfiguratorDialog
              topicData={topicData}
              inline
              initialSkill={configSkill}
              onClose={() => setTab("resumen")}
              onStarted={practice}
            />
          </div>
        )}
      </div>
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
