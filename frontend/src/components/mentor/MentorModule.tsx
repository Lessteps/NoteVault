// Mentor: un espacio con varios paneles (Hoy, Plan, Metas, Proyectos y Notas y estudio). La conversación con
// el Mentor NO es un panel: ocurre en el panel del asistente (columna derecha), que en esta pestaña
// se pone en contexto Mentor (ver `components/mentor/MentorAssistant.tsx`).
//
// Todos los paneles de datos son de SOLO previsualización: las metas, los proyectos y las notas se
// editan únicamente en sus módulos (cada panel trae su botón "Abrir en …"). Lo único que escribe el
// Mentor es lo que el estudiante confirma: aceptar el plan de hoy o "Crear meta" de un borrador.

import { ArrowLeft, BookOpenCheck, CalendarRange, FolderKanban, ListChecks, Moon, Target } from "lucide-react";
import { useEffect, useState } from "react";
import { usePersistedNav } from "../../store/navState";
import { planViewId, useMentor } from "../../store/mentor";
import { PracticeProjectDialog } from "../practice/PracticeProjectDialog";
import { ModuleSidebar } from "../ModuleSidebar";
import { MentorDayClose } from "./MentorDayClose";
import { MentorGoals } from "./MentorGoals";
import { MentorPlan } from "./MentorPlan";
import { PlanBuilder } from "./PlanBuilder";
import { MentorProjects } from "./MentorProjects";
import { MentorStudy } from "./MentorStudy";
import { MentorToday } from "./MentorToday";

const VIEWS = ["hoy", "plan", "cierre", "metas", "proyectos", "notas"] as const;
type View = (typeof VIEWS)[number];
const PLAN_PREFIX = "plan:";
const BUILD_PREFIX = "build:";

export function MentorModule() {
  const [rawStored, setView] = usePersistedNav("mentor.view", "");
  const plans = useMentor((s) => s.plans);
  const plansLoaded = useMentor((s) => s.plansLoaded);
  const loadPlans = useMentor((s) => s.loadPlans);
  const planVersion = useMentor((s) => s.planVersion);
  const builds = useMentor((s) => s.builds);
  const loadBuilds = useMentor((s) => s.loadBuilds);
  const [buildsLoaded, setBuildsLoaded] = useState(false);
  // «Hoy» (proponer el día con la IA) ya no es un panel suelto de la barra lateral: el plan en ejecución es el «hoy» de la persona. Se llega a
  // él con «Planear mi día» y se vuelve al plan con el enlace de arriba.
  const activePlanId = plansLoaded ? plans.find((p) => p.status === "activo")?.id ?? "" : "";
  const stored = rawStored === "" ? (activePlanId ? `${PLAN_PREFIX}${activePlanId}` : "plan") : rawStored;
  useEffect(() => {
    void loadPlans();
    void loadBuilds().then(() => setBuildsLoaded(true));
  }, [loadPlans, loadBuilds, planVersion]);
  // «build:<id>» es un plan en construcción (constructor guiado)
  const buildId = stored.startsWith(BUILD_PREFIX) ? stored.slice(BUILD_PREFIX.length) : "";
  const knownBuild = buildId && (!buildsLoaded || builds.some((b) => b.id === buildId)) ? buildId : "";
  // «plan:<id>» es la sub-interfaz de un plan; si ese plan ya no existe, se vuelve al resumen
  const planId = stored.startsWith(PLAN_PREFIX) ? stored.slice(PLAN_PREFIX.length) : "";
  const knownPlan = planId && (!plansLoaded || plans.some((p) => p.id === planId)) ? planId : "";
  const view: View = knownPlan || knownBuild || (planId && plansLoaded) || (buildId && buildsLoaded) ? "plan" : (VIEWS as readonly string[]).includes(stored) ? (stored as View) : "hoy";
  const activeId = knownBuild ? `${BUILD_PREFIX}${knownBuild}` : knownPlan ? planViewId(knownPlan) : view === "hoy" ? "plan" : view;
  const hasDraft = useMentor((s) => (s.turns.find((t) => t.id === s.pending)?.draft ? 1 : 0));
  const hasPlanDraft = useMentor((s) => (s.turns.find((t) => t.id === s.pending)?.planDraft ? 1 : 0));

  return (
    <div className="flex min-w-0 flex-1">
      <ModuleSidebar
        title="Mentor"
        active={activeId}
        onSelect={(id) => setView(id)}
        items={[
          {
            id: "plan",
            label: "Plan",
            hint: plans.length ? `Resumen de planes · ${plans.length}` : "Resumen de planes",
            icon: <CalendarRange />,
            badge: hasPlanDraft,
            subItems: [
              ...builds.map((b) => ({
                id: `${BUILD_PREFIX}${b.id}`,
                label: b.name,
                hint: `en construcción · etapa ${b.stageNumber}/${b.stages}`,
                icon: <ListChecks />,
                badge: `${b.stageNumber}/${b.stages}`,
              })),
              ...plans.map((p) => ({
                id: planViewId(p.id),
                label: p.name,
                hint: `${p.period} · ${p.status} · ${p.pct} %`,
                icon: <CalendarRange />,
                ...(p.status === "propuesto" ? { badge: "propuesto" } : {}),
              })),
            ],
          },
          { id: "cierre", label: "Cierre del día", hint: "Qué pasó hoy y qué corregir", icon: <Moon /> },
          { id: "metas", label: "Metas", hint: "Resumen de metas y borradores", icon: <Target />, badge: hasDraft },
          { id: "proyectos", label: "Proyectos", hint: "Estado y plazos", icon: <FolderKanban /> },
          { id: "notas", label: "Notas y estudio", hint: "Temas a medias, repasos, errores", icon: <BookOpenCheck /> },
        ]}
      />
      <main className="@container flex min-w-0 flex-1 flex-col bg-surface" aria-label={`Mentor: ${view}`}>
        {view === "hoy" ? (
          <>
            <div className="flex-none border-b border-line px-5 py-2">
              <button type="button" onClick={() => setView(activePlanId ? `${PLAN_PREFIX}${activePlanId}` : "plan")} className="inline-flex min-h-9 items-center gap-1.5 text-[14px] text-accent-text underline-offset-2 hover:underline" data-testid="today-back">
                <ArrowLeft size={15} aria-hidden /> Volver a mi plan
              </button>
            </div>
            <MentorToday />
          </>
        ) : view === "plan" ? (
          knownBuild ? <PlanBuilder key={knownBuild} buildId={knownBuild} /> : <MentorPlan planId={knownPlan || undefined} />
        ) : view === "cierre" ? (
          <MentorDayClose />
        ) : view === "metas" ? (
          <MentorGoals />
        ) : view === "proyectos" ? (
          <MentorProjects />
        ) : (
          <MentorStudy />
        )}
      </main>
      <PracticeProjectDialog />
    </div>
  );
}
