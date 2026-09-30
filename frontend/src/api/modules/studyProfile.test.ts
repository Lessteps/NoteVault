// Phase 0a · where the folder view's time goes. Env-gated (NV_VAULT), so it only
// does real work when pointed at a vault:
//   NV_VAULT="C:/PROGRAMMING" npx vitest run src/api/modules/studyProfile.test.ts
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { AppState } from "../appState.js";
import { clearStudySnapshotCache, studyApi, vaultScan } from "./study.js";
import { scanVault } from "../../core/practice/exerciseIndex.js";
import { loadAllAttempts } from "../../core/practice/ledger.js";
import { findAncestorTopicManifest, manifestsFromNotes } from "../../core/practice/topic.js";
import { parseFrontmatter } from "../../core/frontmatter.js";

const vault = process.env.NV_VAULT ?? "";
const timed = <T>(label: string, fn: () => T): T => {
  const t0 = Date.now();
  const out = fn();
  process.stdout.write(`${label}: ${Date.now() - t0} ms\n`);
  return out;
};

(vault ? describe : describe.skip)("profile · folder view", () => {
  it("breaks down the cost of study_topic_dashboard", async () => {
    const app = new AppState(vault) as never as AppState & { root: string; vault: { notePaths(): string[] }; rel(p: string): string };
    const api = studyApi(app as never);
    clearStudySnapshotCache();

    const paths = timed("notePaths()", () => app.vault.notePaths());
    process.stdout.write(`  ${paths.length} notas\n`);
    timed("scanVault()", () => scanVault(app.root, paths));
    timed("loadAllAttempts()", () => loadAllAttempts(app.root));

    // ¿E/S o CPU? 400 ficheros, por fases.
    const sample = paths.slice(0, 400);
    timed("400 × statSync", () => sample.map((p) => fs.statSync(p).size).length);
    const texts = timed("400 × readFileSync", () => sample.map((p) => fs.readFileSync(p, "utf-8")));
    timed("400 × parseFrontmatter", () => texts.filter((t) => t.startsWith("---")).map((t) => parseFrontmatter(t)[0]).length);
    process.stdout.write(`  ${texts.length} leídos · ${texts.filter((t) => t.startsWith("---")).length} con frontmatter\n`);
    const headOnly = timed("400 × cabecera 4 KB", () => sample.map((p) => {
      const fd = fs.openSync(p, "r");
      const buf = Buffer.alloc(4096);
      const n = fs.readSync(fd, buf, 0, 4096, 0);
      fs.closeSync(fd);
      return n;
    }).length);
    process.stdout.write(`  ${headOnly} cabeceras\n`);
    const cacheHit = timed("scanVault() 2ª (caché por fichero)", () => scanVault(app.root, paths));
    process.stdout.write(`  ${cacheHit.exercises.length} ejercicios\n`);

    // The dashboard's own loop: every folder that holds a note, twice (folder + parent).
    const folderSet = timed("folderSet", () => {
      const set = new Set<string>();
      for (const np of paths) {
        const rel = app.rel(np).replace(/\\/g, "/");
        const dir = path.posix.dirname(rel);
        if (!dir || dir === "." || dir === "/" || dir.startsWith("..")) continue;
        set.add(dir);
        const parent = path.posix.dirname(dir);
        if (parent && parent !== "." && parent !== "/" && !parent.startsWith("..")) set.add(parent);
      }
      return set;
    });
    process.stdout.write(`  ${folderSet.size} carpetas\n`);
    const found = timed("findAncestorTopicManifest × carpetas (viejo)", () => {
      let n = 0;
      for (const folder of folderSet) {
        const abs = app.resolve(folder, { allowRoot: true } as never);
        if (findAncestorTopicManifest(abs, app.root)) n += 1;
      }
      return n;
    });
    process.stdout.write(`  ${found} coincidencias (con duplicados)\n`);
    const scan = vaultScan(app as never);
    const manifests = timed("manifestsFromNotes (nuevo, sin E/S)", () => manifestsFromNotes(scan.notes));
    process.stdout.write(`  ${manifests.length} temas\n`);

    clearStudySnapshotCache();
    const t0 = Date.now();
    const data = await (api as unknown as { study_topic_dashboard(subject?: string): Promise<{ topics: unknown[] }> }).study_topic_dashboard();
    process.stdout.write(`study_topic_dashboard (frío): ${Date.now() - t0} ms · ${data.topics.length} temas\n`);
    const t1 = Date.now();
    await (api as unknown as { study_topic_dashboard(subject?: string): Promise<unknown> }).study_topic_dashboard();
    process.stdout.write(`study_topic_dashboard (caché): ${Date.now() - t1} ms\n`);
    expect(paths.length).toBeGreaterThan(0);
  }, 300_000);
});
