/**
 * View files — the renderer's half of the convention (the rest, which touches
 * the filesystem, lives in `core/practice/viewFiles.ts`).
 *
 * The UI project (`tsconfig.app.json`) never imports `src/core`, so the pure,
 * node-free parts are mirrored here. `lib/viewFiles.test.ts` keeps the two
 * lists in step.
 *
 *   <folder>.teorica.md    theory of a topic         (type: teorica)
 *   <folder>.practica.md   practice of a topic       (type: practica)
 *   <folder>.resumen.md    overview of an area/root  (type: resumen)
 */

export const VIEW_FILE_KINDS = ["teorica", "practica", "resumen"] as const;
export type ViewFileKind = (typeof VIEW_FILE_KINDS)[number];

/** `type:` of a note → the view it opens, or null when it opens as markdown. */
export function viewFileKind(frontmatter: Record<string, unknown> | null | undefined): ViewFileKind | null {
  const type = String(frontmatter?.type ?? "").trim().toLowerCase();
  return (VIEW_FILE_KINDS as readonly string[]).includes(type) ? (type as ViewFileKind) : null;
}

export function viewFileName(folderName: string, kind: ViewFileKind): string {
  return `${folderName}.${kind}.md`;
}

/** `<folder>/<file>.teorica.md` → the concept note of the same folder. */
export function siblingTheoryPath(viewPath: string): string {
  const cut = viewPath.lastIndexOf("/");
  const dir = cut >= 0 ? viewPath.slice(0, cut) : "";
  const name = (dir ? dir.slice(dir.lastIndexOf("/") + 1) : viewPath).replace(/\.teorica\.md$/i, "");
  return dir ? `${dir}/${name}.md` : `${name}.md`;
}
