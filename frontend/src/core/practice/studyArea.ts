/**
 * Which study area a note belongs to, for the Estudio sub-bar of the Notes module.
 * Ported from notevault_app/core/practice/study_area.py.
 */

export const STUDY_SUBJECTS = ["mathematics", "programming", "english"] as const;

export class StudyArea {
  readonly subject: string;
  readonly folder: string;
  readonly title: string;
  readonly subject_title: string;
  readonly by_subject: boolean;

  constructor(
    subject: string,
    folder: string,
    title: string,
    subjectTitle: string,
    bySubject = false,
  ) {
    this.subject = subject;
    this.folder = folder;
    this.title = title;
    this.subject_title = subjectTitle;
    this.by_subject = bySubject;
  }

  get key(): [string, string] {
    return [this.subject, this.folder];
  }

  contains(relPath: string, subject = ""): boolean {
    if (this.by_subject && subject !== this.subject) {
      return false;
    }
    if (this.folder) {
      const normalizedRel = relPath.replace(/\\/g, "/");
      return normalizedRel.startsWith(this.folder + "/");
    }
    return subject === this.subject;
  }
}

function _norm(text: unknown): string {
  const plain = String(text ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x00-\x7F]/g, "");
  return plain.trim().toLowerCase();
}

export function detectStudyArea(
  relPath: string,
  frontmatter: Record<string, any> | null,
  workspaces: Record<string, any>[],
): StudyArea | null {
  const normalized = relPath.replace(/\\/g, "/");
  const segs = normalized.split("/").filter(Boolean);
  const parts = segs.slice(0, -1);

  const names: Record<string, Record<string, any>> = {};
  for (const ws of workspaces) {
    if (ws.id && (STUDY_SUBJECTS as readonly string[]).includes(ws.id)) {
      names[ws.id] = ws;
    }
  }

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    for (const [wsId, ws] of Object.entries(names)) {
      const folders = Array.isArray(ws.folders) ? ws.folders : [];
      const candidates = new Set([
        ...folders.map(_norm),
        _norm(wsId),
        _norm(ws.name || ""),
      ]);
      if (candidates.has(_norm(part))) {
        const root = parts.slice(0, i + 1).join("/");
        if (parts.length > i + 1) {
          return new StudyArea(wsId, `${root}/${parts[i + 1]}`, parts[i + 1]!, part);
        }
        return new StudyArea(wsId, root, part, part);
      }
    }
  }

  const subject = _norm(frontmatter?.subject);
  if (subject in names) {
    const folder = parts.join("/");
    const title = parts.length > 0 ? parts[parts.length - 1]! : names[subject]!.name || subject;
    return new StudyArea(subject, folder, title, names[subject]!.name || subject, true);
  }

  return null;
}
export const detect_study_area = detectStudyArea;
