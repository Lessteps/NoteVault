/**
 * `programming_practice` — reads a project folder into something a model with a limited context can review.
 *
 * DeepSeek (the usual provider here) cannot browse a folder and tokens are scarce, so the app does the reading: it lists the
 * tree, drops everything that is not the learner's code (dependencies, build output, lockfiles, binaries, secrets), groups
 * files by layer, and fills a byte budget per layer with the most informative files first, truncating long ones. It also
 * keeps a hash manifest so a later defence only sends what changed.
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

export const GROUPS = ["database", "backend", "client", "tests", "config", "docs", "other"] as const;
export type Group = (typeof GROUPS)[number];

export interface PackedFile {
  rel: string;
  group: Group;
  bytes: number;
  text: string;
  truncated: boolean;
  hash: string;
}

export interface Skipped {
  rel: string;
  reason: string;
}

export interface ProjectPack {
  tree: string[];
  files: PackedFile[];
  skipped: Skipped[];
  /** rel path → content hash of every file that was read (for `changedSince`). */
  manifest: Record<string, string>;
}

const IGNORED_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "out", ".next", ".nuxt", ".venv", "venv", "env", "__pycache__", "coverage", ".pytest_cache",
  ".mypy_cache", ".ruff_cache", "release", "target", ".idea", ".vscode", ".gradle", ".expo", "Pods", ".turbo", ".cache", "dist-electron",
]);
const LOCKFILES = new Set(["package-lock.json", "yarn.lock", "pnpm-lock.yaml", "poetry.lock", "Pipfile.lock", "uv.lock", "Cargo.lock", "composer.lock"]);
const BINARY_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".icns", ".pdf", ".zip", ".gz", ".tar", ".7z", ".exe", ".dll", ".so", ".dylib", ".bin",
  ".db", ".sqlite", ".sqlite3", ".woff", ".woff2", ".ttf", ".otf", ".mp3", ".mp4", ".wav", ".apk", ".aab", ".jar", ".class", ".pyc", ".map",
]);
/** What the app itself writes into a project folder: not the learner's work. */
const OWN_FILES = /^(SPEC\.md|\.pp\.json|DEFENSE-.*\.md|POSTMORTEM.*\.md)$/;

export const MAX_FILE_READ = 400_000;
const MAX_FILES = 2000;
const MAX_DEPTH = 8;

const sha = (text: string): string => crypto.createHash("sha1").update(text).digest("hex").slice(0, 16);

/** Approximate tokens for a text (about 3.6 characters per token for code). */
export const estimateTokens = (chars: number): number => Math.ceil(chars / 3.6);

/** Which layer a file belongs to, by its path. First match wins. */
export function classify(rel: string): Group {
  const p = rel.replace(/\\/g, "/").toLowerCase();
  const name = p.split("/").pop() ?? "";
  const segs = p.split("/").slice(0, -1);
  const ext = path.extname(name);
  const inDir = (...names: string[]) => segs.some((s) => names.includes(s));
  if (inDir("__tests__", "tests", "test", "spec", "specs", "e2e") || /\.(test|spec)\.[a-z]+$/.test(name) || /^test_.*\.py$/.test(name) || /_test\.py$/.test(name)) return "tests";
  if (ext === ".sql" || inDir("migrations", "migration", "db", "database", "schema", "prisma", "alembic", "seeds") || /^(schema|models)\.(sql|prisma)$/.test(name)) return "database";
  if (name === "readme.md" || ext === ".md") return "docs";
  if (/^(package\.json|tsconfig.*\.json|pyproject\.toml|requirements.*\.txt|dockerfile|docker-compose\.ya?ml|vite\.config\..*|eslint.*|\.eslintrc.*|\.prettierrc.*|pytest\.ini|setup\.cfg|\.gitignore|\.env\.example)$/.test(name) || /\.config\.[a-z]+$/.test(name)) return "config";
  if ([".tsx", ".jsx", ".vue", ".svelte", ".css", ".scss", ".html"].includes(ext) || inDir("client", "frontend", "web", "renderer", "components", "pages", "screens", "ui", "public", "electron", "preload", "mobile", "android", "ios", "atoms", "molecules", "organisms", "templates", "hooks")) return "client";
  if ([".py", ".ts", ".js", ".mjs", ".cjs", ".kt", ".java", ".go", ".rs", ".cs"].includes(ext)) return "backend";
  return "other";
}

/** Replaces strings that look like credentials, so they never travel to a model. */
export function redact(text: string): string {
  return text
    .replace(/\b(sk|pk|rk)-[A-Za-z0-9_-]{16,}\b/g, "[redacted-key]")
    .replace(/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, "[redacted-token]")
    .replace(/\b(AKIA|ASIA)[A-Z0-9]{16}\b/g, "[redacted-aws]")
    .replace(/((?:password|passwd|secret|api[_-]?key|token)\s*[:=]\s*)(["'])[^"'\n]{6,}\2/gi, "$1$2[redacted]$2");
}

const looksBinary = (buf: Buffer): boolean => buf.subarray(0, 4000).includes(0);

/** Walks the folder and reads what is reviewable. Pure reading: never writes. */
export function readProject(dir: string): ProjectPack {
  const root = path.resolve(dir);
  const tree: string[] = [];
  const files: PackedFile[] = [];
  const skipped: Skipped[] = [];
  const manifest: Record<string, string> = {};
  let seen = 0;

  const walk = (abs: string, rel: string, depth: number): void => {
    if (depth > MAX_DEPTH) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    } catch {
      return;
    }
    for (const e of entries) {
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (IGNORED_DIRS.has(e.name)) {
          skipped.push({ rel: `${childRel}/`, reason: "dependencies / build output" });
          continue;
        }
        tree.push(`${childRel}/`);
        walk(path.join(abs, e.name), childRel, depth + 1);
        continue;
      }
      if (!e.isFile()) continue;
      tree.push(childRel);
      if (++seen > MAX_FILES) {
        skipped.push({ rel: childRel, reason: "too many files" });
        continue;
      }
      if (OWN_FILES.test(e.name)) continue;
      if (/^\.env(\..*)?$/.test(e.name) && e.name !== ".env.example") {
        skipped.push({ rel: childRel, reason: "may hold secrets" });
        continue;
      }
      if (/\.(pem|key|p12|pfx|keystore|jks)$/i.test(e.name)) {
        skipped.push({ rel: childRel, reason: "key material" });
        continue;
      }
      if (LOCKFILES.has(e.name)) {
        skipped.push({ rel: childRel, reason: "lockfile" });
        continue;
      }
      if (BINARY_EXT.has(path.extname(e.name).toLowerCase())) {
        skipped.push({ rel: childRel, reason: "binary" });
        continue;
      }
      let buf: Buffer;
      try {
        const size = fs.statSync(path.join(abs, e.name)).size;
        if (size > MAX_FILE_READ) {
          skipped.push({ rel: childRel, reason: `too large (${Math.round(size / 1024)} KB)` });
          continue;
        }
        buf = fs.readFileSync(path.join(abs, e.name));
      } catch {
        continue;
      }
      if (looksBinary(buf)) {
        skipped.push({ rel: childRel, reason: "binary" });
        continue;
      }
      const text = redact(buf.toString("utf-8"));
      const hash = sha(text);
      manifest[childRel] = hash;
      files.push({ rel: childRel, group: classify(childRel), bytes: Buffer.byteLength(text), text, truncated: false, hash });
    }
  };
  walk(root, "", 0);
  return { tree, files, skipped, manifest };
}

/** Files that are new or different from a previous manifest (and the ones that disappeared). */
export function changedSince(pack: ProjectPack, previous: Record<string, string> | null | undefined): { changed: PackedFile[]; removed: string[] } {
  if (!previous) return { changed: pack.files, removed: [] };
  return {
    changed: pack.files.filter((f) => previous[f.rel] !== f.hash),
    removed: Object.keys(previous).filter((rel) => !(rel in pack.manifest)),
  };
}

const ENTRY = /(^|\/)(index|main|app|server|routes?|router|schema|models?|store|api|service|repository|controller|preload|ipc|migration[^/]*)\.[a-z]+$/i;

/** How informative a file is for a review: entry points and shallow files first, tiny and huge ones last. */
function importance(f: PackedFile): number {
  const depth = f.rel.split("/").length - 1;
  let s = 100 - depth * 8;
  if (ENTRY.test(f.rel)) s += 40;
  if (f.bytes < 80) s -= 60;
  if (f.bytes > 20_000) s -= 20;
  return s;
}

/** Keeps the start and the end of a long file: the signatures and the exports are what a review needs. */
export function truncateMiddle(text: string, max: number): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  const head = Math.floor(max * 0.7);
  const tail = max - head;
  return { text: `${text.slice(0, head)}\n/* … ${text.length - max} characters omitted … */\n${text.slice(text.length - tail)}`, truncated: true };
}

export interface SelectOptions {
  groups: readonly Group[];
  /** Total characters for the whole selection. */
  budget?: number;
  /** Characters per file before the middle is cut. */
  perFile?: number;
  /** When given, only these files are considered (the changed ones). */
  only?: ReadonlySet<string>;
}

export interface Selection {
  files: PackedFile[];
  chars: number;
  estimatedTokens: number;
  /** Files of those groups that did not fit. */
  left: string[];
}

export function selectFiles(pack: ProjectPack, opts: SelectOptions): Selection {
  const budget = opts.budget ?? 36_000;
  const perFile = opts.perFile ?? 9_000;
  const wanted = pack.files.filter((f) => opts.groups.includes(f.group) && (!opts.only || opts.only.has(f.rel))).sort((a, b) => importance(b) - importance(a));
  const out: PackedFile[] = [];
  const left: string[] = [];
  let chars = 0;
  for (const f of wanted) {
    const cut = truncateMiddle(f.text, perFile);
    if (chars + cut.text.length > budget) {
      left.push(f.rel);
      continue;
    }
    chars += cut.text.length;
    out.push({ ...f, text: cut.text, truncated: cut.truncated });
  }
  return { files: out, chars, estimatedTokens: estimateTokens(chars), left };
}

/** `### path` + fenced content, the form every review prompt uses. */
export function renderFiles(files: readonly PackedFile[]): string {
  return files.map((f) => `### ${f.rel}${f.truncated ? " (truncated)" : ""}\n\`\`\`\n${f.text}\n\`\`\``).join("\n\n");
}
