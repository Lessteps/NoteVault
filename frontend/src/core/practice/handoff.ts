/**
 * File handoff transport: request/response files that an editor agent processes.
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { formatIsoDatetime } from "../dates.js";
import * as store from "../store.js";
import { formatLayout, isSyncConflict, LAYOUT } from "../vaultFormat.js";
import { JSON_CONTRACT } from "./grading.js";

export function buildBridgePrompt(messages: Array<Record<string, any>>): string {
  const parts: string[] = [];
  for (const m of messages) {
    if (m.role === "system") {
      parts.push(String(m.content ?? ""));
    } else if (m.role === "user") {
      parts.push(`[Usuario]\n${m.content ?? ""}`);
    } else {
      parts.push(`[Asistente]\n${m.content ?? ""}`);
    }
  }
  return parts.join("\n\n---\n\n");
}

export function newRequestId(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const hex = crypto.randomBytes(3).toString("hex");
  return `req_${stamp}_${hex}`;
}

export const new_request_id = newRequestId;

export function requestPath(vaultRoot: string, reqId: string): string {
  return path.join(
    path.resolve(vaultRoot),
    formatLayout(LAYOUT.study_handoff_request, { id: reqId })
  );
}

export const _request_path = requestPath;

export function responsePath(vaultRoot: string, reqId: string): string {
  return path.join(
    path.resolve(vaultRoot),
    formatLayout(LAYOUT.study_handoff_response, { id: reqId })
  );
}

export const response_path = responsePath;

function _instructions(kind: string, responseRel: string): string {
  const what =
    kind === "grade"
      ? `Write ONLY the grade JSON object below (no prose, no code fence) to this file, encoded as UTF-8:\n\n${JSON_CONTRACT}`
      : "Write your complete reply, exactly as the messages above ask, to this file.";
  return (
    `# Instructions for the agent\n\n` +
    `Process the request above. Response file (relative to the vault root): ` +
    `\`${responseRel}\`\n\n${what}\n\n` +
    `Do not modify any other file of the vault.`
  );
}

export function writeRequest(
  vaultRoot: string,
  kind: string,
  messages: Array<Record<string, any>>,
  meta: Record<string, any>
): string {
  const reqId = newRequestId();
  const responseRel = formatLayout(LAYOUT.study_handoff_response, { id: reqId });
  const data: Record<string, any> = {
    id: reqId,
    kind,
    created: formatIsoDatetime(new Date()),
    note_id: String(meta.note_id || ""),
    note_path: String(meta.note_path || ""),
    messages,
    response_file: `responses/${reqId}.json`,
  };
  for (const [key, value] of Object.entries(meta)) {
    if (!(key in data)) {
      data[key] = value;
    }
  }

  const p = requestPath(vaultRoot, reqId);
  store.writeJson(p, data);

  const prompt =
    buildBridgePrompt(messages) + "\n\n---\n\n" + _instructions(kind, responseRel);
  const mdPath = p.replace(/\.json$/, ".md");
  store.writeText(mdPath, prompt + "\n");

  const respDir = path.dirname(responsePath(vaultRoot, reqId));
  fs.mkdirSync(respDir, { recursive: true });

  return reqId;
}

export const write_request = writeRequest;

export function readResponse(vaultRoot: string, reqId: string): string | null {
  const p = responsePath(vaultRoot, reqId);
  const candidates = [p, p.replace(/\.json$/, ".md")];
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        const text = fs.readFileSync(candidate, "utf-8");
        if (text.trim()) {
          return text;
        }
      }
    } catch {
      continue;
    }
  }
  return null;
}

export const read_response = readResponse;

export function closeRequest(vaultRoot: string, reqId: string): void {
  const p = requestPath(vaultRoot, reqId);
  const doneDir = path.join(path.dirname(p), "done");
  const candidates = [p, p.replace(/\.json$/, ".md")];
  for (const src of candidates) {
    if (fs.existsSync(src)) {
      fs.mkdirSync(doneDir, { recursive: true });
      fs.renameSync(src, path.join(doneDir, path.basename(src)));
    }
  }
}

export const close_request = closeRequest;

export function pendingRequests(vaultRoot: string): string[] {
  const folder = path.dirname(requestPath(vaultRoot, "x"));
  if (!fs.existsSync(folder)) return [];
  try {
    const files = fs
      .readdirSync(folder)
      .filter((f) => f.startsWith("req_") && f.endsWith(".json") && !isSyncConflict(f))
      .sort();
    return files.map((f) => path.basename(f, ".json"));
  } catch {
    return [];
  }
}

export const pending_requests = pendingRequests;

export function readRequest(vaultRoot: string, reqId: string): Record<string, any> | null {
  const data = store.loadJson<Record<string, any>>(requestPath(vaultRoot, reqId), null as any);
  return data && typeof data === "object" ? data : null;
}

export const read_request = readRequest;

export function pendingForNote(
  vaultRoot: string,
  noteId: string,
  kind: string = "grade"
): Array<Record<string, any>> {
  if (!noteId) return [];
  const out: Array<Record<string, any>> = [];
  for (const reqId of pendingRequests(vaultRoot)) {
    const data = readRequest(vaultRoot, reqId);
    if (data && data.note_id === noteId && data.kind === kind) {
      if (!data.id) data.id = reqId;
      out.push(data);
    }
  }
  return out;
}

export const pending_for_note = pendingForNote;
