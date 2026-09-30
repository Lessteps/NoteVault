// Typed maths for the drawing pad: what you would write in a chat becomes LaTeX.
// `5/5` → a fraction, `(a+b)/(c-d)` → a fraction of groups, `sqrt(x)` → a root,
// `*` → a centred dot, `<=` `>=` `!=` → the real symbols. Anything already written
// in LaTeX (a backslash) is left alone.

const OPERAND = String.raw`(\([^()]*\)|[A-Za-z0-9.]+(?:\^\{?[A-Za-z0-9+\-]+\}?)?)`;
const FRACTION = new RegExp(`${OPERAND}\\s*\\/\\s*${OPERAND}`);

const unwrap = (s: string): string => (s.startsWith("(") && s.endsWith(")") ? s.slice(1, -1) : s);

export function textToLatex(src: string): string {
  let out = src.trim();
  if (!out || out.includes("\\")) return out;
  out = out.replace(/sqrt\(([^()]*)\)/g, (_m, inner: string) => String.raw`\sqrt{${inner}}`);
  // Innermost fractions first; repeat until nothing is left to convert.
  for (let i = 0; i < 12; i += 1) {
    const next = out.replace(FRACTION, (_m, a: string, b: string) => String.raw`\frac{${unwrap(a)}}{${unwrap(b)}}`);
    if (next === out) break;
    out = next;
  }
  return out
    .replace(/\s*<=\s*/g, String.raw` \leq `)
    .replace(/\s*>=\s*/g, String.raw` \geq `)
    .replace(/\s*!=\s*/g, String.raw` \neq `)
    .replace(/\*/g, String.raw`\cdot `)
    .replace(/\bpi\b/g, String.raw`\pi `);
}
