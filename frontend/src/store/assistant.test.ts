// @vitest-environment jsdom
//
// store/assistant.ts: la conversacion con el modelo. Es el store con menos
// cobertura del repo (10,9%) y el mas dificil de probar bien, porque la
// respuesta llega por un canal aparte del que la pide: el turno se pide con
// ai_chat_stream y sus tokens entran por onAiStream, en otro hilo.
//
// Lo que se fija aqui:
//
//   - el turno se guarda al preguntarlo, no al terminar: cerrar la app a
//     mitad de respuesta no pierde la pregunta
//   - un token, un razonamiento o un error aterrizan en el mensaje que les
//     toca, no en el ultimo de la lista
//   - parar y el fallo dejan el mensaje marcado, nunca a medias
//   - un turno de puente web no finge respuesta: copia el prompt, abre el
//     navegador y espera a que pegues la respuesta
//   - el historial se guarda en los datos de la app, no en la vault

import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiMock, copyTextMock, streamSinks } = vi.hoisted(() => {
  const sinks: Array<(ev: { id: string; type: string; text?: string; message?: string }) => void> = [];
  return {
    streamSinks: sinks,
    copyTextMock: vi.fn(async () => true),
    apiMock: {
      aiChatStream: vi.fn(),
      aiChatCancel: vi.fn(async () => ({ ok: true })),
      aiSettings: vi.fn(),
      aiSettingsSave: vi.fn(),
      aiModels: vi.fn(),
      aiTitle: vi.fn(),
      openExternal: vi.fn(async () => ({ ok: true })),
      conversationList: vi.fn(),
      conversationGet: vi.fn(),
      conversationSave: vi.fn(),
      conversationRename: vi.fn(),
      conversationDelete: vi.fn(async () => ({ ok: true })),
      /** Every turn subscribes once; the store keeps the listener for good. */
      onAiStream: vi.fn((cb: (ev: never) => void) => {
        streamSinks.push(cb);
        return () => undefined;
      }),
      onWatchEvent: vi.fn(() => () => undefined),
      set_unsaved: vi.fn(async () => ({ ok: true })),
    },
  };
});

vi.mock("../lib/bridge", () => ({ api: apiMock }));
vi.mock("../lib/clipboard", () => ({ copyText: copyTextMock }));

import { actionContext, useAssistant, type ChatMessage } from "./assistant";
import { useApp } from "./app";

/** A token (or a whole event) as the main process would send it. */
function emit(ev: { id: string; type: string; text?: string; message?: string }): void {
  for (const sink of streamSinks) sink(ev);
}

const state = () => useAssistant.getState();
const last = () => state().messages[state().messages.length - 1]!;

/** The note `useApp` reports as open, as the assistant reads it. */
function openNote(path: string, raw = "cuerpo\n") {
  useApp.setState({
    active: path,
    notes: {
      [path]: {
        path, title: path, kind: "note", raw, frontmatter: {}, fmText: "",
        modified: 1, bookmarked: false, dirty: false, saving: false,
        conflict: false, eol: "\n",
      },
    },
  });
}

let savedSeq = 0;

function reset() {
  for (const m of Object.values(apiMock)) if (typeof m === "function" && "mockClear" in m) m.mockClear();
  // streamSinks is deliberately NOT emptied: the store registers its listener
  // once and keeps it for the life of the app, so a new test reuses that sink.
  localStorage.clear();
  savedSeq = 0;
  useAssistant.setState({
    open: false, messages: [], busy: false, streamingId: null, settingsOpen: false,
    awaitingPaste: false, model: "", models: [], providerLabel: "",
    conversationId: null, title: "", historyOpen: false, history: [], historyQuery: "",
  });
  useApp.setState({
    vault: "C:/v", module: "notas", openTabs: [], activeTabId: null, active: null,
    tabs: [], pinnedTabIds: new Set(), notes: {}, toasts: [],
  });
  apiMock.aiChatStream.mockResolvedValue({ reply: "respuesta", stopped: false });
  // A real save keeps the id it is given; the first turn mints one.
  apiMock.conversationSave.mockImplementation(async (id: string | null) => ({
    id: id ?? `c${++savedSeq}`,
    title: "titulo",
  }));
  apiMock.conversationList.mockResolvedValue([]);
  apiMock.aiTitle.mockResolvedValue({ title: "titulo", fallback: false });
}

beforeEach(reset);

describe("panel", () => {
  it("abrir y cerrar se recuerda entre sesiones", () => {
    state().setOpen(true);
    expect(localStorage.getItem("nv.assistant.open")).toBe("1");
    state().setOpen(false);
    expect(localStorage.getItem("nv.assistant.open")).toBe("0");
  });

  it("setSettings y clear", () => {
    state().setSettings(true);
    expect(state().settingsOpen).toBe(true);
    state().setOpen(true);
    state().clear();
    expect(state().messages).toEqual([]);
    expect(state().awaitingPaste).toBe(false);
  });
});

describe("ask", () => {
  it("añade la pregunta y una respuesta vacia en streaming, y abre el panel", async () => {
    await state().ask("¿que es esto?");
    expect(state().open).toBe(true);
    expect(state().messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(last()).toMatchObject({ streaming: false, content: "respuesta" });
    expect(state().busy).toBe(false);
  });

  it("una pregunta vacia no hace nada", async () => {
    await state().ask("   ");
    expect(state().messages).toEqual([]);
    expect(apiMock.aiChatStream).not.toHaveBeenCalled();
  });

  it("manda la nota abierta y la seleccion como contexto", async () => {
    openNote("nota.md");
    await state().ask("explica", "  esto  ");
    const args = apiMock.aiChatStream.mock.calls[0]!;
    expect(args[3]).toBe("nota.md"); // aiChatStream(id, history, q, noteRel, sel)
    expect(args[4]).toBe("esto");
    expect(state().messages[0]!.contexts).toEqual([{ path: "nota.md", text: "esto" }]);
  });

  it("sin nota abierta no manda ruta", async () => {
    await state().ask("hola");
    expect(apiMock.aiChatStream.mock.calls[0]![3]).toBe("");
  });

  it("el historial que manda excluye lo vacio, los errores y los del sistema", async () => {
    const base: ChatMessage = { id: "1", role: "user", content: "primero", at: 1 };
    useAssistant.setState({
      messages: [
        base,
        { ...base, id: "2", role: "assistant", content: "respuesta" },
        { ...base, id: "3", role: "system", content: "sistema" },
        { ...base, id: "4", role: "assistant", content: "fallo", error: true },
        { ...base, id: "5", role: "assistant", content: "   " },
      ],
    });
    await state().ask("siguiente");
    expect(apiMock.aiChatStream.mock.calls[0]![1]).toEqual([
      { role: "user", content: "primero" },
      { role: "assistant", content: "respuesta" },
    ]);
  });

  it("no pregunta dos veces mientras la anterior esta en vuelo", async () => {
    useAssistant.setState({ busy: true });
    await state().ask("otra");
    expect(apiMock.aiChatStream).not.toHaveBeenCalled();
  });

  it("guarda el turno nada mas preguntarlo, antes de la respuesta", async () => {
    await state().ask("pregunta");
    expect(apiMock.conversationSave).toHaveBeenCalled();
    // The streaming answer is empty, so only the question is stored: closing
    // the app now would not lose what was asked.
    const saved = apiMock.conversationSave.mock.calls[0]![1] as ChatMessage[];
    expect(saved.map((m) => m.content)).toEqual(["pregunta"]);
    expect(state().conversationId).toBe("c1");
  });

  it("el primer turno pide un nombre de conversacion", async () => {
    await state().ask("primera pregunta");
    expect(apiMock.aiTitle).toHaveBeenCalledWith("c1", "primera pregunta", "respuesta");
    expect(state().title).toBe("titulo");
  });

  it("ya no pide nombre en el segundo turno", async () => {
    await state().ask("primera");
    apiMock.aiTitle.mockClear();
    await state().ask("segunda");
    expect(apiMock.aiTitle).not.toHaveBeenCalled();
  });

  it("si el guardado previo falla, la conversacion sigue en pantalla", async () => {
    apiMock.conversationSave.mockRejectedValue(new Error("disco") as never);
    await state().ask("pregunta");
    expect(state().messages).toHaveLength(2);
    expect(last().content).toBe("respuesta");
    expect(state().conversationId).toBeNull();
  });
});

describe("el stream de tokens", () => {
  it("los tokens se pintan en el mensaje que les corresponde", async () => {
    let done!: (v: unknown) => void;
    apiMock.aiChatStream.mockReturnValueOnce(new Promise((r) => (done = r)));
    const p = state().ask("dibuja");
    await vi.waitFor(() => expect(state().streamingId).not.toBeNull());
    const id = state().streamingId!;
    const byId = () => state().messages.find((m) => m.id === id)!;

    emit({ id, type: "delta", text: "Hola" });
    emit({ id, type: "delta", text: " mundo" });
    expect(byId().content).toBe("Hola mundo");

    done({ reply: "Hola mundo", stopped: false });
    await p;
  });

  it("el razonamiento va a su propio campo, no al texto", async () => {
    let done!: (v: unknown) => void;
    apiMock.aiChatStream.mockReturnValueOnce(new Promise((r) => (done = r)));
    const p = state().ask("dibuja");
    await vi.waitFor(() => expect(state().streamingId).not.toBeNull());
    const id = state().streamingId!;

    emit({ id, type: "thinking", text: "primero pienso" });
    emit({ id, type: "delta", text: "y respondo" });
    const streaming = state().messages.find((m) => m.id === id)!;
    expect(streaming.thinking).toBe("primero pienso");
    expect(streaming.content).toBe("y respondo");

    done({ stopped: false });
    await p;
  });

  it("un token de otro turno no toca este", async () => {
    let done!: (v: unknown) => void;
    apiMock.aiChatStream.mockReturnValueOnce(new Promise((r) => (done = r)));
    const p = state().ask("dibuja");
    await vi.waitFor(() => expect(state().streamingId).not.toBeNull());
    const id = state().streamingId!;

    emit({ id: "otro-id", type: "delta", text: "colado" });
    expect(state().messages.find((m) => m.id === id)!.content).toBe("");

    done({ stopped: false });
    await p;
  });

  it("el listener se registra una sola vez para toda la app", async () => {
    const before = apiMock.onAiStream.mock.calls.length;
    await state().ask("una");
    await state().ask("dos");
    // The store keeps one listener for the life of the app; other suites may
    // already have registered it, so compare against the count on entry.
    expect(apiMock.onAiStream.mock.calls.length).toBe(before);
  });

  it("parar cancela el turno en vuelo y marca la respuesta como cortada", async () => {
    let done!: (v: unknown) => void;
    apiMock.aiChatStream.mockReturnValueOnce(new Promise((r) => (done = r)));
    const p = state().ask("larga");
    await vi.waitFor(() => expect(state().streamingId).not.toBeNull());
    const id = state().streamingId!;
    emit({ id, type: "delta", text: "a medias" });

    await state().stop();
    expect(apiMock.aiChatCancel).toHaveBeenCalledWith(id);

    done({ reply: "", stopped: true });
    await p;
    expect(state().messages.find((m) => m.id === id)!.stopped).toBe(true);
    expect(state().messages.find((m) => m.id === id)!.content).toBe("a medias");
  });

  it("parar sin nada en vuelo no hace nada", async () => {
    await state().stop();
    expect(apiMock.aiChatCancel).not.toHaveBeenCalled();
  });

  it("cancelar aunque el backend falle no rompe nada", async () => {
    let done!: (v: unknown) => void;
    apiMock.aiChatStream.mockReturnValueOnce(new Promise((r) => (done = r)));
    const p = state().ask("larga");
    await vi.waitFor(() => expect(state().streamingId).not.toBeNull());
    apiMock.aiChatCancel.mockRejectedValueOnce(new Error("ya termino") as never);
    await expect(state().stop()).resolves.toBeUndefined();
    done({ reply: "x" });
    await p;
  });
});

describe("errores del proveedor", () => {
  it("un fallo deja el mensaje marcado y con el texto del error", async () => {
    apiMock.aiChatStream.mockRejectedValue(new Error("sin clave") as never);
    await state().ask("pregunta");
    const a = last();
    expect(a).toMatchObject({ error: true, streaming: false, ms: expect.any(Number) });
    expect(a.content).toContain("sin clave");
    expect(state().busy).toBe(false);
    expect(state().streamingId).toBeNull();
  });

  it("un error a mitad de stream no pisa lo ya escrito", async () => {
    let done!: (v: unknown) => void;
    apiMock.aiChatStream.mockReturnValueOnce(new Promise((r) => (done = r)));
    const p = state().ask("dibuja");
    await vi.waitFor(() => expect(state().streamingId).not.toBeNull());
    const id = state().streamingId!;
    emit({ id, type: "delta", text: "parte" });
    done({ stopped: false });
    await p;

    // Un evento de error tardio, con el turno ya cerrado.
    emit({ id, type: "error", message: "cortado" });
    const a = state().messages.find((m) => m.id === id)!;
    expect(a.error).toBe(true);
    expect(a.content).toBe("parte");
  });

  it("un error con la respuesta ya vacia muestra el aviso del backend", async () => {
    apiMock.aiChatStream.mockRejectedValue(new Error("cuota agotada") as never);
    await state().ask("pregunta");
    expect(last().content).toContain("cuota agotada");
  });
});

describe("turno de puente (copiar y pegar en un chat web)", () => {
  it("copia el prompt, abre el navegador y espera a que pegues la respuesta", async () => {
    apiMock.aiChatStream.mockResolvedValue({
      bridge: true, prompt: "PREGUNTA CON CONTEXTO", url: "https://chat.example", label: "ChatGPT",
    } as never);
    await state().ask("¿que es esto?");

    expect(copyTextMock).toHaveBeenCalledWith("PREGUNTA CON CONTEXTO");
    expect(apiMock.openExternal).toHaveBeenCalledWith("https://chat.example");
    expect(state().awaitingPaste).toBe(true);
    // La respuesta de mentira no existe: el sitio de la respuesta es un aviso.
    expect(last()).toMatchObject({ role: "system" });
    expect(last().content).toContain("ChatGPT");
    expect(state().messages.some((m) => m.role === "assistant")).toBe(false);
  });

  it("no pide nombre de conversacion para un turno de puente", async () => {
    apiMock.aiChatStream.mockResolvedValue({ bridge: true, prompt: "p", url: "https://x" } as never);
    await state().ask("primera");
    expect(apiMock.aiTitle).not.toHaveBeenCalled();
  });

  it("fallar al abrir el navegador no rompe el turno", async () => {
    apiMock.openExternal.mockRejectedValue(new Error("no navegador") as never);
    apiMock.aiChatStream.mockResolvedValue({ bridge: true, prompt: "p", url: "https://x" } as never);
    await state().ask("pregunta");
    expect(state().awaitingPaste).toBe(true);
  });

  it("pegar la respuesta la deja como mensaje del asistente y cierra la espera", async () => {
    await state().ask("primera");
    state().pasteReply("  la respuesta del chat web  ");
    expect(state().awaitingPaste).toBe(false);
    expect(last()).toMatchObject({ role: "assistant", content: "la respuesta del chat web" });
  });

  it("pegar vacio no hace nada", async () => {
    apiMock.aiChatStream.mockResolvedValue({ bridge: true, prompt: "p", url: "https://x" } as never);
    await state().ask("primera");
    expect(state().awaitingPaste).toBe(true);
    const before = state().messages.length;
    state().pasteReply("   ");
    expect(state().messages).toHaveLength(before);
    // Still waiting: pasting nothing must not close the prompt's door.
    expect(state().awaitingPaste).toBe(true);
  });
});

describe("votos", () => {
  it("votar guarda el voto y volver a votar lo quita", async () => {
    await state().ask("pregunta");
    const id = state().messages[1]!.id;
    state().vote(id, 1);
    expect(state().messages[1]!.vote).toBe(1);
    state().vote(id, 1);
    expect(state().messages[1]!.vote).toBe(0);
    state().vote(id, -1);
    expect(state().messages[1]!.vote).toBe(-1);
  });

  it("un id que no existe no rompe nada", async () => {
    await state().ask("pregunta");
    state().vote("no-existe", 1);
    expect(state().messages.every((m) => m.vote !== 1)).toBe(true);
  });
});

describe("proveedor y modelo", () => {
  it("loadModels lee el proveedor activo y su lista", async () => {
    apiMock.aiSettings.mockResolvedValue({
      config: { provider: "deepseek", model: "deepseek-chat", is_bridge: false },
      providers: [{ key: "deepseek", label: "DeepSeek" }, { key: "otro", label: "Otro" }],
      models: ["a", "b"],
    } as never);
    await state().loadModels();
    expect(state()).toMatchObject({ model: "deepseek-chat", models: ["a", "b"], providerLabel: "DeepSeek" });
    expect(apiMock.aiModels).not.toHaveBeenCalled();
  });

  it("con probe pide la lista en vivo y la une sin repetir", async () => {
    apiMock.aiSettings.mockResolvedValue({
      config: { provider: "x", model: "m", is_bridge: false },
      providers: [{ key: "x", label: "X" }], models: ["a", "b"],
    } as never);
    apiMock.aiModels.mockResolvedValue(["b", "c"]);
    await state().loadModels(true);
    expect(state().models).toEqual(["b", "c", "a"]);
  });

  it("un proveedor de puente no pregunta la lista en vivo", async () => {
    apiMock.aiSettings.mockResolvedValue({
      config: { provider: "web", model: "m", is_bridge: true },
      providers: [{ key: "web", label: "Web" }], models: [],
    } as never);
    await state().loadModels(true);
    expect(apiMock.aiModels).not.toHaveBeenCalled();
  });

  it("un fallo deja el panel como estaba", async () => {
    apiMock.aiSettings.mockRejectedValue(new Error("sin config") as never);
    await expect(state().loadModels()).resolves.toBeUndefined();
    expect(state().model).toBe("");
  });

  it("setModel guarda la eleccion aunque el guardado falle", async () => {
    apiMock.aiSettingsSave.mockRejectedValue(new Error("no") as never);
    await state().setModel("otro-modelo");
    expect(state().model).toBe("otro-modelo");
    expect(apiMock.aiSettingsSave).toHaveBeenCalledWith({ model: "otro-modelo" });
  });
});

describe("historial de conversaciones", () => {
  it("abrir el historial lo relee", async () => {
    apiMock.conversationList.mockResolvedValue([{ id: "c1", title: "uno" }, { id: "c2", title: "dos" }]);
    state().setHistory(true);
    await vi.waitFor(() => expect(state().history).toHaveLength(2));
    expect(state().historyOpen).toBe(true);
  });

  it("si el listado falla, el panel sale vacio y no roto", async () => {
    apiMock.conversationList.mockRejectedValue(new Error("carpeta no esta") as never);
    state().setHistory(true);
    await vi.waitFor(() => expect(state().history).toEqual([]));
  });

  it("nueva conversacion vacia el chat y cierra el historial", async () => {
    await state().ask("primera");
    state().setHistory(true);
    state().newConversation();
    expect(state()).toMatchObject({ messages: [], conversationId: null, title: "", historyOpen: false });
  });

  it("abrir una conversacion trae sus mensajes con ids nuevos y nada en vuelo", async () => {
    apiMock.conversationGet.mockResolvedValue({
      id: "c9", title: "vieja",
      messages: [{ id: "x1", role: "user", content: "hola", at: 1, streaming: true }],
    } as never);
    state().newConversation();
    await state().openConversation("c9");
    expect(state().conversationId).toBe("c9");
    expect(state().title).toBe("vieja");
    const m = state().messages[0]!;
    expect(m.content).toBe("hola");
    expect(m.id).not.toBe("x1"); // ids nuevos: chocar con el stream actual seria fatal
    expect(m.streaming).toBe(false);
    expect(state().busy).toBe(false);
  });

  it("abrir una conversacion que falla no borra la que esta en pantalla", async () => {
    await state().ask("primera");
    const before = state().messages;
    apiMock.conversationGet.mockRejectedValue(new Error("no existe") as never);
    await expect(state().openConversation("nope")).rejects.toThrow("no existe");
    expect(state().messages).toBe(before);
  });

  it("renombrar actualiza el titulo en pantalla solo si es la actual, y relee", async () => {
    await state().ask("primera");
    apiMock.conversationRename.mockResolvedValue({ id: "c1", title: "nuevo nombre" } as never);
    await state().renameConversation("c1", "nuevo nombre");
    expect(state().title).toBe("nuevo nombre");
    expect(apiMock.conversationList).toHaveBeenCalled();

    await state().renameConversation("otra", "x");
    expect(state().title).toBe("nuevo nombre");
  });

  it("borrar la conversacion abierta la deja vacia en pantalla", async () => {
    await state().ask("primera");
    await state().deleteConversation("c1");
    expect(state()).toMatchObject({ conversationId: null, title: "", messages: [] });
  });

  it("borrar otra conversacion no toca la que esta abierta", async () => {
    await state().ask("primera");
    const before = state().messages;
    await state().deleteConversation("otra");
    expect(state().messages).toBe(before);
    expect(state().conversationId).toBe("c1");
  });
});

describe("persist", () => {
  it("no guarda una conversacion vacia", async () => {
    state().newConversation();
    apiMock.conversationSave.mockClear();
    await state().ask("   ");
    expect(apiMock.conversationSave).not.toHaveBeenCalled();
  });

  it("un mensaje en streaming sin texto no se guarda", async () => {
    useAssistant.setState({
      messages: [
        { id: "1", role: "user", content: "p", at: 1 },
        { id: "2", role: "assistant", content: "", at: 2, streaming: true },
      ],
      model: "m",
    });
    // vote fuerza un guardado; el streaming a medias se filtra.
    state().vote("1", 1);
    await vi.waitFor(() => expect(apiMock.conversationSave).toHaveBeenCalled());
    const saved = apiMock.conversationSave.mock.calls.at(-1)![1] as ChatMessage[];
    expect(saved.map((m) => m.id)).toEqual(["1"]);
  });

  it("guarda el modelo con el que se pregunto", async () => {
    useAssistant.setState({ model: "mi-modelo" });
    await state().ask("pregunta");
    expect(apiMock.conversationSave).toHaveBeenCalledWith(null, expect.any(Array), "mi-modelo", "");
  });
});

describe("actionContext", () => {
  it("con seleccion usa la seleccion", () => {
    expect(actionContext("  lo seleccionado  ")).toBe("lo seleccionado");
  });

  it("sin seleccion usa el principio de la nota abierta, sin el frontmatter", () => {
    useApp.setState({
      active: "nota.md",
      notes: {
        "nota.md": {
          path: "nota.md", title: "n", kind: "note",
          raw: "---\ntags: []\n---\n" + "cuerpo largo ".repeat(200),
          frontmatter: {}, fmText: "", modified: 1, bookmarked: false,
          dirty: false, saving: false, conflict: false, eol: "\n",
        },
      },
    });
    const ctx = actionContext("");
    expect(ctx.startsWith("cuerpo largo")).toBe(true);
    expect(ctx).not.toContain("tags");
    expect(ctx.length).toBeLessThanOrEqual(1000);
  });

  it("sin nota abierta devuelve cadena vacia", () => {
    expect(actionContext("")).toBe("");
  });
});
