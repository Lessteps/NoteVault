// Plan de traspaso para Antigravity: la ESQUEMATIZACIÓN de lo que falta por crear en la vault y los planes (documentos) para hacerlo poco a poco.
//
// Idea: el informe de ejecución dice exactamente qué falta (teoría, mapas, ejercicios por skill y dificultad). Eso puede ser enorme (miles de archivos),
// así que primero se REPARTE en paquetes pequeños y ordenados (una sesión de trabajo cada uno) y luego se escribe el documento de cada paquete
// cuando la persona lo pide. La IA, si se usa, solo ordena y nombra los paquetes; el reparto y las listas exactas son deterministas.
//
// Módulo PURO y compartido (núcleo, API y renderer): sin node:* ni DOM. Los documentos que escribe van en INGLÉS (los lee otra IA).

import type { ExecTask } from "./planExecution.js";

export interface HandoffCell {
  skill: string;
  difficulty: number;
  /** ejercicios por escribir en esta celda */
  write: number;
}

export interface HandoffTopic {
  folder: string;
  title: string;
  week: number;
  /** teoría y mapa por crear (o el tema entero si no existe) */
  theory: boolean;
  cells: HandoffCell[];
}

export type HandoffKind = "theory" | "exercises";

export interface HandoffPackage {
  /** estable mientras no cambie el reparto: `<tipo>-<área>-<n>` */
  id: string;
  order: number;
  kind: HandoffKind;
  areaKey: string;
  area: string;
  /** para la lista de la app (español) */
  title: string;
  why: string;
  topics: HandoffTopic[];
  files: number;
  weeks: [number, number];
  /** si ya se escribió su documento */
  written?: { at: string; path: string };
}

export interface HandoffOptions {
  /** ejercicios por celda (skill × dificultad): 1 = mínimo que pide la cobertura, 3 = una sesión de práctica real */
  perCell: number;
  /** máximo de archivos por paquete de ejercicios (una sesión de trabajo) */
  maxFiles: number;
  /** máximo de temas por paquete de teoría */
  maxTheory: number;
}

export const DEFAULT_HANDOFF: HandoffOptions = { perCell: 3, maxFiles: 150, maxTheory: 8 };
export const MAX_FILES_CHOICES = [60, 100, 150, 250, 400] as const;

const shortTitle = (t: string): string => t.replace(/^[\d.\s_-]+/, "").trim() || t;

/** Temas con lo que les falta, a partir de las tareas del informe de ejecución (teoría, canvas, tema nuevo y celdas de práctica). */
export function topicsFromTasks(tasks: readonly ExecTask[], perCell: number): Map<string, { areaKey: string; area: string; topic: HandoffTopic }> {
  const out = new Map<string, { areaKey: string; area: string; topic: HandoffTopic }>();
  const get = (t: ExecTask): { areaKey: string; area: string; topic: HandoffTopic } => {
    const key = t.folder ?? t.id;
    let cur = out.get(key);
    if (!cur) {
      cur = { areaKey: t.areaKey, area: t.area, topic: { folder: t.folder ?? t.title, title: t.title, week: t.week, theory: false, cells: [] } };
      out.set(key, cur);
    }
    return cur;
  };
  for (const t of tasks) {
    if (t.kind === "theory" || t.kind === "topic_new" || t.kind === "canvas") {
      get(t).topic.theory = true;
    } else if (t.kind === "practice") {
      const cells = (t.args?.cells as Array<{ skill: string; difficulty: number }> | undefined) ?? [];
      const cur = get(t);
      for (const c of cells) {
        if (!cur.topic.cells.some((x) => x.skill === c.skill && x.difficulty === c.difficulty)) cur.topic.cells.push({ skill: c.skill, difficulty: Math.max(1, Math.min(3, c.difficulty || 1)), write: Math.max(1, perCell) });
      }
    }
  }
  return out;
}

const topicFiles = (t: HandoffTopic): number => t.cells.reduce((n, c) => n + c.write, 0);
const weeksOf = (ts: readonly HandoffTopic[]): [number, number] => [Math.min(...ts.map((t) => t.week)), Math.max(...ts.map((t) => t.week))];

/** Reparte lo que falta en paquetes: primero toda la teoría (los ejercicios se apoyan en ella) y luego los ejercicios, área por área y por semanas. */
export function buildScheme(
  byTopic: Map<string, { areaKey: string; area: string; topic: HandoffTopic }>,
  areaOrder: ReadonlyArray<{ key: string; area: string }>,
  opts: Partial<HandoffOptions> = {},
): HandoffPackage[] {
  const o = { ...DEFAULT_HANDOFF, ...opts };
  const theory: HandoffPackage[] = [];
  const exercises: HandoffPackage[] = [];
  for (const a of areaOrder) {
    const mine = [...byTopic.values()].filter((x) => x.areaKey === a.key).map((x) => x.topic).sort((x, y) => x.week - y.week || x.folder.localeCompare(y.folder, "en", { numeric: true }));
    const th = mine.filter((t) => t.theory);
    for (let i = 0, n = 1; i < th.length; i += o.maxTheory, n++) {
      const chunk = th.slice(i, i + o.maxTheory);
      const total = Math.ceil(th.length / o.maxTheory);
      theory.push({
        id: `theory-${a.key}-${n}`,
        order: 0,
        kind: "theory",
        areaKey: a.key,
        area: a.area,
        title: `Teoría y mapas · ${a.area}${total > 1 ? ` (${n}/${total})` : ""}`,
        why: `${chunk.length} ${chunk.length === 1 ? "tema sin nota de teoría ni mapa" : "temas sin nota de teoría ni mapa"}: los ejercicios se apoyan en ellos.`,
        topics: chunk,
        files: chunk.length * 2,
        weeks: weeksOf(chunk),
      });
    }
    const ex = mine.filter((t) => t.cells.length);
    const groups: HandoffTopic[][] = [];
    let cur: HandoffTopic[] = [];
    let size = 0;
    for (const t of ex) {
      const f = topicFiles(t);
      if (cur.length && size + f > o.maxFiles) {
        groups.push(cur);
        cur = [];
        size = 0;
      }
      cur.push(t);
      size += f;
    }
    if (cur.length) groups.push(cur);
    groups.forEach((g, i) => {
      const files = g.reduce((n, t) => n + topicFiles(t), 0);
      exercises.push({
        id: `exercises-${a.key}-${i + 1}`,
        order: 0,
        kind: "exercises",
        areaKey: a.key,
        area: a.area,
        title: `Ejercicios · ${a.area}${groups.length > 1 ? ` (${i + 1}/${groups.length})` : ""}`,
        why: `${files} ejercicios en ${g.length} ${g.length === 1 ? "tema" : "temas"} (semanas ${weeksOf(g)[0]}–${weeksOf(g)[1]}).`,
        topics: g,
        files,
        weeks: weeksOf(g),
      });
    });
  }
  return [...theory, ...exercises].map((p, i) => ({ ...p, order: i + 1 }));
}

export const totalsOf = (ps: readonly HandoffPackage[]): { packages: number; files: number; topics: number } => ({
  packages: ps.length,
  files: ps.reduce((n, p) => n + p.files, 0),
  topics: new Set(ps.flatMap((p) => p.topics.map((t) => t.folder))).size,
});

// ── IA: ordenar y nombrar (opcional) ────────────────────────────────────

export function schemeMessages(ps: readonly HandoffPackage[]): Array<{ role: "system" | "user"; content: string }> {
  const rows = ps.map((p) => ({ id: p.id, kind: p.kind, area: p.area, files: p.files, topics: p.topics.length, weeks: `${p.weeks[0]}-${p.weeks[1]}` }));
  return [
    {
      role: "system",
      content:
        "Eres el planificador de un plan de estudio. Recibes paquetes de trabajo de contenido por crear (teoría y ejercicios) ya repartidos por tamaño. " +
        "Decide el ORDEN en que conviene hacerlos (lo que desbloquea a lo demás y lo que se estudia antes, primero) y dales un TÍTULO claro y una frase de POR QUÉ. " +
        'Responde SOLO con JSON: {"order": ["id", …], "packages": [{"id": "…", "title": "máx. 70 caracteres", "why": "una frase"}]}. ' +
        "Usa solo los ids recibidos; no inventes paquetes ni cambies su contenido.",
    },
    { role: "user", content: JSON.stringify(rows) },
  ];
}

/** Aplica la propuesta de la IA sobre los paquetes (validada: ids reales, sin duplicados, nada se pierde). null si no es utilizable. */
export function applyAiScheme(ps: readonly HandoffPackage[], raw: string): HandoffPackage[] | null {
  const s = String(raw ?? "");
  const a = s.indexOf("{");
  const b = s.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  let j: { order?: unknown; packages?: unknown };
  try {
    j = JSON.parse(s.slice(a, b + 1));
  } catch {
    return null;
  }
  const byId = new Map(ps.map((p) => [p.id, p] as const));
  const order = (Array.isArray(j.order) ? j.order : []).map((x) => String(x)).filter((id) => byId.has(id));
  const seen = new Set<string>();
  const sorted: HandoffPackage[] = [];
  for (const id of [...order, ...ps.map((p) => p.id)]) {
    if (seen.has(id)) continue;
    seen.add(id);
    sorted.push(byId.get(id)!);
  }
  const names = new Map<string, { title?: string; why?: string }>();
  for (const x of Array.isArray(j.packages) ? j.packages : []) {
    const o = x as Record<string, unknown>;
    if (o && byId.has(String(o.id))) names.set(String(o.id), { title: String(o.title ?? "").replace(/\s+/g, " ").trim().slice(0, 70), why: String(o.why ?? "").replace(/\s+/g, " ").trim().slice(0, 200) });
  }
  if (!order.length && !names.size) return null;
  return sorted.map((p, i) => {
    const n = names.get(p.id);
    return { ...p, order: i + 1, ...(n?.title ? { title: n.title } : {}), ...(n?.why ? { why: n.why } : {}) };
  });
}

// ── El documento de un paquete (inglés: lo lee otra IA) ──────────────────

export interface HandoffDocContext {
  vaultRoot: string;
  /** carpeta de primer nivel de la materia («Programación») */
  space: string;
  planName: string;
  masterDoc: string;
  toolsDir: string;
  total: number;
}

const topicNumber = (folder: string): string => /([\d.]+)\s/.exec(folder.split("/").pop() ?? "")?.[1] ?? "";
const reOf = (ts: readonly HandoffTopic[]): string => `^(${[...new Set(ts.map((t) => topicNumber(t.folder)).filter(Boolean))].map((n) => n.replace(/\./g, "\\.")).join("|")}) `;
const diffName = ["", "1 (easy)", "2 (medium)", "3 (hard)"];

export function packageMarkdown(p: HandoffPackage, c: HandoffDocContext): string {
  const num = String(p.order).padStart(2, "0");
  const re = reOf(p.topics);
  const lines: string[] = [];
  const push = (...l: string[]): void => void lines.push(...l);
  push(
    `# Antigravity plan ${num}/${c.total} — ${p.kind === "theory" ? "Theory notes and maps" : "Exercise notes"} · ${p.area}`,
    "",
    "To run this plan, paste only this:",
    "",
    `> Read \`${c.vaultRoot}\\${c.space}\\_handoff\\${num}-${p.id}.md\` and execute it.`,
    "",
    "---",
    "",
    `You are completing one slice of the study content of the plan «${c.planName}». This file is **one work package** of ${c.total}; the general rules live in the master document.`,
    "",
    "## 1. Read first",
    "",
    `1. \`${c.masterDoc}\` — the contract (note format, difficulty levels, what each skill asks, quality rules). It is binding.`,
    p.kind === "theory"
      ? "2. `docs\\ANTIGRAVITY_PROMPT_PROGRAMMING_KB.md` §4 — the procedure for theory notes and maps."
      : "2. The three reference exercises listed in §0 of the master document (match their depth and structure).",
    "",
    "## 2. Scope",
    "",
    `- Area: **${p.area}**`,
    `- ${p.topics.length} ${p.topics.length === 1 ? "topic" : "topics"}, weeks ${p.weeks[0]}–${p.weeks[1]} of the plan`,
    p.kind === "theory" ? `- ${p.files} files: one theory note + its generated map per topic` : `- **${p.files} exercise notes** to write (exact list below; do not write more or fewer)`,
    "",
    "## 3. Work list",
    "",
  );
  if (p.kind === "theory") {
    push("| # | Topic folder | Deliver |", "|---|---|---|");
    p.topics.forEach((t, i) => push(`| ${i + 1} | \`${t.folder}\` | theory note \`${t.folder.split("/").pop()}.md\` + map (generated) |`));
  } else {
    push("| # | Topic folder | Cells to write (skill · difficulty · how many) |", "|---|---|---|");
    p.topics.forEach((t, i) => push(`| ${i + 1} | \`${t.folder}\` | ${t.cells.map((x) => `\`${x.skill}\` · d${diffName[x.difficulty] ?? x.difficulty} · ×${x.write}`).join("<br>")} |`));
  }
  push("", "## 4. Procedure", "");
  if (p.kind === "theory") {
    push(
      "For each topic, in the order above:",
      "",
      "1. Read its row in `00 Temario.md` and the topic type (`node tools/programming_kb/status.mjs`).",
      "2. Write the note following the contract of the master document and the KB prompt §4.",
      `3. \`node tools/programming_kb/check_examples.mjs "${re}"\` — every code example must produce the output you wrote.`,
      `4. \`node tools/programming_kb/finalize.mjs "${re}"\` — adds the frontmatter and **generates the map** (never draw it by hand).`,
      `5. \`node tools/programming_kb/links.mjs "${re}"\` — every \`[[link]]\` must be an exact topic folder name.`,
    );
  } else {
    push(
      `Run all commands from \`${c.toolsDir}\`.`,
      "",
      "For each topic, in the order above:",
      "",
      "1. Read the topic note (`<topic>.md`): use its terms and stay inside its scope.",
      "2. Write the missing cells following §4–§6 of the master document (path, frontmatter, sections, difficulty, one angle per exercise).",
      "3. **Run every code block** of a Solution and paste the real output.",
      `4. \`node tools/programming_kb/exercises_check.mjs "${re}"\` — fix everything it reports.`,
      `5. \`node tools/programming_kb/exercises_status.mjs --phase ${p.topics.some((t) => t.cells.some((x) => x.difficulty > 1)) ? "ladder" : "basic"} --next 20 "${re}"\` — the slice must show nothing missing.`,
    );
  }
  push(
    "",
    "## 5. Done when",
    "",
    p.kind === "theory"
      ? `- \`status.mjs\` shows notes and maps present for all ${p.topics.length} topics and \`links.mjs\` reports 0 unresolved.`
      : `- \`exercises_check.mjs "${re}"\` reports 0 failing and the status tool lists nothing missing for these topics.`,
    "- Nothing outside the listed topic folders was changed.",
    "",
    "## 6. Commit",
    "",
    "```",
    `git -C ${c.vaultRoot} add "${c.space}" && git -C ${c.vaultRoot} commit -m "vault: ${p.area} ${p.kind} (plan ${num})" && git -C ${c.vaultRoot} push`,
    "```",
    "",
    "Then append one line to `docs\\CONTENT_GENERATION_LOG.md` of the NoteVault project (date, plan number, files written, checker result).",
    "",
    `> Generated by the NoteVault Mentor on the plan «${c.planName}». Package id: \`${p.id}\` · ${shortTitle(p.title)}.`,
    "",
  );
  return lines.join("\n");
}

/** La frase que se pega en Antigravity para ejecutar un paquete. */
export const promptFor = (path: string): string => `Read \`${path}\` and execute it. Do only what that file lists; commit and push when you finish.`;
