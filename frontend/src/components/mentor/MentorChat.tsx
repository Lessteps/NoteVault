// Mentor — Conversación: el estudiante cuenta su objetivo ("backend en Python en 3 meses"), el Mentor
// pregunta lo que falte y propone una meta con calendario. El borrador se ve y se confirma en Metas.
// La IA solo ve el informe y el catálogo de temas; nunca escribe: crear la meta es un botón.

import { Bot, CircleAlert, Loader2, Send, Target } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useMentor } from "../../store/mentor";
import { GhostButton, input, PrimaryButton } from "../common/forms";
import { cn } from "../ui";
import { PanelPage } from "./parts";

const EXAMPLE = "Ej.: tengo que estudiar backend enfocado en Python y tengo 3 meses";

export function MentorChat({ onOpenGoals }: { onOpenGoals: () => void }) {
  const turns = useMentor((s) => s.turns);
  const pending = useMentor((s) => s.pending);
  const sending = useMentor((s) => s.sending);
  const notice = useMentor((s) => s.notice);
  const chatLoaded = useMentor((s) => s.chatLoaded);
  const loadChat = useMentor((s) => s.loadChat);
  const send = useMentor((s) => s.send);
  const newConversation = useMentor((s) => s.newConversation);
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chatLoaded) void loadChat();
  }, [chatLoaded, loadChat]);
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [turns.length, sending]);

  const submit = () => {
    const t = text.trim();
    if (!t || sending) return;
    setText("");
    void send(t);
  };

  return (
    <PanelPage title="Mentor — Conversación" subtitle="Cuéntame qué quieres lograr: preguntaré lo que falte y armaremos una meta con calendario.">
      <div className="space-y-3 rounded-xl border border-line bg-card p-4">
        <div className="space-y-3" aria-live="polite" aria-label="Conversación con el Mentor">
          {turns.length === 0 && (
            <p className="text-[12.5px] text-faint">
              <Bot size={14} className="mr-1 inline text-accent-text" />
              Dime tu objetivo y el tiempo que tienes. Solo veo tu informe y un catálogo de tus temas; nunca el contenido de tus notas, y no creo nada hasta que lo confirmes.
            </p>
          )}
          {turns.map((t) => (
            <div key={t.id} className={cn("flex", t.role === "user" ? "justify-end" : "justify-start")} data-testid={`turn-${t.role}`}>
              <div className={cn("max-w-[85%] rounded-xl px-3 py-2 text-[13px]", t.role === "user" ? "bg-accent-soft text-text" : "border border-line bg-surface text-text")}>
                <p className="whitespace-pre-line">{t.content}</p>
                {t.draft && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-line pt-2 text-[12px] text-dim">
                    <Target size={13} className="text-accent-text" />
                    <span>Borrador «{t.draft.name}»: {t.draft.schedule.items.length} submetas, hasta {t.draft.schedule.end}.</span>
                    {t.createdGoalId ? (
                      <span className="text-mint">Creada</span>
                    ) : t.discarded ? (
                      <span className="text-faint">Descartado</span>
                    ) : t.id === pending ? (
                      <GhostButton onClick={onOpenGoals}>Ver en Metas</GhostButton>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          ))}
          {sending && (
            <div role="status" className="flex items-center gap-2 text-[12.5px] text-faint">
              <Loader2 size={14} className="animate-spin" /> El Mentor está pensando…
            </div>
          )}
          <div ref={endRef} />
        </div>

        {notice && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-[12.5px] text-dim" data-testid="chat-notice">
            <CircleAlert size={14} className="mt-0.5 flex-none text-warn" />
            <span>
              {notice.kind === "no_ai" ? "Sin IA disponible no puedo proponerte una meta. " : ""}
              {notice.text}
              {notice.kind === "no_ai" ? " Configúrala en los ajustes del asistente." : ""}
            </span>
          </div>
        )}

        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            aria-label="Mensaje para el Mentor"
            placeholder={EXAMPLE}
            rows={2}
            maxLength={1500}
            className={cn(input, "min-w-0 flex-1 resize-none")}
          />
          <PrimaryButton type="submit" disabled={sending || !text.trim()}>
            <Send size={14} /> Enviar
          </PrimaryButton>
        </form>
        {turns.length > 0 && (
          <div className="flex justify-end">
            <GhostButton onClick={() => void newConversation()}>Nueva conversación</GhostButton>
          </div>
        )}
      </div>
    </PanelPage>
  );
}
