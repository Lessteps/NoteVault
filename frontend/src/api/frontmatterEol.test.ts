import { describe, it, expect } from "vitest";
import { setFrontmatterKeys } from "./appState.js";

// A Windows vault can hold CRLF files (git with autocrlf, editors, Syncthing).
// `setFrontmatterKeys` used to split on "\n" and re-join on "\n", so merely
// editing one property rewrote the whole file with mixed line endings: the
// lines it touched became LF, the ones it left kept their \r. On a file synced
// across machines that shows up as a permanent phantom diff.
//
// The user-facing path was never broken, because `note_set_properties` wrapped
// the call and restored the CRLF itself. This was latent: any new caller would
// have inherited the corruption. The e2e spec `e2e/note-integrity.spec.ts`
// covers the behaviour end to end, NV-E-002 and NV-E-003.

describe("setFrontmatterKeys y finales de linea", () => {
  it("una nota LF sigue saliendo LF", () => {
    const text = "---\ntitle: A\n---\n\nhola\n";
    const out = setFrontmatterKeys(text, { status: "activo" });
    expect(out).toContain("\n");
    expect(out).not.toContain("\r");
  });

  it("una nota CRLF conserva el CRLF al cambiar una propiedad", () => {
    const text = "---\r\ntitle: A\r\n---\r\n\r\nhola\r\n";
    const out = setFrontmatterKeys(text, { status: "activo" });
    expect(out).not.toMatch(/[^\r]\n/);
  });

  it("una nota CRLF conserva el CRLF al anadir clave nueva", () => {
    const text = "---\r\ntitle: A\r\n---\r\n\r\nhola\r\n";
    const out = setFrontmatterKeys(text, { tags: ["x", "y"] });
    expect(out).not.toMatch(/[^\r]\n/);
  });

  it("una nota CRLF conserva el CRLF al quitar la ultima clave", () => {
    const text = "---\r\ntitle: A\r\n---\r\n\r\nhola\r\n";
    const out = setFrontmatterKeys(text, { title: null });
    expect(out).not.toMatch(/[^\r]\n/);
  });

  it("una nota CRLF sin frontmatter conserva el CRLF del cuerpo", () => {
    const text = "solo cuerpo\r\nsegunda linea\r\n";
    const out = setFrontmatterKeys(text, { title: "A" });
    expect(out).not.toMatch(/[^\r]\n/);
  });
});
