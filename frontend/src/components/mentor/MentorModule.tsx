// Mentor: un espacio con varios paneles (Hoy, Metas, Proyectos y Notas y estudio). La conversación con
// el Mentor NO es un panel: ocurre en el panel del asistente (columna derecha), que en esta pestaña
// se pone en contexto Mentor (ver `components/mentor/MentorAssistant.tsx`).
//
// Todos los paneles de datos son de SOLO previsualización: las metas, los proyectos y las notas se
// editan únicamente en sus módulos (cada panel trae su botón "Abrir en …"). Lo único que escribe el
// Mentor es lo que el estudiante confirma: aceptar el plan de hoy o "Crear meta" de un borrador.

import { BookOpenCheck, CalendarCheck, FolderKanban, Target } from "lucide-react";
import { usePersistedNav } from "../../store/navState";
import { useMentor } from "../../store/mentor";
import { ModuleSidebar } from "../ModuleSidebar";
import { MentorGoals } from "./MentorGoals";
import { MentorProjects } from "./MentorProjects";
import { MentorStudy } from "./MentorStudy";
import { MentorToday } from "./MentorToday";

const VIEWS = ["hoy", "metas", "proyectos", "notas"] as const;
type View = (typeof VIEWS)[number];

export function MentorModule() {
  const [stored, setView] = usePersistedNav("mentor.view", "hoy");
  const view: View = (VIEWS as readonly string[]).includes(stored) ? (stored as View) : "hoy";
  const hasDraft = useMentor((s) => (s.pending ? 1 : 0));

  return (
    <div className="flex min-w-0 flex-1">
      <ModuleSidebar
        title="Mentor"
        active={view}
        onSelect={(id) => setView(id)}
        items={[
          { id: "hoy", label: "Hoy", hint: "El plan de estudio del día", icon: <CalendarCheck /> },
          { id: "metas", label: "Metas", hint: "Resumen de metas y borradores", icon: <Target />, badge: hasDraft },
          { id: "proyectos", label: "Proyectos", hint: "Estado y plazos", icon: <FolderKanban /> },
          { id: "notas", label: "Notas y estudio", hint: "Temas a medias, repasos, errores", icon: <BookOpenCheck /> },
        ]}
      />
      <main className="@container flex min-w-0 flex-1 flex-col bg-surface" aria-label={`Mentor: ${view}`}>
        {view === "hoy" ? (
          <MentorToday />
        ) : view === "metas" ? (
          <MentorGoals />
        ) : view === "proyectos" ? (
          <MentorProjects />
        ) : (
          <MentorStudy />
        )}
      </main>
    </div>
  );
}
