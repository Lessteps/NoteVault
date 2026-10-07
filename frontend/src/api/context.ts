// Ported from notevault_app/webapp/modules/context.py
//
// One set of core managers per vault, wired the way the Qt main window wired
// them, so every module (and the calendar that merges them) shares the same
// instances.

import { AreaManager } from "../core/areaManager.js";
import { ExerciseManager } from "../core/exerciseManager.js";
import { FinanceCalendarSource, FinanceManager } from "../core/financeManager.js";
import { GoalCalendarSource, GoalManager } from "../core/goalManager.js";
import { HabitManager } from "../core/habitManager.js";
import { LibraryStore } from "../core/libraryStore.js";
import { ProjectCalendarSource, ProjectManager } from "../core/projectManager.js";
import { ScheduleManager } from "../core/scheduleManager.js";
import { TaskManager } from "../core/taskManager.js";

export class Managers {
  root: string;
  habits: HabitManager;
  exercise: ExerciseManager;
  /** La biblioteca propia. Comparte vault y caché con el resto: vive aquí para
   * que dos llamadas seguidas no relean el fichero. */
  library: LibraryStore;
  tasks: TaskManager;
  projects: ProjectManager;
  areas: AreaManager;
  goals: GoalManager;
  finances: FinanceManager;
  schedule: ScheduleManager;

  constructor(root: string) {
    this.root = root;
    this.habits = new HabitManager(root);
    this.exercise = new ExerciseManager(root);
    this.library = new LibraryStore(root);
    this.tasks = new TaskManager(root);
    this.projects = new ProjectManager(root);
    this.areas = new AreaManager(root);
    this.goals = new GoalManager(root, this.habits, this.areas);
    this.finances = new FinanceManager(root);
    this.schedule = new ScheduleManager(
      root,
      this.habits,
      this.exercise,
      this.tasks,
      this.projects,
    );
    this.schedule.registerSource("metas", new GoalCalendarSource(this.goals));
    this.schedule.registerSource("proyectos", new ProjectCalendarSource(this.projects));
    this.schedule.registerSource("finanzas", new FinanceCalendarSource(this.finances));
  }

  /** Forget in-memory caches that are not checked against the disk. In the
   * Python app this defended against the classic Qt app writing in between. */
  fresh(): Managers {
    this.habits.reload();
    const ex = this.exercise as unknown as {
      _exercises: unknown;
      _logCache: Map<unknown, unknown>;
    };
    ex._exercises = null;
    ex._logCache.clear();
    this.library.invalidate();
    const goals = this.goals as unknown as {
      _goalsCache: unknown;
      _itemsCache: Map<unknown, unknown>;
    };
    goals._goalsCache = null;
    goals._itemsCache.clear();
    return this;
  }
}
