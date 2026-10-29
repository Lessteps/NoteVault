import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AppState } from "./appState.js";
import { invalidateVaultCaches } from "./vaultInvalidate.js";
import { vaultScan } from "./vaultScan.js";

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_inval_"));
  fs.mkdirSync(path.join(dir, ".notevault"), { recursive: true });
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("invalidateVaultCaches", () => {
  it("un tema escrito fuera de la app aparece en el escaneo tras invalidar, sin reiniciar", () => {
    const app = new AppState(dir);
    fs.mkdirSync(path.join(dir, "Programación", "5 Frontend", "HTML", "5.18.1 A"), { recursive: true });
    fs.writeFileSync(path.join(dir, "Programación", "5 Frontend", "HTML", "5.18.1 A", "5.18.1 A.md"), "---\ntitle: A\n---\n# A\n");
    const before = vaultScan(app).notes.length;
    // lo que haría Antigravity mientras la app está abierta
    fs.mkdirSync(path.join(dir, "Programación", "5 Frontend", "HTML", "5.18.2 B"), { recursive: true });
    fs.writeFileSync(path.join(dir, "Programación", "5 Frontend", "HTML", "5.18.2 B", "5.18.2 B.md"), "---\ntitle: B\n---\n# B\n");
    expect(vaultScan(app).notes.length).toBe(before); // la caché aún lo esconde
    invalidateVaultCaches(dir);
    expect(vaultScan(app).notes.length).toBe(before + 1);
  });
});
