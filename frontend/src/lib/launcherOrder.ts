// The order of the buttons in the right-hand launcher strip. The user drags them
// into the order they like; it is remembered on this machine. Buttons that are not
// in the saved order yet (a new tool, or one that only shows in some areas) keep
// their default place after the ones that are.

const KEY = "nv.launcherOrder";

export function loadLauncherOrder(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function saveLauncherOrder(order: string[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(order));
  } catch {
    // Without storage the order simply lasts until the window closes.
  }
}

/** `visible` (in default order) arranged by `saved`; ids missing from `saved` go last, in their default order. */
export function applyLauncherOrder(visible: string[], saved: string[]): string[] {
  const known = saved.filter((id) => visible.includes(id));
  return [...known, ...visible.filter((id) => !known.includes(id))];
}

/** Moves `id` to the place `target` has now. */
export function moveLauncher(order: string[], id: string, target: string): string[] {
  if (id === target) return order;
  const from = order.indexOf(id);
  const to = order.indexOf(target);
  if (from < 0 || to < 0) return order;
  const next = [...order];
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}
