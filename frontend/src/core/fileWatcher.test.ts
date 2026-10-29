// FileWatcherService: el vigilante del vault.
//
// Es el unico camino por el que un cambio hecho fuera de la app (Syncthing,
// otro editor) llega a la interfaz, y un fallo aqui no da error: da una nota
// que se guarda sobre otra sin avisar. Por eso los tests usan ficheros de
// verdad en un directorio temporal en vez de mockear fs.watch, y por eso el
// tiempo se mide esperando el evento y no con temporizadores falsos.
//
// Lo que se fija:
//
//   - solo se avisa de lo que el usuario puede editar: .git, .notevault,
//     attachments, node_modules y __pycache__ se ignoran enteros
//   - las rutas llegan con "/" aunque el sistema las de con "\"
//   - un mismo fichero no dispara dos veces seguidas (el editor escribe por
//     rachos, y Syncthing renombra encima)
//   - un callback que lanza no tumbaba el vigilante
//   - arrancar dos veces no monta dos vigilantes

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { FileWatcherService, type WatchEvent } from "./fileWatcher";

let dir: string;
let svc: FileWatcherService;
let events: WatchEvent[];

/** fs.watch entrega su callback en el hilo de eventos, no aqui. */
function nextEvent(timeoutMs = 4000): Promise<WatchEvent> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const poll = setInterval(() => {
      // Crear una carpeta tambien es un cambio: se filtra, que aqui lo
      // interesante son los ficheros.
      const at = events.findIndex((e) => !isDir(e));
      if (at >= 0) {
        clearInterval(poll);
        resolve(events.splice(at, 1)[0]!);
      } else if (Date.now() - started > timeoutMs) {
        clearInterval(poll);
        reject(new Error(`no llego ningun evento de fichero en ${timeoutMs} ms (hubo ${events.length})`));
      }
    }, 10);
  });
}

function isDir(ev: WatchEvent): boolean {
  try {
    return fs.statSync(ev.fullPath).isDirectory();
  } catch {
    return false; // ya no existe: solo puede ser la carpeta que se creo
  }
}

/** Espera sin temporizadores falsos: el intervalo de deduplicacion son 200 ms. */
const settle = (ms = 400) => new Promise((r) => setTimeout(r, ms));

/** Los eventos que son de fichero: crear una carpeta tambien avisa. */
const fileEvents = () => events.filter((e) => !isDir(e));

/** Escribe un fichero y espera a que el vigilante avise de el. */
async function writeExpecting(rel: string, body: string): Promise<WatchEvent> {
  const pending = nextEvent();
  const file = path.join(dir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body, "utf-8");
  return pending;
}

beforeEach(async () => {
  dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "nv_watch_")));
  events = [];
  svc = new FileWatcherService(dir, (e: WatchEvent) => {
    events.push(e);
  });
  svc.start();
  // en Linux el vigilante recursivo instala sus avisos de forma asíncrona: lo escrito en el mismo instante se pierde
  if (process.platform !== "win32") await new Promise((r) => setTimeout(r, 150));
});

afterEach(() => {
  svc.stop();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("arrancar y parar", () => {
  it("avisa de un fichero nuevo con su ruta relativa y su ruta completa", async () => {
    const ev = await writeExpecting("notas/1.1 — suma.md", "cuerpo\n");
    expect(ev.relPath).toBe("notas/1.1 — suma.md");
    expect(ev.fullPath).toBe(path.join(dir, "notas", "1.1 — suma.md"));
    expect(ev.eventType).toBeTruthy();
  });

  it.skipIf(process.platform !== "win32")("las rutas llegan con / aunque el sistema las de con \\", async () => {
    const ev = await writeExpecting("curso/tema.md", "x");
    expect(ev.relPath).not.toContain("\\");
    expect(ev.fullPath.includes("\\")).toBe(true); // la ruta completa es del SO
  });

  it("el listener recibe el evento, con la ruta completa dentro", async () => {
    // Su propia carpeta: dos vigilantes sobre la misma se pisan los avisos.
    const otro = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "nv_watch2_")));
    const recibidos: unknown[] = [];
    const oyente = new FileWatcherService(otro, (ev: unknown) => {
      recibidos.push(ev);
    });
    oyente.start();
    fs.writeFileSync(path.join(otro, "nota.md"), "x", "utf-8");
    await vi.waitFor(() => expect(recibidos.length).toBeGreaterThan(0), { timeout: 4000 });
    oyente.stop();
    // Antes de arreglarlo le llegaba una cadena suelta y luego el evento;
    // main.ts solo quiere el evento, y se comia el aviso de mas.
    expect(recibidos.every((e) => typeof e === "object")).toBe(true);
    expect((recibidos[0] as WatchEvent).fullPath).toBe(path.join(otro, "nota.md"));
    fs.rmSync(otro, { recursive: true, force: true });
  });

  it("un cambio da un solo aviso, no dos", async () => {
    const pending = nextEvent();
    fs.writeFileSync(path.join(dir, "una-vez.md"), "x", "utf-8");
    await pending;
    await settle();
    // El puerto de Python llamaba dos veces: con la ruta y luego con el
    // evento. Electron solo quiere el evento, asi que recibia de mas.
    expect(fileEvents()).toEqual([]);
  });

  it("arrancar dos veces no monta dos vigilantes", async () => {
    svc.start();
    svc.start();
    const ev = await writeExpecting("a.md", "x");
    expect(ev.relPath).toBe("a.md");
    await settle();
    expect(fileEvents()).toEqual([]); // no se duplico el aviso
  });

  it("parar corta el aviso y volver a arrancar lo reanuda", async () => {
    svc.stop();
    expect(svc.isRunning).toBe(false);
    fs.writeFileSync(path.join(dir, "mientras.md"), "x", "utf-8");
    await settle();
    expect(fileEvents()).toEqual([]);

    svc.start();
    const ev = await writeExpecting("despues.md", "x");
    expect(ev.relPath).toBe("despues.md");
  });

  it("un directorio que no existe no arranca y no lanza", () => {
    const roto = new FileWatcherService(path.join(dir, "no-existe"), () => undefined);
    expect(() => roto.start()).not.toThrow();
    expect(roto.isRunning).toBe(false);
  });

  it("refresh pide un aviso con la raiz y sin ruta relativa", () => {
    svc.refresh();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ eventType: "change", relPath: "", fullPath: dir });
  });

  it("un callback que lanza no tumba el vigilante", async () => {
    svc.stop();
    let attendus = 0;
    const queFalla = new FileWatcherService(dir, () => {
      attendus++;
      throw new Error("la vista del panel revienta");
    });
    queFalla.start();
    fs.writeFileSync(path.join(dir, "a.md"), "x", "utf-8");
    await vi.waitFor(() => expect(attendus).toBeGreaterThan(0), { timeout: 4000 });

    // Y sigue vigilando: el error se traga, no se apaga.
    fs.writeFileSync(path.join(dir, "b.md"), "x", "utf-8");
    await vi.waitFor(() => expect(attendus).toBeGreaterThan(1), { timeout: 4000 });
    queFalla.stop();
  });
});

describe("lo que no se avisa", () => {
  const ignorados = [
    [".git/config", "datos de git"],
    [".notevault/habits/habits_config.json", "la carpeta de datos"],
    [".obsidian/app.json", "config del editor"],
    ["notas/attachments/diagrama.png", "adjuntos pegados"],
    ["node_modules/x/index.js", "dependencias"],
    ["__pycache__/x.pyc", "cache de Python"],
  ] as const;

  for (const [rel, porQue] of ignorados) {
    it(`ignora ${rel} (${porQue})`, async () => {
      const file = path.join(dir, rel);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, "x", "utf-8");
      await settle();
      expect(fileEvents()).toEqual([]);
    });
  }

  it("una carpeta que empieza por punto arrastra a todo su contenido", async () => {
    const file = path.join(dir, ".trash", "proyectos", "viejo.md");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "x", "utf-8");
    await settle();
    expect(fileEvents()).toEqual([]);
  });

  it("una nota normal si se avisa: el filtro no se pasa de la IGNORE", async () => {
    const ev = await writeExpecting("notas/mis notas/con mi adjuntado.md", "x");
    expect(ev.relPath).toBe("notas/mis notas/con mi adjuntado.md");
  });

  it("una nota con la palabra attachments en otro sitio si se avisa", async () => {
    const ev = await writeExpecting("notas/adjuntos.md", "x");
    expect(ev.relPath).toBe("notas/adjuntos.md");
  });
});

describe("un solo aviso por rafaga", () => {
  it("escribir dos veces seguidas da un aviso, no dos", async () => {
    const file = path.join(dir, "nota.md");
    const pending = nextEvent();
    fs.writeFileSync(file, "uno", "utf-8");
    fs.writeFileSync(file, "dos", "utf-8");
    fs.writeFileSync(file, "tres", "utf-8");
    const ev = await pending;
    expect(ev.relPath).toBe("nota.md");
    // El resto de la rafaga se come: Syncthing renombra encima y el editor
    // escribe por trozos, y de cada trozo un aviso seria recargar la nota.
    await settle();
    expect(fileEvents()).toEqual([]);
  });

  it("pasados los 200 ms vuelve a avisar", async () => {
    const file = path.join(dir, "nota.md");
    const first = nextEvent();
    fs.writeFileSync(file, "uno", "utf-8");
    expect((await first).relPath).toBe("nota.md");

    await settle();
    const second = nextEvent();
    fs.writeFileSync(file, "dos", "utf-8");
    expect((await second).relPath).toBe("nota.md");
  });

  it("ficheros distintos no se pisan entre si", async () => {
    const a = nextEvent();
    fs.writeFileSync(path.join(dir, "a.md"), "x", "utf-8");
    expect((await a).relPath).toBe("a.md");
    const b = nextEvent();
    fs.writeFileSync(path.join(dir, "b.md"), "x", "utf-8");
    expect((await b).relPath).toBe("b.md");
  });

  it("el mapa de tiempos no crece sin limite", async () => {
    // Se llena a mano el registro: 200 ficheros vigilados es un vault real.
    const registro = (svc as unknown as { lastTriggerTimes: Map<string, number> }).lastTriggerTimes;
    for (let i = 0; i < 250; i++) registro.set(`nota-${i}.md`, performance.now());
    expect(registro.size).toBe(250);

    await writeExpecting("recien.md", "x");
    // Al pasarse de 200 se limpia entero, en vez de filtrar en cada aviso.
    expect(registro.size).toBeLessThan(200);
  });
});
