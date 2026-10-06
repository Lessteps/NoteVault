// Mentor: un espacio con varios paneles (Hoy, Plan, Metas, Proyectos y Notas y estudio). La conversación con
// el Mentor NO es un panel: ocurre en el panel del asistente (columna derecha), que en esta pestaña
// se pone en contexto Mentor (ver `components/mentor/MentorAssistant.tsx`).
//
// Todos los paneles de datos son de SOLO previsualización: las metas, los proyectos y las notas se
// editan únicamente en sus módulos (cada panel trae su botón "Abrir en …"). Lo único que escribe el
// Mentor es lo que el estudiante confirma: aceptar el plan de hoy o "Crear meta" de un borrador.

import { BookOpenCheck, CalendarCheck, CalendarRange, FolderKanban, Target } from "lucide-react";
import { useEffect } from "react";
import { usePersistedNav } from "../../store/navState";
import { planViewId, useMentor } from "../../store/mentor";
import { PracticeProjectDialog } from "../practice/PracticeProjectDialog";
import { ModuleSidebar } from "../ModuleSidebar";
import { MentorGoals } from "./MentorGoals";
import { MentorPlan } from "./MentorPlan";
import { MentorProjects } from "./MentorProjects";
import { MentorStudy } from "./MentorStudy";
import { MentorToday } from "./MentorToday";

const VIEWS = ["hoy", "plan", "metas", "proyectos", "notas"] as const;
type View = (typeof VIEWS)[number];
const PLAN_PREFIX = "plan:";

export function MentorModule() {
  const [stored, setView] = usePersistedNav("mentor.view", "hoy");
  const plans = useMentor((s) => s.plans);
  const plansLoaded = useMentor((s) => s.plansLoaded);
  const loadPlans = useMentor((s) => s.loadPlans);
  const planVersion = useMentor((s) => s.planVersion);
  useEffect(() => {
    void loadPlans();
  }, [loadPlans, planVersion]);
  // «plan:<id>» es la sub-interfaz de un plan; si ese plan ya no existe, se vuelve al resumen
  const planId = stored.startsWith(PLAN_PREFIX) ? stored.slice(PLAN_PREFIX.length) : "";
  const knownPlan = planId && (!plansLoaded || plans.some((p) => p.id === planId)) ? planId : "";
  const view: View = knownPlan || (planId && plansLoaded) ? "plan" : (VIEWS as readonly string[]).includes(stored) ? (stored as View) : "hoy";
  const activeId = knownPlan ? planViewId(knownPlan) : view;
  const hasDraft = useMentor((s) => (s.turns.find((t) => t.id === s.pending)?.draft ? 1 : 0));
  const hasPlanDraft = useMentor((s) => (s.turns.find((t) => t.id === s.pending)?.planDraft ? 1 : 0));

  return (
    <div className="flex min-w-0 flex-1">
      <ModuleSidebar
        title="Mentor"
        active={activeId}
        onSelect={(id) => setView(id)}
        items={[
          { id: "hoy", label: "Hoy", hint: "El plan de estudio del día", icon: <CalendarCheck /> },
          {
            id: "plan",
            label: "Plan",
            hint: plans.length ? `Resumen de planes · ${plans.length}` : "Resumen de planes",
            icon: <CalendarRange />,
            badge: hasPlanDraft,
            subItems: plans.map((p) => ({
              id: planViewId(p.id),
              label: p.name,
              hint: `${p.period} · ${p.status} · ${p.pct} %`,
              icon: <CalendarRange />,
            })),
          },
          { id: "metas", label: "Metas", hint: "Resumen de metas y borradores", icon: <Target />, badge: hasDraft },
          { id: "proyectos", label: "Proyectos", hint: "Estado y plazos", icon: <FolderKanban /> },
          { id: "notas", label: "Notas y estudio", hint: "Temas a medias, repasos, errores", icon: <BookOpenCheck /> },
        ]}
      />
      <main className="@container flex min-w-0 flex-1 flex-col bg-surface" aria-label={`Mentor: ${view}`}>
        {view === "hoy" ? (
          <MentorToday />
        ) : view === "plan" ? (
          <MentorPlan planId={knownPlan || undefined} />
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
