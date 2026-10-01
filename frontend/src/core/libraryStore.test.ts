import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LAYOUT } from "./vaultFormat";
import { LibraryStore, type LibraryUserEntry } from "./libraryStore";

describe("LibraryStore", () => {
  let tmpDir: string;

  const file = () => path.join(tmpDir, LAYOUT.library);

  const write = (raw: string) => {
    fs.mkdirSync(path.dirname(file()), { recursive: true });
    fs.writeFileSync(file(), raw, "utf-8");
  };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nv-library-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("sin fichero, la biblioteca propia está vacía", () => {
    expect(new LibraryStore(tmpDir).entries()).toEqual([]);
  });

  it("guarda y relee las entradas", () => {
    new LibraryStore(tmpDir).save([
      {
        slug: "mia-a1",
        name: "Press banca",
        equipment: "Barra",
        muscles: { primary: ["pectoral"], secondary: [] },
        how_to: "Baja al pecho",
      },
    ]);
    const reread = new LibraryStore(tmpDir).entries();
    expect(reread).toHaveLength(1);
    expect(reread[0]!.name).toBe("Press banca");
  });

  it("dos entradas con el mismo nombre, aunque el slug difiera, colapsan a una", () => {
  // Revisión: un fichero editado a mano puede llevar el mismo ejercicio con dos
  // slugs. Sin esto, la biblioteca muestra las dos y el duplicado es real.
  const entry = (slug: string, name: string): LibraryUserEntry => ({
    slug,
    name,
    equipment: "",
    muscles: { primary: [], secondary: [] },
    how_to: "",
  });
  write(
    JSON.stringify({ entries: [entry("mia-a", "Mi press"), entry("mia-b", "  mi   PRESS ")] }),
  );
  const entries = new LibraryStore(tmpDir).entries();
  expect(entries).toHaveLength(1);
  expect(entries[0]!.slug).toBe("mia-b");
});

it("un fichero corrupto no rompe: vacío y sin lanzar", () => {
    write("{ roto");
    expect(() => new LibraryStore(tmpDir).entries()).not.toThrow();
    expect(new LibraryStore(tmpDir).entries()).toEqual([]);
  });

  it("el mismo slug repetido dentro del fichero: gana la última", () => {
    // Review Focus 4: fichero escrito a mano con duplicados.
    const entry = (slug: string, name: string): LibraryUserEntry => ({
      slug,
      name,
      equipment: "",
      muscles: { primary: [], secondary: [] },
      how_to: "",
    });
    write(JSON.stringify({ entries: [entry("mia-a1", "el primero"), entry("mia-a1", "el segundo")] }));
    const entries = new LibraryStore(tmpDir).entries();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.name).toBe("el segundo");
  });

  it("una entrada sin muscles.primary se normaliza a lista vacía", () => {
    // El resto del código espera string[], no undefined.
    write(
      JSON.stringify({ entries: [{ slug: "mia-a1", name: "A", muscles: { primary: null } }] }),
    );
    expect(new LibraryStore(tmpDir).entries()[0]!.muscles.primary).toEqual([]);
  });

  it("una entrada sin slug se descarta: sin identificador no se puede editar", () => {
    write(JSON.stringify({ entries: [{ slug: "", name: "Sin slug" }, { slug: "mia-b", name: "Con slug" }] }));
    const entries = new LibraryStore(tmpDir).entries();
    expect(entries.map((e) => e.slug)).toEqual(["mia-b"]);
  });
});
