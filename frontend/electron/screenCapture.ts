// Screen capture, in the spirit of Win+Shift+S.
//
// The screen is photographed first; then a full-screen overlay shows that photo
// dimmed and lets you pick what to keep: a rectangle, a free-hand stroke, one
// window or the whole screen. The result is saved as a PNG in the `attachments`
// folder of wherever the user is working (the renderer says which folder) and
// is also put on the clipboard, like the Windows tool does.

import { app, BrowserWindow, clipboard, ClipboardItem, desktopCapturer, screen, type WebContents } from "electron";
import fs from "node:fs";
import path from "node:path";
import { getAppState } from "../src/api/registry";
import { ATTACHMENTS_DIR, fsPath, uniqueName } from "../src/core/attachments";
import { formatDate } from "../src/core/dates";
import { getPreloadPath } from "./windowFactory";

interface WindowChoice {
  id: string;
  name: string;
  thumb: string;
}

interface Session {
  overlay: BrowserWindow;
  dir: string;
  screenPng: Buffer;
  folderRel: string;
  requester: WebContents;
}

export type CaptureCommit =
  | { kind: "image"; dataUrl: string }
  | { kind: "full" }
  | { kind: "window"; id: string };

let session: Session | null = null;

/** Where the shot goes: `<folder>/attachments`, or the vault's root when the folder is unusable. */
function targetDir(folderRel: string): string {
  const state = getAppState();
  if (!state) throw new Error("No hay un vault abierto.");
  let base: string;
  try {
    base = state.resolve(folderRel, { mustExist: false, allowRoot: true });
  } catch {
    base = state.root;
  }
  return path.join(base, ATTACHMENTS_DIR);
}

function saveShot(png: Buffer, folderRel: string): { abs: string; rel: string; name: string } {
  const state = getAppState();
  if (!state) throw new Error("No hay un vault abierto.");
  const dir = targetDir(folderRel);
  fs.mkdirSync(fsPath(dir), { recursive: true });
  const stamp = formatDate(new Date(), "%Y%m%d-%H%M%S");
  const abs = uniqueName(dir, `Captura ${stamp}.png`);
  fs.writeFileSync(fsPath(abs), png);
  const rel = path.relative(state.root, abs).split(path.sep).join("/");
  return { abs, rel, name: path.basename(abs) };
}

function closeSession(): void {
  const s = session;
  session = null;
  if (!s) return;
  if (!s.overlay.isDestroyed()) s.overlay.destroy();
  try {
    fs.rmSync(s.dir, { recursive: true, force: true });
  } catch {
    // The temp folder is the OS's to clean up if it is busy.
  }
}

function finish(s: Session, png: Buffer): { rel: string; name: string } {
  const saved = saveShot(png, s.folderRel);
  // The clipboard is a courtesy: a failure there must not lose the saved file.
  void clipboard
    .write([new ClipboardItem({ "image/png": new Blob([new Uint8Array(png)], { type: "image/png" }) })])
    .catch(() => undefined);
  if (!s.requester.isDestroyed()) s.requester.send("nv-capture-done", { rel: saved.rel, name: saved.name });
  return { rel: saved.rel, name: saved.name };
}

async function listWindows(): Promise<WindowChoice[]> {
  const sources = await desktopCapturer.getSources({
    types: ["window"],
    thumbnailSize: { width: 480, height: 300 },
  });
  return sources
    .filter((src) => src.name.trim() && !src.thumbnail.isEmpty())
    .map((src) => ({ id: src.id, name: src.name, thumb: src.thumbnail.toDataURL() }));
}

/** Opens the overlay. `folderRel` is the vault-relative folder the user is in ("" = the root). */
export async function startCapture(requester: WebContents, folderRel: string): Promise<{ ok: boolean }> {
  if (session) return { ok: true };
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const px = {
    width: Math.round(display.size.width * display.scaleFactor),
    height: Math.round(display.size.height * display.scaleFactor),
  };
  const screens = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: px });
  const mine = screens.find((src) => src.display_id === String(display.id)) ?? screens[0];
  if (!mine || mine.thumbnail.isEmpty()) throw new Error("No se pudo capturar la pantalla.");
  const screenPng = mine.thumbnail.toPNG();
  const windows = await listWindows();

  const dir = fs.mkdtempSync(path.join(app.getPath("temp"), "nv-capture-"));
  fs.writeFileSync(path.join(dir, "shot.png"), screenPng);
  const data = JSON.stringify({ windows }).replace(/</g, "\\u003c");
  fs.writeFileSync(path.join(dir, "overlay.html"), OVERLAY_HTML.replace("__DATA__", () => data));

  const overlay = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    backgroundColor: "#000000",
    webPreferences: { preload: getPreloadPath(), contextIsolation: true, nodeIntegration: false },
  });
  overlay.setAlwaysOnTop(true, "screen-saver");
  session = { overlay, dir, screenPng, folderRel, requester };
  overlay.on("closed", () => {
    if (session?.overlay === overlay) session = null;
  });
  overlay.once("ready-to-show", () => {
    overlay.show();
    overlay.focus();
  });
  await overlay.loadFile(path.join(dir, "overlay.html"));
  return { ok: true };
}

export function cancelCapture(): { ok: boolean } {
  closeSession();
  return { ok: true };
}

/** The overlay picked something: save it and close. */
export async function commitCapture(choice: CaptureCommit): Promise<{ rel: string; name: string }> {
  const s = session;
  if (!s) throw new Error("No hay una captura en curso.");
  let png: Buffer;
  if (choice.kind === "image") {
    const m = /^data:image\/png;base64,(.+)$/.exec(choice.dataUrl);
    if (!m) throw new Error("Imagen inválida.");
    png = Buffer.from(m[1]!, "base64");
    closeSession();
  } else if (choice.kind === "full") {
    png = s.screenPng;
    closeSession();
  } else {
    // The overlay would be in its own photo of the window, so it goes first.
    closeSession();
    await new Promise((r) => setTimeout(r, 150));
    const found = await desktopCapturer.getSources({
      types: ["window"],
      thumbnailSize: { width: 3840, height: 2160 },
    });
    const src = found.find((x) => x.id === choice.id);
    if (!src || src.thumbnail.isEmpty()) throw new Error("Esa ventana ya no está disponible.");
    png = src.thumbnail.toPNG();
  }
  return finish(s, png);
}

const OVERLAY_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>Captura</title>
<style>
  html,body{margin:0;height:100%;overflow:hidden;background:#000;font-family:Segoe UI,system-ui,sans-serif;user-select:none}
  canvas{position:fixed;inset:0;width:100vw;height:100vh;cursor:crosshair}
  #bar{position:fixed;top:14px;left:50%;transform:translateX(-50%);display:flex;gap:4px;padding:5px;
    background:#202020;border:1px solid #3a3a3a;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.5);z-index:3}
  #bar button{all:unset;cursor:pointer;color:#ddd;font-size:13px;padding:7px 12px;border-radius:7px}
  #bar button:hover{background:#333}
  #bar button.on{background:#4a6cf7;color:#fff}
  #bar .sep{width:1px;background:#3a3a3a;margin:3px 2px}
  #hint{position:fixed;bottom:16px;left:50%;transform:translateX(-50%);color:#ccc;font-size:12px;
    background:rgba(0,0,0,.6);padding:5px 12px;border-radius:8px;z-index:3;pointer-events:none}
  #wins{position:fixed;inset:70px 40px 50px;display:none;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));
    gap:14px;overflow:auto;align-content:start;z-index:2}
  .win{background:#202020;border:1px solid #3a3a3a;border-radius:10px;padding:8px;cursor:pointer;color:#ddd;font-size:12px}
  .win:hover{border-color:#4a6cf7;background:#292929}
  .win img{width:100%;height:150px;object-fit:contain;background:#111;border-radius:6px;display:block;margin-bottom:6px}
  .win span{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
</style></head><body>
<canvas id="c"></canvas>
<div id="bar">
  <button data-mode="rect" class="on">Rectángulo</button>
  <button data-mode="free">Trazo</button>
  <button data-mode="window">Ventana</button>
  <button data-mode="full">Pantalla completa</button>
  <span class="sep"></span>
  <button id="close" title="Cancelar (Esc)">✕</button>
</div>
<div id="wins"></div>
<div id="hint">Arrastra para seleccionar · Esc para cancelar</div>
<script>
const DATA = __DATA__;
const cv = document.getElementById("c"), ctx = cv.getContext("2d");
const img = new Image();
let mode = "rect", drag = null, pts = [], busy = false;
const dpr = window.devicePixelRatio || 1;

function size() { cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; draw(); }
function rectOf(a, b) {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}
function draw() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  ctx.drawImage(img, 0, 0, innerWidth, innerHeight);
  ctx.fillStyle = "rgba(0,0,0,.5)";
  ctx.fillRect(0, 0, innerWidth, innerHeight);
  if (mode === "rect" && drag) {
    const r = rectOf(drag.a, drag.b);
    ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
    ctx.drawImage(img, 0, 0, innerWidth, innerHeight); ctx.restore();
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.strokeRect(r.x, r.y, r.w, r.h);
  } else if (mode === "free" && pts.length > 1) {
    ctx.save(); ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    ctx.closePath(); ctx.clip(); ctx.drawImage(img, 0, 0, innerWidth, innerHeight); ctx.restore();
    ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke();
  }
}
function send(payload) {
  if (busy) return; busy = true;
  window.nv.invoke("capture_commit", [payload]).catch(() => window.nv.invoke("capture_cancel", []));
}
function crop(box, clipPts) {
  const k = img.naturalWidth / innerWidth;
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(box.w * k)); out.height = Math.max(1, Math.round(box.h * k));
  const o = out.getContext("2d");
  if (clipPts) {
    o.beginPath();
    clipPts.forEach((p, i) => { const x = (p.x - box.x) * k, y = (p.y - box.y) * k; i ? o.lineTo(x, y) : o.moveTo(x, y); });
    o.closePath(); o.clip();
  }
  o.drawImage(img, box.x * k, box.y * k, box.w * k, box.h * k, 0, 0, out.width, out.height);
  send({ kind: "image", dataUrl: out.toDataURL("image/png") });
}
function setMode(m) {
  mode = m; drag = null; pts = [];
  document.querySelectorAll("#bar [data-mode]").forEach((b) => b.classList.toggle("on", b.dataset.mode === m));
  document.getElementById("wins").style.display = m === "window" ? "grid" : "none";
  cv.style.cursor = m === "window" ? "default" : "crosshair";
  document.getElementById("hint").textContent = m === "window" ? "Elige la ventana · Esc para cancelar"
    : m === "full" ? "" : "Arrastra para seleccionar · Esc para cancelar";
  draw();
  if (m === "full") send({ kind: "full" });
}
document.querySelectorAll("#bar [data-mode]").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
document.getElementById("close").addEventListener("click", () => window.nv.invoke("capture_cancel", []));
addEventListener("keydown", (e) => { if (e.key === "Escape") window.nv.invoke("capture_cancel", []); });
cv.addEventListener("mousedown", (e) => {
  const p = { x: e.clientX, y: e.clientY };
  if (mode === "rect") drag = { a: p, b: p }; else if (mode === "free") pts = [p];
});
cv.addEventListener("mousemove", (e) => {
  const p = { x: e.clientX, y: e.clientY };
  if (mode === "rect" && drag) { drag.b = p; draw(); }
  else if (mode === "free" && pts.length) { pts.push(p); draw(); }
});
addEventListener("mouseup", () => {
  if (mode === "rect" && drag) {
    const r = rectOf(drag.a, drag.b); drag = null;
    if (r.w > 3 && r.h > 3) crop(r, null); else draw();
  } else if (mode === "free" && pts.length) {
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const box = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    const keep = pts; pts = [];
    if (box.w > 3 && box.h > 3 && keep.length > 2) crop(box, keep); else draw();
  }
});
const wins = document.getElementById("wins");
DATA.windows.forEach((w) => {
  const d = document.createElement("div"); d.className = "win";
  const im = document.createElement("img"); im.src = w.thumb;
  const t = document.createElement("span"); t.textContent = w.name; t.title = w.name;
  d.append(im, t); d.addEventListener("click", () => send({ kind: "window", id: w.id }));
  wins.appendChild(d);
});
addEventListener("resize", size);
img.onload = size;
img.src = "shot.png";
</script></body></html>`;
