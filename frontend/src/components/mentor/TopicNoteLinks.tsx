// Mentor → Notas: «Abrir nota» de un tema. Dos accesos directos a lo que el tema tiene en la vault: la Teoría (el apunte .md de la carpeta)
// y los Ejercicios (el archivo de práctica). Reutiliza `openTopicNote` / `openTopic`; no lee nada hasta que se pulsa.

import { cn } from "../ui";
import { openTopic, openTopicNote } from "./openTopic";

const BTN = "inline-flex min-h-8 flex-none items-center rounded-md px-1.5 text-[12.5px] font-medium text-accent-text underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent";

export function TopicNoteLinks({ folder, title, practice = true, className }: { folder: string; title: string; /** `false`: solo la Teoría (donde ya hay un acceso a los ejercicios) */ practice?: boolean; className?: string }) {
  return (
    <span role="group" aria-label={`Abrir nota de ${title}`} className={cn("inline-flex flex-none items-center", className)} data-testid="topic-note-links">
      <button type="button" className={BTN} onClick={() => void openTopicNote(folder)} aria-label={`Abrir la nota de teoría: ${title}`} title="Abrir el apunte de teoría en Notas" data-testid="topic-note-theory">
        Teoría
      </button>
      {practice && (
        <button type="button" className={BTN} onClick={() => void openTopic(folder)} aria-label={`Abrir la nota de ejercicios: ${title}`} title="Abrir el archivo de práctica en Notas" data-testid="topic-note-practice">
          Ejercicios
        </button>
      )}
    </span>
  );
}
