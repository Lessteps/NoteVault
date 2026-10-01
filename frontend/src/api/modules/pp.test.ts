import * as fs from "node:fs";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ config: {} as Record<string, unknown>, convDir: "" }));
vi.mock("../appConfig.js", () => ({
  AppConfig: { get_ai_config: () => state.config, get_conversations_dir: () => state.convDir },
  APP_DATA_DIR: os.tmpdir(),
}));

import { validSpecRaw } from "../../core/ppractice/fixtures";
import { AppState } from "../appState";
import { ppApi } from "./pp";

// A real local server stands in for DeepSeek: it answers by what the system prompt asks for and records every request.
type Req = { system: string; user: string };
let server: http.Server;
let port = 0;
let requests: Req[] = [];
let specAttempts = 0;
let ideaCalls = 0;

const final = { functional: true, score: 72, summary: "Works end to end with gaps in validation.", mustFix: ["Validate the update payload"], questions: [1, 2, 3, 4, 5, 6].map((i) => ({ id: `q${i}`, question: `Question ${i} about your code?`, why: "probes a decision" })) };
const review = (layer: string) => ({ layer, verdict: "partial", criteria: [{ criterion: "A criterion", met: layer !== "backend", evidence: "file shows it" }], issues: layer === "backend" ? [{ severity: "high", file: "app/routes.py", line: 41, problem: "No validation on PUT", why: "bad input is stored", fix: "validate with a schema" }] : [], strengths: ["Clear structure"], notJudgeable: [] });

function reply(system: string): unknown {
  if (/proposes? \d+ ideas|You propose 3 ideas/i.test(system)) {
    ideaCalls++;
    return { ideas: [{ title: "Link shortener", problem: "Short codes with visit counts", client: "web", focus: "backend", hours: 10, why: "fits you" }] };
  }
  if (/write the SPECIFICATION/i.test(system)) {
    specAttempts++;
    const raw: any = validSpecRaw();
    if (specAttempts === 1) delete raw.database; // the first attempt breaks the rule: no database layer
    return raw;
  }
  if (/plan a sequence of weekly projects/i.test(system)) {
    return { weeks: [1, 2, 3].map((w) => ({ week: w, title: `Project ${w}`, problem: "A real small tool", client: "web", focus: "frontend", hours: 10, why: "next step" })) };
  }
  const layer = /review the (DATABASE|BACKEND|CLIENT) layer/i.exec(system)?.[1];
  if (layer) return review(layer.toLowerCase());
  if (/close the review/i.test(system)) return final;
  if (/grade a learner's oral defence/i.test(system)) return { score: 60, items: [{ id: "q1", verdict: "good", feedback: "clear" }, { id: "q2", verdict: "weak", feedback: "vague" }], summary: "Mixed.", gaps: ["transactions"] };
  if (/POSTMORTEM/.test(system)) {
    return { kind: "project", project: "x", score: 66, summary: "Solid base, weak validation.", coveredLayers: ["backend", "database", "client"], weaknesses: [{ label: "No input validation on update endpoints", layer: "backend", evidence: [{ file: "app/routes.py", line: 41, note: "PUT trusts the body" }] }], strengths: ["Clear repository layer"], styleNotes: ["Short functions"], nextFocus: "backend" };
  }
  return {};
}

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const msgs: Array<{ role: string; content: string }> = JSON.parse(body).messages;
      const system = msgs.find((m) => m.role === "system")?.content ?? "";
      const user = msgs.filter((m) => m.role === "user").map((m) => m.content).join("\n");
      requests.push({ system, user });
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(reply(system)) } }] }));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = (server.address() as { port: number }).port;
});
afterAll(() => server.close());

let root: string;
let api: ReturnType<typeof ppApi>;
const read = (rel: string) => fs.readFileSync(path.join(root, ...rel.split("/")), "utf-8");
const exists = (rel: string) => fs.existsSync(path.join(root, ...rel.split("/")));
const PP = "Programación/programming_practice";

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "nv_pp_api_"));
  state.convDir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_pp_conv_"));
  state.config = { provider: "openai_compatible", base_url: `http://127.0.0.1:${port}/v1`, model: "fake", max_tokens: 4000 };
  requests = [];
  specAttempts = 0;
  ideaCalls = 0;
  fs.mkdirSync(path.join(root, "Programación", "4 Backend", "4.3 REST API design"), { recursive: true });
  fs.mkdirSync(path.join(root, "Programación", "4 Backend", "4.10 Errors and error contracts"), { recursive: true });
  fs.mkdirSync(path.join(root, "Programación", "6 Databases", "6.2 Table design"), { recursive: true });
  fs.writeFileSync(path.join(root, "Programación", "Programación.resumen.md"), "---\nsubject: programming\n---\n", "utf-8");
  api = ppApi(new AppState(root));
});

/** A built project the learner has "written": a tiny backend, a schema and a client file. */
function writeProject(folder: string) {
  const dir = path.join(root, ...`${PP}/projects/${folder}`.split("/"));
  const put = (rel: string, text: string) => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  };
  put("backend/app/routes.py", "def update(link):\n    return link\n");
  put("backend/migrations/001_init.sql", "CREATE TABLE links (id INTEGER PRIMARY KEY, code TEXT UNIQUE);\n");
  put("client/src/components/atoms/Button.tsx", "export const Button = () => null;\n");
}

describe("programming_practice area", () => {
  it("creates the area with its skills and the kata topic, and never overwrites an edited skill", () => {
    const out = api.pp_init();
    expect(out.created.length).toBeGreaterThanOrEqual(7);
    for (const skill of ["pp_build_skill", "pp_construct_skill", "pp_defend_skill", "pp_postmortem_skill", "pp_kata_skill"]) expect(exists(`${PP}/_skills/${skill}.md`)).toBe(true);
    expect(read(`${PP}/kata/kata.practica.md`)).toContain('skills: ["pp_kata"]');
    fs.writeFileSync(path.join(root, "Programación", "programming_practice", "_skills", "pp_build_skill.md"), "MY EDITED RULES", "utf-8");
    expect(api.pp_init().created).toEqual([]);
    expect(read(`${PP}/_skills/pp_build_skill.md`)).toBe("MY EDITED RULES");
    expect(api.pp_status()).toMatchObject({ ready: true, kataReady: true });
  });

  it("refuses to run without a Programación space", async () => {
    fs.rmSync(path.join(root, "Programación"), { recursive: true });
    await expect(api.pp_build({ idea: { title: "x" } })).rejects.toThrow(/espacio de Programación/);
  });

  it("refuses bridge providers: these calls need a connected model", async () => {
    api.pp_init();
    state.config = { provider: "bridge_claude" };
    await expect(api.pp_ideas()).rejects.toThrow(/modo puente/);
  });
});

describe("phase 1 — pp_build", () => {
  beforeEach(() => api.pp_init());

  it("proposes ideas", async () => {
    const out = await api.pp_ideas({ focus: "backend" });
    expect(out.ideas[0]!.title).toBe("Link shortener");
    expect(out.conversationId).toMatch(/^c\d{14}-/);
  });

  it("rejects a specification that misses a layer, tells the model why, and keeps the valid retry", async () => {
    const out = await api.pp_build({ idea: { title: "Link shortener", problem: "short codes", focus: "backend" } });
    expect(specAttempts).toBe(2);
    const retry = requests.filter((r) => /write the SPECIFICATION/i.test(r.system))[1]!;
    expect(retry.user).toContain("REJECTED");
    expect(retry.user).toContain("database: the layer is MANDATORY");
    expect(out.folder).toBe("Link shortener with stats");
    const md = read(`${PP}/projects/_specs/Link shortener with stats.md`);
    expect(md).toContain("## Database (mandatory)");
    expect(md).toContain("[[4.3 REST API design]]");
    expect(exists(`${PP}/projects/_specs/Link shortener with stats.spec.json`)).toBe(true);
    // the build phase only writes the specification: no project folder yet
    expect(exists(`${PP}/projects/Link shortener with stats`)).toBe(false);
  });

  it("plans N weeks with the focuses computed by the app, not the ones the model wrote", async () => {
    const out = await api.pp_plan({ weeks: 3 });
    expect(out.plan).toHaveLength(3);
    expect(new Set(out.plan.map((w) => w.focus)).size).toBe(3);
    expect(out.plan.every((w) => w.focus !== "frontend" || w.client === "web")).toBe(true);
    expect(read(out.rel)).toContain("# Project plan — 3 weeks");
  });
});

describe("phases 2 to 4 — construct, defend, postmortem", () => {
  const folder = "Link shortener with stats";
  beforeEach(async () => {
    api.pp_init();
    await api.pp_build({ idea: { title: "Link shortener", problem: "short codes" } });
  });

  it("constructs the folder named by the spec, once", () => {
    const out = api.pp_construct(folder);
    expect(out.rel).toBe(`${PP}/projects/${folder}`);
    for (const f of ["SPEC.md", "CHECKLIST.md", "README.md", ".pp.json"]) expect(exists(`${PP}/projects/${folder}/${f}`)).toBe(true);
    expect(read(`${PP}/projects/${folder}/CHECKLIST.md`)).toContain("- [ ] A migration script creates both tables from an empty database");
    expect(() => api.pp_construct(folder)).toThrow(/ya está en construcción/);
    expect(api.pp_status().projects.find((p) => p.folder === folder)?.state).toBe("building");
  });

  it("estimates the cost of a defence before spending anything", () => {
    api.pp_construct(folder);
    writeProject(folder);
    const before = requests.length;
    const est = api.pp_defend_estimate(folder);
    expect(est.layers.map((l) => l.layer)).toEqual(["database", "backend", "client"]);
    expect(est.layers.every((l) => l.files >= 1)).toBe(true);
    expect(est.totalTokens).toBeGreaterThan(0);
    expect(requests).toHaveLength(before); // estimating makes no model call
  });

  it("defends: three layer reviews plus the verdict, written next to the code and never mixed with it", async () => {
    api.pp_construct(folder);
    writeProject(folder);
    requests = [];
    const out = await api.pp_defend(folder, { runChecks: false });
    expect(requests).toHaveLength(4);
    expect(out.final.questions).toHaveLength(6);
    expect(out.layers.map((l) => l.layer)).toEqual(["database", "backend", "client"]);
    const md = read(out.rel);
    expect(md).toContain("**app/routes.py:41**");
    expect(md).toContain("## Defence questions");
    // the files reached the model, and the app's own files did not
    const backend = requests.find((r) => /BACKEND layer/i.test(r.system))!;
    expect(backend.user).toContain("def update(link)");
    expect(backend.user).not.toContain("SPEC.md");
    expect(api.pp_status().projects.find((p) => p.folder === folder)?.state).toBe("defended");
  });

  it("a second defence can send only what changed and asks to verify the earlier issues", async () => {
    api.pp_construct(folder);
    writeProject(folder);
    await api.pp_defend(folder, { runChecks: false });
    fs.appendFileSync(path.join(root, ...`${PP}/projects/${folder}/backend/app/routes.py`.split("/")), "\n# fixed\n");
    requests = [];
    const est = api.pp_defend_estimate(folder, true);
    expect(est.changed).toBe(1);
    await api.pp_defend(folder, { runChecks: false, onlyChanged: true });
    const backend = requests.find((r) => /BACKEND layer/i.test(r.system))!;
    expect(backend.user).toContain("PREVIOUS review");
    expect(backend.user).toContain("No validation on PUT");
    expect(backend.user).not.toContain("CREATE TABLE");
    expect(exists(`${PP}/projects/${folder}/DEFENSE-2.md`)).toBe(true);
  });

  it("grades the oral defence and records it in the report", async () => {
    api.pp_construct(folder);
    writeProject(folder);
    await api.pp_defend(folder, { runChecks: false });
    await expect(api.pp_defend_grade(folder, {})).rejects.toThrow(/al menos una pregunta/);
    const out = await api.pp_defend_grade(folder, { q1: "Because the repository isolates SQL", q2: "dunno" });
    expect(out.grade.score).toBe(60);
    expect(read(`${PP}/projects/${folder}/DEFENSE-1.md`)).toContain("## Defence result");
  });

  it("the postmortem writes the profile and the NEXT pp_build reads it", async () => {
    api.pp_construct(folder);
    writeProject(folder);
    await expect(api.pp_postmortem(folder)).rejects.toThrow(/defender el proyecto/);
    await api.pp_defend(folder, { runChecks: false });
    await api.pp_defend_grade(folder, { q1: "an answer" });
    const out = await api.pp_postmortem(folder);
    expect(out.postmortem.weaknesses[0]!.label).toBe("No input validation on update endpoints");
    expect(read(out.rel)).toContain("[backend] No input validation on update endpoints");
    expect(api.pp_status()).toMatchObject({ suggestedFocus: "backend" });
    expect(api.pp_status().projects.find((p) => p.folder === folder)?.state).toBe("done");

    requests = [];
    await api.pp_ideas();
    const prompt = requests.find((r) => /propose/i.test(r.system))!;
    expect(prompt.user).toContain("No input validation on update endpoints");
    expect(prompt.user).toContain(folder); // never repeat a previous project
    expect(ideaCalls).toBe(1);
  });

  it("the kata postmortem needs failed katas to analyse", async () => {
    await expect(api.pp_kata_postmortem()).rejects.toThrow(/retos de lógica fallados/);
  });
});
