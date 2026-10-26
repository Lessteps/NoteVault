// «Crear con Antigravity»: la tarea que se escribe (solo el archivo y el estado), las negativas, el avance, la validación tema a tema y la limpieza de cachés.
// Vault temporal real; no hay ninguna IA.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CurriculumArea, CurriculumEntry } from "../../lib/curriculum.js";
import { noteFrontmatter, planEntries, practicaManifest, type PlannedEntry } from "../../lib/curriculumPrompt.js";
import { AppState } from "../appState.js";
import { hasVaultScan, vaultScan } from "../vaultScan.js";
import { curriculumHandoffApi, MAX_ENTRIES_PER_TASK, type CurriculumHandoff } from "./curriculumHandoff.js";
import { topicRegenerateHandoffApi } from "./topicRegenerateHandoff.js";

const FENCE = "```";
const mk = (id: string, title: string, items: string[]): CurriculumEntry => ({ id, category: "Layout", title, importance: "esencial", items, keywords: [] });
const AREA: CurriculumArea = {
  id: "css",
  title: "CSS",
  space: "Programación",
  areaFolder: "12 CSS",
  entries: [mk("css.flex-container", "Flexbox container", ["display: flex", "flex-direction", "justify-content"]), mk("css.grid", "Grid container", ["display: grid", "grid-template-columns"])],
};
for (let i = 0; i < 45; i++) AREA.entries.push(mk(`css.extra-${i}`, `Extra ${i}`, ["x"]));
const NOW = () => new Date("2026-10-26T10:20:30Z");

let dir: string;
let app: AppState;
const abs = (rel: string) => path.join(dir, ...rel.split("/"));
const put = (rel: string, text: string) => {
  fs.mkdirSync(path.dirname(abs(rel)), { recursive: true });
  fs.writeFileSync(abs(rel), text, "utf-8");
};
const read = (rel: string) => fs.readFileSync(abs(rel), "utf-8");
const exists = (rel: string) => fs.existsSync(abs(rel));
const make = (over: Partial<Parameters<typeof curriculumHandoffApi>[1]> = {}) => curriculumHandoffApi(app, { now: NOW, areas: () => [AREA], ...over });
const request = (api = make(), ids = ["css.flex-container", "css.grid"], extra: Record<string, unknown> = {}) => api.study_curriculum_handoff({ areaId: "css", entryIds: ids, confirm: true, ...extra });

/** Una nota que cumple el contrato (la lee el generador del mapa sin problemas). */
function noteFor(p: PlannedEntry, o: { omitSection?: string; omitItem?: string; noCuriculumId?: boolean } = {}): string {
  let fm = noteFrontmatter(p, AREA, "12 CSS");
  if (o.noCuriculumId) fm = fm.replace(/curriculum_id: .*\n/, "");
  const items = p.entry.items.filter((i) => i !== o.omitItem);
  const ref = items.map((it, i) => `${i + 1}. \`${it}\` — what it does. Values: a | b. Default: a. Example: \`${it}; /* comment */\``).join("\n");
  const ex = [1, 2, 3].map((n) => `### Example ${n} — case ${n}\n- **Context:** A page needs a row of cards.\n- **Case:** 1. Make the container.\n${FENCE}css\n.row { display: flex; } /* lay children in a row */\n${FENCE}\n- **Expected result:** The cards sit side by side.\n- **Why it works:** The container lays children out in a line.\n`).join("\n");
  const mi = [1, 2, 3].map((n) => `### Mistake ${n} — slip ${n}\n- **Mistake:** Forgetting the container.\n- **Symptom:** Nothing moves.\n- **Cause:** The property was set on a child.\n- **Fix:** Set it on the parent.\n`).join("\n");
  const cards = [1, 2, 3, 4, 5, 6].map((n) => `### ${n} · definition\n**Q:** What does item ${n} do?\n**A:** It controls the layout of the children in a flex container.\n`).join("\n");
  const sections: Record<string, string> = {
    requires: "## Requires\n*No prerequisites.*\n",
    explanation: `## Explanation\n\n### What it is\n**In one sentence.** It lays children out.\n\n**Reference — ${items.length} items.**\n${ref}\n\n### Mental model\n1. The parent decides.\n- **In the practice:** you will style a row.\n`,
    examples: `## Examples\n${ex}`,
    mistakes: `## Common mistakes\n${mi}`,
    connections: "## Connections\nRelated to nothing else yet.\n",
    cards: `## Cards\n${cards}`,
  };
  delete sections[o.omitSection ?? ""];
  return `${fm}\n\n# ${p.name}\n\n${Object.values(sections).join("\n")}`;
}

/** El agente «hace su trabajo» para los temas pedidos. */
function agentWrites(h: CurriculumHandoff, o: { skip?: string[]; noTemario?: boolean; note?: Parameters<typeof noteFor>[1]; exercises?: number } = {}): PlannedEntry[] {
  const planned = planEntries(AREA, h.entries.map((e) => ({ entry: AREA.entries.find((x) => x.id === e.entryId)!, suggestedFolder: e.folder })));
  for (const p of planned) {
    if (o.skip?.includes(p.entry.id)) continue;
    put(p.noteRel, noteFor(p, o.note));
    put(p.practicaRel, practicaManifest(p));
    for (let i = 1; i <= (o.exercises ?? 0); i++) {
      put(`${p.folder}/Ejercicios/explain/ej_explain_d1_1_${i}.md`, `---\ntype: exercise\nsubject: programming\ntitle: "Ej ${i}"\nmode: explain\ndifficulty: 1\nassistance: nohelp\ntopic: "${p.name}"\n---\n\n# Ej ${i}\n\n## Statement\nExplain in your own words what the container does with its children.\n\n## Hints\n- Think about the axis.\n\n## Solution\nIt lays the children out along the main axis.\n\n## Rubric\n- [ ] one\n- [ ] two\n- [ ] three\n`);
    }
  }
  if (!o.noTemario) {
    const lines = planned.filter((p) => !o.skip?.includes(p.entry.id)).map((p) => `- [[${p.name}]]`).join("\n");
    put("Programación/00 Temario.md", `${read("Programación/00 Temario.md")}\n## 12 CSS\n${lines}\n`);
  }
  return planned;
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_curr_"));
  put("Programación/Programación.resumen.md", "---\nsubject: programming\ntitle: Programación\n---\n# P\n");
  put("Programación/_skills/resumen_teorico_skill.md", "# resumen_teorico_skill\nCONTRATO-DE-TEORIA\n");
  put("Programación/_skills/practica_skill.md", "# practica\nPRACTICA-SKILL\n");
  put("Programación/00 Temario.md", "---\ntitle: Syllabus\n---\n\n# Syllabus\n\n<!-- nv:generated -->\n\n## 1 Fundamentals\n- [[1.1 What programming is]]\n");
  put("Programación/12 CSS/12.1 Selectors/12.1 Selectors.md", "# 12.1 Selectors\n");
  put("Programación/12 CSS/12.6 Colors/12.6 Colors.md", "# 12.6 Colors\n");
  fs.mkdirSync(path.join(dir, ".notevault"), { recursive: true });
  app = new AppState(dir);
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("study_curriculum_handoff", () => {
  it("writes only the task file and the state; no topic folders", async () => {
    const before = fs.readdirSync(abs("Programación/12 CSS")).sort();
    const h = await request();
    expect(h.kind).toBe("curriculum");
    expect(h.status).toBe("waiting");
    expect(h.taskPath).toBe("Programación/_handoff/crear/2026-10-26_10-20-30_css.md");
    expect(exists(h.taskPath)).toBe(true);
    expect(exists(`.notevault/regenerar/${h.id}.json`)).toBe(true);
    expect(fs.readdirSync(abs("Programación/12 CSS")).sort()).toEqual(before);
    expect(h.entries.map((e) => e.folder)).toEqual(["Programación/12 CSS/12.7 Flexbox container", "Programación/12 CSS/12.8 Grid container"]);
    expect(h.shortPrompt).toContain(h.taskAbs);
    expect(h.prompt).toBe(h.shortPrompt);
    const md = read(h.taskPath);
    expect(md).toContain("curriculum_id: css.flex-container");
    expect(md).toContain("CONTRATO-DE-TEORIA");
    expect(md).toContain("PRACTICA-SKILL");
    expect(md).toContain("- 12.6 Colors");
    expect(md).toContain("Skip exercises");
  });

  it("asks for exercises when the flag is set", async () => {
    const h = await request(make(), ["css.grid"], { withExercises: true });
    expect(h.withExercises).toBe(true);
    expect(read(h.taskPath)).toContain("between 12 and 16 per topic");
  });

  it("uses the injected folder suggestion (coverage engine)", async () => {
    const h = await request(make({ suggest: (_a, sel) => Object.fromEntries(sel.map((e, i) => [e.id, `Programación/12 CSS/12.${20 + i} ${e.title}`])) }));
    expect(h.entries[0]!.folder).toBe("Programación/12 CSS/12.20 Flexbox container");
  });

  it("refuses without confirm, unknown ids, unknown area, empty and oversize selections", async () => {
    const api = make();
    await expect(api.study_curriculum_handoff({ areaId: "css", entryIds: ["css.grid"] })).rejects.toThrow(/confirmación/);
    await expect(request(api, ["nope"])).rejects.toThrow(/no están en el currículo/);
    await expect(api.study_curriculum_handoff({ areaId: "zzz", entryIds: ["css.grid"], confirm: true })).rejects.toThrow(/área/);
    await expect(request(api, [])).rejects.toThrow(/al menos/);
    const ids = AREA.entries.map((e) => e.id);
    expect(ids.length).toBeGreaterThan(MAX_ENTRIES_PER_TASK);
    await expect(request(api, ids)).rejects.toThrow(/lotes de 25/);
    expect(exists("Programación/_handoff/crear")).toBe(false);
  });

  it("refuses entries whose suggested folder (or number) already exists", async () => {
    put("Programación/12 CSS/12.7 Flexbox container/12.7 Flexbox container.md", "# x\n");
    const api = make({ suggest: (_a, sel) => Object.fromEntries(sel.map((e) => [e.id, `Programación/12 CSS/12.7 ${e.title}`])) });
    await expect(request(api, ["css.flex-container"])).rejects.toThrow(/ya existen/);
    await expect(request(api, ["css.grid"])).rejects.toThrow(/ya existen/);
  });

  it("numbers after the highest existing number by default", async () => {
    put("Programación/12 CSS/12.9 Other/12.9 Other.md", "# x\n");
    const h = await request(make(), ["css.grid"]);
    expect(h.entries[0]!.number).toBe("12.10");
  });
});

describe("status and list", () => {
  it("reports cheap per-entry progress", async () => {
    const h = await request();
    expect(h.entries[0]!.progress).toEqual({ folder: false, note: false, manifest: false, map: false, exercises: 0, temario: false });
    expect(h.ready).toEqual({ found: 0, expected: 2 });
    agentWrites(h, { skip: ["css.grid"], exercises: 2 });
    const s = make().study_curriculum_handoff_status(h.id);
    expect(s.entries[0]!.progress).toEqual({ folder: true, note: true, manifest: true, map: false, exercises: 2, temario: true });
    expect(s.entries[1]!.progress.note).toBe(false);
    expect(s.ready).toEqual({ found: 1, expected: 2 });
    expect(() => make().study_curriculum_handoff_status("nope")).toThrow(/no existe/);
  });

  it("lists curriculum tasks newest first and ignores regeneration states", async () => {
    let t = 0;
    const api = make({ now: () => new Date(Date.UTC(2026, 9, 26, 10, 0, t++)) });
    const a = await request(api, ["css.grid"]);
    const b = await request(api, ["css.flex-container"]);
    put(".notevault/regenerar/otra.json", JSON.stringify({ id: "otra", what: "theory", topics: [] }));
    expect(api.study_curriculum_handoff_list().map((x) => x.id)).toEqual([b.id, a.id]);
    // la lista de «Regenerar» tampoco se rompe con una tarea de currículo
    expect(() => topicRegenerateHandoffApi(app).study_topic_regenerate_handoff_list()).not.toThrow();
  });
});

describe("study_curriculum_handoff_validate", () => {
  it("accepts a complete result, generates the map and clears the caches", async () => {
    const api = make();
    const h = await request(api, ["css.flex-container", "css.grid"], { withExercises: true });
    agentWrites(h, { exercises: 6 });
    vaultScan(app);
    expect(hasVaultScan(app.root)).toBe(true);
    const v = await api.study_curriculum_handoff_validate(h.id);
    expect(v.entries.map((e) => [e.state, e.problems])).toEqual([["created", []], ["created", []]]);
    expect(v.status).toBe("validated");
    expect(v.entries[0]!.progress.map).toBe(true);
    expect(exists("Programación/12 CSS/12.7 Flexbox container/12.7 Flexbox container — mapa.canvas")).toBe(true);
    expect(hasVaultScan(app.root)).toBe(false);
    expect(api.study_curriculum_handoff_status(h.id).status).toBe("validated");
  });

  it("reports missing note/manifest/folder per entry and lets the rest pass", async () => {
    const api = make();
    const h = await request(api);
    agentWrites(h, { skip: ["css.grid"] });
    const v = await api.study_curriculum_handoff_validate(h.id);
    expect(v.entries[0]!.state).toBe("created");
    expect(v.entries[1]!.state).toBe("error");
    expect(v.entries[1]!.problems[0]).toMatch(/Falta la carpeta/);
    expect(v.status).toBe("failed");
    // el agente lo completa y se vuelve a validar: solo se revisa el pendiente
    const planned = planEntries(AREA, v.entries.map((e) => ({ entry: AREA.entries.find((x) => x.id === e.entryId)!, suggestedFolder: e.folder })));
    put(planned[1]!.noteRel, noteFor(planned[1]!));
    fs.rmSync(abs(planned[1]!.practicaRel), { force: true });
    put("Programación/00 Temario.md", `${read("Programación/00 Temario.md")}- [[${planned[1]!.name}]]\n`);
    const v2 = await api.study_curriculum_handoff_validate(h.id);
    expect(v2.entries[1]!.problems.join("|")).toMatch(/Falta el manifiesto/);
    put(planned[1]!.practicaRel, practicaManifest(planned[1]!));
    expect((await api.study_curriculum_handoff_validate(h.id)).status).toBe("validated");
  });

  it("rejects a note with a missing section", async () => {
    const api = make();
    const h = await request(api, ["css.grid"]);
    agentWrites(h, { note: { omitSection: "mistakes" } });
    const v = await api.study_curriculum_handoff_validate(h.id);
    expect(v.entries[0]!.state).toBe("error");
    expect(v.entries[0]!.problems.join("|")).toMatch(/Common mistakes|errores/i);
  });

  it("rejects a note that leaves out an item of the group", async () => {
    const api = make();
    const h = await request(api, ["css.grid"]);
    agentWrites(h, { note: { omitItem: "grid-template-columns" } });
    const v = await api.study_curriculum_handoff_validate(h.id);
    expect(v.entries[0]!.problems.join("|")).toMatch(/no aparecen en la nota.*grid-template-columns/);
  });

  it("rejects a missing curriculum_id and a missing Temario link", async () => {
    const api = make();
    const h = await request(api, ["css.grid"]);
    agentWrites(h, { note: { noCuriculumId: true }, noTemario: true });
    const v = await api.study_curriculum_handoff_validate(h.id);
    const text = v.entries[0]!.problems.join("|");
    expect(text).toMatch(/curriculum_id/);
    expect(text).toMatch(/00 Temario/);
    expect(v.entries[0]!.progress.temario).toBe(false);
  });

  it("rejects a cut-off note", async () => {
    const api = make();
    const h = await request(api, ["css.grid"]);
    agentWrites(h, { note: { omitSection: "cards" } });
    const v = await api.study_curriculum_handoff_validate(h.id);
    expect(v.entries[0]!.problems.join("|")).toMatch(/cortada/);
  });

  it("requires exercises when the task asked for them and checks their schema", async () => {
    const api = make();
    const h = await request(api, ["css.grid"], { withExercises: true });
    const [p] = agentWrites(h, { exercises: 2 });
    let v = await api.study_curriculum_handoff_validate(h.id);
    expect(v.entries[0]!.problems.join("|")).toMatch(/Hacen falta ejercicios/);
    for (let i = 3; i <= 6; i++) put(`${p!.folder}/Ejercicios/explain/ej_explain_d1_1_${i}.md`, "---\ntype: exercise\ntopic: \"x\"\n---\n# bad\n");
    v = await api.study_curriculum_handoff_validate(h.id);
    expect(v.entries[0]!.problems.join("|")).toMatch(/Ejercicios no válidos \(4/);
  });

  it("rejects a manifest with unknown skills", async () => {
    const api = make();
    const h = await request(api, ["css.grid"]);
    const [p] = agentWrites(h);
    put(p!.practicaRel, practicaManifest(p!).replace('"pg_true_false"', '"made_up_skill"'));
    const v = await api.study_curriculum_handoff_validate(h.id);
    expect(v.entries[0]!.problems.join("|")).toMatch(/made_up_skill/);
  });
});
