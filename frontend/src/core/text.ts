// Text helpers used across the ported core.

/** Accent/diacritic folding for case-insensitive, accent-insensitive matching.
 * Mirrors Python's unicodedata.normalize("NFKD").encode("ascii","ignore") plus
 * lower() + whitespace collapse used by _fold()/_norm() in the Python core. */
export function fold(text: string): string {
  return (text ?? "")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
}

/** Python str.strip(chars): remove any of the given characters from both ends. */
export function stripChars(s: string, chars: string): string {
  let start = 0;
  let end = s.length;
  while (start < end && chars.includes(s[start]!)) start++;
  while (end > start && chars.includes(s[end - 1]!)) end--;
  return s.slice(start, end);
}

/** Python str.split() with no argument: split on any whitespace, drop empties. */
export function splitWhitespace(s: string): string[] {
  return (s ?? "").trim().split(/\s+/).filter(Boolean);
}
