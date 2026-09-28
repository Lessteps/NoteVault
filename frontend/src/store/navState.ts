// Internal navigation state of the functionalities.
//
// A module's own React state dies when it unmounts, so "which sub-tab was I on,
// which week was I looking at" is kept here instead: one flat map, namespaced by
// the module that owns it, persisted under `nv.navState`.
//
// The modules that wrap their views in the keep-alive host
// (`components/ModuleHost.tsx`) keep this state alive for free while the app is
// running; this store is what makes it survive a restart, and what a module
// adopts with a single line:
//
//     const [view, setView] = usePersistedNav("ejercicio.view", "overview");

import { create } from "zustand";

const STORAGE_KEY = "nv.navState";

type Values = Record<string, unknown>;

function stored(): Values {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === "object" ? (parsed as Values) : {};
  } catch {
    return {};
  }
}

function persist(values: Values): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
  } catch {
    // Best effort: a full quota must never break navigation.
  }
}

interface NavState {
  values: Values;
  set: (key: string, value: unknown) => void;
  /** Forgets one module (`scope = "ejercicio"`) or everything. */
  clear: (scope?: string) => void;
}

export const useNavState = create<NavState>((set) => ({
  values: typeof localStorage === "undefined" ? {} : stored(),
  set: (key, value) =>
    set((s) => {
      const values = { ...s.values, [key]: value };
      persist(values);
      return { values };
    }),
  clear: (scope) =>
    set((s) => {
      const values = scope
        ? Object.fromEntries(Object.entries(s.values).filter(([k]) => k !== scope && !k.startsWith(`${scope}.`)))
        : {};
      persist(values);
      return { values };
    }),
}));

/**
 * A piece of a module's own navigation, remembered across mounts and restarts.
 * `key` is namespaced by convention: `"<module>.<what>"`.
 */
export function usePersistedNav<T>(key: string, initial: T): [T, (value: T) => void] {
  const storedValue = useNavState((s) => s.values[key]) as T | undefined;
  const write = useNavState((s) => s.set);
  return [storedValue === undefined ? initial : storedValue, (value: T) => write(key, value)];
}

/**
 * Mirrors one field of a module's own zustand store into the nav state, and
 * restores it on the next start. One line per store:
 *
 *     persistField(useCalendar, "view", "calendar.view");
 *
 * Stores that keep their navigation in React state use `usePersistedNav`
 * instead; both end up in the same persisted map.
 */
export function persistField<T extends object, K extends keyof T>(
  store: { getState: () => T; setState: (patch: Partial<T>) => void; subscribe: (fn: (s: T) => void) => () => void },
  key: K,
  name: string,
): void {
  const saved = useNavState.getState().values[name];
  if (saved !== undefined) store.setState({ [key]: saved } as unknown as Partial<T>);
  store.subscribe((state) => {
    const value = state[key];
    if (useNavState.getState().values[name] !== value) useNavState.getState().set(name, value);
  });
}
