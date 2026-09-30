// What a file the user pointed the chat at IS, so the assistant can switch on the vault
// skills that fit it by itself: a theory note follows the theory skill, a practice file
// the practice skill, a canvas the canvas skill (and the map skill when it is a map),
// an overview (`.resumen`) the syllabus skills. Detection uses the name, the place in
// the space (Space / Area / Topic / file) and the frontmatter `type`.

export type FileKind =
  | "theory"
  | "practice"
  | "overview"
  | "exercise"
  | "space-map"
  | "area-map"
  | "topic-map"
  | "canvas"
  | "note";

export interface FileKindInfo {
  kind: FileKind;
  /** short Spanish label for the chip and the prompt */
  label: string;
  /** `_skills/<name>.md` titles that apply, most relevant first */
  skills: string[];
}

const INFO: Record<FileKind, Omit<FileKindInfo, "kind">> = {
  theory: { label: "teoría", skills: ["resumen_teorico_skill"] },
  practice: { label: "práctica (competencias)", skills: ["practica_skill"] },
  overview: { label: "resumen del área", skills: ["temario_skill", "subtemas_skill"] },
  exercise: { label: "ejercicio", skills: ["practica_skill"] },
  "space-map": { label: "mapa del espacio", skills: ["mapa_skill", "canvas_skill"] },
  "area-map": { label: "mapa del área", skills: ["mapa_skill", "canvas_skill"] },
  "topic-map": { label: "mapa del tema", skills: ["mapa_skill", "canvas_skill"] },
  canvas: { label: "canvas", skills: ["canvas_skill"] },
  note: { label: "nota", skills: [] },
};

const frontmatterType = (raw: string): string =>
  /^---\s*\n[\s\S]*?^type:\s*["']?([\w-]+)["']?\s*$/m.exec(raw.slice(0, 2500))?.[1]?.toLowerCase() ?? "";

/** `raw` is only needed for markdown (its frontmatter); canvases are told apart by name. */
export function detectFileKind(rel: string, raw = ""): FileKindInfo {
  const path = rel.replace(/\\/g, "/");
  const name = path.split("/").pop() ?? path;
  const lower = name.toLowerCase();
  let kind: FileKind;
  if (lower.endsWith(".canvas")) {
    if (/^00 mapa de /i.test(name)) kind = "space-map";
    else if (/^00 mapa\s*[—–-]/i.test(name)) kind = "area-map";
    else if (/[—–-]\s*mapa\.canvas$/i.test(name)) kind = "topic-map";
    else kind = "canvas";
  } else if (lower.endsWith(".practica.md")) kind = "practice";
  else if (lower.endsWith(".resumen.md")) kind = "overview";
  else {
    const type = frontmatterType(raw);
    if (type === "practica") kind = "practice";
    else if (type === "resumen") kind = "overview";
    else if (type === "teorica" || type === "theory") kind = "theory";
    else if (type === "exercise") kind = "exercise";
    else kind = "note";
  }
  return { kind, ...INFO[kind] };
}
