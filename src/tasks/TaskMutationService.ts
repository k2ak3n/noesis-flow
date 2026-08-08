import { Notice, TFile, Vault, normalizePath } from "obsidian";
import { CalendarTask, NoesisFlowSettings, RecurringTaskSeries } from "../types";
import { moment } from "../time";
import {
  createCalendarTaskId,
  createCalendarTaskLine,
  deleteCalendarTaskInContent,
  findCalendarTaskLineIndex,
  getCalendarTaskDateKey,
  getCalendarTaskDuplicateKeys,
  getTaskCaptureSection,
  getTaskMetadataUpdates,
  markCalendarTaskCompletedInContent,
  unique,
  updateCalendarTaskInContent
} from "../utils";
import { getNextAfterCompletionDate } from "./TaskRecurrence";
import { insertCalendarTasksInSection } from "./TaskMarkdown";
import { preserveTaskLineComments, updateTaskMetadataInText } from "./TaskMetadata";
import { TaskDocumentProcessor } from "./TaskDocumentStore";

export type TaskUpdates = Partial<CalendarTask> & Record<string, unknown>;

export interface TaskMutationOptions {
  recordUndo?: boolean;
  audit?: boolean;
  auditAction?: string;
  noticeText?: string;
}

export interface TaskUndoEntry {
  label: string;
  sourcePath: string;
  createdAt: string;
  undo: () => Promise<boolean> | boolean;
}

/**
 * Narrow adapter between task workflows and the Obsidian plugin.
 *
 * Keeping this surface explicit makes Markdown mutations independently
 * testable and prevents views from needing the entire plugin instance.
 */
export interface TaskMutationHost {
  readonly vault: Vault;
  readonly settings: NoesisFlowSettings;
  processTaskFile(file: TFile, processor: TaskDocumentProcessor): Promise<void>;
  processTaskFiles(files: TFile[], operation: () => Promise<void>): Promise<void>;
  refreshCalendarTaskCounts(refreshViews?: boolean): Promise<void>;
  getCalendarTaskFileForTask(task: CalendarTask, showNotice?: boolean): TFile | null;
  getTaskSourcePaths(): string[];
  getRecurringTaskSeries(): RecurringTaskSeries[];
  getRecurringTaskDateSettings(overrides?: Record<string, unknown>): unknown;
  getRecurringTaskSeriesDates(series: RecurringTaskSeries): string[];
  saveSettings(): Promise<void>;
  refreshRecurringTaskManagerViews(): void;
}

/**
 * Executes user-visible task mutations: Markdown changes, undo/audit history,
 * cross-note moves, and recurrence transitions caused by task actions.
 */
export class TaskMutationService {
  private readonly undoStack: TaskUndoEntry[] = [];

  constructor(private readonly host: TaskMutationHost) {}

  getTaskMutationHistory(): TaskUndoEntry[] {
    return this.undoStack.slice().reverse();
  }

  async runTaskUndo(entry: TaskUndoEntry): Promise<boolean> {
    const index = this.undoStack.indexOf(entry);
    if (index < 0) return false;
    this.undoStack.splice(index, 1);
    try {
      return !!(await entry.undo());
    } catch (error) {
      console.error(error);
      return false;
    }
  }

  private recordUndo(label: string, undo: TaskUndoEntry["undo"], sourcePath = ""): void {
    const entry: TaskUndoEntry = { label, undo, sourcePath, createdAt: new Date().toISOString() };
    this.undoStack.push(entry);
    if (this.undoStack.length > 20) this.undoStack.shift();

    const notice = new Notice(`${label}.`, 10000);
    const noticeEl = (notice as Notice & { noticeEl?: HTMLElement }).noticeEl;
    if (!noticeEl) return;
    const button = noticeEl.createEl("button", { text: "Undo", attr: { type: "button" } });
    button.addEventListener("click", async () => {
      button.disabled = true;
      const restored = await this.runTaskUndo(entry);
      if (restored) new Notice("Task change undone.");
      notice.hide();
    });
  }

  private getTaskAuditPath(): string {
    if (!this.host.settings.taskAuditEnabled) return "";
    const path = String(this.host.settings.taskAuditNote || "").trim();
    return path ? normalizePath(path) : "";
  }

  async writeTaskAudit(action: string, task: Partial<CalendarTask>, details = ""): Promise<void> {
    const path = this.getTaskAuditPath();
    if (!path) return;
    const text = String(task.text || "Untitled task").replace(/[\r\n]+/g, " ").trim();
    const section = String(task.section || "Unsorted").replace(/[\r\n]+/g, " ").trim();
    const date = String(task.dateKey || "No date").trim() || "No date";
    const separator = ` ${String.fromCharCode(183)} `;
    const dash = String.fromCharCode(8212);
    const suffix = details ? `${separator}${details}` : "";
    const line = `- ${moment().format("YYYY-MM-DD HH:mm")} ${dash} **${action}** ${dash} ${text}${separator}${section}${separator}${date}${suffix}`;
    try {
      const file = this.host.vault.getAbstractFileByPath(path);
      if (file instanceof TFile) {
        await this.host.processTaskFile(file, (content) => `${String(content || "").replace(/\s*$/, "")}\n${line}\n`);
      }
    } catch (error) {
      console.warn("Noesis Flow: unable to write task audit entry", error);
    }
  }

  async restoreDeletedCalendarTask(task: CalendarTask, audit = true): Promise<boolean> {
    const file = this.host.getCalendarTaskFileForTask(task, true);
    if (!file) return false;
    let changed = false;
    await this.host.processTaskFile(file, (content) => {
      const duplicateKey = `${String(task.section || "").toLowerCase()}\t${String(task.dateKey || "")}\t${String(task.text || "").toLowerCase()}`;
      if (getCalendarTaskDuplicateKeys(content, this.host.settings).has(duplicateKey)) return content;
      const line = createCalendarTaskLine(task.text, { marker: task.marker }, task.dateKey, this.host.settings, {
        seriesId: task.seriesId,
        taskId: task.id || createCalendarTaskId()
      });
      const next = insertCalendarTasksInSection(content, task.section, [line]);
      changed = next !== content;
      return next;
    });
    if (!changed) return false;
    await this.host.refreshCalendarTaskCounts(true);
    if (audit) await this.writeTaskAudit("Restored", task);
    return true;
  }

  private async scheduleAfterCompletionOccurrence(task: CalendarTask): Promise<string> {
    const series = this.host.getRecurringTaskSeries().find((item) => item.id === task.seriesId);
    if (!series || series.status === "paused" || !series.recurrence || series.recurrence.rule !== "after-completion") return "";
    const occurrenceDates = this.host.getRecurringTaskSeriesDates(series);
    const endCount = series.recurrence.endMode === "count" ? Math.max(1, Number(series.recurrence.endCount) || 1) : 0;
    if (endCount && occurrenceDates.length >= endCount) return "";
    const nextDate = getNextAfterCompletionDate(moment(), series.recurrence, this.host.getRecurringTaskDateSettings());
    if (!nextDate) return "";
    const dateKey = getCalendarTaskDateKey(nextDate);
    const endDate = series.recurrence.endMode === "date" ? moment(series.recurrence.endDate, "YYYY-MM-DD", true) : null;
    if (endDate?.isValid() && nextDate.isAfter(endDate, "day")) return "";
    if (occurrenceDates.includes(dateKey)) return "";
    const file = this.host.vault.getAbstractFileByPath(series.sourcePath);
    if (!(file instanceof TFile)) return "";

    let added = false;
    await this.host.processTaskFile(file, (content) => {
      const duplicateKey = `${String(series.section || "").toLowerCase()}\t${dateKey}\t${String(series.text || "").toLowerCase()}`;
      if (getCalendarTaskDuplicateKeys(content, this.host.settings).has(duplicateKey)) return content;
      added = true;
      const line = createCalendarTaskLine(series.text, { marker: series.marker }, dateKey, this.host.settings, {
        ...series.metadata,
        seriesId: series.id,
        taskId: createCalendarTaskId()
      });
      return insertCalendarTasksInSection(content, series.section, [line]);
    });
    if (!added) return "";

    const nextOccurrenceDates = unique([...occurrenceDates, dateKey]).sort() as string[];
    this.host.settings.recurringTaskSeries = this.host.getRecurringTaskSeries().map((item) => item.id === series.id
      ? { ...item, occurrenceCount: nextOccurrenceDates.length, occurrenceDates: nextOccurrenceDates }
      : item);
    await this.host.saveSettings();
    this.host.refreshRecurringTaskManagerViews();
    return dateKey;
  }

  async skipRecurringTaskOccurrence(task: CalendarTask): Promise<boolean> {
    const series = this.host.getRecurringTaskSeries().find((item) => item.id === task.seriesId);
    if (!series || !task.dateKey) {
      new Notice("This recurring occurrence cannot be skipped.");
      return false;
    }
    if (series.recurrence?.rule === "after-completion") {
      new Notice("After-completion series advance only when an occurrence is completed.");
      return false;
    }
    const file = this.host.getCalendarTaskFileForTask(task, true);
    if (!file) return false;
    let changed = false;
    await this.host.processTaskFile(file, (content) => {
      const result = deleteCalendarTaskInContent(content, task, this.host.settings);
      changed = result.changed;
      return result.content;
    });
    if (!changed) {
      await this.host.refreshCalendarTaskCounts(true);
      new Notice("Could not find that occurrence. Refreshed Tasks.");
      return false;
    }
    const excludedDates = unique([...(series.recurrence.excludedDates || []), task.dateKey]).sort() as string[];
    const occurrenceDates = this.host.getRecurringTaskSeriesDates(series).filter((dateKey) => dateKey !== task.dateKey);
    this.host.settings.recurringTaskSeries = this.host.getRecurringTaskSeries().map((item) => item.id === series.id
      ? { ...item, recurrence: { ...item.recurrence, excludedDates }, occurrenceCount: occurrenceDates.length, occurrenceDates }
      : item);
    await this.host.saveSettings();
    await this.host.refreshCalendarTaskCounts(true);
    this.host.refreshRecurringTaskManagerViews();
    await this.writeTaskAudit("Skipped occurrence", task);
    new Notice("Recurring occurrence skipped. Future occurrences are unchanged.");
    return true;
  }

  async completeCalendarTask(task: CalendarTask, options: TaskMutationOptions = {}): Promise<boolean> {
    const file = this.host.getCalendarTaskFileForTask(task, true);
    if (!file) return false;
    let changed = false;
    await this.host.processTaskFile(file, (content) => {
      const result = markCalendarTaskCompletedInContent(content, task, this.host.settings);
      changed = result.changed;
      return result.content;
    });
    if (!changed) {
      await this.host.refreshCalendarTaskCounts(true);
      new Notice("Could not find that open task. Refreshed Tasks.");
      return false;
    }

    const nextOccurrenceDate = await this.scheduleAfterCompletionOccurrence(task);
    await this.host.refreshCalendarTaskCounts(true);
    if (options.recordUndo !== false) {
      const completedTask = { ...task, marker: "X", completed: true };
      this.recordUndo("Task completed", () => this.updateCalendarTask(completedTask, { marker: task.marker }, "Task reopened.", {
        recordUndo: false,
        auditAction: "Reopened"
      }), task.sourcePath);
    }
    if (options.audit !== false) await this.writeTaskAudit("Completed", task);
    new Notice(nextOccurrenceDate ? `Task completed. Next occurrence: ${nextOccurrenceDate}.` : "Task completed.");
    return true;
  }

  async deleteCalendarTask(task: CalendarTask, options: TaskMutationOptions = {}): Promise<boolean> {
    const file = this.host.getCalendarTaskFileForTask(task, true);
    if (!file) return false;
    let changed = false;
    await this.host.processTaskFile(file, (content) => {
      const result = deleteCalendarTaskInContent(content, task, this.host.settings);
      changed = result.changed;
      return result.content;
    });
    if (!changed) {
      await this.host.refreshCalendarTaskCounts(true);
      new Notice("Could not find that task. Refreshed Tasks.");
      return false;
    }
    await this.host.refreshCalendarTaskCounts(true);
    if (options.recordUndo !== false) this.recordUndo("Task deleted", () => this.restoreDeletedCalendarTask(task), task.sourcePath);
    if (options.audit !== false) await this.writeTaskAudit("Deleted", task);
    new Notice("Task deleted.");
    return true;
  }

  async moveCalendarTaskToSource(task: CalendarTask, targetPath: string, updates: TaskUpdates = {}, options: TaskMutationOptions = {}): Promise<boolean> {
    if (task.seriesId) {
      new Notice("Move a recurring series from its own editor to keep every occurrence together.");
      return false;
    }
    const sourceFile = this.host.getCalendarTaskFileForTask(task, true);
    const target = normalizePath(targetPath);
    if (!sourceFile || !target || !this.host.getTaskSourcePaths().includes(target)) {
      new Notice("Choose one of the configured task sources.");
      return false;
    }
    if (sourceFile.path === target) return this.updateCalendarTask(task, updates, options.noticeText || "Task updated.", options);
    const targetFile = this.host.vault.getAbstractFileByPath(target);
    if (!(targetFile instanceof TFile) || targetFile.extension !== "md") {
      new Notice(`Task source not found: ${target}`);
      return false;
    }

    const taskId = task.id || createCalendarTaskId();
    const nextTask: CalendarTask = {
      ...task,
      ...updates,
      id: taskId,
      sourcePath: targetFile.path,
      section: getTaskCaptureSection(Object.hasOwn(updates, "section") ? updates.section : task.section)
    };
    let moved = false;
    try {
      await this.host.processTaskFiles([sourceFile, targetFile], async () => {
        const sourceContent = await this.host.vault.read(sourceFile);
        const sourceLines = String(sourceContent || "").split(/\r?\n/);
        const sourceIndex = findCalendarTaskLineIndex(sourceLines, task, this.host.settings);
        if (sourceIndex < 0) throw new Error("The source task could not be found.");
        const sourceLine = sourceLines[sourceIndex];
        const destinationContent = await this.host.vault.read(targetFile);
        const duplicateKey = `${String(nextTask.section).toLowerCase()}\t${String(nextTask.dateKey || "")}\t${String(nextTask.text).toLowerCase()}`;
        if (getCalendarTaskDuplicateKeys(destinationContent, this.host.settings).has(duplicateKey)) {
          throw new Error("A matching task already exists in that source.");
        }
        const nextLine = updateTaskMetadataInText(
          preserveTaskLineComments(sourceLine, createCalendarTaskLine(nextTask.text, { marker: nextTask.marker }, nextTask.dateKey, this.host.settings, { taskId })),
          getTaskMetadataUpdates(updates)
        );
        let inserted = false;
        await this.host.vault.process(targetFile, (content) => {
          inserted = true;
          return insertCalendarTasksInSection(content, nextTask.section, [nextLine]);
        });
        let removed = false;
        await this.host.vault.process(sourceFile, (content) => {
          const result = deleteCalendarTaskInContent(content, task, this.host.settings);
          removed = result.changed;
          return result.content;
        });
        if (!removed && inserted) {
          await this.host.vault.process(targetFile, (content) => deleteCalendarTaskInContent(content, nextTask, this.host.settings).content);
          throw new Error("The source task changed before it could be moved. Nothing was moved.");
        }
        moved = removed;
      });
    } catch (error) {
      console.error(error);
      new Notice(`Could not move task: ${error instanceof Error ? error.message : String(error)}`);
      await this.host.refreshCalendarTaskCounts(true);
      return false;
    }
    if (!moved) return false;
    await this.host.refreshCalendarTaskCounts(true);
    if (options.recordUndo !== false) {
      const original: TaskUpdates = {
        text: task.text, section: task.section, marker: task.marker, dateKey: task.dateKey, projectId: task.projectId
      };
      this.recordUndo("Task moved", () => this.moveCalendarTaskToSource(nextTask, sourceFile.path, original, {
        recordUndo: false, auditAction: "Restored", noticeText: "Task restored."
      }), sourceFile.path);
    }
    if (options.audit !== false) await this.writeTaskAudit(options.auditAction || "Moved", nextTask, `from ${sourceFile.path}`);
    new Notice(options.noticeText || `Task moved to ${targetFile.path}.`);
    return true;
  }

  async reorderKanbanTasks(task: CalendarTask, beforeTask: CalendarTask): Promise<boolean> {
    if (task.completed || beforeTask.completed) return false;
    if (!task.sourcePath || task.sourcePath !== beforeTask.sourcePath || task.section !== beforeTask.section) {
      new Notice("Custom order works within one Project in the same task note.");
      return false;
    }
    const file = this.host.getCalendarTaskFileForTask(task, true);
    if (!file) return false;
    let changed = false;
    await this.host.processTaskFile(file, (content) => {
      const newline = content.includes("\r\n") ? "\r\n" : "\n";
      const lines = content.split(/\r?\n/);
      const sourceIndex = findCalendarTaskLineIndex(lines, task, this.host.settings);
      const targetIndex = findCalendarTaskLineIndex(lines, beforeTask, this.host.settings);
      if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return content;
      const [sourceLine] = lines.splice(sourceIndex, 1);
      const nextTargetIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
      lines.splice(nextTargetIndex, 0, sourceLine);
      changed = true;
      return lines.join(newline);
    });
    if (!changed) {
      new Notice("Could not reorder those tasks. Refreshed Kanban.");
      await this.host.refreshCalendarTaskCounts(true);
      return false;
    }
    await this.host.refreshCalendarTaskCounts(true);
    return true;
  }

  async updateCalendarTask(task: CalendarTask, updates: TaskUpdates, noticeText = "Task updated.", options: TaskMutationOptions = {}): Promise<boolean> {
    const file = this.host.getCalendarTaskFileForTask(task, true);
    if (!file) return false;
    const nextDate = (key: keyof CalendarTask) => Object.hasOwn(updates, key) ? updates[key] : task[key];
    const taskDate = nextDate("dateKey") ? moment(String(nextDate("dateKey")), "YYYY-MM-DD", true) : null;
    if (taskDate && !taskDate.isValid()) {
      new Notice("Use a valid Date in YYYY-MM-DD format.");
      return false;
    }
    let changed = false;
    await this.host.processTaskFile(file, (content) => {
      const result = updateCalendarTaskInContent(content, task, updates, this.host.settings);
      changed = result.changed;
      return result.content;
    });
    if (!changed) {
      await this.host.refreshCalendarTaskCounts(true);
      new Notice("Could not update that task. Refreshed Tasks.");
      return false;
    }
    await this.host.refreshCalendarTaskCounts(true);
    const previous: TaskUpdates = {
      text: task.text, section: task.section, marker: task.marker, dateKey: task.dateKey, status: task.status,
      completedAt: task.completedAt, projectId: task.projectId
    };
    const reverseUpdates = Object.fromEntries(Object.keys(updates)
      .filter((key) => Object.hasOwn(previous, key))
      .map((key) => [key, previous[key]])) as TaskUpdates;
    if (options.recordUndo !== false && Object.keys(reverseUpdates).length) {
      const nextTask = { ...task, ...updates };
      this.recordUndo("Task updated", () => this.updateCalendarTask(nextTask, reverseUpdates, "Task restored.", {
        recordUndo: false, auditAction: "Restored"
      }), task.sourcePath);
    }
    if (options.audit !== false) await this.writeTaskAudit(options.auditAction || "Updated", { ...task, ...updates }, Object.keys(updates).join(", "));
    new Notice(noticeText);
    return true;
  }
}
