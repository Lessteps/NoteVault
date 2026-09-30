/**
 * Compares what the learner wrote (a dictation, a passage typed from memory, the phrase they shadowed) with the
 * reference text (the transcript). No AI: the words are aligned one by one and every difference is named, so the
 * feedback is exact, free and works offline.
 */

export type OpKind = "match" | "missing" | "extra" | "wrong" | "spelling";

export interface WordOp {
  kind: OpKind;
  /** the word in the reference (absent for `extra`) */
  ref?: string;
  /** the word the learner wrote (absent for `missing`) */
  got?: string;
}

export interface Comparison {
  ops: WordOp[];
  refWords: number;
  matched: number;
  missing: number;
  extra: number;
  wrong: number;
  spelling: number;
  /** 0–100: matches count fully, near-misses (spelling) half, extra words cost half a match */
  score: number;
}

/** Words as compared: lower case, curly quotes straightened, punctuation stripped (inner ' and - stay). */
export function tokenize(text: string): string[] {
  return text
    .replace(/[‘’ʼ`´]/g, "'")
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, "").replace(/^'+|'+$/g, ""))
    .filter(Boolean);
}

/** The edit distance between two words (small inputs, plain dynamic programming). */
function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j]!;
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return prev[b.length]!;
}

/** A near-miss: the same word misspelled (or a wrong ending), not a different word. */
function isSpellingSlip(ref: string, got: string): boolean {
  if (ref.length < 4 || got.length < 4) return false;
  const d = editDistance(ref, got);
  return d <= (Math.max(ref.length, got.length) <= 5 ? 1 : 2);
}

export function compareTexts(reference: string, attempt: string): Comparison {
  const ref = tokenize(reference);
  const got = tokenize(attempt);
  const n = ref.length;
  const m = got.length;
  const cost: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  const sub = (a: string, b: string): number => (a === b ? 0 : isSpellingSlip(a, b) ? 0.45 : 1);
  for (let i = 1; i <= n; i++) cost[i]![0] = i;
  for (let j = 1; j <= m; j++) cost[0]![j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      cost[i]![j] = Math.min(cost[i - 1]![j - 1]! + sub(ref[i - 1]!, got[j - 1]!), cost[i - 1]![j]! + 1, cost[i]![j - 1]! + 1);
    }
  }
  const ops: WordOp[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && Math.abs(cost[i]![j]! - (cost[i - 1]![j - 1]! + sub(ref[i - 1]!, got[j - 1]!))) < 1e-9) {
      const s = sub(ref[i - 1]!, got[j - 1]!);
      ops.push({ kind: s === 0 ? "match" : s < 1 ? "spelling" : "wrong", ref: ref[i - 1], got: got[j - 1] });
      i--;
      j--;
    } else if (i > 0 && Math.abs(cost[i]![j]! - (cost[i - 1]![j]! + 1)) < 1e-9) {
      ops.push({ kind: "missing", ref: ref[i - 1] });
      i--;
    } else {
      ops.push({ kind: "extra", got: got[j - 1] });
      j--;
    }
  }
  ops.reverse();
  const count = (k: OpKind) => ops.filter((o) => o.kind === k).length;
  const matched = count("match");
  const spelling = count("spelling");
  const extra = count("extra");
  const score = n === 0 ? (m === 0 ? 100 : 0) : Math.max(0, Math.min(100, Math.round((100 * (matched + 0.5 * spelling - 0.5 * extra)) / n)));
  return { ops, refWords: n, matched, missing: count("missing"), extra, wrong: count("wrong"), spelling, score };
}

const FUNCTION_WORDS = new Set([
  "a", "an", "the", "of", "to", "in", "on", "at", "for", "from", "with", "by", "and", "but", "or", "as", "than", "that", "this",
  "is", "are", "was", "were", "am", "be", "been", "have", "has", "had", "do", "does", "did", "can", "could", "will", "would",
  "shall", "should", "must", "i", "you", "he", "she", "it", "we", "they", "me", "him", "her", "us", "them", "my", "your", "his",
  "its", "our", "their", "not", "no", "so", "if", "then", "there", "some", "any",
]);

export type MistakeKind = "weak_forms" | "numbers" | "endings" | "misheard" | "extra_words" | "spelling";

/** What kind of listening mistake a difference is (feeds the learner's error record). */
export function classify(op: WordOp): MistakeKind | null {
  if (op.kind === "match") return null;
  if (op.kind === "extra") return "extra_words";
  if (op.kind === "spelling") {
    const ref = op.ref ?? "";
    const got = op.got ?? "";
    return ref.replace(/(es|s|ed|d|ing)$/, "") === got.replace(/(es|s|ed|d|ing)$/, "") ? "endings" : "spelling";
  }
  const ref = op.ref ?? "";
  if (/\d/.test(ref) || /^(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)$/.test(ref)) return "numbers";
  if (FUNCTION_WORDS.has(ref) || ref.includes("'")) return "weak_forms";
  return "misheard";
}

export const MISTAKE_LABELS: Record<MistakeKind, string> = {
  weak_forms: "Formas débiles y contracciones",
  numbers: "Números",
  endings: "Terminaciones (-s, -ed, -ing)",
  misheard: "Palabra mal oída",
  extra_words: "Palabras añadidas",
  spelling: "Ortografía",
};
