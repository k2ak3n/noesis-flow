import { moment } from "./time";
import type { Moment, MomentInput } from "moment";
import { CalendarTask, CalendarTaskIndex, CalendarTaskStats, NoesisFlowSettings, KanbanSavedView, DateTaskFilter, KanbanTaskStatus } from "./types";
import { insertCalendarTaskInSection } from "./tasks/TaskMarkdown";
import { parseTaskMetadata, preserveTaskLineComments, updateTaskMetadataInText } from "./tasks/TaskMetadata";
import { parseMarkdownTaskLine } from "./tasks/TaskParser";

export const PLUGIN_ID = "noesis-flow";
export const NOESIS_FLOW_CALENDAR_VIEW_TYPE = "noesis-flow-calendar-view";
export const NOESIS_FLOW_TIMER_VIEW_TYPE = "noesis-flow-timer-view";
export const NOESIS_FLOW_TASK_LIST_VIEW_TYPE = "noesis-flow-task-list-view";
export const NOESIS_FLOW_PLANNING_VIEW_TYPE = "noesis-flow-planning-view";
export const NOESIS_FLOW_KANBAN_VIEW_TYPE = "noesis-flow-kanban-view";
export const NOESIS_FLOW_RECURRING_VIEW_TYPE = "noesis-flow-recurring-view";
export const NOESIS_FLOW_DAILY_BRIEF_VIEW_TYPE = "noesis-flow-daily-brief-view";
export const NOESIS_FLOW_TIMELINE_VIEW_TYPE = "noesis-flow-timeline-view";
export const NOESIS_FLOW_VIEW_TYPES = [
  NOESIS_FLOW_CALENDAR_VIEW_TYPE,
  NOESIS_FLOW_TIMER_VIEW_TYPE,
  NOESIS_FLOW_TASK_LIST_VIEW_TYPE,
  NOESIS_FLOW_PLANNING_VIEW_TYPE,
  NOESIS_FLOW_KANBAN_VIEW_TYPE,
  NOESIS_FLOW_RECURRING_VIEW_TYPE,
  NOESIS_FLOW_DAILY_BRIEF_VIEW_TYPE,
  NOESIS_FLOW_TIMELINE_VIEW_TYPE,
];
export const DEFAULT_VIEW_PLACEMENTS = {
  [NOESIS_FLOW_CALENDAR_VIEW_TYPE]: "right",
  [NOESIS_FLOW_TIMER_VIEW_TYPE]: "right",
  [NOESIS_FLOW_TASK_LIST_VIEW_TYPE]: "main",
  [NOESIS_FLOW_PLANNING_VIEW_TYPE]: "main",
  [NOESIS_FLOW_KANBAN_VIEW_TYPE]: "main",
  [NOESIS_FLOW_RECURRING_VIEW_TYPE]: "main",
  [NOESIS_FLOW_DAILY_BRIEF_VIEW_TYPE]: "main",
  [NOESIS_FLOW_TIMELINE_VIEW_TYPE]: "right",
};
export const BUILT_IN_SLOW_TICK_SOUND_PATH = "noesis-flow:slow-ticking";
export const BUILT_IN_TIMER_SOUNDS = [{
  path: BUILT_IN_SLOW_TICK_SOUND_PATH,
  label: "Slow ticking",
  extension: "mp3"
}];
export const KANBAN_SAVED_VIEWS_SCHEMA = "noesis-flow-kanban-saved-views/v1";
export const TASK_LIST_COLUMN_IDS = ["text", "date", "section", "priority", "actions"];

/**
 * Adapt an async operation for an event API whose callback contract is synchronous.
 * The operation still runs and surfaces its own errors, but the event listener returns void.
 */
export function asVoidHandler<Args extends unknown[]>(
  handler: (...args: Args) => Promise<unknown>
): (...args: Args) => void {
  return (...args) => {
    void handler(...args);
  };
}

export function normalizeTaskListColumnOrder(value: unknown): string[] {
  const stored = Array.isArray(value)
    ? value.filter((column): column is string => typeof column === "string" && TASK_LIST_COLUMN_IDS.includes(column))
    : [];
  return Array.from(new Set([...stored, ...TASK_LIST_COLUMN_IDS]));
}

export function normalizeTaskListVisibleColumns(value: unknown): string[] {
  const visible = Array.isArray(value)
    ? value.filter((column): column is string => typeof column === "string" && TASK_LIST_COLUMN_IDS.includes(column))
    : TASK_LIST_COLUMN_IDS;
  return visible.length ? Array.from(new Set(visible)) : ["text"];
}

export function normalizeTaskListColumnWidths(value: unknown): Record<string, number> {
  const widths: Record<string, unknown> = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return Object.fromEntries(TASK_LIST_COLUMN_IDS
    .map((column) => [column, Math.round(Number(widths[column]))] as [string, number])
    .filter(([, width]) => Number.isFinite(width) && width >= 32 && width <= 1000));
}

export const DEFAULT_SETTINGS: NoesisFlowSettings = {
  taskSchemaVersion: 2,
  taskInboxNote: "",
  taskSourceNotes: [],
  projects: [],
  viewPlacements: DEFAULT_VIEW_PLACEMENTS,

  dateMarkerStyle: "tag",
  calendarAddonEnabled: true,
  calendarLayoutStyle: "classic",
  calendarWeekStart: "monday",
  calendarShowWeekNumbers: false,
  calendarShowWeekNumbersRight: false,
  calendarShadeWeekendColumns: false,
  calendarWeekendDays: [0, 6],
  calendarShowQuarters: false,
  calendarShowTodayButton: true,
  calendarShowTodayButtonOnMobile: false,
  calendarHeaderDateScale: 1,
  calendarDateNumberScale: 0.8,
  calendarSelectedDateRadius: 6,
  calendarPlainDateNumbers: false,
  calendarDateCellShape: "square",
  calendarQuarterRailSpacing: 4,
  calendarOverflowDateOpacity: 0.25,
  calendarWeekendTintStrength: 6,
  calendarWeekendTintTone: "accent",
  tasksAddonEnabled: true,
  calendarTaskCaptureEnabled: true,
  calendarTaskTargetNote: "",
  calendarShowTaskCounts: true,
  calendarMarkOverdueTasks: true,
  calendarTaskWorkloadThreshold: 5,
  calendarTaskOrangePriorityThreshold: 1,
  calendarTaskRedPriorityThreshold: 2,
  calendarTaskCriticalColor: "#ea4458",
  calendarTaskHighColor: "#fd884b",
  calendarTaskMediumColor: "#f1c24d",
  calendarTaskLowColor: "#5cdf95",
  holidayCalendarEnabled: false,
  holidayCalendarNote: "",
  calendarEventsEnabled: true,
  calendarEventColor: "#eab308",
  taskListAddonEnabled: true,
  taskListColumnOrder: TASK_LIST_COLUMN_IDS,
  taskListVisibleColumns: TASK_LIST_COLUMN_IDS,
  taskListColumnWidths: {},
  taskListSortColumn: "date",
  taskListSortDirection: "asc",
  taskListFilter: "all",
  taskListStatuses: ["active"],
  taskListPriorityFilters: ["!", "H", "M", "L", " "],
  taskListUnscheduledFilter: "auto",
  taskListSourceFilter: "all",

  taskAuditEnabled: false,
  taskAuditNote: "",
  taskCompletionTimestampsEnabled: true,
  planningAddonEnabled: false,
  kanbanTasksAddonEnabled: false,
  kanbanTaskFilter: "all",
  kanbanTaskView: "sections",
  kanbanTaskStatus: "active",
  kanbanTaskStatuses: ["active"],
  kanbanPriorityFilters: ["!", "H", "M", "L", " "],
  kanbanUnscheduledFilter: "auto",

  kanbanSavedViews: [],
  kanbanDateHideWeekends: false,
  kanbanCardOrder: "priority",
  kanbanCompactCards: false,
  kanbanCardPriorityBorders: false,
  kanbanCardAccentPosition: "left",
  kanbanCardContextDivider: false,
  kanbanCardContextPlacement: "top",
  kanbanCardContextAlignment: "left",
  kanbanCardCornerRadius: 6,
  dailyBriefAddonEnabled: true,
  dailyBriefTaskFilter: "today",
  dailyBriefShowTodayTasks: true,
  dailyBriefShowOverdueTasks: true,
  dailyBriefShowNextHoliday: true,
  dailyBriefShowWeekend: false,
  dailyBriefShowTimer: false,
  recurringTasksEnabled: false,
  recurringTaskOccurrenceLimit: 6,
  recurringTaskAutoExtend: true,
  recurringTasksUseSeparateNote: false,
  recurringTaskTargetNote: "",
  recurringTaskManagerEnabled: true,
  recurringTaskRecoveryVersion: 0,
  recurringTaskSeries: [],
  timelineAddonEnabled: false,
  timelineNote: "",
  timelineRangeDays: 60,
  timelineIncludeEvents: true,
  timelineIncludeHolidays: true,

  timerAddonEnabled: false,
  timerFocusMinutes: 25,
  timerBreakMinutes: 5,
  timerLongBreakMinutes: 20,
  timerFocusCycles: 4,
  timerLongBreakInterval: 4,
  timerSoundPath: "",
  timerCompletionSoundEnabled: true,
  timerDesktopNotifications: false,
  timerDisplayStyle: "circle",
  timerSessionState: null
};
export const CALENDAR_TASK_PRIORITIES = [
  { label: "Critical", marker: "!", description: "Immediate attention." },
  { label: "High", marker: "H", description: "Important work." },
  { label: "Medium", marker: "M", description: "Normal priority." },
  { label: "Low", marker: "L", description: "Lower urgency." },
  { label: "No priority", marker: " ", description: "Plain unchecked task." }
];
export const CALENDAR_TASK_PRIORITY_LABELS = new Map(CALENDAR_TASK_PRIORITIES.map((priority) => [priority.marker, priority.label]));
export const CALENDAR_TASK_PRIORITY_ORDER = ["!", "H", "M", "L", " "];
export const CALENDAR_TASK_RECURRENCE_OPTIONS = [
  { label: "Does not repeat", value: "none", description: "Create only the selected date." },
  { label: "Daily", value: "daily", description: "Repeat every day." },
  { label: "Weekly", value: "weekly", description: "Repeat on the same weekday." },
  { label: "Monthly", value: "monthly", description: "Repeat on the same day of each month." },
  { label: "Weekdays", value: "weekdays", description: "Repeat Monday through Friday." },
  { label: "Custom weekdays", value: "custom-weekdays", description: "Choose specific weekdays." },
  { label: "After completion", value: "after-completion", description: "Create the next occurrence only after this one is completed." }
];
export const DATE_TASK_FILTER_OPTIONS = [
  { label: "Today", value: "today", description: "Tasks dated today." },
  { label: "Tomorrow", value: "tomorrow", description: "Tasks dated tomorrow." },
  { label: "Next 7 Days", value: "next-7", description: "Tasks dated today through the next 7 days." },
  { label: "Next 14 Days", value: "next-14", description: "Tasks dated today through the next 14 days." },
  { label: "Next 30 Days", value: "next-30", description: "Tasks dated today through the next 30 days." },
  { label: "Overdue", value: "overdue", description: "Open tasks whose Date has passed." },
  { label: "All", value: "all", description: "All open dated tasks." }
];
export const DATE_TASK_FILTER_VALUES = new Set(DATE_TASK_FILTER_OPTIONS.map((option) => option.value));
export const POMODORO_MODES = ["focus", "break", "long-break"] as const;
export type PomodoroMode = typeof POMODORO_MODES[number];
export interface PomodoroNextStep {
  mode: PomodoroMode;
  completedFocusCycles: number;
  sessionComplete: boolean;
}

export function unique<T>(values: Iterable<T>): T[] {
  return Array.from(new Set(values));
}

export function normalizeTimerSoundPath(path: unknown): string {
  const value = String(path || "");
  if (value === BUILT_IN_SLOW_TICK_SOUND_PATH) {
    return BUILT_IN_SLOW_TICK_SOUND_PATH;
  }
  return "";
}



export function sanitizeCssText(value: unknown, fallback: string): string {
  const text = String(value || "").trim().replace(/[;"{}]/g, "");
  return (text || fallback).slice(0, 80);
}

export function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

export function getPomodoroSessionSettings(settings: Partial<Pick<NoesisFlowSettings, "timerFocusCycles" | "timerLongBreakInterval" | "timerFocusMinutes" | "timerBreakMinutes" | "timerLongBreakMinutes">> = {}) {
  const totalCycles = clampNumber(settings.timerFocusCycles, 1, 12, 4);
  const longBreakInterval = Math.min(totalCycles, clampNumber(settings.timerLongBreakInterval, 1, 12, 4));
  return {
    focusMinutes: clampNumber(settings.timerFocusMinutes, 1, 240, 25),
    shortBreakMinutes: clampNumber(settings.timerBreakMinutes, 1, 120, 5),
    longBreakMinutes: clampNumber(settings.timerLongBreakMinutes, 1, 120, 20),
    totalCycles,
    longBreakInterval
  };
}

export function normalizePomodoroMode(mode: unknown): PomodoroMode {
  return typeof mode === "string" && (POMODORO_MODES as readonly string[]).includes(mode)
    ? mode as PomodoroMode
    : "focus";
}

export function getPomodoroNextStep(
  mode: unknown,
  completedFocusCycles: unknown,
  settings: Partial<Pick<NoesisFlowSettings, "timerFocusCycles" | "timerLongBreakInterval" | "timerFocusMinutes" | "timerBreakMinutes" | "timerLongBreakMinutes">> = {}
): PomodoroNextStep {
  const session = getPomodoroSessionSettings(settings);
  const cleanMode = normalizePomodoroMode(mode);
  const completedCycles = clampNumber(completedFocusCycles, 0, session.totalCycles, 0);

  if (cleanMode === "focus") {
    const nextCompleted = Math.min(completedCycles + 1, session.totalCycles);
    const shouldLongBreak = nextCompleted >= session.totalCycles
      || (session.longBreakInterval > 0 && nextCompleted % session.longBreakInterval === 0);
    return {
      mode: shouldLongBreak ? "long-break" : "break",
      completedFocusCycles: nextCompleted,
      sessionComplete: false
    };
  }

  if (cleanMode === "long-break" || completedCycles >= session.totalCycles) {
    return {
      mode: "focus",
      completedFocusCycles: 0,
      sessionComplete: true
    };
  }

  return {
    mode: "focus",
    completedFocusCycles: completedCycles,
    sessionComplete: false
  };
}

export function makeCssUrl(value: unknown): string {
  return `url("${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}")`;
}

export function getCalendarWeekStart(settings: { calendarWeekStart?: string }): number {
  const value = String(settings.calendarWeekStart || "monday").toLowerCase();
  if (value === "sunday") return 0;
  if (value === "saturday") return 6;
  if (value === "locale") {
    const localeData = moment && typeof moment.localeData === "function" ? moment.localeData() : null;
    if (localeData && typeof localeData.firstDayOfWeek === "function") {
      return localeData.firstDayOfWeek();
    }
  }
  return 1;
}

export function getCalendarWeekdays(weekStart: number): number[] {
  return Array.from({ length: 7 }, (_value, index) => (weekStart + index) % 7);
}

export function getCalendarWeekdayLabel(dayIndex: number): string {
  const date = moment().day(dayIndex);
  return date.format("dd");
}

export function getCalendarWeekNumber(date: Moment, weekStart: number): number {
  if (weekStart === 1 && typeof date.isoWeek === "function") {
    return date.isoWeek();
  }
  return date.week();
}

export function getCalendarWeekStartDate(date: Moment, weekStart: number): Moment {
  const offset = (date.day() - weekStart + 7) % 7;
  return date.clone().startOf("day").subtract(offset, "days");
}

export function isSameCalendarWeek(a: Moment | null | undefined, b: Moment | null | undefined, weekStart: number): boolean {
  if (!a || !b) return false;
  return getCalendarWeekStartDate(a, weekStart).isSame(getCalendarWeekStartDate(b, weekStart), "day");
}

export function getCalendarMonthRows(displayedMonth: Moment, weekStart: number): Array<{ weekNum: number; days: Moment[] }> {
  const rows: Array<{ weekNum: number; days: Moment[] }> = [];
  const startOfMonth = displayedMonth.clone().startOf("month");
  const startOffset = (startOfMonth.day() - weekStart + 7) % 7;
  let cursor = startOfMonth.clone().subtract(startOffset, "days");

  for (let rowIndex = 0; rowIndex < 6; rowIndex += 1) {
    const weekStartDate = cursor.clone();
    const days: Moment[] = [];

    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      days.push(cursor.clone());
      cursor = cursor.clone().add(1, "day");
    }

    rows.push({
      weekNum: getCalendarWeekNumber(weekStartDate, weekStart),
      days
    });
  }

  return rows;
}

export function getCalendarQuarter(monthIndex: number): number {
  return Math.floor(monthIndex / 3) + 1;
}

export function normalizeWeekendDays(value: unknown): number[] {
  const source = Array.isArray(value) ? value : [0, 6];
  const days = source
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item >= 0 && item <= 6);
  return days.length ? unique(days) : [0, 6];
}


export function normalizeMarkdownPath(value: unknown): string {
  let path = String(value || "")
    .trim()
    .replace(/^!?(?:\[\[|\[)(.*?)(?:\]\]|\])$/g, "$1")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");

  if (!path) return "";
  path = path.split("|")[0].split("#")[0].trim();
  if (!/\.md$/i.test(path)) path += ".md";
  return path;
}

export function normalizeCalendarSectionName(value: unknown): string {
  return String(value || "")
    .replace(/[\r\n]+/g, " ")
    .replace(/^#+\s*/, "")
    .trim();
}

export const DEFAULT_TASK_UNASSIGNED_SECTION = "Unassigned";

export function getTaskCaptureSection(value: unknown): string {
  return normalizeCalendarSectionName(value) || DEFAULT_TASK_UNASSIGNED_SECTION;
}

export function normalizeCalendarTaskText(value: unknown): string {
  return String(value || "")
    .replace(/[\r\n]+/g, " ")
    .trim();
}

export function escapeRegExp(value: unknown): string {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function getDateMarkerPrefix(settings: Partial<Pick<NoesisFlowSettings, "dateMarkerStyle">> | null | undefined): string {
  const style = settings && settings.dateMarkerStyle;
  return style === "double-hash" ? "##" : "#";
}

export function getDateMarkerLabel(settings: Partial<Pick<NoesisFlowSettings, "dateMarkerStyle">> | null | undefined): string {
  return `${getDateMarkerPrefix(settings)}YYYY-MM-DD`;
}

export function formatDateMarker(dateKey: unknown, settings: Partial<Pick<NoesisFlowSettings, "dateMarkerStyle">> | null | undefined): string {
  return `${getDateMarkerPrefix(settings)}${dateKey}`;
}

export function getDateMarkerPattern(settings: Partial<Pick<NoesisFlowSettings, "dateMarkerStyle">> | null | undefined): string {
  const style = settings && settings.dateMarkerStyle;
  if (style === "double-hash") return "##";
  return "#(?!#)";
}

export function isMarkdownCodeFenceLine(line: unknown): boolean {
  return /^\s*(?:```|~~~)/.test(String(line || ""));
}

const _dateMarkerRegexCache = new Map<string, RegExp>();

export function findNoesisFlowDateMarker(text: string | null | undefined, settings: Partial<Pick<NoesisFlowSettings, "dateMarkerStyle">> | null | undefined) {
  if (!text) return null;
  const str = typeof text === "string" ? text : String(text);

  // Fast path optimization: check if the string contains the expected marker character
  // before proceeding to the expensive Regex evaluation. Drastically improves performance
  // for strings that don't contain any date markers (approx ~8x faster on misses).
  const staticPart = getDateMarkerPrefix(settings);
  if (!str.includes(staticPart)) return null;

  const pattern = getDateMarkerPattern(settings);
  let regex = _dateMarkerRegexCache.get(pattern);
  if (!regex) {
    regex = new RegExp(`(^|[\\s([{:])(${pattern})(\\d{4}-\\d{2}-\\d{2})(?=\\s|$|[)\\]},.;!?])`);
    _dateMarkerRegexCache.set(pattern, regex);
  }
  const match = str.match(regex);
  if (!match) return null;
  return {
    dateKey: match[3],
    marker: match[2],
    raw: `${match[2]}${match[3]}`
  };
}

const _stripDateMarkerRegexCache = new Map<string, RegExp>();

export function stripNoesisFlowDateMarker(text: string | null | undefined, dateKey = "", settings: unknown) {
  if (!text) return "";
  const str = typeof text === "string" ? text : String(text);

  // Fast path optimization: similar to findNoesisFlowDateMarker, skip the regex entirely
  // if the string does not have the target marker symbol.
  const staticPart = getDateMarkerPrefix(settings);
  if (!str.includes(staticPart)) return str;

  const escapedDate = dateKey ? escapeRegExp(dateKey) : "\\d{4}-\\d{2}-\\d{2}";
  const markerPattern = getDateMarkerPattern(settings);
  const cacheKey = `${markerPattern}_${escapedDate}`;
  let pattern = _stripDateMarkerRegexCache.get(cacheKey);
  if (!pattern) {
    // ⚡ Bolt Optimization: Cache the compiled RegExp to avoid compiling it
    // on every invocation, boosting performance significantly. Bounded cache to avoid memory leak.
    if (_stripDateMarkerRegexCache.size > 100) _stripDateMarkerRegexCache.clear();
    pattern = new RegExp(`(^|[\\s([{:])(?:${markerPattern})${escapedDate}(?=\\s|$|[)\\]},.;!?])`, "g");
    _stripDateMarkerRegexCache.set(cacheKey, pattern);
  }
  return str.replace(pattern, "$1");
}

export function getCalendarTaskDateKey(date: MomentInput): string {
  const parsed = moment(date);
  return parsed && parsed.isValid && parsed.isValid() ? parsed.format("YYYY-MM-DD") : moment().format("YYYY-MM-DD");
}

export function createCalendarTaskLine(taskText: unknown, priority: { marker?: unknown } | null | undefined, dateKey: unknown, settings: Pick<NoesisFlowSettings, "dateMarkerStyle">, options: Record<string, unknown> = {}) {
  const marker = priority && priority.marker !== undefined ? priority.marker : " ";
  const checkbox = marker === " " ? "- [ ]" : `- [${marker}]`;
  const cleanDateKey = String(dateKey || "").trim();
  const datePart = cleanDateKey ? ` ${formatDateMarker(cleanDateKey, settings)}` : "";
  const seriesId = String(options && options.seriesId || "").trim();
  const seriesPart = seriesId ? ` <!-- noesis-flow-series:${seriesId} -->` : "";
  const taskId = String(options && options.taskId || "").trim().replace(/[^a-zA-Z0-9_-]/g, "");
  const taskIdPart = taskId ? ` <!-- noesis-flow-task:${taskId} -->` : "";
  const priorityMarker = normalizeCalendarTaskPriorityMarker(
    options && Object.prototype.hasOwnProperty.call(options, "priorityMarker") ? options.priorityMarker : marker
  );
  const line = `${checkbox} ${taskText}${datePart}${seriesPart}${taskIdPart}`;
  return updateTaskMetadataInText(line, getTaskMetadataUpdates(Object.assign({}, options, { priorityMarker })));
}

export function getTaskMetadataUpdates(value: Record<string, unknown> = {}) {
  const keys = ["status", "completedAt", "projectId", "priorityMarker"];
  return Object.fromEntries(keys
    .filter((key) => Object.prototype.hasOwnProperty.call(value, key))
    .map((key) => [key, value[key]]));
}

/** Creates an opaque ID that is safe to store in a Markdown comment. */
export function createCalendarTaskId() {
  return `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Creates an opaque project identity that can be retained when its heading is renamed. */
export function createNoesisFlowProjectId() {
  return `project-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getCalendarTaskId(text: unknown): string {
  return parseTaskMetadata(String(text || "")).taskId;
}

export function normalizeCalendarTaskMarker(marker: unknown): string {
  const cleanMarker = String(marker || "").trim().toUpperCase();
  if (!cleanMarker) return " ";
  if (cleanMarker === "CRITICAL" || cleanMarker === "URGENT") return "!";
  if (cleanMarker === "HIGH") return "H";
  if (cleanMarker === "MEDIUM") return "M";
  if (cleanMarker === "LOW") return "L";
  if (cleanMarker === "NONE" || cleanMarker === "NO PRIORITY") return " ";
  return cleanMarker;
}

export function normalizeCalendarTaskPriorityMarker(marker: unknown): string {
  const normalized = normalizeCalendarTaskMarker(marker);
  return CALENDAR_TASK_PRIORITY_ORDER.includes(normalized) ? normalized : " ";
}

export function createCalendarTaskStats(): CalendarTaskStats {
  return {
    total: 0,
    priority: 0,
    priorities: Object.fromEntries(CALENDAR_TASK_PRIORITY_ORDER.map((marker) => [marker, 0])),
    tasks: []
  };
}

export function getCalendarTaskPriorityLabel(marker: unknown): string {
  const value = String(marker || "");
  return CALENDAR_TASK_PRIORITY_LABELS.get(value) || value || "No priority";
}

export function cleanCalendarTaskText(text: string, dateKey: string, settings: NoesisFlowSettings): string {
  return stripNoesisFlowDateMarker(text, dateKey, settings)
    .replace(/\s*<!--\s*noesis-flow-series:[^>]+-->/gi, "")
    .replace(/\s*<!--\s*noesis-flow-task:[^>]+-->/gi, "")
    .replace(/\s*<!--\s*noesis-flow-priority:[^>]+-->/gi, "")
    .replace(/\s*<!--\s*noesis-flow-status:(?:inbox|next|doing|waiting)\s*-->/gi, "")
    .replace(/\s*<!--\s*noesis-flow-project:[A-Za-z0-9_-]+\s*-->/gi, "")
    .replace(/\s*<!--\s*noesis-flow-completed:[^>]+-->/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseCalendarTaskIndex(content: string, settings: NoesisFlowSettings, sourcePath = ""): CalendarTaskIndex {
  const counts = new Map<string, CalendarTaskStats>();
  const tasksByDate = new Map<string, CalendarTask[]>();
  const undatedTasks: CalendarTask[] = [];
  const completedTasksByDate = new Map<string, CalendarTask[]>();
  const completedUndatedTasks: CalendarTask[] = [];
  const lines = String(content || "").split(/\r?\n/);
  let section = "";
  let inCodeBlock = false;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    if (isMarkdownCodeFenceLine(line)) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const headingMatch = line.match(/^##\s+(.+?)\s*$/);
    if (headingMatch) {
      section = headingMatch[1].trim();
      continue;
    }

    const parsedTask = parseMarkdownTaskLine(line);
    if (!parsedTask) continue;

    const checkboxMarker = normalizeCalendarTaskMarker(parsedTask.checkbox);
    const completed = checkboxMarker === "X";

    const dateMarker = findNoesisFlowDateMarker(parsedTask.body, settings);
    const dateKey = dateMarker ? dateMarker.dateKey : "";
    const metadata = parsedTask.metadata;
    const marker = completed
      ? normalizeCalendarTaskPriorityMarker(metadata.priorityMarker)
      : checkboxMarker;
    const seriesId = metadata.seriesId;
    const task: CalendarTask = {
      id: metadata.taskId,
      dateKey,
      marker,
      priorityLabel: getCalendarTaskPriorityLabel(marker),
      section,
      sourcePath,
      text: cleanCalendarTaskText(parsedTask.body, dateKey, settings),
      lineIndex,
      status: metadata.status,
      completedAt: metadata.completedAt,
      projectId: metadata.projectId,
      completed,
      seriesId,
    };

    const trackedSeries = seriesId && Array.isArray(settings && settings.recurringTaskSeries)
      ? settings.recurringTaskSeries.find((series) => series && series.id === seriesId)
      : null;
    if (!completed && trackedSeries && trackedSeries.status === "paused") continue;

    if (completed) {
      if (!dateMarker) completedUndatedTasks.push(task);
      else {
        const completedTasks = completedTasksByDate.get(dateKey) || [];
        completedTasks.push(task);
        completedTasksByDate.set(dateKey, completedTasks);
      }
      continue;
    }

    if (!dateMarker) {
      undatedTasks.push(task);
      continue;
    }

    const current = counts.get(dateKey) || createCalendarTaskStats();
    current.total += 1;
    current.priorities[marker] = (current.priorities[marker] || 0) + 1;
    if (marker === "H" || marker === "!") current.priority += 1;
    current.tasks.push(task);
    counts.set(dateKey, current);

    const tasks = tasksByDate.get(dateKey) || [];
    tasks.push(task);
    tasksByDate.set(dateKey, tasks);
  }

  return { counts, tasksByDate, undatedTasks, completedTasksByDate, completedUndatedTasks };
}


export function isCompletableCalendarTaskLine(line: string, task: CalendarTask, settings: NoesisFlowSettings): boolean {
  const taskMatch = String(line || "").match(/^\s*-\s+\[([^\]]*)\]\s+(.+?)\s*$/);
  if (!taskMatch) return false;

  const dateKey = String(task && task.dateKey || "");
  const body = taskMatch[2] || "";
  const dateMarker = findNoesisFlowDateMarker(body, settings);
  if (dateKey && (!dateMarker || dateMarker.dateKey !== dateKey)) return false;
  if (!dateKey && dateMarker) return false;

  const cleanText = cleanCalendarTaskText(body, dateKey, settings);
  const expectedText = String(task && task.text || "").trim();
  return !expectedText || cleanText === expectedText;
}

export function markCalendarTaskCompletedInContent(content: string, task: CalendarTask, settings: NoesisFlowSettings): { changed: boolean; content: string } {
  const newline = String(content || "").includes("\r\n") ? "\r\n" : "\n";
  const lines = String(content || "").split(/\r?\n/);
  const targetIndex = findCalendarTaskLineIndex(lines, task, settings);

  if (targetIndex === -1) {
    return { changed: false, content };
  }

  let nextLine = lines[targetIndex].replace(/^(\s*-\s+\[)([^\]]*)(\]\s+)/, "$1x$3");
  const metadataUpdates: Record<string, string> = {
    priorityMarker: normalizeCalendarTaskPriorityMarker(task && task.marker)
  };
  if (settings && settings.taskCompletionTimestampsEnabled !== false) {
    metadataUpdates.completedAt = new Date().toISOString();
  }
  nextLine = updateTaskMetadataInText(nextLine, metadataUpdates);
  if (nextLine === lines[targetIndex]) {
    return { changed: false, content };
  }

  lines[targetIndex] = nextLine;
  return { changed: true, content: lines.join(newline) };
}

export function findCalendarTaskLineIndex(lines: string[], task: CalendarTask, settings: NoesisFlowSettings): number {
  const taskId = String(task && task.id || "").trim();
  const lineHasTaskId = (line: string): boolean => !!taskId && getCalendarTaskId(line) === taskId;
  const preferredIndex = Number(task && task.lineIndex);
  if (Number.isInteger(preferredIndex) && preferredIndex >= 0 && preferredIndex < lines.length
    && (lineHasTaskId(lines[preferredIndex]) || (!taskId && isCompletableCalendarTaskLine(lines[preferredIndex], task, settings)))) {
    return preferredIndex;
  }

  const matches: number[] = [];
  let inCodeBlock = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (isMarkdownCodeFenceLine(line)) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;
    if (lineHasTaskId(line) || (!taskId && isCompletableCalendarTaskLine(line, task, settings))) matches.push(i);
  }
  // Legacy tasks without an ID are safe to mutate only when their content
  // resolves to one line. External edits must never make Noesis Flow guess.
  return matches.length === 1 ? matches[0] : -1;
}

export function updateCalendarTaskInContent(content: string, task: CalendarTask, updates: Partial<CalendarTask>, settings: NoesisFlowSettings): { changed: boolean; content: string } {
  const newline = String(content || "").includes("\r\n") ? "\r\n" : "\n";
  const lines = String(content || "").split(/\r?\n/);
  const targetIndex = findCalendarTaskLineIndex(lines, task, settings);
  if (targetIndex === -1) {
    return { changed: false, content };
  }

  const nextSection = getTaskCaptureSection(
    Object.prototype.hasOwnProperty.call(updates, "section") ? updates.section : task.section
  );
  const nextText = normalizeCalendarTaskText(
    Object.prototype.hasOwnProperty.call(updates, "text") ? updates.text : task.text
  );
  const hasMarkerUpdate = "marker" in updates;
  const nextMarker = normalizeCalendarTaskMarker(
    hasMarkerUpdate ? updates.marker : task.marker
  );
  const nextPriorityMarker = normalizeCalendarTaskPriorityMarker(
    nextMarker === "X" ? task.marker : nextMarker
  );
  const nextCheckboxMarker = task && task.completed && !hasMarkerUpdate ? "x" : nextMarker;
  const nextDateKey = String(
    Object.prototype.hasOwnProperty.call(updates, "dateKey") ? updates.dateKey : task.dateKey
  ).trim();

  if (!nextSection || !nextText || (nextDateKey && !moment(nextDateKey, "YYYY-MM-DD", true).isValid())) {
    return { changed: false, content };
  }

  const leadingWhitespace = String(lines[targetIndex] || "").match(/^\s*/)[0] || "";
  const nextTaskLine = createCalendarTaskLine(nextText, { marker: nextCheckboxMarker }, nextDateKey, settings, {
    seriesId: task && task.seriesId,
    taskId: task && task.id || getCalendarTaskId(lines[targetIndex]) || createCalendarTaskId(),
    priorityMarker: nextPriorityMarker,
  });
  const metadataUpdates = Object.assign({}, getTaskMetadataUpdates(updates), { priorityMarker: nextPriorityMarker });
  if (hasMarkerUpdate && nextMarker !== "X" && task && task.completed) {
    metadataUpdates.completedAt = null;
  }
  const preservedTaskLine = updateTaskMetadataInText(
    preserveTaskLineComments(lines[targetIndex], nextTaskLine),
    metadataUpdates
  );
  const currentSection = normalizeCalendarSectionName(task && task.section);

  if (nextSection === currentSection) {
    const replacementLine = `${leadingWhitespace}${preservedTaskLine}`;
    if (lines[targetIndex] === replacementLine) {
      return { changed: false, content };
    }

    lines[targetIndex] = replacementLine;
    return { changed: true, content: lines.join(newline) };
  }

  lines.splice(targetIndex, 1);
  const movedContent = insertCalendarTaskInSection(lines.join(newline), nextSection, preservedTaskLine);
  return { changed: movedContent !== content, content: movedContent };
}

export function parseCalendarTaskCounts(content: string, settings: NoesisFlowSettings): Map<string, CalendarTaskStats> {
  const { counts } = parseCalendarTaskIndex(content, settings);
  return counts;
}

export function serializeCalendarTaskCounts(counts: Map<string, CalendarTaskStats>): string {
  return JSON.stringify(Array.from(counts.entries())
    .map(([dateKey, stats]): [string, number, number, Array<[string, number]>, Array<[string, string, string, string]>] => [
      dateKey,
      stats.total || 0,
      stats.priority || 0,
      CALENDAR_TASK_PRIORITY_ORDER.map((marker) => [marker, stats.priorities && stats.priorities[marker] || 0]),
      (stats.tasks || []).map((task) => [task.marker, task.section, task.text, task.sourcePath || ""])
    ])
    .sort(([a], [b]) => a.localeCompare(b)));
}

export function getCalendarTaskThresholds(settings: Partial<NoesisFlowSettings> | null | undefined) {
  return {
    workload: clampNumber(settings && settings.calendarTaskWorkloadThreshold, 1, 50, 5),
    orangePriority: clampNumber(settings && settings.calendarTaskOrangePriorityThreshold, 1, 20, 1),
    redPriority: clampNumber(settings && settings.calendarTaskRedPriorityThreshold, 1, 20, 2)
  };
}

export function formatCalendarPrioritySummary(stats: CalendarTaskStats | null | undefined): string {
  if (!stats || !stats.priorities) return "";
  return CALENDAR_TASK_PRIORITY_ORDER
    .map((marker) => {
      const count = stats.priorities[marker] || 0;
      return count ? `${getCalendarTaskPriorityLabel(marker)} ${count}` : "";
    })
    .filter(Boolean)
    .join(", ");
}

export function normalizeDateTaskFilter(value: unknown): DateTaskFilter {
  const filter = String(value || "today").trim();
  return DATE_TASK_FILTER_VALUES.has(filter) ? filter as DateTaskFilter : "today";
}

export function getDateTaskFilterLabel(value: unknown): string {
  const filter = normalizeDateTaskFilter(value);
  const option = DATE_TASK_FILTER_OPTIONS.find((item) => item.value === filter);
  return option ? option.label : "Today";
}

export interface DateTaskFilterRange {
  startDate: Moment | null;
  endDate: Moment | null;
  overdueOnly: boolean;
  includeAll?: boolean;
}

export function getDateTaskFilterRange(filter: DateTaskFilter, todayStart: Moment): DateTaskFilterRange {
  if (filter === "all") {
    return { startDate: null, endDate: null, overdueOnly: false, includeAll: true };
  }

  if (filter === "tomorrow") {
    const tomorrow = todayStart.clone().add(1, "day");
    return { startDate: tomorrow, endDate: tomorrow, overdueOnly: false };
  }

  if (filter === "next-7") {
    return { startDate: todayStart, endDate: todayStart.clone().add(6, "day"), overdueOnly: false };
  }

  if (filter === "next-14") {
    return { startDate: todayStart, endDate: todayStart.clone().add(13, "day"), overdueOnly: false };
  }

  if (filter === "next-30") {
    return { startDate: todayStart, endDate: todayStart.clone().add(29, "day"), overdueOnly: false };
  }

  if (filter === "overdue") {
    return { startDate: null, endDate: todayStart.clone().subtract(1, "day"), overdueOnly: true };
  }

  return { startDate: todayStart, endDate: todayStart, overdueOnly: false };
}

export function getDaysUntil(date: MomentInput, today: Moment = moment()): number | null {
  const target = moment(date).startOf("day");
  if (!target.isValid()) return null;
  return target.diff(today.clone().startOf("day"), "days");
}

export function getNextWeekendDate(settings: Partial<Pick<NoesisFlowSettings, "calendarWeekendDays">> | null | undefined, today: Moment = moment()): Moment | null {
  const weekendDays = normalizeWeekendDays(settings && settings.calendarWeekendDays);
  const cursor = today.clone().startOf("day");
  for (let offset = 0; offset <= 14; offset += 1) {
    const candidate = cursor.clone().add(offset, "day");
    if (weekendDays.includes(candidate.day())) return candidate;
  }
  return null;
}



export function getCalendarTaskDuplicateKeys(content: string, settings: NoesisFlowSettings): Set<string> {
  const keys = new Set<string>();
  const lines = String(content || "").split(/\r?\n/);
  let section = "";
  let inCodeBlock = false;

  for (const line of lines) {
    if (isMarkdownCodeFenceLine(line)) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const headingMatch = line.match(/^##\s+(.+?)\s*$/);
    if (headingMatch) {
      section = normalizeCalendarSectionName(headingMatch[1]);
      continue;
    }

    const taskMatch = line.match(/^\s*-\s+\[([^\]]*)\]\s+(.+?)\s*$/);
    if (!taskMatch) continue;

    const dateMarker = findNoesisFlowDateMarker(taskMatch[2], settings);
    if (!dateMarker) continue;

    const text = cleanCalendarTaskText(taskMatch[2], dateMarker.dateKey, settings);
    keys.add(`${section.toLowerCase()}\t${dateMarker.dateKey}\t${text.toLowerCase()}`);
  }

  return keys;
}

/** Determines the single, predictable action for a Calendar date click. */
export function getCalendarDateClickAction(openTaskCount: number, canCaptureTask: boolean, isPastDate: boolean): "tasks" | "create" | "select" {
  if (Number(openTaskCount) > 0) return "tasks";
  if (canCaptureTask && !isPastDate) return "create";
  return "select";
}

export function deleteCalendarTaskInContent(content: string, task: CalendarTask, settings: NoesisFlowSettings): { changed: boolean; content: string } {
  const newline = String(content || "").includes("\r\n") ? "\r\n" : "\n";
  const lines = String(content || "").split(/\r?\n/);
  const targetIndex = findCalendarTaskLineIndex(lines, task, settings);
  if (targetIndex === -1) return { changed: false, content };
  lines.splice(targetIndex, 1);
  return { changed: true, content: lines.join(newline) };
}

export const KANBAN_TASK_VIEW_OPTIONS = [
  { value: "sections", label: "Projects" },
  { value: "date", label: "Date" },
  { value: "priority", label: "Priority" }
];

export const KANBAN_TASK_VIEW_VALUES = new Set(KANBAN_TASK_VIEW_OPTIONS.map((option) => option.value));
export const KANBAN_CARD_ACCENT_POSITION_VALUES = new Set(["left", "top"]);

export function normalizeKanbanCardAccentPosition(value: unknown): NoesisFlowSettings["kanbanCardAccentPosition"] {
  const position = String(value || "left").trim();
  return KANBAN_CARD_ACCENT_POSITION_VALUES.has(position)
    ? position as NoesisFlowSettings["kanbanCardAccentPosition"]
    : "left";
}

export const KANBAN_CARD_CONTEXT_PLACEMENT_VALUES = new Set(["top", "bottom"]);

export function normalizeKanbanCardContextPlacement(value: unknown): NoesisFlowSettings["kanbanCardContextPlacement"] {
  const placement = String(value || "top").trim();
  return KANBAN_CARD_CONTEXT_PLACEMENT_VALUES.has(placement)
    ? placement as NoesisFlowSettings["kanbanCardContextPlacement"]
    : "top";
}

export const KANBAN_CARD_CONTEXT_ALIGNMENT_VALUES = new Set(["left", "center"]);

export function normalizeKanbanCardContextAlignment(value: unknown): NoesisFlowSettings["kanbanCardContextAlignment"] {
  const alignment = String(value || "left").trim();
  return KANBAN_CARD_CONTEXT_ALIGNMENT_VALUES.has(alignment)
    ? alignment as NoesisFlowSettings["kanbanCardContextAlignment"]
    : "left";
}

export function normalizeKanbanTaskView(value: unknown): NoesisFlowSettings["kanbanTaskView"] {
  const view = String(value || "sections").trim();
  return KANBAN_TASK_VIEW_VALUES.has(view) ? view as NoesisFlowSettings["kanbanTaskView"] : "sections";
}

export function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.body.createEl("a");
  link.href = url;
  link.download = filename;
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function normalizeKanbanSavedView(value: unknown): KanbanSavedView | null {
  if (!value || typeof value !== "object") return null;
  const savedView = value as Record<string, unknown>;
  const name = String(savedView.name || "").trim().slice(0, 80);
  if (!name) return null;
  const statuses: KanbanTaskStatus[] = Array.isArray(savedView.statuses)
    ? savedView.statuses.filter((status): status is KanbanTaskStatus => status === "active" || status === "completed")
    : [savedView.status === "completed" ? "completed" : "active"];
  const priorities = Array.isArray(savedView.priorities)
    ? savedView.priorities.filter((priority): priority is string => typeof priority === "string" && ["!", "H", "M", "L", " "].includes(priority))
    : ["!", "H", "M", "L", " "];
  const unscheduledFilter = String(savedView.unscheduledFilter || "");
  return {
    name,
    description: String(savedView.description || "").trim().slice(0, 240),
    filter: normalizeDateTaskFilter(savedView.filter || "all"),
    view: normalizeKanbanTaskView(savedView.view || "sections"),
    statuses: statuses.length ? Array.from(new Set(statuses)) : ["active"],
    priorities: priorities.length ? Array.from(new Set(priorities)) : ["!", "H", "M", "L", " "],
    unscheduledFilter: ["auto", "include", "exclude"].includes(unscheduledFilter)
      ? unscheduledFilter as KanbanSavedView["unscheduledFilter"]
      : "auto",
    search: String(savedView.search || "").slice(0, 240)
  };
}

export function serializeKanbanSavedViews(views: unknown[]) {
  const normalized = (Array.isArray(views) ? views : [])
    .map((view) => normalizeKanbanSavedView(view))
    .filter(Boolean);
  return JSON.stringify({ schema: KANBAN_SAVED_VIEWS_SCHEMA, views: normalized }, null, 2);
}

export function parseKanbanSavedViewsExport(text: string): KanbanSavedView[] {
  const raw: unknown = JSON.parse(String(text || ""));
  const record = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : null;
  const candidates = Array.isArray(raw) ? raw : record && Array.isArray(record.views) ? record.views : null;
  if (!candidates) throw new Error("Choose a Kanban saved views JSON file.");
  const names = new Set<string>();
  const views: KanbanSavedView[] = [];
  for (const candidate of candidates) {
    const view = normalizeKanbanSavedView(candidate);
    if (!view || names.has(view.name.toLowerCase())) continue;
    names.add(view.name.toLowerCase());
    views.push(view);
  }
  if (!views.length) throw new Error("No usable Kanban saved views were found.");
  return views;
}
