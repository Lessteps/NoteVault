// Notas y manifiestos de ejemplo para los tests del diseño de temas y de «Ejecutar plan» (una nota de teoría que cumple el contrato de la skill).

const FENCE = "```";
export const THEORY = (type = "mixed", o: { examples?: number; mistakes?: number; cards?: number; cardsSection?: boolean } = {}): string => {
  const ex = Array.from({ length: o.examples ?? 3 }, (_, i) => `### Example ${i + 1} — case\n- **Context:** c\n- **Case:** x\n- **Expected result:** y\n- **Why it works:** z\n`).join("\n");
  const mi = Array.from({ length: o.mistakes ?? 4 }, (_, i) => `### Mistake ${i + 1} — m\n- **Mistake:** a\n- **Symptom:** b\n- **Cause:** c\n- **Fix:** d\n`).join("\n");
  const cards = Array.from({ length: o.cards ?? 6 }, (_, i) => `### ${i + 1} · definition\n**Q:** q\n**A:** a\n`).join("\n");
  return `---\nid: x\ntitle: T\ntopic_type: ${type}\n---\n\n# 4.3 T\n\n## Requires\n*No prerequisites.*\n\n## Explanation\n\n### What it is\n${FENCE}ts\n## not a heading\n${FENCE}\n\n### Mental model\nmm\n\n## Examples\n${ex}\n## Common mistakes\n${mi}\n## Connections\nc\n${o.cardsSection === false ? "" : `\n## Cards\n${cards}`}`;
};
export const PRACTICA = (skills: string[], type = "mixed", extra = ""): string =>
  `---\ntype: practica\nsubject: programming\ntitle: T\ntopic_type: ${type}\nskills: [${skills.map((s) => `"${s}"`).join(", ")}]\nmin_per_skill: 6\ntarget_difficulty: 3\nexam: required\n${extra}---\n\n# Práctica\n`;
