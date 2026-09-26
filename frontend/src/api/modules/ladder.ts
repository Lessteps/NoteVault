// Ported from notevault_app/webapp/modules/ladder.py
// Escalera de demostración: practice a theorem note level by level (L1
// strategy … L6 variant). L2 (ordering) is checked here; the other levels are
// graded by the AI like Práctica. Steps a level hides never reach the page.

import * as fs from "node:fs";
import * as path from "node:path";
import {
  AIConfig,
  BRIDGE_URLS,
  buildBridgePrompt,
  sendChat,
} from "../../core/aiClient.js";
import { ApiError } from "../../core/errors.js";
import { PracticeAttemptStore } from "../../core/practice/attempts.js";
import { applyResult, recentErrors } from "../../core/practice/errorLog.js";
import {
  GradeParseError,
  type GradeResult,
  parseGradeReply,
} from "../../core/practice/grading.js";
import {
  closeRequest,
  pendingForNote,
  readRequest,
  readResponse,
  responsePath,
  writeRequest,
} from "../../core/practice/handoff.js";
import {
  LEVELS,
  type LadderState,
  type ProofNote,
  availableLevels,
  buildLadderMessages,
  hiddenSteps,
  ladderNote,
  ladderState,
  levelExercise,
  levelOf,
  localOrderResult,
  modeId,
  passed,
  proofMarkdown,
  rubricFor,
  shuffledOrder,
  statementMarkdown,
} from "../../core/practice/ladder.js";
import { parseTimer } from "../../core/practice/timer.js";
import { AppConfig } from "../appConfig.js";
import type { AppState } from "../appState.js";
import { clampInt } from "../common.js";

const MAX_ANSWER = 60_000;
const _REQ_RE = /^req_\d{14}_[0-9a-f]{6}$/;

function cleanFields(data: any, n: number): string[] {
  const fields = data && typeof data === "object" ? data.fields : null;
  if (!Array.isArray(fields)) {
    return [];
  }
  return fields.slice(0, Math.max(1, n)).map((f: any) => String(f ?? "").slice(0, MAX_ANSWER));
}

function resultDict(r: GradeResult): Record<string, unknown> {
  return {
    score: r.score,
    verdict: r.verdict,
    rubric: [...r.rubric],
    errors: r.errors.map((e) => ({
      category: e.category,
      anchor: e.anchor,
      description: e.description,
      evidence: e.evidence,
      fix: e.fix,
    })),
    feedback: r.feedback,
    next_step: r.next_step,
    example: r.example,
  };
}

function historyList(attempts: any[]): Array<Record<string, unknown>> {
  return (attempts || []).slice(-30).map((a) => ({
    at: a.at || "",
    score: parseInt(String(a.score || 0), 10) || 0,
    verdict: a.verdict || "",
    quality: a.quality ?? null,
    seconds: a.seconds || 0,
    transport: a.transport || "",
  }));
}

function getProof(app: AppState, rel: string): [string, ProofNote] {
  const p = app.resolve(rel);
  let stat: fs.Stats;
  try {
    stat = fs.statSync(p);
  } catch {
    throw new ApiError("No es una nota.");
  }
  if (!stat.isFile() || path.extname(p).toLowerCase() !== ".md") {
    throw new ApiError("No es una nota.");
  }
  const text = fs.readFileSync(p, "utf-8");
  const proof = ladderNote(text, p);
  if (proof === null) {
    throw new ApiError("No se pudieron leer los pasos de esta demostración: ábrela en el editor.");
  }
  return [p, proof];
}

function getLadderState(root: string, proof: ProofNote): [LadderState, any[]] {
  const atts = new PracticeAttemptStore(root).attempts(proof.note_id);
  const top = Math.max(...availableLevels(proof));
  return [ladderState(atts, top), atts];
}

function checkLadderLevel(root: string, proof: ProofNote, level: any, unlocked = false): number {
  const lv = clampInt(level, 0, 99, 0);
  const avail = availableLevels(proof);
  if (!avail.includes(lv)) {
    throw new ApiError("Nivel inválido.");
  }
  if (unlocked && !getLadderState(root, proof)[0].unlocked(lv)) {
    throw new ApiError(`El nivel ${lv} todavía está bloqueado: supera antes el anterior.`);
  }
  return lv;
}

function draftKey(proof: ProofNote, level: number): string {
  return `${proof.note_id}#L${level}`;
}

function ladderData(proof: ProofNote, lv: number, data: any): Record<string, any> {
  const n = proof.steps.length;
  const d = data && typeof data === "object" ? data : {};
  const out: Record<string, any> = { fields: cleanFields(d, n) };
  if (lv === 2) {
    const order = d.order;
    if (
      !Array.isArray(order) ||
      order.length !== n ||
      !order.every((x) => typeof x === "number") ||
      [...order].sort((a, b) => a - b).some((v, i) => v !== i)
    ) {
      throw new ApiError("Orden inválido.");
    }
    out.order = order.map((i) => Math.trunc(Number(i)));
  }
  if (lv === 3) {
    const hidden = d.hidden;
    if (
      !Array.isArray(hidden) ||
      hidden.length === 0 ||
      !hidden.every((i) => typeof i === "number" && Number.isInteger(i) && 0 <= i && i < n)
    ) {
      throw new ApiError("Pasos ocultos inválidos.");
    }
    out.hidden = Array.from(new Set(hidden)).sort((a, b) => a - b);
  }
  if (lv === 6) {
    const v = d.variant;
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v >= proof.variants.length) {
      throw new ApiError("Variante inválida.");
    }
    out.variant = v;
  }
  return out;
}

function ladderAnswer(lv: number, d: Record<string, any>): string {
  const texts = (d.fields || []).map((t: string) => t.trim());
  if (lv === 2) {
    return "Orden: " + (d.order || []).map((i: number) => i + 1).join(", ");
  }
  if (lv === 3) {
    return (d.hidden || [])
      .map((i: number, idx: number) => `Paso ${i + 1}: ${texts[idx] || ""}`)
      .join("\n\n");
  }
  if (lv === 4) {
    return texts.map((t: string, i: number) => `Paso ${i + 1} — Por qué: ${t}`).join("\n\n");
  }
  return texts[0] || "";
}

function ladderShown(proof: ProofNote, lv: number, d: Record<string, any>): string {
  if (lv === 3) {
    const hiddenSet = new Set(d.hidden || []);
    return proof.steps
      .map((s, i) =>
        hiddenSet.has(i)
          ? `${i + 1}. [HIDDEN — the learner writes this step]`
          : `${i + 1}. ${s.text}` + (s.why ? ` (Por qué: ${s.why})` : ""),
      )
      .join("\n");
  }
  if (lv === 4) {
    return proofMarkdown(proof, false);
  }
  return "Only the theorem statement.";
}

function ladderFinish(
  app: AppState,
  p: string,
  proof: ProofNote,
  lv: number,
  d: Record<string, any>,
  result: GradeResult,
  transport: string,
  answer: string,
  seconds: number,
  seen: boolean,
) {
  const [before] = getLadderState(app.root, proof);
  const rubric = rubricFor(proof, lv, d.hidden);
  const ex = levelExercise(proof, lv, rubric);
  const attempt = applyResult(app.root, ex, app.rel(p), {
    answer,
    hints_used: 0,
    seconds,
    solution_seen: seen,
    transport,
    result,
    entity_type: modeId(lv),
  });
  new PracticeAttemptStore(app.root).saveDraft(draftKey(proof, lv), app.rel(p), "");
  const [after] = getLadderState(app.root, proof);
  const ok = passed(result.score, seen);
  const top = Math.max(...availableLevels(proof));
  let msg: string;
  if (ok && lv === top) {
    msg = "Escalera completada: repasa cuando te lo pida el repaso espaciado.";
  } else if (ok && after.current > before.current) {
    msg = `Nivel superado · se desbloquea L${after.current}`;
  } else if (ok) {
    msg = "Nivel superado";
  } else if (after.current < before.current) {
    msg = `No superado · bajas a L${after.current}`;
  } else {
    msg = "No superado · repite este nivel";
  }
  return {
    graded: true,
    result: resultDict(result),
    quality: attempt.quality,
    rubric,
    passed: ok,
    message: msg,
    current: after.current,
  };
}

export function ladderApi(app: AppState) {
  const aiCfg = () => AIConfig.fromDict(AppConfig.get_ai_config());

  return {
    ladder_load(rel: string) {
      const [p, proof] = getProof(app, rel);
      const [state, atts] = getLadderState(app.root, proof);
      const levels = availableLevels(proof);
      let pending: { id: string; level: number } | null = null;
      for (const req of pendingForNote(app.root, proof.note_id)) {
        const reqLv = levelOf(req.mode);
        if (levels.includes(reqLv)) {
          pending = { id: String(req.id), level: reqLv };
        }
      }
      const hist = historyList(atts);
      const last30 = atts.slice(-30);
      const history = hist.map((h, i) => ({
        ...h,
        level: levelOf(last30[i]?.mode),
      }));

      return {
        path: app.rel(p),
        title: proof.title,
        subject: proof.subject,
        technique: proof.technique,
        difficulty: proof.difficulty,
        statement: statementMarkdown(proof),
        steps: proof.steps.length,
        levels: levels.map((n) => ({ number: n, label: LEVELS[n]?.label || `L${n}` })),
        state: {
          current: state.current,
          passed: Array.from(state.passed).sort((a, b) => a - b),
          best: Object.fromEntries(Object.entries(state.best).map(([k, v]) => [String(k), v])),
          count: Object.fromEntries(Object.entries(state.count).map(([k, v]) => [String(k), v])),
        },
        history,
        pending,
      };
    },

    ladder_level(rel: string, level: number) {
      const [_p, proof] = getProof(app, rel);
      const lv = checkLadderLevel(app.root, proof, level, true);
      const [state] = getLadderState(app.root, proof);
      const store = new PracticeAttemptStore(app.root);
      let draft: any = {};
      try {
        draft = JSON.parse(store.draft(draftKey(proof, lv)) || "{}");
      } catch {
        draft = {};
      }
      if (!draft || typeof draft !== "object") {
        draft = {};
      }
      const n = proof.steps.length;
      const seed = `${proof.note_id}:${lv}:${state.count[lv] || 0}`;
      const info = LEVELS[lv];
      if (!info) {
        throw new ApiError("Nivel inválido.");
      }
      const spec = parseTimer(info.timer, 0, "stopwatch");
      const out: Record<string, any> = {
        level: lv,
        label: info.label,
        task: info.task,
        timer: { kind: spec.kind, seconds: spec.seconds, break_seconds: spec.break_seconds },
        fields: cleanFields(draft, n),
      };
      if (lv === 2) {
        let order = draft.order;
        if (
          !Array.isArray(order) ||
          order.length !== n ||
          [...order].sort((a, b) => a - b).some((v, i) => v !== i)
        ) {
          order = shuffledOrder(n, seed);
        }
        out.order = order;
        out.steps = proof.steps.map((s) => ({ text: s.text }));
      } else if (lv === 3) {
        let hidden = draft.hidden;
        if (
          !Array.isArray(hidden) ||
          hidden.length === 0 ||
          !hidden.every((i) => typeof i === "number" && Number.isInteger(i) && 0 <= i && i < n)
        ) {
          hidden = hiddenSteps(n, seed);
        }
        const sortedHidden = [...hidden].sort((a, b) => a - b);
        out.hidden = sortedHidden;
        const hiddenSet = new Set(sortedHidden);
        out.steps = proof.steps.map((s, i) =>
          hiddenSet.has(i) ? { text: "", why: "" } : { text: s.text, why: s.why },
        );
      } else if (lv === 4) {
        out.steps = proof.steps.map((s) => ({ text: s.text }));
      } else if (lv === 6) {
        const v = draft.variant;
        out.variants = proof.variants;
        out.variant =
          typeof v === "number" && Number.isInteger(v) && 0 <= v && v < proof.variants.length
            ? v
            : (state.count[6] || 0) % Math.max(1, proof.variants.length);
      }
      return out;
    },

    ladder_save_draft(rel: string, level: number, data: Record<string, unknown>) {
      const [p, proof] = getProof(app, rel);
      const lv = checkLadderLevel(app.root, proof, level);
      const clean = ladderData(proof, lv, data);
      const empty =
        !clean.fields.some((f: string) => f.trim().length > 0) && !("order" in clean);
      new PracticeAttemptStore(app.root).saveDraft(
        draftKey(proof, lv),
        app.rel(p),
        empty ? "" : JSON.stringify(clean),
      );
      return { ok: true };
    },

    async ladder_grade(
      rel: string,
      level: number,
      data: Record<string, unknown>,
      seconds: number = 0,
      solution_seen: boolean = false,
      via: string = "",
    ) {
      const secs = clampInt(seconds, 0, 10_000_000, 0);
      const seen = Boolean(solution_seen);
      const [p, proof] = getProof(app, rel);
      const lv = checkLadderLevel(app.root, proof, level, true);
      const d = ladderData(proof, lv, data);
      const answer = ladderAnswer(lv, d);
      if (lv === 2) {
        return ladderFinish(
          app,
          p,
          proof,
          lv,
          d,
          localOrderResult(d.order),
          "local",
          answer,
          secs,
          seen,
        );
      }
      const texts = d.fields.map((t: string) => t.trim());
      const expected = lv === 3 ? d.hidden.length : lv === 4 ? proof.steps.length : 1;
      if (texts.length < expected || texts.slice(0, expected).some((t: string) => !t)) {
        throw new ApiError(
          expected > 1
            ? "Completa todos los huecos antes de entregar."
            : "Escribe una respuesta antes de entregarla.",
        );
      }
      let recent: any[] = [];
      try {
        recent = recentErrors(app.root, proof.subject);
      } catch {
        recent = [];
      }
      const variant = lv === 6 ? proof.variants[d.variant] || "" : "";
      const rubric = rubricFor(proof, lv, d.hidden);
      const messages = buildLadderMessages(proof, lv, answer, {
        rubric,
        shown: ladderShown(proof, lv, d),
        seconds: secs,
        solution_seen: seen,
        recent_errors: recent,
        variant,
      });
      new PracticeAttemptStore(app.root).saveDraft(
        draftKey(proof, lv),
        app.rel(p),
        JSON.stringify(d),
      );
      const cfg = aiCfg();
      if (via === "handoff" || cfg.is_bridge) {
        for (const old of pendingForNote(app.root, proof.note_id)) {
          closeRequest(app.root, old.id);
        }
        const meta = {
          note_id: proof.note_id,
          note_path: app.rel(p),
          subject: proof.subject,
          mode: modeId(lv),
          level: lv,
          answer,
          hints_used: 0,
          seconds: secs,
          solution_seen: seen,
          ...d,
        };
        const req = writeRequest(app.root, "grade", messages, meta);
        const out: Record<string, any> = {
          graded: false,
          request: req,
          request_path: path.posix.join(
            app.root.replace(/\\/g, "/"),
            `.notevault/estudio/handoff/requests/${req}.md`,
          ),
          response_file: responsePath(app.root, req).replace(/\\/g, "/"),
        };
        if (via !== "handoff") {
          out.bridge = true;
          out.prompt = buildBridgePrompt(messages);
          out.url = BRIDGE_URLS[cfg.provider] || "";
          out.label = cfg.info.label;
        }
        return out;
      }
      let reply: string;
      try {
        reply = await sendChat(cfg, messages);
      } catch (e: any) {
        throw new ApiError(`No se pudo corregir: ${e?.message || e}`);
      }
      let result: GradeResult;
      try {
        result = parseGradeReply(reply, rubric.length);
      } catch (e: any) {
        if (e instanceof GradeParseError) {
          throw new ApiError(e.message);
        }
        throw new ApiError(String(e?.message || e));
      }
      return ladderFinish(app, p, proof, lv, d, result, "http", answer, secs, seen);
    },

    ladder_reply(rel: string, request: string, text: string = "") {
      const reqId = String(request || "");
      if (!_REQ_RE.test(reqId)) {
        throw new ApiError("Solicitud inválida.");
      }
      const [p, proof] = getProof(app, rel);
      const req = readRequest(app.root, reqId);
      if (!req || req.note_id !== proof.note_id) {
        throw new ApiError("Esa solicitud ya no está pendiente.");
      }
      const lv = checkLadderLevel(app.root, proof, levelOf(req.mode));
      const reply = String(text || "") || readResponse(app.root, reqId);
      if (!reply) {
        return { graded: false, waiting: true };
      }
      const d = ladderData(proof, lv, req);
      const rubric = rubricFor(proof, lv, d.hidden);
      let result: GradeResult;
      try {
        result = parseGradeReply(reply, rubric.length);
      } catch (e: any) {
        if (e instanceof GradeParseError) {
          throw new ApiError(e.message);
        }
        throw new ApiError(String(e?.message || e));
      }
      closeRequest(app.root, reqId);
      return ladderFinish(
        app,
        p,
        proof,
        lv,
        d,
        result,
        text ? "bridge" : "handoff",
        String(req.answer || ""),
        clampInt(req.seconds, 0, 10_000_000, 0),
        Boolean(req.solution_seen),
      );
    },

    ladder_discard(rel: string, request: string) {
      const reqId = String(request || "");
      if (!_REQ_RE.test(reqId)) {
        throw new ApiError("Solicitud inválida.");
      }
      const [_p, proof] = getProof(app, rel);
      const req = readRequest(app.root, reqId);
      if (req && req.note_id === proof.note_id) {
        closeRequest(app.root, reqId);
      }
      return { ok: true };
    },

    ladder_proof(rel: string) {
      const [_p, proof] = getProof(app, rel);
      const parts: string[] = [];
      if (proof.strategy) {
        parts.push(`**Estrategia:** ${proof.strategy}`);
      }
      if (proof.key_idea) {
        parts.push(`**Idea clave:** ${proof.key_idea}`);
      }
      parts.push(proofMarkdown(proof));
      return { proof: parts.join("\n\n") };
    },

    ladder_give_up(
      rel: string,
      level: number,
      data: Record<string, unknown>,
      seconds: number = 0,
    ) {
      const [p, proof] = getProof(app, rel);
      const lv = checkLadderLevel(app.root, proof, level);
      const d = ladderData(proof, lv, data);
      const rubric = rubricFor(proof, lv, d.hidden);
      const result: GradeResult = {
        score: 0,
        verdict: "incorrect",
        rubric: rubric.map(() => false),
        errors: [],
        feedback: "Viste la demostración sin entregar una respuesta.",
        next_step: "Estudia la demostración y vuelve a este nivel mañana, sin mirarla.",
        example: "",
        raw: "",
      };
      const out: Record<string, any> = ladderFinish(
        app,
        p,
        proof,
        lv,
        d,
        result,
        "local",
        "",
        clampInt(seconds, 0, 10_000_000, 0),
        true,
      );
      out.proof = this.ladder_proof(rel).proof;
      return out;
    },
  };
}
