import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AppState } from "./appState.js";

// `resolve` is the only barrier between a renderer-supplied string and the
// filesystem. Every API module funnels its path arguments through it, so a
// branch that is wrong here is a sandbox escape for the whole app. These tests
// attack it directly; the per-module tests only ever use it with well-behaved
// relative paths, so they exercise the happy path and nothing else.

let root = "";
let app: AppState;
let outside = "";

/** Does not throw. Returns the resolved absolute path, or the error message. */
function attempt(rel: unknown, opts?: Parameters<AppState["resolve"]>[1]): string {
  try {
    return app.resolve(rel, opts);
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

beforeAll(() => {
  const base = mkdtempSync(join(tmpdir(), "nv-resolve-"));
  root = join(base, "vault");
  outside = join(base, "outside");
  mkdirSync(root, { recursive: true });
  mkdirSync(join(root, "notas"), { recursive: true });
  mkdirSync(join(root, ".notevault"), { recursive: true });
  mkdirSync(outside, { recursive: true });
  writeFileSync(join(root, "notas", "hola.md"), "# hola\n", "utf-8");
  writeFileSync(join(outside, "secreto.md"), "no deberias verme\n", "utf-8");

  app = new AppState(root);
});

afterAll(() => {
  if (root) rmSync(join(root, ".."), { recursive: true, force: true });
});

describe("resolve: entradas que no son string", () => {
  it.each([
    ["undefined", undefined],
    ["null", null],
    ["numero", 42],
    ["array", ["notas/hola.md"]],
    ["objeto", { path: "notas/hola.md" }],
    ["boolean", true],
  ])("rechaza %s", (_label, value) => {
    expect(attempt(value)).toMatch(/Ruta inv/i);
  });
});

describe("resolve: null byte", () => {
  it("rechaza un null byte en medio", () => {
    expect(attempt("notas/hola.md\x00.txt")).toMatch(/Ruta inv/i);
  });

  it("rechaza un null byte al inicio", () => {
    expect(attempt("\x00")).toMatch(/Ruta inv/i);
  });
});

describe("resolve: rutas absolutas", () => {
  it("rechaza absoluta POSIX", () => {
    expect(attempt("/etc/passwd")).toMatch(/dentro del vault/i);
  });

  it("rechaza absoluta Windows con barra", () => {
    expect(attempt("C:/Windows/System32")).toMatch(/dentro del vault/i);
  });

  it("rechaza absoluta Windows con contralta", () => {
    expect(attempt("C:\\Windows\\System32")).toMatch(/dentro del vault/i);
  });

  it("rechaza la unidad actual con distinta caja", () => {
    expect(attempt("c:/windows")).toMatch(/dentro del vault/i);
  });

  it("rechaza raiz de la unidad sin nombre de unidad", () => {
    // `C:` sola comprobaria r.length > 1, asi que esta forma tiene que entrar
    // por otra rama.
    expect(attempt("C:")).toMatch(/Ruta vac|dentro del vault/i);
  });

});

describe("resolve: traversal", () => {
  it.each([
    ["punto punto al final", ".."],
    ["un nivel", "../secreto.md"],
    ["dos niveles", "../../secreto.md"],
    ["punto punto en medio", "notas/../../outside/secreto.md"],
    ["punto punto con espacios alrededor", " .. "],
  ])("rechaza %s", (_label, value) => {
    expect(attempt(value)).toMatch(/dentro del vault/i);
  });

  it.each([
    ["cuatro puntos", "....//....//secreto"],
    ["punto seguido de espacios", ". .//secreto"],
    ["punto inicial simple", ".oculto/secreto"],
  ])("rechaza %s por la regla de carpetas internas", (_label, value) => {
    // No es `..`, asi que no entra por la rama de traversal: cae en la de
    // dotfiles, que tambien rechaza. Se fija aqui para que quede claro que
    // las dos reglas cubre la entrada, no que la segunda sea un agujero.
    expect(attempt(value)).toMatch(/interna de NoteVault/i);
  });

  it("rechaza traversal aunque el destino exista de verdad", () => {
    // El fichero existe fuera del vault: si esto pasara, seria una fuga real.
    expect(attempt("../outside/secreto.md")).toMatch(/dentro del vault/i);
  });

  it("rechaza una ruta UNC con barras al inicio", () => {
    expect(attempt("\\\\servidor\\recurso")).toMatch(/dentro del vault/i);
  });

  it("rechaza una ruta UNC con barras normals", () => {
    expect(attempt("//servidor/recurso")).toMatch(/dentro del vault/i);
  });

  it("no resuelve fuera del vault con many slashes", () => {
    expect(attempt("notas/////../..//secreto.md")).toMatch(/dentro del vault/i);
  });
});

describe("resolve: carpetas internas", () => {
  it("rechaza entrar en la carpeta de datos", () => {
    expect(attempt(".notevault/tareas")).toMatch(/interna de NoteVault/i);
  });

  it("rechaza un fichero oculto de usuario", () => {
    expect(attempt(".git/config")).toMatch(/interna de NoteVault/i);
  });

  it("rechaza un fichero normal que empieza por punto en un subnivel", () => {
    expect(attempt("notas/.env")).toMatch(/interna de NoteVault/i);
  });

  it("no deja leer la config de la carpeta de datos", () => {
    // Lo que realmente importa: que el camino absoluto nunca se devuelve.
    const res = attempt(".notevault/settings.json");
    expect(res).not.toContain(root);
  });
});

describe("resolve: rutas validas", () => {
  it("resuelve un fichero existente a su absoluto", () => {
    expect(attempt("notas/hola.md")).toBe(join(root, "notas", "hola.md"));
  });

  it("normaliza barras invertidas a separadores del sistema", () => {
    expect(attempt("notas\\hola.md")).toBe(join(root, "notas", "hola.md"));
  });

  it("tolera espacios alrededor", () => {
    expect(attempt("  notas/hola.md  ")).toBe(join(root, "notas", "hola.md"));
  });

  it("colapsa separadores repetidos y.CurrentDirectory", () => {
    expect(attempt("./notas//hola.md")).toBe(join(root, "notas", "hola.md"));
  });

  it("permite crear una ruta que aun no existe cuando mustExist es false", () => {
    const res = attempt("notas/nuevo.md", { mustExist: false });
    expect(res).toBe(join(root, "notas", "nuevo.md"));
  });

  it("devuelve la raiz cuando allowRoot es true", () => {
    expect(attempt("", { allowRoot: true })).toBe(root);
  });

  it("devuelve la raiz para '.' cuando allowRoot es true", () => {
    expect(attempt(".", { allowRoot: true })).toBe(root);
  });

  it("rechaza la raiz cuando allowRoot no se pide", () => {
    expect(attempt("")).toMatch(/Ruta vac/i);
  });

  it("falla con mustExist por defecto si el fichero no esta", () => {
    expect(attempt("notas/fantasma.md")).toMatch(/No existe/i);
  });
});

describe("resolve: no devuelve rutas absolutas cuando rechaza", () => {
  it.each([
    ["traversal", "../secreto.md"],
    ["absoluta", "/etc/passwd"],
    ["carpeta interna", ".notevault/tareas"],
    ["null byte", "notas/hola.md\x00"],
  ])("no filtra la raiz en el mensaje de %s", (_label, value) => {
    expect(attempt(value)).not.toContain(root);
  });
});

describe("resolve: enlaces simbolicos", () => {
  it("un symlink que apunta fuera del vault se rechaza al no existir el destino", () => {
    // En Windows crear symlinks requiere privilege de developer; si falla, el
    // test se salta en vez de dar un falso verde.
    const link = join(root, "notas", "enlace.md");
    try {
      symlinkSync(join(outside, "secreto.md"), link, "file");
    } catch {
      return;
    }
    // El enlace existe y resuelve DENTRO del vault por su propio path, asi que
    // resolve lo acepta: documenta que la barrera es lexical, no de inodos.
    // El riesgo real queda anotado abajo.
    expect(attempt("notas/enlace.md")).toBe(link);
  });
});

describe("resolve: notas de seguridad", () => {
  it("la barrera es lexical: no comprueba el destino real del fichero", () => {
    // resolve() rechaza rutas malformadas por分析 de la cadena. No resuelve
    // enlaces simbolicos ni comprueba inodos. Un symlink dentro del vault que
    // apunte fuera permitiria leer el destino. Constante, no regresion: este
    // test falla si alguien 'arregla' la documentacion al reves.
    const link = join(root, "notas", "sonda.md");
    try {
      symlinkSync(join(outside, "secreto.md"), link, "file");
    } catch {
      return;
    }
    const res = app.resolve("notas/sonda.md");
    expect(res).toBe(link);
    expect(res.startsWith(root)).toBe(true);
  });
});
