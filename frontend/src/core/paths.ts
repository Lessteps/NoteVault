import * as fs from "node:fs";
import * as path from "node:path";

/** Normalize any path to use forward slashes (POSIX format). */
export function toPosix(p: string): string {
  return p.split(path.sep).join("/");
}

/** Return relative path from root to target with forward slashes (e.g. "notes/daily.md").
 * If root and target resolve to the same path, returns "". */
export function relPosix(root: string, target: string): string {
  const rel = path.relative(path.resolve(root), path.resolve(target));
  return rel ? toPosix(rel) : "";
}

/** Check whether targetPath is strictly inside or at vaultRoot (guards against path traversal). */
export function insideVault(vaultRoot: string, targetPath: string): boolean {
  const r = path.resolve(vaultRoot);
  const t = path.resolve(targetPath);
  const rel = path.relative(r, t);
  return !rel.startsWith("..") && !path.isAbsolute(rel);
}

/** Recursively list all files in dir. Returns paths relative to dir (in POSIX format). */
export function listFilesRecursive(dir: string, baseDir: string = dir): string[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const results: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listFilesRecursive(full, baseDir));
    } else if (entry.isFile()) {
      results.push(relPosix(baseDir, full));
    }
  }
  return results;
}
