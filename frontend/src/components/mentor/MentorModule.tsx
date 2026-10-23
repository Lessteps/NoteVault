// Mentor: un espacio centrado en UN plan. La barra lateral lleva, arriba, los ítems del modo en curso (Planeación o Ejecución) y, al pie, el
// interruptor de modo y el selector de plan (ver `MentorSidebar.tsx`); el panel enseña el plan elegido (`PlanWorkspace.tsx`). La conversación con
// el Mentor NO es un panel: ocurre en el panel del asistente (columna derecha), que en esta pestaña
// se pone en contexto Mentor (ver `components/mentor/MentorAssistant.tsx`).
//
// Los antiguos paneles «Plan» (resumen), «Cierre del día», «Metas», «Proyectos» y «Notas y estudio» ya no están en la barra, pero siguen existiendo
// como rutas ocultas (`mentor.view`): se llega a ellos desde botones de otras vistas y se vuelve con «Volver a mi plan».
// Todos los paneles de datos son de SOLO previsualización: las metas, los proyectos y las notas se editan únicamente en sus módulos.
// Lo único que escribe el Mentor es lo que el estudiante confirma: aceptar el plan o «Crear meta» de un borrador.

import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { usePersistedNav } from "../../store/navState";
import { useMentor } from "../../store/mentor";
import { PracticeProjectDialog } from "../practice/PracticeProjectDialog";
import { MentorDayClose } from "./MentorDayClose";
import { MentorGoals } from "./MentorGoals";
import { MentorPlan } from "./MentorPlan";
import { MentorSidebar } from "./MentorSidebar";
import { PlanBuilder } from "./PlanBuilder";
import { MentorProjects } from "./MentorProjects";
import { MentorStudy } from "./MentorStudy";
import { MentorToday } from "./MentorToday";
import { PlanWorkspace } from "./PlanWorkspace";
import { PLAN_PREFIX, resolveRoute, useMentorMode, type AuxView } from "./mentorNav";

const AUX_LABEL: Record<AuxView, string> = { hoy: "Hoy", cierre: "Cierre del día", metas: "Metas", proyectos: "Proyectos", notas: "Notas y estudio" };

export function MentorModule() {
  const [stored, setView] = usePersistedNav("mentor.view", "");
  const plans = useMentor((s) => s.plans);
  const plansLoaded = useMentor((s) => s.plansLoaded);
  const loadPlans = useMentor((s) => s.loadPlans);
  const planVersion = useMentor((s) => s.planVersion);
  const builds = useMentor((s) => s.builds);
  const loadBuilds = useMentor((s) => s.loadBuilds);
  const [buildsLoaded, setBuildsLoaded] = useState(false);
  useEffect(() => {
    void loadPlans();
    void loadBuilds().then(() => setBuildsLoaded(true));
  }, [loadPlans, loadBuilds, planVersion]);
  const route = resolveRoute({ stored, plans, plansLoaded, builds, buildsLoaded });
  const [mode, setMode] = useMentorMode(route.kind === "plan" ? plans.find((p) => p.id === route.planId) : undefined, route.kind === "plan" ? route.planId : undefined);
  // el plan al que vuelven «Volver a mi plan» y el interruptor de modo desde fuera de un plan: el que está en curso, o el primero
  const home = plansLoaded ? plans.find((p) => p.status === "activo") ?? plans[0] : undefined;
  const homeView = home ? `${PLAN_PREFIX}${home.id}` : "plan";

  if (route.kind === "plan") {
    return (
      <div className="flex min-w-0 flex-1">
        <PlanWorkspace key={route.planId} planId={route.planId} />
        <PracticeProjectDialog />
      </div>
    );
  }
  return (
    <div className="flex min-w-0 flex-1">
      <MentorSidebar
        items={[]}
        active=""
        onSelect={setView}
        mode={mode}
        onMode={(m) => {
          setMode(m);
          if (route.kind !== "build") setView(homeView);
        }}
        {...(route.kind === "build" ? { currentBuildId: route.buildId } : {})}
      />
      <main className="@container flex min-w-0 flex-1 flex-col bg-surface" aria-label={`Mentor: ${route.kind === "aux" ? route.view : route.kind}`}>
        {route.kind === "aux" && (
          <>
            <div className="flex-none border-b border-line px-5 py-2">
              <button type="button" onClick={() => setView(homeView)} className="inline-flex min-h-9 items-center gap-1.5 text-[14px] text-accent-text underline-offset-2 hover:underline" data-testid="today-back" title={AUX_LABEL[route.view]}>
                <ArrowLeft size={15} aria-hidden /> Volver a mi plan
              </button>
            </div>
            {route.view === "hoy" ? <MentorToday /> : route.view === "cierre" ? <MentorDayClose /> : route.view === "metas" ? <MentorGoals /> : route.view === "proyectos" ? <MentorProjects /> : <MentorStudy />}
          </>
        )}
        {route.kind === "build" && <PlanBuilder key={route.buildId} buildId={route.buildId} />}
        {route.kind === "overview" && <MentorPlan key={route.creating ? "nuevo" : "resumen"} creating={route.creating} />}
      </main>
      <PracticeProjectDialog />
    </div>
  );
}
