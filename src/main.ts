
import { CalendarTask, CalendarTaskStats, DateTaskFilter, KanbanSavedView, NoesisFlowProject, NoesisFlowSettings, RecurringTaskRecurrence, RecurringTaskRule, RecurringTaskSeries, TimerSoundFile, TimelineEntry } from "./types";
import { NOESIS_FLOW_CALENDAR_VIEW_TYPE, NOESIS_FLOW_TIMER_VIEW_TYPE, NOESIS_FLOW_TASK_LIST_VIEW_TYPE, NOESIS_FLOW_PLANNING_VIEW_TYPE, NOESIS_FLOW_KANBAN_VIEW_TYPE, NOESIS_FLOW_RECURRING_VIEW_TYPE, NOESIS_FLOW_DAILY_BRIEF_VIEW_TYPE, NOESIS_FLOW_TIMELINE_VIEW_TYPE, NOESIS_FLOW_VIEW_TYPES, DEFAULT_VIEW_PLACEMENTS, DEFAULT_SETTINGS, DATE_TASK_FILTER_VALUES, KANBAN_TASK_VIEW_VALUES, TASK_LIST_COLUMN_IDS, BUILT_IN_SLOW_TICK_SOUND_PATH, BUILT_IN_TIMER_SOUNDS, normalizeTimerSoundPath, normalizeTaskListColumnOrder, normalizeTaskListVisibleColumns, normalizeTaskListColumnWidths, unique, sanitizeCssText, clampNumber, normalizeMarkdownPath, normalizeCalendarTaskText, getCalendarTaskDateKey, createCalendarTaskLine, createCalendarTaskId, createNoesisFlowProjectId, getCalendarTaskDuplicateKeys, normalizePomodoroMode, normalizeKanbanCardAccentPosition, normalizeKanbanCardContextPlacement, normalizeKanbanCardContextAlignment } from "./utils";
import { getRecurringTaskDates, getRecurringTaskLabel } from "./tasks/TaskRecurrence";
import type { RecurrenceDateSettings } from "./tasks/TaskRecurrence";
import { getMarkdownH2Sections, insertCalendarTasksInSection } from "./tasks/TaskMarkdown";
import { createTimelineEventLine, deleteTimelineEventInContent, getTimelineEntries, insertTimelineEventInSection, parseTimelineEntries, serializeTimelineEntries, updateTimelineEventInContent } from "./timeline/TimelineMarkdown";
import { parseHolidayEntries, serializeHolidayEntries } from "./calendar/HolidayMarkdown";
import { getDateTaskGroups, getCalendarTaskSignal } from "./calendar/CalendarTaskData";

import { NoesisFlowSettingTab } from "./settings";
import { NoesisFlowCalendarView } from "./views/NoesisFlowCalendarView";
import { NoesisFlowTimerView } from "./views/NoesisFlowTimerView";
import { NoesisFlowTaskListView } from "./views/NoesisFlowTaskListView";
import { NoesisFlowPlanningView } from "./views/NoesisFlowPlanningView";
import { NoesisFlowKanbanView } from "./views/NoesisFlowKanbanView";
import { NoesisFlowRecurringView } from "./views/NoesisFlowRecurringView";
import { NoesisFlowDailyBriefView } from "./views/NoesisFlowDailyBriefView";
import { NoesisFlowTimelineView } from "./views/NoesisFlowTimelineView";
import { getTaskRepositoryIndexSignature } from "./tasks/TaskRepository";
import { TaskService } from "./tasks/TaskService";
import { TaskMutationService, type TaskMutationOptions, type TaskUndoEntry, type TaskUpdates } from "./tasks/TaskMutationService";
import { RecurringTaskService } from "./tasks/RecurringTaskService";
import type { TaskDocumentProcessor } from "./tasks/TaskDocumentStore";
import { NoesisFlowTextPromptModal } from "./modals/NoesisFlowTextPromptModal";
import { NoesisFlowCalendarPriorityModal } from "./modals/NoesisFlowCalendarPriorityModal";
import { NoesisFlowCalendarSectionModal } from "./modals/NoesisFlowCalendarSectionModal";
import { NoesisFlowKanbanTaskModal } from "./modals/NoesisFlowKanbanTaskModal";
import { NoesisFlowRecurringSeriesModal } from "./modals/NoesisFlowRecurringSeriesModal";
import { NoesisFlowTaskDetailsModal } from "./modals/NoesisFlowTaskDetailsModal";
import { NoesisFlowCalendarDayTasksModal } from "./modals/NoesisFlowCalendarDayTasksModal";
import { NoesisFlowConfirmModal } from "./modals/NoesisFlowConfirmModal";
import { NoesisFlowTimelineEventModal } from "./modals/NoesisFlowTimelineEventModal";
import { MarkdownView, Plugin, Notice, TFile } from "obsidian";
import type { WorkspaceLeaf } from "obsidian";
import { moment } from "./time";
import type { Moment, MomentInput } from "moment";
import { getTaskCaptureSection } from "./utils";
import { queryTasks, resolveTaskProject } from "./tasks/TaskQuery";
import { RefreshScheduler } from "./services/RefreshScheduler";
import { settingsNeedPersist } from "./settings/SettingsPersistence";
import { normalizeSettingsSchema } from "./settings/SettingsNormalizer";
import { sanitizeSettingsSnapshot } from "./settings/SettingsSnapshot";
import bundledSlowTickDataUrl from "../media/ticking_slow.mp3";

interface TaskCaptureOptions {
  defaultRecurrence?: RecurringTaskRule;
  defaultUndated?: boolean;
  initialDate?: Moment | null;
  onCancel?: () => void;
  onComplete?: () => void;
}

interface CalendarTaskMetadata extends Record<string, unknown> {
  projectId?: string | null;
  seriesId?: string;
  taskId?: string;
  priorityMarker?: string;
}

interface ObsidianSettingsApp {
  setting?: {
    open(): void;
    openTabById(id: string): void;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export class NoesisFlowPlugin extends Plugin {
  declare settings: NoesisFlowSettings;
  calendarTaskCounts: Map<string, CalendarTaskStats>;
  calendarTasksByDate: Map<string, CalendarTask[]>;
  calendarUndatedTasks: CalendarTask[];
  completedCalendarTasksByDate: Map<string, CalendarTask[]>;
  completedCalendarUndatedTasks: CalendarTask[];
  calendarTaskCountsSignature: string;
  holidayCalendarEntries: Map<string, string[]>;
  holidayCalendarSignature: string;
  timelineEntries: TimelineEntry[];
  timelineSignature: string;
  timerSoundFiles: TimerSoundFile[];
  taskService: TaskService;
  taskMutationService: TaskMutationService;
  recurringTaskService: RecurringTaskService;
  taskRefreshScheduler: RefreshScheduler;
  holidayRefreshScheduler: RefreshScheduler;
  timelineRefreshScheduler: RefreshScheduler;
  viewPlacementSaveTimer: number;
  dailyBriefRibbonIconEl: HTMLElement;
  calendarRibbonIconEl: HTMLElement;
  timerRibbonIconEl: HTMLElement;
  taskListRibbonIconEl: HTMLElement;
  planningRibbonIconEl: HTMLElement;
  kanbanRibbonIconEl: HTMLElement;
  recurringRibbonIconEl: HTMLElement;
  timelineRibbonIconEl: HTMLElement;

  async onload() {
    await this.loadSettings();

    this.calendarTaskCounts = new Map();
    this.calendarTasksByDate = new Map();
    this.calendarUndatedTasks = [];
    this.completedCalendarTasksByDate = new Map();
    this.completedCalendarUndatedTasks = [];
    this.calendarTaskCountsSignature = "";
    this.holidayCalendarEntries = new Map();
    this.holidayCalendarSignature = "";
    this.timelineEntries = [];
    this.timelineSignature = "";
    this.timerSoundFiles = [];
    this.taskService = new TaskService(this.app.vault);
    this.taskMutationService = new TaskMutationService({
      vault: this.app.vault,
      settings: this.settings,
      processTaskFile: (file, processor) => this.processTaskFile(file, processor),
      processTaskFiles: (files, operation) => this.processTaskFiles(files, operation),
      refreshCalendarTaskCounts: (refreshViews) => this.refreshCalendarTaskCounts(refreshViews),
      getCalendarTaskFileForTask: (task, showNotice) => this.getCalendarTaskFileForTask(task, showNotice),
      getTaskSourcePaths: () => this.getTaskSourcePaths(),
      getRecurringTaskSeries: () => this.getRecurringTaskSeries(),
      getRecurringTaskDateSettings: (overrides) => this.getRecurringTaskDateSettings(overrides),
      getRecurringTaskSeriesDates: (series) => this.getRecurringTaskSeriesDates(series),
      saveSettings: () => this.saveSettings(),
      refreshRecurringTaskManagerViews: () => this.refreshRecurringTaskManagerViews()
    });
    this.recurringTaskService = new RecurringTaskService({
      vault: this.app.vault,
      settings: this.settings,
      processTaskFile: (file, processor) => this.processTaskFile(file, processor),
      refreshCalendarTaskCounts: (refreshViews) => this.refreshCalendarTaskCounts(refreshViews),
      getRecurringTaskDateSettings: (overrides) => this.getRecurringTaskDateSettings(overrides),
      getRecurringTaskSeriesDates: (series) => this.getRecurringTaskSeriesDates(series),
      getRecurringTaskSourceFiles: () => this.getCalendarTaskSourceFiles(false),
      saveSettings: () => this.saveSettings(),
      refreshRecurringTaskManagerViews: () => this.refreshRecurringTaskManagerViews()
    });
    this.taskRefreshScheduler = new RefreshScheduler(() => this.refreshCalendarTaskCounts(true));
    this.holidayRefreshScheduler = new RefreshScheduler(() => this.refreshHolidayCalendar(true));
    this.timelineRefreshScheduler = new RefreshScheduler(() => this.refreshTimelineEntries(true));
    this.register(() => {
      this.taskRefreshScheduler.cancel();
      this.holidayRefreshScheduler.cancel();
      this.timelineRefreshScheduler.cancel();
    });
    this.viewPlacementSaveTimer = 0;
    await this.refreshTimerSoundFiles(false);

    this.registerCalendarAddon();
    this.addSettingTab(new NoesisFlowSettingTab(this.app, this));
    this.registerCommands();
    this.setupCalendarTaskCounts();
    this.setupHolidayCalendar();
    this.setupTimelineEvents();
    this.setupViewPlacementTracking();

    this.app.workspace.onLayoutReady(() => {
      // Obsidian restores the sidebar after plugins load, which can reset ribbon
      // element visibility. Reapply module visibility once that restore is done.
      this.updateCalendarRibbonIcon();
      void this.refreshCalendarTaskCounts(true).catch((error) => console.warn("Noesis Flow: unable to refresh calendar tasks", error));
      void this.refreshHolidayCalendar(true)
        .then(() => this.maintainRecurringTaskSeriesHorizon())
        .catch((error) => console.warn("Noesis Flow: unable to maintain recurring tasks", error));
      void this.refreshTimelineEntries(true).catch((error) => console.warn("Noesis Flow: unable to refresh timeline entries", error));
      this.rememberVisibleViewPlacements();
      this.closeSidebarDailyBriefViews().catch((error) => console.warn("Noesis Flow: unable to migrate Dashboard view", error));
    });
  }

  async processTaskFile(file: TFile, processor: TaskDocumentProcessor) {
    await this.taskService.process(file, processor);
  }

  async processTaskFiles(files: TFile[], operation: () => Promise<void>) {
    await this.taskService.processFiles(files, operation);
  }

  registerCalendarAddon() {
    this.registerView(NOESIS_FLOW_CALENDAR_VIEW_TYPE, (leaf) => new NoesisFlowCalendarView(leaf, this));
    this.registerView(NOESIS_FLOW_TIMER_VIEW_TYPE, (leaf) => new NoesisFlowTimerView(leaf, this));
    this.registerView(NOESIS_FLOW_TASK_LIST_VIEW_TYPE, (leaf) => new NoesisFlowTaskListView(leaf, this));
    this.registerView(NOESIS_FLOW_PLANNING_VIEW_TYPE, (leaf) => new NoesisFlowPlanningView(leaf, this));
    this.registerView(NOESIS_FLOW_KANBAN_VIEW_TYPE, (leaf) => new NoesisFlowKanbanView(leaf, this));
    this.registerView(NOESIS_FLOW_RECURRING_VIEW_TYPE, (leaf) => new NoesisFlowRecurringView(leaf, this));
    this.registerView(NOESIS_FLOW_DAILY_BRIEF_VIEW_TYPE, (leaf) => new NoesisFlowDailyBriefView(leaf, this));
    this.registerView(NOESIS_FLOW_TIMELINE_VIEW_TYPE, (leaf) => new NoesisFlowTimelineView(leaf, this));

    this.dailyBriefRibbonIconEl = this.addRibbonIcon("layout-dashboard", "Open Dashboard", () => {
      void this.runCommandSafely(() => this.openDailyBriefView());
    });
    this.calendarRibbonIconEl = this.addRibbonIcon("calendar-days", "Open Calendar", () => {
      void this.runCommandSafely(() => this.openCalendarView());
    });
    this.timerRibbonIconEl = this.addRibbonIcon("timer", "Open Pomodoro Timer", () => {
      void this.runCommandSafely(() => this.openTimerView());
    });
    this.taskListRibbonIconEl = this.addRibbonIcon("table-properties", "Open Task List", () => {
      void this.runCommandSafely(() => this.openTaskListView());
    });
    this.planningRibbonIconEl = this.addRibbonIcon("calendar-range", "Open Monthly Planner", () => {
      void this.runCommandSafely(() => this.openPlanningView());
    });
    this.kanbanRibbonIconEl = this.addRibbonIcon("columns-3", "Open Kanban", () => {
      void this.runCommandSafely(() => this.openKanbanView());
    });
    this.recurringRibbonIconEl = this.addRibbonIcon("repeat-2", "Open recurring tasks", () => {
      void this.runCommandSafely(() => this.openRecurringTaskManager());
    });
    this.timelineRibbonIconEl = this.addRibbonIcon("calendar-clock", "Open Timeline", () => {
      void this.runCommandSafely(() => this.openTimelineView());
    });
    this.updateCalendarRibbonIcon();
  }

  updateCalendarRibbonIcon() {
    if (this.dailyBriefRibbonIconEl) {
      this.dailyBriefRibbonIconEl.style.display = this.settings.dailyBriefAddonEnabled ? "" : "none";
    }
    if (this.calendarRibbonIconEl) {
      this.calendarRibbonIconEl.style.display = this.settings.calendarAddonEnabled ? "" : "none";
    }
    if (this.timerRibbonIconEl) {
      this.timerRibbonIconEl.style.display = this.settings.timerAddonEnabled ? "" : "none";
    }
    if (this.taskListRibbonIconEl) {
      this.taskListRibbonIconEl.style.display = this.settings.taskListAddonEnabled && this.settings.tasksAddonEnabled ? "" : "none";
    }
    if (this.planningRibbonIconEl) {
      this.planningRibbonIconEl.style.display = this.settings.planningAddonEnabled && this.settings.tasksAddonEnabled ? "" : "none";
    }
    if (this.kanbanRibbonIconEl) {
      this.kanbanRibbonIconEl.style.display = this.settings.kanbanTasksAddonEnabled && this.settings.tasksAddonEnabled ? "" : "none";
    }
    if (this.recurringRibbonIconEl) {
      this.recurringRibbonIconEl.style.display = this.settings.tasksAddonEnabled && this.settings.recurringTaskManagerEnabled && this.settings.recurringTasksEnabled ? "" : "none";
    }
    if (this.timelineRibbonIconEl) {
      this.timelineRibbonIconEl.style.display = this.settings.calendarAddonEnabled && this.settings.timelineAddonEnabled ? "" : "none";
    }
  }

  setupViewPlacementTracking() {
    const rememberAll = () => this.rememberVisibleViewPlacements();
    const rememberLeaf = (leaf: WorkspaceLeaf | null) => {
      const type = leaf && leaf.view && typeof leaf.view.getViewType === "function"
        ? leaf.view.getViewType()
        : "";
      if (NOESIS_FLOW_VIEW_TYPES.includes(type)) {
        this.rememberLeafPlacement(type, leaf);
      }
    };

    if (this.app.workspace && typeof this.app.workspace.on === "function") {
      this.registerEvent(this.app.workspace.on("layout-change", rememberAll));
      this.registerEvent(this.app.workspace.on("active-leaf-change", rememberLeaf));
    }

    this.register(() => {
      window.clearTimeout(this.viewPlacementSaveTimer);
    });
  }

  rememberVisibleViewPlacements() {
    for (const type of NOESIS_FLOW_VIEW_TYPES) {
      const leaves = this.app.workspace.getLeavesOfType(type) || [];
      for (const leaf of leaves) {
        this.rememberLeafPlacement(type, leaf);
      }
    }
  }

  getLeafPlacement(leaf: WorkspaceLeaf | null): string {
    const container = leaf && leaf.view && leaf.view.containerEl ? leaf.view.containerEl : null;
    if (!container || typeof container.closest !== "function") return "";
    if (container.closest(".mod-left-split")) return "left";
    if (container.closest(".mod-right-split")) return "right";
    if (container.closest(".mod-root")) return "main";
    return "";
  }

  isMainLeaf(leaf: WorkspaceLeaf | null): boolean {
    return this.getLeafPlacement(leaf) === "main";
  }

  rememberLeafPlacement(type: string, leaf: WorkspaceLeaf): void {
    const placement = this.getLeafPlacement(leaf);
    if (!placement) return;
    if (type === NOESIS_FLOW_DAILY_BRIEF_VIEW_TYPE && placement !== "main") return;

    const current = this.settings.viewPlacements && this.settings.viewPlacements[type];
    if (current === placement) return;

    this.settings.viewPlacements = Object.assign({}, DEFAULT_VIEW_PLACEMENTS, this.settings.viewPlacements || {});
    this.settings.viewPlacements[type] = placement;
    this.scheduleViewPlacementSave();
  }

  scheduleViewPlacementSave() {
    window.clearTimeout(this.viewPlacementSaveTimer);
    this.viewPlacementSaveTimer = window.setTimeout(() => {
      this.saveSettings().catch((error) => console.warn("Noesis Flow: unable to save view placement", error));
    }, 500);
      }

  getPreferredLeafForView(type: string): WorkspaceLeaf {
    const placements = Object.assign({}, DEFAULT_VIEW_PLACEMENTS, this.settings.viewPlacements || {});
    const placement = placements[type] || "right";

    if (placement === "left" && typeof this.app.workspace.getLeftLeaf === "function") {
      return this.app.workspace.getLeftLeaf(false) || this.app.workspace.getLeaf(true);
    }

    if (placement === "main") {
      return this.app.workspace.getLeaf(true);
    }

    if (typeof this.app.workspace.getRightLeaf === "function") {
      return this.app.workspace.getRightLeaf(false) || this.app.workspace.getLeaf(true);
    }

    return this.app.workspace.getLeaf(true);
  }

  getCalendarLeaves() {
    return this.app.workspace.getLeavesOfType(NOESIS_FLOW_CALENDAR_VIEW_TYPE) || [];
  }

  getCalendarView() {
    const leaf = this.getCalendarLeaves()[0];
    if (!leaf) return null;
    return leaf.view instanceof NoesisFlowCalendarView ? leaf.view : null;
  }

  async ensureCalendarView(reveal = true) {
    if (!this.settings.calendarAddonEnabled) {
      new Notice("Enable Calendar in Noesis Flow settings first.");
      return null;
    }

    const existingLeaf = this.getCalendarLeaves()[0];
    if (existingLeaf) {
      if (reveal) await this.app.workspace.revealLeaf(existingLeaf);
      this.rememberLeafPlacement(NOESIS_FLOW_CALENDAR_VIEW_TYPE, existingLeaf);
      return existingLeaf.view instanceof NoesisFlowCalendarView ? existingLeaf.view : null;
    }

    const leaf = this.getPreferredLeafForView(NOESIS_FLOW_CALENDAR_VIEW_TYPE);
    if (!leaf) {
      new Notice("Calendar could not open a sidebar pane.");
      return null;
    }

    await leaf.setViewState({ type: NOESIS_FLOW_CALENDAR_VIEW_TYPE, active: true });
    if (reveal) await this.app.workspace.revealLeaf(leaf);
    this.rememberLeafPlacement(NOESIS_FLOW_CALENDAR_VIEW_TYPE, leaf);
    return leaf.view instanceof NoesisFlowCalendarView ? leaf.view : null;
  }

  async openCalendarView() {
    await this.ensureCalendarView(true);
  }

  async openCalendarForKanbanDrop() {
    if (!this.settings.calendarAddonEnabled) {
      new Notice("Enable Calendar in Noesis Flow settings first.");
      return;
    }

    const existingSidebarLeaf = this.getCalendarLeaves().find((leaf) => !this.isMainLeaf(leaf));
    if (existingSidebarLeaf) {
      await this.app.workspace.revealLeaf(existingSidebarLeaf);
      return;
    }

    const leaf = typeof this.app.workspace.getRightLeaf === "function"
      ? this.app.workspace.getRightLeaf(false)
      : null;
    if (!leaf) {
      new Notice("Calendar could not open a sidebar pane.");
      return;
    }

    await leaf.setViewState({ type: NOESIS_FLOW_CALENDAR_VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }

  async revealCalendarToday() {
    const view = await this.ensureCalendarView(true);
    if (view) view.goToToday();
  }



  getTimerLeaves() {
    return this.app.workspace.getLeavesOfType(NOESIS_FLOW_TIMER_VIEW_TYPE) || [];
  }

  getTimerView() {
    const leaf = this.getTimerLeaves()[0];
    return leaf && leaf.view instanceof NoesisFlowTimerView ? leaf.view : null;
  }

  async ensureTimerView(reveal = true) {
    return await this.ensureView(
      NOESIS_FLOW_TIMER_VIEW_TYPE,
      !!this.settings.timerAddonEnabled,
      "Enable Pomodoro Timer in Noesis Flow settings first.",
      "Pomodoro Timer could not open a sidebar pane.",
      reveal
    ) as NoesisFlowTimerView | null;
  }

  async toggleTimer() {
    const view = await this.ensureTimerView(false);
    if (!view) return;
    if (view.running) view.pause();
    else view.start();
  }

  async skipTimerPeriod() {
    const view = await this.ensureTimerView(false);
    if (view) view.advanceWorkflow();
  }

  async resetTimerPeriod() {
    const view = await this.ensureTimerView(false);
    if (view) view.reset();
  }

  async startNewTimerSession() {
    const view = await this.ensureTimerView(false);
    if (!view) return;
    view.newSession();
    view.start();
  }

  async refreshTimerSoundFiles(refreshViews = false) {
    this.timerSoundFiles = BUILT_IN_TIMER_SOUNDS;
    const soundPath = normalizeTimerSoundPath(this.settings.timerSoundPath);
    if (soundPath !== this.settings.timerSoundPath) {
      this.settings.timerSoundPath = soundPath;
      await this.saveSettings();
      refreshViews = true;
    }
    if (refreshViews) this.refreshTimerViews();
  }

  getTimerSoundFiles() {
    return this.timerSoundFiles || [];
  }

  async createTimerSoundObjectUrl(path: string): Promise<string> {
    if (normalizeTimerSoundPath(path) !== BUILT_IN_SLOW_TICK_SOUND_PATH) {
      throw new Error("Unsupported timer sound.");
    }
    const separatorIndex = bundledSlowTickDataUrl.indexOf(",");
    if (separatorIndex === -1) throw new Error("Invalid bundled timer sound.");

    const header = bundledSlowTickDataUrl.slice(0, separatorIndex);
    const encodedData = bundledSlowTickDataUrl.slice(separatorIndex + 1);
    if (!header.includes(";base64")) throw new Error("Unsupported bundled timer sound encoding.");

    const mimeType = header.match(/^data:([^;,]+)/)?.[1] || "audio/mpeg";
    const binary = atob(encodedData);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return URL.createObjectURL(new Blob([bytes], { type: mimeType }));
  }


  getDailyBriefLeaves() {
    return this.app.workspace.getLeavesOfType(NOESIS_FLOW_DAILY_BRIEF_VIEW_TYPE) || [];
  }


  getKanbanLeaves() {
    return this.app.workspace.getLeavesOfType(NOESIS_FLOW_KANBAN_VIEW_TYPE) || [];
  }

  getTaskListLeaves() {
    return this.app.workspace.getLeavesOfType(NOESIS_FLOW_TASK_LIST_VIEW_TYPE) || [];
  }

  getPlanningLeaves() {
    return this.app.workspace.getLeavesOfType(NOESIS_FLOW_PLANNING_VIEW_TYPE) || [];
  }

  getRecurringTaskManagerLeaves() {
    return this.app.workspace.getLeavesOfType(NOESIS_FLOW_RECURRING_VIEW_TYPE) || [];
  }

  async closeSidebarDailyBriefViews() {
    const leaves = this.getDailyBriefLeaves();
    for (const leaf of leaves) {
      if (!this.isMainLeaf(leaf)) leaf.detach();
    }
  }



  getTimelineLeaves() {
    return this.app.workspace.getLeavesOfType(NOESIS_FLOW_TIMELINE_VIEW_TYPE) || [];
  }

  async ensureView(type: string, enabled: boolean, disabledNotice: string, openNotice: string, reveal = true) {
    if (!enabled) {
      new Notice(disabledNotice);
      return null;
    }

    const existingLeaf = (this.app.workspace.getLeavesOfType(type) || [])[0];
    if (existingLeaf) {
      if (reveal) await this.app.workspace.revealLeaf(existingLeaf);
      this.rememberLeafPlacement(type, existingLeaf);
      return existingLeaf.view || null;
    }

    const leaf = this.getPreferredLeafForView(type);
    if (!leaf) {
      new Notice(openNotice);
      return null;
    }

    await leaf.setViewState({ type, active: true });
    if (reveal) await this.app.workspace.revealLeaf(leaf);
    this.rememberLeafPlacement(type, leaf);
    return leaf.view || null;
  }



  async openTimerView() {
    await this.ensureTimerView(true);
  }


  async openKanbanView() {
    await this.refreshCalendarTaskCounts(false);
    if (!this.settings.kanbanTasksAddonEnabled || !this.settings.tasksAddonEnabled) {
      new Notice("Enable Kanban in Noesis Flow Tasks settings first.");
      return;
    }

    const existingLeaf = this.getKanbanLeaves().find((leaf) => this.isMainLeaf(leaf));
    if (existingLeaf) {
      await this.app.workspace.revealLeaf(existingLeaf);
      this.rememberLeafPlacement(NOESIS_FLOW_KANBAN_VIEW_TYPE, existingLeaf);
      return;
    }

    const leaf = this.app.workspace.getLeaf(true);
    if (!leaf) {
      new Notice("Kanban could not open a note tab.");
      return;
    }

    await leaf.setViewState({ type: NOESIS_FLOW_KANBAN_VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);
    this.rememberLeafPlacement(NOESIS_FLOW_KANBAN_VIEW_TYPE, leaf);
  }

  async openTaskListView() {
    await this.refreshCalendarTaskCounts(false);
    if (!this.settings.taskListAddonEnabled || !this.settings.tasksAddonEnabled) {
      new Notice("Enable Task List in Noesis Flow Tasks settings first.");
      return;
    }
    const existingLeaf = this.getTaskListLeaves().find((leaf) => this.isMainLeaf(leaf));
    if (existingLeaf) {
      await this.app.workspace.revealLeaf(existingLeaf);
      this.rememberLeafPlacement(NOESIS_FLOW_TASK_LIST_VIEW_TYPE, existingLeaf);
      return;
    }
    const leaf = this.app.workspace.getLeaf(true);
    if (!leaf) {
      new Notice("Task List could not open a note tab.");
      return;
    }
    await leaf.setViewState({ type: NOESIS_FLOW_TASK_LIST_VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);
    this.rememberLeafPlacement(NOESIS_FLOW_TASK_LIST_VIEW_TYPE, leaf);
  }

  async openPlanningView() {
    await this.refreshCalendarTaskCounts(false);
    if (!this.settings.planningAddonEnabled || !this.settings.tasksAddonEnabled) {
      new Notice("Enable Monthly Planner in Noesis Flow Tasks settings first.");
      return;
    }
    const existingLeaf = this.getPlanningLeaves().find((leaf) => this.isMainLeaf(leaf));
    if (existingLeaf) {
      await this.app.workspace.revealLeaf(existingLeaf);
      this.rememberLeafPlacement(NOESIS_FLOW_PLANNING_VIEW_TYPE, existingLeaf);
      return;
    }
    const leaf = this.app.workspace.getLeaf(true);
    if (!leaf) {
      new Notice("Monthly Planner could not open a note tab.");
      return;
    }
    await leaf.setViewState({ type: NOESIS_FLOW_PLANNING_VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);
    this.rememberLeafPlacement(NOESIS_FLOW_PLANNING_VIEW_TYPE, leaf);
  }

  async applyKanbanSavedView(saved: KanbanSavedView & { status?: "active" | "completed" }): Promise<boolean> {
    if (!saved || typeof saved !== "object") return false;
    this.settings.kanbanTaskFilter = saved.filter || "all";
    this.settings.kanbanTaskView = saved.view || "sections";
    this.settings.kanbanTaskStatuses = Array.isArray(saved.statuses) ? saved.statuses : [saved.status === "completed" ? "completed" : "active"];
    this.settings.kanbanPriorityFilters = Array.isArray(saved.priorities) ? saved.priorities : ["!", "H", "M", "L", " "];
    this.settings.kanbanUnscheduledFilter = ["auto", "include", "exclude"].includes(saved.unscheduledFilter) ? saved.unscheduledFilter : "auto";


    await this.saveSettings();
    await this.openKanbanView();
    for (const leaf of this.getKanbanLeaves()) {
      if (leaf.view instanceof NoesisFlowKanbanView) {
        leaf.view.searchQuery = saved.search || "";
        leaf.view.render();
      }
    }
    return true;
  }

  async openRecurringTaskManager() {
    if (!this.settings.recurringTasksEnabled || !this.settings.recurringTaskManagerEnabled) {
      new Notice("Enable recurring tasks in Noesis Flow Tasks settings first.");
      return;
    }

    const recovered = await this.recoverRecurringTaskSeries();
    if (recovered) new Notice(`Recovered ${recovered} recurring ${recovered === 1 ? "series" : "series"} from configured task notes.`);

    const existingLeaf = this.getRecurringTaskManagerLeaves().find((leaf) => this.isMainLeaf(leaf));
    if (existingLeaf) {
      await this.app.workspace.revealLeaf(existingLeaf);
      this.rememberLeafPlacement(NOESIS_FLOW_RECURRING_VIEW_TYPE, existingLeaf);
      return;
    }

    const leaf = this.app.workspace.getLeaf(true);
    if (!leaf) {
      new Notice("Recurring tasks could not open a note tab.");
      return;
    }

    await leaf.setViewState({ type: NOESIS_FLOW_RECURRING_VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);
    this.rememberLeafPlacement(NOESIS_FLOW_RECURRING_VIEW_TYPE, leaf);
  }

  async openDailyBriefView() {
    await this.refreshCalendarTaskCounts(false);
    await this.refreshHolidayCalendar(false);
    await this.refreshTimelineEntries(false);
    if (!this.settings.dailyBriefAddonEnabled) {
      new Notice("Enable Dashboard in Noesis Flow settings first.");
      return;
    }

    await this.closeSidebarDailyBriefViews();
    const existingLeaf = this.getDailyBriefLeaves().find((leaf) => this.isMainLeaf(leaf));
    if (existingLeaf) {
      await this.app.workspace.revealLeaf(existingLeaf);
      this.rememberLeafPlacement(NOESIS_FLOW_DAILY_BRIEF_VIEW_TYPE, existingLeaf);
      return;
    }

    const leaf = this.app.workspace.getLeaf(true);
    if (!leaf) {
      new Notice("Dashboard could not open a note tab.");
      return;
    }

    await leaf.setViewState({ type: NOESIS_FLOW_DAILY_BRIEF_VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);
    this.rememberLeafPlacement(NOESIS_FLOW_DAILY_BRIEF_VIEW_TYPE, leaf);
  }



  async openTimelineView() {
    await this.refreshTimelineEntries(false);
    await this.refreshHolidayCalendar(false);
    await this.ensureView(
      NOESIS_FLOW_TIMELINE_VIEW_TYPE,
      !!this.settings.calendarAddonEnabled && !!this.settings.timelineAddonEnabled,
      "Enable Calendar and Timeline in Noesis Flow settings first.",
      "Timeline could not open a sidebar pane."
    );
  }



  getCalendarTaskTargetPath() {
    return normalizeMarkdownPath(this.settings.taskInboxNote || this.settings.calendarTaskTargetNote);
  }

  getTaskSourcePaths() {
    const inbox = this.getCalendarTaskTargetPath();
    const extras = Array.isArray(this.settings.taskSourceNotes) ? this.settings.taskSourceNotes : [];
    const seen = new Set<string>();
    return [inbox, ...extras.map((path) => normalizeMarkdownPath(path))]
      .filter((path) => {
        const cleanPath = String(path || "");
        const key = cleanPath.toLocaleLowerCase();
        if (!cleanPath || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  getProjects(): NoesisFlowProject[] {
    return Array.isArray(this.settings.projects) ? this.settings.projects : [];
  }

  getProjectForTask(task: CalendarTask) {
    return resolveTaskProject(task, this.getProjects()).project;
  }

  getProjectLabel(task: CalendarTask) {
    const resolved = resolveTaskProject(task, this.getProjects());
    return resolved.project?.name || resolved.legacySection || "Unassigned";
  }

  getProjectSectionsForSource(sourcePath: string) {
    return this.getProjects()
      .filter((project) => project.sourcePath === sourcePath)
      .map((project) => project.section);
  }

  findProjectForSection(sourcePath: string, section: string) {
    const normalized = String(section || "").trim().toLocaleLowerCase();
    return this.getProjects().find((project) => project.sourcePath === sourcePath
      && String(project.section || "").trim().toLocaleLowerCase() === normalized);
  }

  async registerProject(sourcePath: string, section: string, name = "") {
    const source = normalizeMarkdownPath(sourcePath);
    const heading = getTaskCaptureSection(section);
    if (!source || !heading || ["inbox", "unassigned"].includes(heading.toLocaleLowerCase())) {
      new Notice("Choose a project heading, not Unassigned.");
      return false;
    }
    const existing = this.findProjectForSection(source, heading);
    if (existing) {
      new Notice("That heading is already registered as a project.");
      return false;
    }
    this.settings.projects.push({
      id: createNoesisFlowProjectId(),
      name: String(name || heading).trim() || heading,
      sourcePath: source,
      section: heading,
      status: "active",
      createdAt: new Date().toISOString()
    });
    await this.saveSettings();
    this.refreshPlanningViews();
    this.refreshTaskListViews();
    this.refreshKanbanViews();
    this.refreshDailyBriefViews();
    new Notice(`Project registered: ${heading}.`);
    return true;
  }

  async updateProject(projectId: string, updates: Partial<NoesisFlowProject>) {
    const project = this.getProjects().find((item) => item.id === projectId);
    if (!project) return false;
    Object.assign(project, updates);
    await this.saveSettings();
    this.refreshPlanningViews();
    this.refreshTaskListViews();
    this.refreshKanbanViews();
    this.refreshDailyBriefViews();
    return true;
  }

  async removeProject(projectId: string) {
    const projects = this.getProjects();
    const next = projects.filter((project) => project.id !== projectId);
    if (next.length === projects.length) return false;
    this.settings.projects = next;
    await this.saveSettings();
    this.refreshPlanningViews();
    this.refreshTaskListViews();
    this.refreshKanbanViews();
    this.refreshDailyBriefViews();
    new Notice("Project registration removed. Existing task lines were left unchanged.");
    return true;
  }

  getCalendarTaskTargetFile(showNotice = true) {
    const path = this.getCalendarTaskTargetPath();
    if (!path) {
      if (showNotice) new Notice("Choose a task note in Noesis Flow Tasks settings first.");
      return null;
    }

    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile && file.extension === "md") return file;

    if (showNotice) new Notice(`Task note not found: ${path}`);
    return null;
  }

  getRecurringTaskTargetPath() {
    return normalizeMarkdownPath(this.settings.recurringTaskTargetNote);
  }

  getRecurringTaskTargetFile(showNotice = true) {
    const path = this.getRecurringTaskTargetPath();
    if (!path) {
      if (showNotice) new Notice("Choose a recurring task note in Noesis Flow Tasks settings first.");
      return null;
    }

    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile && file.extension === "md") return file;

    if (showNotice) new Notice(`Recurring task note not found: ${path}`);
    return null;
  }

  getCalendarTaskSourcePaths(): string[] {
    const paths = this.getTaskSourcePaths();
    if (this.settings.recurringTasksUseSeparateNote) {
      paths.push(this.getRecurringTaskTargetPath());
    }
    return unique(paths.filter(Boolean));
  }

  getCalendarTaskSourceFiles(showNotice = false): TFile[] {
    const files: TFile[] = [];
    for (const path of this.getCalendarTaskSourcePaths()) {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (file instanceof TFile && file.extension === "md") {
        files.push(file);
      } else if (showNotice) {
        new Notice(`Task note not found: ${path}`);
      }
    }
    return files;
  }

  getCalendarTaskFileForTask(task: CalendarTask, showNotice = true): TFile | null {
    const sourcePath = normalizeMarkdownPath(task && task.sourcePath);
    if (sourcePath) {
      const file = this.app.vault.getAbstractFileByPath(sourcePath);
      if (file instanceof TFile && file.extension === "md") return file;

      if (showNotice) new Notice(`Task note not found: ${sourcePath}`);
      return null;
    }

    return this.getCalendarTaskTargetFile(showNotice);
  }

  getHolidayCalendarTargetPath() {
    return normalizeMarkdownPath(this.settings.holidayCalendarNote);
  }

  getTimelineTargetPath() {
    return normalizeMarkdownPath(this.settings.timelineNote);
  }

  getHolidayCalendarTargetFile(showNotice = true) {
    const path = this.getHolidayCalendarTargetPath();
    if (!path) {
      if (showNotice) new Notice("Choose a holiday calendar note in Noesis Flow settings first.");
      return null;
    }

    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile && file.extension === "md") return file;

    if (showNotice) new Notice(`Holiday calendar note not found: ${path}`);
    return null;
  }

  getTimelineTargetFile(showNotice = true) {
    const path = this.getTimelineTargetPath();
    if (!path) {
      if (showNotice) new Notice("Choose a milestones/events note in Noesis Flow settings first.");
      return null;
    }

    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile && file.extension === "md") return file;

    if (showNotice) new Notice(`Milestones/events note not found: ${path}`);
    return null;
  }

  getTimelineEventFile(entry: TimelineEntry, showNotice = true): TFile | null {
    const path = normalizeMarkdownPath(entry && entry.sourcePath) || this.getTimelineTargetPath();
    const file = path ? this.app.vault.getAbstractFileByPath(path) : null;
    if (file instanceof TFile && file.extension === "md") return file;
    if (showNotice) new Notice("Choose a milestones/events note in Noesis Flow settings first.");
    return null;
  }

  async getTimelineEventSections(file: TFile): Promise<string[] | null> {
    try {
      return getMarkdownH2Sections(await this.app.vault.read(file));
    } catch (error) {
      console.error(error);
      new Notice(`Could not read events note: ${file.path}`);
      return null;
    }
  }

  async openTimelineEventEditor(entry: TimelineEntry, onSaved: (() => void | Promise<void>) | null = null): Promise<void> {
    if (!entry || entry.type === "holiday") return;
    const file = this.getTimelineEventFile(entry, true);
    if (!file) return;
    const sections = await this.getTimelineEventSections(file);
    if (!sections) return;
    new NoesisFlowTimelineEventModal(this.app, entry, sections, async (updates) => {
      let changed = false;
      await this.processTaskFile(file, (content) => {
        const result = updateTimelineEventInContent(content, entry, updates, this.settings);
        changed = result.changed;
        return result.content;
      });
      if (!changed) {
        new Notice("Could not find that event. Refreshed Timeline.");
        await this.refreshTimelineEntries(true);
        return;
      }
      await this.refreshTimelineEntries(true);
      if (onSaved) await onSaved();
      new Notice("Event updated.");
    }, "Edit event", async () => {
      let changed = false;
      await this.processTaskFile(file, (content) => {
        const result = deleteTimelineEventInContent(content, entry, this.settings);
        changed = result.changed;
        return result.content;
      });
      if (!changed) {
        new Notice("Could not find that event. Refreshed Timeline.");
        await this.refreshTimelineEntries(true);
        return false;
      }
      await this.refreshTimelineEntries(true);
      if (onSaved) await onSaved();
      new Notice("Event deleted.");
      return true;
    }).open();
  }

  async openTimelineEventCreator(date = moment(), onSaved: (() => void | Promise<void>) | null = null) {
    const file = this.getTimelineTargetFile(true);
    if (!file) return;
    const sections = await this.getTimelineEventSections(file);
    if (!sections) return;
    new NoesisFlowTimelineEventModal(this.app, { dateKey: getCalendarTaskDateKey(date) }, sections, async (event) => {
      await this.processTaskFile(file, (content) => {
        const line = createTimelineEventLine(event.label, event.dateKey, this.settings);
        return insertTimelineEventInSection(content, event.section, line);
      });
      await this.refreshTimelineEntries(true);
      if (onSaved) await onSaved();
      new Notice("Event added.");
    }, "New event").open();
  }

  async openHolidayCreator(date = moment(), onSaved: (() => void | Promise<void>) | null = null) {
    if (!this.settings.holidayCalendarEnabled) {
      new Notice("Enable Holidays in Noesis Flow settings first.");
      return;
    }
    const file = this.getHolidayCalendarTargetFile(true);
    if (!file) return;
    new NoesisFlowTextPromptModal(this.app, "Add holiday", "Holiday name", "", async (label) => {
      await this.processTaskFile(file, (content) => {
        const existing = String(content || "").trimEnd();
        const line = createTimelineEventLine(label, getCalendarTaskDateKey(date), this.settings);
        return `${existing}${existing ? "\n" : ""}${line}\n`;
      });
      await this.refreshHolidayCalendar(true);
      if (onSaved) await onSaved();
      new Notice("Holiday added.");
    }, { submitButtonText: "ADD HOLIDAY" }).open();
  }

  async openHolidaySource() {
    const file = this.getHolidayCalendarTargetFile(true);
    if (!file) return false;
    const leaf = this.app.workspace.getLeaf(true);
    if (!leaf) {
      new Notice("Could not open a note tab.");
      return false;
    }
    await leaf.openFile(file);
    return true;
  }

  getActiveMarkdownFile() {
    const file = this.app.workspace.getActiveFile();
    if (file instanceof TFile && file.extension === "md") return file;
    return null;
  }

  async setTaskInboxNote(path: string) {
    const normalized = normalizeMarkdownPath(path);
    if (!normalized) return false;
    this.settings.taskInboxNote = normalized;
    this.settings.calendarTaskTargetNote = normalized;
    const extras = Array.isArray(this.settings.taskSourceNotes) ? this.settings.taskSourceNotes : [];
    const inboxKey = normalized.toLocaleLowerCase();
    const seen = new Set<string>();
    this.settings.taskSourceNotes = extras
      .map((value) => normalizeMarkdownPath(value))
      .filter((value) => {
        const key = value.toLocaleLowerCase();
        if (!value || key === inboxKey || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    await this.saveSettings();
    await this.refreshCalendarTaskCounts(true);
    return true;
  }

  async addTaskSourceNote(path: string) {
    const normalized = normalizeMarkdownPath(path);
    if (!normalized) return false;
    const inbox = this.getCalendarTaskTargetPath();
    const current = Array.isArray(this.settings.taskSourceNotes) ? this.settings.taskSourceNotes : [];
    const normalizedKey = normalized.toLocaleLowerCase();
    if (normalizedKey === inbox.toLocaleLowerCase() || current.map((value) => normalizeMarkdownPath(value).toLocaleLowerCase()).includes(normalizedKey)) {
      new Notice(`${normalized} is already indexed for tasks.`);
      return false;
    }
    this.settings.taskSourceNotes = unique([...current, normalized]);
    await this.saveSettings();
    await this.refreshCalendarTaskCounts(true);
    new Notice(`Task source added: ${normalized}`);
    return true;
  }

  async removeTaskSourceNote(path: string) {
    const normalized = normalizeMarkdownPath(path);
    if (!normalized || normalized === this.getCalendarTaskTargetPath()) return false;
    const current = Array.isArray(this.settings.taskSourceNotes) ? this.settings.taskSourceNotes : [];
    const next = current.filter((value) => normalizeMarkdownPath(value).toLocaleLowerCase() !== normalized.toLocaleLowerCase());
    if (next.length === current.length) return false;
    this.settings.taskSourceNotes = next;
    await this.saveSettings();
    await this.refreshCalendarTaskCounts(true);
    new Notice(`Task source removed: ${normalized}`);
    return true;
  }

  async createTaskInbox(path = "Tasks.md") {
    const normalized = normalizeMarkdownPath(path);
    if (!normalized) {
      new Notice("Enter a valid Markdown path for the task note.");
      return false;
    }

    const existing = this.app.vault.getAbstractFileByPath(normalized);
    if (existing instanceof TFile && existing.extension === "md") {
      await this.setTaskInboxNote(existing.path);
      new Notice(`Task note set: ${existing.path}`);
      return true;
    }
    if (existing) {
      new Notice(`Cannot create task note: ${normalized} is not a Markdown note.`);
      return false;
    }

    try {
      const file = await this.app.vault.create(normalized, "# Tasks\n\n## Unassigned\n");
      await this.setTaskInboxNote(file.path);
      new Notice(`Task note created: ${file.path}`);
      return true;
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`Could not create task note: ${message}`);
      return false;
    }
  }

  async useActiveNoteAsCalendarTaskTarget() {
    const file = this.getActiveMarkdownFile();
    if (!file) {
      new Notice("Open a markdown note before setting the task note.");
      return false;
    }

    await this.setTaskInboxNote(file.path);
    new Notice(`Task note set: ${file.path}`);
    return true;
  }

  async useActiveNoteAsRecurringTaskTarget() {
    const file = this.getActiveMarkdownFile();
    if (!file) {
      new Notice("Open a markdown note before setting the recurring task note.");
      return false;
    }

    this.settings.recurringTaskTargetNote = file.path;
    await this.saveSettings();
    await this.refreshCalendarTaskCounts(true);
    new Notice(`Recurring task note set: ${file.path}`);
    return true;
  }

  async useActiveNoteAsHolidayCalendarTarget() {
    const file = this.getActiveMarkdownFile();
    if (!file) {
      new Notice("Open a markdown note before setting the holiday calendar note.");
      return false;
    }

    this.settings.holidayCalendarNote = file.path;
    await this.saveSettings();
    await this.refreshHolidayCalendar(true);
    new Notice(`Holiday calendar note set: ${file.path}`);
    return true;
  }

  async useActiveNoteAsTimelineTarget() {
    const file = this.getActiveMarkdownFile();
    if (!file) {
      new Notice("Open a markdown note before setting the milestones/events note.");
      return false;
    }

    this.settings.timelineNote = file.path;
    await this.saveSettings();
    await this.refreshTimelineEntries(true);
    new Notice(`Milestones/events note set: ${file.path}`);
    return true;
  }

  openCalendarTaskCapture(date: Moment, options: TaskCaptureOptions = {}) {
    if (!this.settings.tasksAddonEnabled || !this.settings.calendarTaskCaptureEnabled) return false;
    const file = this.getCalendarTaskTargetFile(true);
    if (!file) return false;

    void this.openTaskCaptureForm(file, date, options)
      .then((opened) => {
        if (!opened && typeof options.onCancel === "function") options.onCancel();
      })
      .catch((error) => console.error("Noesis Flow: unable to open task capture", error));
    return true;
  }

  async openQuickTaskCapture(options: TaskCaptureOptions = {}) {
    if (!this.settings.tasksAddonEnabled) {
      new Notice("Enable Tasks in Noesis Flow settings first.");
      return false;
    }
    const file = this.getCalendarTaskTargetFile(true);
    if (!file) return false;
    const hasInitialDate = "initialDate" in options;
    return await this.openTaskCaptureForm(file, hasInitialDate ? options.initialDate : moment(), {
      defaultUndated: !hasInitialDate,
      defaultRecurrence: options.defaultRecurrence
    });
  }

  async openKanbanQuickTaskCapture() {
    if (!this.settings.tasksAddonEnabled || !this.settings.kanbanTasksAddonEnabled) {
      new Notice("Enable Kanban in Noesis Flow Tasks settings first.");
      return false;
    }

    const file = this.getCalendarTaskTargetFile(true);
    if (!file) return false;

    return await this.openTaskCaptureForm(file, moment());
  }

  async openTaskListQuickTaskCapture() {
    if (!this.settings.tasksAddonEnabled || !this.settings.taskListAddonEnabled) {
      new Notice("Enable Task List in Noesis Flow Tasks settings first.");
      return false;
    }
    const file = this.getCalendarTaskTargetFile(true);
    if (!file) return false;
    return await this.openTaskCaptureForm(file, moment());
  }

  openTaskDetails(task: CalendarTask): void {
    if (!task) return;
    new NoesisFlowTaskDetailsModal(this.app, this, task).open();
  }

  async openTaskSource(task: CalendarTask): Promise<boolean> {
    const file = this.getCalendarTaskFileForTask(task, true);
    if (!file) return false;
    const leaf = this.app.workspace.getLeaf(true);
    if (!leaf) {
      new Notice("Could not open a note tab.");
      return false;
    }
    await leaf.openFile(file);
    const editor = leaf.view instanceof MarkdownView ? leaf.view.editor : null;
    const line = Math.max(0, Number(task && task.lineIndex) || 0);
    if (editor && typeof editor.setCursor === "function") {
      const position = { line, ch: 0 };
      editor.setCursor(position);
      if (typeof editor.scrollIntoView === "function") {
        editor.scrollIntoView({ from: position, to: position }, true);
      }
    }
    return true;
  }

  openCalendarTaskDayDialog(date: Moment): void {
    new NoesisFlowCalendarDayTasksModal(this.app, this, date).open();
  }

  async openRecurringTaskCapture() {
    if (!this.settings.tasksAddonEnabled || !this.settings.recurringTasksEnabled) {
      new Notice("Enable recurring task capture in Noesis Flow Tasks settings first.");
      return false;
    }
    const file = this.getCalendarTaskTargetFile(true);
    if (!file) return false;
    return await this.openTaskCaptureForm(file, moment(), { defaultRecurrence: "weekly" });
  }

  async openTaskCaptureForm(file: TFile, initialDate: Moment | null, options: TaskCaptureOptions = {}) {
    let sections: string[] = [];
    try {
      sections = unique([
        ...getMarkdownH2Sections(await this.app.vault.read(file)),
        ...this.getProjectSectionsForSource(file.path)
      ]);
    } catch (error) {
      console.error(error);
      new Notice(`Could not read task note: ${file.path}`);
      return false;
    }

    new NoesisFlowKanbanTaskModal(
      this.app,
      sections,
      this.settings.recurringTasksEnabled,
      async (task) => {
        const date = task.dateKey ? moment(task.dateKey, "YYYY-MM-DD", true).startOf("day") : null;
        const project = this.findProjectForSection(file.path, task.section);
        await this.appendCalendarTask(
          file,
          task.section,
          task.text,
          { marker: task.marker },
          date,
          task.recurrence,
          Object.assign({}, task.metadata, { projectId: project ? project.id : null })
        );
        if (typeof options.onComplete === "function") options.onComplete();
      },
      {
        initialDate,
        recurrenceLimit: this.settings.recurringTaskOccurrenceLimit,
        defaultRecurrence: options.defaultRecurrence,
        defaultUndated: options.defaultUndated,
        onCancel: options.onCancel
      }
    ).open();
    return true;
  }

  getRecurringTaskSeries(): RecurringTaskSeries[] {
    return Array.isArray(this.settings.recurringTaskSeries) ? this.settings.recurringTaskSeries : [];
  }

  async recoverRecurringTaskSeries(force = false): Promise<number> {
    return this.recurringTaskService.recoverSeriesFromConfiguredSources(force);
  }

  getRecurringTaskDateSettings(overrides: Record<string, unknown> = {}): RecurrenceDateSettings {
    return Object.assign({}, this.settings, overrides, {
      recurringTaskHolidayDates: Array.from(this.holidayCalendarEntries.keys())
    });
  }

  getRecurringTaskSeriesDates(series: RecurringTaskSeries): string[] {
    const recorded = Array.isArray(series && series.occurrenceDates)
      ? series.occurrenceDates.filter((dateKey: string) => moment(dateKey, "YYYY-MM-DD", true).isValid())
      : [];
    if (recorded.length) return Array.from(new Set(recorded)).sort();

    const count = Math.max(1, Math.min(52, Number(series && series.occurrenceCount) || 1));
    const recurrence = Object.assign({}, series && series.recurrence, {
      endMode: "count",
      endCount: count
    });
    return getRecurringTaskDates(series && series.startDate, recurrence, this.getRecurringTaskDateSettings({
      recurringTaskOccurrenceLimit: count
    })).map((date) => getCalendarTaskDateKey(date));
  }

  getRecurringTaskSeriesProgress(series: RecurringTaskSeries): { completedCount: number; plannedCount: number } {
    const completedTasks = [
      ...Array.from(this.getCompletedCalendarTasksByDate().values()).flat(),
      ...this.getCompletedUndatedCalendarTasks(0)
    ];
    const completedCount = completedTasks.filter((task) => task && task.seriesId === series.id).length;
    const plannedCount = this.getRecurringTaskSeriesDates(series).length || Math.max(1, Number(series.occurrenceCount) || 1);
    return { completedCount: Math.min(completedCount, plannedCount), plannedCount };
  }

  getRecurringTaskSeriesUpcomingDates(series: RecurringTaskSeries, limit = 3): Moment[] {
    const today = moment().startOf("day");
    return this.getRecurringTaskSeriesDates(series)
      .map((dateKey) => moment(dateKey, "YYYY-MM-DD", true).startOf("day"))
      .filter((date) => date.isValid() && !date.isBefore(today, "day"))
      .slice(0, Math.max(1, limit));
  }

  async openRecurringTaskSeriesEditor(series: RecurringTaskSeries): Promise<void> {
    new NoesisFlowRecurringSeriesModal(this.app, series, this.settings.recurringTaskOccurrenceLimit, async (updates) => {
      await this.updateRecurringTaskSeries(series.id, updates);
      new Notice("Recurring task updated.");
    }).open();
  }

  async updateRecurringTaskSeries(seriesId: string, updates: Partial<RecurringTaskSeries>): Promise<boolean> {
    return this.recurringTaskService.updateSeries(seriesId, updates);
  }

  async extendRecurringTaskSeries(seriesId: string, amount = this.settings.recurringTaskOccurrenceLimit): Promise<number> {
    return this.recurringTaskService.extendSeries(seriesId, amount);
  }

  async maintainRecurringTaskSeriesHorizon(force = false): Promise<number> {
    return this.recurringTaskService.maintainHorizon(force);
  }

  async maintainRecurringTaskSeries(series: RecurringTaskSeries): Promise<number> {
    return this.recurringTaskService.maintainSeries(series);
  }

  async setRecurringTaskSeriesStatus(seriesId: string, status: "active" | "paused"): Promise<boolean> {
    return this.recurringTaskService.setSeriesStatus(seriesId, status);
  }

  async removeRecurringTaskSeries(seriesId: string): Promise<boolean> {
    return this.recurringTaskService.removeSeries(seriesId);
  }

  async appendCalendarTask(
    file: TFile,
    sectionName: string,
    taskText: string,
    priority: { marker: string },
    date: Moment | null,
    recurrence: RecurringTaskRecurrence = { rule: "none" },
    metadata: CalendarTaskMetadata = {}
  ) {
    const section = getTaskCaptureSection(sectionName);
    const cleanTaskText = normalizeCalendarTaskText(taskText);
    if (!section || !cleanTaskText) return;

    const recurrenceRule = recurrence && recurrence.rule ? recurrence.rule : "none";
    const seriesId = recurrenceRule !== "none" ? `series-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}` : "";
    const recurringTarget = recurrenceRule !== "none" && this.settings.recurringTasksUseSeparateNote
      ? this.getRecurringTaskTargetFile(true)
      : null;
    if (recurrenceRule !== "none" && this.settings.recurringTasksUseSeparateNote && !recurringTarget) return;

    const currentFile = recurringTarget ? null : this.getCalendarTaskTargetFile(true);
    const targetFile = recurringTarget || (currentFile && file && currentFile.path === file.path ? currentFile : file);
    if (!(targetFile instanceof TFile)) {
      new Notice("Choose a task note in Noesis Flow Tasks settings first.");
      return;
    }

    const externalDuplicateKeys = new Set<string>();
    const sourceFiles = this.getCalendarTaskSourceFiles(false);
    if (!sourceFiles.some((sourceFile) => sourceFile.path === targetFile.path)) {
      sourceFiles.push(targetFile);
    }

    for (const sourceFile of sourceFiles) {
      if (sourceFile.path === targetFile.path) continue;
      try {
        const sourceContent = await this.app.vault.read(sourceFile);
        for (const key of getCalendarTaskDuplicateKeys(sourceContent, this.settings)) {
          externalDuplicateKeys.add(key);
        }
      } catch (error) {
        console.error(error);
      }
    }

    const taskDates = !date && recurrenceRule === "none" ? [null] : getRecurringTaskDates(date, recurrence, this.getRecurringTaskDateSettings());
    let taskLines: string[] = [];
    const addedDateKeys: string[] = [];

    await this.processTaskFile(targetFile, (content) => {
      const existingKeys = new Set(externalDuplicateKeys);
      for (const key of getCalendarTaskDuplicateKeys(content, this.settings)) {
        existingKeys.add(key);
      }

      const nextTaskLines: string[] = [];
      for (const taskDate of taskDates) {
        const dateKey = taskDate ? getCalendarTaskDateKey(taskDate) : "";
        const duplicateKey = `${section.toLowerCase()}\t${dateKey}\t${cleanTaskText.toLowerCase()}`;
        if (existingKeys.has(duplicateKey)) continue;
        existingKeys.add(duplicateKey);
        nextTaskLines.push(createCalendarTaskLine(cleanTaskText, priority, dateKey, this.settings, Object.assign({}, metadata, { seriesId, taskId: createCalendarTaskId() })));
        addedDateKeys.push(dateKey);
      }

      taskLines = nextTaskLines;
      if (!nextTaskLines.length) return content;
      return insertCalendarTasksInSection(content, section, nextTaskLines);
    });

    if (!taskLines.length) {
      await this.refreshCalendarTaskCounts(true);
      new Notice("No new task dates were added.");
      return;
    }

    if (seriesId) {
      const series: RecurringTaskSeries = {
        id: seriesId,
        text: cleanTaskText,
        section,
        marker: priority && priority.marker !== undefined ? String(priority.marker) : " ",
        sourcePath: targetFile.path,
        startDate: getCalendarTaskDateKey(date),
        recurrence: Object.assign({}, recurrence),
        metadata: Object.assign({}, metadata),
        occurrenceCount: taskLines.length,
        occurrenceDates: addedDateKeys,
        status: "active",
        createdAt: new Date().toISOString()
      };
      this.settings.recurringTaskSeries = [...this.getRecurringTaskSeries(), series];
      await this.saveSettings();
      this.refreshRecurringTaskManagerViews();
    }

    await this.refreshCalendarTaskCounts(true);
    await this.writeTaskAudit("Created", {
      text: cleanTaskText,
      section,
      dateKey: addedDateKeys[0] || "",
      marker: priority && priority.marker
    }, taskLines.length > 1 ? `${taskLines.length} occurrences` : "");

    const dateLabel = date && typeof date.format === "function" ? date.format("MMM D") : "undated";
    const recurrenceLabel = getRecurringTaskLabel(recurrence);
    const repeatText = recurrenceLabel && taskLines.length > 1 ? ` (${taskLines.length} ${recurrenceLabel} dates)` : "";
    new Notice(`Added ${dateLabel} task to ${section}${repeatText}.`);
  }

  /** Task workflow facade retained for existing views and commands. */
  getTaskMutationHistory(): TaskUndoEntry[] {
    return this.taskMutationService.getTaskMutationHistory();
  }

  async runTaskUndo(entry: TaskUndoEntry): Promise<boolean> {
    return this.taskMutationService.runTaskUndo(entry);
  }

  async writeTaskAudit(action: string, task: Partial<CalendarTask>, details = ""): Promise<void> {
    await this.taskMutationService.writeTaskAudit(action, task, details);
  }

  async restoreDeletedCalendarTask(task: CalendarTask, audit = true): Promise<boolean> {
    return this.taskMutationService.restoreDeletedCalendarTask(task, audit);
  }

  async skipRecurringTaskOccurrence(task: CalendarTask): Promise<boolean> {
    return this.taskMutationService.skipRecurringTaskOccurrence(task);
  }

  async completeCalendarTask(task: CalendarTask, options: TaskMutationOptions = {}): Promise<boolean> {
    return this.taskMutationService.completeCalendarTask(task, options);
  }

  async deleteCalendarTask(task: CalendarTask, options: TaskMutationOptions = {}): Promise<boolean> {
    return this.taskMutationService.deleteCalendarTask(task, options);
  }

  requestCalendarTaskDelete(task: CalendarTask): void {
    new NoesisFlowConfirmModal(this.app, {
      title: "Delete task",
      message: `Delete "${task.text || "this task"}"?`,
      confirmLabel: "Delete task",
      onConfirm: () => this.deleteCalendarTask(task)
    }).open();
  }

  async moveCalendarTaskToSource(task: CalendarTask, targetPath: string, updates: TaskUpdates = {}, options: TaskMutationOptions = {}): Promise<boolean> {
    return this.taskMutationService.moveCalendarTaskToSource(task, targetPath, updates, options);
  }

  async reorderKanbanTasks(task: CalendarTask, beforeTask: CalendarTask): Promise<boolean> {
    return this.taskMutationService.reorderKanbanTasks(task, beforeTask);
  }

  async updateCalendarTask(task: CalendarTask, updates: TaskUpdates, noticeText = "Task updated.", options: TaskMutationOptions = {}): Promise<boolean> {
    return this.taskMutationService.updateCalendarTask(task, updates, noticeText, options);
  }

  openCalendarTaskDateEditor(task: CalendarTask): void {
    new NoesisFlowTextPromptModal(
      this.app,
      "Schedule task",
      "YYYY-MM-DD",
      task && task.dateKey ? task.dateKey : moment().format("YYYY-MM-DD"),
      async (dateText) => {
        const dateKey = String(dateText || "").trim();
        if (!moment(dateKey, "YYYY-MM-DD", true).isValid()) {
          new Notice("Use date format YYYY-MM-DD.");
          return;
        }
        await this.updateCalendarTask(task, { dateKey }, `Task moved to ${moment(dateKey, "YYYY-MM-DD").format("MMM D")}.`);
      },
      {
        requiredMessage: "Date is required.",
        submitButtonText: "Save"
      }
    ).open();
  }

  openCalendarTaskPriorityEditor(task: CalendarTask): void {
    new NoesisFlowCalendarPriorityModal(this.app, async (priority) => {
      await this.updateCalendarTask(task, { marker: priority.marker }, "Task priority updated.");
    }).open();
  }

  openCalendarTaskRenameEditor(task: CalendarTask): void {
    new NoesisFlowTextPromptModal(
      this.app,
      "Task name",
      "Task",
      task && task.text ? task.text : "",
      async (text) => {
        const nextText = normalizeCalendarTaskText(text);
        if (!nextText) {
          new Notice("Task name is required.");
          return;
        }
        await this.updateCalendarTask(task, { text: nextText }, "Task renamed.");
      },
      {
        requiredMessage: "Task name is required.",
        submitButtonText: "Save"
      }
    ).open();
  }

  async openCalendarTaskSectionEditor(task: CalendarTask): Promise<void> {
    const file = this.getCalendarTaskFileForTask(task, true);
    if (!file) return;

    let sections: string[] = [];
    try {
      const content = await this.app.vault.read(file);
      sections = getMarkdownH2Sections(content);
    } catch (error) {
      console.error(error);
      new Notice(`Could not read task note: ${file.path}`);
      return;
    }

    new NoesisFlowCalendarSectionModal(this.app, sections, async (section) => {
      await this.updateCalendarTask(task, { section }, `Task moved to ${section}.`);
    }, {
      title: "Edit task project",
      defaultValue: task && task.section ? task.section : "",
      submitButtonText: "Save"
    }).open();
  }

  setupCalendarTaskCounts() {
    const refreshForFile = (file: TFile | null) => {
      const targetPaths = this.getCalendarTaskSourcePaths();
      if (!targetPaths.length || !file || targetPaths.includes(file.path)) {
        if (file?.path) this.taskService.invalidate(file.path);
      this.taskRefreshScheduler.schedule();
      }
    };

    if (this.app.metadataCache && typeof this.app.metadataCache.on === "function") {
      this.registerEvent(this.app.metadataCache.on("changed", refreshForFile));
    }

    if (this.app.vault && typeof this.app.vault.on === "function") {
      this.registerEvent(this.app.vault.on("delete", () => {
        this.taskService.invalidateAll();
        this.taskRefreshScheduler.schedule();
      }));
      this.registerEvent(this.app.vault.on("rename", () => {
        this.taskService.invalidateAll();
        this.taskRefreshScheduler.schedule();
      }));
    }
  }

  async refreshCalendarTaskCounts(refreshViews = false) {
    const shouldReadTasks = !!this.settings.tasksAddonEnabled
      && (!!this.settings.calendarShowTaskCounts
        || !!this.settings.kanbanTasksAddonEnabled
        || !!this.settings.taskListAddonEnabled
        || !!this.settings.planningAddonEnabled
        || !!this.settings.dailyBriefAddonEnabled);
    const files = shouldReadTasks ? this.getCalendarTaskSourceFiles(false) : [];
    const taskIndex = await this.taskService.refresh(files, this.settings);
    const nextCounts = taskIndex.counts;
    const nextTasksByDate = taskIndex.tasksByDate;
    const nextUndatedTasks = taskIndex.undatedTasks;
    const nextCompletedTasksByDate = taskIndex.completedTasksByDate;
    const nextCompletedUndatedTasks = taskIndex.completedUndatedTasks;

    const signature = getTaskRepositoryIndexSignature(taskIndex);
    if (signature === this.calendarTaskCountsSignature) return;

    this.calendarTaskCounts = nextCounts;
    this.calendarTasksByDate = nextTasksByDate;
    this.calendarUndatedTasks = nextUndatedTasks;
    this.completedCalendarTasksByDate = nextCompletedTasksByDate;
    this.completedCalendarUndatedTasks = nextCompletedUndatedTasks;
    this.calendarTaskCountsSignature = signature;
    if (refreshViews) {
      this.refreshCalendarViews();
      this.refreshTaskListViews();
      this.refreshPlanningViews();
      this.refreshKanbanViews();
      this.refreshDailyBriefViews();
    }
  }

  getCalendarTaskSignalForDate(date: MomentInput) {
    if (!this.settings.tasksAddonEnabled || !this.settings.calendarShowTaskCounts || !this.calendarTaskCounts) {
      return getCalendarTaskSignal(null, this.settings, date);
    }
    return getCalendarTaskSignal(this.calendarTaskCounts.get(getCalendarTaskDateKey(date)), this.settings, date);
  }

  getCalendarTasksForDate(date: MomentInput): CalendarTask[] {
    if (!this.settings.tasksAddonEnabled || !this.calendarTasksByDate) return [];
    return this.calendarTasksByDate.get(getCalendarTaskDateKey(date)) || [];
  }

  getTodayCalendarTasks() {
    return this.getCalendarTasksForDate(moment());
  }

  getDateTaskGroups(filter: DateTaskFilter = "today", today: Moment = moment()) {
    if (!this.settings.tasksAddonEnabled || !this.calendarTasksByDate) return [];
    const actionableTasksByDate = new Map<string, CalendarTask[]>();
    for (const task of this.getTaskQuery(today).actionable) {
      if (!task.dateKey) continue;
      const tasks = actionableTasksByDate.get(task.dateKey) || [];
      tasks.push(task);
      actionableTasksByDate.set(task.dateKey, tasks);
    }
    return getDateTaskGroups(actionableTasksByDate, Object.assign({}, this.settings, { taskDateFilter: filter }), today);
  }

  getOverdueCalendarTasks(limit = 6) {
    return this.getTaskQuery().pastScheduled.slice(0, limit);
  }

  getTaskQuery(today = moment().startOf("day")) {
    const active = [
      ...Array.from(this.calendarTasksByDate?.values?.() || []).flat(),
      ...(this.calendarUndatedTasks || [])
    ];
    const completed = [
      ...Array.from(this.getCompletedCalendarTasksByDate().values()).flat(),
      ...this.getCompletedUndatedCalendarTasks(0)
    ];
    return queryTasks(active, completed, this.getProjects(), today, {
      staleDays: 14,
      dueSoonDays: 7
    });
  }

  getUndatedCalendarTasks(limit = 12) {
    if (!this.settings.tasksAddonEnabled || !Array.isArray(this.calendarUndatedTasks)) return [];
    const tasks = this.getTaskQuery().actionable.filter((task) => !task.dateKey);
    return limit && Number.isFinite(limit) ? tasks.slice(0, limit) : tasks;
  }

  getCompletedCalendarTasksByDate(): Map<string, CalendarTask[]> {
    return this.completedCalendarTasksByDate || new Map<string, CalendarTask[]>();
  }

  getCompletedUndatedCalendarTasks(limit = 12): CalendarTask[] {
    const tasks = Array.isArray(this.completedCalendarUndatedTasks) ? this.completedCalendarUndatedTasks.slice() : [];
    return limit && Number.isFinite(limit) ? tasks.slice(0, limit) : tasks;
  }

  getTaskHealth() {
    const configuredPaths = this.getCalendarTaskSourcePaths();
    const missingSources = configuredPaths.filter((path) => !this.app.vault.getAbstractFileByPath(path));
    return {
      configuredSources: configuredPaths.length,
      missingSources,
      sourceErrors: Array.from(this.taskService.getSourceErrors().entries())
    };
  }

  async repairTaskIndex() {
    this.taskService.invalidateAll();
    await this.refreshCalendarTaskCounts(true);
    const health = this.getTaskHealth();
    if (health.missingSources.length || health.sourceErrors.length) {
      new Notice("Task index refreshed, but one or more sources still need attention.");
      return false;
    }
    new Notice(`Task index refreshed for ${health.configuredSources} source${health.configuredSources === 1 ? "" : "s"}.`);
    return true;
  }

  setupHolidayCalendar() {
    const refreshForFile = (file: TFile | null) => {
      const targetPath = this.getHolidayCalendarTargetPath();
      if (!targetPath || !file || file.path === targetPath) this.holidayRefreshScheduler.schedule();
    };

    if (this.app.metadataCache && typeof this.app.metadataCache.on === "function") {
      this.registerEvent(this.app.metadataCache.on("changed", refreshForFile));
    }

    if (this.app.vault && typeof this.app.vault.on === "function") {
      this.registerEvent(this.app.vault.on("delete", () => this.holidayRefreshScheduler.schedule()));
      this.registerEvent(this.app.vault.on("rename", () => this.holidayRefreshScheduler.schedule()));
    }
  }

  async refreshHolidayCalendar(refreshViews = false) {
    const nextEntries = new Map<string, string[]>();
    const file = this.settings.holidayCalendarEnabled ? this.getHolidayCalendarTargetFile(false) : null;

    if (file) {
      try {
        const content = await this.app.vault.read(file);
        for (const [dateKey, entries] of parseHolidayEntries(content, this.settings).entries()) {
          nextEntries.set(dateKey, entries);
        }
      } catch (error) {
        console.error(error);
      }
    }

    const signature = serializeHolidayEntries(nextEntries);
    if (signature === this.holidayCalendarSignature) return;

    this.holidayCalendarEntries = nextEntries;
    this.holidayCalendarSignature = signature;
    if (refreshViews) {
      this.refreshCalendarViews();
      this.refreshDailyBriefViews();
      this.refreshTimelineViews();
    }
  }

  getHolidayEntriesForDate(date: MomentInput): string[] {
    if (!this.settings.holidayCalendarEnabled || !this.holidayCalendarEntries) return [];
    return this.holidayCalendarEntries.get(getCalendarTaskDateKey(date)) || [];
  }



  setupTimelineEvents() {
    const refreshForFile = (file: TFile | null) => {
      const targetPath = this.getTimelineTargetPath();
      if (!targetPath || !file || file.path === targetPath) this.timelineRefreshScheduler.schedule();
    };

    if (this.app.metadataCache && typeof this.app.metadataCache.on === "function") {
      this.registerEvent(this.app.metadataCache.on("changed", refreshForFile));
    }

    if (this.app.vault && typeof this.app.vault.on === "function") {
      this.registerEvent(this.app.vault.on("delete", () => this.timelineRefreshScheduler.schedule()));
      this.registerEvent(this.app.vault.on("rename", () => this.timelineRefreshScheduler.schedule()));
    }
  }

  async refreshTimelineEntries(refreshViews = false) {
    let nextEntries: TimelineEntry[] = [];
    const shouldReadEvents = !!this.settings.calendarEventsEnabled
      || !!this.settings.timelineAddonEnabled
      || !!this.settings.dailyBriefAddonEnabled;
    const file = shouldReadEvents ? this.getTimelineTargetFile(false) : null;

    if (file) {
      try {
        const content = await this.app.vault.read(file);
        nextEntries = parseTimelineEntries(content, this.settings, file.path);
      } catch (error) {
        console.error(error);
      }
    }

    const signature = serializeTimelineEntries(nextEntries);
    if (signature === this.timelineSignature) return;

    this.timelineEntries = nextEntries;
    this.timelineSignature = signature;
    if (refreshViews) {
      this.refreshCalendarViews();
      this.refreshTimelineViews();
      this.refreshDailyBriefViews();
    }
  }

  getTimelineEntries() {
    return getTimelineEntries(this.timelineEntries, this.holidayCalendarEntries, this.settings, moment());
  }

  getCalendarEventsForDate(date: MomentInput): TimelineEntry[] {
    if (!this.settings.calendarEventsEnabled || !Array.isArray(this.timelineEntries)) return [];
    const dateKey = getCalendarTaskDateKey(date);
    return this.timelineEntries.filter((entry) => entry && entry.dateKey === dateKey);
  }

  getCalendarEventColor() {
    return sanitizeCssText(this.settings.calendarEventColor, "#eab308");
  }

  getTimerSummary() {
    const timerLeaf = this.getTimerLeaves().find((leaf) => leaf.view instanceof NoesisFlowTimerView);
    const timerView = timerLeaf && timerLeaf.view instanceof NoesisFlowTimerView ? timerLeaf.view : null;
    if (timerView) {
      const mode = typeof timerView.getModeLabel === "function" ? timerView.getModeLabel() : "Focus";
      const state = timerView.running ? "running" : "paused";
      const cycle = typeof timerView.getCycleText === "function" ? ` - ${timerView.getCycleText()}` : "";
      return `${mode} ${state}${cycle} - ${timerView.formatTime(timerView.remainingSeconds)}`;
    }

    const stored = this.settings.timerSessionState;
    if (stored && typeof stored === "object") {
      const mode = normalizePomodoroMode(stored.mode);
      const label = mode === "break" ? "Short Break" : mode === "long-break" ? "Long Break" : "Focus";
      const running = !!stored.running;
      const remaining = running && Number(stored.endsAt)
        ? Math.max(0, Math.ceil((Number(stored.endsAt) - Date.now()) / 1000))
        : Math.max(0, Math.round(Number(stored.remainingSeconds) || 0));
      const minutes = Math.floor(remaining / 60);
      const seconds = remaining % 60;
      const time = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
      if (running && remaining <= 0) return `${label} complete - open Pomodoro Timer`;
      return `${label} ${running ? "running" : "paused"} - ${time}`;
    }

    const focusMinutes = clampNumber(this.settings.timerFocusMinutes, 1, 240, 25);
    return `Pomodoro ready - ${focusMinutes}m focus`;
  }

  refreshCalendarViews() {
    for (const leaf of this.getCalendarLeaves()) {
      if (leaf.view instanceof NoesisFlowCalendarView) {
        leaf.view.render();
      }
    }
  }



  refreshTimerViews() {
    for (const leaf of this.getTimerLeaves()) {
      if (leaf.view instanceof NoesisFlowTimerView) {
        leaf.view.render();
      }
    }
  }


  refreshKanbanViews() {
    for (const leaf of this.getKanbanLeaves()) {
      if (leaf.view instanceof NoesisFlowKanbanView) {
        leaf.view.render();
      }
    }
  }

  refreshTaskListViews() {
    for (const leaf of this.getTaskListLeaves()) {
      if (leaf.view instanceof NoesisFlowTaskListView) leaf.view.render();
    }
  }

  refreshPlanningViews() {
    for (const leaf of this.getPlanningLeaves()) {
      if (leaf.view instanceof NoesisFlowPlanningView) leaf.view.render();
    }
  }

  refreshRecurringTaskManagerViews() {
    for (const leaf of this.getRecurringTaskManagerLeaves()) {
      if (leaf.view instanceof NoesisFlowRecurringView) leaf.view.render();
    }
  }

  refreshDailyBriefViews() {
    for (const leaf of this.getDailyBriefLeaves()) {
      if (leaf.view instanceof NoesisFlowDailyBriefView) {
        leaf.view.render();
      }
    }
  }





  refreshTimelineViews() {
    for (const leaf of this.getTimelineLeaves()) {
      if (leaf.view instanceof NoesisFlowTimelineView) {
        leaf.view.render();
      }
    }
  }

  async closeCalendarViews() {
    for (const leaf of this.getCalendarLeaves()) leaf.detach();
  }



  async closeTimerViews() {
    for (const leaf of this.getTimerLeaves()) leaf.detach();
  }


  async closeKanbanViews() {
    for (const leaf of this.getKanbanLeaves()) leaf.detach();
  }

  async closeTaskListViews() {
    for (const leaf of this.getTaskListLeaves()) leaf.detach();
  }

  async closePlanningViews() {
    for (const leaf of this.getPlanningLeaves()) leaf.detach();
  }

  async closeRecurringTaskManagerViews() {
    for (const leaf of this.getRecurringTaskManagerLeaves()) leaf.detach();
  }

  async closeDailyBriefViews() {
    for (const leaf of this.getDailyBriefLeaves()) leaf.detach();
  }





  async closeTimelineViews() {
    for (const leaf of this.getTimelineLeaves()) leaf.detach();
  }

  async updateCalendarAddonState() {
    this.updateCalendarRibbonIcon();
    if (!this.settings.calendarAddonEnabled) {
      await this.closeCalendarViews();
      await this.closeTimelineViews();
      return;
    }
    await this.refreshTimelineEntries(true);
    this.refreshCalendarViews();
  }



  async updateTimerAddonState() {
    this.updateCalendarRibbonIcon();
    if (!this.settings.timerAddonEnabled) {
      await this.closeTimerViews();
      return;
    }
    this.refreshTimerViews();
  }


  async updateKanbanAddonState() {
    this.updateCalendarRibbonIcon();
    if (!this.settings.kanbanTasksAddonEnabled || !this.settings.tasksAddonEnabled) {
      await this.closeKanbanViews();
      return;
    }
    await this.refreshCalendarTaskCounts(true);
  }

  async updateTaskListAddonState() {
    this.updateCalendarRibbonIcon();
    if (!this.settings.taskListAddonEnabled || !this.settings.tasksAddonEnabled) {
      await this.closeTaskListViews();
      return;
    }
    await this.refreshCalendarTaskCounts(true);
  }

  async updatePlanningAddonState() {
    this.updateCalendarRibbonIcon();
    if (!this.settings.planningAddonEnabled || !this.settings.tasksAddonEnabled) {
      await this.closePlanningViews();
      return;
    }
    await this.refreshCalendarTaskCounts(true);
  }

  async updateRecurringTaskManagerState() {
    this.updateCalendarRibbonIcon();
    if (!this.settings.tasksAddonEnabled || !this.settings.recurringTasksEnabled || !this.settings.recurringTaskManagerEnabled) {
      await this.closeRecurringTaskManagerViews();
      return;
    }
    this.refreshRecurringTaskManagerViews();
  }

  async updateDailyBriefAddonState() {
    this.updateCalendarRibbonIcon();
    if (!this.settings.dailyBriefAddonEnabled) {
      await this.closeDailyBriefViews();
      return;
    }
    await this.refreshCalendarTaskCounts(true);
    await this.refreshHolidayCalendar(true);
    await this.refreshTimelineEntries(true);
    this.refreshDailyBriefViews();
  }







  async updateTimelineAddonState() {
    this.updateCalendarRibbonIcon();
    if (!this.settings.calendarAddonEnabled || !this.settings.timelineAddonEnabled) {
      await this.closeTimelineViews();
      return;
    }
    await this.refreshTimelineEntries(true);
    this.refreshTimelineViews();
  }



  registerCommands() {
    this.addCommand({
      id: "open-settings",
      name: "Open settings",
      callback: () => this.openSettingsTab()
    });

    const taskCoreEnabled = () => !!this.settings.tasksAddonEnabled;
    const calendarEnabled = () => !!this.settings.calendarAddonEnabled;
    const timerEnabled = () => !!this.settings.timerAddonEnabled;
    this.addModuleCommand("new-task", "New task", taskCoreEnabled, () => this.openQuickTaskCapture());
    this.addModuleCommand("new-task-for-today", "New task for today", taskCoreEnabled, () => this.openQuickTaskCapture({ initialDate: moment() }));
    this.addModuleCommand("capture-to-inbox", "Capture task", taskCoreEnabled, () => this.openQuickTaskCapture());
    this.addModuleCommand("open-calendar", "Open Calendar", calendarEnabled, () => this.openCalendarView());
    this.addModuleCommand("calendar-today", "Show today in Calendar", calendarEnabled, () => this.revealCalendarToday());
    this.addModuleCommand("open-daily-brief", "Open Dashboard", () => !!this.settings.dailyBriefAddonEnabled, () => this.openDailyBriefView());
    this.addModuleCommand("open-timer", "Open Pomodoro Timer", timerEnabled, () => this.openTimerView());
    this.addModuleCommand("toggle-timer", "Start or pause Pomodoro Timer", timerEnabled, () => this.toggleTimer());
    this.addModuleCommand("skip-timer-period", "Skip current Pomodoro period", timerEnabled, () => this.skipTimerPeriod());
    this.addModuleCommand("reset-timer-period", "Reset current Pomodoro period", timerEnabled, () => this.resetTimerPeriod());
    this.addModuleCommand("new-timer-session", "Start new Pomodoro session", timerEnabled, () => this.startNewTimerSession());
    this.addModuleCommand("open-kanban", "Open Kanban", () => taskCoreEnabled() && !!this.settings.kanbanTasksAddonEnabled, () => this.openKanbanView());
    this.addModuleCommand("open-task-list", "Open Task List", () => taskCoreEnabled() && !!this.settings.taskListAddonEnabled, () => this.openTaskListView());
    this.addModuleCommand("open-planning", "Open Monthly Planner", () => taskCoreEnabled() && !!this.settings.planningAddonEnabled, () => this.openPlanningView());
    this.addModuleCommand("open-recurring-tasks", "Open recurring tasks", () => taskCoreEnabled() && !!this.settings.recurringTasksEnabled && !!this.settings.recurringTaskManagerEnabled, () => this.openRecurringTaskManager());
    this.addModuleCommand("open-timeline", "Open Timeline", () => calendarEnabled() && !!this.settings.timelineAddonEnabled, () => this.openTimelineView());

  }

  async runCommandSafely(callback: () => void | Promise<unknown>) {
    try {
      await callback();
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`Noesis Flow command failed: ${message}`);
    }
  }

  addModuleCommand(id: string, name: string, isEnabled: () => boolean, callback: () => void | Promise<unknown>) {
    this.addCommand({
      id,
      name,
      checkCallback: (checking) => {
        if (!isEnabled()) return false;
        if (!checking) void this.runCommandSafely(callback);
        return true;
      }
    });
  }

  openSettingsTab() {
    const settingApp = this.app as unknown as ObsidianSettingsApp;
    if (!settingApp.setting) {
      new Notice("Open Settings, then Noesis Flow.");
      return;
    }
    settingApp.setting.open();
    settingApp.setting.openTabById(this.manifest.id);
  }

  onunload(): void {
    void this.closeCalendarViews();
    void this.closeTimerViews();
    void this.closeTaskListViews();
    void this.closePlanningViews();
    void this.closeKanbanViews();
    void this.closeRecurringTaskManagerViews();
    void this.closeDailyBriefViews();
    void this.closeTimelineViews();
  }

  async loadSettings() {
    const loaded: unknown = await this.loadData();
    const rawSettings = isRecord(loaded) ? loaded : {};

    this.settings = Object.assign({}, DEFAULT_SETTINGS, sanitizeSettingsSnapshot(loaded));
    normalizeSettingsSchema(this.settings, loaded);
    if (!["tag", "double-hash"].includes(this.settings.dateMarkerStyle)) {
      this.settings.dateMarkerStyle = "tag";
    }
    if (!["classic", "centered-weekdays"].includes(this.settings.calendarLayoutStyle)) {
      this.settings.calendarLayoutStyle = "classic";
    }
    this.settings.calendarHeaderDateScale = clampNumber(this.settings.calendarHeaderDateScale, 0.95, 1.5, 1);
    this.settings.calendarDateNumberScale = clampNumber(this.settings.calendarDateNumberScale, 0.7, 1.05, 0.8);
    this.settings.calendarSelectedDateRadius = clampNumber(this.settings.calendarSelectedDateRadius, 0, 12, 6);
    this.settings.calendarQuarterRailSpacing = clampNumber(this.settings.calendarQuarterRailSpacing, 0, 18, 4);
    this.settings.calendarOverflowDateOpacity = clampNumber(this.settings.calendarOverflowDateOpacity, 0.05, 0.7, 0.25);
    this.settings.calendarWeekendTintStrength = clampNumber(this.settings.calendarWeekendTintStrength, 0, 12, 6);
    this.settings.calendarWeekendTintTone = this.settings.calendarWeekendTintTone === "red" ? "red" : "accent";
    this.settings.taskListAddonEnabled = this.settings.taskListAddonEnabled !== false;
    this.settings.planningAddonEnabled = this.settings.planningAddonEnabled !== false;
    this.settings.taskListColumnOrder = normalizeTaskListColumnOrder(this.settings.taskListColumnOrder);
    this.settings.taskListVisibleColumns = normalizeTaskListVisibleColumns(this.settings.taskListVisibleColumns);
    this.settings.taskListColumnWidths = normalizeTaskListColumnWidths(this.settings.taskListColumnWidths);
    this.settings.taskListSortColumn = TASK_LIST_COLUMN_IDS.includes(this.settings.taskListSortColumn) ? this.settings.taskListSortColumn : "date";
    this.settings.taskListSortDirection = this.settings.taskListSortDirection === "desc" ? "desc" : "asc";
    this.settings.taskListStatuses = Array.isArray(this.settings.taskListStatuses)
      ? this.settings.taskListStatuses.filter((status) => ["active", "completed"].includes(status))
      : ["active"];
    if (!this.settings.taskListStatuses.length) this.settings.taskListStatuses = ["active"];
    this.settings.taskListPriorityFilters = Array.isArray(this.settings.taskListPriorityFilters)
      ? this.settings.taskListPriorityFilters.filter((marker) => ["!", "H", "M", "L", " "].includes(marker))
      : ["!", "H", "M", "L", " "];
    if (!this.settings.taskListPriorityFilters.length) this.settings.taskListPriorityFilters = ["!", "H", "M", "L", " "];
    this.settings.taskListUnscheduledFilter = ["auto", "include", "exclude"].includes(this.settings.taskListUnscheduledFilter)
      ? this.settings.taskListUnscheduledFilter
      : "auto";
    this.settings.taskAuditEnabled = !!this.settings.taskAuditEnabled;
    this.settings.taskAuditNote = String(this.settings.taskAuditNote || "").trim();
    if (!DATE_TASK_FILTER_VALUES.has(this.settings.kanbanTaskFilter)) {
      this.settings.kanbanTaskFilter = "all";
    }
    if (!KANBAN_TASK_VIEW_VALUES.has(this.settings.kanbanTaskView)) {
      this.settings.kanbanTaskView = "sections";
    }
    if (!["active", "completed"].includes(this.settings.kanbanTaskStatus)) {
      this.settings.kanbanTaskStatus = "active";
    }
    this.settings.kanbanTaskStatuses = Array.isArray(this.settings.kanbanTaskStatuses)
      ? this.settings.kanbanTaskStatuses.filter((status) => ["active", "completed"].includes(status))
      : [this.settings.kanbanTaskStatus];
    if (!this.settings.kanbanTaskStatuses.length) this.settings.kanbanTaskStatuses = ["active"];
    this.settings.kanbanPriorityFilters = Array.isArray(this.settings.kanbanPriorityFilters)
      ? this.settings.kanbanPriorityFilters.filter((marker) => ["!", "H", "M", "L", " "].includes(marker))
      : ["!", "H", "M", "L", " "];
    if (!this.settings.kanbanPriorityFilters.length) this.settings.kanbanPriorityFilters = ["!", "H", "M", "L", " "];
    this.settings.kanbanUnscheduledFilter = ["auto", "include", "exclude"].includes(this.settings.kanbanUnscheduledFilter)
      ? this.settings.kanbanUnscheduledFilter
      : "auto";
    this.settings.kanbanDateHideWeekends = !!this.settings.kanbanDateHideWeekends;
    this.settings.kanbanCardOrder = this.settings.kanbanCardOrder === "custom" ? "custom" : "priority";
    this.settings.kanbanCompactCards = !!this.settings.kanbanCompactCards;
    this.settings.kanbanCardPriorityBorders = !!this.settings.kanbanCardPriorityBorders;
    this.settings.kanbanCardAccentPosition = normalizeKanbanCardAccentPosition(this.settings.kanbanCardAccentPosition);
    this.settings.kanbanCardContextDivider = !!this.settings.kanbanCardContextDivider;
    this.settings.kanbanCardContextPlacement = normalizeKanbanCardContextPlacement(this.settings.kanbanCardContextPlacement);
    this.settings.kanbanCardContextAlignment = normalizeKanbanCardContextAlignment(this.settings.kanbanCardContextAlignment);
    this.settings.kanbanCardCornerRadius = clampNumber(this.settings.kanbanCardCornerRadius, 0, 12, 6);
    if (!DATE_TASK_FILTER_VALUES.has(this.settings.dailyBriefTaskFilter)) {
      this.settings.dailyBriefTaskFilter = "today";
    }
    this.settings.timerFocusMinutes = clampNumber(this.settings.timerFocusMinutes, 1, 240, 25);
    this.settings.timerBreakMinutes = clampNumber(this.settings.timerBreakMinutes, 1, 120, 5);
    this.settings.timerLongBreakMinutes = clampNumber(this.settings.timerLongBreakMinutes, 1, 120, 20);
    this.settings.timerFocusCycles = clampNumber(this.settings.timerFocusCycles, 1, 12, 4);
    this.settings.timerLongBreakInterval = Math.min(
      this.settings.timerFocusCycles,
      clampNumber(this.settings.timerLongBreakInterval, 1, 12, 4)
    );
    this.settings.timerCompletionSoundEnabled = this.settings.timerCompletionSoundEnabled !== false;
    this.settings.timerDesktopNotifications = !!this.settings.timerDesktopNotifications;
    this.settings.timerDisplayStyle = this.settings.timerDisplayStyle === "timer" ? "timer" : "circle";
    const storedTimerSession = rawSettings.timerSessionState;
    if (isRecord(storedTimerSession)) {
      this.settings.timerSessionState = {
        mode: normalizePomodoroMode(storedTimerSession.mode),
        completedFocusCycles: Math.max(0, Math.min(this.settings.timerFocusCycles, Math.round(Number(storedTimerSession.completedFocusCycles) || 0))),
        remainingSeconds: Math.max(0, Math.round(Number(storedTimerSession.remainingSeconds) || 0)),
        running: !!storedTimerSession.running,
        endsAt: Math.max(0, Number(storedTimerSession.endsAt) || 0)
      };
    } else {
      this.settings.timerSessionState = null;
    }
    this.settings.recurringTaskOccurrenceLimit = clampNumber(this.settings.recurringTaskOccurrenceLimit, 2, 26, 6);
    this.settings.recurringTaskAutoExtend = this.settings.recurringTaskAutoExtend !== false;
    this.settings.recurringTaskManagerEnabled = this.settings.recurringTaskManagerEnabled !== false;
    this.settings.recurringTaskRecoveryVersion = Math.max(0, Math.round(Number(this.settings.recurringTaskRecoveryVersion) || 0));
    this.settings.recurringTaskSeries = Array.isArray(this.settings.recurringTaskSeries)
      ? this.settings.recurringTaskSeries
        .filter((series) => series && typeof series.id === "string" && typeof series.text === "string")
        .map((series) => Object.assign({}, series, {
          status: series.status === "paused" ? "paused" : "active",
          occurrenceCount: Math.max(1, Math.round(Number(series.occurrenceCount) || 1)),
          occurrenceDates: Array.isArray(series.occurrenceDates)
            ? unique(series.occurrenceDates.filter((dateKey) => moment(dateKey, "YYYY-MM-DD", true).isValid())).sort()
            : undefined
        }))
      : [];
    this.settings.projects = Array.isArray(this.settings.projects)
      ? this.settings.projects
        .filter((project) => project && typeof project.id === "string" && typeof project.sourcePath === "string" && typeof project.section === "string")
        .map((project) => ({
          id: project.id,
          name: String(project.name || project.section).trim() || project.section,
          sourcePath: normalizeMarkdownPath(project.sourcePath),
          section: String(project.section).trim(),
          status: ["paused", "archived"].includes(project.status) ? project.status : "active",
          dueDate: moment(project.dueDate, "YYYY-MM-DD", true).isValid() ? project.dueDate : undefined,
          createdAt: typeof project.createdAt === "string" ? project.createdAt : new Date().toISOString()
        }))
        .filter((project) => project.sourcePath && project.section)
      : [];
    this.settings.timelineRangeDays = clampNumber(this.settings.timelineRangeDays, 7, 365, 60);
    this.settings.calendarEventColor = sanitizeCssText(this.settings.calendarEventColor, "#eab308");
    this.settings.calendarTaskCriticalColor = sanitizeCssText(this.settings.calendarTaskCriticalColor, "#ea4458");
    this.settings.calendarTaskHighColor = sanitizeCssText(this.settings.calendarTaskHighColor, "#fd884b");
    this.settings.calendarTaskMediumColor = sanitizeCssText(this.settings.calendarTaskMediumColor, "#f1c24d");
    this.settings.calendarTaskLowColor = sanitizeCssText(this.settings.calendarTaskLowColor, "#5cdf95");
    const storedViewPlacements = isRecord(rawSettings.viewPlacements)
      ? Object.fromEntries(Object.entries(rawSettings.viewPlacements)
        .filter((entry): entry is [string, string] => typeof entry[1] === "string"))
      : {};
    this.settings.viewPlacements = Object.assign(
      {},
      DEFAULT_VIEW_PLACEMENTS,
      storedViewPlacements
    );
    this.settings.viewPlacements = Object.fromEntries(Object.entries(this.settings.viewPlacements)
      .filter(([type]) => NOESIS_FLOW_VIEW_TYPES.includes(type)));
    this.settings.viewPlacements[NOESIS_FLOW_DAILY_BRIEF_VIEW_TYPE] = "main";
    this.settings.viewPlacements[NOESIS_FLOW_TASK_LIST_VIEW_TYPE] = "main";
    this.settings.viewPlacements[NOESIS_FLOW_PLANNING_VIEW_TYPE] = "main";
    this.settings.viewPlacements[NOESIS_FLOW_KANBAN_VIEW_TYPE] = "main";
    if (settingsNeedPersist(loaded, this.getPersistedSettings())) await this.saveSettings();
  }

  getPersistedSettings() {
    return this.settings;
  }

  async saveSettings() {
    await this.saveData(this.getPersistedSettings());
  }

  async applyPluginSettingsSnapshot(pluginSettings: unknown): Promise<boolean> {
    const cleanSettings = sanitizeSettingsSnapshot(pluginSettings);
    if (!Object.keys(cleanSettings).length) return false;

    Object.assign(this.settings, cleanSettings);
    await this.saveSettings();
    await this.refreshTimerSoundFiles(true);
    await this.refreshCalendarTaskCounts(true);
    await this.refreshHolidayCalendar(true);
    await this.updateCalendarAddonState();
    await this.updateTimerAddonState();
    await this.updateTaskListAddonState();
    await this.updatePlanningAddonState();
    await this.updateKanbanAddonState();
    await this.updateRecurringTaskManagerState();
    await this.updateDailyBriefAddonState();
    await this.updateTimelineAddonState();
    return true;
  }
}


export default NoesisFlowPlugin;
