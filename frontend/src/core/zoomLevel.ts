// Interface zoom: which key presses are zoom shortcuts and how the zoom level moves (pure; the Electron side is electron/zoom.ts).

/** Zoom levels are Chromium's: each step is 1.2×, so 0 = 100 %, 1 = 120 %, -1 ≈ 83 %. */
export const ZOOM_MIN = -3;
export const ZOOM_MAX = 4;
const STEP = 0.5;

export type ZoomAction = "in" | "out" | "reset";

/** The zoom action a key press asks for, or null when it is not a zoom shortcut. */
export function zoomActionFor(input: { type: string; key: string; code: string; control: boolean; meta: boolean; alt: boolean }): ZoomAction | null {
  if (input.type !== "keyDown" || input.alt || !(input.control || input.meta)) return null;
  if (input.key === "+" || input.key === "=" || input.code === "NumpadAdd") return "in";
  if (input.key === "-" || input.key === "_" || input.code === "NumpadSubtract") return "out";
  if (input.key === "0" || input.code === "Numpad0") return "reset";
  return null;
}

/** The next zoom level after an action, kept inside the allowed range. */
export function nextZoom(level: number, action: ZoomAction): number {
  if (action === "reset") return 0;
  const next = level + (action === "in" ? STEP : -STEP);
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(next * 100) / 100));
}
