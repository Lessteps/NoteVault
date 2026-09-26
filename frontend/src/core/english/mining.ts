// Ported from notevault_app/core/english/mining.py
// Sentence mining: turn a subtitle line into an English practice note.

import * as fs from "node:fs";
import * as path from "node:path";
import { formatDate } from "../dates.js";
import { formatTimestamp, mediaLink } from "./mediaLinks.js";

export const MINING_FOLDER = ["Inglés", "Minería"];
export const MINING_MODES = ["translate", "cloze"];
export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];
export const BLANK = "_____";

export class MiningError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MiningError";
  }
}

export function slugify(text: string, limit = 40): string {
  const plain = (text || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    // eslint-disable-next-line no-control-regex
    .replace(/[^\x00-\x7f]/g, "");
  const slug = plain.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+/, "").replace(/-+$/, "");
  return slug.slice(0, limit).replace(/-+$/, "") || "media";
}

function quoted(value: string): string {
  return '"' + String(value).split(/\s+/).filter(Boolean).join(" ").replace(/"/g, "'") + '"';
}

function reEscape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function blankOut(sentence: string, target: string): string {
  const t = (target || "").split(/\s+/).filter(Boolean).join(" ");
  if (!t) throw new MiningError("Escribe la palabra o expresión que quieres ocultar.");
  const pattern = new RegExp(
    "(?<!\\w)" + reEscape(t).replace(/\\ /g, "\\s+") + "(?!\\w)",
    "i",
  );
  if (!pattern.test(sentence)) throw new MiningError(`«${target}» no aparece en la frase.`);
  return sentence.replace(pattern, BLANK);
}

export function minedNoteId(mediaRel: string, seconds: number): string {
  return `en.mining.${slugify(path.parse(mediaRel).name)}.${Math.round(seconds * 1000)}`;
}

export interface MiningOptions {
  media_rel: string;
  seconds: number;
  mode?: string;
  target?: string;
  level?: string;
  reference_es?: string;
}

export function buildMinedNote(sentence: string, opts: MiningOptions): string {
  const s = (sentence || "").split(/\s+/).filter(Boolean).join(" ");
  if (!s) throw new MiningError("La frase está vacía.");
  const mode = MINING_MODES.includes(opts.mode || "") ? opts.mode! : "translate";
  const rawLevel = (opts.level || "").toUpperCase();
  const level = rawLevel && CEFR_LEVELS.includes(rawLevel) ? rawLevel : "B1";
  const link = mediaLink(opts.media_rel, opts.seconds);
  const source = path.basename(opts.media_rel);
  const title = s.length <= 70 ? s : s.slice(0, 67).replace(/\s+$/, "") + "…";
  const stamp = formatTimestamp(opts.seconds);

  const front = [
    "---",
    `id: ${minedNoteId(opts.media_rel, opts.seconds)}`,
    `title: ${quoted(title)}`,
    "subject: english",
    "type: exercise",
    "discipline: english_vocabulary",
    `mode: ${mode}`,
    `level: ${level}`,
    "difficulty: 2",
    "assistance: helper",
    `source: ${quoted(opts.media_rel)}`,
    `timestamp: ${quoted(stamp)}`,
    "status: draft",
    `created: ${formatDate(new Date(), "%Y-%m-%d")}`,
    "---",
    "",
    `# ${title}`,
    "",
    "## Enunciado",
    `Frase escuchada en ${link} de *${source}*.`,
    "",
  ];

  let hints: string[];
  let solution: string[];
  let rubric: string[];
  const target = (opts.target || "").trim();
  if (mode === "cloze") {
    const blanked = blankOut(s, opts.target || "");
    front.push(
      `> ${blanked}`,
      "",
      "Escribe la palabra o expresión que falta, tal como se dice en el video. " +
        "Después explica en una frase qué significa en este contexto.",
    );
    hints = [
      `Vuelve a escuchar el fragmento: ${link}`,
      `Empieza por «${target[0]}» y tiene ${target.length} caracteres.`,
    ];
    solution = [`**${target}** — ${s}`];
    rubric = [
      "Escribe exactamente la palabra o expresión que falta (ortografía incluida).",
      "La forma encaja en la frase (tiempo verbal, número, partícula).",
      "Explica el significado en este contexto, no solo una traducción de diccionario.",
    ];
  } else {
    front.push(
      `> ${s}`,
      "",
      "Tradúcela al español con naturalidad, como lo diría alguien en esa situación. " +
        "Después di qué palabra o estructura te costó entender al oírla.",
    );
    hints = [
      `Vuelve a escuchar el fragmento: ${link}`,
      "Traduce el sentido de la frase completa, no palabra por palabra.",
    ];
    solution = [`**Frase original:** ${s}`];
    rubric = [
      "Conserva el significado completo de la frase original.",
      "Suena natural en español (sin calcos del inglés).",
      "Respeta el registro y el tono de la escena.",
    ];
  }
  if (opts.reference_es) {
    solution.push("", `**Subtítulo en español (referencia):** ${opts.reference_es.split(/\s+/).filter(Boolean).join(" ")}`);
  }
  solution.push("", "**Traducción:** ");

  const lines = [...front, "", "## Pistas"];
  lines.push(...hints.map((h) => `- ${h}`));
  lines.push("", "## Solución", ...solution);
  lines.push("", "## Rúbrica", ...rubric.map((r) => `- [ ] (1) ${r}`));
  lines.push(
    "",
    "## Errores típicos",
    "- **vocabulary:** traducir palabra por palabra y perder el sentido idiomático.",
    "- **listening:** confundir palabras que suenan parecido en habla rápida.",
    "",
  );
  return lines.join("\n");
}

export function miningFolder(vaultRoot: string): string {
  return path.join(vaultRoot, ...MINING_FOLDER);
}

export function minedNotePath(vaultRoot: string, sentence: string, seconds: number): string {
  const folder = miningFolder(vaultRoot);
  const words = sentence.split(/\s+/).filter(Boolean).slice(0, 7).join(" ")
    .replace(/[\\/:*?"<>|\n\r\t]+/g, " ")
    .replace(/^[ .]+/, "").replace(/[ .]+$/, "");
  const base = `EN-MIN ${formatTimestamp(seconds).replace(/:/g, "-")} ${words}`
    .trim().slice(0, 90).replace(/[ .]+$/, "");
  let p = path.join(folder, `${base}.md`);
  let n = 2;
  while (fs.existsSync(p)) {
    p = path.join(folder, `${base} (${n}).md`);
    n++;
  }
  return p;
}

export function writeMinedNote(vaultRoot: string, sentence: string, opts: MiningOptions): string {
  const text = buildMinedNote(sentence, opts);
  const p = minedNotePath(vaultRoot, sentence, opts.seconds ?? 0);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text, "utf-8");
  return p;
}

export const build_mined_note = buildMinedNote;
export const write_mined_note = writeMinedNote;
export const mined_note_id = minedNoteId;
export const mined_note_path = minedNotePath;
export const mining_folder = miningFolder;
export const blank_out = blankOut;
