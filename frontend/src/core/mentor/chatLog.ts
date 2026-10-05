/**
 * Conversaciones del Mentor (opcionales y aditivas, ver docs/VAULT_FORMAT.md): un archivo por
 * conversación en `.notevault/mentor/chats/<id>.json` y `index.json` con la conversación activa.
 * Es un historial APARTE del del asistente (que vive en la carpeta de datos de la app).
 *
 * Los turnos de la IA que traen un borrador de meta llevan el borrador (para pintarlo) y, cuando se
 * confirma o se descarta, la marca correspondiente. El antiguo `chat.json` (una sola conversación) se
 * migra como primera conversación la primera vez; el archivo original no se toca.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as store from "../store.js";
import { formatLayout, LAYOUT } from "../vaultFormat.js";
import type { GoalDraft } from "./goalDraft.js";
import type { PlanDraft } from "./planDraft.js";

export const MAX_CHAT_TURNS = 60;
const MAX_CONTENT = 4000;
const MAX_TITLE = 60;
const ID_RE = /^[A-Za-z0-9_-]{1,48}$/;

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
  /** borrador del plan del mes (tipo `plan_draft`); no existe como plan hasta aceptarlo */
  planDraft?: PlanDraft;
  /** mes (AAAA-MM) del plan creado al aceptar este borrador */
  acceptedPlan?: string;
}

export interface ChatRecord {
  version: 1;
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  turns: ChatTurnRecord[];
}

/** Lo que lista el historial: sin los turnos. */
export interface ChatMeta {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  count: number;
  active: boolean;
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
  if (raw.role === "assistant" && raw.planDraft && typeof raw.planDraft === "object") turn.planDraft = raw.planDraft as PlanDraft;
  if (raw.acceptedPlan) turn.acceptedPlan = String(raw.acceptedPlan);
  if (raw.createdGoalId) turn.createdGoalId = String(raw.createdGoalId);
  if (raw.discarded) turn.discarded = true;
  return turn;
}

const cleanTurns = (list: unknown): ChatTurnRecord[] =>
  (Array.isArray(list) ? list : []).map(clean).filter((t: ChatTurnRecord | null): t is ChatTurnRecord => t !== null);

/** Título automático: el primer mensaje del estudiante, en una línea. */
export function titleFromMessage(message: string): string {
  const line = String(message || "").replace(/\s+/g, " ").trim();
  if (!line) return "Nueva conversación";
  return line.length > MAX_TITLE ? `${line.slice(0, MAX_TITLE - 1).trim()}…` : line;
}

const newChatId = (): string => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const nowIso = (): string => new Date().toISOString();
const two = (n: number): string => String(n).padStart(2, "0");
/** Marca local sin zona ("AAAA-MM-DDTHH:MM:SS"), como las del historial del asistente: agrupa por día local. */
export function localStamp(from: Date | string = new Date()): string {
  const d = typeof from === "string" ? new Date(from) : from;
  if (Number.isNaN(d.getTime())) return localStamp(new Date());
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}T${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
}

export class ChatLog {
  readonly file: string;

  constructor(
    vaultRoot: string,
    readonly id: string,
  ) {
    if (!ID_RE.test(id) || id === "index") throw new Error("Id de conversación inválido.");
    this.file = path.join(path.resolve(vaultRoot), formatLayout(LAYOUT.mentor_chat_file, { id }));
  }

  exists(): boolean {
    return fs.existsSync(this.file);
  }

  record(): ChatRecord {
    const raw = store.loadJson<any>(this.file);
    const turns = cleanTurns(raw?.turns);
    const first = turns.find((t) => t.role === "user");
    return {
      version: 1,
      id: this.id,
      title: String(raw?.title || "").trim() || (first ? titleFromMessage(first.content) : "Nueva conversación"),
      createdAt: String(raw?.createdAt || localStamp(turns[0]?.at ?? new Date())),
      updatedAt: String(raw?.updatedAt || localStamp(turns[turns.length - 1]?.at ?? new Date())),
      turns,
    };
  }

  load(): ChatTurnRecord[] {
    return this.record().turns;
  }

  private write(rec: ChatRecord): ChatRecord {
    const next: ChatRecord = { ...rec, turns: rec.turns.slice(-MAX_CHAT_TURNS), updatedAt: localStamp() };
    store.writeJson(this.file, next);
    return next;
  }

  /** Crea el archivo (vacío) si no existe. */
  ensure(): ChatRecord {
    return this.exists() ? this.record() : this.write({ version: 1, id: this.id, title: "", createdAt: localStamp(), updatedAt: localStamp(), turns: [] });
  }

  append(...added: Array<Omit<ChatTurnRecord, "id" | "at"> & { id?: string; at?: string }>): ChatTurnRecord[] {
    const rec = this.record();
    const hadUser = rec.turns.some((t) => t.role === "user");
    for (const a of added) {
      const t = clean({ ...a, id: a.id ?? `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`, at: a.at ?? nowIso() });
      if (!t) continue;
      rec.turns.push(t);
      // el título automático sale del primer mensaje del estudiante
      if (!hadUser && t.role === "user") rec.title = titleFromMessage(t.content);
    }
    return this.write(rec).turns;
  }

  /** Cambia un turno (marca de borrador creado o descartado); null si no existe. */
  patch(id: string, fields: Partial<Pick<ChatTurnRecord, "createdGoalId" | "discarded" | "acceptedPlan">>): ChatTurnRecord[] | null {
    const rec = this.record();
    const t = rec.turns.find((x) => x.id === id);
    if (!t) return null;
    if (fields.createdGoalId !== undefined) t.createdGoalId = fields.createdGoalId;
    if (fields.discarded !== undefined) t.discarded = fields.discarded;
    if (fields.acceptedPlan !== undefined) t.acceptedPlan = fields.acceptedPlan;
    return this.write(rec).turns;
  }

  rename(title: string): ChatRecord {
    const rec = this.record();
    const next = String(title || "").replace(/\s+/g, " ").trim().slice(0, 120);
    return this.write({ ...rec, title: next || rec.title });
  }
}

interface IndexRecord {
  version: 1;
  active: string | null;
  /** el `chat.json` antiguo ya se importó (no se vuelve a importar aunque se borren todas) */
  migrated: boolean;
}

/** El conjunto de conversaciones: lista, activa, nueva, abrir, renombrar y borrar. */
export class ChatStore {
  readonly root: string;
  readonly dir: string;
  readonly indexFile: string;
  readonly legacyFile: string;

  constructor(vaultRoot: string) {
    this.root = path.resolve(vaultRoot);
    this.dir = path.join(this.root, LAYOUT.mentor_chats_dir);
    this.indexFile = path.join(this.root, LAYOUT.mentor_chats_index);
    this.legacyFile = path.join(this.root, LAYOUT.mentor_chat);
  }

  private readIndex(): IndexRecord {
    const raw = store.loadJson<any>(this.indexFile);
    return { version: 1, active: typeof raw?.active === "string" && raw.active ? raw.active : null, migrated: Boolean(raw?.migrated) };
  }

  private writeIndex(idx: IndexRecord): void {
    store.writeJson(this.indexFile, idx);
  }

  private files(): string[] {
    try {
      return fs
        .readdirSync(this.dir)
        .filter((f) => f.endsWith(".json") && f !== "index.json")
        .map((f) => f.slice(0, -5))
        .filter((id) => ID_RE.test(id));
    } catch {
      return [];
    }
  }

  /** Importa el `chat.json` de una sola conversación la primera vez. No modifica el original. */
  private migrate(): void {
    const idx = this.readIndex();
    if (idx.migrated) return;
    const legacy = store.loadJson<any>(this.legacyFile);
    const turns = cleanTurns(legacy?.turns);
    if (!turns.length) return; // nada que importar: no se escribe nada
    if (!this.files().length) {
      const log = new ChatLog(this.root, newChatId());
      const first = turns.find((t) => t.role === "user");
      store.writeJson(log.file, {
        version: 1,
        id: log.id,
        title: first ? titleFromMessage(first.content) : "Conversación anterior",
        createdAt: localStamp(turns[0]!.at),
        updatedAt: localStamp(turns[turns.length - 1]!.at),
        turns,
      } satisfies ChatRecord);
      this.writeIndex({ version: 1, active: log.id, migrated: true });
      return;
    }
    this.writeIndex({ ...idx, migrated: true });
  }

  /** La conversación activa (o la más reciente) SIN crear ni escribir nada; null si no hay ninguna. */
  peek(): ChatLog | null {
    this.migrate();
    const current = this.get(this.readIndex().active ?? "");
    if (current) return current;
    const latest = this.list()[0];
    return latest ? new ChatLog(this.root, latest.id) : null;
  }

  /** Conversaciones con mensajes, la más reciente primero. */
  list(): ChatMeta[] {
    this.migrate();
    const active = this.readIndex().active;
    return this.files()
      .map((id) => new ChatLog(this.root, id).record())
      .filter((r) => r.turns.length > 0)
      .map((r) => ({ id: r.id, title: r.title, createdAt: r.createdAt, updatedAt: r.updatedAt, count: r.turns.length, active: r.id === active }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  get(id: string): ChatLog | null {
    if (!ID_RE.test(String(id ?? "")) || id === "index") return null;
    const log = new ChatLog(this.root, id);
    return log.exists() ? log : null;
  }

  /** La conversación activa; si no hay ninguna, crea una vacía. */
  active(): ChatLog {
    const found = this.peek();
    if (!found) return this.create();
    if (this.readIndex().active !== found.id) this.setActive(found.id);
    return found;
  }

  private setActive(id: string | null): void {
    this.writeIndex({ ...this.readIndex(), active: id });
  }

  /** Nueva conversación, que pasa a ser la activa. Si la activa ya está vacía se reutiliza. */
  create(): ChatLog {
    this.migrate();
    const current = this.get(this.readIndex().active ?? "");
    if (current && current.load().length === 0) return current;
    const log = new ChatLog(this.root, newChatId());
    log.ensure();
    this.setActive(log.id);
    return log;
  }

  open(id: string): ChatLog | null {
    this.migrate();
    const log = this.get(id);
    if (log) this.setActive(log.id);
    return log;
  }

  rename(id: string, title: string): ChatRecord | null {
    return this.get(id)?.rename(title) ?? null;
  }

  /** Borra una conversación (va a la papelera de la vault). Devuelve false si no existía. */
  remove(id: string): boolean {
    const log = this.get(id);
    if (!log) return false;
    store.toTrash(this.root, log.file, "mentor-chats");
    if (this.readIndex().active === id) this.setActive(null);
    return true;
  }
}

/** El borrador pendiente: el del último turno de la IA, si aún no se creó ni se descartó. */
export function pendingDraft(turns: readonly ChatTurnRecord[]): ChatTurnRecord | null {
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i]!;
    if (t.role !== "assistant") continue;
    return (t.draft || t.planDraft) && !t.createdGoalId && !t.acceptedPlan && !t.discarded ? t : null;
  }
  return null;
}
