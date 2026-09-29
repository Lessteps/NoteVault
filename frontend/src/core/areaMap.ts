/**
 * The map (canvas) of a grouping area, built from its topics with no AI: a central
 * node, one node per topic in natural order laid out in a snake of rows of four, and
 * labelled arrows (every arrow says why it connects). Follows `mapa_skill`.
 */

export interface MapNode {
  id: string;
  type: "text";
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
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

const COLS = 4;
const W = 300;
const H = 120;
const GAP_X = 70;
const GAP_Y = 90;
const COLORS = ["4", "5", "6", "3", "2", "1"];

const numeric = (a: string, b: string) => a.localeCompare(b, "es", { numeric: true, sensitivity: "base" });

export function buildAreaMapCanvas(area: string, topics: readonly string[], blurb = ""): AreaMap {
  const sorted = [...topics].sort(numeric);
  const rowWidth = COLS * W + (COLS - 1) * GAP_X;
  const nodes: MapNode[] = [
    {
      id: "area",
      type: "text",
      text: `# ${area}${blurb ? `\n\n${blurb}` : `\n\n${sorted.length} temas, en orden de aprendizaje.`}`,
      x: Math.round(rowWidth / 2 - 190),
      y: 0,
      width: 380,
      height: 160,
      color: "6",
    },
  ];
  const edges: MapEdge[] = [];

  sorted.forEach((topic, i) => {
    const row = Math.floor(i / COLS);
    const col = i % COLS;
    // Snake: odd rows run right to left, so consecutive topics are always neighbours.
    const visualCol = row % 2 === 0 ? col : COLS - 1 - col;
    const id = `t${i + 1}`;
    nodes.push({
      id,
      type: "text",
      text: `## ${topic}`,
      x: visualCol * (W + GAP_X),
      y: 260 + row * (H + GAP_Y),
      width: W,
      height: H,
      color: COLORS[Math.floor(i / 4) % COLORS.length],
    });
    if (i === 0) {
      edges.push({ id: "e0", fromNode: "area", toNode: id, fromSide: "bottom", toSide: "top", label: "empieza por" });
      return;
    }
    const sameRow = Math.floor((i - 1) / COLS) === row;
    const goingRight = row % 2 === 0;
    edges.push({
      id: `e${i}`,
      fromNode: `t${i}`,
      toNode: id,
      fromSide: sameRow ? (goingRight ? "right" : "left") : "bottom",
      toSide: sameRow ? (goingRight ? "left" : "right") : "top",
      label: "prepara para",
    });
  });
  return { nodes, edges };
}
