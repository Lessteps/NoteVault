/**
 * Motor de cobertura del currículo de referencia: contrasta el catálogo (`catalog.ts`) con los temas que ya existen en
 * la vault. Puro: sin disco ni red; la API (`api/modules/curriculumCoverage.ts`) le pasa los temas del escaneo.
 *
 *  - `cubierto`: un tema específico lo cubre (frontmatter `curriculum_id` igual al id de la entrada; título que contiene el
 *    de la entrada; o una palabra clave de varias palabras en el título).
 *  - `parcial`: solo un tema de repaso general lo toca (reglas de `catalog/overviews.ts`); un repaso solo puede tocar entradas
 *    esenciales, nunca las recomendadas ni las opcionales. Fuera de la carpeta del área solo cuentan el id exacto o el título completo.
 *  - `faltante`: nada lo cubre.
 */
import {
  coverageLevel,
  coveragePct,
  type AreaCoverage,
  type CoverageRow,
  type CurriculumArea,
  type CurriculumCoverage,
  type CurriculumEntry,
} from "../../lib/curriculum";
import { CURRICULUM_OVERVIEWS, type OverviewRule } from "./catalog/overviews";

export interface ExistingTopic {
  /** Carpeta del tema relativa a la vault, con `/`: `Programación/5 Frontend/5.2 CSS`. */
  folder: string;
  /** Título del tema (sin número si es posible). */
  title: string;
  /** `curriculum_id` del frontmatter de la nota del tema, si lo tiene. */
  curriculumId?: string;
}

const GENERIC_WORDS = new Set(["the", "and", "in", "with", "basics", "basic", "intro", "introduction", "overview", "reference", "api", "apis", "methods", "properties", "element", "elements", "attributes", "of", "for", "a", "an", "to", "using", "javascript", "js", "css", "html", "java"]);
const MAX_MATCHED = 5;

export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9+#@]+/g, " ")
    .trim();
}

const wordsOf = (s: string): string[] => normalizeText(s).split(" ").filter(Boolean);

function containsPhrase(hay: string[], needle: string[]): boolean {
  if (!needle.length || needle.length > hay.length) return false;
  outer: for (let i = 0; i <= hay.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

/** Título sin número de tema (`12.3 Flexbox` -> `Flexbox`). */
export function stripTopicNumber(s: string): string {
  return s.replace(/^\s*\d+(?:\.\d+)*\s+/, "").trim();
}

const baseName = (folder: string): string => folder.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? "";

/** Prefijo numérico del área: `12 CSS` -> `12`. */
export function areaNumberPrefix(areaFolder: string): string {
  return /^(\d+(?:\.\d+)*)\b/.exec(areaFolder.trim())?.[1] ?? "";
}

interface PreparedTopic {
  topic: ExistingTopic;
  folder: string;
  titleWords: string[];
  coreWords: string[];
  overview: OverviewRule[];
  /** Carpeta dentro del área del catálogo: solo estos temas pueden cubrir con una palabra clave suelta. */
  own: boolean;
}

function entryText(e: CurriculumEntry): { words: Set<string>; text: string } {
  const text = normalizeText(`${e.id} ${e.title} ${e.keywords.join(" ")}`);
  return { words: new Set(text.split(" ")), text };
}

function touches(rule: OverviewRule, e: CurriculumEntry): boolean {
  const { words, text } = entryText(e);
  return rule.touches.some((t) => {
    const n = normalizeText(t);
    return n.includes(" ") ? text.includes(n) : words.has(n);
  });
}

function strongMatch(p: PreparedTopic, e: CurriculumEntry): boolean {
  if (p.topic.curriculumId && p.topic.curriculumId === e.id) return true;
  const titleWords = wordsOf(e.title);
  if (containsPhrase(p.titleWords, titleWords)) return true;
  // fuera de la carpeta del área (otros lenguajes, Fundamentals…) solo cuentan el id exacto o el título completo
  if (!p.own) return false;
  for (const k of e.keywords) {
    const kw = wordsOf(k);
    if (!kw.length) continue;
    if (kw.length >= 2) {
      if (containsPhrase(p.titleWords, kw)) return true;
    } else if (p.coreWords.length && p.coreWords.every((w) => w === kw[0] || GENERIC_WORDS.has(w)) && p.coreWords.includes(kw[0]!)) {
      return true;
    }
  }
  return false;
}

/** Números `N` ya usados en la carpeta del área por temas `<prefijo>.N …`. */
function usedNumbers(area: CurriculumArea, topics: PreparedTopic[]): Set<number> {
  const prefix = areaNumberPrefix(area.areaFolder);
  const used = new Set<number>();
  if (!prefix) return used;
  const base = `${area.space}/${area.areaFolder}/`.toLowerCase();
  const rx = new RegExp(`^${prefix.replace(/\./g, "\\.")}\\.(\\d+)(?:\\s|$)`);
  for (const p of topics) {
    if (!p.folder.toLowerCase().startsWith(base)) continue;
    const seg = p.folder.slice(base.length).split("/")[0] ?? "";
    const m = rx.exec(seg);
    if (m) used.add(Number(m[1]));
  }
  return used;
}

export function computeAreaCoverage(area: CurriculumArea, topics: ExistingTopic[], overviews: Record<string, OverviewRule[]> = CURRICULUM_OVERVIEWS): AreaCoverage {
  const rules = overviews[area.id] ?? [];
  const spaceLow = `${area.space}/`.toLowerCase();
  const areaBase = `${area.space}/${area.areaFolder}/`.toLowerCase();
  const prepared: PreparedTopic[] = [];
  for (const t of topics) {
    const folder = t.folder.replace(/\\/g, "/").replace(/\/+$/, "");
    if (!folder.toLowerCase().startsWith(spaceLow)) continue;
    const title = stripTopicNumber(t.title || baseName(folder));
    const titleWords = wordsOf(title);
    const low = folder.toLowerCase();
    // los temas creados desde el catálogo (carpeta del área) son siempre específicos
    const overview = low.startsWith(areaBase) ? [] : rules.filter((r) => r.match.test(low));
    const hasId = Boolean(t.curriculumId);
    prepared.push({
      topic: t,
      folder,
      titleWords,
      coreWords: titleWords.filter((w) => !/^\d+$/.test(w)),
      overview: hasId ? [] : overview,
      own: low.startsWith(areaBase),
    });
  }
  const used = usedNumbers(area, prepared);
  const prefix = areaNumberPrefix(area.areaFolder);

  const rows: CoverageRow[] = [];
  let covered = 0;
  let partial = 0;
  let missing = 0;
  let index = 0;
  for (const entry of area.entries) {
    index++;
    const strong: string[] = [];
    const weak: string[] = [];
    for (const p of prepared) {
      if (p.overview.length) {
        if (entry.importance === "esencial" && p.overview.some((r) => touches(r, entry))) weak.push(p.folder);
      } else if (strongMatch(p, entry)) {
        strong.push(p.folder);
      }
    }
    let status: CoverageRow["status"];
    let matchedFolders: string[];
    if (strong.length) {
      status = "cubierto";
      matchedFolders = strong.slice(0, MAX_MATCHED);
      covered++;
    } else if (weak.length) {
      status = "parcial";
      matchedFolders = weak.slice(0, MAX_MATCHED);
      partial++;
    } else {
      status = "faltante";
      matchedFolders = [];
      missing++;
    }
    let suggestedFolder = "";
    if (status !== "cubierto") {
      let n = index;
      while (used.has(n)) n++;
      used.add(n);
      suggestedFolder = `${area.space}/${area.areaFolder}/${prefix ? `${prefix}.${n}` : String(n)} ${entry.title}`;
    }
    rows.push({ entry, status, matchedFolders, suggestedFolder });
  }
  const total = area.entries.length;
  const pct = coveragePct(covered, partial, total);
  return { areaId: area.id, title: area.title, space: area.space, areaFolder: area.areaFolder, total, covered, partial, missing, pct, level: coverageLevel(pct), rows };
}

export function computeCoverage(areas: CurriculumArea[], topics: ExistingTopic[], overviews: Record<string, OverviewRule[]> = CURRICULUM_OVERVIEWS): CurriculumCoverage {
  return { areas: areas.map((a) => computeAreaCoverage(a, topics, overviews)) };
}

/**
 * Sección de texto para el prompt del temario: huecos de las áreas de referencia (primero lo esencial). Vacía si todas
 * las áreas están completas. `perArea` limita las líneas por área.
 */
export function coverageGapsPromptSection(coverage: CurriculumCoverage, perArea = 12): string {
  const blocks: string[] = [];
  for (const a of coverage.areas) {
    if (a.level === "ok" && a.missing === 0) continue;
    const order = { esencial: 0, recomendado: 1, opcional: 2 } as const;
    const gaps = a.rows
      .filter((r) => r.status !== "cubierto")
      .sort((x, y) => order[x.entry.importance] - order[y.entry.importance])
      .slice(0, perArea);
    if (!gaps.length) continue;
    const lines = gaps.map((r) => `- ${r.suggestedFolder.split("/").pop()} [${r.entry.importance}, ${r.entry.category}] covers: ${r.entry.items.slice(0, 8).join(", ")}`);
    blocks.push(`Area «${a.areaFolder}» (${a.title}): ${a.pct}% covered (${a.covered} of ${a.total}, ${a.partial} partial).\n${lines.join("\n")}`);
  }
  return blocks.length ? blocks.join("\n\n") : "";
}
