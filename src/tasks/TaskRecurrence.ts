import { moment } from "../time";

const WEEKDAY_ALIASES = new Map([
  ["sun", 0], ["sunday", 0], ["su", 0], ["0", 0],
  ["mon", 1], ["monday", 1], ["mo", 1], ["1", 1],
  ["tue", 2], ["tues", 2], ["tuesday", 2], ["tu", 2], ["2", 2],
  ["wed", 3], ["wednesday", 3], ["we", 3], ["3", 3],
  ["thu", 4], ["thur", 4], ["thurs", 4], ["thursday", 4], ["th", 4], ["4", 4],
  ["fri", 5], ["friday", 5], ["fr", 5], ["5", 5],
  ["sat", 6], ["saturday", 6], ["sa", 6], ["6", 6]
]);

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

export function getRecurringTaskWeekdays(value) {
  const weekdays = String(value || "")
    .split(/[,\s|/]+/)
    .map((token) => WEEKDAY_ALIASES.get(token.trim().toLowerCase()))
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
  return unique(weekdays);
}

export function getMonthlyRecurringDate(startDate, offset) {
  const desiredDay = startDate.date();
  const candidate = startDate.clone().startOf("month").add(offset, "month");
  return candidate.date(Math.min(desiredDay, candidate.daysInMonth())).startOf("day");
}

export function getRecurringTaskInterval(recurrence) {
  return Math.round(clampNumber(recurrence && recurrence.interval, 1, 52, 1));
}

export function getRecurringTaskDateKeys(value) {
  const rawValues = Array.isArray(value) ? value : String(value || "").split(/[\s,|/]+/);
  return unique(rawValues
    .map((dateKey) => String(dateKey || "").trim())
    .filter((dateKey) => moment(dateKey, "YYYY-MM-DD", true).isValid()))
    .sort();
}

export function getRecurringTaskDates(startDate, recurrence, settings) {
  const start = startDate && typeof startDate.clone === "function"
    ? startDate.clone().startOf("day")
    : moment(startDate).startOf("day");
  if (!start.isValid()) return [];

  const rule = recurrence && recurrence.rule ? recurrence.rule : "none";
  const interval = getRecurringTaskInterval(recurrence);
  // Runtime continuation may request a larger temporary window than the UI exposes.
  const configuredLimit = clampNumber(settings && settings.recurringTaskOccurrenceLimit, 1, 5000, 6);
  const endMode = recurrence && recurrence.endMode === "count"
    ? "count"
    : recurrence && recurrence.endMode === "date"
      ? "date"
      : "limit";
  const requestedCount = clampNumber(recurrence && recurrence.endCount, 1, configuredLimit, configuredLimit);
  const limit = rule === "none" ? 1 : endMode === "count" ? requestedCount : configuredLimit;
  const endDate = endMode === "date"
    ? moment(recurrence && recurrence.endDate, "YYYY-MM-DD", true).startOf("day")
    : null;
  const holidayDates = new Set(getRecurringTaskDateKeys(settings && settings.recurringTaskHolidayDates));
  const excludedDates = new Set(getRecurringTaskDateKeys(recurrence && recurrence.excludedDates));
  const includedDates = new Set(getRecurringTaskDateKeys(recurrence && recurrence.includedDates));
  const skipWeekends = !!(recurrence && recurrence.skipWeekends);
  const skipHolidays = !!(recurrence && recurrence.skipHolidays);
  const dates = [];

  const isWithinRange = (date) => date && date.isValid()
    && !date.isBefore(start, "day")
    && (!endDate || !endDate.isValid() || !date.isAfter(endDate, "day"));
  const shouldInclude = (date) => {
    if (!isWithinRange(date)) return false;
    const dateKey = date.format("YYYY-MM-DD");
    if (includedDates.has(dateKey)) return true;
    if (excludedDates.has(dateKey)) return false;
    if (skipWeekends && (date.day() === 0 || date.day() === 6)) return false;
    if (skipHolidays && holidayDates.has(dateKey)) return false;
    return true;
  };
  const addDate = (date) => {
    if (shouldInclude(date)) dates.push(date.clone().startOf("day"));
  };

  if (rule === "none" || rule === "after-completion") return [start.clone()];
  addDate(start);
  const maxAttempts = Math.max(limit * 400, 400);
  if (rule === "daily") {
    for (let index = 1; dates.length < limit && index < maxAttempts; index += 1) {
      const candidate = start.clone().add(index * interval, "day");
      if (endDate && endDate.isValid() && candidate.isAfter(endDate, "day")) break;
      addDate(candidate);
    }
  } else if (rule === "weekly") {
    for (let index = 1; dates.length < limit && index < maxAttempts; index += 1) {
      const candidate = start.clone().add(index * interval, "week");
      if (endDate && endDate.isValid() && candidate.isAfter(endDate, "day")) break;
      addDate(candidate);
    }
  } else if (rule === "monthly") {
    for (let index = 1; dates.length < limit && index < maxAttempts; index += 1) {
      const candidate = getMonthlyRecurringDate(start, index * interval);
      if (endDate && endDate.isValid() && candidate.isAfter(endDate, "day")) break;
      addDate(candidate);
    }
  } else {
    const weekdays = rule === "weekdays" ? [1, 2, 3, 4, 5] : getRecurringTaskWeekdays(recurrence.weekdays);
    if (weekdays.length) {
      let cursor = start.clone().add(1, "day");
      const startWeek = start.clone().startOf("week");
      const maxDays = Math.max(52 * 52 * 7, limit * 14);
      for (let guard = 0; dates.length < limit && guard < maxDays; guard += 1) {
        if (endDate && endDate.isValid() && cursor.isAfter(endDate, "day")) break;
        const weekOffset = cursor.clone().startOf("week").diff(startWeek, "weeks");
        if (weekOffset % interval === 0 && weekdays.includes(cursor.day())) addDate(cursor);
        cursor = cursor.clone().add(1, "day");
      }
    }
  }

  for (const dateKey of includedDates) addDate(moment(dateKey, "YYYY-MM-DD", true));

  return dates
    .filter((date) => date && date.isValid())
    .sort((a, b) => a.valueOf() - b.valueOf())
    .filter((date, index, source) => index === 0 || !date.isSame(source[index - 1], "day"))
    .slice(0, limit);
}

/**
 * Finds the missing future dates needed to keep a recurring series useful without
 * changing its explicit end date/count. The generated dates are intentionally
 * bounded so a very old daily series never creates an unbounded write.
 */
export function getRecurringTaskContinuationDates(series, settings, today = moment()) {
  if (!series || series.status === "paused") return [];
  if (series.recurrence && series.recurrence.rule === "after-completion") return [];
  const start = moment(series.startDate, "YYYY-MM-DD", true).startOf("day");
  if (!start.isValid()) return [];

  const horizon = clampNumber(settings && settings.recurringTaskOccurrenceLimit, 1, 26, 6);
  const now = (today && typeof today.clone === "function" ? today.clone() : moment(today)).startOf("day");
  if (!now.isValid()) return [];

  const recurrence = Object.assign({}, series.recurrence || {});
  const recordedDates = getRecurringTaskDateKeys(series.occurrenceDates);
  const existingDates = recordedDates.length
    ? recordedDates
    : getRecurringTaskDates(start, Object.assign({}, recurrence, {
      endMode: "count",
      endCount: Math.max(1, Number(series.occurrenceCount) || 1)
    }), Object.assign({}, settings, {
      recurringTaskOccurrenceLimit: Math.max(1, Number(series.occurrenceCount) || 1)
    })).map((date) => date.format("YYYY-MM-DD"));
  const existing = new Set(existingDates);
  const scheduledFuture = existingDates.filter((dateKey) => !moment(dateKey, "YYYY-MM-DD", true).isBefore(now, "day"));
  const needed = horizon - scheduledFuture.length;
  if (needed <= 0) return [];

  const explicitCount = recurrence.endMode === "count" ? Math.max(1, Number(recurrence.endCount) || 1) : 0;
  const maximum = explicitCount || 5000;
  let generationLimit = Math.min(maximum, Math.max(existingDates.length + horizon, horizon, 16));

  while (generationLimit > 0) {
    const candidateRecurrence = explicitCount
      ? Object.assign({}, recurrence, { endMode: "count", endCount: explicitCount })
      : recurrence.endMode === "date"
        ? recurrence
        : Object.assign({}, recurrence, { endMode: "count", endCount: generationLimit });
    const allDates = getRecurringTaskDates(start, candidateRecurrence, Object.assign({}, settings, {
      recurringTaskOccurrenceLimit: generationLimit
    })).map((date) => date.format("YYYY-MM-DD"));
    const additions = allDates.filter((dateKey) => !existing.has(dateKey) && !moment(dateKey, "YYYY-MM-DD", true).isBefore(now, "day"));
    if (additions.length >= needed || generationLimit >= maximum || allDates.length < generationLimit) {
      return additions.slice(0, needed);
    }
    generationLimit = Math.min(maximum, generationLimit * 2);
  }
  return [];
}

export function getRecurringTaskLabel(recurrence) {
  const rule = recurrence && recurrence.rule ? recurrence.rule : "none";
  const interval = getRecurringTaskInterval(recurrence);
  let label = "";
  if (interval > 1) {
    if (rule === "daily") label = `every ${interval} days`;
    if (rule === "weekly") label = `every ${interval} weeks`;
    if (rule === "monthly") label = `every ${interval} months`;
    if (rule === "weekdays") label = `every ${interval} weeks on weekdays`;
    if (rule === "custom-weekdays") label = `every ${interval} weeks on custom weekdays`;
  }
  if (!label && rule === "daily") label = "daily";
  if (!label && rule === "weekly") label = "weekly";
  if (!label && rule === "monthly") label = "monthly";
  if (!label && rule === "weekdays") label = "weekdays";
  if (!label && rule === "custom-weekdays") label = "custom weekdays";
  if (!label && rule === "after-completion") {
    const completionRule = recurrence && recurrence.completionRule || "weekly";
    const unit = completionRule === "daily" ? "day" : completionRule === "monthly" ? "month" : "week";
    label = interval > 1 ? `${interval} ${unit}s after completion` : `${unit} after completion`;
  }
  if (!label) return "";
  const skips = [recurrence && recurrence.skipWeekends ? "weekends" : "", recurrence && recurrence.skipHolidays ? "holidays" : ""].filter(Boolean);
  return skips.length ? `${label}, skipping ${skips.join(" and ")}` : label;
}

/** Computes one post-completion date without materializing a future horizon. */
export function getNextAfterCompletionDate(completedDate, recurrence, settings) {
  const completed = moment(completedDate).startOf("day");
  if (!completed.isValid()) return null;
  const completionRule = recurrence && recurrence.completionRule || "weekly";
  const candidateRecurrence = Object.assign({}, recurrence, {
    rule: ["daily", "weekly", "monthly"].includes(completionRule) ? completionRule : "weekly",
    endMode: "count",
    endCount: 2
  });
  const candidates = getRecurringTaskDates(completed, candidateRecurrence, Object.assign({}, settings, {
    recurringTaskOccurrenceLimit: 2
  }));
  return candidates.find((candidate) => candidate.isAfter(completed, "day")) || null;
}
