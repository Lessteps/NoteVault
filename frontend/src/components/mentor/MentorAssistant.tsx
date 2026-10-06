// El panel del asistente cuando el estudiante está en la pestaña Mentor.
//
// La conversación con el Mentor NO es un panel del módulo: ocurre aquí, en la columna derecha de
// siempre. Con la pestaña Mentor activa, `AssistantPanel` pinta esto en lugar del chat normal (que no
// se toca ni se mezcla: al salir de la pestaña vuelve tal cual estaba). El Mentor pregunta lo que falte
// y propone un borrador de meta con calendario; la IA solo ve el informe y un catálogo de temas, y
// nunca escribe: crear la meta es un botón ("Crear meta").

import { ArrowUp, Bot, CalendarRange, Check, CircleAlert, History, Loader2, MoreHorizontal, Pencil, Plus, Target, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { periodLabel } from "../../lib/planTime";
import type { MentorChatTurn } from "../../lib/types";
import { useAssistant } from "../../store/assistant";
import { useMentor } from "../../store/mentor";
import { useNavState } from "../../store/navState";
import { ConversationHistory } from "../notes/ConversationHistory";
import { askText, cn, IconButton, openMenu } from "../ui";

const WIDTH_KEY = "nv.assistant.width";
const MIN_WIDTH = 320;
const MAX_WIDTH = 720;
export const MENTOR_PLACEHOLDER = "Cuéntale al Mentor qué quieres lograr…";
const EXAMPLE = "Ej.: tengo que estudiar backend enfocado en Python y tengo 3 meses.";

/** Lleva al panel Metas del Mentor, donde el borrador se ve completo. */
export function showDraftInMetas(): void {
  useNavState.getState().set("mentor.view", "metas");
}

/** Lleva al panel Plan del Mentor, donde el borrador del plan se ve completo. */
export function showPlanDraftInPlan(): void {
  useNavState.getState().set("mentor.view", "plan");
}

/** Borrador del plan del mes en el chat: resumen compacto con Ver en Plan / Aceptar plan / Descartar. */
export function PlanDraftChatCard({ turn, current }: { turn: MentorChatTurn; current: boolean }) {
  const accepting = useMentor((s) => s.acceptingPlan);
  const acceptPlan = useMentor((s) => s.acceptPlan);
  const discard = useMentor((s) => s.discard);
  const draft = turn.planDraft;
  if (!draft) return null;
  const topics = draft.subplans.reduce((n, s) => n + s.topics.length, 0);
  const open = current && !turn.acceptedPlan && !turn.discarded;
  return (
    <div className="mt-2 rounded-lg border border-line bg-surface p-2.5" data-testid="chat-plan-draft">
      <div className="flex items-start gap-2">
        <CalendarRange size={14} className="mt-0.5 flex-none text-accent-text" />
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] font-semibold leading-snug text-text">{draft.preconditions && draft.start && draft.end ? `Plan del ${periodLabel(draft.start, draft.end)}` : `Plan de ${draft.month}`}{draft.auto ? " · automático" : ""}</div>
          <div className="text-[11px] text-faint">
            {draft.subplans.length} subplanes · {topics} temas · {draft.hoursPerWeek} h/semana
          </div>
          <div className="mt-0.5 text-[11px] text-dim">{draft.subplans.map((s) => s.area).filter((a, i, l) => l.indexOf(a) === i).join(" · ")}</div>
          {(draft.programmingPractice || draft.openQuestions?.length) && (
            <div className="mt-0.5 text-[11px] text-dim" data-testid="chat-plan-draft-extras">
              {[draft.programmingPractice ? "Programming practice incluida" : "", draft.openQuestions?.length ? `${draft.openQuestions.length} ${draft.openQuestions.length === 1 ? "entregable por decidir" : "entregables por decidir"} (en Plan)` : ""].filter(Boolean).join(" · ")}
            </div>
          )}
        </div>
        {turn.acceptedPlan ? (
          <span className="flex-none text-[11px] text-mint">Aceptado</span>
        ) : turn.discarded ? (
          <span className="flex-none text-[11px] text-faint">Descartado</span>
        ) : null}
      </div>
      {open && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={showPlanDraftInPlan} className="rounded-md border border-line px-2 py-1 text-[11.5px] text-dim hover:bg-hover hover:text-text">
            Ver en Plan
          </button>
          <button
            type="button"
            onClick={() => void acceptPlan()}
            disabled={accepting}
            className="inline-flex items-center gap-1 rounded-md bg-accent px-2 py-1 text-[11.5px] font-medium text-white hover:bg-accent-strong disabled:opacity-60"
          >
            <Check size={12} /> Aceptar plan
          </button>
          <button type="button" onClick={() => void discard()} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] text-danger hover:bg-danger-soft">
            <Trash2 size={11} /> Descartar
          </button>
        </div>
      )}
      {turn.acceptedPlan && (
        <button type="button" onClick={showPlanDraftInPlan} className="mt-1.5 text-[11.5px] text-accent-text hover:underline">
          Ver en Plan
        </button>
      )}
    </div>
  );
}

/** Borrador de meta en el chat: resumen compacto con las mismas acciones que el panel Metas. */
export function DraftChatCard({ turn, current }: { turn: MentorChatTurn; current: boolean }) {
  const creating = useMentor((s) => s.creating);
  const createGoal = useMentor((s) => s.createGoal);
  const discard = useMentor((s) => s.discard);
  const draft = turn.draft;
  if (!draft) return null;
  const s = draft.schedule;
  return (
    <div className="mt-2 rounded-lg border border-line bg-surface p-2.5" data-testid="chat-draft">
      <div className="flex items-start gap-2">
        <Target size={14} className="mt-0.5 flex-none text-accent-text" />
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] font-semibold leading-snug text-text">{draft.name}</div>
          <div className="text-[11px] text-faint">
            {s.items.length} submetas · {s.weeks} semanas · {s.hoursPerWeek} h/semana · hasta {s.end}
          </div>
        </div>
        {turn.createdGoalId ? (
          <span className="flex-none text-[11px] text-mint">Creada</span>
        ) : turn.discarded ? (
          <span className="flex-none text-[11px] text-faint">Descartado</span>
        ) : null}
      </div>
      {current && !turn.createdGoalId && !turn.discarded && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => void createGoal()}
            disabled={creating}
            className="inline-flex items-center gap-1 rounded-md bg-accent px-2 py-1 text-[11.5px] font-medium text-white hover:bg-accent-strong disabled:opacity-60"
          >
            <Check size={12} /> Crear meta
          </button>
          <button type="button" onClick={showDraftInMetas} className="rounded-md border border-line px-2 py-1 text-[11.5px] text-dim hover:bg-hover hover:text-text">
            Ver en Metas
          </button>
          <button
            type="button"
            onClick={() => void discard()}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] text-danger hover:bg-danger-soft"
          >
            <Trash2 size={11} /> Descartar
          </button>
        </div>
      )}
      {turn.createdGoalId && (
        <button type="button" onClick={showDraftInMetas} className="mt-1.5 text-[11.5px] text-accent-text hover:underline">
          Ver en Metas
        </button>
      )}
    </div>
  );
}

function MentorMessage({ turn, current }: { turn: MentorChatTurn; current: boolean }) {
  if (turn.role === "user") {
    return (
      <div className="flex justify-end" data-testid="turn-user">
        <div className="max-w-[95%] whitespace-pre-wrap rounded-xl bg-elevated px-3 py-2 text-[12.5px] text-text">{turn.content}</div>
      </div>
    );
  }
  return (
    <div data-testid="turn-assistant">
      <p className="whitespace-pre-line text-[12.5px] leading-relaxed text-text">{turn.content}</p>
      <DraftChatCard turn={turn} current={current} />
      <PlanDraftChatCard turn={turn} current={current} />
    </div>
  );
}

function MentorComposer() {
  const sending = useMentor((s) => s.sending);
  const send = useMentor((s) => s.send);
  const focusSeq = useMentor((s) => s.focusSeq);
  const [text, setText] = useState("");
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!focusSeq) return;
    // una conversación de plan arranca con un texto de partida que el estudiante completa
    const seed = useMentor.getState().composerSeed;
    if (seed) setText(seed);
    area.current?.focus();
  }, [focusSeq]);

  const submit = () => {
    const t = text.trim();
    if (!t || sending) return;
    setText("");
    void send(t);
  };

  return (
    <div className="flex-none p-2.5">
      <div className="rounded-xl border border-line bg-elevated px-2.5 py-2 focus-within:border-accent">
        <textarea
          ref={area}
          rows={2}
          value={text}
          maxLength={1500}
          onChange={(e) => setText(e.target.value)}
          aria-label="Mensaje para el Mentor"
          placeholder={MENTOR_PLACEHOLDER}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          className="max-h-40 w-full resize-none bg-transparent text-[12.5px] leading-relaxed text-text outline-none placeholder:text-faint"
        />
        <div className="mt-1 flex items-center">
          <span className="flex-1 text-[10.5px] text-faint">Enter envía · Mayús+Enter salta de línea</span>
          <button
            type="button"
            onClick={submit}
            disabled={sending || !text.trim()}
            title="Enviar (Enter)"
            aria-label="Enviar al Mentor"
            className="grid h-7 w-7 place-items-center rounded-full bg-accent text-white hover:bg-accent-strong disabled:bg-elevated disabled:text-faint"
          >
            <ArrowUp size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

export function MentorAssistant() {
  const turns = useMentor((s) => s.turns);
  const pending = useMentor((s) => s.pending);
  const sending = useMentor((s) => s.sending);
  const notice = useMentor((s) => s.notice);
  const chatLoaded = useMentor((s) => s.chatLoaded);
  const loadChat = useMentor((s) => s.loadChat);
  const chatTitle = useMentor((s) => s.chatTitle);
  const chatId = useMentor((s) => s.chatId);
  const chats = useMentor((s) => s.chats);
  const historyOpen = useMentor((s) => s.historyOpen);
  const setHistory = useMentor((s) => s.setHistory);
  const newConversation = useMentor((s) => s.newConversation);
  const openChat = useMentor((s) => s.openChat);
  const renameChat = useMentor((s) => s.renameChat);
  const deleteChat = useMentor((s) => s.deleteChat);
  const setOpen = useAssistant((s) => s.setOpen);
  const [query, setQuery] = useState("");
  const [width, setWidth] = useState(() => {
    const stored = Number(localStorage.getItem(WIDTH_KEY));
    return stored >= MIN_WIDTH ? stored : 340;
  });
  const drag = useRef<{ x: number; w: number } | null>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chatLoaded) void loadChat();
  }, [chatLoaded, loadChat]);

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
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns.length, sending]);

  const rename = async () => {
    if (!chatId) return;
    const next = await askText("Renombrar conversación", chatTitle, "Guardar");
    if (next && next.trim()) await renameChat(chatId, next.trim());
  };

  return (
    <aside className="relative flex flex-none flex-col border-l border-line bg-panel" style={{ width }} aria-label="Asistente (Mentor)" data-context="mentor">
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
        <Target size={14} className="flex-none text-accent-text" />
        <span className="ml-1 flex-none rounded-md bg-accent-soft px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-accent-text" data-testid="mentor-badge">
          Mentor
        </span>
        <span className="min-w-0 flex-1 truncate pl-1 text-[12.5px] font-medium text-text" title={chatTitle}>
          {turns.length ? chatTitle : "Nueva conversación"}
        </span>
        <IconButton title="Nueva conversación" onClick={() => void newConversation()}>
          <Plus size={15} />
        </IconButton>
        <IconButton title="Historial" onClick={() => setHistory(true)}>
          <History size={15} />
        </IconButton>
        <IconButton
          title="Más"
          onClick={(e) =>
            openMenu(e, [
              { label: "Renombrar conversación…", icon: <Pencil size={13} />, disabled: !chatId || !turns.length, onSelect: () => void rename() },
              { separator: true },
              { label: "Nueva conversación", icon: <Plus size={13} />, onSelect: () => void newConversation() },
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
        <ConversationHistory
          title="Historial del Mentor"
          ariaLabel="Historial del Mentor"
          items={chats.map((c) => ({ id: c.id, title: c.title, updated_at: c.updatedAt, count: c.count }))}
          currentId={chatId}
          query={query}
          onQuery={setQuery}
          onOpen={openChat}
          onRename={renameChat}
          onDelete={deleteChat}
          onNew={() => void newConversation()}
          onClose={() => setHistory(false)}
          emptyText="Aún no hay conversaciones con el Mentor. Cuéntale qué quieres lograr y aparecerá aquí."
        />
      ) : (
        <>
          <div ref={list} className="min-h-0 flex-1 space-y-3.5 overflow-y-auto px-3 py-3" aria-live="polite" aria-label="Conversación con el Mentor">
            {!turns.length && (
              <div className="rounded-xl border border-dashed border-line-strong p-3 text-[12.5px] leading-relaxed text-dim">
                <Bot size={14} className="mr-1 inline text-accent-text" />
                Cuéntale al Mentor qué quieres lograr y cuánto tiempo tienes: preguntará lo que falte y armaréis una meta con calendario.
                <span className="mt-1.5 block text-faint">{EXAMPLE}</span>
                <span className="mt-1.5 block text-[11.5px] text-faint">
                  Solo ve tu informe y un catálogo de tus temas, nunca el contenido de tus notas, y no crea nada hasta que lo confirmes.
                </span>
              </div>
            )}
            {turns.map((t) => (
              <MentorMessage key={t.id} turn={t} current={t.id === pending} />
            ))}
            {sending && (
              <div role="status" className="flex items-center gap-2 text-[12px] text-faint">
                <Loader2 size={13} className="animate-spin" /> El Mentor está pensando…
              </div>
            )}
          </div>

          {notice && (
            <div
              role="alert"
              className={cn("mx-3 mb-1 flex flex-none items-start gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-[12px] text-dim")}
              data-testid="chat-notice"
            >
              <CircleAlert size={14} className="mt-0.5 flex-none text-warn" />
              <span>
                {notice.kind === "no_ai" ? "Sin IA disponible no puedo proponerte una meta. " : ""}
                {notice.text}
                {notice.kind === "no_ai" ? " Configúrala en los ajustes del asistente." : ""}
              </span>
            </div>
          )}

          <MentorComposer />
        </>
      )}
    </aside>
  );
}
