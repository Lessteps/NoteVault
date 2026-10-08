// @vitest-environment jsdom
//
// Regresión de DESBORDES (jsdom no mide el layout; la medición real se hace con la auditoría CDP): los botones y chips comunes parten línea y
// nunca son más anchos que su contenedor (`max-w-full` + `whitespace-normal` + `break-words`), y la variante `wrap` además se alinea a la
// izquierda y deja de ser `flex-none`. Es lo que arregló el aviso «Muchas Bases al principio» y su botón en tarjetas estrechas.

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Chip, GhostButton, PrimaryButton } from "./forms";

let host: HTMLDivElement;
let root: Root;
const render = (el: React.ReactNode) => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(el));
};
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});
const classes = (el: Element | null) => (el?.className ?? "").split(/\s+/);

describe("botones y chips que no desbordan", () => {
  it("PrimaryButton y GhostButton: max-w-full, texto que parte línea y sin nowrap", () => {
    render(<><PrimaryButton large>Generar la práctica del plan con el Mentor</PrimaryButton><GhostButton>Reduce Bases a lo esencial y aplícalas junto al lenguaje</GhostButton></>);
    for (const b of host.querySelectorAll("button")) {
      const c = classes(b);
      expect(c).toContain("max-w-full");
      expect(c).toContain("whitespace-normal");
      expect(c).toContain("break-words");
      expect(c).not.toContain("whitespace-nowrap");
    }
  });

  it("GhostButton wrap: alto automático, alineado a la izquierda y puede encogerse (flex-initial)", () => {
    render(<GhostButton wrap>Pedir ajuste: «Reduce Bases a lo esencial y aplícalas junto al lenguaje»</GhostButton>);
    const c = classes(host.querySelector("button"));
    expect(c).toEqual(expect.arrayContaining(["h-auto", "flex-initial", "text-left", "max-w-full"]));
    expect(c).not.toContain("flex-none");
  });

  it("Chip: nunca más ancho que su contenedor y con corte de palabras largas", () => {
    render(<Chip large>Conocimientos de backend · 18</Chip>);
    const c = classes(host.querySelector("span"));
    expect(c).toContain("max-w-full");
    expect(c).toContain("break-words");
    expect(c).not.toContain("whitespace-nowrap");
  });
});
