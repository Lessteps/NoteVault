// Mentor — «Áreas»: el índice de SOLO LECTURA del avance por espacio de estudio, área y tema. Puro (sin node ni React): lo usan la API
// (`mentor_areas_overview`) para plegar los datos que ya calcula el panel de estudio (`study_topic_dashboard`) en filas compactas, y los tests.
// No depende de ningún plan: el avance sale del ledger de intentos, los manifiestos y los repasos de la vault.

/** Lo que se lee de cada tema del panel de estudio (`TopicDashboardItem`): estructural para no arrastrar `types.ts` al proyecto de Node. */
export interface TopicDashboardItem {
  folder: string;
  subject?: string;
  manifest?: { title?: string; subject?: string };
  progress?: {
    completenessPct?: number;
    isComplete?: boolean;
    exerciseNotesCount?: number;
    skills?: Record<string, { totalAttempts: number; totalPasses: number; cells?: Record<string, { passes: number; required?: number }> }>;
  };
}

export type AreasLevel = "spaces" | "areas" | "topics";
export type TopicState = "sin_tratar" | "en_curso" | "completo";

/** Lo que cada nivel suma de sus temas. */
export interface Totals {
  /** avance medio de los temas (0..100) */
  pct: number;
  topics: number;
  completed: number;
  started: number;
  exercisesDone: number;
  exercisesTotal: number;
  reviewsDue: number;
  /** última actividad (AAAA-MM-DD) o vacío */
  lastActivity: string;
}
export interface SpaceRow extends Totals {
  space: string;
  areas: number;
}
export interface AreaRow extends Totals {
  space: string;
  /** carpeta del área en la vault (clave estable) */
  area: string;
  name: string;
  state: TopicState;
}
export interface TopicRow {
  space: string;
  area: string;
  folder: string;
  title: string;
  code: string;
  pct: number;
  state: TopicState;
  exercisesDone: number;
  exercisesTotal: number;
  /** próximo repaso (AAAA-MM-DD) o vacío */
  nextReview: string;
  reviewDue: boolean;
  lastActivity: string;
}

export interface ReviewLite {
  topicPath: string;
  next: string;
  inDays: number;
}
export interface IndexInput {
  items: ReadonlyArray<TopicDashboardItem>;
  reviews: ReadonlyArray<ReviewLite>;
  /** última actividad por carpeta de tema */
  lastByFolder: ReadonlyMap<string, string>;
}

const norm = (p: string): string => String(p ?? "").replace(/[\\]/g, "/").replace(/^\/+|\/+$/g, "");
const dirOf = (p: string): string => {
  const n = norm(p);
  const i = n.lastIndexOf("/");
  return i < 0 ? "" : n.slice(0, i);
};
const baseOf = (p: string): string => norm(p).split("/").pop() ?? "";
const natural = (a: string, b: string): number => a.localeCompare(b, "es", { numeric: true, sensitivity: "base" });
const CODE_RE = /^(\d+(?:\.\d+)*)[\s.\-_]+(.*)$/;
/** «4.1 What the backend is» -> código «4.1» y título limpio. */
export function splitCode(title: string): { code: string; title: string } {
  const m = CODE_RE.exec(title.trim());
  return m ? { code: m[1]!, title: m[2]!.trim() || title } : { code: "", title };
}

export const stateOf = (pct: number, attempts: number, complete: boolean): TopicState => (complete ? "completo" : attempts > 0 || pct > 0 ? "en_curso" : "sin_tratar");

/** Todas las filas de tema, con sus repasos y su última actividad. */
export function topicRows(input: IndexInput): TopicRow[] {
  const reviewOf = new Map<string, ReviewLite>();
  for (const r of input.reviews) {
    const k = norm(r.topicPath);
    const cur = reviewOf.get(k);
    if (!cur || r.next < cur.next) reviewOf.set(k, r);
  }
  return input.items.map((it): TopicRow => {
    const folder = norm(it.folder);
    let attempts = 0;
    let done = 0;
    let total = 0;
    for (const sp of Object.values(it.progress?.skills ?? {})) {
      attempts += sp.totalAttempts;
      let required = 0;
      let capped = 0;
      for (const c of Object.values(sp.cells ?? {})) {
        if (c.required) {
          required += c.required;
          capped += Math.min(c.passes, c.required);
        }
      }
      if (required) {
        total += required;
        done += capped;
      } else done += sp.totalPasses;
    }
    if (!total) total = it.progress?.exerciseNotesCount ?? 0;
    const pct = Math.max(0, Math.min(100, Math.round(it.progress?.completenessPct ?? 0)));
    const rev = reviewOf.get(folder);
    const t = splitCode(it.manifest?.title ?? baseOf(folder));
    return {
      space: folder.split("/")[0] || it.subject || "",
      area: dirOf(folder),
      folder,
      title: t.title,
      code: t.code,
      pct,
      state: stateOf(pct, attempts, !!it.progress?.isComplete),
      exercisesDone: done,
      exercisesTotal: Math.max(total, done),
      nextReview: rev?.next ?? "",
      reviewDue: !!rev && rev.inDays <= 0,
      lastActivity: input.lastByFolder.get(folder) ?? "",
    };
  });
}

function totalsOf(rows: ReadonlyArray<TopicRow>): Totals {
  const n = rows.length;
  return {
    pct: n ? Math.round(rows.reduce((a, r) => a + r.pct, 0) / n) : 0,
    topics: n,
    completed: rows.filter((r) => r.state === "completo").length,
    started: rows.filter((r) => r.state !== "sin_tratar").length,
    exercisesDone: rows.reduce((a, r) => a + r.exercisesDone, 0),
    exercisesTotal: rows.reduce((a, r) => a + r.exercisesTotal, 0),
    reviewsDue: rows.filter((r) => r.reviewDue).length,
    lastActivity: rows.reduce((a, r) => (r.lastActivity > a ? r.lastActivity : a), ""),
  };
}
const groupBy = <T,>(xs: ReadonlyArray<T>, key: (x: T) => string): Map<string, T[]> => {
  const m = new Map<string, T[]>();
  for (const x of xs) {
    const k = key(x);
    const l = m.get(k);
    if (l) l.push(x);
    else m.set(k, [x]);
  }
  return m;
};

export function spaceRows(rows: ReadonlyArray<TopicRow>): SpaceRow[] {
  return [...groupBy(rows, (r) => r.space)]
    .map(([space, rs]) => ({ space, areas: new Set(rs.map((r) => r.area)).size, ...totalsOf(rs) }))
    .sort((a, b) => natural(a.space, b.space));
}
export function areaRows(rows: ReadonlyArray<TopicRow>, space: string): AreaRow[] {
  return [...groupBy(rows.filter((r) => r.space === space), (r) => r.area)]
    .map(([area, rs]) => {
      const t = totalsOf(rs);
      return { space, area, name: area === space ? "General" : baseOf(area) || "General", ...t, state: stateOf(t.pct, t.started, t.completed === t.topics && t.topics > 0) };
    })
    .sort((a, b) => natural(a.name, b.name));
}
export function topicsOf(rows: ReadonlyArray<TopicRow>, space: string, area: string): TopicRow[] {
  return rows.filter((r) => r.space === space && r.area === norm(area)).sort((a, b) => natural(a.code || a.title, b.code || b.title) || natural(a.title, b.title));
}

// ── Del lado de la pantalla ─────────────────────────────────────────────

export const STATE_LABEL: Record<TopicState, string> = { sin_tratar: "Sin tratar", en_curso: "En curso", completo: "Completo" };
export type TopicFilter = "todos" | TopicState | "repaso";
export const TOPIC_FILTERS: ReadonlyArray<{ id: TopicFilter; label: string }> = [
  { id: "todos", label: "Todos" },
  { id: "sin_tratar", label: "Sin tratar" },
  { id: "en_curso", label: "En curso" },
  { id: "completo", label: "Completos" },
  { id: "repaso", label: "Con repaso pendiente" },
];
export function filterTopics(rows: ReadonlyArray<TopicRow>, filter: TopicFilter, query = ""): TopicRow[] {
  const q = query.trim().toLowerCase();
  return rows.filter((r) => (filter === "todos" ? true : filter === "repaso" ? r.reviewDue : r.state === filter) && (!q || `${r.code} ${r.title}`.toLowerCase().includes(q)));
}
export type AreaSort = "avance" | "nombre";
export function sortAreas<T extends { name: string; pct: number }>(rows: ReadonlyArray<T>, sort: AreaSort): T[] {
  return [...rows].sort((a, b) => (sort === "avance" ? b.pct - a.pct || natural(a.name, b.name) : natural(a.name, b.name)));
}
/** La ruta del desglose, persistida como «espacio|área» (vacío = nivel 1). */
export function parsePath(raw: string): { space: string; area: string } {
  const [space = "", area = ""] = String(raw ?? "").split("|");
  return { space, area: space ? area : "" };
}
export const joinPath = (space: string, area = ""): string => (space ? (area ? `${space}|${area}` : space) : "");

// ── Insignia «En tu plan» ───────────────────────────────────────────────

export interface PlanMembership {
  planName: string;
  folders: ReadonlySet<string>;
  /** carpetas de área (padre del tema) con al menos un tema en la ruta del plan */
  areas: ReadonlySet<string>;
}
export function planMembership(planName: string, plan: { subplans: ReadonlyArray<{ topics: ReadonlyArray<{ folder: string; route?: string }> }> } | null | undefined): PlanMembership | null {
  if (!plan) return null;
  const folders = new Set<string>();
  const areas = new Set<string>();
  for (const s of plan.subplans) {
    for (const t of s.topics) {
      if (!t.folder || t.route === "skipped") continue;
      const f = norm(t.folder);
      folders.add(f);
      areas.add(dirOf(f));
    }
  }
  return { planName, folders, areas };
}
