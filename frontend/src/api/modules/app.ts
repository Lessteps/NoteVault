// Ported from the app-level methods of notevault_app/webapp/api.py
// (app_info, stats, set_theme, open_external, set_unsaved, close_window).

import { ApiError } from "../../core/errors.js";
import { AppConfig } from "../appConfig.js";
import { API_VERSION, type AppState } from "../appState.js";

/** Open a link in the OS browser via Electron shell (lazy so this module can
 * be unit-tested outside an Electron runtime). Returns false if unavailable. */
function openInShell(url: string): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const electron = require("electron") as { shell?: { openExternal(u: string): Promise<void> } };
    if (!electron?.shell) return false;
    void electron.shell.openExternal(url);
    return true;
  } catch {
    return false;
  }
}

export function appApi(app: AppState) {
  return {
    app_info(): Record<string, unknown> {
      return {
        api_version: API_VERSION,
        vault_name: app.vault.vaultRoot.split(/[\\/]/).filter(Boolean).pop() ?? "",
        vault_path: app.root,
        theme: AppConfig.get_theme(),
      };
    },

    stats(): Record<string, unknown> {
      return { notes: app.vault.stats().notes ?? 0 };
    },

    set_theme(theme: string): Record<string, unknown> {
      AppConfig.set_theme(theme === "light" ? "light" : "dark");
      return { theme: AppConfig.get_theme() };
    },

    open_external(url: string): Record<string, unknown> {
      const u = (url || "").trim();
      let scheme = "";
      let hasHost = false;
      try {
        const parsed = new URL(u);
        scheme = parsed.protocol.replace(/:$/, "").toLowerCase();
        hasHost = !!parsed.host;
      } catch {
        const m = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(u);
        scheme = m ? m[1]!.toLowerCase() : "";
      }
      if (
        !["http", "https", "mailto"].includes(scheme) ||
        (scheme !== "mailto" && !hasHost)
      ) {
        throw new ApiError("Solo se abren enlaces http(s) o mailto.");
      }
      openInShell(u);
      return { ok: true };
    },

    set_unsaved(count: number): Record<string, unknown> {
      app.unsaved = Math.max(0, Math.trunc(Number(count) || 0));
      return { ok: true };
    },

    close_window(): Record<string, unknown> {
      app.closeOk = true;
      return { ok: true };
    },
  };
}
