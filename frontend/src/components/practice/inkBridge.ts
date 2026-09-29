// How the drawing pad reaches the rest of the app: opening it as a split view
// (creating its file beside the open note) and handing recognised LaTeX to the
// place the user is writing in.

import { latexForNote } from "../../lib/inkFile";
import { useApp } from "../../store/app";
import { insertAtCursor } from "../notes/SourceEditor";

type AnswerTarget = (latex: string, display: boolean) => void;

/** The answer box of the exercise on screen, while there is one. */
let answerTarget: AnswerTarget | null = null;

export function registerAnswerTarget(target: AnswerTarget | null): void {
  answerTarget = target;
}

/** Puts LaTeX where the user is writing: the exercise answer, the open editor, or the end of the note. */
export function insertLatex(latex: string, display: boolean): "answer" | "editor" | "note" | "none" {
  const tex = latex.trim();
  if (!tex) return "none";
  if (answerTarget) {
    answerTarget(tex, display);
    return "answer";
  }
  const text = latexForNote(tex, display);
  if (insertAtCursor(text)) return "editor";
  const app = useApp.getState();
  const note = app.active ? app.notes[app.active] : undefined;
  if (!note || note.kind !== "note") return "none";
  app.editRaw(note.path, `${note.raw.replace(/\s*$/, "")}\n\n${text.trim()}\n`);
  return "note";
}

/** Opens the drawing pad in a split view. Nothing is written to disk until "Crear archivo". */
export function openInkPad(): void {
  const app = useApp.getState();
  const folder = app.active?.includes("/") ? app.active.slice(0, app.active.lastIndexOf("/")) : "";
  app.setInkDraft({ folder });
}
