// Ported from notevault_app/webapp/modules/english_player.py
// Reproductor de inglés: the learner's own films/audio with dual subtitles and
// sentence mining. The renderer never sees disk paths: each media file gets an
// opaque id and is streamed by the local MediaServer.

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  formatTimestamp,
  isMediaFile,
  mediaLink,
  vaultRelative,
} from "../../core/english/mediaLinks.js";
import { CEFR_LEVELS, MiningError, writeMinedNote } from "../../core/english/mining.js";
import { isTimedFile, pastedTranscriptFile, plainTextOfNote, sentenceCues } from "../../core/english/transcripts.js";
import { cleanCueText, NO_SUBTITLES_MESSAGE, pickDictationClip, pickPodcastClip } from "../../core/english/dictation.js";
import { absolutePath, addSource, getSource, listSources, removeSource, setTranscript, SOURCE_KIND_LABELS, SOURCE_KINDS } from "../../core/english/sources.js";
import { EnglishVocabularyManager } from "../../core/englishVocabularyManager.js";
import { formatEnglishExerciseNote } from "../../core/practice/englishExercises.js";
import { createDefaultTopicManifest, parseTopicManifest } from "../../core/practice/topic.js";
import { practiceFileText, viewFileName } from "../../core/practice/viewFiles.js";
import { englishSpaceFolder } from "./study.js";
import { isIsoDate } from "../../core/practice/reviewSchedule.js";
import {
  SUBTITLE_EXTS,
  findSiblingSubtitles,
  loadSubtitles,
  pairTracks,
  type SentencePair,
} from "../../core/english/subtitles.js";
import { ApiError } from "../../core/errors.js";
import type { AppState } from "../appState.js";
import { MediaServer } from "../media.js";

/** What each kind of exercise made from the player asks for. */
const PLAYER_EXERCISES: Record<string, { skill: string; title: string; topic: RegExp; assistance: "no_help" | "helper"; statement: string; rubric: string[] }> = {
  dictation: {
    skill: "ls_dictation", title: "Dictado", topic: /^4[.][0-9]+ Shadowing/, assistance: "no_help",
    statement: "Escucha el fragmento (todas las veces que quieras) y escribe **exactamente** lo que oigas, con su puntuación.",
    rubric: ["Todas las palabras están y ninguna sobra", "Ortografía correcta", "Contracciones y terminaciones (-s, -ed) bien oídas"],
  },
  shadowing: {
    skill: "ls_shadowing", title: "Shadowing", topic: /^4[.][0-9]+ Shadowing/, assistance: "helper",
    statement: "Escucha la frase y **repítela en voz alta casi a la vez** (shadowing), imitando los sonidos, el ritmo y la entonación. Después escribe la frase tal como la dijiste y anota qué palabras o sonidos **no pudiste replicar** y por qué (formas débiles, acento, enlaces).",
    rubric: ["La frase escrita coincide con la original", "Nombra palabras o sonidos concretos que no pudo replicar", "Explica la causa (reducción, acento, enlace, velocidad)"],
  },
  podcast: {
    skill: "ls_podcast", title: "Podcast", topic: /^4[.][0-9]+ Podcasts/, assistance: "helper",
    statement: "Escucha el fragmento (las veces que quieras) y escribe: **(a)** de qué trata (idea general), **(b)** dos detalles concretos (cifras, nombres, razones) y **(c)** un resumen de dos frases con tus palabras.",
    rubric: ["La idea general es correcta", "Los dos detalles son exactos", "El resumen es breve, completo y con palabras propias"],
  },
};

const FOLDERS = { transcripts: "Transcripciones", recordings: "Grabaciones" };
const KIND_FOLDER: Record<string, string> = { podcast: "Podcasts", movie: "Películas", ted: "TED" };

/** A file name that is safe on every system. */
function safeFileName(name: string): string {
  const forbidden = "\\/:*?\"<>|";
  return name.split("").map((c) => (c.charCodeAt(0) < 32 || forbidden.includes(c) ? " " : c)).join("").split(/\s+/).filter(Boolean).join(" ").slice(0, 100) || "archivo";
}

/** `dir/name`, or `dir/name (2)`… when it exists. */
function uniqueFile(dir: string, name: string): string {
  const { name: base, ext } = path.parse(name);
  let candidate = path.join(dir, name);
  for (let i = 2; fs.existsSync(candidate); i++) candidate = path.join(dir, `${base} (${i})${ext}`);
  return candidate;
}

const MAX_MEDIA = 32;
const MAX_SUB_BYTES = 5 * 1024 * 1024;

interface Entry {
  path: string;
  en: string | null;
  es: string | null;
}

function toFloat(v: unknown): number {
  const f = Number(v);
  if (!Number.isFinite(f)) return 0;
  return Math.max(0, Math.min(f, 1e7));
}

export function englishPlayerApi(app: AppState) {
  const reg = new Map<string, Entry>();
  let media: MediaServer | null = null;

  const server = (): MediaServer => (media ??= new MediaServer());

  const entryOf = (mediaId: string): Entry => {
    const e = reg.get(String(mediaId));
    if (e === undefined) throw new ApiError("Ese archivo ya no está abierto en el reproductor.");
    return e;
  };

  const pairsOf = (entry: Entry): Record<string, unknown> => {
    const read = (p: string | null): ReturnType<typeof loadSubtitles> => {
      if (p === null) return [];
      if (fs.statSync(p).size > MAX_SUB_BYTES) {
        throw new ApiError("El archivo de subtítulos es demasiado grande.");
      }
      return loadSubtitles(p);
    };
    const en = read(entry.en);
    const es = read(entry.es);
    const [primary, secondary] = en.length ? [en, es] : [es, []];
    let pairs: SentencePair[] = pairTracks(primary, secondary);
    if (!en.length && es.length) {
      pairs = pairs.map((p) => ({ start: p.start, end: p.end, en: "", es: p.en }));
    }
    return {
      pairs: pairs.map((p) => ({ start: p.start, end: p.end, en: p.en, es: p.es })),
      en_file: entry.en ? path.basename(entry.en) : "",
      es_file: entry.es ? path.basename(entry.es) : "",
    };
  };

  const load = async (p: string, seconds = 0, transcript?: string): Promise<Record<string, unknown>> => {
    if (!fs.existsSync(p) || !fs.statSync(p).isFile() || !isMediaFile(p)) {
      throw new ApiError("Eso no es un archivo de audio o video.");
    }
    let mid: string | null = null;
    for (const [k, e] of reg) {
      if (e.path === p) {
        mid = k;
        break;
      }
    }
    if (mid === null) {
      if (reg.size >= MAX_MEDIA) {
        const first = reg.keys().next().value;
        if (first !== undefined) reg.delete(first);
      }
      mid = crypto.randomBytes(8).toString("hex");
      const [en, es] = findSiblingSubtitles(p);
      reg.set(mid!, { path: p, en, es });
    }
    const entry = reg.get(mid!)!;
    if (transcript) entry.en = transcript;
    return {
      id: mid,
      url: await server().urlFor(p),
      name: path.basename(p),
      seconds: Math.max(0, toFloat(seconds)),
      ...pairsOf(entry),
    };
  };

  const dialog = (filters: { name: string; extensions: string[] }[]): string | null => {
    if (app.window === null) {
      throw new ApiError("Elegir archivos solo está disponible en la app de escritorio.");
    }
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const electron = require("electron") as {
      dialog: { showOpenDialogSync(opts: unknown): string[] | undefined };
    };
    const chosen = electron.dialog.showOpenDialogSync({ properties: ["openFile"], filters });
    if (!chosen || !chosen.length) return null;
    return chosen[0]!;
  };

  /** The folder of the learner's library inside the English space (created on use). */
  const fuentesRoot = (): string => `${englishSpaceFolder(app) ?? "Inglés"}/Fuentes`;

  /** Copies a file into `Fuentes/<sub>/` (never over another file) and returns the copy's path. A file already there is kept. */
  const intoFuentes = (src: string, sub: string): string => {
    const dir = path.join(app.root, ...fuentesRoot().split("/"), sub);
    fs.mkdirSync(dir, { recursive: true });
    if (path.resolve(path.dirname(src)) === path.resolve(dir)) return src;
    const dest = uniqueFile(dir, safeFileName(path.parse(src).name) + path.extname(src).toLowerCase());
    fs.copyFileSync(src, dest);
    return dest;
  };

  const recordingPath = (id: string): string => {
    const name = path.basename(String(id ?? ""));
    const file = path.join(app.root, ...fuentesRoot().split("/"), FOLDERS.recordings, name);
    if (!name || !fs.existsSync(file)) throw new ApiError("Esa grabación ya no existe.");
    return file;
  };

  const openSourceById = async (id: string, seconds = 0): Promise<Record<string, unknown>> => {
    const s = getSource(app.root, id);
    if (!s) throw new ApiError("Esa fuente ya no existe.");
    if (!s.media) throw new ApiError(`«${s.title}» solo tiene transcripción, no hay audio que reproducir.`);
    const media = absolutePath(app.root, s.media);
    if (!fs.existsSync(media)) throw new ApiError(`No encuentro el archivo de «${s.title}». Quizá lo moviste: vuelve a añadir la fuente.`);
    const transcript = s.transcript ? absolutePath(app.root, s.transcript) : "";
    const timed = transcript !== "" && isTimedFile(transcript) && fs.existsSync(transcript);
    // A plain-text transcript has no times: it is offered as text, not as subtitles.
    const plain = transcript && !timed && fs.existsSync(transcript) ? plainTextOfNote(fs.readFileSync(transcript, "utf-8")) : "";
    return { ...(await load(media, toFloat(seconds), timed ? transcript : undefined)), ok: true, source: { id: s.id, kind: s.kind, title: s.title, added: s.added }, plain };
  };

  /** The English cues of a media entry (empty when it has no English subtitles or they cannot be read). */
  const cuesOf = (entry: Entry): Array<{ start: number; end: number; en: string }> => {
    try {
      return (pairsOf(entry).pairs as Array<{ start: number; end: number; en: string }>) ?? [];
    } catch {
      return [];
    }
  };

  /**
   * Writes one listening exercise for `clip` in the topic that trains its skill (4.5 Shadowing, 4.4 Podcasts; a vault
   * without it gets a topic collecting the player's exercises). `sourceId` ties it to a library source, so the audio
   * can be played even when the file lives outside the vault. Never throws for missing pieces: it answers `{ ok: false }`.
   */
  const createListeningExercise = (entry: Entry | null, clip: { text: string; start: number; end: number }, kind: string, sourceId: string): Record<string, unknown> => {
    const spec = PLAYER_EXERCISES[kind] ?? PLAYER_EXERCISES.dictation!;
    const space = englishSpaceFolder(app);
    if (!space) return { ok: false, reason: "no_space", message: "Todavía no hay un espacio de inglés: genera uno primero y vuelve a intentarlo." };
    const branchDir = path.join(app.root, space, "4 Escucha");
    const found = fs.existsSync(branchDir)
      ? fs.readdirSync(branchDir, { withFileTypes: true }).find((d) => d.isDirectory() && spec.topic.test(d.name))?.name
      : undefined;
    const topicName = found ?? "Dictados del reproductor";
    const topicRel = `${space}/4 Escucha/${topicName}`;
    const topicAbs = path.join(app.root, ...topicRel.split("/"));
    fs.mkdirSync(topicAbs, { recursive: true });
    let manifest = createDefaultTopicManifest(topicRel, topicName, "english", []);
    const practica = path.join(topicAbs, viewFileName(topicName, "practica"));
    if (!fs.existsSync(practica)) fs.writeFileSync(practica, practiceFileText(manifest), "utf-8");
    // The topic's own level (its `level:`) decides the CEFR of the exercise.
    manifest = parseTopicManifest(fs.readFileSync(practica, "utf-8"), topicName) ?? manifest;

    let media = "";
    try {
      media = entry ? vaultRelative(entry.path, app.root) : "";
    } catch {
      media = ""; // outside the vault: a library source plays it by id, otherwise the app's voice reads the subtitle
    }
    let note = formatEnglishExerciseNote(manifest, spec.skill, 2, spec.assistance, {
      title: `${spec.title}: ${clip.text.split(" ").slice(0, 6).join(" ")}…`,
      statement: spec.statement,
      hints: [],
      solution: clip.text,
      rubric: spec.rubric,
      audio_text: clip.text,
    });
    const fields = [
      media && !sourceId ? `media: "${media.replace(/"/g, '\\"')}"` : "",
      sourceId ? `source: ${sourceId}` : "",
      media || sourceId ? `media_start: ${clip.start.toFixed(2)}` : "",
      media || sourceId ? `media_end: ${clip.end.toFixed(2)}` : "",
    ].filter(Boolean);
    if (fields.length) note = note.replace("\ntopic:", `\n${fields.join("\n")}\ntopic:`);
    const dir = path.join(topicAbs, "Ejercicios", spec.skill);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `ej_${spec.skill}_d2_${Date.now()}_${Math.random().toString(36).slice(2, 6)}_player.md`);
    fs.writeFileSync(file, note, "utf-8");
    return { ok: true, path: app.rel(file).replace(/\\/g, "/"), text: clip.text, from_media: Boolean(media || sourceId) };
  };

  return {
    async en_player_pick(): Promise<Record<string, unknown>> {
      const p = dialog([
        {
          name: "Audio y video",
          extensions: ["mp4", "mkv", "webm", "mov", "avi", "m4v", "mp3", "m4a", "wav", "ogg", "flac", "opus"],
        },
        { name: "Todos los archivos", extensions: ["*"] },
      ]);
      if (p === null) return { ok: false };
      return { ...(await load(p)), ok: true };
    },

    async en_player_open(file: string, seconds = 0): Promise<Record<string, unknown>> {
      const rel = String(file || "").replace(/\\/g, "/").trim();
      if (rel.startsWith("/") || (rel.length > 1 && rel[1] === ":")) {
        throw new ApiError("Los enlaces de medios solo abren archivos del vault.");
      }
      return { ...(await load(app.resolve(rel), toFloat(seconds))), ok: true };
    },

    en_player_subtitles(mediaId: string, track: string): Record<string, unknown> {
      if (track !== "en" && track !== "es") throw new ApiError("Pista inválida.");
      const p = dialog([{ name: "Subtítulos", extensions: ["srt", "vtt"] }]);
      if (p === null) return { ok: false };
      if (!SUBTITLE_EXTS.includes(path.extname(p).toLowerCase())) {
        throw new ApiError("Elige un archivo .srt o .vtt.");
      }
      const entry = entryOf(mediaId);
      entry[track] = p;
      try {
        return { ...pairsOf(entry), ok: true };
      } catch (e) {
        if (e instanceof ApiError) throw e;
        throw new ApiError(`No se pudieron leer los subtítulos: ${e instanceof Error ? e.message : String(e)}`);
      }
    },

    /** Adds a word to the shared word bank, optionally scheduling its first review (what "add to the calendar" does). */
    en_vocab_add(word: string, meaning = "", level = "B1", nextReview = ""): Record<string, unknown> {
      const w = String(word ?? "").trim().slice(0, 80);
      if (!w) throw new ApiError("Escribe la palabra.");
      const lvl = String(level || "B1").toUpperCase();
      if (!CEFR_LEVELS.includes(lvl)) throw new ApiError("Nivel inválido.");
      const when = String(nextReview ?? "").trim();
      if (when && !isIsoDate(when)) throw new ApiError("La fecha no es válida.");
      const item = new EnglishVocabularyManager(app.root).addWord(w, String(meaning ?? "").trim().slice(0, 300), { level: lvl, next_review: when });
      return { ok: true, id: item.id, word: item.word, next_review: item.next_review };
    },

    /**
     * A listening exercise from what is being played, in the listening branch, with that stretch of the media as its audio:
     * a dictation (`ls_dictation`, one sentence), shadowing (`ls_shadowing`, one sentence to repeat) or a podcast
     * comprehension (`ls_podcast`, about 45 seconds). It goes to the topic that trains it (4.5 Shadowing, 4.4 Podcasts).
     * With no English subtitles (or no English space) it answers `{ ok: false, message }`, never an error.
     */
    en_player_dictation(mediaId: string, seconds = 0, kind = "dictation"): Record<string, unknown> {
      const entry = entryOf(mediaId);
      const clip = (kind === "podcast" ? pickPodcastClip : pickDictationClip)(cuesOf(entry), toFloat(seconds) * 1000);
      if (!clip) return { ok: false, reason: "no_subtitles", message: NO_SUBTITLES_MESSAGE };
      return createListeningExercise(entry, clip, kind, "");
    },

    /** The learner's library: podcasts, films and TED talks with their transcripts. */
    en_source_list(): Record<string, unknown> {
      const items = listSources(app.root).map((s) => {
        const transcriptAbs = s.transcript ? absolutePath(app.root, s.transcript) : "";
        return {
          ...s,
          has_media: Boolean(s.media) && fs.existsSync(absolutePath(app.root, s.media)),
          has_transcript: Boolean(transcriptAbs) && fs.existsSync(transcriptAbs),
          // a transcript with times can be followed in the player; plain text is read sentence by sentence
          timed: Boolean(transcriptAbs) && isTimedFile(transcriptAbs),
        };
      });
      return { items, kinds: SOURCE_KINDS.map((k) => ({ id: k, label: SOURCE_KIND_LABELS[k] })), folder: `${fuentesRoot()}` };
    },

    /**
     * Adds a source: the app asks for the audio/video file and, optionally, its subtitle file. With `copy` (the default)
     * the files are copied into the space's `Fuentes/` folder, so the library lives inside the vault and never breaks
     * when the original moves; without it they stay where they are.
     */
    en_source_add(kind: string, title = "", withTranscript = true, copy = true): Record<string, unknown> {
      const picked = dialog([
        { name: "Audio y video", extensions: ["mp4", "mkv", "webm", "mov", "avi", "m4v", "mp3", "m4a", "wav", "ogg", "flac", "opus"] },
        { name: "Todos los archivos", extensions: ["*"] },
      ]);
      if (picked === null) return { ok: false };
      if (!isMediaFile(picked)) throw new ApiError("Eso no es un archivo de audio o video.");
      let transcript = "";
      if (withTranscript) {
        transcript = findSiblingSubtitles(picked)[0] ?? dialog([{ name: "Subtítulos o transcripción (con tiempos)", extensions: ["srt", "vtt"] }]) ?? "";
      }
      const k = SOURCE_KINDS.includes(kind as never) ? kind : "podcast";
      const media = copy ? intoFuentes(picked, KIND_FOLDER[k]!) : picked;
      const kept = transcript && copy ? intoFuentes(transcript, FOLDERS.transcripts) : transcript;
      const source = addSource(app.root, { kind: k, title, media, transcript: kept });
      return { ok: true, source };
    },

    /**
     * A transcript pasted as text: with times (SRT / VTT) or plain. It is saved as a file in `Fuentes/Transcripciones/`.
     * With `attachTo` it becomes the transcript of that source; without, it makes a new source with no audio file
     * (the app's voice reads it), so a transcript alone is enough to practise.
     */
    en_source_paste(kind: string, title: string, text: string, attachTo = ""): Record<string, unknown> {
      const body = String(text ?? "");
      if (body.trim().length < 20) throw new ApiError("Pega la transcripción completa (o al menos unas frases).");
      if (body.length > 2_000_000) throw new ApiError("La transcripción es demasiado grande.");
      const existing = attachTo ? getSource(app.root, attachTo) : null;
      if (attachTo && !existing) throw new ApiError("Esa fuente ya no existe.");
      const name = (title.trim() || existing?.title || "Transcripción").slice(0, 100);
      const { ext, content } = pastedTranscriptFile(body, name);
      const dir = path.join(app.root, ...fuentesRoot().split("/"), FOLDERS.transcripts);
      fs.mkdirSync(dir, { recursive: true });
      const file = uniqueFile(dir, `${safeFileName(name)}.${ext}`);
      fs.writeFileSync(file, content, "utf-8");
      if (existing) return { ok: true, source: setTranscript(app.root, existing.id, file), timed: ext !== "md" };
      const k = SOURCE_KINDS.includes(kind as never) ? kind : "podcast";
      return { ok: true, source: addSource(app.root, { kind: k, title: name, media: "", transcript: file }), timed: ext !== "md" };
    },

    /** Sets the transcript of a source from a subtitle file the learner picks. */
    en_source_transcript(id: string): Record<string, unknown> {
      if (!getSource(app.root, id)) throw new ApiError("Esa fuente ya no existe.");
      const p = dialog([{ name: "Subtítulos o transcripción (con tiempos)", extensions: ["srt", "vtt"] }]);
      if (p === null) return { ok: false };
      if (!SUBTITLE_EXTS.includes(path.extname(p).toLowerCase())) throw new ApiError("Elige un archivo .srt o .vtt.");
      return { ok: true, source: setTranscript(app.root, id, intoFuentes(p, FOLDERS.transcripts)) };
    },

    en_source_remove(id: string): Record<string, unknown> {
      return { ok: removeSource(app.root, id) };
    },

    /** Opens a source in the player with its transcript as the English subtitles. */
    async en_source_open(id: string, seconds = 0): Promise<Record<string, unknown>> {
      return openSourceById(id, seconds);
    },

    /**
     * A practice session made from a source: `count` exercises spread along the text, every one compared with the
     * transcript (dictation and shadowing are one sentence; podcast is ~45 s). No AI is used to build them. With a
     * timed transcript and the audio file the audio is the original; otherwise (plain text, or no audio file) the
     * app's voice reads the sentence.
     */
    async en_source_session(id: string, kind = "dictation", count = 5): Promise<Record<string, unknown>> {
      const s = getSource(app.root, id);
      if (!s) throw new ApiError("Esa fuente ya no existe.");
      if (!s.transcript) return { ok: false, reason: "no_subtitles", message: "Esta fuente todavía no tiene transcripción. Pega el texto o añade un .srt o .vtt y vuelve a intentarlo." };
      const transcriptAbs = absolutePath(app.root, s.transcript);
      if (!fs.existsSync(transcriptAbs)) return { ok: false, reason: "no_subtitles", message: "No encuentro el archivo de la transcripción." };
      const mediaAbs = s.media ? absolutePath(app.root, s.media) : "";
      const timed = isTimedFile(transcriptAbs);
      const withAudio = timed && Boolean(mediaAbs) && fs.existsSync(mediaAbs);
      let entry: Entry | null = null;
      let cues: Array<{ start: number; end: number; en: string }>;
      if (withAudio) {
        const opened = (await openSourceById(id, 0)) as { id: string };
        entry = entryOf(opened.id);
        cues = cuesOf(entry);
      } else if (timed) {
        cues = cuesOf({ path: "", en: transcriptAbs, es: null });
      } else {
        cues = sentenceCues(plainTextOfNote(fs.readFileSync(transcriptAbs, "utf-8")));
      }
      const want = Math.max(1, Math.min(10, Math.trunc(Number(count)) || 5));
      const usable = cues
        .map((c) => ({ ...c, text: cleanCueText(c.en) }))
        .filter((c) => c.text.split(" ").length >= 5 && c.text.length <= 220)
        .sort((a, b) => a.start - b.start);
      if (!usable.length) return { ok: false, reason: "no_subtitles", message: NO_SUBTITLES_MESSAGE };
      const step = usable.length / Math.min(want, usable.length);
      const paths: string[] = [];
      for (let i = 0; i < Math.min(want, usable.length); i++) {
        const c = usable[Math.floor(i * step)]!;
        const clip = kind === "podcast" ? pickPodcastClip(cues, c.start) : { text: c.text, start: Math.max(0, c.start / 1000 - 0.3), end: c.end / 1000 + 0.3 };
        if (!clip) continue;
        const made = createListeningExercise(entry, clip, kind, withAudio ? s.id : "");
        if (!made.ok) return made;
        paths.push(String(made.path));
      }
      return { ok: true, paths, first: paths[0] ?? "", count: paths.length, audio: withAudio ? "original" : "voz" };
    },

    /** Voice recordings the learner makes with the app (kept in `Fuentes/Grabaciones/`). */
    en_recording_save(name: string, data: string, ext = "webm"): Record<string, unknown> {
      const bytes = Buffer.from(String(data ?? ""), "base64");
      if (bytes.length < 200) throw new ApiError("La grabación está vacía.");
      if (bytes.length > 200 * 1024 * 1024) throw new ApiError("La grabación es demasiado grande.");
      const e = ["webm", "ogg", "wav", "m4a", "mp3"].includes(ext) ? ext : "webm";
      const dir = path.join(app.root, ...fuentesRoot().split("/"), FOLDERS.recordings);
      fs.mkdirSync(dir, { recursive: true });
      const stamp = new Date().toISOString().slice(0, 16).replace("T", " ").replace(":", "-");
      const base = safeFileName(String(name ?? "").trim() || "Grabación");
      const file = uniqueFile(dir, `${stamp} ${base}.${e}`);
      fs.writeFileSync(file, bytes);
      return { ok: true, id: path.basename(file), size: bytes.length };
    },

    async en_recording_list(): Promise<Record<string, unknown>> {
      const dir = path.join(app.root, ...fuentesRoot().split("/"), FOLDERS.recordings);
      if (!fs.existsSync(dir)) return { items: [] };
      const items = fs
        .readdirSync(dir)
        .filter((n) => /\.(webm|ogg|wav|m4a|mp3)$/i.test(n))
        .map((n) => ({ id: n, name: n.replace(/\.[^.]+$/, ""), size: fs.statSync(path.join(dir, n)).size, modified: fs.statSync(path.join(dir, n)).mtimeMs }))
        .sort((a, b) => b.modified - a.modified);
      return { items };
    },

    /** The URL that plays a recording (registered on demand: the page never sees the disk path). */
    async en_recording_url(id: string): Promise<Record<string, unknown>> {
      const file = recordingPath(id);
      return { url: await server().urlFor(file) };
    },

    en_recording_rename(id: string, name: string): Record<string, unknown> {
      const file = recordingPath(id);
      const next = uniqueFile(path.dirname(file), `${safeFileName(String(name ?? "").trim() || "Grabación")}${path.extname(file)}`);
      fs.renameSync(file, next);
      return { ok: true, id: path.basename(next) };
    },

    en_recording_remove(id: string): Record<string, unknown> {
      const file = recordingPath(id);
      fs.rmSync(file);
      return { ok: true };
    },

    en_player_link(mediaId: string, seconds: number): Record<string, unknown> {
      const entry = entryOf(mediaId);
      return { link: mediaLink(vaultRelative(entry.path, app.root), toFloat(seconds)) };
    },

    en_player_mine(mediaId: string, fields: unknown): Record<string, unknown> {
      if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
        throw new ApiError("Datos inválidos.");
      }
      const f = fields as Record<string, unknown>;
      const level = String(f.level || "B1").toUpperCase();
      if (!CEFR_LEVELS.includes(level)) throw new ApiError("Nivel inválido.");
      const entry = entryOf(mediaId);
      try {
        const p = writeMinedNote(app.root, String(f.sentence || "").slice(0, 1000), {
          media_rel: vaultRelative(entry.path, app.root),
          seconds: toFloat(f.seconds),
          mode: f.mode === "cloze" ? "cloze" : "translate",
          target: String(f.target || "").slice(0, 200),
          level,
          reference_es: String(f.reference_es || "").slice(0, 1000),
        });
        return { path: app.rel(p), stamp: formatTimestamp(toFloat(f.seconds)) };
      } catch (e) {
        if (e instanceof MiningError) throw new ApiError(e.message);
        throw e;
      }
    },
  };
}
