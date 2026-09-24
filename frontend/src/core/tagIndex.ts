/**
 * Tag index for NoteVault.
 * Ported from notevault_app/core/tag_index.py.
 *
 * Scans the vault for #tags in note bodies and the 'tags:' frontmatter field,
 * building an inverted index {tag: set(paths)}.
 */

import * as path from "node:path";
import { toPosix } from "./paths";

const TAG_RE = /(?<!\S)#([A-Za-z0-9_/\-]+)/g;
const FENCE_RE = /^```[\s\S]*?^```/gm;

/** Extract #tags from a note body, ignoring code fences. */
export function extractInlineTags(body: string): string[] {
  const stripped = (body ?? "").replace(FENCE_RE, "");
  const matches = stripped.matchAll(TAG_RE);
  return Array.from(matches, (m) => m[1]!);
}

/** Extract tags from YAML frontmatter 'tags:' field. */
export function extractFmTags(frontmatter: string): string[] {
  const tags: string[] = [];
  let inTags = false;

  for (const rawLine of (frontmatter ?? "").split(/\r?\n/)) {
    const stripped = rawLine.trim();
    if (stripped.startsWith("tags:")) {
      let rest = stripped.slice(5).trim();
      if (rest.startsWith("[")) {
        rest = rest.replace(/^\[|\]$/g, "");
        for (const t of rest.split(",")) {
          const clean = t.trim().replace(/^["']|["']$/g, "");
          if (clean) tags.push(clean);
        }
      } else if (rest) {
        tags.push(rest.replace(/^["']|["']$/g, ""));
      }
      inTags = true;
    } else if (inTags) {
      if (stripped.startsWith("- ")) {
        tags.push(stripped.slice(2).trim().replace(/^["']|["']$/g, ""));
      } else if (stripped && !stripped.startsWith("#")) {
        break;
      }
    }
  }

  return tags;
}

export interface NoteLike {
  path: string;
  text: string;
}

export class TagIndex {
  private static shared = new Map<string, TagIndex>();

  static forVault(vaultIndex: { vault: { vaultRoot: string } }): TagIndex {
    const root = path.resolve(vaultIndex.vault.vaultRoot);
    let idx = TagIndex.shared.get(root);
    if (!idx) {
      idx = new TagIndex();
      TagIndex.shared.set(root, idx);
    }
    return idx;
  }

  private index = new Map<string, Set<string>>();

  build(notes: NoteLike[]): Map<string, Set<string>> {
    const idx = new Map<string, Set<string>>();

    for (const note of notes) {
      const text = note.text ?? "";
      let body = text;
      let fmText = "";

      if (text.startsWith("---")) {
        const end = text.indexOf("\n---", 3);
        if (end !== -1) {
          fmText = text.slice(3, end);
          body = text.slice(end + 4);
        }
      }

      const allTags = new Set<string>([
        ...extractFmTags(fmText),
        ...extractInlineTags(body),
      ]);

      const notePath = toPosix(path.resolve(note.path));
      for (const tag of allTags) {
        if (!idx.has(tag)) {
          idx.set(tag, new Set());
        }
        idx.get(tag)!.add(notePath);
      }
    }

    this.index = idx;
    return idx;
  }

  getIndex(): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    for (const [tag, paths] of this.index.entries()) {
      out[tag] = Array.from(paths).sort();
    }
    return out;
  }

  pathsForTag(tag: string): string[] {
    const s = this.index.get(tag);
    return s ? Array.from(s).sort() : [];
  }

  tagsForPath(filePath: string): string[] {
    const target = toPosix(path.resolve(filePath));
    const out: string[] = [];
    for (const [tag, paths] of this.index.entries()) {
      if (paths.has(target)) {
        out.push(tag);
      }
    }
    return out.sort();
  }

  /** Return [(tag, count)] sorted by count descending then name. */
  allTagsSorted(): Array<[string, number]> {
    const entries: Array<[string, number]> = [];
    for (const [tag, paths] of this.index.entries()) {
      entries.push([tag, paths.size]);
    }
    return entries.sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].toLowerCase().localeCompare(b[0].toLowerCase());
    });
  }
}
