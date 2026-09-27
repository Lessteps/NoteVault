// The `type: resumen` view file: the overview of an area (or of the whole
// subject). It aggregates what the practice model already knows — per topic,
// skill and difficulty — and offers a session that draws from every topic of
// the area. Nothing is recomputed here: `study_topic_dashboard` gives the
// per-topic progress and `lib/areaOverview.ts` folds it.

import { AlertTriangle, BarChart3, ExternalLink, Play, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../lib/bridge";
import { aggregateArea, folderInScope } from "../../lib/areaOverview";
import type { TopicDashboardData } from "../../lib/types";
import { useApp, type OpenNote } from "../../store/app";
import { BarList, Donut } from "../common/charts";
import { cn } from "../ui";
import { useStudyVersion } from "./StudyPanel";

const MATH_SKILLS: Array<[string, string]> = [
  ["solve", "Problema"],
  ["process", "Procedimiento guiado"],
  ["prove", "Demostración"],
  ["counterexample", "Contraejemplo"],
  ["true_false", "Verdadero o falso"],
  ["find_error", "Encontrar el error"],
  ["drill", "Cálculo rápido"],
  ["explain", "Explicar (Feynman)"],
];

const DIFFICULTY_LABEL: Record<number, string> = { 1: "Principiante", 2: "Intermedio", 3: "Avanzado" };

export function ResumenView({ note }: { note: OpenNote }) {
  const toast = useApp((s) => s.toast);
  const openNote = useApp((s) => s.openNote);
  const version = useStudyVersion((s) => s.v);

  const scope = String(note.frontmatter?.scope ?? "").trim().replace(/\\/g, "/");
  const subject = String(note.frontmatter?.subject ?? "mathematics").trim() || "mathematics";

  const [data, setData] = useState<TopicDashboardData | null>(null);
  const [errors, setErrors] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [skill, setSkill] = useState("solve");
  const [difficulty, setDifficulty] = useState(2);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [dash, digest] = await Promise.all([
        api.studyTopicDashboard(scope ? undefined : subject).catch(() => null),
        api.studyErrorDigest().catch(() => null),
      ]);
      setData(dash);
      setErrors(digest?.text ?? "");
    } finally {
      setLoading(false);
    }
  }, [scope, subject]);

  useEffect(() => {
    void refresh();
  }, [refresh, version]);

  const scoped = useMemo(
    () => (data?.topics ?? []).filter((t) => folderInScope(t.folder, scope)),
    [data, scope],
  );
  const area = useMemo(() => aggregateArea(scoped), [scoped]);

  /** Opens a topic's practice view, creating it when the folder has none. */
  const openTopicView = async (folder: string) => {
    try {
      const res = await api.studyViewEnsure(folder);
      if (!res.ok) {
        toast("error", "No se pudo crear la vista de ese tema.");
        return;
      }
      await openNote(res.path);
      useApp.getState().setMode("read");
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };

  const practiseArea = async () => {
    setBusy(true);
    try {
      const res = await api.studyAreaSessionBuild(scope, skill, difficulty, "6-10", "no_help");
      if (!res.ok || !res.first_exercise) {
        toast("error", "No hay ejercicios de ese tipo en esta área todavía.");
        return;
      }
      await openNote(res.first_exercise);
      useApp.getState().setMode("read");
      toast("info", `Práctica del área: ${res.exercises.length} ejercicios.`);
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const skillPalette = ["var(--nv-mint)", "var(--nv-accent)", "var(--nv-warn)", "var(--nv-info)"];
  const skillDonut = area.skills.map((s, i) => ({
    name: `${s.label}: ${s.passes} aprobados de ${s.attempts}`,
    value: s.passes,
    colour: skillPalette[i % skillPalette.length]!,
  }));
  const difficultyDonut = area.difficulties.map((d) => ({
    name: `${DIFFICULTY_LABEL[d.difficulty]}: ${d.passes}/${d.attempts}`,
    value: d.passes,
    colour: d.difficulty === 1 ? "var(--nv-mint)" : d.difficulty === 2 ? "var(--nv-warn)" : "var(--nv-danger)",
  }));

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <header className="flex flex-none flex-wrap items-center gap-3 border-b border-line px-5 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-accent-text">
            <BarChart3 size={12} /> {scope ? "Resumen del área" : "Resumen de la asignatura"}
          </div>
          <h1 className="truncate text-[16px] font-bold text-text" title={scope || subject}>
            {note.title}
          </h1>
        </div>
        <Stat label="Temas" value={`${area.completed}/${area.topics}`} hint="completados" />
        <Stat label="Progreso" value={`${area.pct}%`} hint="del área" />
        <Stat label="Aprobados" value={`${area.passes}/${area.attempts}`} hint="ejercicios" />
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

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {!data ? (
          <p className="text-[13px] text-faint">{loading ? "Cargando el resumen…" : "No se pudo leer el progreso."}</p>
        ) : area.topics === 0 ? (
          <p className="text-[13px] text-faint">Esta área todavía no tiene temas con ejercicios registrados.</p>
        ) : (
          <div className="mx-auto grid w-full max-w-[1100px] gap-5 lg:grid-cols-2">
            {/* Charts */}
            <Card title="Competencias del área">
              <div className="flex flex-wrap items-center gap-5">
                <Donut parts={skillDonut} label={`${area.passes}`} size={140} />
                <div className="min-w-[220px] flex-1">
                  <BarList
                    rows={area.skills.map((s) => ({
                      label: s.label,
                      value: s.passes,
                      hint: `${s.passes}/${s.attempts} · ${s.mastered}/${s.topics} temas`,
                    }))}
                  />
                </div>
              </div>
            </Card>

            <Card title="Por dificultad">
              <div className="flex flex-wrap items-center gap-5">
                <Donut parts={difficultyDonut} label={`${area.topics}`} size={140} />
                <div className="min-w-[220px] flex-1">
                  <BarList
                    rows={area.difficulties.map((d) => ({
                      label: DIFFICULTY_LABEL[d.difficulty]!,
                      value: d.passes,
                      hint: `${d.passes}/${d.attempts}`,
                      colour: d.difficulty === 1 ? "var(--nv-mint)" : d.difficulty === 2 ? "var(--nv-warn)" : "var(--nv-danger)",
                    }))}
                  />
                </div>
              </div>
            </Card>

            {/* Progression */}
            <Card title={`Progresión por tema (${area.started} en marcha)`} className="lg:col-span-2">
              <ul className="divide-y divide-line">
                {area.topicRows.map((t) => (
                  <li key={t.folder} className="flex items-center gap-3 py-2">
                    <button
                      type="button"
                      onClick={() => void openTopicView(t.folder)}
                      title={t.folder}
                      className="min-w-0 flex-1 truncate text-left text-[12.5px] text-text hover:text-accent-text"
                    >
                      {t.title}
                    </button>
                    <span className="hidden flex-none font-mono text-[11px] text-faint sm:inline">
                      {t.passes}/{t.attempts}
                    </span>
                    <span className="h-2 w-40 flex-none overflow-hidden rounded-full bg-elevated">
                      <span
                        className={cn("block h-full rounded-full", t.completed ? "bg-mint" : "bg-accent")}
                        style={{ width: `${Math.max(0, Math.min(100, t.pct))}%` }}
                      />
                    </span>
                    <span className="w-10 flex-none text-right font-mono text-[11px] text-dim">{t.pct}%</span>
                    <button
                      type="button"
                      title="Abrir la práctica del tema"
                      aria-label={`Abrir la práctica de ${t.title}`}
                      onClick={() => void openTopicView(t.folder)}
                      className="grid h-6 w-6 flex-none place-items-center rounded text-faint hover:bg-hover hover:text-text"
                    >
                      <ExternalLink size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            </Card>

            {/* Practise the whole area */}
            <Card
              title="Practicar el área"
              subtitle="Una sesión con los ejercicios de todos los temas del área."
              actions={<Play size={14} className="text-mint" />}
            >
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1 text-[11px] text-faint">
                  Competencia
                  <select
                    value={skill}
                    onChange={(e) => setSkill(e.target.value)}
                    className="rounded-lg border border-line bg-panel px-2 py-1.5 text-[12.5px] text-text"
                  >
                    {MATH_SKILLS.map(([id, label]) => (
                      <option key={id} value={id}>{label}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-[11px] text-faint">
                  Dificultad
                  <select
                    value={difficulty}
                    onChange={(e) => setDifficulty(Number(e.target.value))}
                    className="rounded-lg border border-line bg-panel px-2 py-1.5 text-[12.5px] text-text"
                  >
                    {[1, 2, 3].map((d) => (
                      <option key={d} value={d}>{DIFFICULTY_LABEL[d]}</option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void practiseArea()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[12.5px] font-semibold text-white hover:bg-accent-strong disabled:opacity-50"
                >
                  <Play size={14} /> {busy ? "Preparando…" : "Empezar"}
                </button>
              </div>
            </Card>

            {/* Common errors */}
            {errors && (
              <Card title="Errores comunes" actions={<AlertTriangle size={14} className="text-warn" />}>
                <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap font-mono text-[11.5px] text-dim">
                  {errors}
                </pre>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="flex-none rounded-lg border border-line bg-panel px-3 py-1.5 text-center" title={hint}>
      <div className="font-mono text-[10px] uppercase tracking-wider text-faint">{label}</div>
      <div className="text-[14px] font-semibold text-text">{value}</div>
    </div>
  );
}

function Card({
  title,
  subtitle,
  actions,
  className,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("rounded-xl border border-line bg-panel p-4", className)}>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-[13px] font-semibold text-text">{title}</h2>
        {actions}
        {subtitle && <span className="ml-auto text-[11px] text-faint">{subtitle}</span>}
      </div>
      {children}
    </section>
  );
}
