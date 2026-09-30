/**
 * The area and subject maps (canvas), built with no AI from a syllabus plus the
 * dependencies between its topics. The structure is copied from the vault's own maps
 * (`00 Mapa — 1 Aritmética elemental y operativa.canvas` and `00 Mapa de Matemáticas.canvas`):
 *
 * AREA MAP  one big group (colour 6, named after the area) holding a 300x120 `file`
 *           card per topic, laid out in dependency columns (640 px apart, 210 px per
 *           row), and right→left arrows whose label says WHY the topic is needed.
 * SUBJECT MAP  one group per block ("Bloque I — Aritmética", 680 px apart) holding a
 *           text card with the area's topics as [[links]], and arrows between areas
 *           labelled "N prerrequisito(s)".
 *
 * The topic map is different: it is built from the theory note's own sections by
 * `tools/kb_canvas.ts`.
 */

export interface MapNode {
  id: string;
  type: "text" | "file" | "group";
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  text?: string;
  file?: string;
  label?: string;
  nv?: { zIndex: number };
}

export interface MapEdge {
  id: string;
  fromNode: string;
  toNode: string;
  fromSide: "top" | "right" | "bottom" | "left";
  toSide: "top" | "right" | "bottom" | "left";
  label: string;
}

export interface AreaMap {
  nodes: MapNode[];
  edges: MapEdge[];
}

export interface MapTopic {
  /** topic name, e.g. "1.2 Suma y resta de enteros" */
  name: string;
  /** vault-relative path of its theory note */
  file: string;
}

export interface TopicDependency {
  from: string;
  to: string;
  /** why `to` needs `from`: a few words, never empty */
  label: string;
}

const CARD_W = 300;
const CARD_H = 120;
const COL_STEP = 640;
const ROW_STEP = 210;
const GROUP_PAD = 24;
const GROUP_TOP = 48;

const numeric = (a: string, b: string) => a.localeCompare(b, "es", { numeric: true, sensitivity: "base" });

/** Dependencies made of known topics only, pointing forward in the natural order. */
function cleanDeps(topics: readonly MapTopic[], deps: readonly TopicDependency[]): TopicDependency[] {
  const index = new Map(topics.map((t, i) => [t.name, i]));
  const seen = new Set<string>();
  const out: TopicDependency[] = [];
  for (const d of deps) {
    const a = index.get(d.from);
    const b = index.get(d.to);
    if (a === undefined || b === undefined || a >= b) continue;
    const key = `${a}>${b}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ from: d.from, to: d.to, label: d.label.trim() || "prepara para" });
  }
  return out;
}

/** When nothing is known about the dependencies, each topic follows the one before it. */
export function chainDependencies(topics: readonly MapTopic[]): TopicDependency[] {
  const sorted = [...topics].sort((a, b) => numeric(a.name, b.name));
  return sorted.slice(1).map((t, i) => ({ from: sorted[i]!.name, to: t.name, label: "prepara para" }));
}

export function buildAreaMapCanvas(area: string, topicList: readonly MapTopic[], deps: readonly TopicDependency[] = []): AreaMap {
  const topics = [...topicList].sort((a, b) => numeric(a.name, b.name));
  const edgesIn = cleanDeps(topics, deps.length ? deps : chainDependencies(topics));

  // Column = longest chain of prerequisites before the topic.
  const layer = new Map<string, number>(topics.map((t) => [t.name, 0]));
  for (const t of topics) {
    for (const d of edgesIn) if (d.to === t.name) layer.set(t.name, Math.max(layer.get(t.name)!, layer.get(d.from)! + 1));
  }
  const rowsUsed = new Map<number, number>();
  const nodes: MapNode[] = [];
  const idOf = new Map<string, string>();
  topics.forEach((t, i) => {
    const col = layer.get(t.name)!;
    const row = rowsUsed.get(col) ?? 0;
    rowsUsed.set(col, row + 1);
    const id = `t${i + 1}`;
    idOf.set(t.name, id);
    nodes.push({ id, type: "file", x: col * COL_STEP, y: row * ROW_STEP, width: CARD_W, height: CARD_H, file: t.file });
  });

  const maxCol = Math.max(0, ...layer.values());
  const maxRows = Math.max(1, ...rowsUsed.values());
  const group: MapNode = {
    id: "area",
    type: "group",
    x: -GROUP_PAD,
    y: -GROUP_TOP,
    width: maxCol * COL_STEP + CARD_W + 2 * GROUP_PAD,
    height: (maxRows - 1) * ROW_STEP + CARD_H + GROUP_TOP + GROUP_PAD,
    color: "6",
    label: area,
    nv: { zIndex: -2 },
  };

  const edges: MapEdge[] = edgesIn.map((d, i) => ({
    id: `e${i + 1}`,
    fromNode: idOf.get(d.from)!,
    toNode: idOf.get(d.to)!,
    fromSide: "right",
    toSide: "left",
    label: d.label,
  }));
  return { nodes: [group, ...nodes], edges };
}

// ── Subject (space) map ─────────────────────────────────────────────────────

export interface SpaceMapArea {
  /** e.g. "1 Aritmética elemental y operativa" */
  name: string;
  topics: readonly string[];
  /** how many topics of earlier areas this one builds on (label of the arrow into it) */
  prerequisites?: number;
}

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI"];
const BLOCK_STEP = 680;
const BLOCK_W = 414;

export function buildSpaceMapCanvas(areas: readonly SpaceMapArea[]): AreaMap {
  const nodes: MapNode[] = [];
  const edges: MapEdge[] = [];
  areas.forEach((a, i) => {
    const x = i * BLOCK_STEP;
    const text = `## ${a.name}\n\n${a.topics.map((t) => `- [[${t}]]`).join("\n")}`;
    const cardH = 80 + 30 * a.topics.length;
    const title = a.name.replace(/^\d+(?:\.\d+)*\s+/, "");
    nodes.push({
      id: `g${i + 1}`,
      type: "group",
      x,
      y: 0,
      width: BLOCK_W,
      height: cardH + 2 * GROUP_TOP,
      label: `Bloque ${ROMAN[i] ?? i + 1} — ${title}`,
      nv: { zIndex: -2 },
    });
    nodes.push({ id: `a${i + 1}`, type: "text", x: x + GROUP_PAD, y: GROUP_TOP, width: 360, height: cardH, text });
    if (i > 0) {
      const n = a.prerequisites ?? 1;
      edges.push({ id: `e${i}`, fromNode: `a${i}`, toNode: `a${i + 1}`, fromSide: "right", toSide: "left", label: `${n} prerrequisito(s)` });
    }
  });
  return { nodes, edges };
}
