// El escaneo de la vault no puede cortarse en silencio: con un tope de 4 000 notas, una vault real (9 000+) perdía los temas que caían después y la app
// no los veía (no entraban al plan ni salían en «Añadir más temas»).
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_SCAN_NOTES, VaultManager } from "./vaultManager";

let dir = "";
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("tope del escaneo de la vault", () => {
  it("el tope deja pasar una vault de estudio real (≥ 20 000 notas) y no es el de 4 000 que ya falló", () => {
    expect(MAX_SCAN_NOTES).toBeGreaterThanOrEqual(20_000);
  });

  it("una vault de más de 4 000 notas se lee entera y no marca corte", () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_cap_"));
    for (let a = 0; a < 5; a++) {
      const d = path.join(dir, `area${a}`);
      fs.mkdirSync(d, { recursive: true });
      for (let i = 0; i < 900; i++) fs.writeFileSync(path.join(d, `n${i}.md`), "x");
    }
    const vm = new VaultManager(dir);
    expect(vm.notePaths().length).toBe(4500);
    expect(vm.scanTruncated).toBe(false);
  });

  it("si un tope corta de verdad, lo dice (scanTruncated) en vez de callar", () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_cap_"));
    for (let i = 0; i < 20; i++) fs.writeFileSync(path.join(dir, `n${i}.md`), "x");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const vm = new VaultManager(dir);
    expect(vm.notePaths(10).length).toBe(10);
    expect(vm.scanTruncated).toBe(true);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
