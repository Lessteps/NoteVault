import * as fs from "node:fs";
import * as path from "node:path";
import { ApiError } from "../../core/errors.js";
import { openOrCreateToday } from "../../core/dailyNotes.js";
import { listTemplates, readAndExpand } from "../../core/templates.js";
import { TagIndex } from "../../core/tagIndex.js";
import { AppConfig } from "../appConfig.js";
import { AppState } from "../appState.js";
import { oneLine } from "../common.js";

export const MAX_TEMPLATE_BYTES = 512 * 1024;
const TAG_RE = /^[A-Za-z0-9_/\-]{1,80}$/;

function isInsideOrRoot(root: string, child: string): boolean {
  try {
    const rel = path.relative(root, path.resolve(child));
    return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
  } catch {
    return false;
  }
}

export function notesExtrasApi(app: AppState) {
  function templatesDir(): string {
    return AppConfig.get_templates_dir(app.root);
  }

  function templatePath(name: string): string {
    const cleanName = String(name || "");
    const folder = templatesDir();
    for (const p of listTemplates(folder)) {
      if (path.basename(p) === cleanName) {
        const stat = fs.statSync(p);
        if (stat.size > MAX_TEMPLATE_BYTES) {
          throw new ApiError("La plantilla es demasiado grande.");
        }
        return p;
      }
    }
    throw new ApiError("Esa plantilla no existe.");
  }

  function tagIndex(): TagIndex {
    const idx = TagIndex.forVault(app.service.index);
    idx.build(app.service.index.notes(true));
    return idx;
  }

  return {
    templates_list() {
      const folder = templatesDir();
      return {
        folder: isInsideOrRoot(app.root, folder) ? app.rel(folder) : folder,
        templates: listTemplates(folder).map((p) => ({
          name: path.basename(p),
          title: path.parse(p).name,
        })),
      };
    },

    template_text(name: string, title = "") {
      const p = templatePath(name);
      return {
        text: readAndExpand(p, { title: oneLine(title, 200) }),
      };
    },

    note_from_template(name: string, title: string, folderRel = "") {
      const cleanTitle = oneLine(title, 200);
      if (!cleanTitle) {
        throw new ApiError("El título está vacío.");
      }
      const text = readAndExpand(templatePath(name), { title: cleanTitle });
      const folder = app.resolve(folderRel, { allowRoot: true });
      if (!fs.statSync(folder).isDirectory()) {
        throw new ApiError("No es una carpeta.");
      }
      const note = app.vault.createNote(cleanTitle, folder);
      fs.writeFileSync(note.path, text, "utf-8");
      app.service.index.update(note.path, text);
      return { path: app.rel(note.path) };
    },

    daily_note() {
      let folder = AppConfig.get_daily_notes_dir(app.root);
      if (!isInsideOrRoot(app.root, folder)) {
        folder = path.join(app.root, "Diario");
      }
      let tmpl = AppConfig.get_daily_notes_template();
      if (tmpl !== null && tmpl !== undefined) {
        try {
          const stat = fs.statSync(tmpl);
          if (!stat.isFile() || stat.size > MAX_TEMPLATE_BYTES) {
            tmpl = null;
          }
        } catch {
          tmpl = null;
        }
      }
      const notePath = openOrCreateToday(app.root, folder, tmpl);
      return { path: app.rel(notePath) };
    },

    tags_list() {
      return tagIndex()
        .allTagsSorted()
        .map(([tag, count]) => ({ tag, count }));
    },

    tag_notes(tag: string) {
      const cleanTag = String(tag || "").replace(/^#+/, "");
      if (!TAG_RE.test(cleanTag)) {
        throw new ApiError("Etiqueta inválida.");
      }
      const out: Array<{ path: string; title: string }> = [];
      for (const p of tagIndex().pathsForTag(cleanTag)) {
        if (isInsideOrRoot(app.root, p)) {
          out.push({
            path: app.rel(p),
            title: path.parse(p).name,
          });
        }
      }
      return out.sort((a, b) => a.title.toLowerCase().localeCompare(b.title.toLowerCase()));
    },
  };
}
