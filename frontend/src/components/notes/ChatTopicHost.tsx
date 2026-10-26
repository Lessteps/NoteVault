// Chat — «Generar tema completo»: el diálogo de confirmación con el selector de motor (la IA de la app / Claude / Antigravity-Claude Code) y,
// bajo los mensajes, las tareas para agentes externos creadas desde el chat (instrucción copiable, carpeta y «Ya terminó — validar»).

import { useChatTopic } from "../../store/chatTopic";
import { useRegenEngine } from "../../store/regenEngine";
import { GhostButton, Modal, PrimaryButton } from "../common/forms";
import { RegenEngineChoice } from "../mentor/RegenEngineChoice";
import { RegenHandoffPanel } from "../mentor/RegenHandoffPanel";

export function ChatTopicDialog() {
  const asking = useChatTopic((s) => s.asking);
  const answer = useChatTopic((s) => s.answer);
  const effective = useRegenEngine((s) => s.effective);
  if (!asking) return null;
  return (
    <Modal
      title={asking.title}
      onClose={() => answer(false)}
      width={560}
      footer={
        <>
          <span className="flex-1" />
          <GhostButton onClick={() => answer(false)} data-testid="chat-topic-cancel">Cancelar</GhostButton>
          <PrimaryButton onClick={() => answer(true)} data-testid="chat-topic-confirm">{effective === "handoff" ? "Crear tarea para el agente" : asking.label}</PrimaryButton>
        </>
      }
    >
      <div className="space-y-3 text-[14px]" data-testid="chat-topic-dialog">
        <p>{asking.message}</p>
        <RegenEngineChoice aiCalls={effective === "handoff" ? 1 : 2} />
      </div>
    </Modal>
  );
}

export function ChatHandoffs() {
  const ids = useChatTopic((s) => s.handoffIds);
  const hide = useChatTopic((s) => s.hideHandoff);
  const handoffs = useRegenEngine((s) => s.handoffs);
  const list = ids.map((id) => handoffs[id]).filter((h): h is NonNullable<typeof h> => !!h);
  if (list.length === 0) return null;
  return (
    <div className="space-y-2" data-testid="chat-handoffs">
      {list.map((h) => <RegenHandoffPanel key={h.id} handoff={h} onClose={() => hide(h.id)} />)}
    </div>
  );
}
