// Contraste de los tokens de las vistas accesibles (.nv-a11y): texto normal ≥ 4,5:1, componentes y foco ≥ 3:1, en los dos temas.
// Lee los valores reales de styles.css (los tokens base de cada tema + lo que redefine .nv-a11y), así un cambio de color que
// rompa el contraste falla aquí.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "styles.css"), "utf8").replace(/\r\n/g, "\n");

/** Las declaraciones `--x: valor;` de un bloque, a partir de su selector exacto. */
function block(selector: string): Record<string, string> {
  const i = css.indexOf(`${selector} {`);
  if (i < 0) throw new Error(`no hay bloque ${selector}`);
  const body = css.slice(css.indexOf("{", i) + 1, css.indexOf("}", i));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) out[m[1]!] = m[2]!.trim();
  return out;
}

const channels = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
const lum = (hex: string): number => {
  const [r, g, b] = channels(hex).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string): number => {
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
const mix = (a: string, b: string, p: number): string => "#" + [0, 1, 2].map((i) => Math.round(channels(a)[i]! * 255 * p + channels(b)[i]! * 255 * (1 - p)).toString(16).padStart(2, "0")).join("");

const base = { dark: block(":root,\n[data-theme=\"dark\"]"), light: block("[data-theme=\"light\"]") };
const scoped = { dark: block(".nv-a11y"), light: block("[data-theme=\"light\"] .nv-a11y") };

for (const theme of ["dark", "light"] as const) {
  // en claro, [data-theme=light] .nv-a11y redefine lo que cambia y el resto viene del tema claro (el bloque base de .nv-a11y es el oscuro)
  const tok = (name: string): string => (theme === "light" ? scoped.light[name] ?? base.light[name]! : scoped.dark[name] ?? base.dark[name]!);
  const surfaces = [tok("--nv-surface"), tok("--nv-card"), tok("--nv-hover")];

  describe(`.nv-a11y · tema ${theme}`, () => {
    it.each(["--nv-text", "--nv-dim", "--nv-faint", "--nv-accent-text", "--nv-mint", "--nv-warn", "--nv-danger", "--nv-info"])("el texto %s llega a 4,5:1 sobre surface y card", (name) => {
      for (const bg of surfaces.slice(0, 2)) expect(ratio(tok(name), bg), `${name} ${tok(name)} sobre ${bg}`).toBeGreaterThanOrEqual(4.5);
    });

    it("el texto secundario (dim) llega a 4,5:1 también sobre hover", () => {
      expect(ratio(tok("--nv-dim"), tok("--nv-hover"))).toBeGreaterThanOrEqual(4.5);
    });

    it("el texto blanco del botón primario llega a 4,5:1", () => {
      expect(ratio("#ffffff", tok("--nv-btn"))).toBeGreaterThanOrEqual(4.5);
      expect(ratio("#ffffff", tok("--nv-btn-hover"))).toBeGreaterThanOrEqual(4.5);
    });

    it("los chips (texto acercado al color del tema sobre su tinte del 16 %) llegan a 4,5:1", () => {
      for (const name of ["--nv-accent", "--nv-mint", "--nv-warn", "--nv-danger", "--nv-info", "--nv-faint", "--nv-practice"]) {
        const colour = tok(name);
        for (const bg of surfaces.slice(0, 2)) {
          const text = mix(colour, tok("--nv-text"), 0.75);
          expect(ratio(text, mix(colour, bg, 0.16)), `chip ${name} sobre ${bg}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    });

    it("el borde de los controles y el anillo de foco llegan a 3:1", () => {
      for (const bg of surfaces.slice(0, 2)) {
        expect(ratio(tok("--nv-ctl-border"), bg), "borde de control").toBeGreaterThanOrEqual(3);
        expect(ratio(tok("--nv-focus"), bg), "anillo de foco").toBeGreaterThanOrEqual(3);
      }
    });
  });
}
