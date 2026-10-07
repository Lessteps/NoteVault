// Adds the frontmatter to theory notes written as a bare body ("# 1.19 Title …"), then generates each topic's map (canvas).
// usage: node tools/programming_kb/finalize.mjs [topic-regex]      (no argument = every topic that has a theory note)
// Prints BLOCKED for a note the map generator cannot read (fix the note's structure) and warn for unresolved links.
// It runs the generator through vitest (kb_canvas.ts only resolves there); the logic lives in
// src/core/canvas/programmingKbFinalize.test.ts, which is skipped in the normal test run.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const out = path.join(os.tmpdir(), `pkb-finalize-${process.pid}.txt`);
const vitest = path.join(frontend, "node_modules/vitest/vitest.mjs");
const r = spawnSync(process.execPath, [vitest, "run", "src/core/canvas/programmingKbFinalize.test.ts"], {
  cwd: frontend, encoding: "utf8", env: { ...process.env, PKB_FINALIZE: "1", PKB_TOPIC: process.argv[2] ?? "", PKB_OUT: out },
});
if (!fs.existsSync(out)) { console.log(r.stdout, r.stderr); process.exit(1); }
console.log(fs.readFileSync(out, "utf8"));
fs.rmSync(out, { force: true });
