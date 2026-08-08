import { moment } from "../time";
import {
  CALENDAR_TASK_PRIORITY_ORDER,
  clampNumber,
  createCalendarTaskStats,
  getDateTaskFilterRange,
  getCalendarTaskPriorityLabel,
  normalizeDateTaskFilter
} from "../utils";

export function mergeCalendarTaskStats(target, source) {
  const merged = target || createCalendarTaskStats();
  if (!source) return merged;
  merged.total += source.total || 0;
  merged.priority += source.priority || 0;
  for (const marker of CALENDAR_TASK_PRIORITY_ORDER) {
    merged.priorities[marker] = (merged.priorities[marker] || 0) + (source.priorities?.[marker] || 0);
  }
  merged.tasks.push(...(source.tasks || []));
  return merged;
}

export function getCalendarTaskSignal(stats, settings, date) {
  const cleanStats = stats || { total: 0, priority: 0 };
  const workload = clampNumber(settings?.calendarTaskWorkloadThreshold, 1, 50, 5);
  const orangePriority = clampNumber(settings?.calendarTaskOrangePriorityThreshold, 1, 20, 1);
  const redPriority = clampNumber(settings?.calendarTaskRedPriorityThreshold, 1, 20, 2);
  const total = cleanStats.total || 0;
  const priority = cleanStats.priority || 0;
  const dateMoment = date?.clone ? date.clone().startOf("day") : moment(date).startOf("day");
  const overdue = !!settings?.calendarMarkOverdueTasks && total > 0 && dateMoment.isValid() && dateMoment.isBefore(moment().startOf("day"));
  const dotCount = total <= 0 ? 0 : total >= workload ? 3 : total >= Math.max(2, Math.ceil(workload / 2)) ? 2 : 1;
  const prioritySummary = CALENDAR_TASK_PRIORITY_ORDER.map((marker) => {
    const count = cleanStats.priorities?.[marker] || 0;
    return count ? `${getCalendarTaskPriorityLabel(marker)} ${count}` : "";
  }).filter(Boolean).join(", ");
  const level = overdue ? "overdue" : total >= workload ? priority >= redPriority ? "critical" : priority >= orangePriority ? "warning" : "busy" : "";
  return { total, priority, priorities: cleanStats.priorities || {}, tasks: cleanStats.tasks || [], prioritySummary, overdue, dotCount, level };
}

/** A task is overdue when its single task Date is before today. */
export function isTaskDeadlineOverdue(task, today = moment()) {
  const taskDate = moment(String(task?.dateKey || "").trim(), "YYYY-MM-DD", true).startOf("day");
  return taskDate.isValid() && taskDate.isBefore(today.clone().startOf("day"), "day");
}

export function getDateTaskGroups(tasksByDate, settings, today = moment()) {
  if (!(tasksByDate instanceof Map) || !tasksByDate.size) return [];
  const todayStart = today.clone().startOf("day");
  const filter = normalizeDateTaskFilter(settings?.taskDateFilter);
  const range = getDateTaskFilterRange(filter, todayStart);
  const groups = [];
  for (const [dateKey, tasks] of tasksByDate.entries()) {
    const date = moment(dateKey, "YYYY-MM-DD", true).startOf("day");
    const actionableTasks = Array.isArray(tasks) ? tasks : [];
    if (!date.isValid() || !actionableTasks.length) continue;
    const isOverdue = date.isBefore(todayStart, "day");
    if (!range.includeAll && (range.overdueOnly ? !isOverdue : isOverdue || (range.startDate && date.isBefore(range.startDate, "day")) || (range.endDate && date.isAfter(range.endDate, "day")))) continue;
    groups.push({ date, dateKey, filter, isOverdue, isToday: date.isSame(todayStart, "day"), isTomorrow: date.isSame(todayStart.clone().add(1, "day"), "day"), tasks: actionableTasks });
  }
  return groups.sort((a, b) => filter === "all"
    ? (a.isOverdue !== b.isOverdue ? a.isOverdue ? -1 : 1 : a.isOverdue ? b.date.valueOf() - a.date.valueOf() : a.date.valueOf() - b.date.valueOf())
    : (a.date.valueOf() - b.date.valueOf()) * (filter === "overdue" ? -1 : 1));
}
