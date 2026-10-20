// Asesor Nutricional IA: panel lateral especializado para el módulo de Alimentación.
//
// Conversa exclusivamente sobre nutrición, macros, calorías, hidratación, comidas
// y recetas adaptadas al entrenamiento físico, con la misma arquitectura que Ejercicio y Finanzas.

import {
  Apple,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
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
import { useNutritionCoach, type NutritionCoachMessage } from "../../store/nutritionCoach";
import { useNutrition } from "../../store/nutrition";
import { useExercise } from "../../store/exercise";
import { splitNutritionAction } from "../../lib/nutritionCoachActions";
import { NutritionActionCard } from "./NutritionActionCard";
import { ConversationHistory } from "../notes/ConversationHistory";
import { askText, cn, IconButton, openMenu } from "../ui";

const WIDTH_KEY = "nv.assistant.width";
const MIN_WIDTH = 320;
const MAX_WIDTH = 720;

const SUGGESTIONS = [
  "🥩 ¿Cómo cubro los gramos de proteína que me faltan hoy?",
  "🥗 Dame una idea de comida con lo que tengo en mi despensa",
  "🥑 ¿Qué puedo cenar ligero que no supere 400 kcal?",
  "💧 Analizá mi balance calórico e hidratación de hoy",
  "⚡ ¿Qué me recomiendas comer antes y después de entrenar?",
];

export function NutritionCoachAssistant() {
  const messages = useNutritionCoach((s) => s.messages);
  const busy = useNutritionCoach((s) => s.busy);
  const conversationId = useNutritionCoach((s) => s.conversationId);
  const title = useNutritionCoach((s) => s.title);
  const historyOpen = useNutritionCoach((s) => s.historyOpen);
  const setHistory = useNutritionCoach((s) => s.setHistory);
  const history = useNutritionCoach((s) => s.history);
  const historyQuery = useNutritionCoach((s) => s.historyQuery);
  const setHistoryQuery = useNutritionCoach((s) => s.setHistoryQuery);
  const newConversation = useNutritionCoach((s) => s.newConversation);
  const openConversation = useNutritionCoach((s) => s.openConversation);
  const renameConversation = useNutritionCoach((s) => s.renameConversation);
  const deleteConversation = useNutritionCoach((s) => s.deleteConversation);
  const ask = useNutritionCoach((s) => s.ask);
  const stop = useNutritionCoach((s) => s.stop);
  const model = useNutritionCoach((s) => s.model);
  const providerLabel = useNutritionCoach((s) => s.providerLabel);
  const loadModels = useNutritionCoach((s) => s.loadModels);
  const loadContext = useNutritionCoach((s) => s.loadContext);
  const contextInfo = useNutritionCoach((s) => s.contextInfo);

  const setSettings = useAssistant((s) => s.setSettings);
  const summary = useNutrition((s) => s.summary);
  const exerciseProfile = useExercise((s) => s.profile);

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

  const heading = title || "Asesor Nutricional";
  const calRemaining = summary ? summary.targets.calories - summary.totals.calories : contextInfo?.caloriesRemaining ?? null;
  const goal = exerciseProfile?.goal || contextInfo?.goal;

  if (historyOpen) {
    return (
      <aside
        className="relative flex flex-none flex-col border-l border-line bg-panel"
        style={{ width }}
        aria-label="Historial del Asesor Nutricional"
      >
        <ConversationHistory
          title="Historial de Nutrición"
          items={history}
          currentId={conversationId}
          query={historyQuery}
          onQuery={setHistoryQuery}
          onOpen={(id: string) => void openConversation(id)}
          onDelete={(id: string) => void deleteConversation(id)}
          onRename={(id: string, next: string) => void renameConversation(id, next)}
          onNew={() => newConversation()}
          onClose={() => setHistory(false)}
        />
      </aside>
    );
  }

  return (
    <aside
      className="relative flex flex-none flex-col border-l border-line bg-panel select-none"
      style={{ width }}
      aria-label="Asesor Nutricional IA"
      data-testid="nutrition-coach-assistant"
    >
      {/* Manija de redimensión */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Redimensionar panel del asesor"
        onMouseDown={(e) => {
          drag.current = { x: e.clientX, w: width };
          document.body.style.cursor = "ew-resize";
        }}
        className="absolute top-0 bottom-0 -left-1 w-2 cursor-ew-resize hover:bg-accent/40 transition-colors z-20"
      />

      {/* Cabecera idéntica a Ejercicio y Finanzas */}
      <div className="flex h-11 items-center justify-between border-b border-line px-3 gap-2 flex-none">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="grid h-6 w-6 place-items-center rounded bg-emerald-500/10 text-emerald-500 flex-none">
            <Apple size={14} />
          </div>
          <div className="min-w-0 flex-1 flex items-baseline gap-1.5 truncate">
            <span className="text-[12.5px] font-semibold text-text truncate" title={heading}>
              {heading}
            </span>
            {calRemaining !== null && (
              <span
                className={`text-[10px] font-medium px-1.5 py-0.2 rounded-full ${
                  calRemaining >= 0 ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"
                }`}
                title="Calorías restantes de hoy"
              >
                {calRemaining >= 0 ? `${calRemaining} kcal rest.` : `${Math.abs(calRemaining)} kcal exc.`}
              </span>
            )}
            {goal && (
              <span className="text-[10px] font-medium px-1.5 py-0.2 rounded-full bg-elevated text-faint truncate hidden sm:inline">
                {goal}
              </span>
            )}
          </div>
        </div>

        <IconButton title="Nueva conversación" onClick={() => newConversation()}>
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
        <IconButton title="Cerrar Asesor" onClick={() => toggleFace("assistant")}>
          <X size={15} />
        </IconButton>
      </div>

      {/* Lista de mensajes */}
      <div ref={listRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col justify-between py-2">
            <div className="space-y-3 text-center">
              <div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-emerald-500/10 text-emerald-500">
                <Apple size={20} />
              </div>
              <div>
                <h4 className="text-[13px] font-semibold text-text">Asesor Nutricional IA</h4>
                <p className="mt-1 text-[11.5px] text-dim leading-relaxed">
                  Conozco tus comidas de hoy, tus metas de macronutrientes, tu despensa de alimentos y tu objetivo físico de entrenamiento. ¿En qué te ayudo hoy?
                </p>
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
            <MessageItem
              key={m.id}
              m={m}
              onVote={(val) => useNutritionCoach.getState().vote(m.id, val)}
            />
          ))
        )}

        {busy && (
          <div className="flex items-center gap-2 rounded-lg bg-surface/50 p-2 text-[11px] text-dim">
            <Sparkles size={13} className="animate-pulse text-emerald-400" />
            <span>El asesor está preparando su respuesta…</span>
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
            placeholder="Preguntale al Asesor Nutricional o contale qué comiste…"
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
  m: NutritionCoachMessage;
  onVote: (val: 1 | -1) => void;
}) {
  const toast = useApp((s) => s.toast);
  const [copied, setCopied] = useState(false);
  const [openThinking, setOpenThinking] = useState(false);

  const { text, action } = useMemo(() => splitNutritionAction(m.content), [m.content]);
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
        className="nv-chat-prose prose prose-sm dark:prose-invert max-w-none text-main"
        dangerouslySetInnerHTML={{ __html: html }}
      />

      {action && !m.error && <NutritionActionCard action={action} />}

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
            className={cn("rounded p-1 hover:bg-hover hover:text-text", m.vote === 1 && "text-accent-text font-bold")}
          >
            <ThumbsUp size={11} />
          </button>
          <button
            type="button"
            title="No útil"
            onClick={() => onVote(-1)}
            className={cn("rounded p-1 hover:bg-hover hover:text-text", m.vote === -1 && "text-danger font-bold")}
          >
            <ThumbsDown size={11} />
          </button>
        </div>

        {m.ms && (
          <span className="text-[10px] text-faint">
            {(m.ms / 1000).toFixed(1)}s
          </span>
        )}
      </div>
    </div>
  );
}
