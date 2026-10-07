// Runs the code of every "Case" in the Examples of theory notes and prints its REAL output next to the expected result,
// so a wrong "Expected result" is caught before it reaches the vault. Python (py -3), JavaScript and TypeScript (Node).
// usage: node tools/programming_kb/check_examples.mjs "<topic-regex>"      e.g. "^5\.(1|2) "
// env:   TSC=1   also type-check TypeScript blocks with the project's real tsc (strict)
//        CHKBASE=<dir inside frontend/>  put temp files there so `import "electron"` etc. resolve real types
// Blocks in other languages (sql, bash, json, html, css) are skipped: check those by hand or with the tool they belong to.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { listTopics } from "./common.mjs";

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..").replaceAll("\\", "/");
const re = new RegExp(process.argv[2] ?? ".");
const base = process.env.CHKBASE ?? os.tmpdir();
fs.mkdirSync(base, { recursive: true });
const tmp = fs.mkdtempSync(path.join(base, "chk-"));

const node = (file, flags = []) => spawnSync(process.execPath, [...flags, file], { encoding: "utf8", timeout: 15000, cwd: tmp });
const runners = {
  python: (f) => spawnSync("py", ["-3", "-X", "utf8", f], { encoding: "utf8", timeout: 15000, cwd: tmp }),
  javascript: (f) => node(f),
  typescript: (f) => node(f, ["--experimental-transform-types", "--disable-warning=ExperimentalWarning"]),
};
const alias = { py: "python", python: "python", js: "javascript", mjs: "javascript", cjs: "javascript", javascript: "javascript", ts: "typescript", tsx: "typescript", typescript: "typescript" };

let count = 0;
for (const t of listTopics()) {
  if (!re.test(t.topic) || !fs.existsSync(t.note)) continue;
  const examples = fs.readFileSync(t.note, "utf8").split(/^### Example /m).slice(1);
  for (const ex of examples) {
    const title = ex.split("\n")[0];
    const body = ex.split(/^## /m)[0];
    const expected = /- \*\*Expected result:\*\*\s*([\s\S]*?)(?=\n- \*\*Why it works|\n### |$)/.exec(body)?.[1]?.trim().replace(/\s+/g, " ") ?? "";
    for (const [, lang, code] of body.matchAll(/```(\w+)\n([\s\S]*?)```/g)) {
      const kind = alias[lang];
      if (!kind) continue;
      count++;
      const esm = /^\s*import\s/m.test(code) || /^await\s|^\s*console\.log\(await /m.test(code);
      const ext = kind === "python" ? ".py" : kind === "typescript" ? (esm ? ".mts" : ".ts") : /require\(/.test(code) ? ".cjs" : esm ? ".mjs" : ".js";
      const file = path.join(tmp, `c${count}${ext}`);
      fs.writeFileSync(file, code, "utf8");
      const r = runners[kind](file);
      let typeInfo = "";
      if (process.env.TSC && kind === "typescript") {
        const tsc = path.join(frontend, "node_modules/typescript/bin/tsc");
        const o = spawnSync(process.execPath, [tsc, "--noEmit", "--strict", "--target", "ES2023", "--module", "ESNext", "--moduleResolution", "Bundler", "--lib", "ES2023,DOM", "--skipLibCheck", "--typeRoots", path.join(frontend, "node_modules/@types"), "--types", "node", file], { encoding: "utf8", timeout: 60000 });
        const diag = `${o.stdout ?? ""}${o.stderr ?? ""}`.trim().split("\n").filter(Boolean).slice(0, 4).map((l) => l.replace(/^.*?c\d+\.m?ts/, "c.ts")).join(" | ");
        typeInfo = `\n   TSC: ${diag || "no type errors"}`;
      }
      const out = `${r.stdout ?? ""}${r.stderr ? "\n[stderr] " + r.stderr.trim().split("\n").slice(-2).join(" / ") : ""}`.trim().replace(/\n/g, " ⏎ ") + typeInfo;
      console.log(`[${t.number}] Example ${title.trim().slice(0, 50)} (${lang})\n   OUT: ${out.slice(0, 260)}\n   EXP: ${expected.slice(0, 260)}`);
    }
  }
}
console.log(`\n${count} code blocks run`);
fs.rmSync(tmp, { recursive: true, force: true });
