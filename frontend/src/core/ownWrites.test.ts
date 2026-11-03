import { beforeEach, describe, expect, it } from "vitest";
import { clearOwnWrites, isOwnWriteEcho, markOwnWrite, OWN_WRITE_ECHO_MS } from "./ownWrites.js";

beforeEach(() => clearOwnWrites());

describe("escrituras propias", () => {
  it("reconoce el eco de lo que la app acaba de escribir, varias veces, hasta que caduca", () => {
    markOwnWrite("/vault/Notas/a.md", 1000);
    expect(isOwnWriteEcho("/vault/Notas/a.md", 1100)).toBe(true);
    expect(isOwnWriteEcho("/vault/Notas/a.md", 2500)).toBe(true);
    expect(isOwnWriteEcho("/vault/Notas/a.md", 1000 + OWN_WRITE_ECHO_MS + 1)).toBe(false);
  });

  it("no confunde otros archivos ni rutas equivalentes mal escritas", () => {
    markOwnWrite("/vault/Notas/a.md", 1000);
    expect(isOwnWriteEcho("/vault/Notas/b.md", 1100)).toBe(false);
    expect(isOwnWriteEcho("/vault/Notas/../Notas/a.md", 1100)).toBe(true);
  });
});
