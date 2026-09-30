// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const okRun = { ok: true, stdout: "5\n", stderr: "", exit_code: 0, ms: 12, timed_out: false, truncated: false, runtime: "Python 3.13" };
const trace = {
  ...okRun,
  steps: [
    { line: 1, fn: "<module>", depth: 1, vars: [], out: 0 },
    { line: 2, fn: "add", depth: 2, vars: [["a", "2"], ["b", "3"]], out: 0 },
    { line: 3, fn: "add", depth: 2, vars: [["a", "2"], ["b", "3"], ["total", "5"]], out: 0, ret: "5" },
    { line: 5, fn: "<module>", depth: 1, vars: [["x", "5"]], out: 2 },
  ],
  steps_truncated: false,
};
const invoke = vi.fn(async (method: string, ..._args: unknown[]) => {
  if (method === "code_runtimes") return { items: [{ id: "python", label: "Python", available: true, runtime: "Python 3.13" }] };
  if (method === "code_run") return okRun;
  if (method === "code_trace") return trace;
  return {};
});
(window as unknown as { nv: unknown }).nv = { invoke: (m: string, a: unknown[]) => invoke(m, ...(a ?? [])) };

import { useApp } from "../../store/app";
import { useCodePanel } from "../../store/codePanel";
import { CodePanel } from "./CodePanel";

let container: HTMLDivElement;
let root: Root;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const button = (re: RegExp) => [...container.querySelectorAll("button")].find((b) => re.test(`${b.textContent} ${b.title}`))!;

beforeEach(() => {
  invoke.mockClear();
  useCodePanel.setState({ open: true, language: "python", code: "def add(a, b):\n    total = a + b\n    return total\n\nx = add(2, 3)\nprint(x)\n", stdin: "", label: "", sink: null });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("CodePanel", () => {
  it("runs the code and shows the output, the time and the runtime", async () => {
    act(() => root.render(<CodePanel />));
    await flush();
    act(() => button(/Ejecutar/).click());
    await flush();
    expect(invoke).toHaveBeenCalledWith("code_run", "python", expect.stringContaining("def add"), "");
    const out = container.querySelector("[data-testid=output]")!;
    expect(out.textContent).toContain("Terminó bien");
    expect(out.textContent).toContain("5");
    expect(out.textContent).toContain("Python 3.13");
  });

  it("steps through the trace: highlights the line, lists the variables and moves with the buttons", async () => {
    act(() => root.render(<CodePanel />));
    await flush();
    act(() => button(/Paso a paso/).click());
    await flush();
    expect(invoke).toHaveBeenCalledWith("code_trace", "python", expect.any(String), "");
    const stepper = container.querySelector("[data-testid=stepper]")!;
    expect(stepper.textContent).toContain("paso 1 de 4");
    expect((container.querySelector("[data-testid=current-line]") as HTMLElement).style.top).toBe("8px");
    act(() => button(/Paso siguiente/).click());
    expect(stepper.textContent).toContain("paso 2 de 4");
    expect(stepper.textContent).toContain("add()");
    expect(stepper.textContent).toContain("nivel de llamada 2");
    expect(stepper.textContent).toMatch(/a\s*2/);
    act(() => button(/Paso siguiente/).click());
    expect(stepper.textContent).toContain("devuelve");
    act(() => button(/Último paso/).click());
    expect(stepper.textContent).toContain("paso 4 de 4");
    expect(stepper.textContent).toContain("Salida hasta aquí");
    // The code is frozen while it is being stepped, and leaving the stepper unfreezes it.
    expect((container.querySelector("textarea[aria-label=Código]") as HTMLTextAreaElement).readOnly).toBe(true);
    act(() => button(/Salir del paso a paso/).click());
    expect(container.querySelector("[data-testid=stepper]")).toBeNull();
    expect((container.querySelector("textarea[aria-label=Código]") as HTMLTextAreaElement).readOnly).toBe(false);
  });

  it("copies the code to the answer of the exercise that opened it", async () => {
    const sink = vi.fn();
    useCodePanel.setState({ sink, label: "Sum of two numbers" });
    act(() => root.render(<CodePanel />));
    await flush();
    expect(container.textContent).toContain("Sum of two numbers");
    act(() => button(/A mi respuesta/).click());
    expect(sink).toHaveBeenCalledWith(expect.stringContaining("def add"));
    expect(useApp.getState().toasts.some((t) => /copiado/i.test(t.text))).toBe(true);
  });

  it("does not offer the step mode for SQL and switches an untouched example with the language", async () => {
    useCodePanel.setState({ code: "-- Cada sentencia se ejecuta en una base SQLite vacía.\nSELECT 1;\n" });
    act(() => root.render(<CodePanel />));
    await flush();
    const select = container.querySelector("select[aria-label=Lenguaje]") as HTMLSelectElement;
    act(() => {
      select.value = "sql";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect((button(/Paso a paso/) as HTMLButtonElement).disabled).toBe(true);
    expect(useCodePanel.getState().language).toBe("sql");
  });
});
