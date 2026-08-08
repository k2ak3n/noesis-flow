import { Notice, TFile, Vault } from "obsidian";
import { CalendarTask, NoesisFlowSettings, RecurringTaskSeries } from "../types";
import { moment } from "../time";
import {
  createCalendarTaskId,
  createCalendarTaskLine,
  getCalendarTaskDateKey,
  getCalendarTaskDuplicateKeys,
  parseCalendarTaskIndex,
  unique,
  updateCalendarTaskInContent
} from "../utils";
import { getRecurringTaskContinuationDates, getRecurringTaskDates } from "./TaskRecurrence";
import { insertCalendarTasksInSection } from "./TaskMarkdown";
import { TaskDocumentProcessor } from "./TaskDocumentStore";

export interface RecurringTaskHost {
  readonly vault: Vault;
  readonly settings: NoesisFlowSettings;
  processTaskFile(file: TFile, processor: TaskDocumentProcessor): Promise<void>;
  refreshCalendarTaskCounts(refreshViews?: boolean): Promise<void>;
  getRecurringTaskDateSettings(overrides?: Record<string, unknown>): unknown;
  getRecurringTaskSeriesDates(series: RecurringTaskSeries): string[];
  getRecurringTaskSourceFiles(): TFile[];
  saveSettings(): Promise<void>;
  refreshRecurringTaskManagerViews(): void;
}

const RECURRING_RECOVERY_VERSION = 1;

type RecoveredOccurrence = {
  task: CalendarTask;
  completed: boolean;
};

function collectIndexTasks(index): RecoveredOccurrence[] {
  const groups = [
    ...Array.from(index.tasksByDate.values()),
    index.undatedTasks || [],
    ...Array.from(index.completedTasksByDate.values()),
    index.completedUndatedTasks || []
  ];
  return groups.flat().filter((task) => task && task.seriesId).map((task) => ({ task, completed: !!task.completed }));
}

function numericGreatestCommonDivisor(first: number, second: number): number {
  let left = Math.abs(Math.round(first));
  let right = Math.abs(Math.round(second));
  while (right) {
    const remainder = left % right;
    left = right;
    right = remainder;
  }
  return left || 1;
}

function inferRecoveredRecurrence(dateKeys: string[]) {
  const dates = Array.from(new Set(dateKeys))
    .map((dateKey) => moment(dateKey, "YYYY-MM-DD", true).startOf("day"))
    .filter((date) => date.isValid())
    .sort((left, right) => left.valueOf() - right.valueOf());
  const fallback = { rule: "weekly", interval: 1, endMode: "limit", endCount: 0, endDate: "" };
  if (dates.length < 2) return fallback;

  const monthSteps = dates.slice(1).map((date, index) => (date.year() - dates[index].year()) * 12 + date.month() - dates[index].month());
  const monthInterval = monthSteps[0];
  const monthlyPattern = monthInterval > 0 && monthSteps.every((step) => step === monthInterval)
    && dates.every((date) => date.date() === dates[0].date() || date.date() === date.daysInMonth());
  if (monthlyPattern) return { ...fallback, rule: "monthly", interval: monthInterval };

  const weekdaySignatures = new Map<string, number[]>();
  for (const date of dates) {
    const weekKey = date.clone().startOf("isoWeek").format("YYYY-MM-DD");
    const weekdays = weekdaySignatures.get(weekKey) || [];
    weekdays.push(date.isoWeekday());
    weekdaySignatures.set(weekKey, weekdays);
  }
  const signatures = Array.from(weekdaySignatures.values())
    .map((weekdays) => Array.from(new Set(weekdays)).sort((left, right) => left - right).join(","))
    .filter((signature) => signature.includes(","));
  const repeatedSignature = signatures.find((signature) => signatures.filter((candidate) => candidate === signature).length >= 2);
  if (repeatedSignature) return { ...fallback, rule: "custom-weekdays", weekdays: repeatedSignature.split(",").map((day) => ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][Number(day) - 1]).join(", ") };

  const daySteps = dates.slice(1).map((date, index) => date.diff(dates[index], "days"));
  const commonWeekday = dates.every((date) => date.isoWeekday() === dates[0].isoWeekday());
  if (commonWeekday && daySteps.every((step) => step > 0 && step % 7 === 0)) {
    const interval = daySteps.reduce(numericGreatestCommonDivisor) / 7;
    return { ...fallback, rule: "weekly", interval: Math.max(1, interval) };
  }
  if (daySteps.every((step) => step > 0 && step < 7) && daySteps.every((step) => step === daySteps[0])) {
    return { ...fallback, rule: "daily", interval: daySteps[0] };
  }
  return fallback;
}

function buildRecoveredSeries(seriesId: string, occurrences: RecoveredOccurrence[]): RecurringTaskSeries | null {
  const sourceCounts = new Map<string, number>();
  for (const occurrence of occurrences) {
    const path = String(occurrence.task.sourcePath || "").trim();
    if (path) sourceCounts.set(path, (sourceCounts.get(path) || 0) + 1);
  }
  const sourcePath = Array.from(sourceCounts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] || "";
  const sourceOccurrences = occurrences.filter((occurrence) => occurrence.task.sourcePath === sourcePath && occurrence.task.dateKey);
  const dates = Array.from(new Set(sourceOccurrences.map((occurrence) => occurrence.task.dateKey)
    .filter((dateKey) => moment(dateKey, "YYYY-MM-DD", true).isValid()))).sort();
  if (!sourcePath || !dates.length) return null;
  const template = sourceOccurrences.slice().sort((left, right) => {
    if (left.completed !== right.completed) return left.completed ? 1 : -1;
    return String(right.task.dateKey).localeCompare(String(left.task.dateKey)) || right.task.lineIndex - left.task.lineIndex;
  })[0].task;
  return {
    id: seriesId,
    text: template.text,
    section: template.section,
    marker: template.marker,
    sourcePath,
    startDate: dates[0],
    recurrence: inferRecoveredRecurrence(dates),
    occurrenceCount: dates.length,
    occurrenceDates: dates,
    metadata: template.projectId ? { projectId: template.projectId } : {},
    status: "active",
    createdAt: new Date().toISOString()
  };
}
/**
 * Maintains the persisted recurrence series and its materialized Markdown
 * occurrences. The host supplies only storage and refresh integration.
 */
export class RecurringTaskService {
  constructor(private readonly host: RecurringTaskHost) {}

  private get series(): RecurringTaskSeries[] {
    return Array.isArray(this.host.settings.recurringTaskSeries) ? this.host.settings.recurringTaskSeries : [];
  }

  private recoveryPromise: Promise<number> | null = null;

  async recoverSeriesFromConfiguredSources(force = false): Promise<number> {
    if (this.recoveryPromise) return this.recoveryPromise;
    this.recoveryPromise = this.recoverSeriesFromConfiguredSourcesInternal(force);
    try {
      return await this.recoveryPromise;
    } finally {
      this.recoveryPromise = null;
    }
  }

  private async recoverSeriesFromConfiguredSourcesInternal(force: boolean): Promise<number> {
    if (!force && (this.series.length || this.host.settings.recurringTaskRecoveryVersion >= RECURRING_RECOVERY_VERSION)) return 0;
    const groups = new Map<string, RecoveredOccurrence[]>();
    const parserSettings = { ...this.host.settings, recurringTaskSeries: [] };
    for (const file of this.host.getRecurringTaskSourceFiles()) {
      try {
        const index = parseCalendarTaskIndex(await this.host.vault.read(file), parserSettings, file.path);
        for (const occurrence of collectIndexTasks(index)) {
          const seriesId = String(occurrence.task.seriesId || "").trim();
          if (!seriesId) continue;
          const values = groups.get(seriesId) || [];
          values.push(occurrence);
          groups.set(seriesId, values);
        }
      } catch (error) {
        console.warn(`Noesis Flow: unable to inspect recurring task source ${file.path}`, error);
      }
    }

    const existingIds = new Set(this.series.map((series) => series.id));
    const recovered = Array.from(groups.entries())
      .filter(([seriesId]) => !existingIds.has(seriesId))
      .map(([seriesId, occurrences]) => buildRecoveredSeries(seriesId, occurrences))
      .filter((series): series is RecurringTaskSeries => !!series);
    this.host.settings.recurringTaskRecoveryVersion = RECURRING_RECOVERY_VERSION;
    if (recovered.length) this.host.settings.recurringTaskSeries = [...this.series, ...recovered];
    await this.host.saveSettings();
    if (recovered.length) await this.host.refreshCalendarTaskCounts(true);
    this.host.refreshRecurringTaskManagerViews();
    return recovered.length;
  }

  private async saveAndRefresh(): Promise<void> {
    await this.host.saveSettings();
    await this.host.refreshCalendarTaskCounts(true);
    this.host.refreshRecurringTaskManagerViews();
  }

  async updateSeries(seriesId: string, updates: Partial<RecurringTaskSeries>): Promise<boolean> {
    const current = this.series.find((series) => series.id === seriesId);
    if (!current) return false;
    const nextSeries = { ...current, ...updates };
    const file = this.host.vault.getAbstractFileByPath(current.sourcePath);
    if (file instanceof TFile) {
      await this.host.processTaskFile(file, (content) => {
        const parserSettings = {
          ...this.host.settings,
          recurringTaskSeries: this.series.map((series) => ({ ...series, status: "active" as const }))
        };
        const parsed = parseCalendarTaskIndex(content, parserSettings, file.path);
        const today = moment().startOf("day");
        const tasks = Array.from(parsed.tasksByDate.values()).flat()
          .filter((task) => task.seriesId === seriesId && task.dateKey && !moment(task.dateKey, "YYYY-MM-DD", true).isBefore(today, "day"))
          .sort((a, b) => b.lineIndex - a.lineIndex);
        return tasks.reduce((nextContent, task) => updateCalendarTaskInContent(nextContent, task, {
          text: nextSeries.text,
          section: nextSeries.section,
          marker: nextSeries.marker
        }, this.host.settings).content, content);
      });
    }
    this.host.settings.recurringTaskSeries = this.series.map((series) => series.id === seriesId ? nextSeries : series);
    await this.saveAndRefresh();
    return true;
  }

  async extendSeries(seriesId: string, amount = this.host.settings.recurringTaskOccurrenceLimit): Promise<number> {
    const series = this.series.find((item) => item.id === seriesId);
    if (!series || series.status === "paused") return 0;
    const file = this.host.vault.getAbstractFileByPath(series.sourcePath);
    if (!(file instanceof TFile)) {
      new Notice("The source note for this recurring task is unavailable.");
      return 0;
    }
    const currentDates = new Set(this.host.getRecurringTaskSeriesDates(series));
    let targetCount = Math.min(52, currentDates.size + Math.max(1, Math.min(52, Number(amount) || 1)));
    if (series.recurrence?.endMode === "count") targetCount = Math.min(targetCount, Math.max(1, Number(series.recurrence.endCount) || 1));
    const recurrence = { ...series.recurrence };
    if (recurrence.endMode !== "date") {
      recurrence.endMode = "count";
      recurrence.endCount = targetCount;
    }
    const candidateDates = getRecurringTaskDates(series.startDate, recurrence, this.host.getRecurringTaskDateSettings({
      recurringTaskOccurrenceLimit: targetCount
    })).map((date) => getCalendarTaskDateKey(date)).filter((dateKey) => !currentDates.has(dateKey));
    return this.materializeDates(series, candidateDates);
  }

  async maintainHorizon(force = false): Promise<number> {
    if (!this.host.settings.recurringTasksEnabled || (!force && this.host.settings.recurringTaskAutoExtend === false)) return 0;
    let added = 0;
    for (const series of this.series) added += await this.maintainSeries(series);
    return added;
  }

  async maintainSeries(series: RecurringTaskSeries): Promise<number> {
    if (!series || series.status === "paused") return 0;
    const candidateDates = getRecurringTaskContinuationDates(series, this.host.getRecurringTaskDateSettings());
    return this.materializeDates(series, candidateDates);
  }

  private async materializeDates(series: RecurringTaskSeries, candidateDates: string[]): Promise<number> {
    if (!candidateDates.length) return 0;
    const file = this.host.vault.getAbstractFileByPath(series.sourcePath);
    if (!(file instanceof TFile)) return 0;
    const addedDates: string[] = [];
    await this.host.processTaskFile(file, (content) => {
      const existing = new Set(getCalendarTaskDuplicateKeys(content, this.host.settings));
      const lines: string[] = [];
      for (const dateKey of candidateDates) {
        const duplicateKey = `${String(series.section || "").toLowerCase()}\t${dateKey}\t${String(series.text || "").toLowerCase()}`;
        if (existing.has(duplicateKey)) continue;
        existing.add(duplicateKey);
        lines.push(createCalendarTaskLine(series.text, { marker: series.marker }, dateKey, this.host.settings, {
          ...series.metadata,
          seriesId: series.id,
          taskId: createCalendarTaskId()
        }));
        addedDates.push(dateKey);
      }
      return lines.length ? insertCalendarTasksInSection(content, series.section, lines) : content;
    });
    if (!addedDates.length) return 0;
    const occurrenceDates = unique([...this.host.getRecurringTaskSeriesDates(series), ...addedDates]).sort() as string[];
    this.host.settings.recurringTaskSeries = this.series.map((item) => item.id === series.id
      ? { ...item, occurrenceCount: occurrenceDates.length, occurrenceDates }
      : item);
    await this.saveAndRefresh();
    return addedDates.length;
  }

  async setSeriesStatus(seriesId: string, status: "active" | "paused"): Promise<boolean> {
    let changed = false;
    this.host.settings.recurringTaskSeries = this.series.map((series) => {
      if (series.id !== seriesId || series.status === status) return series;
      changed = true;
      return { ...series, status };
    });
    if (!changed) return false;
    await this.saveAndRefresh();
    return true;
  }

  async removeSeries(seriesId: string): Promise<boolean> {
    const next = this.series.filter((series) => series.id !== seriesId);
    if (next.length === this.series.length) return false;
    this.host.settings.recurringTaskSeries = next;
    await this.saveAndRefresh();
    return true;
  }
}
