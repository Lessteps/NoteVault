// What the user already decided on the interactive cards of the chat (a proposed change,
// a question with options, the competency checklist). Kept per card CONTENT, so it survives
// reopening the conversation: an applied or dismissed card comes back marked and cannot be
// answered twice unless the assistant proposes something new.

const PREFIX = "nv.card.";
const memory = new Map<string, string>();

/** A short stable hash of the card's content. */
export function cardKey(payload: unknown): string {
  const text = JSON.stringify(payload) ?? "";
  let h = 5381;
  for (let i = 0; i < text.length; i += 1) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36) + text.length.toString(36);
}

export function getCardState(key: string): string | null {
  try {
    return window.localStorage.getItem(PREFIX + key) ?? memory.get(key) ?? null;
  } catch {
    return memory.get(key) ?? null;
  }
}

export function setCardState(key: string, value: string): void {
  memory.set(key, value);
  try {
    window.localStorage.setItem(PREFIX + key, value);
  } catch {
    /* the in-memory copy still holds it for this session */
  }
}
