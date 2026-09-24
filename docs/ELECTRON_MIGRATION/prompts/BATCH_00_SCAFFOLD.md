# BATCH 0 — Electron scaffold + build + bridge transport

> Paste this whole file into Antigravity as one task. **First read**
> `docs/ELECTRON_MIGRATION/00_MASTER_HANDOFF.md` and `01_CONVENTIONS.md`.
> Do the steps in order. Acceptance is at the bottom — do not stop until it passes.
> All commands run from `frontend/`.

Goal: turn `frontend/` into an Electron app whose main process (Node) will host
the ported core, whose renderer is the existing React app, and whose bridge
speaks to the core over IPC. The existing pywebview/http transports stay so the
app keeps running during the migration. **You write no domain logic in this
batch** — only the shell, the build and the config.

The reference core module already exists and is green:
`src/core/frontmatter.ts` (+ `.test.ts`), `src/core/errors.ts`, `src/core/text.ts`,
`src/core/num.ts`, `src/core/dates.ts`. Copy their style in later batches.

---

## Step 1 — install dependencies

```
npm install --save-dev electron electron-builder vite-plugin-electron @types/node js-yaml @types/js-yaml
```

(js-yaml is for later batches; install it now so config is done once.)

## Step 2 — create the Electron main process

Create **`frontend/electron/main.ts`**:

```ts
import { app, BrowserWindow, shell } from "electron";
import path from "node:path";
import { registerIpc } from "./ipc";

const DEV_URL = process.env.VITE_DEV_SERVER_URL;
let win: BrowserWindow | null = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: "#191919",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  // The window must never navigate away; external links open in the OS browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    const base = DEV_URL ?? "file://";
    if (!url.startsWith(base)) {
      e.preventDefault();
      if (/^https?:/i.test(url)) void shell.openExternal(url);
    }
  });
  if (DEV_URL) void win.loadURL(DEV_URL);
  else void win.loadFile(path.join(__dirname, "../dist/index.html"));
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
```

Create **`frontend/electron/preload.ts`**:

```ts
import { contextBridge, ipcRenderer } from "electron";

// The ONLY thing exposed to the renderer. Mirrors window.pywebview.api's shape.
contextBridge.exposeInMainWorld("nv", {
  invoke: (method: string, args: unknown[]) => ipcRenderer.invoke("nv", method, args),
});
```

Create **`frontend/electron/ipc.ts`**:

```ts
import { ipcMain } from "electron";
import { registry } from "../src/api/registry";

export function registerIpc(): void {
  ipcMain.handle("nv", async (_e, method: string, args: unknown[]) => {
    const fn = (registry as Record<string, (...a: unknown[]) => unknown>)[method];
    if (!fn) throw new Error(`Método desconocido: ${method}`);
    return await fn(...(args ?? []));
  });
}
```

## Step 3 — registry stub (filled in Batch 9)

Create **`frontend/src/api/registry.ts`**:

```ts
// Every public API function is collected here for the IPC handler.
// Batch 9 fills this in. Empty for now so the app opens.
export const registry: Record<string, (...args: unknown[]) => unknown> = {};
```

## Step 4 — split tsconfig (renderer = DOM, main/core = Node)

`src/core/**` and `src/api/**` run in Node and use `node:*`; the renderer must
not typecheck them with DOM-only libs. Replace **`frontend/tsconfig.json`** with a
solution file and add two project files.

**`frontend/tsconfig.json`**:
```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
```

**`frontend/tsconfig.app.json`** (renderer):
```json
{
  "compilerOptions": {
    "composite": true,
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "types": ["vite/client"]
  },
  "include": ["src"],
  "exclude": ["src/core", "src/api", "**/*.test.ts"]
}
```

**`frontend/tsconfig.node.json`** (main process + core + api + tests + vite config):
```json
{
  "compilerOptions": {
    "composite": true,
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "types": ["node"]
  },
  "include": ["electron", "src/core", "src/api", "vite.config.ts"]
}
```

Note: `src/core/frontmatter.ts` etc. move from the app project to the node
project — they still compile (pure TS). If any renderer file imports a type from
`src/core/types.ts` (types only), that is allowed; runtime imports of `src/core`
from the renderer are **not**.

## Step 5 — wire Vite to build main+preload

Edit **`frontend/vite.config.ts`**: add `vite-plugin-electron`.

```ts
import electron from "vite-plugin-electron/simple";
// inside plugins: [...existing, react(), ...]
electron({
  main: { entry: "electron/main.ts" },
  preload: { input: "electron/preload.ts" },
})
```
Keep the existing `test` (vitest) block. `vite-plugin-electron` outputs to
`dist-electron/`.

## Step 6 — package.json scripts + main

In **`frontend/package.json`** set:
```json
"main": "dist-electron/main.js",
"scripts": {
  "dev": "vite",
  "build": "npm run typecheck && vite build",
  "typecheck": "tsc -b",
  "test": "vitest run",
  "preview": "vite preview",
  "electron:dev": "vite",
  "electron:build": "npm run typecheck && vite build && electron-builder"
}
```
Add the `electron-builder` config (same file):
```json
"build": {
  "appId": "com.notevault.app",
  "productName": "NoteVault",
  "files": ["dist/**", "dist-electron/**"],
  "win": { "target": "nsis" },
  "directories": { "output": "release" }
}
```

## Step 7 — add the `electron` transport to the bridge

Edit **`frontend/src/lib/bridge.ts`**:

1. Extend the global and the `Transport` type:
```ts
declare global {
  interface Window {
    pywebview?: { api: PyApi };
    nv?: { invoke: (method: string, args: unknown[]) => Promise<unknown> };
  }
}
type Transport = { kind: "pywebview" } | { kind: "http"; token: string } | { kind: "electron" };
```
2. In `getTransport()`, **before** the pywebview/http checks, add:
```ts
if (window.nv) { done({ kind: "electron" }); return; }
```
3. In `call<T>()`, **before** the `pywebview` branch, add:
```ts
if (t.kind === "electron") {
  try {
    return (await window.nv!.invoke(method, args)) as T;
  } catch (e) {
    throw asError(e);
  }
}
```
Leave the pywebview and http branches untouched.

## Acceptance (must all pass)

```
npm install            # step 1 done, no errors
npm run typecheck      # tsc -b clean (app + node projects)
npx vitest run         # all existing tests green (incl. frontmatter.test.ts)
npm run electron:dev   # an Electron window opens showing the React UI
```
- The window opens. The UI renders (it will show "no hay conexión" style errors
  for data calls because the registry is empty — that is expected until Batch 9;
  the shell itself must work).
- `npm run build && npx electron .` also opens the built app.

Commit: `chore(electron): scaffold Electron shell, build and IPC bridge transport`
Push the branch. Then proceed to `BATCH_01_08_CORE.md`.

## Guardrails
- Do NOT port any domain logic here.
- Do NOT touch `src/components`, `src/store`, or `src/lib` except the bridge edit.
- If `vite-plugin-electron` gives trouble, the fallback is a tiny esbuild step
  (`esbuild electron/main.ts electron/preload.ts --bundle --platform=node
  --external:electron --outdir=dist-electron`) wired into the scripts; keep the
  same output paths.
