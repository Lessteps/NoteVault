/**
 * The two canvas maps that belong to English only, drawn with no AI and with the same conventions as the area and
 * space maps (`core/areaMap.ts`): groups that wrap their cards, `text` cards, and an arrow that always carries a
 * label saying WHY the two cards are connected.
 *
 * TENSES        (grammar)     a timeline: one group per time (pasado / presente / futuro), one card per tense with
 *                              its form and an example, arrows labelled with WHEN one is chosen over the other.
 * WORD FAMILIES (vocabulary)  one group per root word, the root on the left and one card per derived form, arrows
 *                              labelled with the suffix or change that produces it.
 */

import type { AreaMap, MapEdge, MapNode } from "../areaMap.js";

export const TENSE_MAP_FILE = "00 Mapa de tiempos verbales.canvas";
export const WORD_FAMILY_MAP_FILE = "00 Mapa de familias de palabras.canvas";

interface Tense {
  id: string;
  time: 0 | 1 | 2;
  name: string;
  form: string;
  example: string;
}

const TIMES = [
  { label: "Pasado", color: "1" },
  { label: "Presente", color: "4" },
  { label: "Futuro", color: "6" },
] as const;

const TENSES: readonly Tense[] = [
  { id: "past_perfect", time: 0, name: "Past perfect", form: "had + participio", example: "I had left before she arrived." },
  { id: "past_simple", time: 0, name: "Past simple", form: "verbo + -ed / forma irregular", example: "I visited Rome in 2019." },
  { id: "past_cont", time: 0, name: "Past continuous", form: "was/were + verbo-ing", example: "I was cooking when you called." },
  { id: "pres_simple", time: 1, name: "Present simple", form: "verbo (+ -s en he/she/it)", example: "She works in a bank." },
  { id: "pres_cont", time: 1, name: "Present continuous", form: "am/is/are + verbo-ing", example: "She is working right now." },
  { id: "pres_perfect", time: 1, name: "Present perfect", form: "have/has + participio", example: "I have lived here for ten years." },
  { id: "fut_will", time: 2, name: "Future simple (will)", form: "will + verbo", example: "I will call you tomorrow." },
  { id: "fut_going", time: 2, name: "Be going to", form: "am/is/are going to + verbo", example: "I am going to study tonight." },
  { id: "fut_cont", time: 2, name: "Future continuous", form: "will be + verbo-ing", example: "At nine I will be flying." },
];

const TENSE_LINKS: ReadonlyArray<[string, string, string]> = [
  ["past_cont", "past_simple", "una acción larga interrumpida por una corta"],
  ["past_simple", "past_perfect", "algo ocurrió ANTES de ese momento del pasado"],
  ["past_simple", "pres_perfect", "el hecho pasado llega o importa hoy"],
  ["pres_simple", "pres_cont", "hábito o hecho general vs. lo que pasa ahora mismo"],
  ["pres_simple", "past_simple", "mismo verbo, pero el hecho ya terminó (-ed)"],
  ["pres_cont", "fut_going", "un plan ya en marcha se proyecta al futuro"],
  ["fut_will", "fut_going", "decisión del momento vs. plan ya decidido"],
  ["fut_will", "fut_cont", "un hecho futuro vs. una acción en curso en ese momento futuro"],
];

const CARD_W = 360;
const TIME_STEP = 680;
const GROUP_W = 414;
const ROW = 190;
const CARD_H = 150;
const PAD = 27;
const TOP = 48;

export function buildTenseMapCanvas(): AreaMap {
  const nodes: MapNode[] = [];
  const edges: MapEdge[] = [];
  const perTime = [0, 0, 0];
  const height = TOP + 2 * ROW + CARD_H + 24;
  TIMES.forEach((t, i) => {
    nodes.push({ id: `g${i + 1}`, type: "group", x: i * TIME_STEP, y: 0, width: GROUP_W, height, color: t.color, label: t.label, nv: { zIndex: -2 } });
  });
  for (const t of TENSES) {
    const row = perTime[t.time]!++;
    nodes.push({
      id: t.id,
      type: "text",
      x: t.time * TIME_STEP + PAD,
      y: TOP + row * ROW,
      width: CARD_W,
      height: CARD_H,
      text: `## ${t.name}\n\n**Forma:** ${t.form}\n\n*${t.example}*`,
    });
  }
  TENSE_LINKS.forEach(([a, b, label], i) => {
    const ta = TENSES.find((t) => t.id === a)!;
    const tb = TENSES.find((t) => t.id === b)!;
    const same = ta.time === tb.time;
    const forward = ta.time <= tb.time;
    edges.push({
      id: `e${i + 1}`,
      fromNode: a,
      toNode: b,
      fromSide: same ? "bottom" : forward ? "right" : "left",
      toSide: same ? "top" : forward ? "left" : "right",
      label,
    });
  });
  return { nodes, edges };
}

export interface WordForm {
  word: string;
  /** sustantivo, verbo, adjetivo, adverbio… */
  pos: string;
  /** what turns the root into it: "+ -ment", "-y → -ied"… */
  change: string;
}

export interface WordFamily {
  root: string;
  /** part of speech of the root */
  pos: string;
  forms: readonly WordForm[];
}

/** A starter set; a vault can pass its own families instead. */
export const DEFAULT_WORD_FAMILIES: readonly WordFamily[] = [
  {
    root: "decide",
    pos: "verbo",
    forms: [
      { word: "decision", pos: "sustantivo", change: "-de + -ion" },
      { word: "decisive", pos: "adjetivo", change: "+ -ive" },
      { word: "decisively", pos: "adverbio", change: "adjetivo + -ly" },
    ],
  },
  {
    root: "create",
    pos: "verbo",
    forms: [
      { word: "creation", pos: "sustantivo", change: "-e + -ion" },
      { word: "creative", pos: "adjetivo", change: "-e + -ive" },
      { word: "creatively", pos: "adverbio", change: "adjetivo + -ly" },
    ],
  },
  {
    root: "success",
    pos: "sustantivo",
    forms: [
      { word: "succeed", pos: "verbo", change: "cambia la terminación" },
      { word: "successful", pos: "adjetivo", change: "+ -ful" },
      { word: "successfully", pos: "adverbio", change: "adjetivo + -ly" },
    ],
  },
];

const FORM_STEP = 130;

export function buildWordFamilyCanvas(families: readonly WordFamily[] = DEFAULT_WORD_FAMILIES): AreaMap {
  const nodes: MapNode[] = [];
  const edges: MapEdge[] = [];
  let y = 0;
  families.forEach((f, i) => {
    const rows = Math.max(1, f.forms.length);
    const h = Math.max(240, TOP + (rows - 1) * FORM_STEP + 100 + 24);
    nodes.push({ id: `fam${i + 1}`, type: "group", x: 0, y, width: 760, height: h, color: "6", label: `Familia — ${f.root}`, nv: { zIndex: -2 } });
    nodes.push({ id: `r${i + 1}`, type: "text", x: PAD, y: y + TOP + ((rows - 1) * FORM_STEP) / 2, width: 240, height: 100, text: `## ${f.root}\n\n*${f.pos}* — palabra raíz` });
    f.forms.forEach((w, j) => {
      const id = `w${i + 1}_${j + 1}`;
      nodes.push({ id, type: "text", x: 440, y: y + TOP + j * FORM_STEP, width: 290, height: 100, text: `## ${w.word}\n\n*${w.pos}*` });
      edges.push({ id: `e${i + 1}_${j + 1}`, fromNode: `r${i + 1}`, toNode: id, fromSide: "right", toSide: "left", label: w.change });
    });
    y += h + 60;
  });
  return { nodes, edges };
}
