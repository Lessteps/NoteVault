// `programming_practice`: the area for practice that is DONE, not studied. Daily katas are ordinary exercises (see
// `pp_kata` in the skill catalogue); everything here is the weekly PROJECT pipeline in four phases:
//
//   pp_build      the AI writes a SPECIFICATION (ideas → spec, validated; or a plan of several weeks)
//   pp_construct  the app creates the project folder named by the spec; the learner writes the code
//   pp_defend     the app reads the project, runs the checks, the AI reviews each layer and interrogates the learner
//   pp_postmortem the AI turns it into the learner's PROFILE, which the next pp_build reads
//
// Providers: HTTP ones (DeepSeek, a local server…). Every exchange is written to a chat conversation so it can be read.

import * as fs from "node:fs";
import * as path from "node:path";
import { AIConfig } from "../../core/aiClient.js";
import { ApiError } from "../../core/errors.js";
import { detectChecks, runChecks, summarizeChecks, type CheckResult } from "../../core/ppractice/checks.js";
import { PP_DEFAULT_SKILLS, PP_FOLDER, PP_KATA_FOLDER, PP_PROJECTS_FOLDER, PP_SPECS_FOLDER } from "../../core/ppractice/defaults.js";
import {
  finalMessages, gradeDefenseMessages, ideasMessages, parseDefenseGrade, parseFinal, parseIdeas, parsePlan, parsePostmortem, parseReview, planFocuses, planMessages,
  postmortemMessages, reviewMessages, specFromReply, specMessages, clientForFocus, type DefenseGrade, type FinalReport, type Idea, type LayerReport, type Msg,
} from "../../core/ppractice/prompts.js";
import { applyPostmortem, loadProfile, profileSummary, saveProfile, suggestFocus, topWeaknesses, type Postmortem } from "../../core/ppractice/profile.js";
import { changedSince, estimateTokens, readProject, renderFiles, selectFiles, type PackedFile, type ProjectPack } from "../../core/ppractice/reader.js";
import { CLIENTS, FOCUSES, normalizeSpec, renderSpecMarkdown, sanitizeFolderName, validateSpec, type ClientKind, type Focus, type ProjectSpec } from "../../core/ppractice/spec.js";
import { StudyErrorManager } from "../../core/studyErrorManager.js";
import * as store from "../../core/store.js";
import { AppConfig } from "../appConfig.js";
import type { AppState } from "../appState.js";
import { ChatLog } from "./studySpace.js";
import { askStructured } from "./study.js";

const MAX_SPEC_ATTEMPTS = 3;

interface ProjectState {
  version: 1;
  state: "building" | "defended" | "done";
  spec: ProjectSpec;
  createdAt: string;
  defense?: {
    n: number;
    at: string;
    final: FinalReport;
    layers: LayerReport[];
    checks: CheckResult[];
    manifest: Record<string, string>;
    grade?: DefenseGrade;
  };
  postmortem?: { at: string; score: number };
}

export interface PpProjectInfo {
  folder: string;
  title: string;
  state: "spec" | "building" | "defended" | "done";
  focus: string;
  client: string;
  score?: number;
}

const today = (): string => new Date().toISOString().slice(0, 10);
const readText = (p: string): string => {
  try {
    return fs.readFileSync(p, "utf-8");
  } catch {
    return "";
  }
};

export function ppApi(app: AppState) {
  /** The programming study space: the top-level folder whose overview says `subject: programming`. */
  const spaceName = (): string => {
    const dirs = fs.readdirSync(app.root, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith("."));
    for (const d of dirs) {
      const head = readText(path.join(app.root, d.name, `${d.name}.resumen.md`)).slice(0, 800);
      if (/^subject:\s*["']?programming["']?\s*$/m.test(head)) return d.name;
    }
    return dirs.find((d) => /^programaci[oó]n$/i.test(d.name))?.name ?? "";
  };
  const need = (): string => {
    const s = spaceName();
    if (!s) throw new ApiError("No hay un espacio de Programación en esta bóveda.");
    return s;
  };
  const areaAbs = (): string => path.join(app.root, need(), PP_FOLDER);
  const specsAbs = (): string => path.join(areaAbs(), PP_PROJECTS_FOLDER, PP_SPECS_FOLDER);
  const projectsAbs = (): string => path.join(areaAbs(), PP_PROJECTS_FOLDER);
  const projectAbs = (folder: string): string => {
    const name = sanitizeFolderName(folder);
    if (!name) throw new ApiError("Indica el proyecto.");
    return path.join(projectsAbs(), name);
  };

  const aiConfig = (): AIConfig => {
    const cfg = AIConfig.fromDict(AppConfig.get_ai_config());
    if (cfg.is_bridge) throw new ApiError("El proveedor de IA está en modo puente; esta función necesita un proveedor conectado (DeepSeek, un servidor local…).");
    return cfg;
  };

  const skillText = (name: string): string => readText(path.join(areaAbs(), "_skills", `${name}.md`)) || PP_DEFAULT_SKILLS[name] || "";

  /** One structured call: validated by `parse`, retried with a bigger budget when the answer was cut off, and logged to the chat. */
  const ask = async <T>(chat: ChatLog, cfg: AIConfig, label: string, messages: Msg[], parse: (reply: string) => T): Promise<T> => {
    const accept = (r: string): boolean => {
      try {
        parse(r);
        return true;
      } catch {
        return false;
      }
    };
    let reply = "";
    try {
      reply = await askStructured(cfg, messages, accept);
      const value = parse(reply);
      chat.exchange(`${label}\n\n${messages[1]?.content.slice(0, 1200) ?? ""}`, reply);
      return value;
    } catch (e: any) {
      chat.exchange(label, reply || String(e?.message ?? e), true);
      throw new ApiError(`${label}: ${e?.message ?? e}`);
    }
  };

  const topicNames = (): string[] => {
    const root = path.join(app.root, need());
    const out: string[] = [];
    for (const area of fs.readdirSync(root, { withFileTypes: true })) {
      if (!area.isDirectory() || !/^\d/.test(area.name)) continue;
      for (const t of fs.readdirSync(path.join(root, area.name), { withFileTypes: true })) if (t.isDirectory() && /^\d/.test(t.name)) out.push(t.name);
    }
    return out;
  };

  const previousProjects = (): string[] => {
    const names = new Set<string>();
    for (const dir of [projectsAbs(), specsAbs()]) {
      try {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          if (e.name.startsWith(".") || e.name === PP_SPECS_FOLDER || e.name.startsWith("00 Plan")) continue;
          names.add(e.name.replace(/\.(spec\.json|md)$/i, ""));
        }
      } catch {
        /* nothing yet */
      }
    }
    return [...names];
  };

  const loadState = (folder: string): ProjectState => {
    const state = store.loadJson<ProjectState>(path.join(projectAbs(folder), ".pp.json"), null);
    if (!state?.spec) throw new ApiError("Esa carpeta no es un proyecto de práctica (falta .pp.json). Créala con pp_construct.");
    return state;
  };
  const saveState = (folder: string, state: ProjectState): void => store.writeJson(path.join(projectAbs(folder), ".pp.json"), state);

  const loadSpec = (folder: string): ProjectSpec => {
    const raw = store.loadJson<ProjectSpec>(path.join(specsAbs(), `${sanitizeFolderName(folder)}.spec.json`), null);
    if (!raw) throw new ApiError(`No hay una especificación llamada «${folder}». Genérala con pp_build.`);
    return raw;
  };

  // ── defence helpers ──────────────────────────────────────────────────────

  /** Tests go with the layer they test: Python tests with the backend, the rest with the client when the project has one there. */
  const layerFiles = (pack: ProjectPack, layer: "database" | "backend" | "client", only?: ReadonlySet<string>): ReadonlySet<string> => {
    const clientTops = new Set(pack.files.filter((f) => f.group === "client").map((f) => f.rel.split("/")[0]));
    const mine = (f: PackedFile): boolean => {
      if (f.group === "database") return layer === "database";
      if (f.group === "client") return layer === "client";
      if (f.group === "backend" || f.group === "config") return layer === "backend" || (layer === "client" && f.group === "config" && clientTops.has(f.rel.split("/")[0]));
      if (f.group === "tests") {
        const clientTest = !f.rel.endsWith(".py") && clientTops.has(f.rel.split("/")[0]);
        return layer === (clientTest ? "client" : "backend");
      }
      return false;
    };
    return new Set(pack.files.filter((f) => mine(f) && (!only || only.has(f.rel))).map((f) => f.rel));
  };

  const LAYER_BUDGET = { database: 16_000, backend: 40_000, client: 40_000 } as const;
  const LAYERS = ["database", "backend", "client"] as const;

  const previousIssues = (state: ProjectState): string =>
    (state.defense?.layers ?? []).flatMap((l) => l.issues.map((i) => `- [${l.layer}/${i.severity}] ${i.file}${i.line ? `:${i.line}` : ""} ${i.problem}`)).slice(0, 14).join("\n");

  const defenseMarkdown = (state: ProjectState, n: number): string => {
    const d = state.defense!;
    const sev = (s: string) => (s === "high" ? "🔴" : s === "medium" ? "🟠" : "🟡");
    return [
      `# Defense ${n} — ${state.spec.title}`,
      "",
      `**Functional:** ${d.final.functional ? "yes" : "no"} · **Score:** ${d.final.score}/100 · ${d.at.slice(0, 10)}`,
      "",
      d.final.summary,
      "",
      "## Must fix",
      d.final.mustFix.length ? d.final.mustFix.map((m) => `- ${m}`).join("\n") : "- Nothing blocking.",
      "",
      "## Automatic checks",
      summarizeChecks(d.checks),
      "",
      ...d.layers.flatMap((l) => [
        `## ${l.layer[0]!.toUpperCase()}${l.layer.slice(1)} — ${l.verdict}`,
        ...l.criteria.map((c) => `- [${c.met ? "x" : " "}] ${c.criterion}${c.evidence ? ` — ${c.evidence}` : ""}`),
        "",
        ...l.issues.map((i) => `- ${sev(i.severity)} **${i.file}${i.line ? `:${i.line}` : ""}** ${i.problem}\n  - Why: ${i.why}\n  - Fix: ${i.fix}`),
        ...(l.strengths.length ? ["", ...l.strengths.map((s) => `- ✅ ${s}`)] : []),
        ...(l.notJudgeable.length ? ["", `Could not be judged: ${l.notJudgeable.join("; ")}`] : []),
        "",
      ]),
      "## Defence questions",
      ...d.final.questions.map((q) => `${q.id}. ${q.question}`),
      ...(d.grade
        ? ["", "## Defence result", `**Score:** ${d.grade.score}/100`, "", d.grade.summary, "", ...d.grade.items.map((i) => `- ${i.id}: ${i.verdict} — ${i.feedback}`), ...(d.grade.gaps.length ? ["", `Review: ${d.grade.gaps.join("; ")}`] : [])]
        : []),
      "",
    ].join("\n");
  };

  return {
    /** What the area looks like now: ready or not, the profile and every project with its phase. */
    pp_status() {
      const space = spaceName();
      if (!space) return { space: "", ready: false, projects: [] as PpProjectInfo[], kataReady: false, weaknesses: [], suggestedFocus: null as Focus | null, summary: "" };
      const area = path.join(app.root, space, PP_FOLDER);
      const profile = loadProfile(app.root);
      const projects: PpProjectInfo[] = [];
      const specsDir = path.join(area, PP_PROJECTS_FOLDER, PP_SPECS_FOLDER);
      const built = new Set<string>();
      try {
        for (const e of fs.readdirSync(path.join(area, PP_PROJECTS_FOLDER), { withFileTypes: true })) {
          if (!e.isDirectory() || e.name === PP_SPECS_FOLDER || e.name.startsWith(".")) continue;
          const st = store.loadJson<ProjectState>(path.join(area, PP_PROJECTS_FOLDER, e.name, ".pp.json"), null);
          if (!st?.spec) continue;
          built.add(e.name);
          projects.push({ folder: e.name, title: st.spec.title, state: st.state, focus: st.spec.focus, client: st.spec.client, ...(st.defense ? { score: st.defense.grade?.score ?? st.defense.final.score } : {}) });
        }
        for (const e of fs.readdirSync(specsDir, { withFileTypes: true })) {
          const m = /^(.*)\.spec\.json$/.exec(e.name);
          if (!m || built.has(m[1]!)) continue;
          const sp = store.loadJson<ProjectSpec>(path.join(specsDir, e.name), null);
          if (sp) projects.push({ folder: m[1]!, title: sp.title, state: "spec", focus: sp.focus, client: sp.client });
        }
      } catch {
        /* no projects yet */
      }
      return {
        space,
        ready: fs.existsSync(area),
        projects,
        kataReady: fs.existsSync(path.join(area, PP_KATA_FOLDER, `${PP_KATA_FOLDER}.practica.md`)),
        weaknesses: topWeaknesses(profile, 5).map((w) => ({ label: w.label, layer: w.layer, count: w.count, status: w.status })),
        suggestedFocus: suggestFocus(profile),
        summary: profileSummary(profile),
      };
    },

    /** Creates the area (folders, the vault skills, the kata topic). Safe to repeat: nothing that exists is overwritten. */
    pp_init() {
      const area = areaAbs();
      for (const sub of [PP_KATA_FOLDER, path.join(PP_PROJECTS_FOLDER, PP_SPECS_FOLDER), "_skills"]) fs.mkdirSync(path.join(area, sub), { recursive: true });
      const created: string[] = [];
      for (const [name, text] of Object.entries(PP_DEFAULT_SKILLS)) {
        const file = path.join(area, "_skills", `${name}.md`);
        if (!fs.existsSync(file)) {
          store.writeText(file, text);
          created.push(app.rel(file));
        }
      }
      const practica = path.join(area, PP_KATA_FOLDER, `${PP_KATA_FOLDER}.practica.md`);
      if (!fs.existsSync(practica)) {
        store.writeText(practica, ["---", "type: practica", "subject: programming", "title: Daily logic kata", "topic_type: procedural", 'skills: ["pp_kata"]', "min_per_skill: 6", "target_difficulty: 3", "exam: required", "---", "", "# Práctica — Daily logic kata", "", "Un reto de lógica por día. Los que falles vuelven con repaso espaciado.", ""].join("\n"));
        created.push(app.rel(practica));
      }
      const note = path.join(area, PP_KATA_FOLDER, `${PP_KATA_FOLDER}.md`);
      if (!fs.existsSync(note)) {
        store.writeText(note, ["# Daily logic kata", "", "One short logic problem a day (20–30 minutes), in Python or TypeScript. Patterns in order of difficulty: arrays and strings, hashing, recursion, sorting and searching, two pointers, stacks and queues, trees and graphs, dynamic programming.", "", "Open the practice view of this topic to generate today's kata. A failed kata comes back later; ask the assistant for the kata postmortem to find the pattern behind the failures.", ""].join("\n"));
        created.push(app.rel(note));
      }
      return { ok: true, area: app.rel(area), created };
    },

    pp_profile() {
      const p = loadProfile(app.root);
      return { ...p, summary: profileSummary(p), suggestedFocus: suggestFocus(p) };
    },

    /** Phase 1a: three ideas, aimed at the learner's weak points. */
    async pp_ideas(opts: { focus?: string; client?: string; notes?: string } = {}) {
      const cfg = aiConfig();
      const profile = loadProfile(app.root);
      const focus = (FOCUSES as readonly string[]).includes(String(opts.focus)) ? (opts.focus as Focus) : suggestFocus(profile) ?? undefined;
      const client = (CLIENTS as readonly string[]).includes(String(opts.client)) ? (opts.client as ClientKind) : focus ? clientForFocus(focus) : undefined;
      const chat = new ChatLog(undefined, "Práctica: ideas de proyecto", cfg.model);
      const ideas = await ask(chat, cfg, "Ideas de proyecto", ideasMessages({ skill: skillText("pp_build_skill"), profile: profileSummary(profile), previous: previousProjects(), focus, client, notes: opts.notes }), parseIdeas);
      return { ideas, focus: focus ?? null, conversationId: chat.id };
    },

    /** Phase 1b: the specification file. Rejected and regenerated until it satisfies every rule. */
    async pp_build(req: { idea?: Partial<Idea> & { title?: string }; focus?: string; client?: string; notes?: string; week?: number }) {
      const cfg = aiConfig();
      const profile = loadProfile(app.root);
      const idea = req.idea ?? {};
      const focus = ((FOCUSES as readonly string[]).includes(String(idea.focus ?? req.focus)) ? (idea.focus ?? req.focus) : suggestFocus(profile) ?? "backend") as Focus;
      const client = ((CLIENTS as readonly string[]).includes(String(idea.client ?? req.client)) ? (idea.client ?? req.client) : clientForFocus(focus)) as ClientKind;
      const ideaText = [idea.title, idea.problem, req.notes].filter(Boolean).join(" — ").trim();
      if (!ideaText) throw new ApiError("Indica una idea o elige una de las propuestas.");
      const topics = topicNames();
      const known = new Set(topics);
      const chat = new ChatLog(undefined, `Práctica: especificación — ${idea.title ?? ideaText.slice(0, 40)}`, cfg.model);
      let fix: string[] | undefined;
      let spec: ProjectSpec | null = null;
      let problems: string[] = [];
      for (let attempt = 1; attempt <= MAX_SPEC_ATTEMPTS; attempt++) {
        const msgs = specMessages({ skill: skillText("pp_build_skill"), profile: profileSummary(profile), focus, client, idea: ideaText, topics, previous: previousProjects(), fix });
        const raw = await ask(chat, cfg, `Especificación (intento ${attempt})`, msgs, specFromReply);
        const candidate = normalizeSpec(raw);
        // The learner's choice of focus and client wins over whatever the model wrote.
        candidate.focus = focus;
        candidate.client = client;
        problems = validateSpec(candidate, known);
        if (!problems.length) {
          spec = candidate;
          break;
        }
        chat.note(`Especificación rechazada (intento ${attempt}):\n${problems.map((p) => `- ${p}`).join("\n")}`);
        fix = problems;
      }
      if (!spec) throw new ApiError(`La IA no logró una especificación válida en ${MAX_SPEC_ATTEMPTS} intentos. Último rechazo: ${problems.slice(0, 3).join(" | ")}`);
      if (previousProjects().includes(spec.folder)) spec.folder = `${spec.folder} ${today()}`;
      fs.mkdirSync(specsAbs(), { recursive: true });
      const mdPath = path.join(specsAbs(), `${spec.folder}.md`);
      store.writeText(mdPath, renderSpecMarkdown(spec, { created: today(), ...(req.week ? { week: req.week } : {}) }));
      store.writeJson(path.join(specsAbs(), `${spec.folder}.spec.json`), spec);
      return { folder: spec.folder, rel: app.rel(mdPath), spec, conversationId: chat.id };
    },

    /** A plan of N weeks: focuses rotate (weakest first), each week gets an idea. Specs are generated one by one afterwards. */
    async pp_plan(opts: { weeks?: number; notes?: string } = {}) {
      const cfg = aiConfig();
      const weeks = Math.max(1, Math.min(Number(opts.weeks) || 4, 12));
      const profile = loadProfile(app.root);
      const used = profile.history.filter((h) => h.kind === "project" && h.focus).map((h) => String(h.focus));
      const focuses = planFocuses(weeks, suggestFocus(profile), used);
      const chat = new ChatLog(undefined, `Práctica: plan de ${weeks} semanas`, cfg.model);
      const plan = await ask(chat, cfg, `Plan de ${weeks} semanas`, planMessages({ skill: skillText("pp_build_skill"), profile: profileSummary(profile), focuses, previous: previousProjects(), notes: opts.notes }), parsePlan);
      // The focus of each week is the one computed here, whatever the model wrote.
      const fixed = plan.slice(0, weeks).map((w, i) => ({ ...w, week: i + 1, focus: focuses[i]!, client: clientForFocus(focuses[i]!) }));
      fs.mkdirSync(specsAbs(), { recursive: true });
      const file = path.join(specsAbs(), `00 Plan — ${today()}.md`);
      store.writeText(file, ["---", "type: pp_plan", "subject: programming", `created: ${today()}`, "---", "", `# Project plan — ${weeks} weeks`, "", ...fixed.flatMap((w) => [`## Week ${w.week}: ${w.title}`, `**Focus:** ${w.focus} · **Client:** ${w.client} · **${w.hours} h**`, "", w.problem, "", w.why ? `_Why now:_ ${w.why}` : "", ""]), "Ask for each specification with `pp_build` when the week starts.", ""].join("\n"));
      return { plan: fixed, rel: app.rel(file), conversationId: chat.id };
    },

    /** Phase 2: creates the project folder with the exact name of the specification. The learner writes the code. */
    pp_construct(folder: string) {
      const spec = loadSpec(folder);
      const dir = projectAbs(spec.folder);
      if (fs.existsSync(path.join(dir, ".pp.json"))) throw new ApiError(`«${spec.folder}» ya está en construcción.`);
      fs.mkdirSync(dir, { recursive: true });
      store.writeText(path.join(dir, "SPEC.md"), readText(path.join(specsAbs(), `${spec.folder}.md`)) || renderSpecMarkdown(spec, { created: today() }));
      const checklist = [
        `# Checklist — ${spec.title}`,
        "",
        "Order of work: database → backend → client → focus criteria → automation extra.",
        "",
        "## Database",
        ...spec.database.criteria.map((c) => `- [ ] ${c}`),
        "",
        "## Backend",
        ...spec.backend.criteria.map((c) => `- [ ] ${c}`),
        "",
        "## Client",
        ...spec.clientLayer.criteria.map((c) => `- [ ] ${c}`),
        "",
        `## Focus: ${spec.focus}`,
        ...spec.focusCriteria.map((c) => `- [ ] ${c}`),
        ...(spec.automation ? ["", "## Automation (extra)", ...spec.automation.criteria.map((c) => `- [ ] ${c}`)] : []),
        "",
      ].join("\n");
      store.writeText(path.join(dir, "CHECKLIST.md"), checklist);
      store.writeText(path.join(dir, "README.md"), [`# ${spec.title}`, "", spec.problem, "", "## Run it", "", "_Write here how to install, run and test the project._", "", "## Decisions", "", "_Write here the design decisions and why (you will defend them)._", ""].join("\n"));
      saveState(spec.folder, { version: 1, state: "building", spec, createdAt: new Date().toISOString() });
      return { ok: true, rel: app.rel(dir) };
    },

    /** What a defence would send, before spending a token: files and estimated tokens per layer, and the checks that would run. */
    pp_defend_estimate(folder: string, onlyChanged = false) {
      const state = loadState(folder);
      const pack = readProject(projectAbs(folder));
      const diff = onlyChanged && state.defense ? changedSince(pack, state.defense.manifest) : null;
      const only = diff ? new Set(diff.changed.map((f) => f.rel)) : undefined;
      const layers = LAYERS.map((layer) => {
        const sel = selectFiles(pack, { groups: ["database", "backend", "client", "tests", "config"], budget: LAYER_BUDGET[layer], only: new Set([...layerFiles(pack, layer, only)]) });
        return { layer, files: sel.files.length, left: sel.left.length, tokens: sel.estimatedTokens };
      });
      const overhead = estimateTokens(4 * 5200);
      return {
        layers,
        totalTokens: layers.reduce((s, l) => s + l.tokens, 0) + overhead,
        skipped: pack.skipped.length,
        changed: diff ? diff.changed.length : null,
        checks: detectChecks(projectAbs(folder)).map((c) => ({ label: c.label, skip: c.skip ?? "" })),
        previousDefenses: state.defense?.n ?? 0,
      };
    },

    /** Phase 3a: facts first (build, tests), then one review per layer and the closing verdict with the defence questions. */
    async pp_defend(folder: string, opts: { runChecks?: boolean; onlyChanged?: boolean } = {}) {
      const state = loadState(folder);
      const cfg = aiConfig();
      const dir = projectAbs(folder);
      const profile = loadProfile(app.root);
      const pack = readProject(dir);
      const diff = opts.onlyChanged && state.defense ? changedSince(pack, state.defense.manifest) : null;
      const only = diff ? new Set(diff.changed.map((f) => f.rel)) : undefined;
      const checks = opts.runChecks === false ? [] : await runChecks(dir, detectChecks(dir));
      const checksText = summarizeChecks(checks);
      const spec = state.spec;
      const specMd = readText(path.join(dir, "SPEC.md")) || renderSpecMarkdown(spec, { created: "" });
      const chat = new ChatLog(undefined, `Práctica: defensa — ${spec.title}`, cfg.model);
      chat.note(`Comprobaciones automáticas:\n${checksText}`);
      const criteria = { database: spec.database.criteria, backend: spec.backend.criteria, client: spec.clientLayer.criteria } as const;
      const reports: LayerReport[] = [];
      for (const layer of LAYERS) {
        const sel = selectFiles(pack, { groups: ["database", "backend", "client", "tests", "config"], budget: LAYER_BUDGET[layer], only: new Set([...layerFiles(pack, layer, only)]) });
        const msgs = reviewMessages({ skill: skillText("pp_defend_skill"), spec: specMd, layer, criteria: criteria[layer], focusCriteria: spec.focusCriteria, files: renderFiles(sel.files), checks: checksText, profile: profileSummary(profile, 700), previous: diff ? previousIssues(state) : undefined });
        reports.push(await ask(chat, cfg, `Revisión: ${layer}`, msgs, (r) => parseReview(r, layer)));
      }
      const final = await ask(chat, cfg, "Veredicto final y preguntas", finalMessages(specMd, reports, checks, profileSummary(profile, 700)), parseFinal);
      const n = (state.defense?.n ?? 0) + 1;
      state.defense = { n, at: new Date().toISOString(), final, layers: reports, checks, manifest: pack.manifest };
      state.state = "defended";
      saveState(folder, state);
      const mdPath = path.join(dir, `DEFENSE-${n}.md`);
      store.writeText(mdPath, defenseMarkdown(state, n));
      return { n, rel: app.rel(mdPath), final, layers: reports, checks, conversationId: chat.id };
    },

    /** Phase 3b: the learner's answers to the defence questions, graded on understanding. */
    async pp_defend_grade(folder: string, answers: Record<string, string>) {
      const state = loadState(folder);
      if (!state.defense) throw new ApiError("Primero hay que pasar la revisión (pp_defend).");
      const cfg = aiConfig();
      const qa = state.defense.final.questions.map((q) => ({ id: q.id, question: q.question, answer: String(answers?.[q.id] ?? "") }));
      if (!qa.some((q) => q.answer.trim())) throw new ApiError("Responde al menos una pregunta.");
      const chat = new ChatLog(undefined, `Práctica: defensa oral — ${state.spec.title}`, cfg.model);
      const grade = await ask(chat, cfg, "Calificación de la defensa", gradeDefenseMessages(renderSpecMarkdown(state.spec, { created: "" }), state.defense.final, qa), parseDefenseGrade);
      state.defense.grade = grade;
      saveState(folder, state);
      store.writeText(path.join(projectAbs(folder), `DEFENSE-${state.defense.n}.md`), defenseMarkdown(state, state.defense.n));
      return { grade, conversationId: chat.id };
    },

    /** Phase 4: the postmortem feeds the profile that the next pp_build reads. */
    async pp_postmortem(folder: string) {
      const state = loadState(folder);
      if (!state.defense) throw new ApiError("Primero hay que defender el proyecto (pp_defend).");
      const cfg = aiConfig();
      const d = state.defense;
      const review = d.layers.map((l) => `${l.layer}: ${l.verdict}\n${l.issues.map((i) => `- [${i.severity}] ${i.file}${i.line ? `:${i.line}` : ""} ${i.problem}`).join("\n")}\nstrengths: ${l.strengths.join("; ")}`).join("\n\n");
      const chat = new ChatLog(undefined, `Práctica: postmortem — ${state.spec.title}`, cfg.model);
      const pm: Postmortem = await ask(
        chat,
        cfg,
        "Postmortem",
        postmortemMessages({ kind: "project", project: state.spec.title, skill: skillText("pp_postmortem_skill"), spec: renderSpecMarkdown(state.spec, { created: "" }), reviewSummary: `${d.final.summary}\n\n${review}\n\nChecks:\n${summarizeChecks(d.checks)}`, defenseSummary: d.grade ? `${d.grade.summary}\nGaps: ${d.grade.gaps.join("; ")}` : "The oral defence was not answered.", profile: profileSummary(loadProfile(app.root), 900) }),
        (r) => parsePostmortem(r, { kind: "project", project: state.spec.title }),
      );
      pm.focus = state.spec.focus;
      pm.score = d.grade ? Math.round((d.final.score + d.grade.score) / 2) : d.final.score;
      const next = applyPostmortem(loadProfile(app.root), pm, new Date().toISOString());
      saveProfile(app.root, next);
      state.state = "done";
      state.postmortem = { at: new Date().toISOString(), score: pm.score };
      saveState(folder, state);
      const mdPath = path.join(projectAbs(folder), "POSTMORTEM.md");
      store.writeText(mdPath, [`# Postmortem — ${state.spec.title}`, "", `**Score:** ${pm.score}/100 · **Focus:** ${state.spec.focus}`, "", pm.summary, "", "## What to work on", ...pm.weaknesses.map((w) => `- **[${w.layer}] ${w.label}**${w.evidence?.[0]?.file ? ` (${w.evidence[0].file}${w.evidence[0].line ? `:${w.evidence[0].line}` : ""})` : ""}`), "", "## What went well", ...pm.strengths.map((s) => `- ${s}`), "", "## How you write code", ...pm.styleNotes.map((s) => `- ${s}`), ...(pm.nextFocus ? ["", `## Next focus\n${pm.nextFocus}`] : []), ""].join("\n"));
      return { postmortem: pm, rel: app.rel(mdPath), summary: profileSummary(next), conversationId: chat.id };
    },

    /** The kata track's own postmortem: the pattern behind the recent failed katas. */
    async pp_kata_postmortem() {
      const cfg = aiConfig();
      const errors = new StudyErrorManager(app.root).errors("programming", null, false).filter((e) => e.skill === "pp_kata" || e.discipline === "programming_practice" || /programming_practice[\\/]kata/i.test(e.source_note)).slice(0, 25);
      if (!errors.length) throw new ApiError("Aún no hay retos de lógica fallados que analizar.");
      const evidence = errors.map((e) => `- ${e.topic || "kata"} [${e.category}] ${e.description_en || e.explanation} | wrong: ${String(e.wrong_answer).slice(0, 160)} | expected: ${String(e.expected).slice(0, 160)}`).join("\n");
      const chat = new ChatLog(undefined, "Práctica: postmortem de retos de lógica", cfg.model);
      const pm = await ask(chat, cfg, "Postmortem de retos", postmortemMessages({ kind: "kata", project: "Daily logic katas", skill: skillText("pp_kata_skill"), spec: "", reviewSummary: "", defenseSummary: "", profile: profileSummary(loadProfile(app.root), 900), evidence }), (r) => parsePostmortem(r, { kind: "kata", project: "Daily logic katas" }));
      pm.kind = "kata";
      const next = applyPostmortem(loadProfile(app.root), pm, new Date().toISOString());
      saveProfile(app.root, next);
      return { postmortem: pm, summary: profileSummary(next), conversationId: chat.id };
    },
  };
}
