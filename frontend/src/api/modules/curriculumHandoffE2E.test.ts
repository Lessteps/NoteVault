// De punta a punta, SIN tocar la vault real: una vault temporal con temas existentes, `00 Temario.md` y un plan del Mentor.
//   1. study_curriculum_handoff escribe la tarea para 2 entradas REALES del currículo (HTML).
//   2. Un «agente simulado» ejecuta SOLO lo que dice el archivo de la tarea: lee de él el frontmatter exacto, el manifiesto exacto, la línea del
//      temario y la lista de elementos; escribe la nota con los encabezados del contrato (sección 4). Así se prueba que las instrucciones se pueden ejecutar.
//   3. study_curriculum_handoff_validate pasa; los temas nuevos aparecen en el escaneo, en study_topic_dashboard y en mentor_areas_overview.
//   4. mentor_plan_add_topics los lleva al final de la ruta de Frontend (plan existente) y se crea el área Java en otro plan.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({ store: {} as Record<string, unknown> }));
vi.mock("../appConfig.js", () => ({
  AppConfig: {
    get_ai_config: () => ({ ...hoisted.store }),
    set_ai_config: (d: Record<string, unknown>) => Object.assign(hoisted.store, d),
  },
}));

import { curriculumAreas } from "../../core/curriculum/catalog.js";
import { buildPlan, PlanStore, type Plan } from "../../core/mentor/plan.js";
import { addDays } from "../../lib/planTime.js";
import { AppState } from "../appState.js";
import { clearVaultScanCache, hasVaultScan, vaultScan } from "../vaultScan.js";
import { curriculumHandoffApi, type CurriculumHandoff } from "./curriculumHandoff.js";
import { mentorApi } from "./mentor.js";
import { mentorAreasOverviewApi } from "./mentorAreasOverview.js";
import { clearStudySnapshotCache, setWarmApp, studyApi, warmStudyIndex } from "./study.js";

const FENCE = "```";
const NOW = () => new Date("2026-10-26T10:20:30Z");
const two = (n: number) => String(n).padStart(2, "0");
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
};
const MANIFEST = (title: string) => `---\ntype: topic\nsubject: programming\ntitle: "${title}"\nskills: [implement, debug]\nmastery:\n  min_per_skill: 6\n  target_difficulty: 3\n  exam: none\n---\n`;

let dir: string;
let app: AppState;
const abs = (rel: string) => path.join(dir, ...rel.split("/"));
const put = (rel: string, text: string) => {
  fs.mkdirSync(path.dirname(abs(rel)), { recursive: true });
  fs.writeFileSync(abs(rel), text, "utf-8");
};
const read = (rel: string) => fs.readFileSync(abs(rel), "utf-8");
const topic = (rel: string) => {
  const title = rel.split("/").pop()!;
  put(`${rel}/.practica.md`, MANIFEST(title));
  put(`${rel}/${title}.md`, "---\ntype: concept\n---\n# T\n");
};

/** Lo que el agente LEE del archivo de la tarea (no se reconstruye con las funciones de la app). */
function readTask(md: string) {
  const topics = [...md.matchAll(/^#### (\d+)\. (.+)$/gm)].map((m, i, all) => {
    const block = md.slice(m.index!, all[i + 1]?.index ?? md.indexOf("### 5.2"));
    const fences = [...block.matchAll(/^(`{3,})(\w*)\n([\s\S]*?)\n\1$/gm)].map((f) => ({ lang: f[2]!, body: f[3]! }));
    const items = [...(/\*\*every one must appear[^:]*: (.+?)\.\n/.exec(block)?.[1] ?? "").matchAll(/`([^`]+)`/g)].map((x) => x[1]!);
    const folderAbs = /Create the folder: `([^`]+)`/.exec(block)![1]!;
    const temarioLine = /Append to the syllabus \(5\.3\): `([^`]+)`/.exec(block)![1]!;
    return { name: m[2]!, folderAbs, frontmatter: fences.find((f) => f.lang === "yaml")!.body, manifest: fences.find((f) => f.lang === "markdown")!.body, items, temarioLine };
  });
  const heading = /under the heading `(## [^`]+)`/i.exec(md)![1]!;
  return { topics, heading };
}

/** Una nota con los encabezados y campos del contrato de la sección 4 de la tarea, con todos los elementos de la referencia. */
function noteBody(name: string, items: string[]): string {
  const ref = items.map((it, i) => `${i + 1}. \`${it}\` — what it does. Values: a | b. Default: none. Example: \`${it} /* comment */\``).join("\n");
  const ex = [1, 2, 3].map((n) => `### Example ${n} — case ${n}\n- **Context:** A page needs a section.\n- **Case:** 1. Write the markup.\n${FENCE}html\n<main>Hi</main> <!-- the important part -->\n${FENCE}\n- **Expected result:** The text shows.\n- **Why it works:** The element is rendered.\n`).join("\n");
  const mi = [1, 2, 3].map((n) => `### Mistake ${n} — slip ${n}\n- **Mistake:** Wrong element.\n- **Symptom:** Nothing shows.\n- **Cause:** Typo.\n- **Fix:** Use the right one.\n`).join("\n");
  const cards = [1, 2, 3, 4, 5, 6].map((n) => `### ${n} · definition\n**Q:** What is item ${n}?\n**A:** It is part of the page structure.\n`).join("\n");
  return `\n# ${name}\n\n## Requires\n*No prerequisites.*\n\n## Explanation\n\n### What it is\n**In one sentence.** It structures a page.\n\n**Reference — ${items.length} items.**\n${ref}\n\n### Mental model\n1. The browser parses.\n- **In the practice:** you will write markup.\n\n## Examples\n${ex}\n## Common mistakes\n${mi}\n## Connections\nNone yet.\n\n## Cards\n${cards}`;
}

/** El agente simulado: ejecuta únicamente lo que lee en la tarea. */
function simulateAgent(h: CurriculumHandoff, o: { skipTemario?: boolean } = {}) {
  const task = readTask(fs.readFileSync(h.taskAbs, "utf-8"));
  expect(task.topics.length).toBe(h.entries.length);
  for (const t of task.topics) {
    const rel = path.relative(dir, t.folderAbs).split(path.sep).join("/");
    put(`${rel}/${t.name}.md`, `${t.frontmatter}\n${noteBody(t.name, t.items)}`);
    put(`${rel}/${t.name}.practica.md`, t.manifest);
  }
  if (!o.skipTemario) {
    const lines = task.topics.map((t) => t.temarioLine).join("\n");
    put("Programación/00 Temario.md", `${read("Programación/00 Temario.md")}\n${task.heading}\n${lines}\n`);
  }
  return task;
}

const planFile = (id: string) => path.join(dir, ".notevault", "mentor", "plans", `${id}.json`);

/** Un plan por áreas con Backend y Frontend (con temas ya hechos y pendientes), hoy +60 días. */
function savePlan(opts: { frontend?: boolean; name?: string; archived?: boolean } = {}): Plan {
  const start = todayIso();
  const end = addDays(start, 60);
  const CORE = [{ id: "core", title: "Conocimientos", kind: "knowledge" as const, order: 100 }];
  const seeds = [
    { area: "Backend", areaId: "backend", objective: "Servicios", groups: CORE, topics: [{ folder: "Programación/4 Backend/4.1 HTTP", title: "HTTP", estMinutes: 60, group: "core" }, { folder: "Programación/4 Backend/4.2 REST", title: "REST", estMinutes: 60, group: "core" }] },
    ...(opts.frontend === false ? [] : [{ area: "Frontend", areaId: "frontend", objective: "Interfaces", groups: CORE, topics: [{ folder: "Programación/5 Frontend/5.1 DOM", title: "DOM", estMinutes: 60, group: "core" }, { folder: "Programación/5 Frontend/5.2 Events", title: "Events", estMinutes: 60, group: "core" }] }]),
  ];
  const built = buildPlan(seeds, { id: `${start}_${end}`, start, end, minutesPerDay: 240, studyDays: [1, 2, 3, 4, 5, 6, 7], pace: "intenso", from: start, name: opts.name ?? "Plan principal" }).plan;
  const plan: Plan = { ...built, structure: "areas", areaMode: "together", ...(opts.archived ? { archived: true } : {}) };
  new PlanStore(dir).save(plan);
  return plan;
}

beforeEach(async () => {
  for (const k of Object.keys(hoisted.store)) delete hoisted.store[k];
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_e2e_"));
  put("Programación/Programación.resumen.md", "---\nsubject: programming\ntitle: Programación\n---\n# P\n");
  put("Programación/_skills/resumen_teorico_skill.md", "# resumen_teorico_skill\nTHEORY\n");
  put("Programación/_skills/practica_skill.md", "# practica\nPRACTICE\n");
  put("Programación/00 Temario.md", "---\ntitle: Syllabus\n---\n\n# Syllabus\n\n<!-- nv:generated -->\n\n## 4 Backend\n- [[4.1 HTTP]]\n");
  for (const t of ["Programación/4 Backend/4.1 HTTP", "Programación/4 Backend/4.2 REST", "Programación/5 Frontend/5.1 DOM", "Programación/5 Frontend/5.2 Events"]) topic(t);
  clearStudySnapshotCache();
  clearVaultScanCache();
  app = new AppState(dir);
  // como al arrancar la app: el índice está caliente ANTES de que el agente escriba nada
  setWarmApp(app);
  await warmStudyIndex();
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("Antigravity -> validar -> vault -> Mentor", () => {
  it("la tarea se puede ejecutar tal cual, valida, los temas aparecen y se añaden al final de Frontend", async () => {
    const html = curriculumAreas().find((a) => a.id === "html")!;
    const ids = html.entries.filter((e) => !e.parentId).slice(0, 2).map((e) => e.id);
    const api = curriculumHandoffApi(app, { now: NOW });
    const h = await api.study_curriculum_handoff({ areaId: "html", entryIds: ids, confirm: true });
    expect(h.entries.map((e) => e.folder)).toEqual([
      "Programación/5 Frontend/HTML/5.18.1 Document skeleton - doctype, html, head and body",
      "Programación/5 Frontend/HTML/5.18.2 Metadata - title, meta, base and link",
    ]);
    // la app solo escribió la tarea
    expect(fs.existsSync(abs("Programación/5 Frontend/HTML"))).toBe(false);

    const task = simulateAgent(h);
    expect(task.topics.map((t) => t.items.length)).toEqual(html.entries.filter((e) => !e.parentId).slice(0, 2).map((e) => e.items.length));
    expect(task.heading).toBe("## 5 Frontend/HTML");

    vaultScan(app);
    const v = await api.study_curriculum_handoff_validate(h.id);
    expect(v.entries.map((e) => e.problems)).toEqual([[], []]);
    expect(v.status).toBe("validated");
    // las cachés se limpiaron: se vuelve a leer la vault
    expect(hasVaultScan(app.root)).toBe(false);

    const dash: any = await studyApi(app).study_topic_dashboard();
    const folders = dash.topics.map((t: any) => t.folder);
    expect(folders).toEqual(expect.arrayContaining(h.entries.map((e) => e.folder)));
    expect(dash.areas).toContain("HTML");

    const ov = mentorAreasOverviewApi(app);
    const areas: any = await ov.mentor_areas_overview({ level: "areas", space: "Programación" });
    expect(areas.rows.map((r: any) => r.name)).toContain("HTML");

    const topics: any = await ov.mentor_areas_overview({ level: "topics", space: "Programación", area: "Programación/5 Frontend/HTML" });
    expect(topics.rows.map((r: any) => r.code)).toEqual(["5.18.1", "5.18.2"]);

    // añadir al plan
    const plan = savePlan();
    const before = plan.subplans.find((s) => s.areaId === "frontend")!.topics.map((t) => t.folder);
    const m = mentorApi(app, vi.fn());
    const r: any = m.mentor_plan_add_topics({ planId: plan.id, folders: v.entries.map((e) => e.folder) });
    expect(r.added).toEqual(h.entries.map((e) => e.folder));
    const fe = r.plan.subplans.find((s: any) => s.areaId === "frontend");
    expect(fe.topics.map((t: any) => t.folder)).toEqual([...before, ...h.entries.map((e) => e.folder)]);
    expect(fe.topics.slice(2).every((t: any) => t.addedFrom === "curriculum" && t.group === "html")).toBe(true);
    // queda guardado
    expect(JSON.parse(fs.readFileSync(planFile(plan.id), "utf-8")).subplans[1].topics.at(-1).addedFrom).toBe("curriculum");
  });

  it("lotes atómicos: la primera tarea de HTML se ejecuta, valida, entra al plan en la asignatura HTML y sube la cobertura", async () => {
    const api = curriculumHandoffApi(app, { now: NOW });
    const { tasks: batches, master } = await api.study_curriculum_handoff_batches({ areaId: "html", importance: "esencial", confirm: true });
    expect(fs.readFileSync(master.taskAbs, "utf-8")).toContain(batches[0]!.taskAbs);
    expect(batches.length).toBeGreaterThan(3);
    const h = batches[0]!;
    // el grupo va primero y sus piezas cuelgan de su número (N.M.K)
    expect(h.entries[0]!.folder).toMatch(/\/5\.18\.1 Document skeleton/);
    expect(h.entries.some((e) => /\/5\.18\.\d+\.\d+ /.test(e.folder))).toBe(true);

    const task = simulateAgent(h);
    expect(task.topics.length).toBe(h.entries.length);
    expect(fs.readFileSync(h.taskAbs, "utf-8")).toContain("ATOMIC TOPIC");

    vaultScan(app);
    const v = await api.study_curriculum_handoff_validate(h.id);
    expect(v.entries.flatMap((e) => e.problems)).toEqual([]);
    expect(v.status).toBe("validated");

    const plan = savePlan();
    const r: any = mentorApi(app, vi.fn()).mentor_plan_add_topics({ planId: plan.id, folders: v.entries.map((e) => e.folder) });
    const fe = r.plan.subplans.find((s: any) => s.areaId === "frontend");
    const added = fe.topics.filter((t: any) => t.addedFrom === "curriculum");
    expect(added.length).toBe(h.entries.length);
    expect(added.every((t: any) => t.group === "html")).toBe(true);
    // el grupo general antes que sus piezas
    expect(added[0].folder).toMatch(/5\.18\.1 Document skeleton/);

    // con las notas creadas esas piezas ya no faltan
    const again = await api.study_curriculum_handoff_batches({ areaId: "html", importance: "esencial", confirm: true });
    // la cola ya no trae la tarea validada y el maestro tampoco
    expect(again.tasks.length).toBe(batches.length - 1);
    expect(fs.readFileSync(again.master.taskAbs, "utf-8")).not.toContain(h.taskAbs);
    const left = again.tasks.flatMap((b) => b.entries.map((e) => e.folder));
    expect(left.some((f) => h.entries.some((e) => e.folder === f))).toBe(false);
  });

  it("si el agente no añadió la línea del temario, la validación lo dice con el mensaje exacto", async () => {
    const api = curriculumHandoffApi(app, { now: NOW });
    const h = await api.study_curriculum_handoff({ areaId: "html", entryIds: [curriculumAreas().find((a) => a.id === "html")!.entries[0]!.id], confirm: true });
    simulateAgent(h, { skipTemario: true });
    const v = await api.study_curriculum_handoff_validate(h.id);
    expect(v.entries[0]!.problems).toEqual([`Falta la línea «- [[${h.entries[0]!.name}]]» en Programación/00 Temario.md.`]);
  });
});

describe("mentor_plan_add_topics (API)", () => {
  const CSS1 = "Programación/12 CSS/12.1 Selectors";
  const CSS2 = "Programación/12 CSS/12.2 Box model";
  const CSS10 = "Programación/12 CSS/12.10 Grid";
  const JAVA1 = "Programación/14 Java/14.1 Syntax";
  const api = () => mentorApi(app, vi.fn());
  const mkTopics = () => {
    for (const t of [CSS1, CSS2, CSS10, JAVA1]) topic(t);
    clearStudySnapshotCache();
    vaultScan(app);
  };
  const hist = (id: string) => api().mentor_plan_changes({ id }) as Array<Record<string, any>>;

  it("html/css -> Frontend al final, en orden de catálogo; Java crea su área; queda en el historial", () => {
    mkTopics();
    const plan = savePlan();
    const file = planFile(plan.id);
    const before = JSON.parse(fs.readFileSync(file, "utf-8"));
    const r: any = api().mentor_plan_add_topics({ planId: plan.id, folders: [CSS10, JAVA1, CSS2, CSS1] });
    expect(r.added).toEqual([CSS1, CSS2, CSS10, JAVA1]);
    expect(r.created).toEqual(["java"]);
    expect(r.changed).toBe(4);
    const saved = JSON.parse(fs.readFileSync(file, "utf-8"));
    const fe = saved.subplans.find((s: any) => s.areaId === "frontend");
    expect(fe.topics.map((t: any) => t.folder)).toEqual([...before.subplans[1].topics.map((t: any) => t.folder), CSS1, CSS2, CSS10]);
    // los temas que ya estaban no cambian ni de orden ni de datos
    expect(fe.topics.slice(0, 2)).toEqual(before.subplans[1].topics);
    expect(saved.subplans[0]).toEqual(before.subplans[0]);
    const java = saved.subplans.find((s: any) => s.areaId === "java");
    expect(java).toMatchObject({ area: "Java" });
    expect(java.topics.map((t: any) => t.folder)).toEqual([JAVA1]);
    expect(java.topics[0]).toMatchObject({ addedFrom: "curriculum", group: "core" });
    // historial
    const h = hist(plan.id);
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ status: "applied", source: "rules", delta: { added: 4, removed: 0, moved: 0 } });
    expect(h[0]!.summary).toMatch(/Se añadieron 4 temas de referencia \(CSS, Java\) al área Frontend y Java/);
    expect(h[0]!.changed).toEqual([CSS1, CSS2, CSS10, JAVA1]);
  });

  it("es idempotente: repetir no duplica, no escribe otra entrada y avisa", () => {
    mkTopics();
    const plan = savePlan();
    api().mentor_plan_add_topics({ planId: plan.id, folders: [CSS1, CSS2] });
    const file = planFile(plan.id);
    const text = fs.readFileSync(file, "utf-8");
    const again: any = api().mentor_plan_add_topics({ planId: plan.id, folders: [CSS1, CSS2] });
    expect(again.added).toEqual([]);
    expect(again.changed).toBe(0);
    expect(again.message).toMatch(/ya estaban/);
    expect(fs.readFileSync(file, "utf-8")).toBe(text);
    expect(hist(plan.id)).toHaveLength(1);
    const mixed: any = api().mentor_plan_add_topics({ planId: plan.id, folders: [CSS1, CSS10] });
    expect(mixed.added).toEqual([CSS10]);
    expect(mixed.skipped).toEqual([{ folder: CSS1, reason: "ya está en el plan" }]);
  });

  it("valida: carpeta que no es un tema de la vault, carpeta fuera del mapa, plan archivado o inexistente", () => {
    mkTopics();
    const plan = savePlan();
    expect(() => api().mentor_plan_add_topics({ planId: plan.id, folders: ["Programación/12 CSS/12.99 Nada"] })).toThrow(/No se añadió nada: no es un tema de la vault/);
    expect(() => api().mentor_plan_add_topics({ planId: plan.id, folders: ["Programación/4 Backend/4.1 HTTP"] })).toThrow(/no es de un área de referencia/);
    expect(() => api().mentor_plan_add_topics({ planId: plan.id, folders: [] })).toThrow(/al menos un tema/);
    expect(() => api().mentor_plan_add_topics({ planId: "../x", folders: [CSS1] })).toThrow(/Plan inválido/);
    expect(() => api().mentor_plan_add_topics({ planId: "2000-01-01_2000-02-01", folders: [CSS1] })).toThrow(/ya no existe/);
    expect(hist(plan.id)).toHaveLength(0);
    // una carpeta válida y otra inválida: entra la válida y la otra se informa
    const r: any = api().mentor_plan_add_topics({ planId: plan.id, folders: [CSS1, "Programación/12 CSS/12.99 Nada"] });
    expect(r.added).toEqual([CSS1]);
    expect(r.skipped[0].folder).toBe("Programación/12 CSS/12.99 Nada");
  });

  it("nunca toca un plan archivado", () => {
    mkTopics();
    const plan = savePlan({ archived: true });
    const text = fs.readFileSync(planFile(plan.id), "utf-8");
    expect(() => api().mentor_plan_add_topics({ planId: plan.id, folders: [CSS1] })).toThrow(/archivado/);
    expect(fs.readFileSync(planFile(plan.id), "utf-8")).toBe(text);
  });

  it("si el plan no tiene Frontend lo crea; con subplanId el destino lo elige la persona", () => {
    mkTopics();
    const plan = savePlan({ frontend: false });
    const r: any = api().mentor_plan_add_topics({ planId: plan.id, folders: [CSS1] });
    expect(r.created).toEqual(["frontend"]);
    expect(r.plan.subplans.map((s: any) => s.area)).toEqual(["Backend", "Frontend"]);
    const be = r.plan.subplans[0].id;
    const forced: any = api().mentor_plan_add_topics({ planId: plan.id, folders: [JAVA1], subplanId: be });
    expect(forced.plan.subplans[0].topics.at(-1).folder).toBe(JAVA1);
    expect(() => api().mentor_plan_add_topics({ planId: plan.id, folders: [CSS2], subplanId: "zzz" })).toThrow(/ya no existe/);
  });

  it("«Deshacer» lo revierte, y el reparto sigue consistente con la ruta del área", () => {
    mkTopics();
    const plan = savePlan();
    const text = JSON.parse(fs.readFileSync(planFile(plan.id), "utf-8"));
    api().mentor_plan_add_topics({ planId: plan.id, folders: [CSS1, CSS2] });
    // lo que ve la interfaz: la ruta derivada del plan incluye los nuevos
    const got: any = api().mentor_plan_get({ id: plan.id });
    const fe = got.plan.subplans.find((s: any) => s.areaId === "frontend");
    expect(fe.topics.map((t: any) => t.folder).slice(-2)).toEqual([CSS1, CSS2]);
    expect(got.derived.subplans.find((s: any) => s.id === fe.id).topics).toHaveLength(4);
    const undo: any = api().mentor_plan_change_undo({ id: plan.id });
    expect(undo.plan.subplans.find((s: any) => s.areaId === "frontend").topics).toHaveLength(2);
    expect(undo.plan.subplans[1].topics.map((t: any) => t.folder)).toEqual(text.subplans[1].topics.map((t: any) => t.folder));
  });
});
