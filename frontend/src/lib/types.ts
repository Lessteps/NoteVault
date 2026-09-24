// Shapes returned by notevault_app/webapp/api.py. Keep in step with it.

export interface AppInfo {
  api_version: number;
  vault_name: string;
  vault_path: string;
  theme: "dark" | "light";
}

export interface TreeEntry {
  type: "folder" | "note";
  name: string;
  /** Vault-relative POSIX path. */
  path: string;
  kind?: "note" | "code" | "canvas";
  has_children?: boolean;
}

export type Frontmatter = Record<string, unknown>;

export interface NoteData {
  path: string;
  name: string;
  title: string;
  kind: "note" | "code";
  raw: string;
  frontmatter: Frontmatter;
  body: string;
  /** mtime in seconds; sent back on save to detect outside edits. */
  modified: number;
  bookmarked: boolean;
}

export interface WriteResult {
  ok: boolean;
  conflict: boolean;
  modified: number;
}

export interface SearchHit {
  path: string;
  title: string;
  line_no: number;
  line: string;
}

export interface Mentions {
  linked: SearchHit[];
  unlinked: SearchHit[];
}

export interface Bookmark {
  path: string;
  label: string;
}

export interface IndexEntry {
  path: string;
  title: string;
}
