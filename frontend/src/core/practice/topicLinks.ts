/**
 * Enlaces submeta -> tema de estudio (`topic_links` de GoalItem).
 *
 * Identificador del tema: la carpeta del tema, ruta POSIX relativa a la vault
 * (la misma que `TopicManifest.folder` y `TopicDashboardItem.folder`). Es lo
 * único estable que tiene un tema: el manifiesto (`_tema.md`, `.practica.md`)
 * no lleva id propio y el título puede repetirse entre áreas. Si la carpeta se
 * renombra o mueve, el enlace queda "roto" (se muestra y se puede reparar a
 * mano) en lugar de apuntar a otro tema.
 *
 * Cadena de un enlace (una entrada de la lista `topic_links`):
 *
 *   <carpeta>                      todas las skills del tema
 *   <carpeta>#skill1+skill2        solo esas skills
 *
 * La lista del frontmatter se separa por comas (`splitList`), así que en la
 * carpeta se escapan `%`, `,` y `#` como `%25`, `%2C` y `%23` (p. ej. un tema
 * "C#" es `Programación/C%23`). Las skills se separan por `+`.
 *
 * Este módulo es puro (sin disco): el progreso de cada tema lo aporta quien
 * llama mediante `TopicLookup`.
 */

// Se importa también desde el renderer: por eso no depende de topic.ts (que usa node:fs);
// `TopicProgress` de topic.ts cumple esta forma estructural.
export interface TopicProgressLike {
  topic: { title: string; mastery: { exam: string } };
  skills: Record<string, { mastered: boolean }>;
  examPassed: boolean;
}
type TopicProgress = TopicProgressLike;

export interface TopicLink {
  topic: string;
  /** vacío = todas las skills del tema */
  skills: string[];
}

export type TopicLookup = (folder: string) => TopicProgress | null;

export interface TopicLinkMissing {
  topic: string;
  /** skill pendiente; `exam` = examen requerido; `*` = el tema entero (roto o sin skills) */
  skill: string;
  reason: "not_mastered" | "exam" | "unknown_skill" | "broken" | "no_skills";
}

export interface TopicLinkItemProgress {
  /** cadena original del enlace */
  link: string;
  topic: string;
  title: string;
  skills: string[];
  broken: boolean;
  done: boolean;
  /** 0..100 */
  pct: number;
}

export interface TopicLinkProgress {
  /** true solo si hay enlaces y todos están cumplidos */
  done: boolean;
  /** 0..100: unidades cumplidas / unidades pedidas, entre todos los enlaces */
  pct: number;
  links: TopicLinkItemProgress[];
  missing: TopicLinkMissing[];
  /** carpetas de temas que ya no existen */
  broken: string[];
}

const SKILL_RE = /^[a-z0-9_]+$/;

function escapePath(p: string): string {
  return p.replace(/%/g, "%25").replace(/,/g, "%2C").replace(/#/g, "%23");
}

function unescapePath(p: string): string {
  return p.replace(/%2C/gi, ",").replace(/%23/g, "#").replace(/%25/g, "%");
}

export function parseTopicLink(raw: unknown): TopicLink | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const hash = text.indexOf("#");
  const pathPart = hash === -1 ? text : text.slice(0, hash);
  const topic = unescapePath(pathPart).replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (!topic) return null;
  const skills: string[] = [];
  if (hash !== -1) {
    for (const s of text.slice(hash + 1).split("+")) {
      const sk = s.trim().toLowerCase();
      if (sk && SKILL_RE.test(sk) && !skills.includes(sk)) skills.push(sk);
    }
  }
  return { topic, skills };
}

export function formatTopicLink(link: TopicLink): string {
  const skills = [...new Set(link.skills.map((s) => s.trim().toLowerCase()).filter((s) => SKILL_RE.test(s)))];
  const base = escapePath(link.topic.replace(/\\/g, "/").replace(/^\/+|\/+$/g, ""));
  return skills.length ? `${base}#${skills.join("+")}` : base;
}

/** Cadenas válidas, normalizadas y sin repetidos (misma carpeta + mismas skills). */
export function normalizeTopicLinks(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : String(raw ?? "").split(",");
  const out: string[] = [];
  for (const entry of list) {
    const parsed = parseTopicLink(entry);
    if (!parsed) continue;
    const s = formatTopicLink(parsed);
    if (!out.includes(s)) out.push(s);
  }
  return out;
}

/**
 * Cumplimiento de una lista de enlaces. Cada enlace aporta "unidades":
 * una por skill pedida (cumplida si la skill está dominada) y, si el enlace
 * es del tema entero y el tema exige examen (`mastery.exam === "required"`),
 * una más por el examen aprobado. Un enlace acotado a skills no exige examen:
 * el examen es del tema, no de una skill. Un tema ausente es un enlace roto:
 * cuenta como una unidad sin cumplir y nunca lanza.
 */
export function topicLinkProgress(links: readonly string[], lookup: TopicLookup): TopicLinkProgress {
  const items: TopicLinkItemProgress[] = [];
  const missing: TopicLinkMissing[] = [];
  const broken: string[] = [];
  let units = 0;
  let doneUnits = 0;

  for (const raw of links) {
    const parsed = parseTopicLink(raw);
    if (!parsed) continue;
    const { topic, skills } = parsed;
    const prog = lookup(topic);

    if (!prog) {
      broken.push(topic);
      missing.push({ topic, skill: "*", reason: "broken" });
      units += 1;
      items.push({ link: String(raw), topic, title: topic.split("/").pop() ?? topic, skills, broken: true, done: false, pct: 0 });
      continue;
    }

    const wanted = skills.length ? skills : Object.keys(prog.skills);
    let linkUnits = 0;
    let linkDone = 0;
    for (const sk of wanted) {
      linkUnits += 1;
      const sp = prog.skills[sk];
      if (!sp) {
        missing.push({ topic, skill: sk, reason: "unknown_skill" });
      } else if (sp.mastered) {
        linkDone += 1;
      } else {
        missing.push({ topic, skill: sk, reason: "not_mastered" });
      }
    }
    if (!skills.length) {
      if (wanted.length === 0) {
        // Un tema sin skills (p. ej. inglés sin clasificar) no se puede dar por hecho.
        linkUnits += 1;
        missing.push({ topic, skill: "*", reason: "no_skills" });
      }
      if (prog.topic.mastery.exam === "required") {
        linkUnits += 1;
        if (prog.examPassed) linkDone += 1;
        else missing.push({ topic, skill: "exam", reason: "exam" });
      }
    }

    units += linkUnits;
    doneUnits += linkDone;
    items.push({
      link: String(raw),
      topic,
      title: prog.topic.title,
      skills,
      broken: false,
      done: linkUnits > 0 && linkDone === linkUnits,
      pct: linkUnits ? Math.round((linkDone / linkUnits) * 100) : 0,
    });
  }

  return {
    done: items.length > 0 && items.every((i) => i.done),
    pct: units ? Math.round((doneUnits / units) * 100) : 0,
    links: items,
    missing,
    broken,
  };
}
