/**
 * Conversación del Mentor: un solo archivo `.notevault/mentor/chat.json` (opcional y aditivo, ver
 * docs/VAULT_FORMAT.md). Guarda los turnos; los de la IA que traen un borrador de meta llevan el
 * borrador (para pintarlo) y, cuando se confirma o se descarta, la marca correspondiente.
 */

import * as path from "node:path";
import * as store from "../store.js";
import { LAYOUT } from "../vaultFormat.js";
import type { GoalDraft } from "./goalDraft.js";

export const MAX_CHAT_TURNS = 60;
const MAX_CONTENT = 4000;

export interface ChatTurnRecord {
  id: string;
  role: "user" | "assistant";
  /** texto visible; en un borrador, el resumen del Mentor */
  content: string;
  at: string;
  draft?: GoalDraft;
  /** id de la meta creada a partir de este borrador */
  createdGoalId?: string;
  discarded?: boolean;
}

export interface ChatRecord {
  version: 1;
  turns: ChatTurnRecord[];
}

function clean(raw: any): ChatTurnRecord | null {
  if (!raw || typeof raw !== "object") return null;
  if (raw.role !== "user" && raw.role !== "assistant") return null;
  const id = String(raw.id ?? "").trim();
  if (!id) return null;
  const turn: ChatTurnRecord = {
    id,
    role: raw.role,
    content: String(raw.content ?? "").slice(0, MAX_CONTENT),
    at: String(raw.at || new Date().toISOString()),
  };
  if (raw.role === "assistant" && raw.draft && typeof raw.draft === "object") turn.draft = raw.draft as GoalDraft;
  if (raw.createdGoalId) turn.createdGoalId = String(raw.createdGoalId);
  if (raw.discarded) turn.discarded = true;
  return turn;
}

export class ChatLog {
  readonly file: string;

  constructor(vaultRoot: string) {
    this.file = path.join(path.resolve(vaultRoot), LAYOUT.mentor_chat);
  }

  load(): ChatTurnRecord[] {
    const raw = store.loadJson<any>(this.file);
    const list = Array.isArray(raw?.turns) ? raw.turns : [];
    return list.map(clean).filter((t: ChatTurnRecord | null): t is ChatTurnRecord => t !== null);
  }

  private write(turns: ChatTurnRecord[]): ChatTurnRecord[] {
    const kept = turns.slice(-MAX_CHAT_TURNS);
    store.writeJson(this.file, { version: 1, turns: kept } satisfies ChatRecord);
    return kept;
  }

  append(...added: Array<Omit<ChatTurnRecord, "id" | "at"> & { id?: string; at?: string }>): ChatTurnRecord[] {
    const turns = this.load();
    for (const a of added) {
      const t = clean({ ...a, id: a.id ?? `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`, at: a.at ?? new Date().toISOString() });
      if (t) turns.push(t);
    }
    return this.write(turns);
  }

  /** Cambia un turno (marca de borrador creado o descartado); null si no existe. */
  patch(id: string, fields: Partial<Pick<ChatTurnRecord, "createdGoalId" | "discarded">>): ChatTurnRecord[] | null {
    const turns = this.load();
    const t = turns.find((x) => x.id === id);
    if (!t) return null;
    if (fields.createdGoalId !== undefined) t.createdGoalId = fields.createdGoalId;
    if (fields.discarded !== undefined) t.discarded = fields.discarded;
    return this.write(turns);
  }

  clear(): void {
    this.write([]);
  }
}

/** El borrador pendiente: el del último turno de la IA, si aún no se creó ni se descartó. */
export function pendingDraft(turns: readonly ChatTurnRecord[]): ChatTurnRecord | null {
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i]!;
    if (t.role !== "assistant") continue;
    return t.draft && !t.createdGoalId && !t.discarded ? t : null;
  }
  return null;
}
