// Propiedades de carpeta: qué es una carpeta de la vault para el Mentor (área, sub-asignatura o contenedor de temas) y para qué se añadió.
// Módulo PURO (sin node:*): lo usan la API (`mentorPlanFolders`), el renderer y los tests. Se guarda en `.notevault/mentor/folder-roles.json`,
// fuera de cualquier plan (sobrevive a archivar planes y `sanitizePlan` no lo toca).

export const FOLDER_ROLES = ["area", "subject", "container"] as const;
export type FolderRoleKind = (typeof FOLDER_ROLES)[number];

export const ROLE_LABEL: Readonly<Record<FolderRoleKind, string>> = {
  area: "Área",
  subject: "Sub-asignatura",
  container: "Contenedor de temas",
};

export const ROLE_HINT: Readonly<Record<FolderRoleKind, string>> = {
  area: "Una materia completa dentro del plan, con sus propias sub-asignaturas y su ruta.",
  subject: "Un bloque dentro de un área que ya está en el plan (por ejemplo HTML dentro de Frontend).",
  container: "Solo agrupa carpetas: sus subcarpetas son las que cuentan como área o sub-asignatura.",
};

export const MAX_OBJECTIVE = 200;

export interface FolderRole {
  role: FolderRoleKind;
  /** «para qué la añado» (una línea) */
  objective: string;
  updatedAt: string;
}

export interface FolderRolesFile {
  version: 1;
  /** si está activo, lo nuevo de la vault se añade al plan como pendiente de revisión (nunca en silencio) */
  autoAdd: boolean;
  roles: Record<string, FolderRole>;
}

export const emptyFolderRoles = (): FolderRolesFile => ({ version: 1, autoAdd: false, roles: {} });

/** Carpeta POSIX sin barras sobrantes ni `\`. */
export const normFolder = (p: unknown): string =>
  String(p ?? "")
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .trim();

const oneLine = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

export const isRoleKind = (v: unknown): v is FolderRoleKind => (FOLDER_ROLES as readonly string[]).includes(String(v));

/** Nombre legible de una carpeta: último tramo sin la numeración («5 Frontend/HTML» → «HTML», «4 Backend» → «Backend»). */
export function labelOfFolder(folder: string): string {
  const last = normFolder(folder).split("/").pop() ?? "";
  return last.replace(/^[\d.]+\s+/, "").trim() || last;
}

/** Lee lo guardado en disco: ignora lo que no es válido, nunca lanza. */
export function sanitizeFolderRoles(raw: unknown): FolderRolesFile {
  const out = emptyFolderRoles();
  if (!raw || typeof raw !== "object") return out;
  const o = raw as Record<string, unknown>;
  out.autoAdd = o.autoAdd === true;
  const roles = o.roles && typeof o.roles === "object" ? (o.roles as Record<string, unknown>) : {};
  for (const [k, v] of Object.entries(roles)) {
    const folder = normFolder(k);
    const r = v && typeof v === "object" ? (v as Record<string, unknown>) : null;
    if (!folder || !r || !isRoleKind(r.role)) continue;
    out.roles[folder] = { role: r.role, objective: oneLine(r.objective, MAX_OBJECTIVE), updatedAt: oneLine(r.updatedAt, 40) };
  }
  return out;
}

/** Devuelve un archivo nuevo con el rol puesto (no muta el original). Lanza con un mensaje claro si algo no vale. */
export function setRole(file: FolderRolesFile, folder: string, role: unknown, objective: unknown, now: string): FolderRolesFile {
  const f = normFolder(folder);
  if (!f) throw new Error("Elige una carpeta.");
  if (!isRoleKind(role)) throw new Error("Rol inválido: usa área, sub-asignatura o contenedor de temas.");
  return { ...file, roles: { ...file.roles, [f]: { role, objective: oneLine(objective, MAX_OBJECTIVE), updatedAt: now } } };
}

export function clearRole(file: FolderRolesFile, folder: string): FolderRolesFile {
  const f = normFolder(folder);
  const { [f]: _gone, ...rest } = file.roles;
  return { ...file, roles: rest };
}

export const roleOf = (file: FolderRolesFile, folder: string): FolderRole | undefined => file.roles[normFolder(folder)];
