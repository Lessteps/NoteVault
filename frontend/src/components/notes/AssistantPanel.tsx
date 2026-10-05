// Asistente: the chat panel. A conversation about the open note, streamed token
// by token, in the shape of an agent panel: header / message list / composer.
// Answers can go back into the note.

import {
  ArrowUp, ChevronDown, ClipboardPaste, Copy, CornerDownLeft, FileCode2, FilePlus,
  Folder, FolderPlus, GitCompare, Hammer, Loader2, GraduationCap, History, Layers, Mic, MoreHorizontal, Paperclip, Pencil, Plus, Settings2, Sparkles,
  Square, ThumbsDown, ThumbsUp, Wand2, X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type RefObject } from "react";
import { api } from "../../lib/bridge";
import { copyText, readClipboard } from "../../lib/clipboard";
import { splitAction, vaultMode, VAULT_MODES } from "../../lib/assistantModes";
import { renderMarkdown } from "../../lib/markdown";
import type { AiConfig, AiProvider } from "../../lib/types";
import { useApp } from "../../store/app";
import { useAssistant, type ChatContext, type ChatMessage } from "../../store/assistant";
import { Field, GhostButton, input, Modal, PrimaryButton } from "../common/forms";
import { askText, cn, IconButton, openMenu } from "../ui";
import { generateTopicFrom, useStudySpaceDialog } from "../study/StudySpaceDialog";
import { isPracticePath, usePracticeDialog } from "../practice/PracticeProjectDialog";
import { MentorAssistant } from "../mentor/MentorAssistant";
import { ActionCard } from "./ActionCard";
import { AskCard, SkillsCard } from "./ChatCards";
import { ConversationHistory } from "./ConversationHistory";
import { editorSelection, insertAtCursor } from "./SourceEditor";

const WIDTH_KEY = "nv.assistant.width";
const MIN_WIDTH = 320;
const MAX_WIDTH = 720;

const seconds = (ms: number): number => Math.max(1, Math.round(ms / 1000));

/** Clicking a code window's button copies its text, as in the reading view. */
function useCodeCopy(root: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const onClick = (e: ReactMouseEvent) => {
      const button = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-copy]");
      if (!button) return;
      e.preventDefault();
      const code = button.closest(".code-block")?.querySelector("pre")?.textContent ?? "";
      void copyText(code).then((ok) => {
        button.textContent = ok ? "Copiado" : "Error";
        window.setTimeout(() => {
          button.textContent = "Copiar";
        }, 1200);
      });
    };
    el.addEventListener("click", onClick as unknown as EventListener);
    return () => el.removeEventListener("click", onClick as unknown as EventListener);
  }, [root]);
}

function ContextChip({ ctx, onRemove }: { ctx: ChatContext; onRemove?: () => void }) {
  if (ctx.file) {
    const kind = ctx.path.toLowerCase().endsWith(".canvas") ? "canvas" : /\.practica\.md$/i.test(ctx.path) ? "práctica" : /\.resumen\.md$/i.test(ctx.path) ? "resumen" : "";
    return (
      <span
        title={`Archivo seleccionado: ${ctx.path}`}
        className="inline-flex max-w-full items-center gap-1 rounded-md border border-mint/40 bg-mint/10 px-1.5 py-0.5 text-[11px] text-text"
      >
        <FileCode2 size={11} className="flex-none text-mint" />
        <span className="truncate">{ctx.path.split("/").pop()}</span>
        {kind && <span className="flex-none text-[10px] text-faint">· {kind}</span>}
        {onRemove && (
          <button type="button" aria-label="Quitar archivo" onClick={onRemove} className="ml-0.5 rounded hover:text-text">
            <X size={10} />
          </button>
        )}
      </span>
    );
  }
  if (ctx.folder) {
    return (
      <span
        title={`Carpeta seleccionada: ${ctx.path}`}
        className="inline-flex max-w-full items-center gap-1 rounded-md border border-accent/40 bg-accent-soft px-1.5 py-0.5 text-[11px] text-accent-text"
      >
        <Folder size={11} className="flex-none" />
        <span className="truncate">{ctx.path.split("/").pop()}</span>
        {onRemove && (
          <button type="button" aria-label="Quitar carpeta" onClick={onRemove} className="ml-0.5 rounded hover:text-text">
            <X size={10} />
          </button>
        )}
      </span>
    );
  }
  const name = ctx.path.split("/").pop() ?? ctx.text.slice(0, 24);
  const range = ctx.start_line ? `#L${ctx.start_line}${ctx.end_line ? `-${ctx.end_line}` : ""}` : "";
  const oneLine = ctx.text.trim().split("\n")[0] ?? "";
  return (
    <span
      title={`${ctx.path || "sin archivo"}${range}\n\n${ctx.text.slice(0, 400)}`}
      className="inline-flex max-w-full items-center gap-1 rounded-md border border-line bg-elevated px-1.5 py-0.5 text-[11px] text-dim"
    >
      <FileCode2 size={11} className="flex-none text-faint" />
      <span className="truncate font-mono">
        {name}
        {range}
      </span>
      <span className="hidden truncate text-faint sm:inline">· {oneLine.slice(0, 40)}</span>
      {onRemove && (
        <button type="button" aria-label="Quitar contexto" onClick={onRemove} className="ml-0.5 rounded hover:text-text">
          <X size={10} />
        </button>
      )}
    </span>
  );
}

function AssistantBody({ m }: { m: ChatMessage }) {
  const ref = useRef<HTMLDivElement>(null);
  // The `nv-action` block is not shown as text: it becomes a card once complete.
  const { text, action, ask, skills } = useMemo(() => splitAction(m.content), [m.content]);
  const html = useMemo(() => renderMarkdown(text), [text]);
  useCodeCopy(ref);
  return (
    <>
      <div ref={ref} className="nv-chat-prose" dangerouslySetInnerHTML={{ __html: html }} />
      {action && !m.streaming && <ActionCard action={action} />}
      {ask && !m.streaming && <AskCard ask={ask} />}
      {skills && !m.streaming && <SkillsCard data={skills} />}
    </>
  );
}

/** A live seconds counter while something is streaming. */
function useElapsed(active: boolean, from: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [active]);
  return Math.max(0, Math.round((now - from) / 1000));
}

function Message({ m, live }: { m: ChatMessage; live: boolean }) {
  const toast = useApp((s) => s.toast);
  const vote = useAssistant((s) => s.vote);
  // null = "decide for me": open while the reasoning is the only progress the
  // user can see, collapsed once there is an answer to read.
  const [openThinking, setOpenThinking] = useState<boolean | null>(null);
  const liveSecs = useElapsed(m.streaming === true, m.at);
  const thinkingRef = useRef<HTMLPreElement>(null);
  useEffect(() => {
    const el = thinkingRef.current;
    if (el && m.streaming) el.scrollTop = el.scrollHeight;
  }, [m.thinking, m.streaming]);

  const insert = () => {
    const app = useApp.getState();
    const note = app.active ? app.notes[app.active] : undefined;
    if (insertAtCursor(`\n${m.content}\n`)) return;
    if (!note || note.kind !== "note") {
      toast("error", "Abre una nota para insertar la respuesta.");
      return;
    }
    app.editRaw(note.path, `${note.raw.replace(/\s*$/, "")}\n\n${m.content}\n`);
    toast("info", "Añadido al final de la nota");
  };

  const asNote = async () => {
    const raw = m.content.split("\n")[0] ?? "";
    const suggested = (/^#+\s*(.+)$/m.exec(m.content)?.[1] ?? raw).replace(/[\\/:*?"<>|#]/g, "").trim().slice(0, 60) || "Respuesta";
    const app = useApp.getState();
    const title = await askText("Nombre de la nota", suggested, "Crear");
    if (!title) return;
    const folder = app.active?.includes("/") ? app.active.slice(0, app.active.lastIndexOf("/")) : "";
    try {
      const r = await api.createNote(title, folder);
      app.refreshTree();
      await app.openNote(r.path);
      if (useApp.getState().notes[r.path]) useApp.getState().editRaw(r.path, `${m.content}\n`);
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };

  if (m.role === "system") {
    return <div className="mx-auto w-fit rounded-lg bg-elevated px-3 py-2 text-center text-[11.5px] text-dim">{m.content}</div>;
  }

  if (m.role === "user") {
    return (
      <div className="flex flex-col items-end gap-1.5">
        {!!m.contexts?.length && (
          <div className="flex max-w-[95%] flex-wrap justify-end gap-1">
            {m.contexts.map((c, i) => (
              <ContextChip key={i} ctx={c} />
            ))}
          </div>
        )}
        <div className="max-w-[95%] whitespace-pre-wrap rounded-xl bg-elevated px-3 py-2 text-[12.5px] text-text">{m.content}</div>
      </div>
    );
  }

  const thinkingSecs = m.ms ? seconds(m.ms) : null;
  const showThinking = openThinking ?? Boolean(m.streaming && !m.content);
  return (
    <div className="group">
      {m.thinking && (
        <div className="mb-1">
          <button
            type="button"
            onClick={() => setOpenThinking(!showThinking)}
            className="flex items-center gap-1 text-[11px] text-faint hover:text-dim"
          >
            <ChevronDown size={11} className={cn("transition-transform", showThinking ? "" : "-rotate-90")} />
            Razonamiento
            {m.streaming && !m.content ? ` · ${liveSecs}s` : thinkingSecs ? ` · ${thinkingSecs}s` : ""}
          </button>
          {showThinking && (
            <pre
              ref={thinkingRef}
              className="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg border border-line bg-surface px-2.5 py-2 font-mono text-[11px] leading-relaxed text-faint"
            >
              {m.thinking}
            </pre>
          )}
        </div>
      )}

      {m.content ? (
        <AssistantBody m={m} />
      ) : (
        !m.streaming && <p className="text-[12px] text-faint">Sin respuesta.</p>
      )}

      {m.streaming && (
        <span className="mt-1 inline-flex items-center gap-2 text-[11.5px] text-faint">
          <span className="nv-caret" />
          {liveSecs}s
        </span>
      )}
      {m.stopped && !m.streaming && <div className="mt-1 text-[11px] text-faint">Detenido por ti.</div>}
      {m.error && !m.streaming && <div className="mt-1 text-[11px] text-danger">La respuesta falló.</div>}

      {!m.streaming && m.content && (
        <div className={cn("mt-1 flex items-center gap-0.5", live ? "" : "opacity-0 transition-opacity group-hover:opacity-100")}>
          <IconButton title="Copiar respuesta" onClick={() => void copyText(m.content)}>
            <Copy size={12} />
          </IconButton>
          <IconButton title="Insertar en la nota" onClick={insert}>
            <CornerDownLeft size={12} />
          </IconButton>
          <IconButton title="Crear nota con la respuesta" onClick={() => void asNote()}>
            <FilePlus size={12} />
          </IconButton>
          <span className="flex-1" />
          <IconButton title="Buena respuesta" active={m.vote === 1} onClick={() => vote(m.id, 1)}>
            <ThumbsUp size={12} />
          </IconButton>
          <IconButton title="Mala respuesta" active={m.vote === -1} onClick={() => vote(m.id, -1)}>
            <ThumbsDown size={12} />
          </IconButton>
        </div>
      )}
    </div>
  );
}

function ModelSelector() {
  const model = useAssistant((s) => s.model);
  const models = useAssistant((s) => s.models);
  const providerLabel = useAssistant((s) => s.providerLabel);
  const loadModels = useAssistant((s) => s.loadModels);
  const setModel = useAssistant((s) => s.setModel);
  const setSettings = useAssistant((s) => s.setSettings);
  const openMenuFor = (e: ReactMouseEvent<HTMLButtonElement>) => {
    const list = models.length ? models : [model].filter(Boolean);
    openMenu(e, [
      ...list.map((m) => ({
        label: m,
        hint: m === model ? "activo" : "",
        onSelect: () => void setModel(m),
      })),
      { separator: true },
      { label: "Buscar modelos del servidor", onSelect: () => void loadModels(true) },
      { label: "Ajustes de IA…", icon: <Settings2 size={13} />, onSelect: () => setSettings(true) },
    ]);
  };
  return (
    <button
      type="button"
      onClick={openMenuFor}
      title={providerLabel ? `Proveedor: ${providerLabel}` : "Modelo"}
      className="flex min-w-0 items-center gap-1 rounded-md px-1.5 py-1 text-[11.5px] text-dim hover:bg-hover hover:text-text"
    >
      <span className="truncate">{model || "modelo"}</span>
      <ChevronDown size={12} className="flex-none text-faint" />
    </button>
  );
}

function Composer() {
  const ask = useAssistant((s) => s.ask);
  const stop = useAssistant((s) => s.stop);
  const busy = useAssistant((s) => s.busy);
  const streamingId = useAssistant((s) => s.streamingId);
  const toast = useApp((s) => s.toast);
  const [text, setText] = useState("");
  const [pending, setPending] = useState<ChatContext[]>([]);
  const mode = useAssistant((s) => s.mode);
  const setMode = useAssistant((s) => s.setMode);
  const modeInfo = vaultMode(mode);
  const folders = useAssistant((s) => s.folders);
  const toggleFolder = useAssistant((s) => s.toggleFolder);
  const files = useAssistant((s) => s.files);
  const toggleFile = useAssistant((s) => s.toggleFile);
  const [evaluating, setEvaluating] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);

  const grow = () => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 8 * 20 + 16)}px`;
  };
  useEffect(grow, [text]);

  const send = () => {
    const q = text.trim();
    if (!q || busy) return;
    // Contexts travel as the turn's selection until Fase 3 gives them their own
    // structured payload.
    const selection = pending.map((c) => c.text).join("\n\n");
    void ask(q, selection);
    setText("");
    setPending([]);
    window.setTimeout(grow, 0);
  };

  const addSelection = () => {
    const app = useApp.getState();
    const note = app.active ? app.notes[app.active] : undefined;
    const sel = editorSelection();
    if (!sel.trim()) return;
    setPending((p) => [...p, { path: note?.path ?? "", text: sel }]);
  };

  /** The topic folder the actions work on: the one selected in the chat, else the open note's folder. */
  const topicTarget = (): string => {
    // A selected file (typically the practice file) names its topic folder: nothing to search for.
    if (files.length) {
      const f = files[0]!;
      return f.includes("/") ? f.slice(0, f.lastIndexOf("/")) : "";
    }
    if (folders.length === 1) return folders[0]!;
    const active = useApp.getState().active;
    return active && active.includes("/") ? active.slice(0, active.lastIndexOf("/")) : "";
  };

  /** The AI re-reads the topic's theory and rewrites its practice plan. */
  const reevaluate = async () => {
    const target = topicTarget();
    if (!target) {
      toast("error", "Selecciona la carpeta de un tema (clic derecho → Añadir al chat de IA) o abre una de sus notas.");
      return;
    }
    setEvaluating(true);
    const name = target.split("/").pop();
    const chat = useAssistant.getState();
    await chat.addMessage("system", `Re-evaluando la práctica de «${name}»: la IA lee su teoría y prepara la lista de competencias…`);
    // Name the conversation after what it is, instead of leaving it as "Nueva conversación".
    const now = useAssistant.getState();
    if (now.conversationId && !now.title) await now.renameConversation(now.conversationId, `Re-evaluar práctica: ${name}`);
    try {
      // Nothing is changed yet: the chat shows the checklist and the user decides.
      const options = await api.studyTopicSkillOptions(target);
      const block = "```nv-skills\n" + JSON.stringify(options) + "\n```";
      await chat.addMessage("assistant", `Estas son las competencias para «${options.title}». Marqué las que recomiendo; debajo de cada una explico por qué y cómo se practicaría en este tema. Ajusta lo que quieras y pulsa **Aplicar**.\n\n${block}`);
    } catch (e) {
      await chat.addMessage("system", `✗ No pude preparar la lista: ${(e as Error).message}`);
      toast("error", (e as Error).message);
    } finally {
      setEvaluating(false);
    }
  };

  const generateTopic = () => {
    const target = topicTarget();
    if (!target) {
      toast("error", "Selecciona la carpeta de un tema (clic derecho → Añadir al chat de IA) o abre una de sus notas.");
      return;
    }
    void generateTopicFrom(target);
  };

  const openModes = (e: ReactMouseEvent<HTMLButtonElement>) => {
    const target = topicTarget();
    const shown = target ? target.split("/").pop() : "";
    openMenu(e, [
      {
        label: "Generar tema completo",
        description: `Escribe la teoría, el mapa, la práctica y la matriz de competencias${shown ? ` de «${shown}»` : " de la carpeta seleccionada"}.`,
        icon: <Sparkles size={13} />,
        onSelect: generateTopic,
      },
      {
        label: "Re-evaluar práctica del tema",
        description: "La IA relee la teoría y vuelve a elegir competencias y cantidades.",
        icon: <Wand2 size={13} />,
        onSelect: () => void reevaluate(),
      },
      { separator: true },
      ...VAULT_MODES.map((m) => ({
        label: m.label,
        description: m.hint,
        hint: mode === m.id ? "activo" : "",
        icon: <Layers size={13} />,
        onSelect: () => setMode(m.id),
      })),
      { separator: true },
      ...(isPracticePath(useApp.getState().active)
        ? [
            {
              label: "Práctica de programación",
              description: "Especificar, construir, defender y cerrar un proyecto semanal, o el reto de lógica.",
              icon: <Hammer size={13} />,
              onSelect: () => usePracticeDialog.getState().show(),
            },
            { separator: true as const },
          ]
        : []),
      {
        label: "Generar espacio de estudio",
        description: "Temario, teoría, práctica y mapas de una materia entera.",
        icon: <GraduationCap size={13} />,
        onSelect: () => useStudySpaceDialog.getState().openWith("space"),
      },
      {
        label: "Crear área nueva",
        description: "Añade un área (con sus temas) a un espacio que ya existe.",
        icon: <FolderPlus size={13} />,
        onSelect: () => useStudySpaceDialog.getState().openWith("area"),
      },
      ...(mode ? [{ separator: true }, { label: "Salir del modo", icon: <X size={13} />, onSelect: () => setMode("") }] : []),
    ]);
  };

  return (
    <div className="flex-none p-2.5">
      {(!!pending.length || !!folders.length || !!files.length) && (
        <div className="mb-1.5 flex flex-wrap gap-1">
          {files.map((f) => (
            <ContextChip key={`file:${f}`} ctx={{ path: f, text: "", file: true }} onRemove={() => toggleFile(f)} />
          ))}
          {folders.map((f) => (
            <ContextChip key={f} ctx={{ path: f, text: "", folder: true }} onRemove={() => toggleFolder(f)} />
          ))}
          {pending.map((c, i) => (
            <ContextChip key={i} ctx={c} onRemove={() => setPending((p) => p.filter((_, j) => j !== i))} />
          ))}
        </div>
      )}
      {evaluating && (
        <div className="mb-1.5 flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent-soft px-2.5 py-0.5 text-[11px] font-semibold text-accent-text">
            <Loader2 size={11} className="animate-spin" /> Re-evaluando práctica del tema…
          </span>
        </div>
      )}
      {modeInfo && (
        <div className="mb-1.5 flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent-soft px-2.5 py-0.5 text-[11px] font-semibold text-accent-text">
            <Wand2 size={11} /> {modeInfo.label}
            <button type="button" aria-label="Salir del modo" onClick={() => setMode("")} className="rounded hover:text-text">
              <X size={11} />
            </button>
          </span>
        </div>
      )}
      <div className="rounded-xl border border-line bg-elevated px-2.5 py-2 focus-within:border-accent">
        <textarea
          ref={area}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="Pregunta al asistente"
          placeholder={modeInfo?.placeholder ?? "Pregunta algo sobre esta nota…"}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          className="max-h-40 w-full resize-none bg-transparent text-[12.5px] leading-relaxed text-text outline-none placeholder:text-faint"
        />
        <div className="mt-1 flex items-center gap-1">
          <button
            type="button"
            title="Añadir contexto"
            onClick={(e) =>
              openMenu(e, [
                { label: "Selección del editor", icon: <Paperclip size={13} />, onSelect: addSelection },
                (() => {
                  // The tab on screen: a note or a canvas.
                  const st = useApp.getState();
                  const tab = st.openTabs.find((t) => t.tabId === st.activeTabId);
                  const active = tab && (tab.kind === "note" || tab.kind === "canvas") ? tab.path : "";
                  return {
                    label: "Archivo abierto",
                    description: !active ? "Abre un archivo primero." : files.includes(active) ? `Quitar «${active.split("/").pop()}» del chat` : `Añadir «${active.split("/").pop()}» al chat (con sus skills)`,
                    icon: <FileCode2 size={13} />,
                    disabled: !active,
                    onSelect: () => toggleFile(active!),
                  };
                })(),
                (() => {
                  const active = useApp.getState().active;
                  const dir = active && active.includes("/") ? active.slice(0, active.lastIndexOf("/")) : "";
                  return {
                    label: dir ? `Carpeta de la nota abierta` : "Carpeta de la nota abierta",
                    description: dir ? (folders.includes(dir) ? `Quitar «${dir.split("/").pop()}» del chat` : `Añadir «${dir.split("/").pop()}» al chat`) : "Abre una nota dentro de una carpeta.",
                    icon: <Folder size={13} />,
                    disabled: !dir,
                    onSelect: () => toggleFolder(dir),
                  };
                })(),
                { label: "Menciones (@archivo)", hint: "Fase 5", disabled: true },
                { label: "Media (imágenes)", hint: "Fase 5", disabled: true },
                { label: "Acciones rápidas", hint: "Fase 5", disabled: true },
              ])
            }
            className="grid h-7 w-7 place-items-center rounded-md text-dim hover:bg-hover hover:text-text"
          >
            <Plus size={15} />
          </button>
          <ModelSelector />
          <button
            type="button"
            title="Modos y acciones de estudio"
            aria-label="Modos del asistente"
            disabled={evaluating}
            onClick={openModes}
            className={cn(
              "grid h-7 w-7 place-items-center rounded-md hover:bg-hover hover:text-text disabled:opacity-50",
              mode ? "bg-accent-soft text-accent-text" : "text-dim",
            )}
          >
            <Layers size={14} className={cn(evaluating && "animate-pulse")} />
          </button>
          <span className="flex-1" />
          <IconButton title="Dictado por voz — fuera de alcance" disabled>
            <Mic size={14} />
          </IconButton>
          {streamingId ? (
            <button
              type="button"
              onClick={() => void stop()}
              title="Detener"
              className="grid h-7 w-7 place-items-center rounded-full bg-elevated text-text hover:bg-hover"
            >
              <Square size={12} fill="currentColor" />
            </button>
          ) : (
            <button
              type="button"
              onClick={send}
              disabled={!text.trim()}
              title="Enviar (Enter)"
              className="grid h-7 w-7 place-items-center rounded-full bg-accent text-white hover:bg-accent-strong disabled:bg-elevated disabled:text-faint"
            >
              <ArrowUp size={15} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** El panel derecho es el mismo en toda la app, pero en la pestaña del Mentor conversa con el Mentor. */
export function AssistantPanel() {
  const inMentor = useApp((s) => s.module === "mentor");
  return inMentor ? <MentorAssistant /> : <NotesAssistantPanel />;
}

function NotesAssistantPanel() {
  const messages = useAssistant((s) => s.messages);
  const busy = useAssistant((s) => s.busy);
  const setOpen = useAssistant((s) => s.setOpen);
  const setSettings = useAssistant((s) => s.setSettings);
  const awaiting = useAssistant((s) => s.awaitingPaste);
  const pasteReply = useAssistant((s) => s.pasteReply);
  const loadModels = useAssistant((s) => s.loadModels);
  const conversationId = useAssistant((s) => s.conversationId);
  const conversationTitle = useAssistant((s) => s.title);
  const historyOpen = useAssistant((s) => s.historyOpen);
  const setHistory = useAssistant((s) => s.setHistory);
  const newConversation = useAssistant((s) => s.newConversation);
  const renameConversation = useAssistant((s) => s.renameConversation);
  // Projects and daily katas belong to the programming_practice area only.
  const inPractice = useApp((s) => isPracticePath(s.active));
  const [width, setWidth] = useState(() => {
    const stored = Number(localStorage.getItem(WIDTH_KEY));
    return stored >= MIN_WIDTH ? stored : 340;
  });
  const drag = useRef<{ x: number; w: number } | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  useEffect(() => {
    void loadModels(true);
  }, [loadModels]);

  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!drag.current) return;
      setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, drag.current.w + drag.current.x - e.clientX)));
    };
    const up = () => {
      if (drag.current) localStorage.setItem(WIDTH_KEY, String(width));
      drag.current = null;
      document.body.style.cursor = "";
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [width]);

  // Follow the tail of the conversation, but never fight the user: scrolling up
  // unpins the list until they come back down (or send again).
  const userTurns = messages.filter((m) => m.role === "user").length;
  useEffect(() => {
    stick.current = true;
  }, [userTurns]);
  const lastLen = messages.length ? messages[messages.length - 1]!.content.length : 0;
  useEffect(() => {
    const el = list.current;
    if (!el || !stick.current) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, lastLen, busy]);

  const firstQuestion = useMemo(() => {
    const first = messages.find((m) => m.role === "user");
    return first ? first.content.trim().split("\n")[0]!.slice(0, 60) : "";
  }, [messages]);
  // Until the model names the conversation, the first question stands in for it.
  const heading = conversationTitle || firstQuestion || "Nueva conversación";

  return (
    <aside
      className="relative flex flex-none flex-col border-l border-line bg-panel"
      style={{ width }}
      aria-label="Asistente"
    >
      <div
        role="separator"
        aria-label="Redimensionar el asistente"
        className="absolute -left-[3px] top-0 z-10 h-full w-[5px] cursor-col-resize hover:bg-accent/40"
        onMouseDown={(e) => {
          drag.current = { x: e.clientX, w: width };
          document.body.style.cursor = "col-resize";
        }}
      />
      <div className="flex h-9 flex-none items-center gap-0.5 border-b border-line px-2">
        <Sparkles size={14} className="flex-none text-accent-text" />
        <span className="min-w-0 flex-1 truncate pl-1 text-[12.5px] font-medium text-text" title={heading}>
          {heading}
        </span>
        {inPractice && (
          <IconButton title="Práctica de programación: proyectos y retos" onClick={() => usePracticeDialog.getState().show()}>
            <Hammer size={15} />
          </IconButton>
        )}
        <IconButton
          title="Nueva conversación"
          onClick={() => {
            newConversation();
            stick.current = true;
          }}
        >
          <Plus size={15} />
        </IconButton>
        <IconButton title="Historial" onClick={() => setHistory(true)}>
          <History size={15} />
        </IconButton>
        <IconButton title="Cambios (Fase 4)" disabled>
          <GitCompare size={15} />
        </IconButton>
        <IconButton
          title="Más"
          onClick={(e) =>
            openMenu(e, [
              { label: "Personalizar (ajustes de IA)…", icon: <Settings2 size={13} />, onSelect: () => setSettings(true) },
              {
                label: "Renombrar conversación…",
                icon: <Pencil size={13} />,
                disabled: !conversationId,
                onSelect: () => {
                  void (async () => {
                    const next = await askText("Renombrar conversación", conversationTitle || heading, "Guardar");
                    if (next === null || !next.trim() || !conversationId) return;
                    await renameConversation(conversationId, next.trim());
                  })();
                },
              },
              { label: "Exportar (Fase 5)", disabled: true },
              { separator: true },
              { label: "Nueva conversación", icon: <Plus size={13} />, onSelect: newConversation },
            ])
          }
        >
          <MoreHorizontal size={15} />
        </IconButton>
        <IconButton title="Cerrar" onClick={() => setOpen(false)}>
          <X size={15} />
        </IconButton>
      </div>

      {historyOpen ? (
        <HistoryPanel />
      ) : (
        <>
          <div
            ref={list}
            onScroll={(e) => {
              const el = e.currentTarget;
              stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
            }}
            className="min-h-0 flex-1 space-y-3.5 overflow-y-auto px-3 py-3"
          >
            {!messages.length && (
              <div className="rounded-xl border border-dashed border-line-strong p-3 text-[12.5px] leading-relaxed text-dim">
                Pregunta sobre la nota abierta: explicar, resumir, generar ejercicios… Si seleccionas un fragmento en el
                editor, se envía como contexto. Las acciones de estudio de la nota también llegan aquí.
              </div>
            )}
            {messages.map((m, i) => (
              <Message key={m.id} m={m} live={i === messages.length - 1} />
            ))}
          </div>

          {awaiting && (
            <div className="flex-none border-t border-line px-3 py-2">
              <GhostButton
                onClick={async () => pasteReply(await readClipboard())}
                className="w-full justify-center"
              >
                <ClipboardPaste size={13} /> Pegar respuesta
              </GhostButton>
            </div>
          )}

          <Composer />
        </>
      )}
    </aside>
  );
}

/** The conversations kept on this machine: search, grouped by date. */
function HistoryPanel() {
  const history = useAssistant((s) => s.history);
  const query = useAssistant((s) => s.historyQuery);
  const setQuery = useAssistant((s) => s.setHistoryQuery);
  const setHistory = useAssistant((s) => s.setHistory);
  const openConversation = useAssistant((s) => s.openConversation);
  const renameConversation = useAssistant((s) => s.renameConversation);
  const deleteConversation = useAssistant((s) => s.deleteConversation);
  const newConversation = useAssistant((s) => s.newConversation);
  const currentId = useAssistant((s) => s.conversationId);
  return (
    <ConversationHistory
      items={history}
      currentId={currentId}
      query={query}
      onQuery={setQuery}
      onOpen={openConversation}
      onRename={renameConversation}
      onDelete={deleteConversation}
      onNew={newConversation}
      onClose={() => setHistory(false)}
    />
  );
}

export function AiSettingsDialog() {
  const open = useAssistant((s) => s.settingsOpen);
  const setOpen = useAssistant((s) => s.setSettings);
  const loadModels = useAssistant((s) => s.loadModels);
  const toast = useApp((s) => s.toast);
  const [providers, setProviders] = useState<AiProvider[]>([]);
  const [cfg, setCfg] = useState<AiConfig | null>(null);
  const [key, setKey] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  useEffect(() => {
    if (!open) return;
    setKey("");
    setStatus("");
    api.aiSettings()
      .then((r) => {
        setProviders(r.providers);
        setCfg(r.config);
        setModels(r.models ?? []);
      })
      .catch((e) => toast("error", (e as Error).message));
  }, [open, toast]);
  if (!open || !cfg) return null;
  const info = providers.find((p) => p.key === cfg.provider);
  const claudeCode = cfg.provider === "claude_code";
  const save = async (andTest = false) => {
    try {
      const saved = await api.aiSettingsSave({ ...cfg, ...(key ? { api_key: key } : {}) });
      setCfg(saved);
      setKey("");
      await loadModels();
      if (andTest) {
        setStatus("Probando…");
        const r = await api.aiTest();
        setStatus(`✓ ${r.reply}`);
      } else setOpen(false);
    } catch (e) {
      setStatus(`⚠ ${(e as Error).message}`);
    }
  };
  return (
    <Modal
      title="¿Cómo quieres conectar la IA?"
      onClose={() => setOpen(false)}
      width={520}
      footer={
        <>
          <span className="min-w-0 flex-1 truncate text-[11.5px] text-dim">{status}</span>
          <GhostButton onClick={() => void save(true)}>Probar</GhostButton>
          <PrimaryButton onClick={() => void save()}>Guardar</PrimaryButton>
        </>
      }
    >
      <Field label="Proveedor">
        <select
          className={input}
          value={cfg.provider}
          onChange={(e) => {
            const p = providers.find((x) => x.key === e.target.value)!;
            setCfg({
              ...cfg,
              provider: p.key,
              base_url: p.default_url || cfg.base_url,
              model: p.default_model || cfg.model,
            });
            setModels(p.default_models ?? []);
          }}
        >
          {providers.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
      </Field>
      {info && <p className="text-[12px] text-dim">{info.hint}</p>}
      {!info?.bridge && (
        <>
          {!claudeCode && (
            <Field label="URL del servidor">
              <input className={input} value={cfg.base_url} onChange={(e) => setCfg({ ...cfg, base_url: e.target.value })} />
            </Field>
          )}
          <div className="flex items-end gap-2">
            <Field label="Modelo" className="flex-1">
              <input
                className={input}
                list="nv-ai-models"
                value={cfg.model}
                onChange={(e) => setCfg({ ...cfg, model: e.target.value })}
              />
              <datalist id="nv-ai-models">
                {models.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </Field>
            <GhostButton
              onClick={async () => {
                try {
                  await api.aiSettingsSave(cfg);
                  const ms = await api.aiModels();
                  setModels(ms.length ? ms : info?.default_models ?? []);
                  setStatus(ms.length ? `${ms.length} modelos disponibles` : "El servidor no devolvió modelos.");
                } catch (e) {
                  setStatus(`⚠ ${(e as Error).message}`);
                }
              }}
            >
              Buscar modelos
            </GhostButton>
          </div>
          {claudeCode ? (
            <>
              <Field label="Ruta de Claude Code (opcional)">
                <input
                  className={input}
                  value={cfg.claude_path ?? ""}
                  placeholder="Vacío = autodetectar (PATH o %APPDATA%\npm)"
                  onChange={(e) => setCfg({ ...cfg, claude_path: e.target.value })}
                />
              </Field>
              <Field label="Tiempo máximo por respuesta (s)">
                <input
                  type="number"
                  min={10}
                  max={1800}
                  className={input}
                  value={cfg.claude_timeout_s ?? 180}
                  onChange={(e) => setCfg({ ...cfg, claude_timeout_s: Number(e.target.value) })}
                />
              </Field>
            </>
          ) : (
            <>
          <Field label={`API key${cfg.has_key ? " (guardada)" : ""}`}>
            <div className="flex gap-2">
              <input
                type="password"
                className={input}
                value={key}
                autoComplete="off"
                placeholder={cfg.has_key ? "•••••••• (déjalo vacío para conservarla)" : "sk-… (DeepSeek, OpenAI o Anthropic)"}
                onChange={(e) => setKey(e.target.value)}
              />
              {cfg.has_key && (
                <GhostButton
                  onClick={async () => {
                    const c = await api.aiSettingsSave({ ...cfg, clear_key: true });
                    setCfg(c);
                  }}
                >
                  Borrar
                </GhostButton>
              )}
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Temperatura">
              <input
                type="number"
                step={0.1}
                min={0}
                max={2}
                className={input}
                value={cfg.temperature}
                onChange={(e) => setCfg({ ...cfg, temperature: Number(e.target.value) })}
              />
            </Field>
            <Field label="Máx. tokens">
              <input
                type="number"
                min={64}
                max={32000}
                className={input}
                value={cfg.max_tokens}
                onChange={(e) => setCfg({ ...cfg, max_tokens: Number(e.target.value) })}
              />
            </Field>
          </div>
            </>
          )}
        </>
      )}
      <label className="flex items-center gap-2 text-[12.5px] text-dim">
        <input
          type="checkbox"
          checked={cfg.include_note}
          onChange={(e) => setCfg({ ...cfg, include_note: e.target.checked })}
        />{" "}
        Enviar la nota abierta como contexto
      </label>
    </Modal>
  );
}
