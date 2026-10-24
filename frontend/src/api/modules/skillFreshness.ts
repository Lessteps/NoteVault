// Skills al día: detecta, SIN IA, qué piezas de un tema se hicieron con una versión anterior de su skill.
//
// Cada materia tiene su carpeta `<Materia>/_skills/` con tres skills que generan piezas de un tema:
//   · `resumen_teorico_skill.md` → la nota de teoría   `<tema>/<tema>.md`
//   · `mapa_skill.md`            → el mapa explicativo `<tema>/<tema> — mapa.canvas`
//   · `practica_skill.md`        → el manifiesto       `<tema>/<tema>.practica.md`
// Se guarda la huella (hash) de cada skill y cuándo se vio cambiar (`.notevault/estudio/skill_registry.json`). Una pieza está atrasada si su
// archivo es más viejo que ese cambio. La primera vez que se ve una skill, su fecha es la de modificación del archivo; después, el momento
// en que cambia su contenido (tocar el archivo sin cambiar el texto, p. ej. un `git checkout`, no cuenta). Regenerar la pieza la rejuvenece.

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { OutdatedSkills } from "../../lib/planTopicCatalog.js";

const SKILL_FILES = { theory: "resumen_teorico_skill.md", canvas: "mapa_skill.md", practica: "practica_skill.md" } as const;
type Kind = keyof typeof SKILL_FILES;
const KINDS = Object.keys(SKILL_FILES) as Kind[];
interface Entry { hash: string; changedAt: number }
type Registry = Record<string, Entry>;

const registryPath = (root: string): string => path.join(root, ".notevault", "estudio", "skill_registry.json");

function loadRegistry(root: string): Registry {
  try {
    const raw = JSON.parse(fs.readFileSync(registryPath(root), "utf8")) as unknown;
    return raw && typeof raw === "object" ? (raw as Registry) : {};
  } catch {
    return {};
  }
}

function saveRegistry(root: string, reg: Registry): void {
  try {
    fs.mkdirSync(path.dirname(registryPath(root)), { recursive: true });
    fs.writeFileSync(registryPath(root), JSON.stringify(reg, null, 2), "utf8");
  } catch {
    // sin permiso de escritura no se recuerdan los cambios: se sigue con la fecha del archivo
  }
}

const mtime = (abs: string): number | null => {
  try {
    return fs.statSync(abs).mtimeMs;
  } catch {
    return null;
  }
};

/** Cuándo cambió cada skill de cada materia (solo las que existen); actualiza el registro si vio un cambio. */
function skillChangeTimes(root: string, subjects: Iterable<string>): Map<string, number> {
  const reg = loadRegistry(root);
  const out = new Map<string, number>();
  let dirty = false;
  const now = Date.now();
  for (const subject of subjects) {
    for (const kind of KINDS) {
      const abs = path.join(root, subject, "_skills", SKILL_FILES[kind]);
      let text: string;
      try {
        text = fs.readFileSync(abs, "utf8");
      } catch {
        continue;
      }
      const key = `${subject}/${kind}`;
      const hash = createHash("sha1").update(text.replace(/\r\n/g, "\n")).digest("hex");
      const known = reg[key];
      if (!known) {
        reg[key] = { hash, changedAt: mtime(abs) ?? now };
        dirty = true;
      } else if (known.hash !== hash) {
        reg[key] = { hash, changedAt: now };
        dirty = true;
      }
      out.set(key, reg[key]!.changedAt);
    }
  }
  if (dirty) saveRegistry(root, reg);
  return out;
}

/** Para cada carpeta de tema (relativa a la vault), qué piezas existen pero son más viejas que su skill. Solo salen los temas con algo atrasado. */
export function outdatedByFolder(root: string, folders: Iterable<string>): Map<string, OutdatedSkills> {
  const list = [...folders];
  const subjectOf = (folder: string): string => folder.split("/")[0] ?? "";
  const times = skillChangeTimes(root, new Set(list.map(subjectOf).filter(Boolean)));
  const out = new Map<string, OutdatedSkills>();
  for (const folder of list) {
    const subject = subjectOf(folder);
    const name = folder.split("/").pop() ?? "";
    if (!subject || !name) continue;
    const pieces: Record<Kind, string> = { theory: `${name}.md`, canvas: `${name} — mapa.canvas`, practica: `${name}.practica.md` };
    const stale: OutdatedSkills = {};
    for (const kind of KINDS) {
      const changed = times.get(`${subject}/${kind}`);
      const made = mtime(path.join(root, folder, pieces[kind]));
      if (changed !== undefined && made !== null && made < changed) stale[kind] = true;
    }
    if (stale.theory || stale.canvas || stale.practica) out.set(folder, stale);
  }
  return out;
}
