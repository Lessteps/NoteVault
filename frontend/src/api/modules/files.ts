// Ported from notevault_app/webapp/modules/files.py
// Attachments of module entities (issue screenshots, invoices) and the
// Áreas de vida shared by Metas, Proyectos and Hábitos.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { ApiError } from "../../core/errors.js";
import {
  removeModuleAttachment,
  resolveModuleAttachment,
  storeFile,
} from "../../core/moduleAttachments.js";
import { ATTACHMENT_EXTS } from "../../core/vaultFormat.js";
import type { AppState } from "../appState.js";
import { oneLine } from "../common.js";

export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
export const ATTACH_MODULES = ["proyectos", "finanzas"] as const;
const _OWNER_RE = /^[A-Za-z0-9_-]{1,64}$/;
const _HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function checkRef(ref: unknown): string {
  const text = String(ref ?? "").trim();
  const parts = text.split("/").filter(Boolean);
  const ext = path.extname(text).toLowerCase();
  if (
    !text ||
    text.startsWith("/") ||
    text.includes("\\") ||
    parts.includes("..") ||
    parts.length < 3 ||
    !(ATTACH_MODULES as readonly string[]).includes(parts[0] as any) ||
    parts[1] !== "adjuntos" ||
    !(ATTACHMENT_EXTS as readonly string[]).includes(ext as any)
  ) {
    throw new ApiError("Adjunto inválido.");
  }
  return text;
}

function guessMime(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const mimes: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
    ".svg": "image/svg+xml",
    ".pdf": "application/pdf",
  };
  return mimes[ext] || "application/octet-stream";
}

function openWithSystem(filePath: string): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const electron = require("electron") as { shell?: { openPath(p: string): Promise<string> } };
    if (electron?.shell) {
      void electron.shell.openPath(filePath);
      return;
    }
  } catch {
    // outside electron runtime (tests)
  }
}

export function filesApi(app: AppState) {
  const mgrs = () => app.mgrs();

  return {
    // ── attachments ───────────────────────────────────────────────────────

    attach_add(
      moduleName: string,
      owner: string,
      filename: string,
      dataB64: string,
    ): Record<string, unknown> {
      if (!(ATTACH_MODULES as readonly string[]).includes(moduleName as any)) {
        throw new ApiError("Módulo inválido.");
      }
      if (!_OWNER_RE.test(String(owner ?? ""))) {
        throw new ApiError("Dueño inválido.");
      }
      const ext = path.extname(String(filename ?? "")).toLowerCase();
      if (!(ATTACHMENT_EXTS as readonly string[]).includes(ext as any)) {
        throw new ApiError("Solo imágenes o PDF.");
      }
      const cleanB64 = String(dataB64 ?? "").trim();
      if (!cleanB64 || !/^[A-Za-z0-9+/=]+$/.test(cleanB64) || cleanB64.length % 4 !== 0) {
        throw new ApiError("Archivo inválido.");
      }
      const raw = Buffer.from(cleanB64, "base64");
      if (!raw.length || raw.length > MAX_ATTACHMENT_BYTES) {
        throw new ApiError("El archivo está vacío o pasa de 15 MB.");
      }
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_upload_"));
      try {
        const src = path.join(tmpDir, `upload${ext}`);
        fs.writeFileSync(src, raw);
        const ref = storeFile(app.root, moduleName, owner, src);
        return { ref };
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    },

    attach_read(ref: string): Record<string, unknown> {
      const verifiedRef = checkRef(ref);
      const filePath = resolveModuleAttachment(app.root, verifiedRef);
      if (!filePath) {
        throw new ApiError("El archivo todavía no está disponible.");
      }
      const resolvedPath = path.resolve(filePath);
      const resolvedRoot = path.resolve(app.root);
      const rel = path.relative(resolvedRoot, resolvedPath);
      if (rel.startsWith("..") || path.isAbsolute(rel) || rel === "") {
        throw new ApiError("El adjunto está fuera del vault.");
      }
      const stat = fs.statSync(resolvedPath);
      if (stat.size > MAX_ATTACHMENT_BYTES) {
        throw new ApiError("El archivo es demasiado grande.");
      }
      const mime = guessMime(resolvedPath);
      const base64Data = fs.readFileSync(resolvedPath).toString("base64");
      return {
        name: path.basename(resolvedPath),
        mime,
        data_url: `data:${mime};base64,${base64Data}`,
      };
    },

    attach_open(ref: string): Record<string, unknown> {
      const verifiedRef = checkRef(ref);
      const filePath = resolveModuleAttachment(app.root, verifiedRef);
      if (!filePath) {
        throw new ApiError("El archivo todavía no está disponible.");
      }
      const resolvedPath = path.resolve(filePath);
      const resolvedRoot = path.resolve(app.root);
      const rel = path.relative(resolvedRoot, resolvedPath);
      if (rel.startsWith("..") || path.isAbsolute(rel) || rel === "") {
        throw new ApiError("El adjunto está fuera del vault.");
      }
      openWithSystem(resolvedPath);
      return { ok: true };
    },

    attach_remove(ref: string): Record<string, unknown> {
      const verifiedRef = checkRef(ref);
      const bucket = verifiedRef.split("/")[0]!;
      removeModuleAttachment(app.root, verifiedRef, bucket);
      return { ok: true };
    },

    // ── áreas ─────────────────────────────────────────────────────────────

    areas_list(includeArchived = false): unknown[] {
      return mgrs().areas.areas(Boolean(includeArchived));
    },

    areas_save(areaId: string, fields: unknown): Record<string, unknown> {
      if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
        throw new ApiError("Datos inválidos.");
      }
      const f = fields as Record<string, unknown>;
      const name = oneLine(f.name, 60);
      const icon = oneLine(f.icon, 8);
      const colour = String(f.colour || "#7986cb");
      if (!_HEX_RE.test(colour)) {
        throw new ApiError("Color inválido.");
      }
      const am = mgrs().areas;
      if (!areaId) {
        if (!name) {
          throw new ApiError("El área necesita un nombre.");
        }
        return am.create(name, icon, colour) as unknown as Record<string, unknown>;
      }
      if (am.get(String(areaId)) === null) {
        throw new ApiError("Esa área ya no existe.");
      }
      const patch: Record<string, unknown> = { icon, colour };
      if (name) {
        patch.name = name;
      }
      return am.update(String(areaId), patch) as unknown as Record<string, unknown>;
    },

    areas_archive(areaId: string, archived = true): Record<string, unknown> {
      const am = mgrs().areas;
      if (am.get(String(areaId)) === null) {
        throw new ApiError("Esa área ya no existe.");
      }
      am.archive(String(areaId), Boolean(archived));
      return { ok: true };
    },

    areas_create_suggested(): unknown[] {
      const am = mgrs().areas;
      am.create_suggested();
      return am.areas();
    },
  };
}
