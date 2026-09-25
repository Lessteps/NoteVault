// Every public API function is collected here for the IPC handler. Each module
// contributes a map of snake_case method names -> functions bound to a shared
// AppState, mirroring the mixins on the Python NoteVaultApi. Batch 9 fills this
// in module by module.

import { AppConfig } from "./appConfig.js";
import { AppState } from "./appState.js";
import { appApi } from "./modules/app.js";
import { assistantApi } from "./modules/assistant.js";
import { calendarApi } from "./modules/calendar.js";
import { canvasApi } from "./modules/canvas.js";
import { englishPlayerApi } from "./modules/englishPlayer.js";
import { exerciseApi } from "./modules/exercise.js";
import { filesApi } from "./modules/files.js";
import { financeApi } from "./modules/finance.js";
import { goalsApi } from "./modules/goals.js";
import { habitsApi } from "./modules/habits.js";
import { homeApi } from "./modules/home.js";
import { ladderApi } from "./modules/ladder.js";
import { notesExtrasApi } from "./modules/notes_extras.js";
import { practiceApi } from "./modules/practice.js";
import { projectsApi } from "./modules/projects.js";
import { studyApi } from "./modules/study.js";
import { tasksApi } from "./modules/tasks.js";
import { vaultsApi } from "./modules/vaults.js";
import { webApi } from "./modules/web.js";

export type Method = (...args: any[]) => unknown;
export type Registry = Record<string, Method>;

/** Assemble every module's methods against one shared AppState. */
export function buildRegistry(app: AppState): Registry {
  return {
    ...appApi(app),
    ...assistantApi(app),
    ...tasksApi(app),
    ...homeApi(app),
    ...filesApi(app),
    ...englishPlayerApi(app),
    ...notesExtrasApi(app),
    ...vaultsApi(app),
    ...webApi(app),
    ...habitsApi(app),
    ...exerciseApi(app),
    ...financeApi(app),
    ...goalsApi(app),
    ...projectsApi(app),
    ...calendarApi(app),
    ...studyApi(app),
    ...practiceApi(app),
    ...ladderApi(app),
    ...canvasApi(app),
    // Antigravity: add `...<m>Api(app),` here as each module lands.
  };
}

let appState: AppState | null = null;
let current: Registry = {};

/** Create the AppState for the active vault and build the registry. Called once
 * from the Electron main process on startup. */
export function initRegistry(vaultPath?: string): AppState {
  appState = new AppState(vaultPath ?? AppConfig.get_active_vault());
  current = buildRegistry(appState);
  return appState;
}

/** The live registry used by the IPC handler. */
export function getRegistry(): Registry {
  return current;
}

export function getAppState(): AppState | null {
  return appState;
}
