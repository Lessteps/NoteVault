// Mentor: un espacio con varios paneles (Hoy, Metas, Proyectos, Notas y la Conversación con el Mentor).
//
// Todos los paneles de datos son de SOLO previsualización: las metas, los proyectos y las notas se
// editan únicamente en sus módulos (cada panel trae su botón "Abrir en …"). Lo único que escribe el
// Mentor es lo que el estudiante confirma: aceptar el plan de hoy o "Crear meta" de un borrador.

import { BookOpenCheck, CalendarCheck, FolderKanban, MessagesSquare, Target } from "lucide-react";
import { usePersistedNav } from "../../store/navState";
import { useMentor } from "../../store/mentor";
import { ModuleSidebar } from "../ModuleSidebar";
import { MentorChat } from "./MentorChat";
import { MentorGoals } from "./MentorGoals";
import { MentorProjects } from "./MentorProjects";
import { MentorStudy } from "./MentorStudy";
import { MentorToday } from "./MentorToday";

const VIEWS = ["hoy", "metas", "proyectos", "notas", "chat"] as const;
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
          { id: "metas", label: "Metas", hint: "Previsualización y borradores", icon: <Target />, badge: hasDraft },
          { id: "proyectos", label: "Proyectos", hint: "Estado y plazos", icon: <FolderKanban /> },
          { id: "notas", label: "Notas y estudio", hint: "Temas a medias, repasos, errores", icon: <BookOpenCheck /> },
          { id: "chat", label: "Conversación", hint: "Crea metas con el Mentor", icon: <MessagesSquare /> },
        ]}
      />
      <main className="@container flex min-w-0 flex-1 flex-col bg-surface" aria-label={`Mentor: ${view}`}>
        {view === "hoy" ? (
          <MentorToday />
        ) : view === "metas" ? (
          <MentorGoals />
        ) : view === "proyectos" ? (
          <MentorProjects />
        ) : view === "notas" ? (
          <MentorStudy />
        ) : (
          <MentorChat onOpenGoals={() => setView("metas")} />
        )}
      </main>
    </div>
  );
}
