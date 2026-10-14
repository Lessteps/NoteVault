// Coach Financiero IA: panel lateral especializado para el módulo de Finanzas.
//
// Conversa exclusivamente sobre presupuesto consciente, análisis de gastos,
// metas de ahorro y flujo de caja, completamente aislado de Notas, Mentor y Ejercicio.

import {
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  History,
  MoreHorizontal,
  Pencil,
  PiggyBank,
  Plus,
  Settings2,
  Sparkles,
  Square,
  ThumbsDown,
  ThumbsUp,
  Wallet,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { renderMarkdown } from "../../lib/markdown";
import { formatMoney } from "../../lib/money";
import { toggleFace } from "../../lib/panelFaces";
import { useApp } from "../../store/app";
import { useAssistant } from "../../store/assistant";
import { useFinance } from "../../store/finance";
import { useFinanceCoach, type FinanceCoachMessage } from "../../store/financeCoach";
import { splitFinanceAction } from "../../lib/financeCoachActions";
import { FinanceActionCard } from "./FinanceActionCard";
import { ConversationHistory } from "../notes/ConversationHistory";
import { askText, cn, IconButton, openMenu } from "../ui";

const WIDTH_KEY = "nv.assistant.width";
const MIN_WIDTH = 320;
const MAX_WIDTH = 720;

const SUGGESTIONS = [
  "📊 ¿Cómo viene mi ritmo de gasto este mes vs presupuesto?",
  "🛒 Gasté $15.000 en el supermercado hoy, anótalo",
  "💡 ¿En qué categoría estoy gastando más dinero este mes?",
  "🎯 ¿Cómo van mis metas de ahorro y cuánto me falta?",
  "💰 Ajustá mi presupuesto mensual a $80.000",
];

export function FinanceCoachAssistant() {
  const messages = useFinanceCoach((s) => s.messages);
  const busy = useFinanceCoach((s) => s.busy);
  const conversationId = useFinanceCoach((s) => s.conversationId);
  const title = useFinanceCoach((s) => s.title);
  const historyOpen = useFinanceCoach((s) => s.historyOpen);
  const setHistory = useFinanceCoach((s) => s.setHistory);
  const history = useFinanceCoach((s) => s.history);
  const historyQuery = useFinanceCoach((s) => s.historyQuery);
  const setHistoryQuery = useFinanceCoach((s) => s.setHistoryQuery);
  const newConversation = useFinanceCoach((s) => s.newConversation);
  const openConversation = useFinanceCoach((s) => s.openConversation);
  const renameConversation = useFinanceCoach((s) => s.renameConversation);
  const deleteConversation = useFinanceCoach((s) => s.deleteConversation);
  const ask = useFinanceCoach((s) => s.ask);
  const stop = useFinanceCoach((s) => s.stop);
  const model = useFinanceCoach((s) => s.model);
  const providerLabel = useFinanceCoach((s) => s.providerLabel);
  const loadModels = useFinanceCoach((s) => s.loadModels);
  const loadContext = useFinanceCoach((s) => s.loadContext);
  const contextData = useFinanceCoach((s) => s.contextData);

  const sidebar = useFinance((s) => s.sidebar);
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

  const heading = title || "Asesor Financiero";
  const monthBadge = contextData?.monthLabel ? contextData.monthLabel : null;
  const spentCents = contextData?.monthTotals?.spent_cents ?? (sidebar?.month?.gasto ?? 0);
  const spentBadge = spentCents > 0 ? `Gastos: ${formatMoney(spentCents)}` : null;

  if (historyOpen) {
    return (
      <aside
        className="relative flex flex-none flex-col border-l border-line bg-panel"
        style={{ width }}
        aria-label="Historial del Asesor Financiero"
      >
        <ConversationHistory
          title="Historial Financiero"
          ariaLabel="Historial de consultas financieras"
          items={history}
          currentId={conversationId}
          query={historyQuery}
          onQuery={setHistoryQuery}
          onOpen={(id) => void openConversation(id)}
          onRename={(id, t) => void renameConversation(id, t)}
          onDelete={(id) => void deleteConversation(id)}
          onNew={() => newConversation()}
          onClose={() => setHistory(false)}
          emptyText="Aún no hay consultas guardadas con el Asesor Financiero. Pregunta en el chat y aparecerán aquí."
        />
      </aside>
    );
  }

  return (
    <aside
      className="relative flex flex-none flex-col border-l border-line bg-panel"
      style={{ width }}
      aria-label="Asesor Financiero"
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
        <Wallet size={15} className="flex-none text-accent-text" />
        <div className="min-w-0 flex-1 truncate">
          <div className="flex items-center gap-1.5 truncate">
            <span className="truncate text-[12.5px] font-semibold text-text" title={heading}>
              {heading}
            </span>
            {(monthBadge || spentBadge) && (
              <span className="flex-none rounded bg-hover px-1.5 py-0.5 text-[10px] font-medium text-dim">
                {[monthBadge, spentBadge].filter(Boolean).join(" · ")}
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
                <PiggyBank size={20} />
              </div>
              <div>
                <h4 className="text-[13px] font-semibold text-text">Asesor Financiero</h4>
                <p className="mt-1 text-[11.5px] text-dim leading-relaxed">
                  Conozco tus ingresos, gastos del mes, presupuesto, ritmo de consumo y metas de ahorro.
                  ¿En qué puedo asesorarte hoy?
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
              onVote={(val) => useFinanceCoach.getState().vote(m.id, val)}
            />
          ))
        )}

        {busy && (
          <div className="flex items-center gap-2 rounded-lg bg-surface/50 p-2 text-[11px] text-dim">
            <Sparkles size={13} className="animate-pulse text-accent-text" />
            <span>El asesor financiero está analizando tus números…</span>
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
            placeholder="Preguntale al Asesor Financiero o pedile registrar un gasto…"
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
  m: FinanceCoachMessage;
  onVote: (val: 1 | -1) => void;
}) {
  const toast = useApp((s) => s.toast);
  const [copied, setCopied] = useState(false);
  const [openThinking, setOpenThinking] = useState(false);

  const { text, action } = useMemo(() => splitFinanceAction(m.content), [m.content]);
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

      {action && !m.error && <FinanceActionCard action={action} />}

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
