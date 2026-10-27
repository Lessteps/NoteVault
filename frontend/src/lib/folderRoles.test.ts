import { describe, expect, it } from "vitest";
import { clearRole, emptyFolderRoles, labelOfFolder, normFolder, roleOf, sanitizeFolderRoles, setRole } from "./folderRoles";

describe("propiedades de carpeta", () => {
  it("normaliza la ruta: \\ → /, sin barras sobrantes", () => {
    expect(normFolder("\\Programación\\\\5 Frontend/HTML/")).toBe("Programación/5 Frontend/HTML");
  });

  it("el nombre legible quita la numeración", () => {
    expect(labelOfFolder("Programación/5 Frontend/HTML")).toBe("HTML");
    expect(labelOfFolder("Programación/4 Backend")).toBe("Backend");
    expect(labelOfFolder("Programación/5 Frontend/5.18 HTML")).toBe("HTML");
  });

  it("sanea el archivo: ignora basura y roles inválidos", () => {
    const f = sanitizeFolderRoles({ autoAdd: true, roles: { "A/B": { role: "area", objective: "  para   entrevistas ", updatedAt: "x" }, "C": { role: "otro" }, "": { role: "area" } } });
    expect(f.autoAdd).toBe(true);
    expect(Object.keys(f.roles)).toEqual(["A/B"]);
    expect(f.roles["A/B"]!.objective).toBe("para entrevistas");
    expect(sanitizeFolderRoles(null)).toEqual(emptyFolderRoles());
    expect(sanitizeFolderRoles("x").autoAdd).toBe(false);
  });

  it("setRole no muta, recorta el objetivo y rechaza lo inválido", () => {
    const base = emptyFolderRoles();
    const next = setRole(base, "X/Y/", "subject", "o".repeat(500), "2026-10-27");
    expect(base.roles).toEqual({});
    expect(roleOf(next, "X\\Y")!.objective).toHaveLength(200);
    expect(() => setRole(base, "", "area", "", "t")).toThrow(/carpeta/);
    expect(() => setRole(base, "X", "nada", "", "t")).toThrow(/Rol inválido/);
  });

  it("clearRole quita solo esa carpeta", () => {
    let f = setRole(emptyFolderRoles(), "A", "area", "a", "t");
    f = setRole(f, "B", "container", "b", "t");
    expect(Object.keys(clearRole(f, "A").roles)).toEqual(["B"]);
  });
});
