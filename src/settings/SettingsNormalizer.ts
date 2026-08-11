import { moment } from "../time";
import { NoesisFlowSettings } from "../types";
import {
  DEFAULT_VIEW_PLACEMENTS,
  NOESIS_FLOW_DAILY_BRIEF_VIEW_TYPE,
  NOESIS_FLOW_KANBAN_VIEW_TYPE,
  NOESIS_FLOW_PLANNING_VIEW_TYPE,
  NOESIS_FLOW_TASK_LIST_VIEW_TYPE,
  NOESIS_FLOW_VIEW_TYPES,
  clampNumber,
  normalizeTimerSoundPath,
  sanitizeCssText,
  unique
} from "../utils";

/** Normalizes persisted, user-editable settings that have simple invariants. */
export function normalizeSettingsSchema(settings: NoesisFlowSettings, loaded: unknown): void {
  const raw = loaded && typeof loaded === "object" ? loaded as Record<string, unknown> : {};

  settings.calendarPlainDateNumbers = !!settings.calendarPlainDateNumbers;
  settings.calendarDateCellShape = settings.calendarDateCellShape === "circle" ? "circle" : "square";

  settings.timerFocusMinutes = clampNumber(settings.timerFocusMinutes, 1, 240, 25);
  settings.timerBreakMinutes = clampNumber(settings.timerBreakMinutes, 1, 120, 5);
  settings.timerLongBreakMinutes = clampNumber(settings.timerLongBreakMinutes, 1, 120, 20);
  settings.timerFocusCycles = clampNumber(settings.timerFocusCycles, 1, 12, 4);
  settings.timerLongBreakInterval = Math.min(settings.timerFocusCycles, clampNumber(settings.timerLongBreakInterval, 1, 12, 4));
  settings.timerSoundPath = normalizeTimerSoundPath(settings.timerSoundPath);
  settings.timerCompletionSoundEnabled = settings.timerCompletionSoundEnabled !== false;
  settings.timerDesktopNotifications = !!settings.timerDesktopNotifications;

  const storedTimerSession = raw.timerSessionState;
  settings.timerSessionState = storedTimerSession && typeof storedTimerSession === "object"
    ? {
        mode: ["focus", "break", "long-break"].includes(String((storedTimerSession as Record<string, unknown>).mode))
          ? String((storedTimerSession as Record<string, unknown>).mode)
          : "focus",
        completedFocusCycles: Math.max(0, Math.min(settings.timerFocusCycles, Math.round(Number((storedTimerSession as Record<string, unknown>).completedFocusCycles) || 0))),
        remainingSeconds: Math.max(0, Math.round(Number((storedTimerSession as Record<string, unknown>).remainingSeconds) || 0)),
        running: !!(storedTimerSession as Record<string, unknown>).running,
        endsAt: Math.max(0, Number((storedTimerSession as Record<string, unknown>).endsAt) || 0)
      }
    : null;

  settings.recurringTaskOccurrenceLimit = clampNumber(settings.recurringTaskOccurrenceLimit, 2, 26, 6);
  settings.recurringTaskAutoExtend = settings.recurringTaskAutoExtend !== false;
  settings.recurringTaskManagerEnabled = settings.recurringTaskManagerEnabled !== false;
  settings.recurringTaskSeries = Array.isArray(settings.recurringTaskSeries)
    ? settings.recurringTaskSeries
      .filter((series) => series && typeof series.id === "string" && typeof series.text === "string")
      .map((series) => ({
        ...series,
        status: series.status === "paused" ? "paused" : "active",
        occurrenceCount: Math.max(1, Math.round(Number(series.occurrenceCount) || 1)),
        occurrenceDates: Array.isArray(series.occurrenceDates)
          ? unique(series.occurrenceDates
            .filter((dateKey): dateKey is string => typeof dateKey === "string" && moment(dateKey, "YYYY-MM-DD", true).isValid()))
            .sort()
          : undefined
      }))
    : [];

  settings.timelineRangeDays = clampNumber(settings.timelineRangeDays, 7, 365, 60);
  settings.calendarEventColor = sanitizeCssText(settings.calendarEventColor, "#eab308");
  settings.calendarTaskCriticalColor = sanitizeCssText(settings.calendarTaskCriticalColor, "#ea4458");
  settings.calendarTaskHighColor = sanitizeCssText(settings.calendarTaskHighColor, "#fd884b");
  settings.calendarTaskMediumColor = sanitizeCssText(settings.calendarTaskMediumColor, "#f1c24d");
  settings.calendarTaskLowColor = sanitizeCssText(settings.calendarTaskLowColor, "#5cdf95");

  settings.viewPlacements = Object.fromEntries(Object.entries({
    ...DEFAULT_VIEW_PLACEMENTS,
    ...(raw.viewPlacements && typeof raw.viewPlacements === "object" ? raw.viewPlacements : {})
  }).filter(([type]) => NOESIS_FLOW_VIEW_TYPES.includes(type)));
  settings.viewPlacements[NOESIS_FLOW_DAILY_BRIEF_VIEW_TYPE] = "main";
  settings.viewPlacements[NOESIS_FLOW_TASK_LIST_VIEW_TYPE] = "main";
  settings.viewPlacements[NOESIS_FLOW_PLANNING_VIEW_TYPE] = "main";
  settings.viewPlacements[NOESIS_FLOW_KANBAN_VIEW_TYPE] = "main";
}
