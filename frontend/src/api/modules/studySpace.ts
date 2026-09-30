// Study spaces: a whole subject laid out by the AI, step by step and chosen by the
// user — the syllabus (areas and topics), the theory of each topic, the map of each
// topic, the practice plan (competency matrix) of each topic and the map of each area
// and of the whole space. Generation runs as a background job the panel polls, and
// EVERY exchange with the model is saved as a chat conversation, so the user can read
// in the assistant exactly what DeepSeek was asked and what it answered.

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { generateConcept } from "../../../tools/kb_canvas";
import { AIConfig } from "../../core/aiClient.js";
import { applyAssistantAction, safeName, subjectIdOf } from "../../core/assistantActions.js";
import { buildTenseMapCanvas, buildWordFamilyCanvas, TENSE_MAP_FILE, WORD_FAMILY_MAP_FILE } from "../../core/english/conceptMaps.js";
import { buildAreaMapCanvas, buildSpaceMapCanvas, type MapTopic, type SpaceMapArea, type TopicDependency } from "../../core/areaMap.js";
import { ConversationStore, type StoredMessage } from "../../core/conversations.js";
import { ensureDefaultSkills } from "../../core/defaultSkills.js";
import { ENGLISH_DEFAULT_SKILLS } from "../../core/englishDefaultSkills.js";
import { domainOfSubject } from "../../core/practice/domain.js";
import { branchFromPath, ENGLISH_BRANCH_BRIEF, ENGLISH_BRANCHES, ENGLISH_VOCABULARY_FOLDER, type EnglishBranch } from "../../lib/englishSkillData.js";
import { ApiError } from "../../core/errors.js";
import { clearExerciseIndexCache } from "../../core/practice/exerciseIndex.js";
import { readSkillTemplates } from "../../core/practice/skillTemplates.js";
import { AppConfig } from "../appConfig.js";
import type { AppState } from "../appState.js";
import { askStructured, clearStudySnapshotCache, reevaluateTopic } from "./study.js";

export interface SpaceTopic {
  name: string;
}
export interface SpaceArea {
  name: string;
  topics: SpaceTopic[];
}
export interface SpaceSteps {
  theory: boolean;
  practice: boolean;
  map: boolean;
}
export interface SpaceRequest {
  /** the folder that holds the space, e.g. "Matemáticas 1" */
  folder: string;
  /** what is studied, e.g. "Matemáticas" */
  subject: string;
  subjectId?: string;
  areas: SpaceArea[];
  steps: SpaceSteps;
  /** the chat conversation where this generation is being recorded */
  conversationId?: string;
  /** Generate only this topic (theory, topic map, competency matrix); skips area and space maps. */
  only?: string;
}

export interface SpaceJob {
  id: string;
  folder: string;
  log: string[];
  done: boolean;
  error: string;
  finished: number;
  total: number;
  conversationId: string;
}

const jobs = new Map<string, SpaceJob>();
const MAX_AREAS = 30;
const MAX_TOPICS = 40;

/** A theory note is complete when it reaches its last section; a cut-off one stops mid-way. */
const isCompleteTheory = (text: string): boolean => /##\s*Tarjetas[\s\S]{80,}/.test(text);
/** A note this generator wrote (status: draft) that never got its last section. */
const isCutDraft = (text: string): boolean => /^status:\s*draft\s*$/m.test(text) && !isCompleteTheory(text);

function extractJson(reply: string): any {
  let text = String(reply ?? "").trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  if (fence) text = fence[1]!.trim();
  const a = text.indexOf("{");
  const b = text.lastIndexOf("}");
  if (a < 0 || b <= a) throw new ApiError("La IA no devolvió JSON.");
  try {
    return JSON.parse(text.slice(a, b + 1));
  } catch {
    throw new ApiError("La IA devolvió JSON inválido. Inténtalo de nuevo.");
  }
}

/** Areas and topics as the model wrote them, cleaned into safe names. */
export function parseProposal(reply: string): SpaceArea[] {
  const raw = extractJson(reply);
  const areas: SpaceArea[] = [];
  for (const a of (Array.isArray(raw?.areas) ? raw.areas : []).slice(0, MAX_AREAS)) {
    const name = safeName(a?.name ?? a?.folder);
    if (!name) continue;
    const topics: SpaceTopic[] = [];
    for (const t of (Array.isArray(a?.topics) ? a.topics : []).slice(0, MAX_TOPICS)) {
      const tn = safeName(typeof t === "string" ? t : (t?.name ?? t?.folder));
      if (tn && !topics.some((x) => x.name === tn)) topics.push({ name: tn });
    }
    if (topics.length) areas.push({ name, topics });
  }
  if (!areas.length) throw new ApiError("La IA no propuso ningún área con temas.");
  return areas;
}

/** The dependencies the model returned, restricted to known topic names. */
export function parseDependencies(reply: string, topics: readonly string[]): TopicDependency[] {
  const known = new Set(topics);
  const out: TopicDependency[] = [];
  for (const d of Array.isArray(extractJson(reply)?.dependencies) ? extractJson(reply).dependencies : []) {
    const from = safeName(d?.from);
    const to = safeName(d?.to);
    const label = String(d?.label ?? "").replace(/\s+/g, " ").trim().slice(0, 46);
    if (known.has(from) && known.has(to) && label) out.push({ from, to, label });
  }
  return out;
}

/** Drops `[[links]]` in `## Requiere` that point at topics that do not exist. */
export function sanitizeRequires(body: string, known: ReadonlySet<string>): string {
  return body.replace(/(^##\s*Requiere[^\n]*\n)([\s\S]*?)(?=^##\s)/im, (_all, head: string, block: string) => {
    const kept = block
      .split("\n")
      .filter((line) => {
        const link = /\[\[([^\]|]+)/.exec(line);
        return !link || known.has(link[1]!.trim());
      });
    const hasLink = kept.some((l) => /\[\[/.test(l));
    return `${head}${hasLink ? kept.join("\n") : "*Sin prerrequisitos.*\n\n"}`;
  });
}

function aiConfig(): AIConfig {
  const cfg = AIConfig.fromDict(AppConfig.get_ai_config());
  if (cfg.is_bridge) throw new ApiError("El proveedor de IA está en modo puente; no se puede generar automáticamente.");
  return cfg;
}

const skillText = (app: AppState, spaceFolder: string, name: string, max = 6000): string =>
  readSkillTemplates(app.root, spaceFolder).find((s) => s.title === name)?.content.slice(0, max) ?? "";

/**
 * `<space>/Vocabulario/`: the home of the ONE word bank the branches feed. It is not a branch (no syllabus,
 * no topics); the words themselves live in the private bank (`.notevault/estudio/vocabulario`).
 */
/** Writes a canvas only when it is not there yet: a map the learner has edited is never overwritten. */
function writeMapOnce(file: string, map: unknown): void {
  if (fs.existsSync(file)) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(map, null, "\t") + "\n", "utf-8");
}

/** The English-only maps: verb tenses under grammar, word families under vocabulary. */
export function ensureEnglishConceptMaps(root: string, space: string): void {
  writeMapOnce(path.join(root, space, ENGLISH_BRANCHES[0]!.folder, TENSE_MAP_FILE), buildTenseMapCanvas());
  writeMapOnce(path.join(root, space, ENGLISH_VOCABULARY_FOLDER, WORD_FAMILY_MAP_FILE), buildWordFamilyCanvas());
}

export function ensureVocabularyHome(root: string, space: string): void {
  const dir = path.join(root, space, ENGLISH_VOCABULARY_FOLDER);
  fs.mkdirSync(dir, { recursive: true });
  ensureEnglishConceptMaps(root, space);
  const note = path.join(dir, "00 Banco de palabras.md");
  if (fs.existsSync(note)) return;
  fs.writeFileSync(
    note,
    [
      "---",
      "title: Banco de palabras",
      "subject: english",
      "type: index",
      "---",
      "",
      "# Banco de palabras",
      "",
      "El vocabulario **no es una rama**: es un único banco de palabras que alimentan todas las ramas (gramática, escritura,",
      "lectura, escucha y habla) y que se practica con las competencias `vc_` (recuerdo, reconocimiento, uso en oraciones,",
      "familias de palabras y colocaciones). Cada palabra tiene su propio repaso espaciado en el calendario.",
      "",
      "Se añaden palabras desde el reproductor (al minar subtítulos), desde la lista «Vocabulario nuevo» de cada tema y a mano.",
      "",
    ].join("\n"),
    "utf-8",
  );
}

/** The line of the theory prompt that says which English branch the topic is (empty for other subjects). */
function englishBrief(subjectName: string, areaName: string): string {
  const branch = domainOfSubject(subjectName) === "english" ? branchFromPath(areaName) : null;
  if (!branch) return "";
  return (
    `Rama de inglés: ${branch}. ${ENGLISH_BRANCH_BRIEF[branch].theory} ` +
    "La explicación va en español; los ejemplos, las frases modelo y las tarjetas (respuestas) en inglés con su glosa.\n"
  );
}

/** Branches named in a free-text scope ("solo lectura y escucha"); none named → all five. */
export function branchesInScope(scope: string): EnglishBranch[] {
  const text = scope.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const named = ENGLISH_BRANCHES.filter((b) => b.words.some((w) => text.includes(w))).map((b) => b.id);
  return named.length ? named : ENGLISH_BRANCHES.map((b) => b.id);
}

/**
 * The topics of one English branch as the model returned them, renumbered N.1, N.2… deterministically
 * (the model's own numbering is not trusted) and cleaned into safe folder names.
 */
export function parseBranchTopics(reply: string, branchNumber: number): SpaceTopic[] {
  const raw = extractJson(reply);
  const seen = new Set<string>();
  const out: SpaceTopic[] = [];
  for (const t of (Array.isArray(raw?.topics) ? raw.topics : []).slice(0, MAX_TOPICS)) {
    const title = safeName(typeof t === "string" ? t : (t?.name ?? t?.folder)).replace(/^\d+(?:\.\d+)*\s+/, "").trim();
    if (!title || seen.has(title.toLowerCase())) continue;
    seen.add(title.toLowerCase());
    out.push({ name: `${branchNumber}.${out.length + 1} ${title}` });
  }
  if (!out.length) throw new ApiError("La IA no propuso ningún tema para esa rama.");
  return out;
}

/** Appends exchanges to one saved conversation, creating it on first use. */
class ChatLog {
  private store = new ConversationStore(AppConfig.get_conversations_dir());
  private messages: StoredMessage[] = [];
  id: string;

  constructor(existingId: string | undefined, private title: string, private model: string) {
    const existing = existingId ? this.store.get(existingId) : null;
    if (existing) this.messages = existing.messages as StoredMessage[];
    this.id = existing?.id ?? "";
    this.flush();
  }

  private flush(): void {
    const conv = this.store.save(this.id || null, { messages: this.messages, model: this.model, title: this.title });
    this.id = conv.id;
  }

  /** One turn: what was asked and what the model answered. */
  exchange(user: string, assistant: string, error = false): void {
    const at = Date.now();
    this.messages.push({ role: "user", content: user, at });
    this.messages.push({ role: "assistant", content: assistant, at: Date.now(), ...(error ? { error: true } : {}) });
    this.flush();
  }

  note(text: string): void {
    this.messages.push({ role: "system", content: text, at: Date.now() });
    this.flush();
  }
}

export function studySpaceApi(app: AppState) {
  const theoryMessages = (
    spaceFolder: string,
    subjectName: string,
    areaName: string,
    topic: string,
    previous: string[],
  ): Array<{ role: string; content: string }> => [
    {
      role: "system",
      content:
        "Eres un profesor riguroso que escribe las notas de teoría de NoteVault, en español. Sigue AL PIE DE LA LETRA esta skill de la bóveda: " +
        "es un contrato (mismos encabezados, mismos campos), porque de esa nota se genera automáticamente el mapa del tema.\n\n" +
        skillText(app, spaceFolder, "resumen_teorico_skill"),
    },
    {
      role: "user",
      content:
        `Materia: ${subjectName}. Área: ${areaName}. Tema: ${topic}.\n` +
        englishBrief(subjectName, areaName) +
        `Temas anteriores que puedes usar como prerrequisito en «## Requiere» (nombre EXACTO entre [[ ]]; solo estos): ${previous.length ? previous.join("; ") : "(ninguno: escribe *Sin prerrequisitos.*)"}.\n\n` +
        `Escribe la nota completa en Markdown SIN frontmatter (lo añade la app). Empieza con «# ${topic}» y termina con «## Tarjetas». ` +
        "Incluye 3 ejemplos y 4–5 errores, cada uno con sus cuatro campos exactos.",
    },
  ];

  const frontmatter = (subjectId: string, areaName: string, topic: string): string => {
    const number = /^(\d+(?:\.\d+)*)\s/.exec(topic)?.[1] ?? "";
    return [
      "---",
      `id: ${subjectId}.${topic.replace(/[^\w]+/g, "-").toLowerCase().slice(0, 40)}`,
      `title: "${topic.replace(/^\d+(?:\.\d+)*\s+/, "")}"`,
      ...(number ? [`number: "${number}"`] : []),
      `area: "${areaName}"`,
      `topic: "${topic}"`,
      "type: teorica",
      "difficulty: 1",
      `subject: ${subjectId}`,
      ...(domainOfSubject(subjectId) === "english" && branchFromPath(areaName) ? [`branch: ${branchFromPath(areaName)}`] : []),
      "prerequisites: []",
      "status: draft",
      "verified: false",
      "sources: []",
      "---",
      "",
      "",
    ].join("\n");
  };

  /** The structural problems the map generator would hit (ignoring missing prerequisite notes). */
  const mapProblems = (folderAbs: string): string[] => {
    try {
      const r = generateConcept(folderAbs, { dryRun: true });
      return [...r.problems, ...r.warnings.filter((w) => !/prerrequisito/i.test(w))];
    } catch (e) {
      return [`no se pudo comprobar el mapa: ${(e as Error).message}`];
    }
  };

  const run = async (job: SpaceJob, req: SpaceRequest, chat: ChatLog): Promise<void> => {
    const say = (line: string) => job.log.push(line);
    const tick = () => {
      job.finished += 1;
    };
    const folder = safeName(req.folder);
    const subjectId = subjectIdOf(req.subject, req.subjectId);
    const cfg = aiConfig();
    const allTopics = req.areas
      .flatMap((a) => a.topics.map((t) => ({ area: a.name, topic: t.name })))
      .filter((t) => !req.only || t.topic === req.only);

    say(`Creando «${folder}»: ${req.areas.length} área(s), ${allTopics.length} tema(s)…`);
    const made = applyAssistantAction(app.root, {
      action: "create_syllabus",
      args: {
        subject: folder,
        subject_id: subjectId,
        map: false,
        areas: req.areas.map((a) => ({ name: a.name, folder: a.name, topics: a.topics.map((t) => ({ name: t.name })) })),
      },
    });
    const skills = ensureDefaultSkills(app.root, folder, [], subjectId);
    if (domainOfSubject(subjectId) === "english") ensureVocabularyHome(app.root, folder);
    say(`Carpetas y vistas listas (${made.written.length} archivos); skills por defecto: ${skills.length} nuevas en ${folder}/_skills.`);
    chat.note(
      `Espacio «${folder}»: ${req.areas.length} área(s), ${allTopics.length} tema(s). ` +
        `Voy a generar${req.steps.theory ? " la teoría y el mapa de cada tema," : ""}${req.steps.practice ? " la matriz de competencias de cada tema," : ""}${req.steps.map ? " y los mapas de cada área y del espacio" : ""}.`,
    );
    tick();

    if (req.steps.theory) {
      for (const { area, topic } of allTopics) {
        const topicAbs = path.join(app.root, folder, area, topic);
        const file = path.join(topicAbs, `${topic}.md`);
        if (fs.existsSync(file) && !isCutDraft(fs.readFileSync(file, "utf-8"))) {
          say(`Teoría de «${topic}»: ya existe, se deja como está.`);
          tick();
          continue;
        }
        say(`Escribiendo la teoría de «${topic}»…`);
        const areaTopics = req.areas.find((a) => a.name === area)!.topics.map((t) => t.name);
        const previous = areaTopics.slice(0, areaTopics.indexOf(topic));
        const known = new Set(areaTopics);
        const msgs = theoryMessages(folder, req.subject, area, topic, previous);
        const asked = `Escribe la teoría de «${topic}» (${area}) siguiendo la skill de teoría de ${folder}/_skills.`;
        try {
          let reply = await askStructured(cfg, msgs, isCompleteTheory);
          let body = sanitizeRequires(reply.replace(/^```(?:markdown|md)?\s*/i, "").replace(/```\s*$/, "").trim().replace(/^---[\s\S]*?\n---\s*/, ""), known);
          fs.mkdirSync(topicAbs, { recursive: true });
          fs.writeFileSync(file, frontmatter(subjectId, area, topic) + body + "\n", "utf-8");
          chat.exchange(asked, reply);

          // Self-repair: the note has to satisfy the very checks the map generator runs.
          let problems = mapProblems(topicAbs);
          if (problems.length) {
            say(`  ↻ «${topic}»: la IA corrige ${problems.length} problema(s) de estructura`);
            const fix = `La nota no cumple el contrato de la skill (el mapa del tema no se puede generar):\n- ${problems.join("\n- ")}\n\nDevuelve la nota COMPLETA corregida, sin frontmatter, empezando con «# ${topic}».`;
            reply = await askStructured(cfg, [...msgs, { role: "assistant", content: reply }, { role: "user", content: fix }], isCompleteTheory);
            body = sanitizeRequires(reply.replace(/^```(?:markdown|md)?\s*/i, "").replace(/```\s*$/, "").trim().replace(/^---[\s\S]*?\n---\s*/, ""), known);
            fs.writeFileSync(file, frontmatter(subjectId, area, topic) + body + "\n", "utf-8");
            chat.exchange(fix, reply);
            problems = mapProblems(topicAbs);
          }
          if (!isCompleteTheory(body)) throw new ApiError("la teoría llegó cortada (sin la sección Tarjetas)");

          if (req.steps.map) {
            try {
              const r = generateConcept(topicAbs);
              say(`  ✓ teoría y mapa del tema (${r.lines[3] ?? "mapa"})${problems.length ? ` — aviso: ${problems[0]}` : ""}`);
            } catch (e) {
              say(`  ✓ teoría escrita; mapa del tema no generado: ${(e as Error).message}`);
            }
          } else {
            say("  ✓ teoría escrita");
          }
        } catch (e) {
          say(`  ✗ «${topic}»: ${(e as Error).message}`);
          chat.exchange(asked, `✗ ${(e as Error).message}`, true);
        }
        tick();
      }
    }

    if (req.steps.practice) {
      clearExerciseIndexCache();
      clearStudySnapshotCache();
      for (const { area, topic } of allTopics) {
        say(`Eligiendo la matriz de competencias de «${topic}»…`);
        const asked = `Lee la teoría de «${topic}» y decide su tipo y su matriz de competencias (skill × dificultad).`;
        try {
          const res = await reevaluateTopic(app, `${folder}/${area}/${topic}`);
          say(`  ✓ ${res.plan.topicType ?? "?"}: ${res.plan.skills.map((s) => s.skill).join(", ")}`);
          chat.exchange(asked, res.reply);
        } catch (e) {
          say(`  ✗ «${topic}»: ${(e as Error).message}`);
          chat.exchange(asked, `✗ ${(e as Error).message}`, true);
        }
        tick();
      }
    }

    if (req.steps.map && !req.only) {
      const spaceAreas: SpaceMapArea[] = [];
      for (const area of req.areas) {
        const topics: MapTopic[] = area.topics.map((t) => ({ name: t.name, file: `${folder}/${area.name}/${t.name}/${t.name}.md` }));
        say(`Dibujando el mapa del área «${area.name}»…`);
        let deps: TopicDependency[] = [];
        const asked = `¿Qué tema de «${area.name}» necesita a cuál? Dame las dependencias con una etiqueta corta del motivo.`;
        try {
          const reply = await askStructured(cfg, [
            {
              role: "system",
              content:
                "Diseñas el mapa de dependencias de un área de estudio. Responde SOLO con JSON: " +
                '{"dependencies":[{"from":"<tema previo>","to":"<tema que lo necesita>","label":"<motivo en 2-6 palabras>"}]}. ' +
                "Usa nombres EXACTOS de la lista, solo dependencias reales (un tema puede necesitar varios previos), siempre de un tema anterior a uno posterior. " +
                skillText(app, folder, "mapa_skill", 2500),
            },
            { role: "user", content: `Área: ${area.name}\nTemas:\n${area.topics.map((t) => `- ${t.name}`).join("\n")}` },
          ]);
          deps = parseDependencies(reply, area.topics.map((t) => t.name));
          chat.exchange(asked, reply);
        } catch (e) {
          say(`  (sin dependencias de la IA: ${(e as Error).message}; se encadenan los temas)`);
        }
        const mapFile = path.join(app.root, folder, area.name, `00 Mapa — ${area.name}.canvas`);
        fs.writeFileSync(mapFile, JSON.stringify(buildAreaMapCanvas(area.name, topics, deps), null, "\t") + "\n", "utf-8");
        spaceAreas.push({ name: area.name, topics: area.topics.map((t) => t.name), prerequisites: Math.max(1, deps.length) });
        say(`  ✓ mapa del área con ${deps.length || area.topics.length - 1} flecha(s)`);
        tick();
      }
      // The space map lists EVERY area on disk, so adding an area keeps the earlier ones.
      const onDisk = fs
        .readdirSync(path.join(app.root, folder), { withFileTypes: true })
        // The word bank folder is not an area of the syllabus (vocabulary is not a branch).
        .filter((d) => d.isDirectory() && !d.name.startsWith("_") && !d.name.startsWith(".") && d.name !== ENGLISH_VOCABULARY_FOLDER)
        .map((d) => d.name)
        .sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
      const all: SpaceMapArea[] = onDisk.map((name) => {
        const fresh = spaceAreas.find((a) => a.name === name);
        if (fresh) return fresh;
        const topics = fs
          .readdirSync(path.join(app.root, folder, name), { withFileTypes: true })
          .filter((t) => t.isDirectory())
          .map((t) => t.name)
          .sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
        return { name, topics };
      });
      fs.writeFileSync(path.join(app.root, folder, `00 Mapa de ${folder}.canvas`), JSON.stringify(buildSpaceMapCanvas(all), null, "\t") + "\n", "utf-8");
      say(`Mapa de «${folder}» con ${all.length} bloque(s).`);
    }
    clearExerciseIndexCache();
    clearStudySnapshotCache();
    chat.note("Terminé. Todo está en el explorador; los cambios los puedes ajustar aquí en el chat.");
    say("Listo.");
  };

  const startJob = (req: SpaceRequest, conversationId?: string): { jobId: string; conversationId: string } => {
    const folder = safeName(req?.folder);
    if (!folder) throw new ApiError("Indica el nombre de la carpeta del espacio.");
    const n = req.only ? 1 : req.areas.reduce((c, a) => c + a.topics.length, 0);
    const total = 1 + (req.steps?.theory ? n : 0) + (req.steps?.practice ? n : 0) + (req.steps?.map !== false && !req.only ? req.areas.length : 0);
    const cfg = aiConfig();
    const chat = new ChatLog(conversationId, req.only ? `Tema: ${req.only}` : `Espacio de estudio: ${folder}`, cfg.model);
    const job: SpaceJob = { id: crypto.randomUUID(), folder, log: [], done: false, error: "", finished: 0, total, conversationId: chat.id };
    jobs.set(job.id, job);
    void run(job, { ...req, folder, steps: { theory: !!req.steps?.theory, practice: !!req.steps?.practice, map: req.steps?.map !== false } }, chat)
      .catch((e) => {
        job.error = (e as Error).message;
        job.log.push(`✗ ${job.error}`);
        chat.note(`✗ Se detuvo: ${job.error}`);
      })
      .finally(() => {
        job.done = true;
      });
    return { jobId: job.id, conversationId: chat.id };
  };

  return {
    /** The AI proposes areas and topics; the user then picks what to generate. */
    async study_space_propose(
      subject: string,
      scope = "",
      objective = "",
      existingFolder = "",
    ): Promise<{ areas: SpaceArea[]; conversationId: string }> {
      const name = safeName(subject);
      if (!name) throw new ApiError("Indica la materia.");
      const cfg = aiConfig();
      const space = safeName(existingFolder);
      const existing = space && fs.existsSync(path.join(app.root, space))
        ? fs.readdirSync(path.join(app.root, space), { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith("_") && !d.name.startsWith(".")).map((d) => d.name)
        : [];
      if (domainOfSubject(name) === "english") {
        // English: each branch gets its OWN syllabus, specialised in what that branch teaches (one call per branch).
        const chat = new ChatLog(undefined, `Espacio de estudio: ${space || name}`, cfg.model);
        const temario = skillText(app, space || name, "temario_skill", 3500) || ENGLISH_DEFAULT_SKILLS.temario_skill!.slice(0, 3500);
        const areas: SpaceArea[] = [];
        for (const id of branchesInScope(scope)) {
          const b = ENGLISH_BRANCHES.find((x) => x.id === id)!;
          if (existing.includes(b.folder)) continue;
          const number = ENGLISH_BRANCHES.indexOf(b) + 1;
          const system =
            "Eres un diseñador curricular de inglés para un hispanohablante (hoy A2, meta C1). Propones el temario de UNA rama. " +
            'Responde SOLO con JSON: {"topics":[{"name":"Nombre del tema"}]}. ' +
            `${ENGLISH_BRANCH_BRIEF[id].syllabus} ` +
            "6–12 temas, ordenados por nivel MCER y por dependencia; nombres cortos en inglés (sin numeración: la pone la app) " +
            'y sin / \\ : * ? " < > |.\n\nSigue esta skill de la bóveda:\n' + temario;
          const user =
            `Rama: ${b.label} (carpeta «${b.folder}»).\n` +
            (scope.trim() ? `Alcance pedido: ${scope.trim()}.\n` : "") +
            (objective.trim() ? `Objetivo del estudiante: ${objective.trim()}.\n` : "");
          const reply = await askStructured(cfg, [{ role: "system", content: system }, { role: "user", content: user }], (r) => {
            try {
              parseBranchTopics(r, number);
              return true;
            } catch {
              return false;
            }
          });
          const topics = parseBranchTopics(reply, number);
          areas.push({ name: b.folder, topics });
          chat.exchange(`Propón el temario de la rama ${b.label}. ${user.trim()}`, `Propuesta de DeepSeek para ${b.folder}:\n\n${topics.map((t) => `- ${t.name}`).join("\n")}`);
        }
        if (!areas.length) throw new ApiError("Esas ramas ya existen en este espacio.");
        return { areas, conversationId: chat.id };
      }
      const skill = skillText(app, space || name, "temario_skill", 3000);
      const system =
        "Eres un diseñador curricular. Propones el temario de una materia en español. Responde SOLO con JSON: " +
        '{"areas":[{"name":"1 Nombre del área","topics":[{"name":"1.1 Nombre del tema"}]}]}. ' +
        "Áreas y temas numerados en orden natural de aprendizaje (Fase 0 = área 0 si hace falta), 6–12 temas por área, " +
        'nombres sin / \\ : * ? " < > |. ' +
        (skill ? `\nSigue esta skill de la bóveda:\n${skill}` : "");
      const user =
        `Materia: ${name}.\n` +
        (scope.trim() ? `Alcance: ${scope.trim()}.\n` : "Alcance: las áreas principales de la materia.\n") +
        (objective.trim() ? `Objetivo del estudiante: ${objective.trim()}.\n` : "") +
        (existing.length ? `Áreas que YA existen en «${space}» (no las repitas; continúa la numeración): ${existing.join("; ")}.\n` : "");
      const reply = await askStructured(cfg, [{ role: "system", content: system }, { role: "user", content: user }]);
      const areas = parseProposal(reply);
      const chat = new ChatLog(undefined, `Espacio de estudio: ${space || name}`, cfg.model);
      // DeepSeek answered JSON; the chat shows it as the outline it describes.
      const outline = areas.map((a) => `**${a.name}**\n${a.topics.map((t) => `- ${t.name}`).join("\n")}`).join("\n\n");
      chat.exchange(`Propón el temario. ${user.trim()}`, `Propuesta de DeepSeek (${areas.length} área(s)):\n\n${outline}`);
      return { areas, conversationId: chat.id };
    },

    /** Starts generating the chosen areas; poll `study_space_status` with the returned id. */
    study_space_generate(request: unknown): { jobId: string; conversationId: string } {
      const req = request as SpaceRequest;
      if (!Array.isArray(req?.areas) || !req.areas.length) throw new ApiError("Elige al menos un área.");
      return startJob(req, req.conversationId);
    },

    /**
     * Generates ONE topic from its folder (`Space/Area/Topic`): theory, topic map and the
     * competency matrix the AI chooses for it. Missing view files are created too.
     */
    study_topic_generate(folderRel: string, conversationId = ""): { jobId: string; conversationId: string } {
      const parts = String(folderRel ?? "").replace(/\\/g, "/").split("/").filter(Boolean);
      const abs = path.join(app.root, ...parts);
      const dir = fs.existsSync(abs) && fs.statSync(abs).isFile() ? parts.slice(0, -1) : parts;
      if (dir.length !== 3) {
        throw new ApiError("Selecciona la carpeta de un tema (Espacio / Área / Tema).");
      }
      const [space, area, topic] = dir as [string, string, string];
      const areaAbs = path.join(app.root, space, area);
      if (!fs.existsSync(path.join(areaAbs, topic))) throw new ApiError("Esa carpeta no existe.");
      const siblings = fs
        .readdirSync(areaAbs, { withFileTypes: true })
        .filter((d) => d.isDirectory() && !d.name.startsWith("_") && !d.name.startsWith("."))
        .map((d) => d.name)
        .sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
      let subject = space.replace(/\s*\d+\s*$/, "").trim() || space;
      try {
        const head = fs.readFileSync(path.join(app.root, space, `${space}.resumen.md`), "utf-8").slice(0, 1500);
        subject = /^subject:\s*["']?(.+?)["']?\s*$/m.exec(head)?.[1] ?? subject;
      } catch {
        /* a space without an overview: the folder name is the subject */
      }
      return startJob(
        {
          folder: space,
          subject,
          areas: [{ name: area, topics: siblings.map((name) => ({ name })) }],
          steps: { theory: true, practice: true, map: true },
          only: topic,
        },
        conversationId || undefined,
      );
    },

    study_space_status(jobId: string): SpaceJob {
      const job = jobs.get(String(jobId));
      if (!job) throw new ApiError("Ese trabajo ya no existe.");
      return { ...job, log: [...job.log] };
    },

    /** Space folders (with an overview) that a new area can be added to. */
    study_space_list(): string[] {
      return fs
        .readdirSync(app.root, { withFileTypes: true })
        .filter((d) => d.isDirectory() && !d.name.startsWith(".") && fs.existsSync(path.join(app.root, d.name, `${d.name}.resumen.md`)))
        .map((d) => d.name)
        .sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
    },
  };
}
