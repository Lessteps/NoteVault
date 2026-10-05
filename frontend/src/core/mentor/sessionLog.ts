/**
 * Registro de sesiones del Mentor: lo que se planeó cada día y lo que se cumplió.
 *
 * Un archivo por día en `.notevault/mentor/sessions/<YYYY-MM-DD>.json` (opcional y
 * aditivo, ver docs/VAULT_FORMAT.md). De aquí salen la adherencia por materia/tipo y
 * "qué se salta" que el informe (brief.ts) le da a la IA.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as store from "../store.js";
import { formatLayout, isSyncConflict, LAYOUT } from "../vaultFormat.js";

export const BLOCK_STATUSES = ["planned", "done", "skipped", "partial"] as const;
export type BlockStatus = (typeof BLOCK_STATUSES)[number];

export interface PlanBlock {
  candidateId: string;
  kind: string;
  subject: string;
  topicFolder?: string;
  minutes: number;
  status: BlockStatus;
  note?: string;
}

export interface SessionRecord {
  /** YYYY-MM-DD */
  date: string;
  availableMinutes: number;
  objective?: string;
  blocks: PlanBlock[];
  createdAt: string;
  acceptedAt?: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function cleanBlock(raw: any): PlanBlock | null {
  if (!raw || typeof raw !== "object") return null;
  const candidateId = String(raw.candidateId ?? "").trim();
  if (!candidateId) return null;
  const status = (BLOCK_STATUSES as readonly string[]).includes(raw.status) ? (raw.status as BlockStatus) : "planned";
  const minutes = Math.max(0, Math.round(Number(raw.minutes) || 0));
  const block: PlanBlock = {
    candidateId,
    kind: String(raw.kind ?? ""),
    subject: String(raw.subject ?? ""),
    minutes,
    status,
  };
  if (raw.topicFolder) block.topicFolder = String(raw.topicFolder);
  if (raw.note) block.note = String(raw.note).slice(0, 500);
  return block;
}

/** Normaliza un registro leído de disco o recibido de la UI; null si no es utilizable. */
export function sanitizeSession(raw: any): SessionRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const date = String(raw.date ?? "");
  if (!DATE_RE.test(date)) return null;
  const blocks = (Array.isArray(raw.blocks) ? raw.blocks : [])
    .map(cleanBlock)
    .filter((b: PlanBlock | null): b is PlanBlock => b !== null);
  const rec: SessionRecord = {
    date,
    availableMinutes: Math.max(0, Math.round(Number(raw.availableMinutes) || 0)),
    blocks,
    createdAt: String(raw.createdAt || new Date().toISOString()),
  };
  if (raw.objective) rec.objective = String(raw.objective).slice(0, 500);
  if (raw.acceptedAt) rec.acceptedAt = String(raw.acceptedAt);
  return rec;
}

export class SessionLog {
  readonly vaultRoot: string;
  readonly dir: string;

  constructor(vaultRoot: string) {
    this.vaultRoot = path.resolve(vaultRoot);
    this.dir = path.join(this.vaultRoot, LAYOUT.mentor_sessions_dir);
  }

  private _path(date: string): string {
    return path.join(this.vaultRoot, formatLayout(LAYOUT.mentor_session, { date }));
  }

  save(record: SessionRecord): SessionRecord {
    const clean = sanitizeSession(record);
    if (!clean) throw new Error("Sesión inválida: falta la fecha (AAAA-MM-DD).");
    store.writeJson(this._path(clean.date), clean);
    return clean;
  }

  load(date: string): SessionRecord | null {
    if (!DATE_RE.test(date)) return null;
    return sanitizeSession(store.loadJson(this._path(date)));
  }

  /** Las `n` sesiones más recientes, la más nueva primero. */
  recent(n = 14): SessionRecord[] {
    if (!fs.existsSync(this.dir)) return [];
    const days = fs
      .readdirSync(this.dir)
      .filter((f) => !isSyncConflict(f) && /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .map((f) => f.slice(0, 10))
      .sort()
      .reverse()
      .slice(0, Math.max(0, n));
    const out: SessionRecord[] = [];
    for (const d of days) {
      const rec = this.load(d);
      if (rec) out.push(rec);
    }
    return out;
  }

  /** Cambia el estado de un bloque (por `candidateId`); null si no existe el día o el bloque. */
  markBlock(date: string, candidateId: string, status: BlockStatus, note?: string): SessionRecord | null {
    if (!(BLOCK_STATUSES as readonly string[]).includes(status)) throw new Error(`Estado inválido: ${status}`);
    const rec = this.load(date);
    if (!rec) return null;
    const block = rec.blocks.find((b) => b.candidateId === candidateId);
    if (!block) return null;
    block.status = status;
    if (note !== undefined) {
      if (note) block.note = note.slice(0, 500);
      else delete block.note;
    }
    store.writeJson(this._path(date), rec);
    return rec;
  }
}

// ── Adherencia ──────────────────────────────────────────────────────────

export interface AdherenceCounts {
  total: number;
  done: number;
  partial: number;
  skipped: number;
  /** bloques aún sin resolver: no cuentan ni a favor ni en contra */
  planned: number;
  /** 0..100: (hechos + mitad de parciales) / bloques resueltos; null sin resueltos */
  pct: number | null;
}

export interface Adherence {
  sessions: number;
  overall: AdherenceCounts;
  bySubject: Record<string, AdherenceCounts>;
  byKind: Record<string, AdherenceCounts>;
  /** materias que se salta: >= 2 bloques resueltos y la mitad o más sin hacer, la peor primero */
  skippedSubjects: string[];
  /** mediana de minutos realmente hechos por sesión (hechos + parciales); null sin datos */
  typicalSessionMinutes: number | null;
}

function emptyCounts(): AdherenceCounts {
  return { total: 0, done: 0, partial: 0, skipped: 0, planned: 0, pct: null };
}

function addBlock(c: AdherenceCounts, status: BlockStatus): void {
  c.total += 1;
  c[status] += 1;
}

function finish(c: AdherenceCounts): AdherenceCounts {
  const resolved = c.done + c.partial + c.skipped;
  c.pct = resolved ? Math.round(((c.done + 0.5 * c.partial) / resolved) * 100) : null;
  return c;
}

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : Math.round((s[mid - 1]! + s[mid]!) / 2);
}

export function adherence(records: readonly SessionRecord[]): Adherence {
  const overall = emptyCounts();
  const bySubject: Record<string, AdherenceCounts> = {};
  const byKind: Record<string, AdherenceCounts> = {};
  const doneMinutes: number[] = [];

  for (const rec of records) {
    let minutes = 0;
    for (const b of rec.blocks) {
      const subject = b.subject.trim().toLowerCase() || "(sin materia)";
      addBlock(overall, b.status);
      addBlock((bySubject[subject] ??= emptyCounts()), b.status);
      addBlock((byKind[b.kind || "(otro)"] ??= emptyCounts()), b.status);
      if (b.status === "done") minutes += b.minutes;
      else if (b.status === "partial") minutes += Math.round(b.minutes / 2);
    }
    if (minutes > 0) doneMinutes.push(minutes);
  }

  finish(overall);
  for (const c of Object.values(bySubject)) finish(c);
  for (const c of Object.values(byKind)) finish(c);

  const skippedSubjects = Object.entries(bySubject)
    .filter(([, c]) => c.done + c.partial + c.skipped >= 2 && c.pct !== null && c.pct <= 50)
    .sort((a, b) => a[1].pct! - b[1].pct! || a[0].localeCompare(b[0]))
    .map(([s]) => s);

  return {
    sessions: records.length,
    overall,
    bySubject,
    byKind,
    skippedSubjects,
    typicalSessionMinutes: median(doneMinutes),
  };
}
