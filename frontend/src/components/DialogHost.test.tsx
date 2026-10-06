// @vitest-environment jsdom
//
// Los diálogos de confirmar / pedir texto: accesibles (rol, nombre, foco inicial, foco atrapado, Escape y retorno del foco).

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { askText, confirmAction, DialogHost } from "./ui";

let host: HTMLDivElement;
let root: Root;
let opener: HTMLButtonElement;
const tick = () => act(async () => { await new Promise((r) => setTimeout(r, 5)); });
const key = async (el: Element, k: string, init: KeyboardEventInit = {}) => { await act(async () => { el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, ...init })); }); };

beforeEach(async () => {
  host = document.createElement("div");
  document.body.appendChild(host);
  opener = document.createElement("button");
  opener.textContent = "abrir";
  document.body.appendChild(opener);
  root = createRoot(host);
  await act(async () => { root.render(<DialogHost />); });
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  opener.remove();
});

describe("DialogHost accesible", () => {
  it("confirmar: alertdialog modal con nombre y descripción, foco inicial en la acción y Escape cancela devolviendo el foco", async () => {
    opener.focus();
    let result: boolean | undefined;
    await act(async () => { void confirmAction("Eliminar plan", "Irá a la papelera.", "Eliminar", true).then((v) => (result = v)); });
    await tick();
    const dlg = host.querySelector("[role=alertdialog]")!;
    expect(dlg.getAttribute("aria-modal")).toBe("true");
    expect(host.querySelector(`#${dlg.getAttribute("aria-labelledby")}`)!.textContent).toBe("Eliminar plan");
    expect(host.querySelector(`#${dlg.getAttribute("aria-describedby")}`)!.textContent).toBe("Irá a la papelera.");
    expect(document.activeElement!.textContent).toBe("Eliminar");
    await key(dlg, "Escape");
    await tick();
    expect(result).toBe(false);
    expect(host.querySelector("[role=alertdialog]")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("el foco queda atrapado: Tab en el último pasa al primero y Mayús+Tab en el primero al último", async () => {
    await act(async () => { void confirmAction("Eliminar plan", "x", "Eliminar"); });
    await tick();
    const dlg = host.querySelector("[role=alertdialog]")!;
    const [cancel, ok] = [...dlg.querySelectorAll("button")] as HTMLButtonElement[];
    ok!.focus();
    await key(dlg, "Tab");
    expect(document.activeElement).toBe(cancel);
    await key(dlg, "Tab", { shiftKey: true });
    expect(document.activeElement).toBe(ok);
  });

  it("pedir texto: diálogo con el campo enfocado y asociado al título; Enter acepta", async () => {
    let result: string | null | undefined;
    await act(async () => { void askText("Nombre del plan", "Mi plan", "Guardar").then((v) => (result = v)); });
    await tick();
    const dlg = host.querySelector("[role=dialog]")!;
    const input = dlg.querySelector("input")!;
    expect(document.activeElement).toBe(input);
    expect(input.getAttribute("aria-labelledby")).toBe(dlg.getAttribute("aria-labelledby"));
    await key(input, "Enter");
    await tick();
    expect(result).toBe("Mi plan");
  });
});
