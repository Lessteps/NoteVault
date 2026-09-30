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
import { NO_SUBTITLES_MESSAGE, pickDictationClip, pickPodcastClip } from "../../core/english/dictation.js";
import { EnglishVocabularyManager } from "../../core/englishVocabularyManager.js";
import { formatEnglishExerciseNote } from "../../core/practice/englishExercises.js";
import { createDefaultTopicManifest } from "../../core/practice/topic.js";
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

  const load = async (p: string, seconds = 0): Promise<Record<string, unknown>> => {
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
      const spec = PLAYER_EXERCISES[kind] ?? PLAYER_EXERCISES.dictation!;
      const entry = entryOf(mediaId);
      let cues: Array<{ start: number; end: number; en: string }> = [];
      try {
        cues = (pairsOf(entry).pairs as Array<{ start: number; end: number; en: string }>) ?? [];
      } catch {
        cues = [];
      }
      const clip = (kind === "podcast" ? pickPodcastClip : pickDictationClip)(cues, toFloat(seconds) * 1000);
      if (!clip) return { ok: false, reason: "no_subtitles", message: NO_SUBTITLES_MESSAGE };
      const space = englishSpaceFolder(app);
      if (!space) return { ok: false, reason: "no_space", message: "Todavía no hay un espacio de inglés: genera uno primero y vuelve a intentarlo." };

      // The listening topic that trains this skill (4.5 Shadowing, 4.4 Podcasts); a vault without it gets one collecting the player's exercises.
      const branchDir = path.join(app.root, space, "4 Escucha");
      const found = fs.existsSync(branchDir)
        ? fs.readdirSync(branchDir, { withFileTypes: true }).find((d) => d.isDirectory() && spec.topic.test(d.name))?.name
        : undefined;
      const topicName = found ?? "Dictados del reproductor";
      const topicRel = `${space}/4 Escucha/${topicName}`;
      const topicAbs = path.join(app.root, ...topicRel.split("/"));
      fs.mkdirSync(topicAbs, { recursive: true });
      const manifest = createDefaultTopicManifest(topicRel, topicName, "english", []);
      const practica = path.join(topicAbs, viewFileName(topicName, "practica"));
      if (!fs.existsSync(practica)) fs.writeFileSync(practica, practiceFileText(manifest), "utf-8");

      let media = "";
      try {
        media = vaultRelative(entry.path, app.root);
      } catch {
        media = ""; // outside the vault: the app's voice reads the subtitle instead
      }
      let note = formatEnglishExerciseNote(manifest, spec.skill, 2, spec.assistance, {
        title: `${spec.title}: ${clip.text.split(" ").slice(0, 6).join(" ")}…`,
        statement: spec.statement,
        hints: [],
        solution: clip.text,
        rubric: spec.rubric,
        audio_text: clip.text,
      });
      if (media) {
        note = note.replace("\ntopic:", `\nmedia: "${media.replace(/"/g, '\\"')}"\nmedia_start: ${clip.start.toFixed(2)}\nmedia_end: ${clip.end.toFixed(2)}\ntopic:`);
      }
      const dir = path.join(topicAbs, "Ejercicios", spec.skill);
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `ej_${spec.skill}_d2_${Date.now()}_player.md`);
      fs.writeFileSync(file, note, "utf-8");
      return { ok: true, path: app.rel(file).replace(/\\/g, "/"), text: clip.text, from_media: Boolean(media) };
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
