import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ApiError } from "../../core/errors.js";
import { AppState } from "../appState.js";
import { filesApi } from "./files.js";

const PNG_1PX_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

let dir: string;
let api: ReturnType<typeof filesApi>;
let app: AppState;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_files_"));
  app = new AppState(dir);
  api = filesApi(app);
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("files api", () => {
  describe("attachments", () => {
    it("attach_add, attach_read and attach_remove", () => {
      const res = api.attach_add("proyectos", "issue123", "screenshot.png", PNG_1PX_B64) as {
        ref: string;
      };
      expect(typeof res.ref).toBe("string");
      expect(res.ref.startsWith("proyectos/adjuntos/")).toBe(true);

      const read = api.attach_read(res.ref) as { name: string; mime: string; data_url: string };
      expect(read.mime).toBe("image/png");
      expect(read.data_url.startsWith("data:image/png;base64,")).toBe(true);

      const openRes = api.attach_open(res.ref) as { ok: boolean };
      expect(openRes.ok).toBe(true);

      const rem = api.attach_remove(res.ref) as { ok: boolean };
      expect(rem.ok).toBe(true);
      expect(() => api.attach_read(res.ref)).toThrow(ApiError);
    });

    it("rejects invalid inputs", () => {
      expect(() => api.attach_add("bad_module", "owner", "a.png", PNG_1PX_B64)).toThrow(ApiError);
      expect(() => api.attach_add("proyectos", "invalid owner with spaces", "a.png", PNG_1PX_B64)).toThrow(
        ApiError,
      );
      expect(() => api.attach_add("proyectos", "owner", "a.exe", PNG_1PX_B64)).toThrow(ApiError);
      expect(() => api.attach_add("proyectos", "owner", "a.png", "not-base-64!!")).toThrow(
        ApiError,
      );
    });
  });

  describe("areas", () => {
    it("areas_save create, update, archive and list", () => {
      expect(api.areas_list()).toEqual([]);

      const created = api.areas_save("", {
        name: "Salud",
        icon: "❤️",
        colour: "#f2555a",
      }) as Record<string, any>;
      expect(created.name).toBe("Salud");
      expect(created.icon).toBe("❤️");

      const list = api.areas_list() as Record<string, any>[];
      expect(list.length).toBe(1);
      expect(list[0]!.id).toBe(created.id);

      const updated = api.areas_save(created.id, {
        colour: "#38bdf8",
      }) as Record<string, any>;
      expect(updated.colour).toBe("#38bdf8");
      expect(updated.name).toBe("Salud");

      api.areas_archive(created.id, true);
      expect(api.areas_list(false).length).toBe(0);
      expect(api.areas_list(true).length).toBe(1);
    });

    it("areas_create_suggested creates default areas", () => {
      const suggested = api.areas_create_suggested() as Record<string, any>[];
      expect(suggested.length).toBeGreaterThan(0);
    });
  });
});
