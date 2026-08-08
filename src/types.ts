export type DateTaskFilter = "today" | "tomorrow" | "next-7" | "next-14" | "next-30" | "overdue" | "all";
export type KanbanTaskView = "sections" | "date" | "priority";
export type KanbanTaskStatus = "active" | "completed";
export type KanbanCardOrder = "priority" | "custom";
export type KanbanCardAccentPosition = "left" | "top";
export type KanbanCardContextPlacement = "top" | "bottom";
export type KanbanCardContextAlignment = "left" | "center";
export type KanbanUnscheduledFilter = "auto" | "include" | "exclude";
export type TaskStatus = "inbox" | "next" | "doing" | "waiting";

export interface KanbanSavedView {
  name: string;
  description?: string;
  filter: DateTaskFilter;
  view: KanbanTaskView;
  statuses: KanbanTaskStatus[];
  priorities: string[];
  unscheduledFilter?: KanbanUnscheduledFilter;

  search?: string;
}

export interface NoesisFlowSettings {
  taskSchemaVersion: number;
  /** Capture-note target. This mirrors the legacy task target for compatibility. */
  taskInboxNote: string;
  /** Additional Markdown notes indexed alongside the capture note. */
  taskSourceNotes: string[];
  /** Markdown headings registered as first-class projects. */
  projects: NoesisFlowProject[];
  viewPlacements: Record<string, string>;

  dateMarkerStyle: "tag" | "double-hash";
  calendarAddonEnabled: boolean;
  calendarLayoutStyle: "classic" | "centered-weekdays";
  calendarWeekStart: "monday" | "sunday" | "saturday" | "locale";
  calendarShowWeekNumbers: boolean;
  calendarShowWeekNumbersRight: boolean;
  calendarShadeWeekendColumns: boolean;
  calendarWeekendDays: number[];
  calendarShowQuarters: boolean;
  calendarShowTodayButton: boolean;
  calendarShowTodayButtonOnMobile: boolean;
  calendarHeaderDateScale: number;
  calendarDateNumberScale: number;
  calendarSelectedDateRadius: number;
  calendarQuarterRailSpacing: number;
  calendarOverflowDateOpacity: number;
  calendarWeekendTintStrength: number;
  calendarWeekendTintTone: "accent" | "red";
  tasksAddonEnabled: boolean;
  calendarTaskCaptureEnabled: boolean;
  calendarTaskTargetNote: string;
  calendarShowTaskCounts: boolean;
  calendarMarkOverdueTasks: boolean;
  calendarTaskWorkloadThreshold: number;
  calendarTaskOrangePriorityThreshold: number;
  calendarTaskRedPriorityThreshold: number;
  calendarTaskCriticalColor: string;
  calendarTaskHighColor: string;
  calendarTaskMediumColor: string;
  calendarTaskLowColor: string;
  holidayCalendarEnabled: boolean;
  holidayCalendarNote: string;
  calendarEventsEnabled: boolean;
  calendarEventColor: string;
  taskListAddonEnabled: boolean;
  taskListColumnOrder: string[];
  taskListVisibleColumns: string[];
  taskListColumnWidths: Record<string, number>;
  taskListSortColumn: string;
  taskListSortDirection: "asc" | "desc";
  taskListFilter: DateTaskFilter;
  taskListStatuses: KanbanTaskStatus[];
  taskListPriorityFilters: string[];
  taskListUnscheduledFilter: KanbanUnscheduledFilter;
  taskListSourceFilter: string;

  taskAuditEnabled: boolean;
  taskAuditNote: string;
  /** Retained for existing completion-history metadata; no longer configured by Weekly Review. */
  taskCompletionTimestampsEnabled: boolean;
  planningAddonEnabled: boolean;
  kanbanTasksAddonEnabled: boolean;
  kanbanTaskFilter: DateTaskFilter;
  kanbanTaskView: KanbanTaskView;
  kanbanTaskStatus: KanbanTaskStatus;
  kanbanTaskStatuses: KanbanTaskStatus[];
  kanbanPriorityFilters: string[];
  kanbanUnscheduledFilter: KanbanUnscheduledFilter;

  kanbanSavedViews: KanbanSavedView[];
  kanbanDateHideWeekends: boolean;
  kanbanCardOrder: KanbanCardOrder;
  kanbanCompactCards: boolean;
  kanbanCardPriorityBorders: boolean;
  kanbanCardAccentPosition: KanbanCardAccentPosition;
  kanbanCardContextDivider: boolean;
  kanbanCardContextPlacement: KanbanCardContextPlacement;
  kanbanCardContextAlignment: KanbanCardContextAlignment;
  kanbanCardCornerRadius: number;
  dailyBriefAddonEnabled: boolean;
  dailyBriefTaskFilter: DateTaskFilter;
  dailyBriefShowTodayTasks: boolean;
  dailyBriefShowOverdueTasks: boolean;
  dailyBriefShowNextHoliday: boolean;
  dailyBriefShowWeekend: boolean;
  dailyBriefShowTimer: boolean;
  recurringTasksEnabled: boolean;
  recurringTaskOccurrenceLimit: number;
  recurringTaskAutoExtend: boolean;
  recurringTasksUseSeparateNote: boolean;
  recurringTaskTargetNote: string;
  recurringTaskManagerEnabled: boolean;
  /** One-time registry recovery state for legacy recurring task lines. */
  recurringTaskRecoveryVersion: number;
  recurringTaskSeries: RecurringTaskSeries[];
  timelineAddonEnabled: boolean;
  timelineNote: string;
  timelineRangeDays: number;
  timelineIncludeEvents: boolean;
  timelineIncludeHolidays: boolean;

  timerAddonEnabled: boolean;
  timerFocusMinutes: number;
  timerBreakMinutes: number;
  timerLongBreakMinutes: number;
  timerFocusCycles: number;
  timerLongBreakInterval: number;
  timerSoundPath: string;
  timerCompletionSoundEnabled: boolean;
  timerDesktopNotifications: boolean;
  timerDisplayStyle: "timer" | "circle";
  timerSessionState: TimerSessionState | null;
}

export type RecurringTaskRule = "none" | "daily" | "weekly" | "monthly" | "weekdays" | "custom-weekdays" | "after-completion";

export interface RecurringTaskRecurrence {
  rule: RecurringTaskRule;
  interval?: number;
  weekdays?: string | string[];
  endMode?: "limit" | "count" | "date";
  endCount?: number;
  endDate?: string;
  excludedDates?: string | string[];
  includedDates?: string | string[];
  skipWeekends?: boolean;
  skipHolidays?: boolean;
  completionRule?: "daily" | "weekly" | "monthly";
}

export interface RecurringTaskSeries {
  id: string;
  text: string;
  section: string;
  marker: string;
  sourcePath: string;
  startDate: string;
  recurrence: RecurringTaskRecurrence;
  occurrenceCount: number;
  occurrenceDates?: string[];
  metadata?: Record<string, unknown>;
  status: "active" | "paused";
  createdAt: string;
}

export interface TimerSessionState {
  mode: string;
  completedFocusCycles: number;
  remainingSeconds: number;
  running: boolean;
  endsAt: number;
}

export interface CalendarTask {
  /** Stable Markdown-backed identity. Older tasks may not have one until they are edited. */
  id?: string;
  dateKey: string;
  marker: string;
  priorityLabel: string;
  section: string;
  sourcePath: string;
  text: string;
  lineIndex: number;
  status?: TaskStatus;
  dueDate?: string;
  startDate?: string;
  completedAt?: string;
  completed?: boolean;
  seriesId?: string;
  /** Optional stable link to a registered Markdown project heading. */
  projectId?: string;
}

export type NoesisFlowProjectStatus = "active" | "paused" | "archived";

/** A project is a registered `## Heading` in an ordinary Markdown task note. */
export interface NoesisFlowProject {
  id: string;
  name: string;
  sourcePath: string;
  section: string;
  status: NoesisFlowProjectStatus;
  dueDate?: string;
  createdAt: string;
}

export interface CalendarTaskStats {
  total: number;
  priority: number;
  priorities: Record<string, number>;
  tasks: CalendarTask[];
  prioritySummary?: string;
  overdue?: boolean;
  dotCount?: number;
  level?: string;
}

export interface CalendarTaskIndex {
  counts: Map<string, CalendarTaskStats>;
  tasksByDate: Map<string, CalendarTask[]>;
  undatedTasks: CalendarTask[];
  completedTasksByDate: Map<string, CalendarTask[]>;
  completedUndatedTasks: CalendarTask[];
}

export interface TimelineEntry {
  type: string;
  date: Moment;
  dateKey: string;
  label: string;
  section?: string;
  lineIndex?: number;
  sourcePath?: string;
}



export interface TimerSoundFile {
  path: string;
  label: string;
  extension: string;
}
import type { Moment } from "moment";
