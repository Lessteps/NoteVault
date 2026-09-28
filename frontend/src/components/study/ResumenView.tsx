// The `type: resumen` view file: the completion dashboard of a subject or an area.
//
// It is deliberately *not* a competency matrix (that belongs to the topic view):
// here each internal area — and, when an area is opened, each of its topics —
// gets its own completion ring, and every card expands down to the per-topic
// skill rings and what is still missing. All numbers come from the practice
// engine's own progress (`studyTopicDashboard`).

import { AlertTriangle, ChevronDown, ChevronRight, Play, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../lib/bridge";
import {
  aggregateArea,
  folderInScope,
  groupTopics,
  missingOf,
  skillRings,
  topicPct,
  type OverviewGroup,
} from "../../lib/areaOverview";
import type { TopicDashboardData, TopicDashboardItem } from "../../lib/types";
import { useApp, type OpenNote } from "../../store/app";
import { Donut } from "../common/charts";
import { cn } from "../ui";
import { useStudyVersion } from "./StudyPanel";

const DIFFICULTY_COLOURS = ["var(--nv-mint)", "var(--nv-accent)", "var(--nv-info)"];
const DIFFICULTY_LABELS = ["★ Fácil", "★★ Med", "★★★ Dif"];

/** Green → amber → grey, so the ring reads at a glance. */
function ringColour(pct: number): string {
  if (pct >= 80) return "var(--nv-mint)";
  if (pct >= 40) return "var(--nv-accent)";
  if (pct > 0) return "var(--nv-warn)";
  return "var(--nv-line-strong)";
}

export function ResumenView({ note }: { note: OpenNote }) {
  const toast = useApp((s) => s.toast);
  const openNote = useApp((s) => s.openNote);
  const version = useStudyVersion((s) => s.v);
  const [data, setData] = useState<TopicDashboardData | null>(null);
  const [errors, setErrors] = useState("");
  const [loading, setLoading] = useState(true);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [openTopics, setOpenTopics] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  const scope = String(note.frontmatter?.scope ?? "").trim();
  const subject = String(note.frontmatter?.subject ?? "").trim();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.studyTopicDashboard(subject || undefined));
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [subject, toast]);

  useEffect(() => {
    void refresh();
  }, [refresh, version]);

  useEffect(() => {
    let live = true;
    api
      .studyErrorDigest()
      .then((res) => {
        if (live) setErrors(String(res?.text ?? ""));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [subject, version]);

  const topics = useMemo(
    () => (data?.topics ?? []).filter((t) => folderInScope(t.folder ?? "", scope)),
    [data, scope],
  );
  const stats = useMemo(() => aggregateArea(topics), [topics]);
  const groups = useMemo(() => groupTopics(topics, scope), [topics, scope]);

  const title = String(note.frontmatter?.title ?? note.title ?? "");
  const atSubjectRoot = groups.length > 0 && groups.some((g) => !g.isTopic);

  /** A topic's own view file holds its practice; open it (creating it if needed). */
  const openTopicView = async (item: TopicDashboardItem) => {
    try {
      const view = await api.studyViewEnsure(item.folder);
      if (view.ok && view.path) {
        await openNote(view.path);
        return;
      }
    } catch (e) {
      toast("error", (e as Error).message);
    }
    toast("info", "Ese tema todavía no tiene vista de práctica.");
  };

  const practiceArea = async () => {
    setBusy(true);
    try {
      const res = await api.studyAreaSessionBuild(scope, "solve", 2, "6-10", "no_help");
      if (res.ok && res.first_exercise) {
        await openNote(res.first_exercise);
        toast("info", `Sesión de ${res.exercises.length} ejercicio(s).`);
      } else {
        toast("info", "Esta área todavía no tiene ejercicios para practicar.");
      }
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-5 p-5">
      <header className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[10px] font-semibold uppercase tracking-wider text-accent-text">
            {atSubjectRoot ? "Resumen de la materia" : "Resumen del área"}
          </div>
          <h1 className="truncate text-[21px] font-bold leading-tight text-text" title={note.path}>
            {title}
          </h1>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void practiceArea()}
          className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-3.5 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-accent-strong disabled:opacity-50"
        >
          <Play size={13} /> Practicar el área
        </button>
        <button
          type="button"
          title="Recargar"
          aria-label="Recargar"
          onClick={() => void refresh()}
          className="grid h-8 w-8 place-items-center rounded-full border border-line bg-panel text-faint hover:text-text"
        >
          <RefreshCw size={13} className={cn(loading && "animate-spin")} />
        </button>
      </header>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Temas" value={`${stats.started}/${stats.topics}`} hint="iniciados" />
        <Kpi label="Progreso" value={`${stats.pct}%`} hint="dominio medio" />
        <Kpi
          label="Competencias"
          value={`${stats.skills.filter((s) => s.mastered > 0).length}/${stats.skills.length}`}
          hint="con dominio"
        />
        <Kpi label="Intentos" value={String(stats.attempts)} hint={`${stats.passes} aprobados`} />
      </div>

      {/* Completion rings: one per area (subject root) or per topic (area) */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[13px] font-bold uppercase tracking-wide text-text">
            {atSubjectRoot ? "Áreas" : "Temas"}
          </h2>
          <span className="text-[10.5px] text-faint">
            {groups.length} {atSubjectRoot ? "áreas" : "temas"} · cada tarjeta se abre para ver el detalle
          </span>
        </div>

        {loading && !data ? (
          <p className="mt-3 text-[13px] text-faint">Cargando el progreso…</p>
        ) : groups.length === 0 ? (
          <p className="mt-3 rounded-xl border border-line bg-panel px-3.5 py-3 text-[12px] text-faint">
            Esta parte de la materia todavía no tiene temas con ejercicios registrados.
          </p>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
            {groups.map((group) => (
              <GroupCard
                key={group.key}
                group={group}
                open={Boolean(openGroups[group.key])}
                onToggle={() => setOpenGroups((s) => ({ ...s, [group.key]: !s[group.key] }))}
                openTopics={openTopics}
                onToggleTopic={(folder) => setOpenTopics((s) => ({ ...s, [folder]: !s[folder] }))}
                onOpenTopicView={(item) => void openTopicView(item)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Difficulty breakdown of the scope (a ring, never a matrix) */}
      {stats.difficulties.some((d) => d.attempts > 0) && (
        <section className="rounded-2xl border border-line-strong bg-card p-4">
          <h2 className="text-[13px] font-bold uppercase tracking-wide text-text">Por dificultad</h2>
          <div className="mt-3 flex flex-wrap items-center gap-6">
            <Donut
              size={132}
              thickness={14}
              label={`${stats.passes}`}
              parts={stats.difficulties.map((d, i) => ({
                value: d.passes,
                colour: DIFFICULTY_COLOURS[i]!,
                name: `${DIFFICULTY_LABELS[i]}: ${d.passes}/${d.attempts}`,
              }))}
            />
            <div className="flex flex-col gap-1.5">
              {stats.difficulties.map((d, i) => (
                <div key={d.difficulty} className="flex items-center gap-2 text-[11.5px] text-dim">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: DIFFICULTY_COLOURS[i] }} />
                  <span className="w-[74px] text-text">{DIFFICULTY_LABELS[i]}</span>
                  <span className="font-mono">
                    {d.passes}/{d.attempts}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {errors.trim() && (
        <section className="rounded-2xl border border-warn/30 bg-warn-soft/40 p-4">
          <h2 className="text-[13px] font-bold uppercase tracking-wide text-warn">Errores frecuentes</h2>
          <pre className="mt-2 whitespace-pre-wrap font-sans text-[11.5px] leading-snug text-dim">{errors}</pre>
        </section>
      )}
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-line-strong bg-card px-3.5 py-3">
      <div className="font-mono text-[9.5px] font-semibold uppercase tracking-wider text-faint">{label}</div>
      <div className="mt-1 text-[19px] font-bold leading-none text-text">{value}</div>
      <div className="mt-1 text-[10.5px] text-faint">{hint}</div>
    </div>
  );
}

/** A card per area (or per topic) with its ring, and its detail when expanded. */
function GroupCard({
  group,
  open,
  onToggle,
  openTopics,
  onToggleTopic,
  onOpenTopicView,
}: {
  group: OverviewGroup;
  open: boolean;
  onToggle: () => void;
  openTopics: Record<string, boolean>;
  onToggleTopic: (folder: string) => void;
  onOpenTopicView: (item: TopicDashboardItem) => void;
}) {
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <div className="rounded-2xl border border-line-strong bg-card p-4">
      <div className="flex w-full items-center gap-3">
        <button type="button" onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-4 text-left">
          <Donut
            size={92}
            thickness={10}
            label={`${group.pct}%`}
            parts={[
              { value: group.pct, colour: ringColour(group.pct), name: "Progreso" },
              { value: 100 - group.pct, colour: "var(--nv-elevated)", name: "Pendiente" },
            ]}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-[14px] font-bold text-text" title={group.title}>
                {group.title}
              </h3>
              <Chevron size={15} className="flex-none text-faint" />
            </div>
            <div className="mt-0.5 text-[11px] text-faint">
              {group.isTopic
                ? group.topics[0]!.manifest.exam_group || "Tema"
                : `${group.topics.length} tema${group.topics.length === 1 ? "" : "s"}`}
              {group.mastered > 0 && <span className="text-mint"> · {group.mastered} dominado(s)</span>}
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {group.topics.slice(0, 4).map((t) => (
                <span
                  key={t.folder}
                  className="rounded-full border border-line bg-panel px-2 py-0.5 text-[10px] text-dim"
                  title={t.manifest.title}
                >
                  {t.manifest.title.split(" ")[0]} {topicPct(t)}%
                </span>
              ))}
              {group.topics.length > 4 && (
                <span className="rounded-full border border-line bg-panel px-2 py-0.5 text-[10px] text-dim">
                  +{group.topics.length - 4}
                </span>
              )}
            </div>
          </div>
        </button>
        {group.isTopic && (
          <button
            type="button"
            onClick={() => onOpenTopicView(group.topics[0]!)}
            className="flex-none rounded-lg border border-line bg-panel px-2.5 py-1 text-[11px] font-semibold text-text hover:border-accent"
          >
            Practicar
          </button>
        )}
      </div>

      {open && (
        <div className="mt-3 flex flex-col gap-2 border-t border-line pt-3">
          {group.topics.map((item) => (
            <TopicRow
              key={item.folder}
              item={item}
              open={Boolean(openTopics[item.folder])}
              onToggle={() => onToggleTopic(item.folder)}
              onOpenView={() => onOpenTopicView(item)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** A topic inside an area: its ring, and its per-skill rings when expanded. */
function TopicRow({
  item,
  open,
  onToggle,
  onOpenView,
}: {
  item: TopicDashboardItem;
  open: boolean;
  onToggle: () => void;
  onOpenView: () => void;
}) {
  const pct = topicPct(item);
  const rings = skillRings(item);
  const missing = missingOf(item);
  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <div className="rounded-xl border border-line bg-panel/60 px-3 py-2.5">
      <div className="flex items-center gap-3">
        <button type="button" onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <Donut
            size={54}
            thickness={7}
            parts={[
              { value: pct, colour: ringColour(pct), name: "Progreso" },
              { value: 100 - pct, colour: "var(--nv-elevated)", name: "Pendiente" },
            ]}
          />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-[12.5px] font-semibold text-text">{item.manifest.title}</span>
              <Chevron size={14} className="flex-none text-faint" />
            </div>
            <div className="text-[10.5px] text-faint">
              {pct}% · {item.progress?.exerciseNotesCount ?? 0} ejercicios
              {missing.length > 0 && <span className="text-warn"> · falta {missing.length} competencia(s)</span>}
            </div>
          </div>
        </button>
        <button
          type="button"
          onClick={onOpenView}
          className="flex-none rounded-lg border border-line bg-card px-2.5 py-1 text-[11px] font-semibold text-text hover:border-accent"
        >
          Practicar
        </button>
      </div>

      {open && (
        <div className="mt-2.5 border-t border-line pt-2.5">
          <div className="flex flex-wrap gap-3">
            {rings.map((ring) => (
              <div key={ring.skill} className="flex w-[132px] flex-col items-center gap-1" title={ring.description}>
                <Donut
                  size={58}
                  thickness={7}
                  label={`${ring.pct}%`}
                  parts={[
                    { value: ring.pct, colour: ringColour(ring.pct), name: ring.label },
                    { value: 100 - ring.pct, colour: "var(--nv-elevated)", name: "Pendiente" },
                  ]}
                />
                <div className="w-full truncate text-center text-[10.5px] font-semibold text-text">{ring.label}</div>
                <div className="text-center font-mono text-[9.5px] text-faint">
                  {ring.done}/{ring.required}
                </div>
              </div>
            ))}
          </div>
          {missing.length > 0 && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <AlertTriangle size={12} className="text-warn" />
              {missing.slice(0, 6).map((m) => (
                <span key={m} className="rounded-full border border-line bg-card px-2 py-0.5 text-[10px] text-dim">
                  {m}
                </span>
              ))}
              {missing.length > 6 && (
                <span className="text-[10px] text-faint">+{missing.length - 6} más</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
