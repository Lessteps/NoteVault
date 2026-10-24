// Mentor — CARPETAS DE PROYECTOS (ver `lib/projectTemplates.ts`).
//
//  - mentor_projects_scaffold({ id, kind?, areaKeys?, project? }) -> { route, skeleton, projects, created, existed }:
//    crea (si faltan) las carpetas de la ruta — `<Materia>/Mentor/Ruta <plan>/<n>. <Área>/<n>.1 Proyectos diarios · <n>.2 semanales · <n>.3 mensuales` con
//    su README — y, si se pasa `project`, la carpeta de ESE proyecto con su plantilla de archivos .md en cada área indicada (`areaKeys`).
//    NUNCA sobrescribe: un archivo que ya existe se deja tal cual y se cuenta en `existed`. Sin `project` solo prepara la estructura.
// Escribe SOLO bajo `<Materia>/Mentor/`.

import * as fs from "node:fs";
import * as path from "node:path";
import { ApiError } from "../../core/errors.js";
import { PLAN_ID_RE, PlanStore, type Plan } from "../../core/mentor/plan.js";
import { areaDirs, areaReadme, projectFiles, projectFolderName, routeDirName, routeReadme, sanitizeProject, type AreaRef, type ProjectKind, type ProjectListArea, type ProjectListItem } from "../../lib/projectTemplates.js";
import { orderedAreas } from "../../lib/planTopicsByArea.js";
import type { AppState } from "../appState.js";

export interface ProjectResult {
  areaKey: string;
  area: string;
  /** carpeta del proyecto (relativa a la vault) */
  dir: string;
  readme: string;
  created: string[];
  existed: string[];
}

/**
 * LA SEÑAL DEL AVANCE de la cadena diario → semanal → mensual: por fecha, las áreas cuya carpeta de proyecto DIARIO de ese día tiene todas sus
 * casillas marcadas (el estudiante las marca al completar la pieza). Solo lee; sin carpetas devuelve `{}`.
 */
export function dailyProjectDoneOf(root: string, plan: Plan): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  try {
    const space = plan.subplans.flatMap((s) => s.topics)[0]?.folder.split("/")[0] ?? "Programación";
    const base = `${space}/Mentor/${routeDirName(plan.name ?? "", plan.id)}`;
    const abs = path.resolve(root);
    orderedAreas(plan).forEach((a, i) => {
      const d = areaDirs(i, a.area);
      const dir = path.resolve(abs, ...`${base}/${d.dir}/${d.kinds.daily}`.split("/"));
      if (!dir.startsWith(abs + path.sep) || !fs.existsSync(dir)) return;
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const date = /^(\d{4}-\d{2}-\d{2}) /.exec(e.name)?.[1];
        if (!e.isDirectory() || !date) continue;
        let done = 0;
        let total = 0;
        for (const f of fs.readdirSync(path.join(dir, e.name)).filter((n) => n.endsWith(".md"))) {
          for (const m of fs.readFileSync(path.join(dir, e.name, f), "utf-8").matchAll(/^\s*[-*] \[( |x|X)\]/gm)) {
            total++;
            if (m[1] !== " ") done++;
          }
        }
        if (total > 0 && done >= total) (out[date] ??= []).push(a.areaId ?? a.subplanId);
      }
    });
  } catch {
    /* sin carpetas legibles: no hay avance */
  }
  return out;
}

export function mentorProjectsApi(app: AppState) {
  const planOf = (opts: unknown): Plan => {
    const id = String(((opts && typeof opts === "object" ? opts : {}) as Record<string, any>).id ?? "");
    if (!PLAN_ID_RE.test(id)) throw new ApiError("Plan inválido.");
    const plan = new PlanStore(app.root).load(id);
    if (!plan) throw new ApiError("Ese plan ya no existe.");
    return plan;
  };
  const root = path.resolve(app.root);
  const abs = (rel: string): string => {
    const p = path.resolve(root, ...rel.split("/"));
    if (!p.startsWith(root + path.sep)) throw new ApiError("Ruta fuera de la vault.");
    return p;
  };
  /** Escribe un archivo SOLO si no existe (`wx`): lo que ya hay se respeta. Devuelve si lo creó. */
  const writeNew = (rel: string, text: string): boolean => {
    const file = abs(rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    try {
      fs.writeFileSync(file, text, { encoding: "utf-8", flag: "wx" });
      return true;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "EEXIST") return false;
      throw e;
    }
  };

  const KIND_LABEL: Record<ProjectKind, string> = { daily: "Diarios", weekly: "Semanales", monthly: "Mensuales" };
  const inspect = (dir: string, name: string): ProjectListItem => {
    const full = abs(dir);
    const files = fs.readdirSync(full, { withFileTypes: true }).filter((e) => e.isFile() && e.name.endsWith(".md")).map((e) => e.name).sort();
    let done = 0;
    let total = 0;
    let modified = fs.statSync(full).mtimeMs;
    for (const f of files) {
      const file = path.join(full, f);
      modified = Math.max(modified, fs.statSync(file).mtimeMs);
      for (const m of fs.readFileSync(file, "utf-8").matchAll(/^\s*[-*] \[( |x|X)\]/gm)) {
        total++;
        if (m[1] !== " ") done++;
      }
    }
    return { name, dir, readme: `${dir}/README.md`, files, done, total, status: total === 0 || done === 0 ? "new" : done >= total ? "done" : "doing", modified: Math.round(modified) };
  };

  return {
    /** Lo que ya hay en disco bajo la carpeta de la ruta: áreas → tipos → proyectos con su avance (casillas marcadas). No escribe nada. */
    mentor_projects_list(opts: unknown) {
      const plan = planOf(opts);
      const space = plan.subplans.flatMap((s) => s.topics)[0]?.folder.split("/")[0] ?? "Programación";
      const areas = orderedAreas(plan).map((a) => ({ key: a.areaId ?? a.subplanId, name: a.area }));
      const route = routeDirName(plan.name ?? "", plan.id);
      const base = `${space}/Mentor/${route}`;
      const exists = fs.existsSync(abs(base));
      const out: ProjectListArea[] = areas.map((a, i) => {
        const d = areaDirs(i, a.name);
        const kinds = (Object.keys(d.kinds) as ProjectKind[]).map((k) => {
          const dir = `${base}/${d.dir}/${d.kinds[k]}`;
          let projects: ProjectListItem[] = [];
          if (exists && fs.existsSync(abs(dir))) {
            projects = fs.readdirSync(abs(dir), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => inspect(`${dir}/${e.name}`, e.name)).sort((x, y) => y.name.localeCompare(x.name));
          }
          return { kind: k, label: KIND_LABEL[k], dir, projects };
        });
        return { areaKey: a.key, area: a.name, dir: `${base}/${d.dir}`, kinds };
      });
      return { route: base, exists, areas: out };
    },

    /** Las piezas diarias que el estudiante ya completó (la única señal de avance de los entregables). No escribe nada. */
    mentor_deliverables_progress(opts: unknown) {
      return { dailyProjectDone: dailyProjectDoneOf(app.root, planOf(opts)) };
    },

    mentor_projects_scaffold(opts: unknown) {
      const o = (opts && typeof opts === "object" ? opts : {}) as Record<string, any>;
      const plan = planOf(o);
      const space = plan.subplans.flatMap((s) => s.topics)[0]?.folder.split("/")[0] ?? "Programación";
      const areas: AreaRef[] = orderedAreas(plan).map((a) => ({ key: a.areaId ?? a.subplanId, name: a.area }));
      const route = routeDirName(plan.name ?? "", plan.id);
      const base = `${space}/Mentor/${route}`;
      const skeleton: string[] = [];
      const created: string[] = [];
      const existed: string[] = [];
      const note = (rel: string, text: string): void => void (writeNew(rel, text) ? created.push(rel) : existed.push(rel));

      // 1 · la estructura de la ruta: una carpeta por área con sus tres tipos de proyecto
      note(`${base}/README.md`, routeReadme(route, plan.name ?? plan.id, areas));
      areas.forEach((a, i) => {
        const d = areaDirs(i, a.name);
        note(`${base}/${d.dir}/README.md`, areaReadme(i, a, route));
        for (const k of Object.keys(d.kinds) as ProjectKind[]) {
          const dir = `${base}/${d.dir}/${d.kinds[k]}`;
          if (!fs.existsSync(abs(dir))) {
            fs.mkdirSync(abs(dir), { recursive: true });
            skeleton.push(dir);
          }
        }
      });

      // 2 · la carpeta del proyecto, con su plantilla, en cada área pedida
      const projects: ProjectResult[] = [];
      if (o.project) {
        const keys: string[] = (Array.isArray(o.areaKeys) ? o.areaKeys : [o.areaKey]).map((k: unknown) => String(k ?? "")).filter(Boolean);
        for (const key of [...new Set(keys)]) {
          const i = areas.findIndex((a) => a.key === key);
          if (i < 0) continue;
          const area = areas[i]!;
          const p = sanitizeProject(o.project, { area: area.name, route, planId: plan.id });
          if (!p) throw new ApiError("El proyecto no es válido: necesita un tipo (diario, semanal o mensual) y un título.");
          // un proyecto de varias áreas lleva en cada carpeta SOLO la parte de esa área (si no hay desglose por área, todo)
          const mine = p.sections.filter((s) => !s.areaId || s.areaId === (plan.subplans.find((sp) => (sp.areaId ?? sp.id) === key)?.areaId ?? key));
          const proj = { ...p, sections: mine.length ? mine : p.sections };
          const d = areaDirs(i, area.name);
          const dir = `${base}/${d.dir}/${d.kinds[proj.kind]}/${projectFolderName(proj)}`;
          const res: ProjectResult = { areaKey: key, area: area.name, dir, readme: `${dir}/README.md`, created: [], existed: [] };
          for (const f of projectFiles(proj)) (writeNew(`${dir}/${f.name}`, f.text) ? res.created : res.existed).push(`${dir}/${f.name}`);
          created.push(...res.created);
          existed.push(...res.existed);
          projects.push(res);
        }
        if (!projects.length) throw new ApiError("Esa área ya no está en el plan.");
      }
      return { route: base, skeleton, projects, created, existed };
    },
  };
}
