/**
 * Almacén de los registros de sesión del Mentor (ver `lib/sessionRecords.ts` y docs/MENTOR_SESSION_RECORDS_PLAN.md).
 *
 * Datos de la app, nunca notas:
 *   .notevault/mentor/records/<plan>/<AAAA-MM-DD>/<id>.json   una sesión
 *   .notevault/mentor/records/<plan>/_weeks/<AAAA-Www>.json   agregado semanal (lo que sobrevive a los 90 días)
 *   .notevault/mentor/records/<plan>/_proposals.json          propuestas del Mentor y su estado
 *
 * Las notas legibles (`<Materia>/_registro/…`) las escribe la API: son derivadas de estos archivos.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { parseSessionRecord, type Proposal, type SessionRecord, type WeekAggregate } from "../../lib/sessionRecords.js";
import * as store from "../store.js";

export interface ProposalsFile {
  version: 1;
  /** última vez que se pidió la revisión (ISO) */
  lastReviewAt: string;
  source: "rules" | "ai";
  proposals: Proposal[];
}

const SAFE = /^[A-Za-z0-9._-]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class SessionRecordStore {
  readonly dir: string;

  constructor(readonly root: string, readonly planId: string) {
    if (!SAFE.test(planId)) throw new Error("Plan inválido.");
    this.dir = path.join(root, ".notevault", "mentor", "records", planId);
  }

  private fileOf(r: Pick<SessionRecord, "date" | "id">): string {
    if (!DATE_RE.test(r.date) || !SAFE.test(r.id)) throw new Error("Registro inválido.");
    return path.join(this.dir, r.date, `${r.id}.json`);
  }

  has(id: string, date: string): boolean {
    return DATE_RE.test(date) && SAFE.test(id) && fs.existsSync(path.join(this.dir, date, `${id}.json`));
  }

  save(r: SessionRecord): void {
    store.writeJson(this.fileOf(r), r);
  }

  load(id: string, date: string): SessionRecord | null {
    if (!DATE_RE.test(date) || !SAFE.test(id)) return null;
    return parseSessionRecord(store.loadJson(path.join(this.dir, date, `${id}.json`), null));
  }

  /** Todas las sesiones, la más reciente primero. */
  list(): SessionRecord[] {
    const out: SessionRecord[] = [];
    let days: string[] = [];
    try {
      days = fs.readdirSync(this.dir).filter((d) => DATE_RE.test(d));
    } catch {
      return out;
    }
    for (const d of days) {
      let files: string[] = [];
      try {
        files = fs.readdirSync(path.join(this.dir, d)).filter((f) => f.endsWith(".json"));
      } catch {
        continue;
      }
      for (const f of files) {
        const r = parseSessionRecord(store.loadJson(path.join(this.dir, d, f), null));
        if (r && r.planId === this.planId) out.push(r);
      }
    }
    return out.sort((a, b) => b.startedAt.localeCompare(a.startedAt) || b.id.localeCompare(a.id));
  }

  remove(r: Pick<SessionRecord, "date" | "id">): void {
    try {
      fs.rmSync(this.fileOf(r), { force: true });
      const day = path.dirname(this.fileOf(r));
      if (fs.existsSync(day) && !fs.readdirSync(day).length) fs.rmdirSync(day);
    } catch {
      /* ya no estaba */
    }
  }

  saveWeek(a: WeekAggregate): void {
    if (!/^\d{4}-W\d{2}$/.test(a.week)) return;
    store.writeJson(path.join(this.dir, "_weeks", `${a.week}.json`), a);
  }

  weeks(): WeekAggregate[] {
    let files: string[] = [];
    try {
      files = fs.readdirSync(path.join(this.dir, "_weeks")).filter((f) => f.endsWith(".json"));
    } catch {
      return [];
    }
    const out: WeekAggregate[] = [];
    for (const f of files) {
      const w = store.loadJson<WeekAggregate | null>(path.join(this.dir, "_weeks", f), null);
      if (w && typeof w.week === "string" && Array.isArray(w.byArea)) out.push(w);
    }
    return out.sort((a, b) => b.week.localeCompare(a.week));
  }

  proposals(): ProposalsFile {
    const raw = store.loadJson<ProposalsFile | null>(path.join(this.dir, "_proposals.json"), null);
    return raw && raw.version === 1 && Array.isArray(raw.proposals)
      ? { version: 1, lastReviewAt: String(raw.lastReviewAt ?? ""), source: raw.source === "ai" ? "ai" : "rules", proposals: raw.proposals }
      : { version: 1, lastReviewAt: "", source: "rules", proposals: [] };
  }

  saveProposals(p: ProposalsFile): void {
    store.writeJson(path.join(this.dir, "_proposals.json"), p);
  }
}
