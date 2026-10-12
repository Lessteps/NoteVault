// What each topic of the Programación space IS, and therefore how it is practised.
//
// The rule (set by the user, see docs/PROGRAMMING_KB_HANDOFF.md): practice follows the nature of the topic.
//   T  theoretical — a concept to understand. Practised with recognition and justification
//                    (true/false, classify, compare, explain, find the flaw in a statement), plus spaced repetition
//                    of the note's Cards. Nothing here is practised by writing code or commands.
//   P  procedural  — something you DO. Practised with code skills (implement, trace, debug…).
//   M  mixed       — a concept that is also applied. Concept skills first, then code skills.
// Same idea as Mathematics (theoretical topics: true_false, counterexample, prove, explain, find_error).

/** Topic number → type. Anything not listed takes its area's default (see AREA_DEFAULT). */
export const AREA_DEFAULT = { "1": "P", "2.1": "M", "2.2": "M", "2.3": "M", "3": "M", "4": "M", "5": "M", "6": "M", "7": "M", "8": "M", "9": "M", "10": "P" };

const T = ["1.1", "1.2", "1.3", "1.4", "1.29", "1.36", "1.63", "1.65", "1.67", "1.68", "1.69", "1.71",
  "3.1", "3.2", "3.17", "4.1", "4.2", "4.14", "5.3", "5.17", "6.1", "6.17", "7.1", "8.1", "8.3", "9.14"];
const M = ["1.5", "1.6", "1.7", "1.8", "1.9", "1.10", "1.11", "1.23", "1.26", "1.27", "1.28", "1.34", "1.37", "1.42", "1.44", "1.45",
  "1.50", "1.54", "1.55", "1.60", "1.61", "1.62", "1.70", "1.72", "1.73", "1.74",
  // area 10 (Programming Logic): the method and complexity topics mix concept and practice; the interview simulation is mixed
  "10.1", "10.2", "10.12"];
const P = ["2.1.2", "2.1.3", "2.1.4", "2.1.5", "2.1.7", "2.1.8", "2.2.2", "2.2.3", "2.2.4", "2.2.5", "2.2.6", "2.2.8",
  "6.4", "6.5", "6.6", "7.2", "7.3", "9.1", "9.2"];

export const TYPE_BY_NUMBER = Object.fromEntries([...T.map((n) => [n, "T"]), ...M.map((n) => [n, "M"]), ...P.map((n) => [n, "P"])]);

export const TYPE_NAME = { T: "theoretical", P: "procedural", M: "mixed" };

/** The area prefix of a topic number: "2.1.18" → "2.1", "5.3" → "5". */
export const areaKey = (number) => (/^2\.\d/.test(number) ? number.split(".").slice(0, 2).join(".") : number.split(".")[0]);

export function typeOf(number) {
  return TYPE_NAME[TYPE_BY_NUMBER[number] ?? AREA_DEFAULT[areaKey(number)] ?? "M"];
}

/** Concept skills: the ones a theory topic is practised with. */
export const CONCEPT_SKILLS = ["pg_true_false", "pg_classify", "pg_compare", "explain", "find_error"];

/** Code skills by area, most useful first (from `_skills/practica_skill.md`). */
export const CODE_SKILLS = {
  "1": ["trace", "implement", "decompose", "debug", "test", "analyze"],
  "2.1": ["implement", "trace", "debug", "refactor", "review", "test"],
  "2.2": ["implement", "trace", "debug", "refactor", "review", "test"],
  "2.3": ["implement", "debug", "refactor", "review", "test", "trace"],
  "3": ["design", "implement", "debug", "review", "decompose", "test"],
  "4": ["design", "implement", "review", "debug", "test", "decompose"],
  "5": ["implement", "debug", "review", "refactor", "test", "decompose"],
  "6": ["query", "design", "analyze", "debug", "review"],
  "7": ["design", "implement", "debug", "review", "decompose"],
  "8": ["design", "analyze", "implement", "review", "port"],
  "9": ["commands", "debug", "find_error", "design", "review", "explain"],
  // Programming Logic: language-agnostic problem solving (the manifests were written with these skills; do not run practica.mjs over area 10)
  "10": ["explain", "trace", "implement", "decompose", "debug", "test"],
};

/** Topics that need a different set than their area's (an algorithm or data structure always asks for trace + analyze). */
const OVERRIDE = {
  "10.1": ["pg_true_false", "explain", "trace", "decompose", "review", "pg_compare"],
  "10.2": ["pg_true_false", "explain", "trace", "decompose", "review", "pg_compare"],
  "1.5": ["pg_true_false", "commands", "find_error", "explain"],
  "1.46": ["trace", "implement", "analyze", "debug", "test", "pg_true_false"],
  "1.47": ["trace", "implement", "analyze", "debug", "test", "pg_true_false"],
  "1.48": ["trace", "implement", "analyze", "debug", "test", "pg_true_false"],
  "1.49": ["trace", "implement", "analyze", "debug", "test", "pg_true_false"],
  "1.50": ["pg_true_false", "pg_classify", "analyze", "trace", "explain"],
  "1.51": ["trace", "implement", "analyze", "debug", "test", "pg_compare"],
  "1.52": ["trace", "implement", "analyze", "debug", "test", "pg_compare"],
  "1.53": ["trace", "implement", "analyze", "debug", "test", "pg_compare"],
  "1.54": ["pg_true_false", "pg_compare", "implement", "analyze", "trace"],
  "1.55": ["pg_classify", "pg_compare", "implement", "analyze", "trace"],
  "1.56": ["trace", "implement", "analyze", "debug", "test", "pg_compare"],
  "1.66": ["pg_true_false", "implement", "test", "find_error", "review"],
  "6.4": ["query", "debug", "pg_true_false", "review"],
  "6.5": ["query", "analyze", "debug", "pg_true_false", "review"],
  "6.6": ["query", "analyze", "debug", "pg_compare", "review"],
};

/** The skills a topic is practised with, in the order they are offered (max 6). */
export function skillsFor(number) {
  if (OVERRIDE[number]) return OVERRIDE[number];
  const type = typeOf(number);
  const code = CODE_SKILLS[areaKey(number)] ?? CODE_SKILLS["1"];
  if (type === "theoretical") return CONCEPT_SKILLS;
  if (type === "procedural") return code.slice(0, 6);
  // mixed: one recognition skill and `explain` first, then the area's code skills
  return ["pg_true_false", "explain", ...code.filter((s) => s !== "explain").slice(0, 4)].slice(0, 6);
}
