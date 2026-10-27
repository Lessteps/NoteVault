// API para gestión de carpetas de la vault en planes: propiedades de carpeta (roles y objetivos),
// sugerencias/candidatos, previsualización de impacto, adición determinista con historial y revisión,
// y sincronización automática (autoAdd). Escribe en `.notevault/mentor/folder-roles.json` y
// `.notevault/mentor/plan-reviews/<planId>.json`.

import * as fs from "node:fs";
import * as path from "node:path";
import { ApiError } from "../../core/errors.js";
import type { CatalogTopic } from "../../core/mentor/goalDraft.js";
import { PLAN_ID_RE, PlanStore, type Plan } from "../../core/mentor/plan.js";
import { applyOps, ChangeStore, type ChangeOp } from "../../core/mentor/planChange.js";
import { topicsUnder } from "../../core/mentor/planFolders.js";
import {
  buildReview,
  findDuplicates,
  impactOf,
  pendingReviews,
  PlanReviewStore,
  type PlanReview,
} from "../../core/mentor/planReview.js";
import * as store from "../../core/store.js";
import {
  clearRole,
  emptyFolderRoles,
  type FolderRoleKind,
  type FolderRolesFile,
  isRoleKind,
  labelOfFolder,
  normFolder,
  sanitizeFolderRoles,
  setRole,
} from "../../lib/folderRoles.js";
import type { AppState } from "../appState.js";

export interface CandidateFolder {
  folder: string;
  label: string;
  role?: FolderRoleKind;
  objective?: string;
  topicCount: number;
  estMinutes: number;
}

export function mentorPlanFoldersApi(
  app: AppState,
  hooks: {
    allTopics?: () => CatalogTopic[];
    today?: () => string;
  } = {},
) {
  const rolesPath = path.join(path.resolve(app.root), ".notevault", "mentor", "folder-roles.json");
  const todayFn = hooks.today || (() => new Date().toISOString().slice(0, 10));

  const loadRoles = (): FolderRolesFile => {
    if (!fs.existsSync(rolesPath)) return emptyFolderRoles();
    return sanitizeFolderRoles(store.loadJson(rolesPath, null));
  };

  const saveRoles = (data: FolderRolesFile): FolderRolesFile => {
    const dir = path.dirname(rolesPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    store.writeJson(rolesPath, data);
    return data;
  };

  const planOf = (opts: unknown): Plan => {
    const id = String(((opts && typeof opts === "object" ? opts : {}) as Record<string, unknown>).planId ?? "");
    if (!PLAN_ID_RE.test(id)) throw new ApiError("Plan inválido.");
    const plan = new PlanStore(app.root).load(id);
    if (!plan) throw new ApiError("Ese plan ya no existe.");
    return plan;
  };

  const getAllTopics = (): CatalogTopic[] => {
    if (hooks.allTopics) return hooks.allTopics();
    return [];
  };

  return {
    mentor_folder_roles_get() {
      return loadRoles();
    },

    mentor_folder_role_set(opts: unknown) {
      const o = (opts && typeof opts === "object" ? opts : {}) as Record<string, unknown>;
      const folder = normFolder(o.folder);
      const role = o.role;
      const objective = String(o.objective ?? "");
      if (!folder) throw new ApiError("Elige una carpeta.");
      if (!isRoleKind(role)) throw new ApiError("Rol inválido: usa área, sub-asignatura o contenedor de temas.");
      const cur = loadRoles();
      const updated = setRole(cur, folder, role, objective, new Date().toISOString());
      return saveRoles(updated);
    },

    mentor_folder_role_clear(opts: unknown) {
      const o = (opts && typeof opts === "object" ? opts : {}) as Record<string, unknown>;
      const folder = normFolder(o.folder);
      if (!folder) throw new ApiError("Elige una carpeta.");
      const cur = loadRoles();
      const updated = clearRole(cur, folder);
      return saveRoles(updated);
    },

    mentor_folder_auto_add_set(opts: unknown) {
      const o = (opts && typeof opts === "object" ? opts : {}) as Record<string, unknown>;
      const enabled = Boolean(o.enabled);
      const cur = loadRoles();
      cur.autoAdd = enabled;
      return saveRoles(cur);
    },

    mentor_plan_folder_candidates(opts: unknown) {
      const plan = planOf(opts);
      const all = getAllTopics();
      const rolesFile = loadRoles();

      const inPlan = new Set(plan.subplans.flatMap((s) => s.topics.map((t) => normFolder(t.folder))));
      const pending = all.filter((t) => t.completenessPct < 100 && !inPlan.has(normFolder(t.folder)));

      const foldersSet = new Set<string>();
      // 1. Carpetas explícitamente registradas en folder-roles
      for (const f of Object.keys(rolesFile.roles)) {
        if (topicsUnder(pending, f).length > 0) foldersSet.add(f);
      }
      // 2. Carpetas inmediatas que contienen temas pendientes
      for (const t of pending) {
        const parts = normFolder(t.folder).split("/");
        if (parts.length > 1) {
          foldersSet.add(parts.slice(0, -1).join("/"));
        }
      }

      const candidates: CandidateFolder[] = [];
      for (const f of foldersSet) {
        const under = topicsUnder(pending, f);
        if (!under.length) continue;
        const meta = rolesFile.roles[f];
        candidates.push({
          folder: f,
          label: labelOfFolder(f),
          ...(meta ? { role: meta.role, objective: meta.objective } : {}),
          topicCount: under.length,
          estMinutes: under.reduce((sum, t) => sum + t.estMinutes, 0),
        });
      }

      candidates.sort((a, b) => b.topicCount - a.topicCount || a.folder.localeCompare(b.folder));
      return { candidates };
    },

    mentor_plan_folder_preview(opts: unknown) {
      const o = (opts && typeof opts === "object" ? opts : {}) as Record<string, unknown>;
      const plan = planOf(opts);
      const folder = normFolder(o.folder);
      const mode = o.mode === "subject" ? "subject" : "area";
      const subplanId = String(o.subplanId ?? "");
      const name = String(o.name ?? "");
      const objective = String(o.objective ?? "");
      if (!folder) throw new ApiError("Elige una carpeta.");

      const all = getAllTopics();
      const op: ChangeOp =
        mode === "area"
          ? { op: "add_folder_area", folder, ...(name ? { name } : {}), ...(objective ? { objective } : {}) }
          : { op: "add_folder_subject", subplan: subplanId, folder, ...(name ? { title: name } : {}), ...(objective ? { objective } : {}) };

      const res = applyOps(plan, [op], { today: todayFn(), all });
      const addedFolders = topicsUnder(all, folder).map((t) => normFolder(t.folder));
      const duplicates = findDuplicates(addedFolders, plan.subplans.flatMap((s) => s.topics), all);
      const impact = impactOf(plan, res, addedFolders);

      return {
        preview: {
          duplicates,
          impact,
          warnings: res.warnings,
          fits: res.fits,
        },
      };
    },

    mentor_plan_folder_add(opts: unknown) {
      const o = (opts && typeof opts === "object" ? opts : {}) as Record<string, unknown>;
      const plan = planOf(opts);
      const folder = normFolder(o.folder);
      const mode = o.mode === "subject" ? "subject" : "area";
      const subplanId = String(o.subplanId ?? "");
      const name = String(o.name ?? "");
      const objective = String(o.objective ?? "");
      const source = o.source === "auto" ? "auto" : "manual";
      if (!folder) throw new ApiError("Elige una carpeta.");

      const all = getAllTopics();
      const op: ChangeOp =
        mode === "area"
          ? { op: "add_folder_area", folder, ...(name ? { name } : {}), ...(objective ? { objective } : {}) }
          : { op: "add_folder_subject", subplan: subplanId, folder, ...(name ? { title: name } : {}), ...(objective ? { objective } : {}) };

      const res = applyOps(plan, [op], { today: todayFn(), all });
      if (!res.applied) {
        throw new ApiError(res.warnings[0] || "No se pudo añadir la carpeta al plan.");
      }

      // 1. Guardar el plan actualizado
      const planStore = new PlanStore(app.root);
      const savedPlan = planStore.save(res.plan);

      // 2. Historial de cambios
      const hist = new ChangeStore(app.root);
      hist.append(plan.id, {
        at: new Date().toISOString(),
        comment: mode === "area" ? `Añadida área «${name || labelOfFolder(folder)}»` : `Añadida sub-asignatura «${name || labelOfFolder(folder)}»`,
        status: "applied",
        kind: "adjust",
        source: source === "auto" ? "rules" : "none",
        summary: mode === "area" ? `Añadida área «${name || labelOfFolder(folder)}»` : `Añadida sub-asignatura «${name || labelOfFolder(folder)}»`,
        delta: { added: 1, removed: 0, moved: 0, deliverables: 0, structure: 1 },
        changed: [folder],
        warnings: res.warnings,
        fixOptions: [],
        before: plan,
      });

      // 3. Guardar rol en folder-roles.json si se proveyó
      if (objective || mode) {
        try {
          const curRoles = loadRoles();
          const roleKind: FolderRoleKind = mode === "area" ? "area" : "subject";
          const updated = setRole(curRoles, folder, roleKind, objective || curRoles.roles[folder]?.objective || "", new Date().toISOString());
          saveRoles(updated);
        } catch {
          /* no bloquear la adición al plan si falla el guardado de rol */
        }
      }

      // 4. Crear revisión pendiente
      const addedFolders = topicsUnder(all, folder).map((t) => normFolder(t.folder));
      const duplicates = findDuplicates(addedFolders, plan.subplans.flatMap((s) => s.topics), all);
      const impact = impactOf(plan, res, addedFolders);

      let targetSubplanId = subplanId;
      let targetSubplanName = name || labelOfFolder(folder);
      let targetGroupId: string | undefined;
      let targetGroupTitle: string | undefined;

      if (mode === "area") {
        const newSub = savedPlan.subplans.find((s) => !plan.subplans.some((old) => old.id === s.id));
        if (newSub) {
          targetSubplanId = newSub.id;
          targetSubplanName = newSub.area;
        }
      } else {
        const targetSub = savedPlan.subplans.find((s) => s.id === subplanId);
        if (targetSub) {
          targetSubplanName = targetSub.area;
          const newGrp = targetSub.groups?.find((g) => !plan.subplans.find((s) => s.id === subplanId)?.groups?.some((og) => og.id === g.id));
          if (newGrp) {
            targetGroupId = newGrp.id;
            targetGroupTitle = newGrp.title;
          }
        }
      }

      const review = buildReview({
        kind: mode,
        subplanId: targetSubplanId,
        subplanName: targetSubplanName,
        ...(targetGroupId ? { groupId: targetGroupId } : {}),
        ...(targetGroupTitle ? { groupTitle: targetGroupTitle } : {}),
        folder,
        objective,
        source,
        added: addedFolders,
        duplicates,
        impact,
      });

      const revStore = new PlanReviewStore(app.root);
      const existingReviews = revStore.load(plan.id);
      revStore.save(plan.id, [...existingReviews, review]);

      return { plan: savedPlan, review };
    },

    mentor_plan_folder_sync(opts: unknown) {
      const plan = planOf(opts);
      const curRoles = loadRoles();
      const all = getAllTopics();
      const inPlan = new Set(plan.subplans.flatMap((s) => s.topics.map((t) => normFolder(t.folder))));
      const pending = all.filter((t) => t.completenessPct < 100 && !inPlan.has(normFolder(t.folder)));

      const added: PlanReview[] = [];
      if (curRoles.autoAdd) {
        for (const [f, meta] of Object.entries(curRoles.roles)) {
          if (meta.role !== "area" && meta.role !== "subject") continue;
          if (topicsUnder(pending, f).length === 0) continue;
          try {
            const r = this.mentor_plan_folder_add({
              planId: plan.id,
              folder: f,
              mode: meta.role === "area" ? "area" : "subject",
              objective: meta.objective,
              source: "auto",
            });
            if (r?.review) added.push(r.review);
          } catch {
            /* seguir con las demás */
          }
        }
      }

      const candRes = this.mentor_plan_folder_candidates({ planId: plan.id });
      return { added, candidates: candRes.candidates };
    },

    mentor_plan_review_list(opts: unknown) {
      const plan = planOf(opts);
      const revStore = new PlanReviewStore(app.root);
      const all = revStore.load(plan.id);
      return { reviews: pendingReviews(all, plan) };
    },

    mentor_plan_review_resolve(opts: unknown) {
      const o = (opts && typeof opts === "object" ? opts : {}) as Record<string, unknown>;
      const plan = planOf(opts);
      const reviewId = String(o.reviewId ?? "");
      const action = o.action === "remove" ? "remove" : "keep";
      const objective = String(o.objective ?? "").trim();

      const revStore = new PlanReviewStore(app.root);
      const reviews = revStore.load(plan.id);
      const target = reviews.find((r) => r.id === reviewId);
      if (!target) throw new ApiError("No se encontró la revisión.");

      const planStore = new PlanStore(app.root);

      if (action === "keep") {
        target.state = "kept";
        if (objective) target.objective = objective;
        revStore.save(plan.id, reviews);

        if (objective) {
          const sub = plan.subplans.find((s) => s.id === target.subplanId);
          if (sub && sub.objective !== objective) {
            sub.objective = objective;
            planStore.save(plan);
          }
        }
        return { resolved: true, plan };
      }

      // action === "remove": quitar del plan sin tocar archivos de la vault
      const all = getAllTopics();
      const ops: ChangeOp[] =
        target.kind === "area"
          ? [{ op: "remove_subplan", subplan: target.subplanId }]
          : target.added.map((f) => ({ op: "remove_topic", folder: f }));

      const res = applyOps(plan, ops, { today: todayFn(), all });
      const nextPlan = res.applied ? planStore.save(res.plan) : plan;

      target.state = "kept";
      revStore.save(plan.id, reviews);

      return { resolved: true, plan: nextPlan };
    },
  };
}
