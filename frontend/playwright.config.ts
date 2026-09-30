import { defineConfig } from "@playwright/test";

// E2E contra el build compilado de Electron (dist-electron/main.js).
// Requiere `npm run build` antes de `npm run test:e2e`.
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
});
