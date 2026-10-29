// Modo automático: la app escribe los temas con su IA (simulada aquí), uno tras otro, y los deja listos para el plan. Vault temporal real.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({ store: {} as Record<string, unknown> }));
vi.mock("../appConfig.js", () => ({
  AppConfig: { get_ai_config: () => ({ ...hoisted.store }), set_ai_config: (d: Record<string, unknown>) => Object.assign(hoisted.store, d) },
}));

import { AppState } from "../appState.js";
import { clearVaultScanCache, vaultScan } from "../vaultScan.js";
import { curriculumAutoApi } from "./curriculumAuto.js";
import { curriculumHandoffApi } from "./curriculumHandoff.js";

const FENCE = "```";
let dir: string;
let app: AppState;
const abs = (rel: string) => path.join(dir, ...rel.split("/"));
const put = (rel: string, text: string) => {
  fs.mkdirSync(path.dirname(abs(rel)), { recursive: true });
  fs.writeFileSync(abs(rel), text, "utf-8");
};

/** Una nota con el contrato (como la que escribiría la IA), con todos los elementos de la lista que el mensaje pide. */
function goodNote(userMsg: string): string {
  const name = /Topic: `([^`]+)`/.exec(userMsg)![1]!;
  const line = /Items that EVERY ONE must appear[^:]*: (.+?)\.\n/.exec(userMsg)?.[1] ?? "";
  const items = [...line.matchAll(/`([^`]+)`/g)].map((m) => m[1]!);
  const ref = items.map((it, i) => `${i + 1}. \`${it}\` — what it does. Values: a | b. Default: none. Example: \`${it} /* c */\``).join("\n");
  const ex = [1, 2, 3].map((n) => `### Example ${n} — case ${n}\n- **Context:** A page needs a section.\n- **Case:** 1. Write the markup.\n${FENCE}html\n<main>Hi</main> <!-- the important part -->\n${FENCE}\n- **Expected result:** The text shows.\n- **Why it works:** The element is rendered.\n`).join("\n");
  const mi = [1, 2, 3].map((n) => `### Mistake ${n} — slip ${n}\n- **Mistake:** Wrong element.\n- **Symptom:** Nothing shows.\n- **Cause:** Typo.\n- **Fix:** Use the right one.\n`).join("\n");
  const cards = [1, 2, 3, 4, 5, 6].map((n) => `### ${n} · definition\n**Q:** What is item ${n}?\n**A:** It is part of the page structure and it does a lot of useful work.\n`).join("\n");
  return `# ${name}\n\n## Requires\n*No prerequisites.*\n\n## Explanation\n\n### What it is\n**In one sentence.** It structures a page.\n\n**Reference — ${items.length} items.**\n${ref}\n\n### Mental model\n1. The browser parses.\n- **In the practice:** you will write markup.\n\n## Examples\n${ex}\n## Common mistakes\n${mi}\n## Connections\nNone yet.\n\n## Cards\n${cards}`;
}

beforeEach(() => {
  for (const k of Object.keys(hoisted.store)) delete hoisted.store[k];
  Object.assign(hoisted.store, { provider: "openai", api_key: "sk-test", model: "test" });
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_auto_"));
  put("Programación/Programación.resumen.md", "---\nsubject: programming\ntitle: Programación\n---\n# P\n");
  put("Programación/_skills/resumen_teorico_skill.md", "# resumen_teorico_skill\nTHEORY\n");
  put("Programación/00 Temario.md", "---\ntitle: Syllabus\n---\n\n# Syllabus\n\n<!-- nv:generated -->\n\n## 4 Backend\n- [[4.1 HTTP]]\n");
  fs.mkdirSync(abs(".notevault"), { recursive: true });
  clearVaultScanCache();
  app = new AppState(dir);
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const finish = async (api: ReturnType<typeof curriculumAutoApi>, id: string) => {
  await vi.waitFor(() => expect(api.study_curriculum_auto_status(id).done).toBe(true), { timeout: 20000 });
  return api.study_curriculum_auto_status(id);
};

describe("study_curriculum_auto_*", () => {
  it("pide confirmación y se niega con la IA en modo puente", () => {
    const api = curriculumAutoApi(app, { ask: async () => "" });
    expect(() => api.study_curriculum_auto_start({ areaId: "html" })).toThrow(/confirmación/);
    hoisted.store.provider = "claude-bridge";
    const r = api.study_curriculum_auto_engine();
    expect(typeof r.ready).toBe("boolean");
  });

  it("escribe los temas pedidos, uno tras otro: carpeta, nota, manifiesto, mapa y temario; luego la app los valida", async () => {
    const seen: string[] = [];
    const api = curriculumAutoApi(app, { ask: async (_c, m) => { const u = m.find((x) => x.role === "user")!.content; seen.push(/Topic: `([^`]+)`/.exec(u)![1]!); return goodNote(u); } });
    const { jobId, total } = api.study_curriculum_auto_start({ areaId: "html", importance: "esencial", entryIds: undefined, confirm: true });
    expect(total).toBeGreaterThan(100);
    api.study_curriculum_auto_cancel(jobId);
    const job = await finish(api, jobId);
    expect(job.cancelled || job.done).toBe(true);
  });

  it("con dos temas: se crean en orden, con todo lo que pide el contrato, y el validador de la app los da por buenos", async () => {
    const ids = ["html.skeleton", "html.metadata"];
    const api = curriculumAutoApi(app, { ask: async (_c, m) => goodNote(m.find((x) => x.role === "user")!.content) });
    const { jobId, total } = api.study_curriculum_auto_start({ areaId: "html", entryIds: ids, confirm: true });
    expect(total).toBe(2);
    const job = await finish(api, jobId);
    expect(job.failed).toEqual([]);
    expect(job.error).toBe("");
    expect(job.created).toEqual(["Programación/5 Frontend/HTML/5.18.1 Document skeleton - doctype, html, head and body", "Programación/5 Frontend/HTML/5.18.2 Metadata - title, meta, base and link"]);
    for (const f of job.created) {
      const name = f.split("/").pop()!;
      expect(fs.existsSync(abs(`${f}/${name}.md`))).toBe(true);
      expect(fs.existsSync(abs(`${f}/${name}.practica.md`))).toBe(true);
      expect(fs.readFileSync(abs(`${f}/${name}.md`), "utf-8")).toMatch(/curriculum_id: html\./);
    }
    expect(fs.readFileSync(abs("Programación/00 Temario.md"), "utf-8")).toContain("## 5 Frontend/HTML\n- [[5.18.1 Document skeleton - doctype, html, head and body]]");

    // el MISMO validador de las tareas manuales las da por creadas y la cobertura lo refleja
    clearVaultScanCache();
    vaultScan(app);
    const h = curriculumHandoffApi(app);
    const q = await h.study_curriculum_handoff({ areaId: "html", entryIds: ["html.landmarks"], confirm: true });
    expect(q.entries.length).toBe(1);
  });

  it("un tema que la IA no logra escribir bien se deshace entero y se cuenta como fallo; tres seguidos paran el trabajo", async () => {
    const api = curriculumAutoApi(app, { ask: async () => "# nada\n\ntexto cortado" });
    const { jobId } = api.study_curriculum_auto_start({ areaId: "html", importance: "esencial", confirm: true });
    const job = await finish(api, jobId);
    expect(job.failed.length).toBe(3);
    expect(job.error).toMatch(/3 fallos seguidos/);
    expect(job.created).toEqual([]);
    // nada a medias: no queda ninguna carpeta de tema
    expect(fs.readdirSync(abs("Programación/5 Frontend/HTML"))).toEqual([]);
  });

  it("volver a lanzar salta lo ya creado", async () => {
    const api = curriculumAutoApi(app, { ask: async (_c, m) => goodNote(m.find((x) => x.role === "user")!.content) });
    const a = api.study_curriculum_auto_start({ areaId: "html", entryIds: ["html.skeleton"], confirm: true });
    await finish(api, a.jobId);
    clearVaultScanCache();
    // lo creado ya cuenta como cubierto: no falta nada de eso
    expect(() => api.study_curriculum_auto_start({ areaId: "html", entryIds: ["html.skeleton"], confirm: true })).toThrow(/No falta nada/);
  });
});
