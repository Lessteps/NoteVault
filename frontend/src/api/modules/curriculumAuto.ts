// «Temas por crear» en modo AUTOMÁTICO: la app misma escribe los temas que faltan con su IA (clave de API, Claude Code o modelo local), UNO TRAS OTRO,
// con el mismo contrato que la tarea para Antigravity. Por tema: carpeta + manifiesto de práctica → nota (la IA) → comprobación de estructura y de elementos
// (una vuelta de corrección) → mapa → línea del temario. Un tema que no pasa se deshace entero (no deja carpetas a medias) y se cuenta como fallo;
// tres fallos seguidos paran el trabajo para no gastar la cuota. Se puede cancelar y volver a lanzar: lo ya creado se salta.
//  - study_curriculum_auto_engine()                        -> { ready, reason, label }
//  - study_curriculum_auto_start({ areaId, importance?, entryIds?, confirm }) -> { jobId, total }
//  - study_curriculum_auto_status(jobId) / study_curriculum_auto_cancel(jobId)

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { withAiSignal } from "../../core/aiAbort.js";
import { AIConfig } from "../../core/aiClient.js";
import { curriculumAreas } from "../../core/curriculum/catalog.js";
import { ApiError } from "../../core/errors.js";
import { readSkillTemplates } from "../../core/practice/skillTemplates.js";
import { clearExerciseIndexCache } from "../../core/practice/exerciseIndex.js";
import { generateConcept } from "../../../tools/kb_canvas";
import type { CurriculumArea } from "../../lib/curriculum.js";
import { appendTemarioLine, autoFixMessage, autoNoteMessages, cleanNoteReply } from "../../lib/curriculumAuto.js";
import { isValidTopicFolderName, itemCovered, noteFrontmatter, planEntries, practicaManifest, type CurriculumSkills, type PlannedEntry } from "../../lib/curriculumPrompt.js";
import { AppConfig } from "../appConfig.js";
import type { AppState } from "../appState.js";
import { curriculumCoverageFor } from "./curriculumCoverage.js";
import { engineBlockedReason } from "./regenEngines.js";
import { askStructured, clearStudySnapshotCache } from "./study.js";
import { isCompleteTheory, sanitizeRequires } from "./studySpace.js";
import { stampSkillVersion } from "./skillFreshness.js";

export const MAX_AUTO_TOPICS = 2000;
const MAX_CONSECUTIVE_FAILURES = 3;

export interface AutoJob {
  id: string;
  areaId: string;
  areaTitle: string;
  total: number;
  finished: number;
  /** el tema en curso («5.19.7.2 flex-wrap») */
  current: string;
  done: boolean;
  cancelled: boolean;
  error: string;
  log: string[];
  /** carpetas creadas (relativas a la vault) */
  created: string[];
  failed: Array<{ title: string; reason: string }>;
  /** ya existían: se saltaron */
  skipped: number;
}

export interface AutoHooks {
  /** la IA (los tests ponen una simulada) */
  ask?: (cfg: AIConfig, messages: Array<{ role: string; content: string }>, accept: (reply: string) => boolean) => Promise<string>;
  now?: () => Date;
}


export function curriculumAutoApi(app: AppState, hooks: AutoHooks = {}) {
  const jobs = new Map<string, { job: AutoJob; ctl: AbortController }>();
  const running = new Set<string>();
  const ask = hooks.ask ?? askStructured;
  const aiCfg = (): AIConfig => AIConfig.fromDict(AppConfig.get_ai_config());
  const abs = (rel: string): string => path.join(app.root, ...rel.split("/"));
  const isDir = (p: string): boolean => {
    try {
      return fs.statSync(p).isDirectory();
    } catch {
      return false;
    }
  };

  const skillsOf = (space: string): CurriculumSkills => {
    const all = readSkillTemplates(app.root, space);
    return { resumenTeorico: all.find((s) => s.title === "resumen_teorico_skill")?.content };
  };

  /** Lo que el generador del mapa rechazaría (menos los prerrequisitos, que no se validan aquí). */
  const mapProblems = (topicAbs: string): string[] => {
    try {
      const r = generateConcept(topicAbs, { dryRun: true });
      return [...r.problems, ...r.warnings.filter((w) => !/prerrequisito/i.test(w))];
    } catch (e) {
      return [`no se pudo comprobar el mapa: ${(e as Error).message}`];
    }
  };

  const caches = (): void => {
    clearExerciseIndexCache();
    clearStudySnapshotCache();
  };

  async function writeTopic(p: PlannedEntry, area: CurriculumArea, cfg: AIConfig, skills: CurriculumSkills, linkable: string[], signal: AbortSignal, say: (l: string) => void): Promise<void> {
    const topicAbs = abs(p.folder);
    const noteAbs = path.join(topicAbs, `${p.name}.md`);
    const known = new Set([...linkable, p.name]);
    fs.mkdirSync(topicAbs, { recursive: true });
    fs.writeFileSync(path.join(topicAbs, `${p.name}.practica.md`), practicaManifest(p), "utf-8");
    stampSkillVersion(app.root, area.space, "practica", path.join(topicAbs, `${p.name}.practica.md`));
    const fm = noteFrontmatter(p, area, area.areaFolder);
    const msgs = autoNoteMessages(p, area.title, { skills, linkable });
    const write = (reply: string): string => {
      const body = sanitizeRequires(cleanNoteReply(reply), known);
      fs.writeFileSync(noteAbs, `${fm}\n\n${body}\n`, "utf-8");
      stampSkillVersion(app.root, area.space, "theory", noteAbs);
      return body;
    };
    const problemsOf = (body: string): string[] => {
      const out: string[] = [];
      if (!isCompleteTheory(body)) out.push("the note is cut off: it must end with the `## Cards` section");
      const cards = (body.slice(Math.max(0, body.search(/^##\s*Cards\b/m))).match(/^###\s+\d+/gm) ?? []).length;
      if (isCompleteTheory(body) && cards < 6) out.push(`6 to 9 cards are needed in \`## Cards\` (there are ${cards})`);
      out.push(...mapProblems(topicAbs));
      const missing = p.entry.items.filter((it) => !itemCovered(body, it));
      if (missing.length) out.push(`these items do not appear in the note: ${missing.slice(0, 8).join(", ")}`);
      return out;
    };
    let reply = await withAiSignal(signal, () => ask(cfg, msgs, isCompleteTheory));
    let body = write(reply);
    let problems = problemsOf(body);
    if (problems.length && !signal.aborted) {
      say(`  ↻ «${p.name}»: la IA corrige ${problems.length} problema(s)`);
      const fixMsgs = [...msgs, { role: "assistant" as const, content: reply }, { role: "user" as const, content: autoFixMessage(problems, p.name) }];
      reply = await withAiSignal(signal, () => ask(cfg, fixMsgs, isCompleteTheory));
      body = write(reply);
      problems = problemsOf(body);
    }
    if (problems.length) throw new Error(problems[0]!);
    const r = generateConcept(topicAbs);
    if (r.problems.length) throw new Error(`el mapa no pasó la verificación: ${r.problems[0]}`);
    const temario = path.join(app.root, area.space, "00 Temario.md");
    const before = fs.existsSync(temario) ? fs.readFileSync(temario, "utf-8") : "";
    fs.writeFileSync(temario, appendTemarioLine(before, `## ${area.areaFolder}`, `- [[${p.name}]]`), "utf-8");
  }

  async function run(job: AutoJob, area: CurriculumArea, planned: PlannedEntry[], signal: AbortSignal): Promise<void> {
    const say = (l: string): void => void job.log.push(l);
    const cfg = aiCfg();
    const skills = skillsOf(area.space);
    const areaAbs = path.join(app.root, area.space, area.areaFolder);
    const existing = (): string[] => {
      try {
        return fs.readdirSync(areaAbs, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
      } catch {
        return [];
      }
    };
    let streak = 0;
    for (const p of planned) {
      if (signal.aborted) {
        job.cancelled = true;
        say("Cancelado: lo ya creado se queda; vuelve a lanzar para seguir donde quedó.");
        break;
      }
      job.current = p.name;
      if (isDir(abs(p.folder))) {
        job.skipped++;
        job.finished++;
        continue;
      }
      say(`Escribiendo «${p.name}»…`);
      try {
        await writeTopic(p, area, cfg, skills, [...new Set([...existing(), ...planned.map((x) => x.name)])], signal, say);
        job.created.push(p.folder);
        streak = 0;
        say(`✓ «${p.name}»`);
      } catch (e) {
        // se deshace el tema entero: nada de carpetas a medias
        try {
          fs.rmSync(abs(p.folder), { recursive: true, force: true });
        } catch {
          /* ya no estaba */
        }
        if (signal.aborted) {
          job.cancelled = true;
          break;
        }
        const reason = (e as Error).message.slice(0, 240);
        job.failed.push({ title: p.name, reason });
        say(`✗ «${p.name}»: ${reason}`);
        if (++streak >= MAX_CONSECUTIVE_FAILURES) {
          job.error = `Paré tras ${MAX_CONSECUTIVE_FAILURES} fallos seguidos para no gastar tu cuota: ${reason}`;
          say(`✗ ${job.error}`);
          break;
        }
      }
      job.finished++;
      if (job.finished % 10 === 0) caches();
    }
    job.current = "";
  }

  return {
    /** ¿Puede la app escribir temas ella sola? (la IA configurada no puede estar en modo puente) */
    study_curriculum_auto_engine(): { ready: boolean; reason: string; label: string } {
      const cfg = aiCfg();
      const reason = engineBlockedReason(cfg, "app");
      return { ready: !reason, reason, label: cfg.is_bridge ? "" : `${cfg.info.label}${cfg.model ? ` · ${cfg.model}` : ""}` };
    },

    study_curriculum_auto_start(input: { areaId: string; importance?: string; entryIds?: string[]; confirm?: boolean }): { jobId: string; total: number } {
      if (input?.confirm !== true) throw new ApiError("Falta la confirmación: la app va a escribir carpetas y notas en tu vault y a gastar llamadas de tu IA.");
      const why = engineBlockedReason(aiCfg(), "app");
      if (why) throw new ApiError(why);
      const area = curriculumAreas().find((a) => a.id === String(input.areaId ?? ""));
      if (!area) throw new ApiError("Esa área no está en el currículo.");
      if (!isDir(path.join(app.root, area.space))) throw new ApiError(`El espacio «${area.space}» no existe en la vault.`);
      if (running.has(area.id)) throw new ApiError("Ya hay una generación automática en curso de esta área.");
      const rows = curriculumCoverageFor(app).areas.find((a) => a.areaId === area.id)?.rows ?? [];
      const imp = ["esencial", "recomendado", "opcional"].includes(String(input.importance)) ? input.importance : undefined;
      const only = Array.isArray(input.entryIds) && input.entryIds.length ? new Set(input.entryIds.map(String)) : undefined;
      const picked = rows.filter((r) => r.status !== "cubierto" && r.suggestedFolder && (!imp || r.entry.importance === imp) && (!only || only.has(r.entry.id)));
      if (!picked.length) throw new ApiError("No falta nada de eso en esta área.");
      if (picked.length > MAX_AUTO_TOPICS) throw new ApiError(`Demasiados temas de una vez (${picked.length}): máximo ${MAX_AUTO_TOPICS}.`);
      let planned: PlannedEntry[];
      try {
        planned = planEntries(area, picked.map((r) => ({ entry: r.entry, suggestedFolder: r.suggestedFolder })));
      } catch (e) {
        throw new ApiError((e as Error).message);
      }
      for (const p of planned) if (!isValidTopicFolderName(p.name)) throw new ApiError(`«${p.name}» no es un nombre de carpeta válido.`);
      const job: AutoJob = { id: crypto.randomUUID(), areaId: area.id, areaTitle: area.title, total: planned.length, finished: 0, current: "", done: false, cancelled: false, error: "", log: [], created: [], failed: [], skipped: 0 };
      const ctl = new AbortController();
      jobs.set(job.id, { job, ctl });
      running.add(area.id);
      void run(job, area, planned, ctl.signal)
        .catch((e) => {
          job.error = (e as Error).message;
          job.log.push(`✗ ${job.error}`);
        })
        .finally(() => {
          caches();
          job.done = true;
          running.delete(area.id);
        });
      return { jobId: job.id, total: job.total };
    },

    study_curriculum_auto_status(jobId: string): AutoJob {
      const j = jobs.get(String(jobId));
      if (!j) throw new ApiError("Ese trabajo ya no existe.");
      return { ...j.job, log: j.job.log.slice(-200), created: [...j.job.created], failed: [...j.job.failed] };
    },

    study_curriculum_auto_cancel(jobId: string): { ok: boolean } {
      const j = jobs.get(String(jobId));
      if (!j) return { ok: false };
      j.ctl.abort();
      return { ok: true };
    },
  };
}
