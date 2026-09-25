/**
 * NoteVault Code Runner Sandbox
 * Executes code snippets locally in isolated subprocesses with timeouts and output capture.
 */

import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export interface CodeRunResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exit_code: number;
  execution_time_ms: number;
  timed_out: boolean;
}

export function runCode(
  code: string,
  language: string = "python",
  timeoutSeconds: number = 5
): CodeRunResult {
  const lang = language.toLowerCase().trim();
  if (!["python", "py", "javascript", "js", "node"].includes(lang)) {
    return {
      success: false,
      stdout: "",
      stderr: `Lenguaje no soportado para ejecuci\u00f3n directa: ${language}`,
      exit_code: -1,
      execution_time_ms: 0.0,
      timed_out: false,
    };
  }

  const isPython = lang === "python" || lang === "py";
  const suffix = isPython ? ".py" : ".js";
  const binary = isPython ? "python" : "node";

  const tmpDir = os.tmpdir();
  const tmpFile = path.join(
    tmpDir,
    `nv_code_${Date.now()}_${Math.random().toString(36).slice(2)}${suffix}`
  );

  fs.writeFileSync(tmpFile, code, "utf-8");
  const startTime = process.hrtime.bigint();

  try {
    const res = spawnSync(binary, [tmpFile], {
      timeout: timeoutSeconds * 1000,
      encoding: "utf-8",
      env: {
        ...process.env,
        PYTHONIOENCODING: "utf-8",
      },
    });

    const elapsedMs = Number(process.hrtime.bigint() - startTime) / 1e6;

    if (res.error && (res.error as any).code === "ETIMEDOUT") {
      return {
        success: false,
        stdout: "",
        stderr: `Tiempo de ejecuci\u00f3n excedido (${timeoutSeconds}s limit)`,
        exit_code: -1,
        execution_time_ms: Math.round(elapsedMs * 100) / 100,
        timed_out: true,
      };
    }

    if (res.error) {
      return {
        success: false,
        stdout: "",
        stderr: String(res.error.message || res.error),
        exit_code: -1,
        execution_time_ms: Math.round(elapsedMs * 100) / 100,
        timed_out: false,
      };
    }

    return {
      success: res.status === 0,
      stdout: res.stdout || "",
      stderr: res.stderr || "",
      exit_code: res.status ?? -1,
      execution_time_ms: Math.round(elapsedMs * 100) / 100,
      timed_out: false,
    };
  } catch (err: any) {
    const elapsedMs = Number(process.hrtime.bigint() - startTime) / 1e6;
    return {
      success: false,
      stdout: "",
      stderr: String(err?.message || err),
      exit_code: -1,
      execution_time_ms: Math.round(elapsedMs * 100) / 100,
      timed_out: false,
    };
  } finally {
    try {
      if (fs.existsSync(tmpFile)) {
        fs.unlinkSync(tmpFile);
      }
    } catch {
      // ignore cleanup errors
    }
  }
}

export const run_code = runCode;
