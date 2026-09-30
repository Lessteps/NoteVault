// The only wall between the renderer and Node is `contextIsolation: true` + `nodeIntegration: false`
// on every window the app creates (the web module loads arbitrary pages). Nothing else would fail if
// a refactor dropped one of them, so this reads the four places that create a window and checks the
// flags, and refuses a window that appears without flags being checked here.

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf-8");

/** Every file that opens a window or an embedded view. */
const WINDOW_FILES = ["electron/windowFactory.ts", "electron/main.ts", "electron/browserManager.ts", "src/api/modules/web.ts"];

describe("window isolation flags", () => {
  for (const file of WINDOW_FILES) {
    it(`${file} isolates the renderer from Node`, () => {
      const src = read(file);
      expect(src).toMatch(/contextIsolation:\s*true/);
      expect(src).toMatch(/nodeIntegration:\s*false/);
      expect(src).not.toMatch(/contextIsolation:\s*false/);
      expect(src).not.toMatch(/nodeIntegration:\s*true/);
      expect(src).not.toMatch(/webSecurity:\s*false/);
    });
  }

  it("the embedded browser is also sandboxed", () => {
    expect(read("electron/browserManager.ts")).toMatch(/sandbox:\s*true/);
  });

  it("no other file in electron/ or the API creates a window without being listed above", () => {
    const creators: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) walk(rel);
        else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name) && /new (BrowserWindow|WebContentsView|BrowserView)\(/.test(read(rel))) creators.push(rel);
      }
    };
    walk("electron");
    walk("src/api");
    for (const f of creators) expect(WINDOW_FILES, `${f} creates a window: add it to WINDOW_FILES so its flags are checked`).toContain(f);
  });
});
