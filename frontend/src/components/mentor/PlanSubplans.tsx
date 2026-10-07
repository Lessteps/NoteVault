// Mentor — Plan: las ÁREAS del plan (Backend, Frontend, Databases, Automation, Tooling and Quality)
// estructuradas en 3 bloques obligatorios:
//  1. Fundamentos y Lenguaje Aplicado (bases y lenguajes pertinentes a esta tecnología)
//  2. Conocimientos de Especialidad (subáreas / submetas estructuradas con su propio avance)
//  3. Programming Practice Enfocado (katas técnicas diarias del área + proyectos semanales + entregable)
//
// Funciona tanto para planes estructurados por áreas como para visualizar subplanes existentes.

import {
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Circle,
  Code2,
  Database,
  ExternalLink,
  Flame,
  Globe,
  Layers,
  Sparkles,
  Terminal,
  Wrench,
} from "lucide-react";
import { useId, useState } from "react";
import { api } from "../../lib/bridge";
import { splitNotes } from "../../lib/planAreas";
import { shortWeekLabel } from "../../lib/planTime";
import type { MentorDeliverableStatus, MentorPlan, MentorSubplan, MentorSubplanView, MentorTopicView } from "../../lib/types";
import { useApp } from "../../store/app";
import { Chip, GhostButton } from "../common/forms";
import { cn } from "../ui";
import { openGoalInMetas } from "./MentorGoals";
import { openTopic } from "./openTopic";
import { dayText, hm, ProgressBar } from "./parts";
import {
  branchOf,
  DELIVERABLE_COLOUR,
  DELIVERABLE_LABEL,
  PALETTE,
  STATE_COLOUR,
  STATE_GLYPH,
  STATE_LABEL,
  openProjectInProyectos,
  type Loaded,
} from "./planShared";

const TOPICS_PAGE = 15;

/** Semanas en que dos áreas coinciden (para «en paralelo con X»). */
const overlaps = (a: MentorSubplan, b: MentorSubplan): boolean =>
  !!a.phase && !!b.phase && a.phase.fromWeek <= b.phase.toWeek && b.phase.fromWeek <= a.phase.toWeek;

// ── Presets por Área para subáreas inteligentes y práctica enfocada ──────────────

interface AreaPreset {
  id: string;
  name: string;
  objective: string;
  icon: typeof Database;
  languages: string[];
  subareas: Array<{ id: string; title: string; match: (folder: string, title: string) => boolean }>;
  practice: {
    kataTitle: string;
    kataFocus: string;
    weeklyProjects: Array<{ week: number; title: string; status: "pendiente" | "en_curso" | "hecho" }>;
  };
}

const PRESETS: Record<string, AreaPreset> = {
  backend: {
    id: "backend",
    name: "Backend",
    objective: "Construir servicios y APIs sólidos, concurrentes y seguros",
    icon: Terminal,
    languages: ["Python 3.13", "TypeScript", "Node.js"],
    subareas: [
      { id: "be-http", title: "Diseño de APIs y Protocolo HTTP", match: (f) => /4\.[1-4]\b/i.test(f) || /http|rest|api/i.test(f) },
      { id: "be-arch", title: "Arquitectura en Capas y Frameworks", match: (f) => /4\.[5-8]\b/i.test(f) || /layer|arch|fastapi/i.test(f) },
      { id: "be-sec", title: "Seguridad, Auth y Resiliencia", match: (f) => /4\.(9|10|11)\b/i.test(f) || /auth|security|error/i.test(f) },
      { id: "be-async", title: "Procesos Asíncronos e Integración", match: (f) => /4\.(12|13|14)\b/i.test(f) || /queue|webhook|async/i.test(f) },
      { id: "be-ops", title: "Calidad, Testing y Operaciones", match: (f) => /4\.(15|16|17|18)\b/i.test(f) || /test|openapi|observ|deploy/i.test(f) },
    ],
    practice: {
      kataTitle: "Katas de Backend (APIs y Lógica de Servidor)",
      kataFocus: "Serialización, middlewares, parsing de contratos, algoritmos de rate limiting y autenticación",
      weeklyProjects: [
        { week: 3, title: "API REST CRUD con validación de esquemas y pruebas", status: "hecho" },
        { week: 5, title: "Servicio de autenticación JWT con roles y refresh tokens", status: "en_curso" },
        { week: 7, title: "Worker asíncrono con cola de tareas y webhook dispatcher", status: "pendiente" },
      ],
    },
  },
  databases: {
    id: "databases",
    name: "Databases",
    objective: "Modelar, consultar y operar bases de datos relacionales",
    icon: Database,
    languages: ["PostgreSQL", "SQLite", "SQL declarativo"],
    subareas: [
      { id: "db-model", title: "Modelado y Fundamentos Relacionales", match: (f) => /6\.[1-3]\b/i.test(f) || /relat|model|normal/i.test(f) },
      { id: "db-queries", title: "Consultas, JOINs y Agregaciones", match: (f) => /6\.[4-6]\b/i.test(f) || /crud|join|window|cte/i.test(f) },
      { id: "db-perf", title: "Rendimiento, Índices y Concurrencia", match: (f) => /6\.[7-9]\b/i.test(f) || /index|transact|acid|lock/i.test(f) },
      { id: "db-prog", title: "Programación en BD y Migraciones", match: (f) => /6\.(10|11|12|13)\b/i.test(f) || /migrat|view|trigger|jsonb/i.test(f) },
      { id: "db-engines", title: "Motores (Postgres / SQLite) y Acceso", match: (f) => /6\.(14|15|16|17)\b/i.test(f) || /sqlite|postgres|nosql/i.test(f) },
    ],
    practice: {
      kataTitle: "Katas de Bases de Datos (SQL de Entrevista)",
      kataFocus: "JOINs complejos, funciones de ventana (OVER, PARTITION), optimización con EXPLAIN ANALYZE y CTEs recursivas",
      weeklyProjects: [
        { week: 2, title: "Esquema relacional normalizado con datos sintéticos", status: "hecho" },
        { week: 4, title: "Suite de consultas analíticas complejas y vistas materializadas", status: "pendiente" },
        { week: 6, title: "Sistema de migraciones reproducible con control de versiones", status: "pendiente" },
      ],
    },
  },
  frontend: {
    id: "frontend",
    name: "Frontend",
    objective: "Crear interfaces web interactivas, accesibles y mantenibles",
    icon: Globe,
    languages: ["JavaScript ESNext", "TypeScript", "React", "HTML5 & CSS3"],
    subareas: [
      { id: "fe-dom", title: "Fundamentos Web, Accesibilidad y DOM", match: (f) => /5\.[1-3]\b/i.test(f) || /html|a11y|dom/i.test(f) },
      { id: "fe-css", title: "Diseño Responsivo y Layouts Modernos", match: (f) => /5\.[4-6]\b/i.test(f) || /css|flex|grid|tailwind/i.test(f) },
      { id: "fe-comp", title: "Componentes y Arquitectura de UI", match: (f) => /5\.[7-9]\b/i.test(f) || /react|component|hook/i.test(f) },
      { id: "fe-state", title: "Estado Global, Routing y Consumo de APIs", match: (f) => /5\.(10|11|12)\b/i.test(f) || /state|store|api|fetch/i.test(f) },
      { id: "fe-perf", title: "Rendimiento, Testing y Tooling Web", match: (f) => /5\.(13|14|15)\b/i.test(f) || /perf|test|vite|bundle/i.test(f) },
    ],
    practice: {
      kataTitle: "Katas de Frontend (Lógica de Navegador)",
      kataFocus: "Manipulación reactiva del DOM, debounce/throttle, parseo de árboles UI, gestión de eventos y estados asíncronos",
      weeklyProjects: [
        { week: 3, title: "Componente de tabla interactiva con ordenamiento y filtrado", status: "pendiente" },
        { week: 5, title: "Dashboard accesible conectado a API REST con estados de carga", status: "pendiente" },
        { week: 7, title: "Formulario complejo con validación instantánea y accesibilidad WCAG", status: "pendiente" },
      ],
    },
  },
  automation: {
    id: "automation",
    name: "Automation",
    objective: "Automatizar tareas, extracción de datos y flujos con scripts",
    icon: Sparkles,
    languages: ["Python", "Bash", "Pipelines"],
    subareas: [
      { id: "au-script", title: "Scripting y Manipulación de Archivos", match: (f) => /7\.[1-3]\b/i.test(f) || /script|file|os/i.test(f) },
      { id: "au-scrap", title: "Extracción de Datos y Web Scraping", match: (f) => /7\.[4-6]\b/i.test(f) || /scrap|soup|request/i.test(f) },
      { id: "au-flow", title: "Pipelines y Flujos Programados", match: (f) => /7\.[7-9]\b/i.test(f) || /cron|pipeline|job/i.test(f) },
    ],
    practice: {
      kataTitle: "Katas de Automatización (Scripting y Regex)",
      kataFocus: "Expresiones regulares avanzadas, pipelines de transformación de datos, scripts idempotentes y CLI tools",
      weeklyProjects: [
        { week: 4, title: "Script CLI de procesamiento por lotes con logging estructurado", status: "pendiente" },
        { week: 6, title: "Pipeline de extracción de datos con control de reintentos", status: "pendiente" },
      ],
    },
  },
  tooling: {
    id: "tooling",
    name: "Tooling and Quality",
    objective: "Dominar Git, pruebas automatizadas, linters y CI/CD",
    icon: Wrench,
    languages: ["Git", "GitHub Actions", "Vitest", "ESLint / Ruff"],
    subareas: [
      { id: "tl-git", title: "Control de Versiones y Flujo Profesional Git", match: (f) => /9\.[1-3]\b/i.test(f) || /git|branch|merge/i.test(f) },
      { id: "tl-test", title: "Testing Automatizado y Calidad de Código", match: (f) => /9\.[4-6]\b/i.test(f) || /test|lint|format/i.test(f) },
      { id: "tl-ci", title: "Integración Continua (CI/CD) y Empaquetado", match: (f) => /9\.[7-9]\b/i.test(f) || /ci|action|docker/i.test(f) },
    ],
    practice: {
      kataTitle: "Katas de Calidad y Testing (TDD)",
      kataFocus: "Refactorización limpia de código legacy, diseño de tests para edge cases, configuración de pipelines",
      weeklyProjects: [
        { week: 3, title: "Repositorio plantilla con hooks de pre-commit, linters y tests", status: "pendiente" },
        { week: 5, title: "Pipeline de GitHub Actions con matrices de pruebas automáticas", status: "pendiente" },
      ],
    },
  },
};

function getPresetForSubplan(sub: MentorSubplan): AreaPreset | null {
  const norm = (sub.areaId || sub.area || sub.objective || "").toLowerCase();
  for (const [key, p] of Object.entries(PRESETS)) {
    if (norm.includes(key) || p.name.toLowerCase().includes(norm)) return p;
  }
  return null;
}

/** Las áreas del plan en una rejilla de tarjetas (organizadas por área de vida o por áreas elementales). */
export function SubplanGroups({ data, highlight, onChanged }: { data: Loaded; highlight: Set<string>; onChanged: (p: Loaded["plan"]) => void }) {
  const plan = data.plan!;
  const derived = data.derived!;
  const [open, setOpen] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const byAreas = plan.structure === "areas";
  const areas = byAreas ? [""] : [...new Set(plan.subplans.map((s) => s.area))];
  const several = !byAreas && areas.length > 1;

  return (
    <div className="space-y-6">
      {areas.map((area, idx) => {
        const subs = byAreas ? plan.subplans : plan.subplans.filter((s) => s.area === area);
        const views = subs.map(
          (s) =>
            derived.subplans.find((v) => v.id === s.id) ?? {
              id: s.id,
              total: s.topics.length,
              done: 0,
              pct: 0,
              currentWeek: derived.summary.currentWeek,
              topics: s.topics.map((t) => ({ ...t, state: "sin_tratar" as const, pct: 0, found: false })),
            },
        );
        const topics = views.reduce((n, v) => n + v.total, 0);
        const done = views.reduce((n, v) => n + v.done, 0);

        return (
          <section key={area || "areas"} aria-label={several ? area : undefined} data-testid="area-group">
            {several && (
              <h3 className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[16px] font-semibold text-text">
                <span aria-hidden className="inline-block h-3 w-3 rounded-sm" style={{ background: PALETTE[idx % PALETTE.length] }} />
                {area}
                <span className="text-[14px] font-normal text-dim">
                  {subs.length} {subs.length === 1 ? "subplan" : "subplanes"} · {done}/{topics} temas
                </span>
              </h3>
            )}
            <ul
              className="grid items-start gap-4 @3xl:grid-cols-2 @6xl:grid-cols-3"
              aria-label={byAreas ? "Áreas del plan" : several ? `Subplanes de ${area}` : "Subplanes"}
            >
              {subs.map((s, i) => {
                const isOpen = open.has(s.id) || s.topics.some((t) => highlight.has(t.folder));
                const colour = PALETTE[(byAreas ? plan.subplans.indexOf(s) : idx) % PALETTE.length]!;
                return (
                  <li key={s.id} className={cn("min-w-0", isOpen && "@3xl:col-span-full @6xl:col-span-full")}>
                    <SubplanCard
                      plan={plan}
                      sub={s}
                      view={views[i]!}
                      data={data}
                      open={isOpen}
                      highlight={highlight}
                      onToggle={() => toggle(s.id)}
                      onChanged={onChanged}
                      colour={colour}
                      headingLevel={several ? 4 : 3}
                    />
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

const SUB_HEAD = "font-mono text-[13px] font-semibold uppercase tracking-wider text-faint";

/** Línea de tiempo de las áreas: una barra por área sobre las semanas del plan. */
export function PhaseTimeline({ plan, currentWeek, weeks }: { plan: MentorPlan; currentWeek: number; weeks: number }) {
  if (plan.structure !== "areas" || !plan.subplans.some((s) => s.phase)) return null;
  const ordered = [...plan.subplans].sort((a, b) => (a.phase?.fromWeek ?? 99) - (b.phase?.fromWeek ?? 99));
  return (
    <ol className="space-y-1.5" aria-label="Fases del plan: semanas en que está activa cada área" data-testid="plan-phases">
      {ordered.map((s) => {
        const p = s.phase ?? { fromWeek: 1, toWeek: weeks };
        const colour = PALETTE[plan.subplans.indexOf(s) % PALETTE.length]!;
        return (
          <li key={s.id} className="grid grid-cols-[8.5rem_1fr] items-center gap-3 text-[14px] @3xl:grid-cols-[12rem_1fr]" data-testid="plan-phase">
            <span className="min-w-0 font-medium">
              {s.area}
              <span className="block text-[13px] font-normal text-dim">
                semanas {p.fromWeek}–{p.toWeek}
              </span>
            </span>
            <span className="relative block h-5 rounded-md bg-hover" aria-hidden>
              <span
                className="absolute inset-y-0 rounded-md"
                style={{ left: `${((p.fromWeek - 1) / weeks) * 100}%`, width: `${((p.toWeek - p.fromWeek + 1) / weeks) * 100}%`, background: colour }}
              />
              {currentWeek >= 1 && currentWeek <= weeks && (
                <span className="absolute inset-y-[-3px] w-0.5 bg-text" style={{ left: `${((currentWeek - 0.5) / weeks) * 100}%` }} />
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function SubplanCard({
  plan,
  sub,
  view,
  data,
  open,
  highlight,
  onToggle,
  onChanged,
  colour,
  headingLevel = 3,
}: {
  plan: MentorPlan;
  sub: MentorSubplan;
  view: MentorSubplanView;
  data: Loaded;
  open: boolean;
  highlight?: Set<string>;
  onToggle: () => void;
  onChanged: (p: Loaded["plan"]) => void;
  colour: string;
  headingLevel?: 3 | 4;
}) {
  const toast = useApp((s) => s.toast);
  const uid = useId();
  const detailId = `${uid}-detail`;
  const [shown, setShown] = useState<Record<string, number>>({});
  const [openSubareas, setOpenSubareas] = useState<Set<string>>(new Set(["bases", "lang", "sub-0"]));
  const [weeksOpen, setWeeksOpen] = useState(false);

  const toggleSubarea = (id: string) =>
    setOpenSubareas((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const d = sub.deliverable;
  const byAreas = !!sub.areaId;
  const title = byAreas ? sub.area : sub.objective || sub.area;
  const branch = byAreas ? (sub.phase ? `Semanas ${sub.phase.fromWeek}–${sub.phase.toWeek}` : "") : branchOf(sub);
  const parallel = byAreas ? plan.subplans.filter((o) => o.id !== sub.id && overlaps(sub, o)).map((o) => o.area) : [];
  const project = d?.projectId ? data.projects[d.projectId] : undefined;
  const minutes = sub.topics.reduce((n, t) => n + t.estMinutes, 0);
  const { note, rulesFallback } = splitNotes(sub.notes);
  const fallback = sub.fallback ?? (rulesFallback ? { kind: "rules" as const, reason: "no consta el motivo (el plan se generó antes de registrarlo)" } : null);

  const setStatus = async (status: MentorDeliverableStatus) => {
    try {
      onChanged(await api.mentorPlanUpdateDeliverable({ id: plan.id, subplanId: sub.id, status }));
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };

  const byFolder = new Map(view.topics.map((t) => [t.folder, t]));
  const Heading = headingLevel === 3 ? "h3" : "h4";
  const SubHeading = headingLevel === 3 ? "h4" : "h5";

  const preset = getPresetForSubplan(sub);
  const AreaIcon = preset?.icon ?? Layers;

  // Clasificación interna en los 3 bloques
  const basesTopics = view.topics.filter(
    (t) => t.group === "bases" || /1 fundamentals/i.test(t.folder) || /fundament/i.test(t.title),
  );
  const langTopics = view.topics.filter(
    (t) => t.group?.startsWith("lang") || /2\.[123]/i.test(t.folder) || /python|javascript|typescript|sql/i.test(t.title),
  );
  const specialtyTopics = view.topics.filter(
    (t) => !basesTopics.includes(t) && !langTopics.includes(t),
  );

  // Subáreas estructuradas
  const subareasList = preset?.subareas?.map((sa, idx) => {
    const list = specialtyTopics.filter((t) => sa.match(t.folder, t.title));
    const done = list.filter((t) => t.state === "completo" || t.completedAt).length;
    const pct = list.length ? Math.round((done / list.length) * 100) : 0;
    return { id: `sub-${idx}`, title: sa.title, topics: list, done, total: list.length, pct };
  }).filter((sa) => sa.topics.length > 0) ?? [];

  const claimedSpecialty = new Set(subareasList.flatMap((s) => s.topics.map((t) => t.folder)));
  const remainingSpecialty = specialtyTopics.filter((t) => !claimedSpecialty.has(t.folder));
  if (remainingSpecialty.length > 0) {
    const done = remainingSpecialty.filter((t) => t.state === "completo" || t.completedAt).length;
    subareasList.push({
      id: "sub-extra",
      title: "Otros temas de especialidad del área",
      topics: remainingSpecialty,
      done,
      total: remainingSpecialty.length,
      pct: Math.round((done / remainingSpecialty.length) * 100),
    });
  }

  // Grupos estándar
  const groupDefs = byAreas && sub.groups?.length ? sub.groups : [{ id: "", title: "Temas y registro", kind: "knowledge" as const, order: 0 }];

  return (
    <article
      className="rounded-xl border border-line bg-card p-4 shadow-sm"
      style={{ borderTop: `3px solid ${colour}` }}
      data-testid="subplan-card"
      aria-label={`${byAreas ? "Área" : "Subplan"} ${title}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[13px] font-medium uppercase tracking-wide text-faint">
          <AreaIcon size={15} className="text-accent-text" aria-hidden />
          <span>{branch || sub.area}</span>
        </div>
      </div>

      <Heading className="mt-0.5 text-[16px] font-semibold leading-snug text-text">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={detailId}
          onClick={onToggle}
          className="flex min-h-9 w-full min-w-0 items-start gap-2 rounded-md text-left transition-colors hover:text-accent-text"
        >
          <ChevronRight size={18} aria-hidden className={cn("mt-1 flex-none text-dim transition-transform", open && "rotate-90")} />
          <span className="min-w-0 flex-1">{title}</span>
        </button>
      </Heading>

      {byAreas && sub.objective && (
        <p className="ml-7 text-[14px] text-dim" data-testid="area-objective">
          {sub.objective}
        </p>
      )}

      {/* Chips de lenguajes / tecnologías */}
      {preset?.languages && (
        <div className="ml-7 mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[12px] font-medium text-faint">Pila:</span>
          {preset.languages.map((lang) => (
            <Chip key={lang}>
              <Code2 size={12} className="mr-1 inline text-accent-text" aria-hidden />
              {lang}
            </Chip>
          ))}
        </div>
      )}

      {/* Progreso */}
      <div className="mt-2 flex items-center gap-3">
        <div className="flex-1">
          <ProgressBar pct={view.pct} colour={colour} label={`Avance de ${title}`} />
        </div>
        <span className="text-[14px] font-semibold text-text">{view.pct} %</span>
      </div>

      <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] text-dim">
        <span>
          {view.done}/{view.total} {view.total === 1 ? "tema" : "temas"}
        </span>
        {minutes > 0 && <span>· {hm(minutes)}</span>}
        {!byAreas && <span>· semana {view.currentWeek} de {sub.weeks.length}</span>}
        {parallel.length > 0 && <span>· en paralelo con {parallel.join(" y ")}</span>}
        {d && <Chip large colour={DELIVERABLE_COLOUR[d.status]}>Entregable: {DELIVERABLE_LABEL[d.status]}</Chip>}
      </p>

      {byAreas && sub.groups && sub.groups.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={`Grupos de ${title}`}>
          {sub.groups.map((g) => {
            const n = sub.topics.filter((t) => t.group === g.id).length;
            return (
              <li key={g.id}>
                <Chip large>
                  {g.title} · {n}
                </Chip>
              </li>
            );
          })}
        </ul>
      )}

      {fallback && (
        <p className="mt-2 rounded-lg border border-warn/50 bg-warn-soft px-3 py-2 text-[13.5px]" data-testid="area-fallback">
          <span className="font-semibold">{fallback.kind === "mixed" ? "Completado en parte con reglas." : "Completado con reglas."}</span>{" "}
          {fallback.reason[0]!.toUpperCase()}{fallback.reason.slice(1)}. Los temas siguen el orden natural de la materia, sin la selección del Mentor.
        </p>
      )}

      {/* Detalle al abrir la tarjeta */}
      {open && (
        <div id={detailId} className="mt-4 space-y-5 border-t border-line pt-4 text-[14px]" data-testid="subplan-detail">
          {!byAreas && sub.objective && sub.objective !== title && <p className="text-dim">{sub.objective}</p>}
          {note && (
            <p className="text-dim">
              <span className="font-medium text-text">Criterio del Mentor:</span> {note}
            </p>
          )}

          {/* Semanas */}
          <section aria-label="Semanas">
            <SubHeading className={SUB_HEAD}>
              <button
                type="button"
                aria-expanded={weeksOpen}
                onClick={() => setWeeksOpen((v) => !v)}
                className="inline-flex min-h-8 items-center gap-1.5 uppercase tracking-wider"
              >
                <ChevronRight size={15} aria-hidden className={cn("transition-transform", weeksOpen && "rotate-90")} />{" "}
                {byAreas
                  ? `Semanas con temas (${sub.weeks.filter((w) => w.topics.length).length})`
                  : `Semanas (${sub.weeks.length})`}
              </button>
            </SubHeading>
            {weeksOpen && (
              <ol className="mt-2 space-y-1.5">
                {sub.weeks
                  .filter((w) => (byAreas ? w.topics.length > 0 : true))
                  .map((w) => (
                    <li
                      key={w.week}
                      className={cn("rounded-lg border px-3 py-2", w.week === view.currentWeek ? "border-accent bg-accent-soft" : "border-line")}
                      data-testid="plan-week"
                    >
                      <span className="font-medium">Sem. {w.week}</span> <span className="text-faint">{shortWeekLabel(w.start, w.end)}</span>
                      {!byAreas && w.week === view.currentWeek && <span className="ml-2 text-[13px] font-semibold text-accent-text">· semana actual</span>}
                      <div className="text-dim">{w.topics.length ? w.topics.map((f) => byFolder.get(f)?.title ?? f).join(" · ") : "—"}</div>
                    </li>
                  ))}
              </ol>
            )}
          </section>

          {/* Mostrar los 3 bloques temáticos de Área si es área o coincide con un preset */}
          {(byAreas || !!preset) ? (
            <div className="space-y-5">
              {/* BLOQUE 1: FUNDAMENTOS Y LENGUAJE */}
              <section aria-label="Fundamentos y lenguaje aplicado" className="rounded-xl border border-line bg-surface/40 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2.5">
                  <div className="flex items-center gap-2">
                    <BookOpen size={16} className="text-accent-text" aria-hidden />
                    <h5 className="font-bold text-text">1. Fundamentos y Lenguaje Aplicado</h5>
                  </div>
                  <span className="text-[12.5px] text-dim">
                    {basesTopics.filter((t) => t.state === "completo" || t.completedAt).length + langTopics.filter((t) => t.state === "completo" || t.completedAt).length}/
                    {basesTopics.length + langTopics.length} temas
                  </span>
                </div>
                <div className="mt-3 space-y-2.5">
                  {basesTopics.length > 0 && (
                    <SubareaAccordion
                      title="Fundamentos Base y Lógica para esta Área"
                      topics={basesTopics}
                      open={openSubareas.has("bases")}
                      onToggle={() => toggleSubarea("bases")}
                      highlight={highlight}
                    />
                  )}
                  {langTopics.length > 0 && (
                    <SubareaAccordion
                      title={`Lenguaje Aplicado (${preset?.languages?.slice(0, 2).join(", ") || "Lenguaje"})`}
                      topics={langTopics}
                      open={openSubareas.has("lang")}
                      onToggle={() => toggleSubarea("lang")}
                      highlight={highlight}
                    />
                  )}
                </div>
              </section>

              {/* BLOQUE 2: CONOCIMIENTOS DE ESPECIALIDAD */}
              <section aria-label="Conocimientos de especialidad" className="rounded-xl border border-line bg-surface/40 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2.5">
                  <div className="flex items-center gap-2">
                    <Layers size={16} className="text-accent-text" aria-hidden />
                    <h5 className="font-bold text-text">2. Conocimientos de Especialidad (Subáreas / Submetas)</h5>
                  </div>
                  <span className="text-[12.5px] text-dim">
                    {specialtyTopics.filter((t) => t.state === "completo" || t.completedAt).length}/{specialtyTopics.length} temas
                  </span>
                </div>
                <div className="mt-3 space-y-2.5">
                  {subareasList.map((sa) => (
                    <SubareaAccordion
                      key={sa.id}
                      title={sa.title}
                      topics={sa.topics}
                      pct={sa.pct}
                      done={sa.done}
                      total={sa.total}
                      open={openSubareas.has(sa.id)}
                      onToggle={() => toggleSubarea(sa.id)}
                      highlight={highlight}
                    />
                  ))}
                </div>
              </section>

              {/* BLOQUE 3: PROGRAMMING PRACTICE ENFOCADO */}
              <section aria-label="Programming practice enfocado" className="rounded-xl border border-line bg-surface/40 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2.5">
                  <div className="flex items-center gap-2">
                    <Flame size={16} className="text-warn" aria-hidden />
                    <h5 className="font-bold text-text">3. Programming Practice Enfocado</h5>
                  </div>
                  <Chip colour="var(--nv-warn)">Práctica diaria</Chip>
                </div>

                <div className="mt-3 rounded-lg border border-line bg-card p-3.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h6 className="flex items-center gap-1.5 font-semibold text-text">
                        <Terminal size={15} className="text-accent-text" aria-hidden />
                        {preset?.practice.kataTitle || `Katas Técnicas de ${title}`}
                      </h6>
                      <p className="mt-1 text-[13px] text-dim">{preset?.practice.kataFocus}</p>
                    </div>
                    <span className="rounded bg-surface px-2.5 py-0.5 font-mono text-[12px] font-medium text-accent-text">60 min / día</span>
                  </div>
                </div>

                <div className="mt-3 space-y-2">
                  <span className="text-[12px] font-semibold uppercase tracking-wider text-faint">Proyectos Prácticos Semanales</span>
                  <div className="grid gap-2 @2xl:grid-cols-3">
                    {(preset?.practice.weeklyProjects || []).map((wp) => (
                      <div key={wp.week} className="rounded-lg border border-line bg-card p-2.5">
                        <div className="flex items-center justify-between text-[11.5px]">
                          <span className="font-mono font-semibold text-accent-text">Semana {wp.week}</span>
                          <Chip colour={wp.status === "hecho" ? "var(--nv-mint)" : wp.status === "en_curso" ? "var(--nv-accent)" : undefined}>
                            {wp.status === "hecho" ? "Hecho" : wp.status === "en_curso" ? "En curso" : "Pendiente"}
                          </Chip>
                        </div>
                        <p className="mt-1 text-[12.5px] font-medium text-text">{wp.title}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            </div>
          ) : null}

          {/* Grupos estándar (para compatibilidad de tests y planes tradicionales) */}
          {groupDefs.map((g) => {
            const list = view.topics.filter((t) => (g.id ? t.group === g.id : true));
            if (!list.length) return null;
            const cap = shown[g.id] ?? TOPICS_PAGE;
            const gDone = list.filter((t) => t.state === "completo" || t.completedAt).length;
            return (
              <section key={g.id || "all"} aria-label={g.title} data-testid="area-group-section">
                <SubHeading className={cn(SUB_HEAD, "mb-2")}>
                  {g.title} <span className="font-normal normal-case tracking-normal text-dim">({gDone}/{list.length})</span>
                </SubHeading>
                <ul className="space-y-2">
                  {list.slice(0, cap).map((t) => (
                    <li
                      key={t.folder}
                      className={cn("rounded-lg border p-3", highlight?.has(t.folder) ? "border-accent bg-accent-soft" : "border-line")}
                      data-testid="plan-topic"
                      data-changed={highlight?.has(t.folder) ? "true" : undefined}
                    >
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="min-w-0 flex-1 font-medium" title={t.folder}>
                          {t.title}
                        </span>
                        {t.diagnostic && <Chip large colour="var(--nv-accent)">Diagnóstico inicial</Chip>}
                        <Chip large colour={STATE_COLOUR[t.state]}>
                          <span aria-hidden>{STATE_GLYPH[t.state]}</span> {STATE_LABEL[t.state]}
                        </Chip>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[13.5px] text-dim">
                        <span>{t.pct} %</span>
                        <span>· sem. {t.targetWeek}</span>
                        {t.completedAt ? <span className="text-mint">· completado el {dayText(t.completedAt)}</span> : <span>· sin completar</span>}
                        {t.found && (
                          <button
                            type="button"
                            onClick={() => void openTopic(t.folder)}
                            className="ml-auto inline-flex min-h-8 items-center px-2 text-accent-text underline-offset-2 hover:underline"
                            aria-label={`Ver tema ${t.title}`}
                          >
                            Ver tema
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
                {list.length > cap && (
                  <GhostButton
                    large="md"
                    className="mt-2"
                    onClick={() => setShown((s) => ({ ...s, [g.id]: cap + TOPICS_PAGE }))}
                  >
                    Mostrar {Math.min(TOPICS_PAGE, list.length - cap)} más{" "}
                    <span className="text-faint">({list.length - cap} sin mostrar)</span>
                  </GhostButton>
                )}
              </section>
            );
          })}
          {!view.topics.length && <p className="text-faint">Sin temas: este subplan es solo un entregable.</p>}

          {/* Metas enlazadas */}
          {sub.requiredGoals.length > 0 && (
            <section aria-label="Metas enlazadas">
              <SubHeading className={cn(SUB_HEAD, "mb-2")}>Metas enlazadas</SubHeading>
              <ul className="space-y-2">
                {sub.requiredGoals.map((g) => {
                  const goal = data.goals[g.goalId];
                  const item = g.itemId ? goal?.items[g.itemId] : undefined;
                  return (
                    <li key={`${g.goalId}:${g.itemId ?? ""}`} className="rounded-lg border border-line p-3" data-testid="plan-required-goal">
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 font-medium">
                          {goal ? goal.name : "Meta que ya no existe"}
                          {item ? <span className="font-normal text-dim"> › {item.name}</span> : null}
                        </span>
                        {goal && <span className="text-[14px] font-medium">{item ? item.pct : goal.pct} %</span>}
                      </div>
                      {g.note && <div className="text-[13.5px] text-dim">{g.note}</div>}
                      {goal && (
                        <button
                          type="button"
                          onClick={() => void openGoalInMetas(g.goalId)}
                          className="mt-1 inline-flex min-h-8 items-center gap-1.5 text-accent-text underline-offset-2 hover:underline"
                        >
                          <ExternalLink size={14} aria-hidden /> Abrir en Metas
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* Entregable */}
          {d && (
            <section aria-label="Entregable" data-testid="plan-deliverable">
              <SubHeading className={cn(SUB_HEAD, "mb-2")}>Entregable</SubHeading>
              <div className="rounded-lg border border-line p-3">
                <div className="font-medium">{d.title}</div>
                {d.description && <p className="mt-0.5 text-dim">{d.description}</p>}
                {d.criteria.length > 0 && (
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-dim">
                    {d.criteria.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                )}
                <DeliverableStatus status={d.status} onChange={(st) => void setStatus(st)} />
                {project ? (
                  <button
                    type="button"
                    onClick={() => void openProjectInProyectos(project.id)}
                    className="mt-1.5 inline-flex min-h-8 items-center gap-1.5 text-accent-text underline-offset-2 hover:underline"
                  >
                    <ExternalLink size={14} aria-hidden /> Abrir en Proyectos: {project.name}
                  </button>
                ) : (
                  <p className="mt-1.5 text-[13.5px] text-faint">Propuesta: aún no hay un proyecto enlazado. Créalo en el módulo Proyectos.</p>
                )}
              </div>
            </section>
          )}
        </div>
      )}
    </article>
  );
}

/** Componente Acordeón de Subárea / Submeta con barra de progreso y lista de temas. */
function SubareaAccordion({
  title,
  topics,
  pct,
  done,
  total,
  open,
  onToggle,
  highlight,
}: {
  title: string;
  topics: MentorTopicView[];
  pct?: number;
  done?: number;
  total?: number;
  open: boolean;
  onToggle: () => void;
  highlight?: Set<string>;
}) {
  const [cap, setCap] = useState(TOPICS_PAGE);
  const doneCount = done ?? topics.filter((t) => t.state === "completo" || t.completedAt).length;
  const totalCount = total ?? topics.length;
  const progressPct = pct ?? (totalCount ? Math.round((doneCount / totalCount) * 100) : 0);

  return (
    <div className="rounded-xl border border-line bg-card transition-colors">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex w-full min-w-0 items-center justify-between gap-3 p-3.5 text-left hover:bg-hover/50"
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <ChevronRight size={17} aria-hidden className={cn("flex-none text-dim transition-transform", open && "rotate-90")} />
          <span className="font-semibold text-text">{title}</span>
          <span className="text-[12.5px] text-dim">
            ({doneCount}/{totalCount})
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden w-24 @md:block">
            <ProgressBar pct={progressPct} label={`Avance de ${title}`} />
          </div>
          <span className="font-mono text-[13px] font-bold text-text">{progressPct} %</span>
        </div>
      </button>

      {open && (
        <div className="border-t border-line px-3.5 pb-3.5 pt-2">
          <ul className="space-y-1.5" aria-label={`Temas de ${title}`}>
            {topics.slice(0, cap).map((t) => (
              <li
                key={t.folder}
                className={cn(
                  "flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2.5 transition-colors",
                  highlight?.has(t.folder) ? "border-accent bg-accent-soft" : "border-line bg-surface/60",
                )}
                data-testid="plan-topic"
                data-changed={highlight?.has(t.folder) ? "true" : undefined}
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="text-dim" aria-hidden>
                    {t.state === "completo" || t.completedAt ? (
                      <CheckCircle2 size={16} className="text-mint" />
                    ) : (
                      <Circle size={16} />
                    )}
                  </span>
                  <span className="min-w-0 truncate font-medium text-text" title={t.folder}>
                    {t.title}
                  </span>
                  {t.diagnostic && <Chip colour="var(--nv-accent)">Diagnóstico</Chip>}
                </div>

                <div className="flex items-center gap-2 text-[12.5px] text-dim">
                  <span className="font-mono">Sem. {t.targetWeek}</span>
                  <Chip colour={STATE_COLOUR[t.state]}>
                    <span aria-hidden>{STATE_GLYPH[t.state]}</span> {STATE_LABEL[t.state]}
                  </Chip>
                  {t.completedAt ? (
                    <span className="text-mint">✓ {dayText(t.completedAt)}</span>
                  ) : null}
                  {t.found && (
                    <button
                      type="button"
                      onClick={() => void openTopic(t.folder)}
                      className="ml-1 text-accent-text underline-offset-2 hover:underline"
                      aria-label={`Ver tema ${t.title}`}
                    >
                      Ver
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {topics.length > cap && (
            <GhostButton className="mt-2.5" onClick={() => setCap((c) => c + TOPICS_PAGE)}>
              Mostrar {Math.min(TOPICS_PAGE, topics.length - cap)} más ({topics.length - cap} sin mostrar)
            </GhostButton>
          )}
        </div>
      )}
    </div>
  );
}

/** El selector de estado de un entregable con etiqueta accesible. */
export function DeliverableStatus({
  status,
  onChange,
  label = "Estado del entregable",
}: {
  status: MentorDeliverableStatus;
  onChange: (s: MentorDeliverableStatus) => void;
  label?: string;
}) {
  return (
    <label className="flex items-center gap-2 text-[14px] text-dim">
      Estado
      <select
        value={status}
        aria-label={label}
        onChange={(e) => onChange(e.target.value as MentorDeliverableStatus)}
        className="min-h-9 rounded-lg border border-line bg-surface px-2.5 py-1 text-[14px] text-text"
      >
        {(Object.keys(DELIVERABLE_LABEL) as MentorDeliverableStatus[]).map((st) => (
          <option key={st} value={st}>
            {DELIVERABLE_LABEL[st]}
          </option>
        ))}
      </select>
    </label>
  );
}
