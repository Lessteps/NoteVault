/**
 * Private chat history. Conversations live in the app's own data folder
 * (`~/.notevault/conversations/`), NEVER in the vault: the vault is synced
 * between devices with Syncthing, and what the user asks their tutor is not
 * something that should ride along to the phone.
 *
 * Layout:
 *   <dir>/index.json         {version, items: ConversationMeta[]}
 *   <dir>/<id>.json          one conversation: meta + every message
 *
 * Writes go through store.writeJson (temp file + rename), so a crash never
 * leaves a half-written conversation.
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { nowLocalIso } from "./dates.js";
import { loadJson, writeJson } from "./store.js";

export const INDEX_FILE = "index.json";
export const INDEX_VERSION = 1;
/** 'c20260928032211-a1b2c3' — the day, the time and 6 random hex digits. */
const ID_RE = /^c\d{14}-[0-9a-f]{6}$/;
export const MAX_MESSAGES = 400;
export const MAX_CONTENT = 60_000;
export const MAX_THINKING = 8_000;
export const MAX_TITLE = 80;

export interface StoredContext {
  path: string;
  start_line?: number;
  end_line?: number;
  text: string;
  folder?: boolean;
  file?: boolean;
}

export interface StoredMessage {
  role: "user" | "assistant" | "system";
  content: string;
  /** Model reasoning, kept because it explains the answer. */
  thinking?: string;
  /** Epoch ms, so the panel can sort and show times. */
  at: number;
  ms?: number;
  stopped?: boolean;
  error?: boolean;
  contexts?: StoredContext[];
  vote?: 0 | 1 | -1;
}

export interface ConversationMeta {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  /** Number of messages, so the history list needs no file read. */
  count: number;
  model: string;
}

export interface Conversation extends ConversationMeta {
  messages: StoredMessage[];
}

export function newConversationId(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `c${stamp}-${crypto.randomBytes(3).toString("hex")}`;
}

export function isConversationId(id: unknown): boolean {
  return typeof id === "string" && ID_RE.test(id);
}

/** Trim a title to one clean line; the model is asked, so it answers freely. */
export function sanitizeTitle(raw: unknown): string {
  const cleaned = String(raw ?? "")
    .replace(/[\r\n]+/g, " ")
    .replace(/^[#*\s"'«»`]+/, "")
    .replace(/[#*\s"'«»`]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length <= MAX_TITLE) return cleaned;
  return cleaned.slice(0, MAX_TITLE).trim();
}

export function cleanMessages(input: unknown): StoredMessage[] {
  if (!Array.isArray(input)) return [];
  const out: StoredMessage[] = [];
  for (const raw of input.slice(-MAX_MESSAGES)) {
    if (!raw || typeof raw !== "object") continue;
    const m = raw as Record<string, unknown>;
    const role = m.role;
    if (role !== "user" && role !== "assistant" && role !== "system") continue;
    const msg: StoredMessage = {
      role,
      content: String(m.content ?? "").slice(0, MAX_CONTENT),
      at: Number.isFinite(Number(m.at)) ? Number(m.at) : Date.now(),
    };
    if (typeof m.thinking === "string" && m.thinking) {
      msg.thinking = m.thinking.slice(0, MAX_THINKING);
    }
    if (Number.isFinite(Number(m.ms))) msg.ms = Number(m.ms);
    if (m.stopped === true) msg.stopped = true;
    if (m.error === true) msg.error = true;
    if (m.vote === 1 || m.vote === -1) msg.vote = m.vote;
    if (Array.isArray(m.contexts)) {
      const contexts: StoredContext[] = [];
      for (const c of m.contexts) {
        if (!c || typeof c !== "object") continue;
        const ctx = c as Record<string, unknown>;
        contexts.push({
          path: String(ctx.path ?? "").slice(0, 400),
          start_line: Number.isFinite(Number(ctx.start_line)) ? Number(ctx.start_line) : undefined,
          end_line: Number.isFinite(Number(ctx.end_line)) ? Number(ctx.end_line) : undefined,
          text: String(ctx.text ?? "").slice(0, MAX_CONTENT),
          ...(ctx.folder === true ? { folder: true } : {}),
          ...(ctx.file === true ? { file: true } : {}),
        });
      }
      if (contexts.length) msg.contexts = contexts;
    }
    out.push(msg);
  }
  return out;
}

export class ConversationStore {
  dir: string;

  constructor(dir: string) {
    this.dir = path.resolve(dir);
  }

  private file(id: string): string {
    return path.join(this.dir, `${id}.json`);
  }

  private indexPath(): string {
    return path.join(this.dir, INDEX_FILE);
  }

  /** The history list, newest first. Falls back to scanning the folder when the
   * index is missing (or was deleted by hand), and drops entries whose file is
   * gone so the list never shows a ghost. */
  list(): ConversationMeta[] {
    const index = loadJson<{ version?: number; items?: unknown }>(this.indexPath(), null);
    let items: ConversationMeta[] = [];
    if (index && Array.isArray(index.items)) {
      items = index.items.map((i) => this.normalizeMeta(i)).filter((i): i is ConversationMeta => i !== null);
    }
    if (!items.length) {
      items = this.scan();
      if (items.length) this.writeIndex(items);
    }
    return items
      .filter((i) => fs.existsSync(this.file(i.id)))
      .sort((a, b) => (a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : 0));
  }

  get(id: string): Conversation | null {
    if (!isConversationId(id)) return null;
    return this.readFile(id);
  }

  /** Create (id null) or overwrite a conversation; returns what was stored. */
  save(
    id: string | null,
    data: { messages: unknown; model?: unknown; title?: unknown },
  ): Conversation {
    const now = nowLocalIso();
    const existing = id && isConversationId(id) ? this.readFile(id) : null;
    const messages = cleanMessages(data.messages);
    const conv: Conversation = {
      id: existing?.id ?? newConversationId(),
      title:
        sanitizeTitle(data.title) ||
        existing?.title ||
        sanitizeTitle(firstUserText(messages)) ||
        "Nueva conversación",
      created_at: existing?.created_at ?? now,
      updated_at: now,
      count: messages.length,
      model: String(data.model ?? existing?.model ?? "").slice(0, 120),
      messages,
    };
    writeJson(this.file(conv.id), conv);
    this.upsertIndex(conv);
    return conv;
  }

  rename(id: string, title: string): Conversation | null {
    const conv = this.get(id);
    if (!conv) return null;
    const clean = sanitizeTitle(title);
    if (!clean || clean === conv.title) return conv;
    conv.title = clean;
    conv.updated_at = nowLocalIso();
    writeJson(this.file(conv.id), conv);
    this.upsertIndex(conv);
    return conv;
  }

  remove(id: string): boolean {
    if (!isConversationId(id)) return false;
    const file = this.file(id);
    let existed = false;
    try {
      if (fs.existsSync(file)) {
        fs.rmSync(file);
        existed = true;
      }
    } catch {
      return false;
    }
    const items = this.list().filter((i) => i.id !== id);
    this.writeIndex(items);
    return existed;
  }

  // ── internals ───────────────────────────────────────────────────────────

  private readFile(id: string): Conversation | null {
    const data = loadJson<Record<string, unknown>>(this.file(id), null);
    if (!data || typeof data !== "object") return null;
    const meta = this.normalizeMeta(data);
    if (!meta) return null;
    const messages = cleanMessages(data.messages);
    return { ...meta, count: messages.length, messages };
  }

  private normalizeMeta(raw: unknown): ConversationMeta | null {
    if (!raw || typeof raw !== "object") return null;
    const m = raw as Record<string, unknown>;
    const id = String(m.id ?? "");
    if (!isConversationId(id)) return null;
    return {
      id,
      title: sanitizeTitle(m.title) || "Nueva conversación",
      created_at: String(m.created_at ?? "").slice(0, 19) || nowLocalIso(),
      updated_at: String(m.updated_at ?? "").slice(0, 19) || nowLocalIso(),
      count: Number.isFinite(Number(m.count)) ? Number(m.count) : 0,
      model: String(m.model ?? "").slice(0, 120),
    };
  }

  private scan(): ConversationMeta[] {
    let files: string[];
    try {
      files = fs.readdirSync(this.dir);
    } catch {
      return [];
    }
    const out: ConversationMeta[] = [];
    for (const name of files) {
      if (!name.endsWith(".json") || name === INDEX_FILE) continue;
      const id = path.basename(name, ".json");
      if (!isConversationId(id)) continue;
      const conv = this.readFile(id);
      if (conv) out.push(stripMessages(conv));
    }
    return out;
  }

  private upsertIndex(conv: Conversation): void {
    const items = this.list().filter((i) => i.id !== conv.id);
    items.unshift(stripMessages(conv));
    this.writeIndex(items);
  }

  private writeIndex(items: ConversationMeta[]): void {
    writeJson(this.indexPath(), { version: INDEX_VERSION, items });
  }
}

function stripMessages(conv: Conversation): ConversationMeta {
  const { messages: _messages, ...meta } = conv;
  void _messages;
  return meta;
}

function firstUserText(messages: StoredMessage[]): string {
  const first = messages.find((m) => m.role === "user" && m.content.trim());
  return first ? first.content.trim().replace(/\s+/g, " ") : "";
}
