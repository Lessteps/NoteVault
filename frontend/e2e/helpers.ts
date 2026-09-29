import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** HOME aislado para E2E: solo NV_E2E_HOME (lo lee appConfig).
 *  No tocar HOME/USERPROFILE/APPDATA: rompen el loader de Playwright/Chromium. */
export function sandboxEnv() {
  const home = mkdtempSync(join(tmpdir(), "nv-e2e-home-"));
  return { ...process.env, NV_E2E_HOME: home } as Record<string, string>;
}
