// Arreglos MECÁNICOS de lo que un agente externo suele dejar mal en las notas de «Temas por crear»: no cambian el contenido, solo un valor que el contrato
// fija. Hoy: `topic_type` solo puede ser theoretical | procedural | mixed (la skill dice «no inventes un tipo reference», y aun así a veces aparece).
// Puro: sin disco.

const VALID = ["theoretical", "procedural", "mixed"];

/** Pone `topic_type: mixed` (el de los temas de referencia) en el frontmatter si trae un valor fuera de lo permitido. Solo toca el primer bloque `---`. */
export function repairTopicType(text: string): { text: string; changed: boolean } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return { text, changed: false };
  const fm = m[1]!;
  const next = fm.replace(/^topic_type:[ \t]*(.*)$/m, (line, v: string) => (VALID.includes(v.trim().replace(/^["']|["']$/g, "")) ? line : "topic_type: mixed"));
  if (next === fm) return { text, changed: false };
  return { text: text.slice(0, m.index) + text.slice(m.index).replace(fm, next), changed: true };
}
