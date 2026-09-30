// State of the "Depurar" panel: the code being edited, its language, and where "copy to my answer" writes.

import { create } from "zustand";

export interface CodeSeed {
  code: string;
  language: string;
  /** What the code belongs to (the exercise title), shown in the header. */
  label?: string;
  /** Writes the code into the answer box of the exercise on screen. */
  sink?: ((code: string) => void) | null;
}

interface CodePanelState {
  open: boolean;
  language: string;
  code: string;
  stdin: string;
  label: string;
  sink: ((code: string) => void) | null;
  setOpen: (v: boolean) => void;
  setCode: (code: string) => void;
  setLanguage: (language: string) => void;
  setStdin: (stdin: string) => void;
  seed: (seed: CodeSeed) => void;
  clearSink: (sink: ((code: string) => void) | null) => void;
}

export const DEFAULT_CODE: Record<string, string> = {
  python: "# Escribe tu código y pulsa Ejecutar.\nprint('hola')\n",
  javascript: "// Escribe tu código y pulsa Ejecutar.\nconsole.log('hola');\n",
  typescript: "// Escribe tu código y pulsa Ejecutar.\nconst saludo: string = 'hola';\nconsole.log(saludo);\n",
  sql: "-- Cada sentencia se ejecuta en una base SQLite vacía.\nCREATE TABLE demo (id INTEGER PRIMARY KEY, nombre TEXT);\nINSERT INTO demo (nombre) VALUES ('Ana'), ('Luis');\nSELECT * FROM demo;\n",
};

export const useCodePanel = create<CodePanelState>((set, get) => ({
  open: false,
  language: "python",
  code: DEFAULT_CODE.python!,
  stdin: "",
  label: "",
  sink: null,
  setOpen: (open) => set({ open }),
  setCode: (code) => set({ code }),
  setLanguage: (language) => {
    // An untouched example follows the language; the learner's own code never gets replaced.
    const untouched = Object.values(DEFAULT_CODE).includes(get().code);
    set({ language, ...(untouched ? { code: DEFAULT_CODE[language] ?? "" } : {}) });
  },
  setStdin: (stdin) => set({ stdin }),
  seed: (s) => set({ code: s.code, language: s.language, label: s.label ?? "", sink: s.sink ?? null }),
  clearSink: (sink) => {
    if (get().sink === sink) set({ sink: null, label: "" });
  },
}));
