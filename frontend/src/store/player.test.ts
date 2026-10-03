// El reproductor de ingles (player) y la pestaña que se arrastra.
//
// Los dos stores mas pequenos que quedan sin cubrir. Player tiene una regla
// que importa: abrir un medio salta al modulo, y eso se hace por un enlace
// [[...]] desde cualquier nota —no solo desde donde vive el player— asi que
// el store no puede depender de que el player este montado.

import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiMock } = vi.hoisted(() => ({
  apiMock: {
    enPlayerOpen: vi.fn(),
    enPlayerPick: vi.fn(),
  },
}));

vi.mock("../lib/bridge", () => ({ api: apiMock }));

import { usePlayer } from "./player";
import { useTabDrag } from "./tabDrag";
import { useApp } from "./app";

function media(over: Record<string, unknown> = {}) {
  return { id: "m1", file: "cancion.mp3", name: "Canción", ok: true, ...over };
}

function reset() {
  vi.clearAllMocks();
  usePlayer.setState({ media: null });
  useTabDrag.setState({ draggingTabId: null });
  useApp.setState({ module: "notas", openTabs: [], activeTabId: null, toasts: [] });
}

beforeEach(reset);

describe("abrir un medio", () => {
  it("carga el medio y salta al modulo del player", async () => {
    apiMock.enPlayerOpen.mockResolvedValue(media());
    await usePlayer.getState().open("cancion.mp3");
    expect(apiMock.enPlayerOpen).toHaveBeenCalledWith("cancion.mp3", 0);
    expect(usePlayer.getState().media?.file).toBe("cancion.mp3");
    // El enlace [[...]] abre el player desde una nota: el store tiene que
    // cambiar de modulo el mismo, sin depender de que este montado.
    expect(useApp.getState().module).toBe("player");
  });

  it("acepta la posicion de entrada en el medio", async () => {
    apiMock.enPlayerOpen.mockResolvedValue(media());
    await usePlayer.getState().open("cancion.mp3", 42);
    expect(apiMock.enPlayerOpen).toHaveBeenCalledWith("cancion.mp3", 42);
  });

  it("un fallo avisa y no cambia de modulo", async () => {
    apiMock.enPlayerOpen.mockRejectedValue(new Error("no existe el audio"));
    await usePlayer.getState().open("perdido.mp3");
    expect(usePlayer.getState().media).toBeNull();
    expect(useApp.getState().module).toBe("notas");
    expect(useApp.getState().toasts.at(-1)?.text).toContain("no existe el audio");
  });

  it("volver a abrir cambia el medio en vez de acumularlos", async () => {
    apiMock.enPlayerOpen.mockResolvedValue(media());
    await usePlayer.getState().open("uno.mp3");
    apiMock.enPlayerOpen.mockResolvedValue(media({ id: "m2", file: "dos.mp3" }));
    await usePlayer.getState().open("dos.mp3");
    expect(usePlayer.getState().media?.file).toBe("dos.mp3");
  });
});

describe("elegir un fichero", () => {
  it("carga lo elegido", async () => {
    apiMock.enPlayerPick.mockResolvedValue(media({ id: "m9", file: "elegido.mp3" }));
    await usePlayer.getState().pick();
    expect(usePlayer.getState().media?.file).toBe("elegido.mp3");
  });

  it("cancelar no cambia nada ni avisa", async () => {
    apiMock.enPlayerPick.mockResolvedValue({ ...media(), ok: false });
    await usePlayer.getState().pick();
    expect(usePlayer.getState().media).toBeNull();
    expect(useApp.getState().toasts).toEqual([]);
  });

  it("elegir no cambia de modulo: solo se elige desde dentro del player", async () => {
    apiMock.enPlayerPick.mockResolvedValue(media());
    await usePlayer.getState().pick();
    expect(useApp.getState().module).toBe("notas");
  });

  it("un fallo al elegir avisa", async () => {
    apiMock.enPlayerPick.mockRejectedValue(new Error("cancelado"));
    await usePlayer.getState().pick();
    expect(useApp.getState().toasts.at(-1)?.text).toBe("cancelado");
  });
});

describe("la pestaña que se arrastra", () => {
  it("guarda la que se coge y la suelta al dejarla", () => {
    useTabDrag.getState().drag("note:a.md");
    expect(useTabDrag.getState().draggingTabId).toBe("note:a.md");
    useTabDrag.getState().drag(null);
    expect(useTabDrag.getState().draggingTabId).toBeNull();
  });

  it("coger otra sustituye a la anterior, no la apila", () => {
    useTabDrag.getState().drag("note:a.md");
    useTabDrag.getState().drag("note:b.md");
    expect(useTabDrag.getState().draggingTabId).toBe("note:b.md");
  });
});
