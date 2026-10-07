// @ts-nocheck — drives the plain-Node tools in tools/programming_kb (untyped .mjs) through vitest, because kb_canvas.ts
// only resolves under vitest/vite. Skipped unless PKB_FINALIZE is set: it WRITES into the Programación space.
// Do not run this file directly: use `node tools/programming_kb/finalize.mjs [topic-regex]`.
import * as fs from "node:fs";
import { it } from "vitest";
import { generateConcept } from "../../../tools/kb_canvas";
import { LANG, listTopics, quote, slug } from "../../../tools/programming_kb/common.mjs";
import { typeOf } from "../../../tools/programming_kb/topic_types.mjs";

it.skipIf(!process.env.PKB_FINALIZE)("finalize the Programación topics", { timeout: 900000 }, () => {
  const re = process.env.PKB_TOPIC ? new RegExp(process.env.PKB_TOPIC) : null;
  const out: string[] = [];
  let notes = 0, missing = 0, mapped = 0, blocked = 0, warned = 0;
  for (const t of listTopics()) {
    if (!fs.existsSync(t.note)) { missing++; continue; }
    notes++;
    if (re && !re.test(t.topic)) continue;
    let raw = fs.readFileSync(t.note, "utf8");
    if (raw.startsWith("# ")) {
      const requires = /^## Requires\s*\n([\s\S]*?)(?=^## )/m.exec(raw)?.[1] ?? "";
      const prereqs = [...requires.matchAll(/\[\[([^\]|]+)/g)].map((m) => m[1].trim());
      const difficulty = t.index < t.count / 3 ? 1 : t.index < (2 * t.count) / 3 ? 2 : 3;
      raw = [
        "---", `id: programming.${slug(`${t.number} ${t.title}`)}`, `title: ${quote(t.title)}`, `number: ${quote(t.number)}`,
        `area: ${quote(t.area)}`, `topic: ${quote(t.topic)}`, "type: teorica", `topic_type: ${typeOf(t.number)}`, `difficulty: ${difficulty}`,
        "subject: programming", `language: ${LANG[t.areaNumber] ?? "agnostic"}`,
        prereqs.length ? `prerequisites: [${prereqs.map(quote).join(", ")}]` : "prerequisites: []",
        "status: draft", "verified: false", "sources: []", "---", "", "",
      ].join("\n") + raw;
      fs.writeFileSync(t.note, raw, "utf8");
    }
    try {
      const r = generateConcept(t.dir);
      if (r.problems.length) { blocked++; out.push(`BLOCKED ${t.topic}: ${r.problems.slice(0, 3).join(" | ")}`); } else mapped++;
      if (r.warnings.length) { warned++; out.push(`warn ${t.topic}: ${r.warnings.join(" | ")}`); }
    } catch (e) { blocked++; out.push(`ERROR ${t.topic}: ${e.message}`); }
  }
  out.push(`notes ${notes} · without note ${missing} · maps ${mapped} · blocked ${blocked} · with warnings ${warned}`);
  fs.writeFileSync(process.env.PKB_OUT, out.join("\n"), "utf8");
});
