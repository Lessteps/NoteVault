// Ported from notevault_app/webapp/media.py
// Local streaming server for video and audio files in NoteVault.

import * as fs from "node:fs";
import { ApiError } from "../../core/errors.js";
import type { AppState } from "../appState.js";
import { MediaServer } from "../media.js";

export { MediaServer } from "../media.js";

export function mediaApi(app: AppState) {
  let server: MediaServer | null = null;
  const getServer = (): MediaServer => (server ??= new MediaServer());

  return {
    async media_url(rel: string) {
      const p = app.resolve(rel, { mustExist: true });
      let stat: fs.Stats;
      try {
        stat = fs.statSync(p);
      } catch {
        throw new ApiError("No se encuentra el archivo.");
      }
      if (!stat.isFile()) {
        throw new ApiError("No es un archivo.");
      }
      const url = await getServer().urlFor(p);
      return { url };
    },

    media_shutdown() {
      if (server !== null) {
        server.shutdown();
        server = null;
      }
      return { ok: true };
    },
  };
}
