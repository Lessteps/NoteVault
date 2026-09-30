/**
 * Dictation exercises made from the media player's subtitles: the sentence being played (and, when it is
 * very short, the next one) becomes an `ls_dictation` exercise whose audio is that very stretch of the
 * media, or the app's voice reading the subtitle when the media cannot be played from the vault.
 */

export interface Cue {
  /** milliseconds */
  start: number;
  end: number;
  en: string;
}

export interface DictationClip {
  text: string;
  /** seconds, with a little margin around the cues */
  start: number;
  end: number;
}

/** Subtitle markup and line breaks out: one clean line of text. */
export function cleanCueText(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, " ")
    .replace(/\{\\[^}]*\}/g, " ")
    .replace(/\[[^\]]*\]|\([^)]*\)/g, " ")
    .replace(/♪+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const MAX_CHARS = 220;
const SHORT = 40;

/**
 * The stretch to dictate at `ms`: the cue being played (the last one that has started), plus the next one when
 * the first is very short, as long as the whole stays a reasonable length. Cues with no English text are skipped.
 */
export function pickDictationClip(cues: readonly Cue[], ms: number): DictationClip | null {
  const usable = cues.map((c) => ({ ...c, en: cleanCueText(c.en) })).filter((c) => c.en);
  if (!usable.length) return null;
  usable.sort((a, b) => a.start - b.start);
  let i = usable.findIndex((c) => c.start > ms) - 1;
  if (i === -2) i = usable.length - 1; // past the last cue that has started
  if (i < 0) i = 0;
  const parts = [usable[i]!];
  const next = usable[i + 1];
  if (next && parts[0]!.en.length < SHORT && `${parts[0]!.en} ${next.en}`.length <= MAX_CHARS) parts.push(next);
  const text = parts.map((p) => p.en).join(" ");
  return {
    text: text.slice(0, MAX_CHARS),
    start: Math.max(0, parts[0]!.start / 1000 - 0.3),
    end: parts[parts.length - 1]!.end / 1000 + 0.3,
  };
}

/** The message shown when a dictation cannot be made (never an exception: the player keeps working). */
export const NO_SUBTITLES_MESSAGE =
  "Este video no tiene subtítulos en inglés, así que no se puede crear un dictado. Carga un archivo .srt o .vtt con el botón de subtítulos y vuelve a intentarlo.";
