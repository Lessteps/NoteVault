/**
 * Grades a dictation with no AI: the learner's text is aligned with the transcript (`textCompare`) and the result is
 * shaped like any other grade, so the attempt, the review dates and the error record work as usual.
 */

import type { GradeResult } from "../practice/grading.js";
import { classify, compareTexts, MISTAKE_LABELS, type WordOp } from "./textCompare.js";

const list = (words: string[]): string => words.slice(0, 8).map((w) => `«${w}»`).join(", ") + (words.length > 8 ? "…" : "");

export function gradeDictation(reference: string, answer: string, rubricLen: number): GradeResult {
  const cmp = compareTexts(reference, answer);
  const diffs = cmp.ops.filter((o): o is WordOp => o.kind !== "match");
  const score = cmp.score;
  const missing = cmp.ops.filter((o) => o.kind === "missing").map((o) => o.ref!);
  const extra = cmp.ops.filter((o) => o.kind === "extra").map((o) => o.got!);
  const changed = cmp.ops.filter((o) => o.kind === "wrong" || o.kind === "spelling").map((o) => `${o.got} → ${o.ref}`);

  const parts = [`Acertaste ${cmp.matched} de ${cmp.refWords} palabras (${score} %).`];
  if (missing.length) parts.push(`Te faltaron: ${list(missing)}.`);
  if (changed.length) parts.push(`Cambiaste: ${changed.slice(0, 8).join(", ")}${changed.length > 8 ? "…" : ""}.`);
  if (extra.length) parts.push(`Sobraron: ${list(extra)}.`);
  if (!diffs.length) parts.push("Sin ninguna diferencia con la transcripción.");

  const kinds = new Map<string, number>();
  for (const d of diffs) {
    const k = classify(d);
    if (k) kinds.set(k, (kinds.get(k) ?? 0) + 1);
  }
  const top = [...kinds.entries()].sort((a, b) => b[1] - a[1])[0];
  const nextStep = !diffs.length
    ? "Pasa a un fragmento más largo o a otro hablante."
    : top?.[0] === "weak_forms"
      ? "Escucha otra vez fijándote en las palabras pequeñas y las contracciones: suenan reducidas."
      : top?.[0] === "numbers"
        ? "Repasa los números y escúchalos aislados; el acento en -teen / -ty los distingue."
        : "Escucha el fragmento de nuevo, frase a frase, y compara con la transcripción antes de reintentar.";

  const rubric = Array.from({ length: rubricLen }, (_, i) => (i === 0 ? cmp.missing + cmp.extra === 0 : i === 1 ? cmp.spelling + cmp.wrong === 0 : score >= 90));
  return {
    score,
    verdict: score >= 90 ? "correct" : score >= 60 ? "partial" : "incorrect",
    rubric,
    errors: diffs.slice(0, 8).map((d) => {
      const k = classify(d)!;
      return {
        category: MISTAKE_LABELS[k],
        anchor: "",
        description: `${MISTAKE_LABELS[k]}: ${d.kind === "missing" ? `faltó «${d.ref}»` : d.kind === "extra" ? `sobró «${d.got}»` : `escribiste «${d.got}» y era «${d.ref}»`}`,
        evidence: d.got ?? "",
        fix: d.ref ? `Era «${d.ref}».` : "Quítalo.",
      };
    }),
    feedback: parts.join(" "),
    next_step: nextStep,
    example: reference.trim(),
  };
}
