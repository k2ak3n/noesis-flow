import { TFile } from "obsidian";
import { CalendarTask, CalendarTaskStats, NoesisFlowSettings } from "../types";
import { parseCalendarTaskIndex } from "../utils";
import { mergeCalendarTaskStats } from "../calendar/CalendarTaskData";

export interface TaskRepositoryIndex {
  counts: Map<string, CalendarTaskStats>;
  tasksByDate: Map<string, CalendarTask[]>;
  undatedTasks: CalendarTask[];
  completedTasksByDate: Map<string, CalendarTask[]>;
  completedUndatedTasks: CalendarTask[];
}

/**
 * Captures every field consumed by task views. This deliberately includes
 * metadata and source position: a count-only signature leaves views stale
 * after a status, deadline, or availability edit.
 */
export function getTaskRepositoryIndexSignature(index: TaskRepositoryIndex): string {
  return JSON.stringify({
    tasksByDate: Array.from(index.tasksByDate.entries()),
    undatedTasks: index.undatedTasks,
    completedTasksByDate: Array.from(index.completedTasksByDate.entries()),
    completedUndatedTasks: index.completedUndatedTasks
  });
}

interface TaskRepositoryVault {
  read(file: TFile): Promise<string>;
}

interface CachedTaskSource {
  index: ReturnType<typeof parseCalendarTaskIndex>;
}

/**
 * Owns the task index shared by every Noesis Flow view. Changed task notes are
 * reparsed on demand while unchanged configured sources stay cached.
 */
export class TaskRepository {
  private readonly cachedSources = new Map<string, CachedTaskSource>();
  private readonly dirtyPaths = new Set<string>();
  private readonly sourceErrors = new Map<string, string>();
  private refreshQueue: Promise<void> = Promise.resolve();

  constructor(private readonly vault: TaskRepositoryVault) {}

  invalidate(path: string): void {
    if (path) this.dirtyPaths.add(path);
  }

  invalidateAll(): void {
    for (const path of this.cachedSources.keys()) this.dirtyPaths.add(path);
  }

  async refresh(files: TFile[], settings: NoesisFlowSettings, force = false): Promise<TaskRepositoryIndex> {
    const work = this.refreshQueue
      .catch((): void => undefined)
      .then(async () => {
        const activePaths = new Set(files.map((file) => file.path));
        for (const path of Array.from(this.cachedSources.keys())) {
          if (!activePaths.has(path)) this.cachedSources.delete(path);
        }

        for (const file of files) {
          if (!force && this.cachedSources.has(file.path) && !this.dirtyPaths.has(file.path)) continue;
          try {
            const content = await this.vault.read(file);
            this.cachedSources.set(file.path, { index: parseCalendarTaskIndex(content, settings, file.path) });
            this.sourceErrors.delete(file.path);
          } catch (error) {
            this.cachedSources.delete(file.path);
            this.sourceErrors.set(file.path, error instanceof Error ? error.message : String(error));
          } finally {
            this.dirtyPaths.delete(file.path);
          }
        }
      });

    this.refreshQueue = work;
    await work;
    return this.getIndex(files);
  }

  getIndex(files: TFile[]): TaskRepositoryIndex {
    const counts = new Map<string, CalendarTaskStats>();
    const tasksByDate = new Map<string, CalendarTask[]>();
    const undatedTasks: CalendarTask[] = [];
    const completedTasksByDate = new Map<string, CalendarTask[]>();
    const completedUndatedTasks: CalendarTask[] = [];

    for (const file of files) {
      const source = this.cachedSources.get(file.path);
      if (!source) continue;
      for (const [dateKey, stats] of source.index.counts.entries()) {
        counts.set(dateKey, mergeCalendarTaskStats(counts.get(dateKey), stats));
      }
      for (const [dateKey, tasks] of source.index.tasksByDate.entries()) {
        const current = tasksByDate.get(dateKey) || [];
        current.push(...tasks);
        tasksByDate.set(dateKey, current);
      }
      undatedTasks.push(...(source.index.undatedTasks || []));
      for (const [dateKey, tasks] of source.index.completedTasksByDate || []) {
        const current = completedTasksByDate.get(dateKey) || [];
        current.push(...tasks);
        completedTasksByDate.set(dateKey, current);
      }
      completedUndatedTasks.push(...(source.index.completedUndatedTasks || []));
    }

    const sortTasks = (tasks: CalendarTask[]) => tasks.sort((a, b) => {
      const sourceCompare = String(a.sourcePath || "").localeCompare(String(b.sourcePath || ""));
      return sourceCompare || (a.lineIndex || 0) - (b.lineIndex || 0);
    });
    for (const tasks of tasksByDate.values()) sortTasks(tasks);
    for (const tasks of completedTasksByDate.values()) sortTasks(tasks);
    sortTasks(undatedTasks);
    sortTasks(completedUndatedTasks);

    return { counts, tasksByDate, undatedTasks, completedTasksByDate, completedUndatedTasks };
  }

  getSourceErrors(): ReadonlyMap<string, string> {
    return this.sourceErrors;
  }
}
