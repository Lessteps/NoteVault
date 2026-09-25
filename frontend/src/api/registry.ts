// Every public API function is collected here for the IPC handler. Each module
// contributes a map of snake_case method names -> functions bound to a shared
// AppState, mirroring the mixins on the Python NoteVaultApi. Batch 9 fills this
// in module by module.

import type { AppState } from "./appState.js";
import { tasksApi } from "./modules/tasks.js";

export type Method = (...args: any[]) => unknown;
export type Registry = Record<string, Method>;

export function buildRegistry(app: AppState): Registry {
  return {
    ...tasksApi(app),
  };
}

// Empty until the IPC handler is wired to an AppState (later in Batch 9), so
// the app still opens.
export const registry: Registry = {};
