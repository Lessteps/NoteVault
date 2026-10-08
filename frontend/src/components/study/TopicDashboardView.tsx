import {
  Award,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Filter,
  GraduationCap,
  Layers,
  Play,
  RotateCcw,
  Search,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/bridge";
import type { TopicDashboardData, TopicDashboardItem, TopicManifest } from "../../lib/types";
import { useApp } from "../../store/app";
import { cn } from "../ui";
import { ExamRunnerModal } from "./ExamRunnerModal";
import { TopicConfiguratorDialog } from "./TopicConfiguratorDialog";
import { RouteBadge, RouteNow, RouteToggle, useRouteView } from "./RouteUi";
import { useRoute } from "../../store/mentorRoute";
import { shortWeekLabel, weekRangesOf } from "../../lib/planTime";

const SUBJECT_LABELS: Record<string, string> = {
  mathematics: "Matemáticas",
  programming: "Programación",
  english: "Inglés",
};

export function TopicDashboardView() {
  const openNote = useApp((s) => s.openNote);
  const toast = useApp((s) => s.toast);

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<TopicDashboardData | null>(null);

  // Filters
  const [selectedSubject, setSelectedSubject] = useState<string>("all");
  const [selectedArea, setSelectedArea] = useState<string>("all");
  const [selectedSkill, setSelectedSkill] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  // La ruta del Mentor: mapa carpeta → ruta (una vez por plan; ninguna tarjeta hace llamadas)
  const route = useRouteView();
  const sortByWeek = useRoute((s) => s.sortByWeek) && route.available;
  const routeInfo = route.available ? route.snap!.byFolder : null;

  // Modals
  const [examTopic, setExamTopic] = useState<{ folder: string; manifest: TopicManifest } | null>(null);
  const [configTopic, setConfigTopic] = useState<import("../../lib/types").TopicData | null>(null);

  // Expanded areas
  const [collapsedAreas, setCollapsedAreas] = useState<Record<string, boolean>>({});

  const retryRef = useRef(0);
  const retryTimer = useRef<number | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.studyTopicDashboard();
      if (res.loading) {
        if (retryRef.current < 40) {
          retryRef.current += 1;
          if (retryTimer.current) window.clearTimeout(retryTimer.current);
          retryTimer.current = window.setTimeout(() => void loadData(), 1500);
        }
        return;
      }
      retryRef.current = 0;
      setData(res);
      setLoading(false);
    } catch (err: any) {
      toast("error", err?.message || "Error al cargar panel de temas");
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(
    () => () => {
      if (retryTimer.current) window.clearTimeout(retryTimer.current);
    },
    [],
  );

  // Derived unique skills across loaded topics
  const allSkills = useMemo(() => {
    if (!data) return [];
    const set = new Set<string>();
    for (const t of data.topics) {
      for (const s of t.manifest.skills) {
        set.add(s);
      }
    }
    return Array.from(set).sort();
  }, [data]);

  // Filtered topics
  const filteredTopics = useMemo(() => {
    if (!data) return [];
    return data.topics.filter((item) => {
      if (selectedSubject !== "all" && item.subject.toLowerCase() !== selectedSubject.toLowerCase()) {
        return false;
      }
      if (selectedArea !== "all" && item.area !== selectedArea) {
        return false;
      }
      if (selectedSkill !== "all" && !item.manifest.skills.includes(selectedSkill)) {
        return false;
      }
      // «Solo mi ruta»: los temas core/optional del plan (los fuera de ruta se ocultan, no se borran)
      if (route.only) {
        const r = routeInfo?.get(item.folder);
        if (!r || r.route === "skipped") return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = item.manifest.title.toLowerCase().includes(q);
        const matchesArea = item.area.toLowerCase().includes(q);
        if (!matchesTitle && !matchesArea) return false;
      }
      return true;
    });
  }, [data, selectedSubject, selectedArea, selectedSkill, searchQuery, route.only, routeInfo]);

  // Grouped by area
  const groupedByArea = useMemo(() => {
    const map = new Map<string, TopicDashboardItem[]>();
    if (sortByWeek && routeInfo && route.snap) {
      // orden «por semana del plan»: una sección por semana (los temas sin ruta, al final)
      const ranges = weekRangesOf(route.snap.plan.start, route.snap.plan.end);
      const week = (t: TopicDashboardItem): number => routeInfo.get(t.folder)?.week ?? 9999;
      for (const t of [...filteredTopics].sort((a, b) => week(a) - week(b))) {
        const w = week(t);
        const r = ranges[w - 1];
        const name = w === 9999 ? "Sin semana en el plan" : `Semana ${w}${r ? ` · ${shortWeekLabel(r.start, r.end)}` : ""}`;
        map.set(name, [...(map.get(name) ?? []), t]);
      }
      return map;
    }
    for (const t of filteredTopics) {
      const list = map.get(t.area) || [];
      list.push(t);
      map.set(t.area, list);
    }
    return map;
  }, [filteredTopics, sortByWeek, routeInfo, route.snap]);

  // Global KPIs
  const stats = useMemo(() => {
    if (!data || data.topics.length === 0) {
      return { total: 0, completed: 0, avgPct: 0, examsPassed: 0 };
    }
    const total = data.topics.length;
    const completed = data.topics.filter((t) => t.progress.isComplete).length;
    const examsPassed = data.topics.filter((t) => t.progress.examPassed).length;
    const totalPct = data.topics.reduce((acc, t) => acc + t.progress.completenessPct, 0);
    const avgPct = Math.round(totalPct / total);
    return { total, completed, avgPct, examsPassed };
  }, [data]);

  const toggleArea = (area: string) => {
    setCollapsedAreas((prev) => ({ ...prev, [area]: !prev[area] }));
  };

  const handleOpenFolder = (folder: string) => {
    // Open a note inside this folder
    const target = `${folder}/_tema.md`;
    void openNote(target);
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-y-auto p-4 sm:p-6">
      {/* Top Header & Overview */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-[18px] font-bold text-ink">
            <GraduationCap className="text-accent-text" size={22} />
            Panel General de Dominio y Temas
          </h2>
          <p className="text-[12.5px] text-faint">
            Progreso agregado por área y competencias alcanzadas en el vault
          </p>
        </div>

        <button
          type="button"
          onClick={loadData}
          className="flex items-center gap-1.5 rounded-lg border border-line bg-card px-3 py-1.5 text-[12px] font-medium text-dim hover:text-ink"
        >
          <RotateCcw size={12} /> Actualizar
        </button>
      </div>

      {/* Qué estudiar ahora: los temas exactos de tu ruta (no todo el catálogo) */}
      <RouteNow className="mb-5" onOpen={handleOpenFolder} />

      {/* KPI Cards */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-line bg-card p-3">
          <div className="flex items-center justify-between text-faint">
            <span className="font-mono text-[10px] uppercase tracking-wider">Total Temas</span>
            <Layers size={14} />
          </div>
          <div className="mt-1 text-[20px] font-bold text-ink">{stats.total}</div>
        </div>

        <div className="rounded-xl border border-line bg-card p-3">
          <div className="flex items-center justify-between text-faint">
            <span className="font-mono text-[10px] uppercase tracking-wider">Temas Dominados</span>
            <CheckCircle2 size={14} className="text-mint" />
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-[20px] font-bold text-mint">{stats.completed}</span>
            <span className="text-[11px] text-faint">/ {stats.total}</span>
          </div>
        </div>

        <div className="rounded-xl border border-line bg-card p-3">
          <div className="flex items-center justify-between text-faint">
            <span className="font-mono text-[10px] uppercase tracking-wider">Completitud Media</span>
            <Sparkles size={14} className="text-accent-text" />
          </div>
          <div className="mt-1 text-[20px] font-bold text-accent-text">{stats.avgPct}%</div>
        </div>

        <div className="rounded-xl border border-line bg-card p-3">
          <div className="flex items-center justify-between text-faint">
            <span className="font-mono text-[10px] uppercase tracking-wider">Exámenes Aprobados</span>
            <Award size={14} className="text-warn" />
          </div>
          <div className="mt-1 text-[20px] font-bold text-ink">{stats.examsPassed}</div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="mb-5 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-card p-2.5">
        {/* Subject pills */}
        <div className="flex items-center gap-1 border-r border-line pr-2">
          {["all", "mathematics", "programming", "english"].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setSelectedSubject(s);
                setSelectedArea("all");
              }}
              className={cn(
                "rounded-lg px-2.5 py-1 text-[11.5px] font-semibold transition-colors",
                selectedSubject === s
                  ? "bg-accent text-white"
                  : "text-dim hover:bg-panel hover:text-ink",
              )}
            >
              {s === "all" ? "Todos" : SUBJECT_LABELS[s] || s}
            </button>
          ))}
        </div>

        {/* Area dropdown */}
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-faint">Área:</span>
          <select
            value={selectedArea}
            onChange={(e) => setSelectedArea(e.target.value)}
            className="rounded-lg border border-line bg-panel px-2 py-1 text-[11.5px] text-ink focus:border-accent focus:outline-none"
          >
            <option value="all">Todas las áreas</option>
            {data?.areas.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>

        {/* Skill dropdown */}
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-faint">Skill:</span>
          <select
            value={selectedSkill}
            onChange={(e) => setSelectedSkill(e.target.value)}
            className="rounded-lg border border-line bg-panel px-2 py-1 text-[11.5px] text-ink focus:border-accent focus:outline-none"
          >
            <option value="all">Todas las skills</option>
            {allSkills.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <RouteToggle showSort className="basis-full" />

        {/* Search Input */}
        <div className="ml-auto flex items-center gap-1 rounded-lg border border-line bg-panel px-2 py-1">
          <Search size={12} className="text-faint" />
          <input
            type="text"
            placeholder="Buscar tema..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-32 bg-transparent text-[11.5px] text-ink placeholder:text-faint focus:outline-none sm:w-44"
          />
        </div>
      </div>

      {/* Main Topic List Grouped By Area */}
      {loading ? (
        <div className="py-12 text-center text-[13px] text-faint">
          Cargando temas y competencias...
        </div>
      ) : groupedByArea.size === 0 ? (
        <div className="rounded-2xl border border-dashed border-line p-8 text-center text-dim">
          <Filter className="mx-auto mb-2 text-faint" size={24} />
          <p className="text-[13px]">No se encontraron temas con los filtros aplicados.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {Array.from(groupedByArea.entries()).map(([area, topics]) => {
            const isCollapsed = Boolean(collapsedAreas[area]);
            const completedInArea = topics.filter((t) => t.progress.isComplete).length;
            const areaAvgPct = Math.round(
              topics.reduce((acc, t) => acc + t.progress.completenessPct, 0) / topics.length,
            );

            return (
              <div
                key={area}
                className="overflow-hidden rounded-2xl border border-line-strong bg-card"
              >
                {/* Area Header Bar */}
                <button
                  type="button"
                  onClick={() => toggleArea(area)}
                  className="flex w-full items-center justify-between border-b border-line bg-panel/60 px-4 py-3 text-left hover:bg-panel"
                >
                  <div className="flex items-center gap-2">
                    {isCollapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                    <h3 className="text-[14px] font-bold text-ink">{area}</h3>
                    <span className="font-mono text-[11px] text-faint">
                      ({topics.length} temas)
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="hidden items-center gap-2 sm:flex">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-panel">
                        <div
                          className="h-full bg-accent transition-all"
                          style={{ width: `${areaAvgPct}%` }}
                        />
                      </div>
                      <span className="font-mono text-[11px] font-semibold text-dim">
                        {areaAvgPct}%
                      </span>
                    </div>

                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10.5px] font-semibold",
                        completedInArea === topics.length
                          ? "bg-mint-soft text-mint border border-mint/30"
                          : "bg-panel text-dim border border-line",
                      )}
                    >
                      {completedInArea} / {topics.length} dominados
                    </span>
                  </div>
                </button>

                {/* Topics Grid inside Area */}
                {!isCollapsed && (
                  <div className="grid grid-cols-1 divide-y divide-line lg:grid-cols-2 lg:divide-x lg:divide-y-0">
                    {topics.map((t) => {
                      const p = t.progress;
                      const ri = routeInfo?.get(t.folder);
                      return (
                        <div
                          key={t.folder}
                          className={cn("flex flex-col justify-between p-4 transition-colors hover:bg-panel/30", ri?.route === "skipped" && "opacity-60")}
                          data-route={ri?.route}
                        >
                          <div>
                            {/* Card Header */}
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <h4 className="text-[13.5px] font-bold text-ink hover:text-accent-text cursor-pointer"
                                  onClick={() => handleOpenFolder(t.folder)}>
                                  {t.manifest.title}
                                </h4>
                                <div className="mt-0.5 text-[11px] text-faint">
                                  {t.folder}
                                </div>
                                {ri && <RouteBadge info={ri} preview={route.preview} className="mt-1" />}
                              </div>

                              <span
                                className={cn(
                                  "rounded-full px-2 py-0.5 text-[10.5px] font-semibold whitespace-nowrap",
                                  p.isComplete
                                    ? "bg-mint-soft text-mint border border-mint/40"
                                    : "bg-panel text-dim border border-line",
                                )}
                              >
                                {p.isComplete ? "✓ Dominado" : `${p.completenessPct}%`}
                              </span>
                            </div>

                            {/* Completeness bar */}
                            <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-panel">
                              <div
                                className={cn(
                                  "h-full transition-all duration-300",
                                  p.isComplete ? "bg-mint" : "bg-accent",
                                )}
                                style={{ width: `${p.completenessPct}%` }}
                              />
                            </div>

                            {/* Exam Status Pill */}
                            <div className="mt-3 flex items-center justify-between text-[11px]">
                              <span className="text-faint">
                                Req: Dif {t.manifest.mastery.target_difficulty} (min {t.manifest.mastery.min_per_skill}/skill)
                              </span>
                              {t.manifest.mastery.exam === "required" ? (
                                <span
                                  className={cn(
                                    "flex items-center gap-1 font-medium",
                                    p.examPassed ? "text-mint" : "text-warn",
                                  )}
                                >
                                  <Award size={11} />
                                  {p.examPassed
                                    ? `Examen aprobado (${p.examScore}/100)`
                                    : "Examen pendiente"}
                                </span>
                              ) : (
                                <span className="text-faint">Sin examen</span>
                              )}
                            </div>

                            {/* Skills Matrix Badges */}
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {t.manifest.skills.map((skillId) => {
                                const sp = p.skills[skillId];
                                const stars = sp
                                  ? sp.highestPassedDifficulty === 3
                                    ? "★★★"
                                    : sp.highestPassedDifficulty === 2
                                      ? "★★"
                                      : sp.highestPassedDifficulty === 1
                                        ? "★"
                                        : "—"
                                  : "—";

                                const isMastered = sp?.mastered;
                                const isConsolidated = sp?.consolidated;

                                return (
                                  <span
                                    key={skillId}
                                    title={`${sp?.label || skillId}: ${sp?.totalPasses || 0} pases, mejor dificultad ${sp?.highestPassedDifficulty || 0}`}
                                    className={cn(
                                      "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-mono",
                                      isMastered
                                        ? "bg-mint-soft text-mint border border-mint/30"
                                        : isConsolidated
                                          ? "bg-info-soft text-info border border-info/30"
                                          : sp && sp.totalAttempts > 0
                                            ? "bg-warn-soft text-warn border border-warn/30"
                                            : "bg-panel text-faint border border-line",
                                    )}
                                  >
                                    <span>{sp?.label || skillId}</span>
                                    <span className="text-[9px] opacity-80">{stars}</span>
                                  </span>
                                );
                              })}
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div className="mt-4 flex items-center justify-end gap-2 border-t border-line/50 pt-2.5">
                            <button
                              type="button"
                              onClick={() => handleOpenFolder(t.folder)}
                              className="flex items-center gap-1 rounded-lg border border-line bg-card px-2.5 py-1 text-[11px] font-medium text-dim hover:text-ink"
                            >
                              <BookOpen size={11} /> Ver tema
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                setConfigTopic({
                                  is_topic: true,
                                  folder: t.folder,
                                  topic: t.manifest,
                                  progress: t.progress,
                                })
                              }
                              className="flex items-center gap-1 rounded-lg bg-accent/90 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-accent"
                            >
                              <Play size={11} /> Practicar
                            </button>

                            {t.manifest.mastery.exam === "required" && (
                              <button
                                type="button"
                                onClick={() =>
                                  setExamTopic({ folder: t.folder, manifest: t.manifest })
                                }
                                className={cn(
                                  "flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors",
                                  p.examPassed
                                    ? "border-mint/30 bg-mint-soft text-mint hover:bg-mint/20"
                                    : "border-warn/40 bg-warn-soft text-warn hover:bg-warn/20",
                                )}
                              >
                                <Award size={11} /> Examen
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      {examTopic && (
        <ExamRunnerModal
          topicFolder={examTopic.folder}
          manifest={examTopic.manifest}
          onClose={() => setExamTopic(null)}
          onExamFinished={() => {
            setExamTopic(null);
            void loadData();
          }}
        />
      )}

      {configTopic && (
        <TopicConfiguratorDialog
          topicData={configTopic}
          onClose={() => setConfigTopic(null)}
          onStarted={(firstPath) => {
            setConfigTopic(null);
            if (firstPath) {
              void openNote(firstPath);
              useApp.getState().setMode("read");
            }
          }}
        />
      )}
    </div>
  );
}
