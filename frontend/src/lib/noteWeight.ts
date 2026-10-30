// PESO de una nota de teoría: ¿se puede aprender de una vez o es un capítulo entero metido en una nota? Es la regla que faltaba: la skill decía «un tema = una idea»
// pero no ponía límite, y salieron notas de 2300 palabras que mezclan proyecto, entornos virtuales e importaciones. Aquí el límite es un dato, no una opinión.
// Puro: recibe el texto de la nota. Los mismos números viven en `tools/programming_kb/check_format.mjs` (lo comprueba `noteWeight.test.ts`).

/** Palabras de `## Explanation` (qué es + modelo mental): lo que se lee ANTES de los ejemplos. Pasado el tope hay más de una idea. */
export const MAX_EXPLANATION_WORDS = 500;
/** Palabras de toda la nota. */
export const MAX_NOTE_WORDS = 1500;
/** Un título que enumera tantos conceptos ya no es una idea: «Project structure, virtual environments and imports». */
export const MAX_TITLE_CONCEPTS = 2;

export interface NoteWeight {
  words: number;
  explanationWords: number;
  titleConcepts: number;
  /** «No prerequisites» en `## Requires` aunque el frontmatter liste prerrequisitos (el lector no sabe qué necesita) */
  requiresMismatch: boolean;
  /** motivos legibles de longitud; vacío = la nota cabe */
  reasons: string[];
}

const wc = (s: string): number => {
  let n = 0;
  let inWord = false;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    const space = c === 32 || c === 10 || c === 13 || c === 9 || c === 160;
    if (!space && !inWord) n++;
    inWord = !space;
  }
  return n;
};

/** El texto de la sección `## Name` hasta la siguiente `## ` (sin expresiones regulares con búsqueda perezosa: esto se llama por cada nota de la vault). */
function sectionOf(text: string, name: string): string {
  const head = `## ${name}`;
  const at = text.startsWith(head) ? 0 : text.indexOf(`\n${head}`) + 1;
  if (at <= 0 && !text.startsWith(head)) return "";
  const start = at + head.length;
  const end = text.indexOf("\n## ", start);
  return text.slice(start, end < 0 ? undefined : end);
}

/** Cuántos conceptos enumera un título: separados por comas o «and». `Functions` → 1; `Project structure, virtual environments and imports` → 3. */
export function titleConceptsOf(title: string): number {
  const t = title.replace(/^[\d.\s]+/, "").trim();
  if (!t) return 0;
  return t.split(/\s*,\s*|\s+and\s+|\s+y\s+/i).filter(Boolean).length;
}

export function noteWeight(raw: string): NoteWeight {
  const text = raw.replace(/\r\n/g, "\n");
  const explanation = sectionOf(text, "Explanation");
  const heading = /^#\s+(.+)$/m.exec(text)?.[1] ?? /^title:\s*"?(.+?)"?\s*$/m.exec(text)?.[1] ?? "";
  const body = text.replace(/^---\n[\s\S]*?\n---\n/, "");
  const fmPrereq = /^prerequisites:\s*\[\s*"/m.test(text);
  const requiresSection = sectionOf(text, "Requires");
  const w: NoteWeight = {
    words: wc(body),
    explanationWords: wc(explanation),
    titleConcepts: titleConceptsOf(heading),
    requiresMismatch: fmPrereq && /No prerequisites/i.test(requiresSection),
    reasons: [],
  };
  if (w.explanationWords > MAX_EXPLANATION_WORDS) w.reasons.push(`la explicación tiene ${w.explanationWords} palabras (máximo ${MAX_EXPLANATION_WORDS}): hay más de una idea`);
  if (w.words > MAX_NOTE_WORDS) w.reasons.push(`la nota tiene ${w.words} palabras (máximo ${MAX_NOTE_WORDS})`);
  return w;
}

/** Un título largo no basta para marcar la nota (hay agrupaciones legítimas: «Tuples, sets and records»): solo avisa cuando ADEMÁS la nota es pesada. */
export const titleTooBroad = (w: NoteWeight): boolean => w.titleConcepts > MAX_TITLE_CONCEPTS && w.reasons.length > 0;

/** ¿La nota es demasiado pesada para aprenderse de una vez? (por su longitud; el título y Requires se avisan aparte) */
export const isHeavyNote = (raw: string): boolean => noteWeight(raw).reasons.length > 0;
