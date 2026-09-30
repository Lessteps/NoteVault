/**
 * Transcripts the learner pastes (or has as plain text): a subtitle file's content (SRT / VTT, with times) or plain
 * text (no times). Plain text still practises well: it is split into sentences, and the app's voice reads them when
 * there is no audio file (or the audio cannot be aligned yet).
 */

export type TranscriptFormat = "srt" | "vtt" | "plain";

export interface SentenceCue {
  start: number;
  end: number;
  en: string;
}

/** Whether pasted text is a subtitle file (has times) or plain text. */
export function detectTranscriptFormat(text: string): TranscriptFormat {
  const head = text.trimStart();
  if (/^WEBVTT/i.test(head)) return "vtt";
  return /\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}\s*-->\s*\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}/.test(text) ? "srt" : "plain";
}

/** Timed transcripts are subtitle files by extension; anything else is plain text. */
export const isTimedFile = (file: string): boolean => /\.(srt|vtt)$/i.test(file);

/** Plain transcript text cleaned up: no speaker-only lines like «Rob:» are removed, only blank runs and stray spaces. */
export function cleanPlainTranscript(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Sentences of a plain transcript (a sentence ends at . ! ? followed by a space or a new line; short leftovers join the previous one). */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  for (const block of cleanPlainTranscript(text).split(/\n+/)) {
    for (const raw of block.split(/(?<=[.!?…])["')\]]*\s+/)) {
      const s = raw.replace(/\s+/g, " ").trim();
      if (!s) continue;
      if (s.split(" ").length < 3 && out.length) out[out.length - 1] += ` ${s}`;
      else out.push(s);
    }
  }
  return out;
}

/** Cues with made-up times (4 s apiece) so plain text can go through the same session builder as a timed transcript. */
export function sentenceCues(text: string): SentenceCue[] {
  return splitSentences(text).map((en, i) => ({ start: i * 4000, end: i * 4000 + 3500, en }));
}

/** What to write to disk for a pasted transcript: the content and the extension. */
export function pastedTranscriptFile(text: string, title: string): { ext: "srt" | "vtt" | "md"; content: string } {
  const fmt = detectTranscriptFormat(text);
  if (fmt === "srt") return { ext: "srt", content: text.replace(/\r\n?/g, "\n").trim() + "\n" };
  if (fmt === "vtt") return { ext: "vtt", content: text.replace(/\r\n?/g, "\n").trim() + "\n" };
  return { ext: "md", content: `---\ntitle: "${title.replace(/"/g, "'")}"\ntype: transcript\nsubject: english\n---\n\n# ${title}\n\n${cleanPlainTranscript(text)}\n` };
}

/** The text of a plain transcript file written by `pastedTranscriptFile` (front matter and title removed). */
export function plainTextOfNote(content: string): string {
  return content.replace(/^---\n[\s\S]*?\n---\n/, "").replace(/^\s*# .*\n/, "").trim();
}
