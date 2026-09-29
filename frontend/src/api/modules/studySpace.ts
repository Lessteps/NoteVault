// Study spaces: a whole subject laid out by the AI, step by step and chosen by the
// user — the syllabus (areas and topics), the theory of each topic, the practice plan
// of each topic and the map (canvas) of each area. Generation runs as a background
// job that the panel polls, because a whole area takes minutes.

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { AIConfig } from "../../core/aiClient.js";
import { applyAssistantAction, safeName, subjectIdOf } from "../../core/assistantActions.js";
import { ensureDefaultSkills } from "../../core/defaultSkills.js";
import { ApiError } from "../../core/errors.js";
import { readSkillTemplates } from "../../core/practice/skillTemplates.js";
import { AppConfig } from "../appConfig.js";
import type { AppState } from "../appState.js";
import { askStructured, clearStudySnapshotCache, reevaluateTopic } from "./study.js";
import { clearExerciseIndexCache } from "../../core/practice/exerciseIndex.js";

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
  /** the folder that will hold the space, e.g. "Matemáticas 1" */
  folder: string;
  /** what is studied, e.g. "Matemáticas" */
  subject: string;
  subjectId?: string;
  areas: SpaceArea[];
  steps: SpaceSteps;
}

export interface SpaceJob {
  id: string;
  folder: string;
  log: string[];
  done: boolean;
  error: string;
  /** steps finished / steps planned, for a progress bar */
  finished: number;
  total: number;
}

const jobs = new Map<string, SpaceJob>();
const MAX_AREAS = 30;
const MAX_TOPICS = 40;

function extractJson(reply: string): any {
  let text = String(reply ?? "").trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  if (fence) text = fence[1]!.trim();
  const a = text.indexOf("{");
  const b = text.lastIndexOf("}");
  if (a < 0 || b <= a) throw new ApiError("La IA no devolvió un temario en JSON.");
  try {
    return JSON.parse(text.slice(a, b + 1));
  } catch {
    throw new ApiError("La IA devolvió un temario con formato inválido. Inténtalo de nuevo.");
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

function aiConfig(): AIConfig {
  const cfg = AIConfig.fromDict(AppConfig.get_ai_config());
  if (cfg.is_bridge) throw new ApiError("El proveedor de IA está en modo puente; no se puede generar automáticamente.");
  return cfg;
}

function skillText(app: AppState, spaceFolder: string, name: string): string {
  const found = readSkillTemplates(app.root, spaceFolder).find((s) => s.title === name);
  return found ? found.content.slice(0, 4000) : "";
}

export function studySpaceApi(app: AppState) {
  /** Theory note of one topic, written by the AI following the space's theory skill. */
  const writeTheory = async (
    cfg: AIConfig,
    spaceFolder: string,
    subjectName: string,
    subjectId: string,
    areaName: string,
    topic: string,
    siblings: string[],
  ): Promise<string> => {
    const skill = skillText(app, spaceFolder, "resumen_teorico_skill");
    const number = /^(\d+(?:\.\d+)*)\s/.exec(topic)?.[1] ?? "";
    const reply = await askStructured(cfg, [
      {
        role: "system",
        content:
          "Eres un profesor riguroso que escribe las notas de teoría de NoteVault, en español. " +
          "Sigue estrictamente esta skill de la bóveda (estructura y reglas):\n\n" +
          skill,
      },
      {
        role: "user",
        content:
          `Materia: ${subjectName}. Área: ${areaName}. Tema: ${topic}.\n` +
          `Otros temas del área (no los repitas, enlázalos con [[...]] cuando corresponda): ${siblings.filter((s) => s !== topic).join("; ")}.\n\n` +
          `Escribe la nota completa del tema en Markdown SIN frontmatter (lo añade la app). Empieza con «# ${topic}».`,
      },
    ]);
    const body = reply.replace(/^```(?:markdown|md)?\s*/i, "").replace(/```\s*$/, "").trim();
    if (body.length < 300) throw new ApiError("La IA devolvió una teoría demasiado corta.");
    const fm = [
      "---",
      "type: teorica",
      `subject: ${subjectId}`,
      `area: "${areaName}"`,
      `topic: "${topic}"`,
      ...(number ? [`number: "${number}"`] : []),
      "status: draft",
      "---",
      "",
    ].join("\n");
    return fm + body.replace(/^---[\s\S]*?\n---\s*/, "") + "\n";
  };

  const run = async (job: SpaceJob, req: SpaceRequest): Promise<void> => {
    const say = (line: string) => job.log.push(line);
    const tick = () => {
      job.finished += 1;
    };
    const folder = safeName(req.folder);
    const subjectId = subjectIdOf(req.subject, req.subjectId);
    const cfg = aiConfig();
    const allTopics = req.areas.flatMap((a) => a.topics.map((t) => ({ area: a.name, topic: t.name })));

    say(`Creando «${folder}»: ${req.areas.length} área(s), ${allTopics.length} tema(s)…`);
    const made = applyAssistantAction(app.root, {
      action: "create_syllabus",
      args: {
        subject: folder,
        subject_id: subjectId,
        map: req.steps.map,
        areas: req.areas.map((a) => ({ name: a.name, folder: a.name, topics: a.topics.map((t) => ({ name: t.name })) })),
      },
    });
    say(`Carpetas y vistas listas (${made.written.length} archivos${req.steps.map ? ", con el mapa de cada área" : ""}).`);
    const skills = ensureDefaultSkills(app.root, folder);
    if (skills.length) say(`Skills por defecto instaladas en ${folder}/_skills (${skills.length}).`);
    tick();

    if (req.steps.theory) {
      for (const { area, topic } of allTopics) {
        const file = path.join(app.root, folder, area, topic, `${topic}.md`);
        if (fs.existsSync(file)) {
          say(`Teoría de «${topic}»: ya existe, se deja como está.`);
        } else {
          say(`Escribiendo la teoría de «${topic}»…`);
          try {
            const siblings = req.areas.find((a) => a.name === area)?.topics.map((t) => t.name) ?? [];
            const text = await writeTheory(cfg, folder, req.subject, subjectId, area, topic, siblings);
            fs.mkdirSync(path.dirname(file), { recursive: true });
            fs.writeFileSync(file, text, "utf-8");
          } catch (e) {
            say(`  ✗ «${topic}»: ${(e as Error).message}`);
          }
        }
        tick();
      }
    }

    if (req.steps.practice) {
      clearExerciseIndexCache();
      clearStudySnapshotCache();
      for (const { area, topic } of allTopics) {
        say(`Eligiendo la práctica de «${topic}»…`);
        try {
          const res = await reevaluateTopic(app, `${folder}/${area}/${topic}`);
          say(`  ✓ ${res.plan.skills.length} competencias: ${res.plan.skills.map((s) => s.skill).join(", ")}`);
        } catch (e) {
          say(`  ✗ «${topic}»: ${(e as Error).message}`);
        }
        tick();
      }
    }
    clearExerciseIndexCache();
    clearStudySnapshotCache();
    say("Listo.");
  };

  return {
    /** The AI proposes areas and topics; the user then picks what to generate. */
    async study_space_propose(subject: string, scope = "", objective = ""): Promise<{ areas: SpaceArea[] }> {
      const name = safeName(subject);
      if (!name) throw new ApiError("Indica la materia.");
      const cfg = aiConfig();
      const skill = skillText(app, name, "temario_skill");
      const reply = await askStructured(cfg, [
        {
          role: "system",
          content:
            "Eres un diseñador curricular. Propones el temario de una materia en español. Responde SOLO con JSON: " +
            '{"areas":[{"name":"1 Nombre del área","topics":[{"name":"1.1 Nombre del tema"}]}]}. ' +
            "Áreas y temas numerados en orden natural de aprendizaje (Fase 0 = área 0 si hace falta), 6–12 temas por área, " +
            "nombres sin / \\ : * ? \" < > |. " +
            (skill ? `\nSigue esta skill de la bóveda:\n${skill}` : ""),
        },
        {
          role: "user",
          content:
            `Materia: ${name}.\n` +
            (scope.trim() ? `Alcance: ${scope.trim()}.\n` : "Alcance: las áreas principales de la materia.\n") +
            (objective.trim() ? `Objetivo del estudiante: ${objective.trim()}.\n` : ""),
        },
      ]);
      return { areas: parseProposal(reply) };
    },

    /** Starts generating the chosen areas; poll `study_space_status` with the returned id. */
    study_space_generate(request: unknown): { jobId: string } {
      const req = request as SpaceRequest;
      const folder = safeName(req?.folder);
      if (!folder) throw new ApiError("Indica el nombre de la carpeta del espacio.");
      if (!Array.isArray(req.areas) || !req.areas.length) throw new ApiError("Elige al menos un área.");
      const total =
        1 +
        (req.steps?.theory ? req.areas.reduce((n, a) => n + a.topics.length, 0) : 0) +
        (req.steps?.practice ? req.areas.reduce((n, a) => n + a.topics.length, 0) : 0);
      const job: SpaceJob = { id: crypto.randomUUID(), folder, log: [], done: false, error: "", finished: 0, total };
      jobs.set(job.id, job);
      void run(job, { ...req, folder, steps: { theory: !!req.steps?.theory, practice: !!req.steps?.practice, map: req.steps?.map !== false } })
        .catch((e) => {
          job.error = (e as Error).message;
          job.log.push(`✗ ${job.error}`);
        })
        .finally(() => {
          job.done = true;
        });
      return { jobId: job.id };
    },

    study_space_status(jobId: string): SpaceJob {
      const job = jobs.get(String(jobId));
      if (!job) throw new ApiError("Ese trabajo ya no existe.");
      return { ...job, log: [...job.log] };
    },
  };
}
