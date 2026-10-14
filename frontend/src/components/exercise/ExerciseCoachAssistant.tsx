// Coach de Entrenamiento IA: panel lateral especializado para el módulo de Ejercicio.
//
// Conversa exclusivamente sobre entrenamiento, rutinas, sobrecarga progresiva,
// técnica, biomecánica y evolución de peso corporal, completamente aislado de Notas.

import {
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Dumbbell,
  History,
  MoreHorizontal,
  Pencil,
  Plus,
  Settings2,
  Sparkles,
  Square,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { renderMarkdown } from "../../lib/markdown";
import { toggleFace } from "../../lib/panelFaces";
import { useApp } from "../../store/app";
import { useAssistant } from "../../store/assistant";
import { useExercise } from "../../store/exercise";
import { useExerciseCoach, type CoachMessage } from "../../store/exerciseCoach";
import { splitCoachAction } from "../../lib/exerciseCoachActions";
import { CoachActionCard } from "./CoachActionCard";
import { ConversationHistory } from "../notes/ConversationHistory";
import { askText, cn, IconButton, openMenu } from "../ui";

const WIDTH_KEY = "nv.assistant.width";
const MIN_WIDTH = 320;
const MAX_WIDTH = 720;

const SUGGESTIONS = [
  "💪 ¿Cómo optimizar mi rutina para hipertrofia?",
  "🔄 ¿Qué ejercicio reemplaza el press de banca con mancuernas?",
  "⚖️ Analizá mi evolución de peso respecto a mi meta",
  "⏱️ ¿Cuáles son los tiempos de descanso recomendados para fuerza?",
  "🔥 ¿Cómo organizar un buen calentamiento y series de aproximación?",
];

const GOAL_SHORT_LABELS: Record<string, string> = {
  hipertrofia: "Hipertrofia",
  fuerza: "Fuerza / Potencia",
  definicion: "Definición",
  resistencia: "Resistencia",
  salud: "Salud general",
  otro: "Personalizado",
};

export function ExerciseCoachAssistant() {
  const messages = useExerciseCoach((s) => s.messages);
  const busy = useExerciseCoach((s) => s.busy);
  const conversationId = useExerciseCoach((s) => s.conversationId);
  const title = useExerciseCoach((s) => s.title);
  const historyOpen = useExerciseCoach((s) => s.historyOpen);
  const setHistory = useExerciseCoach((s) => s.setHistory);
  const history = useExerciseCoach((s) => s.history);
  const historyQuery = useExerciseCoach((s) => s.historyQuery);
  const setHistoryQuery = useExerciseCoach((s) => s.setHistoryQuery);
  const newConversation = useExerciseCoach((s) => s.newConversation);
  const openConversation = useExerciseCoach((s) => s.openConversation);
  const renameConversation = useExerciseCoach((s) => s.renameConversation);
  const deleteConversation = useExerciseCoach((s) => s.deleteConversation);
  const ask = useExerciseCoach((s) => s.ask);
  const stop = useExerciseCoach((s) => s.stop);
  const model = useExerciseCoach((s) => s.model);
  const providerLabel = useExerciseCoach((s) => s.providerLabel);
  const loadModels = useExerciseCoach((s) => s.loadModels);
  const loadContext = useExerciseCoach((s) => s.loadContext);
  const contextInfo = useExerciseCoach((s) => s.contextInfo);

  const setSettings = useAssistant((s) => s.setSettings);

  const [input, setInput] = useState("");
  const [width, setWidth] = useState(() => {
    const stored = Number(localStorage.getItem(WIDTH_KEY));
    return stored >= MIN_WIDTH ? stored : 360;
  });

  const drag = useRef<{ x: number; w: number } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    void loadModels(true);
    void loadContext();
  }, [loadModels, loadContext]);

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

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, busy]);

  const handleSend = () => {
    const q = input.trim();
    if (!q || busy) return;
    setInput("");
    void ask(q);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const profile = useExercise((s) => s.profile);
  const heading = title || "Coach de Entrenamiento";
  const activeGoalKey = profile?.goal || contextInfo?.goal;
  const goalBadge = activeGoalKey ? GOAL_SHORT_LABELS[activeGoalKey] || activeGoalKey : null;
  const weightBadge = contextInfo?.currentWeight ? `${contextInfo.currentWeight} kg` : null;
  const limitations = profile?.health_limitations?.trim() || contextInfo?.health_limitations?.trim();

  if (historyOpen) {
    return (
      <aside
        className="relative flex flex-none flex-col border-l border-line bg-panel"
        style={{ width }}
        aria-label="Historial del Coach"
      >
        <ConversationHistory
          title="Historial del Coach"
          ariaLabel="Historial de consultas de entrenamiento"
          items={history}
          currentId={conversationId}
          query={historyQuery}
          onQuery={setHistoryQuery}
          onOpen={(id) => void openConversation(id)}
          onRename={(id, t) => void renameConversation(id, t)}
          onDelete={(id) => void deleteConversation(id)}
          onNew={() => newConversation()}
          onClose={() => setHistory(false)}
          emptyText="Aún no hay consultas guardadas con el Coach. Escribe en el chat y aparecerán aquí."
        />
      </aside>
    );
  }

  return (
    <aside
      className="relative flex flex-none flex-col border-l border-line bg-panel"
      style={{ width }}
      aria-label="Coach de Entrenamiento"
    >
      {/* Tirador para redimensionar ancho */}
      <div
        className="absolute top-0 bottom-0 -left-1 z-10 w-2 cursor-col-resize hover:bg-accent/40"
        onMouseDown={(e) => {
          drag.current = { x: e.clientX, w: width };
          document.body.style.cursor = "col-resize";
        }}
      />

      {/* Encabezado */}
      <div className="flex h-10 flex-none items-center gap-1.5 border-b border-line px-2.5">
        <Dumbbell size={15} className="flex-none text-accent-text" />
        <div className="min-w-0 flex-1 truncate">
          <div className="flex items-center gap-1.5 truncate">
            <span className="truncate text-[12.5px] font-semibold text-text" title={heading}>
              {heading}
            </span>
            {(goalBadge || weightBadge) && (
              <span className="flex-none rounded bg-hover px-1.5 py-0.5 text-[10px] font-medium text-dim">
                {[goalBadge, weightBadge].filter(Boolean).join(" · ")}
              </span>
            )}
            {limitations && (
              <span
                className="flex-none rounded bg-danger/10 px-1.5 py-0.5 text-[10px] font-medium text-danger truncate max-w-[140px]"
                title={`Limitación médica activa: ${limitations}`}
              >
                🛡️ {limitations}
              </span>
            )}
          </div>
        </div>

        <IconButton
          title="Nueva conversación"
          onClick={() => newConversation()}
        >
          <Plus size={15} />
        </IconButton>
        <IconButton title="Historial" onClick={() => setHistory(true)}>
          <History size={15} />
        </IconButton>
        <IconButton
          title="Más opciones"
          onClick={(e) =>
            openMenu(e, [
              {
                label: "Ajustes de IA…",
                icon: <Settings2 size={13} />,
                onSelect: () => setSettings(true),
              },
              {
                label: "Renombrar conversación…",
                icon: <Pencil size={13} />,
                disabled: !conversationId,
                onSelect: () => {
                  void (async () => {
                    const next = await askText("Renombrar consulta", title || heading, "Guardar");
                    if (next === null || !next.trim() || !conversationId) return;
                    await renameConversation(conversationId, next.trim());
                  })();
                },
              },
              { separator: true },
              { label: "Nueva conversación", icon: <Plus size={13} />, onSelect: newConversation },
            ])
          }
        >
          <MoreHorizontal size={15} />
        </IconButton>
        <IconButton title="Cerrar Coach" onClick={() => toggleFace("assistant")}>
          <X size={15} />
        </IconButton>
      </div>

      {/* Lista de mensajes */}
      <div ref={listRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col justify-between py-2">
            <div className="space-y-3 text-center">
              <div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-accent/10 text-accent-text">
                <Dumbbell size={20} />
              </div>
              <div>
                <h4 className="text-[13px] font-semibold text-text">Coach de Entrenamiento</h4>
                <p className="mt-1 text-[11.5px] text-dim leading-relaxed">
                  Conozco tus rutinas configuradas en el vault, tu objetivo físico y tus pesajes corporales.
                  ¿En qué puedo ayudarte hoy?
                </p>
                {limitations && (
                  <div className="mt-2 rounded-lg border border-danger/20 bg-danger/5 p-2 text-left text-[11px] text-danger">
                    <span className="font-semibold">🛡️ Limitación médica activa:</span>{" "}
                    <span className="text-text">{limitations}</span>
                  </div>
                )}
              </div>

              {/* Sugerencias rápidas */}
              <div className="mt-4 space-y-1.5 text-left">
                <div className="text-[10.5px] font-medium uppercase tracking-wider text-faint px-1">
                  Sugerencias rápidas
                </div>
                {SUGGESTIONS.map((sug) => (
                  <button
                    key={sug}
                    type="button"
                    onClick={() => {
                      setInput("");
                      void ask(sug);
                    }}
                    className="w-full rounded-lg border border-line bg-surface/60 p-2 text-left text-[11.5px] text-text hover:bg-hover hover:border-line-strong transition-colors"
                  >
                    {sug}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          messages.map((m) => (
            <MessageItem key={m.id} m={m} onVote={(val) => useExerciseCoach.getState().vote(m.id, val)} />
          ))
        )}

        {busy && (
          <div className="flex items-center gap-2 rounded-lg bg-surface/50 p-2 text-[11px] text-dim">
            <Sparkles size={13} className="animate-pulse text-accent-text" />
            <span>El coach está preparando su respuesta…</span>
          </div>
        )}
      </div>

      {/* Barra de entrada / Composer */}
      <div className="flex-none border-t border-line bg-surface/40 p-2">
        <div className="relative rounded-lg border border-line bg-panel focus-within:border-accent">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Preguntale al Coach de Entrenamiento…"
            rows={2}
            className="w-full resize-none bg-transparent px-2.5 pt-2 pb-8 text-[12px] text-text placeholder:text-faint focus:outline-none"
          />

          <div className="absolute bottom-1.5 left-2 flex items-center gap-1.5 text-[10.5px] text-faint">
            <span className="truncate max-w-[150px]">
              {providerLabel ? `${providerLabel} · ` : ""}{model || "IA activa"}
            </span>
          </div>

          <div className="absolute bottom-1.5 right-1.5 flex items-center gap-1">
            {busy ? (
              <button
                type="button"
                title="Detener respuesta"
                onClick={() => void stop()}
                className="grid h-6 w-6 place-items-center rounded bg-danger text-white hover:bg-danger-soft transition-colors"
              >
                <Square size={11} fill="currentColor" />
              </button>
            ) : (
              <button
                type="button"
                title="Enviar (Enter)"
                disabled={!input.trim()}
                onClick={handleSend}
                className="grid h-6 w-6 place-items-center rounded bg-accent text-white hover:bg-accent-strong disabled:opacity-40 transition-colors"
              >
                <ArrowUp size={13} />
              </button>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}

function MessageItem({
  m,
  onVote,
}: {
  m: CoachMessage;
  onVote: (val: 1 | -1) => void;
}) {
  const toast = useApp((s) => s.toast);
  const [copied, setCopied] = useState(false);
  const [openThinking, setOpenThinking] = useState(false);

  const { text, action } = useMemo(() => splitCoachAction(m.content), [m.content]);
  const html = useMemo(() => renderMarkdown(text), [text]);

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast("info", "Copiado al portapapeles");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard error */
    }
  };

  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-lg bg-accent px-3 py-2 text-[12px] text-white">
          <p className="whitespace-pre-wrap">{m.content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="group rounded-lg border border-line bg-surface p-2.5 text-[12px] text-text">
      {m.thinking && (
        <div className="mb-2 rounded border border-line/50 bg-panel/60 p-1.5 text-[11px] text-dim">
          <button
            type="button"
            onClick={() => setOpenThinking(!openThinking)}
            className="flex items-center gap-1 text-[10.5px] font-medium text-faint hover:text-text"
          >
            {openThinking ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            <span>Pensamiento del modelo</span>
          </button>
          {openThinking && (
            <p className="mt-1 whitespace-pre-wrap text-[10.5px] text-dim">{m.thinking}</p>
          )}
        </div>
      )}

      <div
        className="nv-chat-prose prose prose-sm dark:prose-invert max-w-none"
        dangerouslySetInnerHTML={{ __html: html }}
      />

      {action && !m.error && <CoachActionCard action={action} />}

      {/* Botones de acción en hover */}
      <div className="mt-2 flex items-center justify-between border-t border-line/40 pt-1.5 text-[10.5px] text-faint">
        <div className="flex items-center gap-1">
          <button
            type="button"
            title="Copiar respuesta"
            onClick={() => void copyText()}
            className="rounded p-1 hover:bg-hover hover:text-text"
          >
            {copied ? <Check size={11} className="text-mint" /> : <Copy size={11} />}
          </button>
          <button
            type="button"
            title="Útil"
            onClick={() => onVote(1)}
            className={cn("rounded p-1 hover:bg-hover", m.vote === 1 ? "text-accent-text" : "hover:text-text")}
          >
            <ThumbsUp size={11} />
          </button>
          <button
            type="button"
            title="No útil"
            onClick={() => onVote(-1)}
            className={cn("rounded p-1 hover:bg-hover", m.vote === -1 ? "text-danger" : "hover:text-text")}
          >
            <ThumbsDown size={11} />
          </button>
        </div>
        {m.ms && <span>{Math.round(m.ms / 1000)}s</span>}
      </div>
    </div>
  );
}
