// Runs and steps through the learner's code from the "Depurar" panel of the right column (programming spaces).

import { availableRuntimes, runCode, traceCode } from "../../core/codeDebugger.js";
import type { AppState } from "../appState.js";

const MAX_CODE = 200_000;

function checked(code: string): string {
  const text = String(code ?? "");
  if (text.length > MAX_CODE) throw new Error("El código es demasiado largo para ejecutarlo aquí.");
  return text;
}

export function codeDebugApi(_app: AppState) {
  return {
    code_runtimes(): Record<string, unknown> {
      return { items: availableRuntimes() };
    },

    async code_run(language: string, code: string, stdin = ""): Promise<Record<string, unknown>> {
      return { ...(await runCode(String(language), checked(code), { stdin: String(stdin ?? "") })) };
    },

    async code_trace(language: string, code: string, stdin = ""): Promise<Record<string, unknown>> {
      return { ...(await traceCode(String(language), checked(code), { stdin: String(stdin ?? "") })) };
    },
  };
}
