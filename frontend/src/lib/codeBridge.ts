// How an exercise hands its code to the debugger panel of the right column.

import { isFaceOpen, toggleFace } from "./panelFaces";
import { useCodePanel, type CodeSeed } from "../store/codePanel";

/** The first fenced code block of a text (without the fences), or "" when there is none. */
export function firstFencedCode(text: string): string {
  const m = /^[ \t]*(`{3,}|~{3,})[^\n]*\n([\s\S]*?)\n[ \t]*\1[ \t]*$/m.exec(text);
  return m ? m[2]! : "";
}

/** The answer as code: a fenced block when the learner wrote one, else the whole text. */
export function answerAsCode(answer: string): string {
  return firstFencedCode(answer) || answer;
}

/** Puts `seed` in the panel and opens it (closing whatever other face was open). */
export function openCodePanel(seed: CodeSeed): void {
  useCodePanel.getState().seed(seed);
  if (!isFaceOpen("code")) toggleFace("code");
}
