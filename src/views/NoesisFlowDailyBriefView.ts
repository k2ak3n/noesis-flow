import { Notice } from "obsidian";
import type NoesisFlowPlugin from "../main";
import type { DateTaskFilter } from "../types";
import { NoesisFlowTimedView } from "./NoesisFlowTimedView";
import { moment } from "../time";
import {
  NOESIS_FLOW_DAILY_BRIEF_VIEW_TYPE,
  DATE_TASK_FILTER_OPTIONS,
  getDaysUntil,
  getNextWeekendDate,
  normalizeDateTaskFilter
} from "../utils";
import { renderNoesisFlowMarkdown, renderNoesisFlowTaskRow } from "../ui/NoesisFlowUi";
import { getNextHolidayCounterEntry } from "../calendar/HolidayMarkdown";

export class NoesisFlowDailyBriefView extends NoesisFlowTimedView {
  plugin: NoesisFlowPlugin;

  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() {
    return NOESIS_FLOW_DAILY_BRIEF_VIEW_TYPE;
  }

  getDisplayText() {
    return "Dashboard";
  }

  getIcon() {
    return "layout-dashboard";
  }

  getBoardTitle() {
    return "DASHBOARD";
  }

  getDisabledText() {
    return "Dashboard is disabled in Noesis Flow settings.";
  }

  isEnabled() {
    return !!this.plugin.settings.dailyBriefAddonEnabled;
  }

  async onOpen() {
    this.contentEl.empty();
    this.contentEl.addClass("noesis-flow-daily-brief-view-content");
    await this.plugin.refreshCalendarTaskCounts(false);
    await this.plugin.refreshHolidayCalendar(false);
    await this.plugin.refreshTimelineEntries(false);
    this.render();
    this.startPeriodicRender(30000);
  }

  async onClose() {
    this.stopPeriodicRender();
    this.contentEl.empty();
    this.contentEl.removeClass("noesis-flow-daily-brief-view-content");
  }

  async completeTask(task, button) {
    if (button) button.disabled = true;
    try {
      await this.plugin.completeCalendarTask(task);
    } catch (error) {
      console.error(error);
      new Notice(`Could not complete task: ${error.message || error}`);
      if (button) button.disabled = false;
    }
  }

  getSectionTitle(group) {
    if (group.isToday) return `TODAY - ${group.date.format("MMM D")}`.toUpperCase();
    if (group.isTomorrow) return `TOMORROW - ${group.date.format("MMM D")}`.toUpperCase();
    return group.date.format("ddd, MMM D").toUpperCase();
  }

  getEmptyText(filter: DateTaskFilter) {
    if (filter === "today") return "NO OPEN TASKS TODAY.";
    if (filter === "tomorrow") return "NO OPEN TASKS TOMORROW.";
    if (filter === "overdue") return "NO OVERDUE TASKS.";
    if (filter === "all") return "NO OPEN DATED TASKS.";
    return "NO OPEN TASKS IN THIS DATE RANGE.";
  }

  async setTaskFilter(value: string) {
    this.plugin.settings.dailyBriefTaskFilter = normalizeDateTaskFilter(value);
    await this.plugin.saveSettings();
    this.render();
  }

  renderTaskFilter(container, filter) {
    const select = container.createEl("select", {
      cls: "dropdown noesis-flow-brief-filter-select",
      attr: { "aria-label": "Dashboard task filter" }
    });
    for (const option of DATE_TASK_FILTER_OPTIONS) {
      select.createEl("option", { text: option.label, attr: { value: option.value } });
    }
    select.value = filter;
    select.addEventListener("change", () => this.setTaskFilter(select.value));
  }

  getPriorityCounts(tasks) {
    const counts = { "!": 0, H: 0, M: 0, L: 0, " ": 0 };
    for (const task of tasks) {
      const marker = Object.prototype.hasOwnProperty.call(counts, task.marker) ? task.marker : " ";
      counts[marker] += 1;
    }
    return counts;
  }

  renderSignal(container, label, value, meta = "", type = "") {
    const signal = container.createDiv({ cls: `noesis-flow-brief-signal ${type ? `type-${type}` : ""}`.trim() });
    signal.createDiv({ cls: "noesis-flow-brief-signal-label", text: label });
    signal.createDiv({ cls: "noesis-flow-brief-signal-value", text: value });
    if (meta) signal.createDiv({ cls: "noesis-flow-brief-signal-meta", text: meta });
  }

  renderPriorityStrip(container, tasks) {
    const counts = this.getPriorityCounts(tasks);
    const strip = container.createDiv({ cls: "noesis-flow-brief-priority-strip" });
    const priorities = [
      ["!", "CRITICAL"],
      ["H", "HIGH"],
      ["M", "MEDIUM"],
      ["L", "LOW"],
      [" ", "NO PRIORITY"]
    ];

    for (const [marker, label] of priorities) {
      const priorityClass = marker === "!" ? "critical" : marker === " " ? "none" : marker.toLowerCase();
      const item = strip.createDiv({ cls: `noesis-flow-brief-priority-item priority-${priorityClass}` });
      item.createSpan({ cls: "noesis-flow-brief-priority-marker" });
      item.createSpan({ cls: "noesis-flow-brief-priority-count", text: String(counts[marker]) });
      item.createSpan({ cls: "noesis-flow-brief-priority-label", text: label });
    }
  }

  renderTaskLane(container, title, tasks, emptyText, extraClass = "") {
    const lane = container.createDiv({ cls: `noesis-flow-brief-task-lane ${extraClass}`.trim() });
    const header = lane.createDiv({ cls: "noesis-flow-brief-lane-header" });
    header.createDiv({ cls: "noesis-flow-brief-lane-title", text: title });
    header.createDiv({
      cls: "noesis-flow-brief-lane-count",
      text: `${tasks.length} ${tasks.length === 1 ? "TASK" : "TASKS"}`
    });

    if (!tasks.length) {
      lane.createDiv({ cls: "noesis-flow-brief-empty-line", text: emptyText });
      return;
    }

    const list = lane.createDiv({ cls: "noesis-flow-brief-task-list" });
    for (const task of tasks.slice(0, 8)) {
      renderNoesisFlowTaskRow(list, task, {
        onOpen: (selectedTask) => this.plugin.openTaskDetails(selectedTask),
        onComplete: (selectedTask, button) => { void this.completeTask(selectedTask, button); },
        actionsPlacement: "meta",
        app: this.app,
        component: this
      }, "noesis-flow-brief-task-item");
    }

    if (tasks.length > 8) {
      lane.createDiv({
        cls: "noesis-flow-brief-more-line",
        text: `${tasks.length - 8} MORE TASKS`
      });
    }
  }

  renderOverduePanel(container, tasks, enabled) {
    const panel = container.createDiv({ cls: "noesis-flow-brief-panel noesis-flow-brief-overdue-panel" });
    const header = panel.createDiv({ cls: "noesis-flow-brief-panel-header" });
    header.createDiv({ cls: "noesis-flow-brief-panel-title", text: "OVERDUE" });
    header.createDiv({
      cls: "noesis-flow-brief-panel-meta",
      text: `${tasks.length} ${tasks.length === 1 ? "TASK" : "TASKS"}`
    });
    if (!enabled) {
      panel.createDiv({ cls: "noesis-flow-brief-empty-line", text: "OVERDUE TASKS ARE HIDDEN IN DASHBOARD SETTINGS." });
      return;
    }
    if (!tasks.length) {
      panel.createDiv({ cls: "noesis-flow-brief-empty-line", text: "NO OVERDUE TASKS." });
      return;
    }
    const list = panel.createDiv({ cls: "noesis-flow-brief-task-list" });
    for (const task of tasks.slice(0, 8)) {
      renderNoesisFlowTaskRow(list, task, {
        onOpen: (selectedTask) => this.plugin.openTaskDetails(selectedTask),
        onComplete: (selectedTask, button) => { void this.completeTask(selectedTask, button); },
        actionsPlacement: "meta",
        app: this.app,
        component: this
      }, "noesis-flow-brief-task-item");
    }
    if (tasks.length > 8) panel.createDiv({ cls: "noesis-flow-brief-more-line", text: `${tasks.length - 8} MORE TASKS` });
  }

  renderTaskGroups(container, groups, filter) {
    const list = container.createDiv({ cls: "noesis-flow-brief-task-groups" });
    if (!groups.length) {
      list.createDiv({ cls: "noesis-flow-brief-empty-line", text: this.getEmptyText(filter) });
      return;
    }

    for (const group of groups) {
      const section = list.createDiv({ cls: "noesis-flow-brief-task-group" });
      section.classList.toggle("is-overdue", group.isOverdue);
      const header = section.createDiv({ cls: "noesis-flow-brief-group-header" });
      header.createDiv({ cls: "noesis-flow-brief-group-title", text: this.getSectionTitle(group) });
      header.createDiv({
        cls: "noesis-flow-brief-lane-count",
        text: `${group.tasks.length} ${group.tasks.length === 1 ? "TASK" : "TASKS"}`
      });

      const taskList = section.createDiv({ cls: "noesis-flow-brief-task-list" });
      for (const task of group.tasks.slice(0, 8)) {
        renderNoesisFlowTaskRow(taskList, task, {
          onOpen: (selectedTask) => this.plugin.openTaskDetails(selectedTask),
          onComplete: (selectedTask, button) => { void this.completeTask(selectedTask, button); },
          actionsPlacement: "meta",
          app: this.app,
          component: this
        }, "noesis-flow-brief-task-item");
      }

      if (group.tasks.length > 8) {
        section.createDiv({
          cls: "noesis-flow-brief-more-line",
          text: `${group.tasks.length - 8} MORE TASKS`
        });
      }
    }
  }

  renderStatsPanel(container, stats, tasks) {
    const panel = container.createDiv({ cls: "noesis-flow-brief-panel noesis-flow-brief-stats-panel" });
    const signalGrid = panel.createDiv({ cls: "noesis-flow-brief-signal-grid" });
    for (const stat of stats) {
      this.renderSignal(signalGrid, stat.label, stat.value, stat.meta, stat.type);
    }

    if (tasks.length) {
      this.renderPriorityStrip(panel, tasks);
    }
  }

  renderEventsPanel(container, items) {
    const panel = container.createDiv({ cls: "noesis-flow-brief-panel noesis-flow-brief-events-panel" });
    const header = panel.createDiv({ cls: "noesis-flow-brief-panel-header" });
    header.createDiv({ cls: "noesis-flow-brief-panel-title", text: "EVENTS / HOLIDAYS" });

    if (!items.length) {
      panel.createDiv({ cls: "noesis-flow-brief-empty-line", text: "NO UPCOMING EVENTS OR HOLIDAYS." });
      return;
    }

    const list = panel.createDiv({ cls: "noesis-flow-brief-next-list" });
    for (const item of items) {
      const row = list.createDiv({ cls: `noesis-flow-brief-next-row type-${item.type || "item"}` });
      const date = row.createDiv({ cls: "noesis-flow-brief-next-date" });
      if (item.type === "event") {
        date.style.setProperty("--noesis-flow-event-color", this.plugin.getCalendarEventColor());
      }
      date.createDiv({ cls: "noesis-flow-brief-next-value", text: item.value });
      date.createDiv({ cls: "noesis-flow-brief-next-unit", text: item.unit });
      const text = row.createDiv({ cls: "noesis-flow-brief-next-text" });
      renderNoesisFlowMarkdown(text.createDiv({ cls: "noesis-flow-brief-next-title" }), item.label, {
        app: this.app,
        component: this,
        sourcePath: item.sourcePath || ""
      });
      text.createDiv({ cls: "noesis-flow-brief-next-meta", text: item.meta });
    }
  }

  renderEventuallyPanel(container, tasks, totalCount) {
    const panel = container.createDiv({ cls: "noesis-flow-brief-panel noesis-flow-brief-eventually-panel" });
    const header = panel.createDiv({ cls: "noesis-flow-brief-panel-header" });
    header.createDiv({ cls: "noesis-flow-brief-panel-title", text: "UNSCHEDULED" });
    header.createDiv({
      cls: "noesis-flow-brief-panel-meta",
      text: `${totalCount} ${totalCount === 1 ? "TASK" : "TASKS"}`
    });

    if (!tasks.length) {
      panel.createDiv({ cls: "noesis-flow-brief-empty-line", text: "NO UNSCHEDULED OPEN TASKS." });
      return;
    }

    const list = panel.createDiv({ cls: "noesis-flow-brief-eventually-list" });
    for (const task of tasks) {
      renderNoesisFlowTaskRow(list, task, {
        onOpen: (selectedTask) => this.plugin.openTaskDetails(selectedTask),
        onComplete: (selectedTask, button) => { void this.completeTask(selectedTask, button); },
        actionsPlacement: "meta",
        app: this.app,
        component: this
      }, "noesis-flow-brief-task-item noesis-flow-brief-eventually-task");
    }

    if (totalCount > tasks.length) {
      panel.createDiv({
        cls: "noesis-flow-brief-more-line",
        text: `${totalCount - tasks.length} MORE TASKS`
      });
    }
  }

  getEventItems(today, showNextHoliday, showWeekend) {
    const entries = this.plugin.getTimelineEntries()
      .filter((entry) => entry.type !== "holiday" || showNextHoliday);
    const items = entries.slice(0, 8).map((entry) => {
      const days = getDaysUntil(entry.date, today);
      return {
        type: entry.type || "event",
        value: days === 0 ? "TODAY" : String(days),
        unit: days === 0 ? "" : days === 1 ? "DAY" : "DAYS",
        label: entry.label,
        meta: `${entry.date.format("ddd, MMM D")} - ${entry.section || (entry.type === "holiday" ? "Holiday" : "Event")}`
      };
    });

    const holiday = getNextHolidayCounterEntry(this.plugin.holidayCalendarEntries, today);
    if (showNextHoliday && holiday) {
      const alreadyListed = items.some((item) => item.type === "holiday" && item.label === holiday.label);
      if (!alreadyListed) {
        const days = getDaysUntil(holiday.date, today);
        items.push({
          type: "holiday",
          value: days === 0 ? "TODAY" : String(days),
          unit: days === 0 ? "" : days === 1 ? "DAY" : "DAYS",
          label: holiday.label,
          meta: `${holiday.date.format("ddd, MMM D")} - Holiday`
        });
      }
    }

    if (showWeekend) {
      const weekendDate = getNextWeekendDate(this.plugin.settings, today);
      const weekendDays = weekendDate ? getDaysUntil(weekendDate, today) : null;
      items.push({
        type: "weekend",
        value: weekendDays === null ? "-" : weekendDays === 0 ? "TODAY" : String(weekendDays),
        unit: weekendDays === 0 ? "" : weekendDays === 1 ? "DAY" : "DAYS",
        label: "Weekend",
        meta: weekendDate ? `${weekendDate.format("ddd, MMM D")} - Calendar` : "Weekend days are not configured"
      });
    }

    return items
      .sort((a, b) => {
        if (a.value === "TODAY" && b.value !== "TODAY") return -1;
        if (a.value !== "TODAY" && b.value === "TODAY") return 1;
        const aNumber = Number(a.value);
        const bNumber = Number(b.value);
        if (Number.isFinite(aNumber) && Number.isFinite(bNumber) && aNumber !== bNumber) return aNumber - bNumber;
        return String(a.label).localeCompare(String(b.label));
      })
      .slice(0, 8);
  }

  render() {
    if (!this.contentEl) return;
    this.contentEl.empty();

    if (!this.isEnabled()) {
      this.contentEl.createDiv({ cls: "noesis-flow-calendar-empty", text: this.getDisabledText() });
      return;
    }

    const today = moment().startOf("day");
    const taskQuery = this.plugin.getTaskQuery(today);
    const todayTasks = taskQuery.actionable.filter((task) => task.dateKey === today.format("YYYY-MM-DD"));
    const overdueTasks = this.plugin.getOverdueCalendarTasks(12);
    const eventuallyTasks = this.plugin.getUndatedCalendarTasks(0);
    const eventuallyTaskCount = this.plugin.getUndatedCalendarTasks(0).length;
    const timerSummary = this.plugin.getTimerSummary();
    const taskFilter = normalizeDateTaskFilter(this.plugin.settings.dailyBriefTaskFilter || "today");
    const showTodayTasks = !!this.plugin.settings.dailyBriefShowTodayTasks;
    const showOverdueTasks = !!this.plugin.settings.dailyBriefShowOverdueTasks;
    const showNextHoliday = !!this.plugin.settings.dailyBriefShowNextHoliday;
    const showWeekend = !!this.plugin.settings.dailyBriefShowWeekend;
    const showTimer = !!this.plugin.settings.dailyBriefShowTimer;
    const taskGroups = this.plugin.getDateTaskGroups(taskFilter, today);
    const displayTaskGroups = taskGroups.filter((group) => {
      if (!showTodayTasks && group.isToday) return false;
      if (!showOverdueTasks && group.isOverdue) return false;
      return true;
    });
    const mainTaskGroups = taskFilter === "overdue"
      ? displayTaskGroups
      : displayTaskGroups.filter((group) => !group.isOverdue);
    const visibleTasks = [...mainTaskGroups.flatMap((group) => group.tasks), ...(showOverdueTasks ? overdueTasks : [])];
    const visibleTaskCount = visibleTasks.length;
    const filterHasOverdue = showOverdueTasks && overdueTasks.length > 0;
    const briefTone = filterHasOverdue
      ? "Attention"
      : visibleTaskCount
        ? "Active"
        : "Clear";

    const board = this.contentEl.createDiv({ cls: "noesis-flow-daily-brief-board" });
    const hero = board.createDiv({ cls: "noesis-flow-brief-hero" });
    const titleBlock = hero.createDiv({ cls: "noesis-flow-brief-title-block" });
    titleBlock.createEl("h2", { cls: "noesis-flow-brief-title", text: this.getBoardTitle() });
    const dateLine = titleBlock.createDiv({ cls: "noesis-flow-brief-date" });
    dateLine.createSpan({ cls: "noesis-flow-brief-weekday", text: today.format("dddd") });
    dateLine.createSpan({ cls: "noesis-flow-brief-date-separator", text: String.fromCharCode(183) });
    dateLine.createSpan({ cls: "noesis-flow-brief-date-value", text: today.format("MMM D, YYYY") });
    const heroActions = hero.createDiv({ cls: "noesis-flow-brief-hero-actions" });
    const addTask = heroActions.createEl("button", { text: "New task", cls: "mod-cta", attr: { type: "button" } });
    addTask.addEventListener("click", () => void this.plugin.openQuickTaskCapture({ initialDate: today }));
    this.renderTaskFilter(heroActions, taskFilter);

    const priorityCounts = this.getPriorityCounts(visibleTasks);
    const highSignalCount = priorityCounts["!"] + priorityCounts.H;
    const noPriorityCount = priorityCounts[" "];
    const stats = [{
      label: "STATUS",
      value: briefTone.toUpperCase(),
      meta: `${visibleTaskCount} OPEN ${visibleTaskCount === 1 ? "ITEM" : "ITEMS"}`,
      type: filterHasOverdue ? "overdue" : ""
    }];
    if (showTodayTasks) {
      stats.push({
        label: "TODAY",
        value: String(todayTasks.length),
        meta: todayTasks.length === 1 ? "OPEN TASK" : "OPEN TASKS",
        type: "today"
      });
    }
    if (showOverdueTasks) {
      stats.push({
        label: "OVERDUE",
        value: String(overdueTasks.length),
        meta: overdueTasks.length === 1 ? "OPEN TASK" : "OPEN TASKS",
        type: overdueTasks.length ? "overdue" : ""
      });
    }
    if (visibleTasks.length) {
      stats.push({
        label: "HIGH SIGNAL",
        value: String(highSignalCount),
        meta: "CRITICAL / HIGH",
        type: highSignalCount ? "priority" : ""
      });
      stats.push({
        label: "NO PRIORITY",
        value: String(noPriorityCount),
        meta: noPriorityCount === 1 ? "OPEN TASK" : "OPEN TASKS",
        type: noPriorityCount ? "none" : ""
      });
    }
    if (showTimer) {
      const timerParts = timerSummary.split(" - ");
      stats.push({
        label: "POMODORO",
        value: timerParts.length > 1 ? timerParts[timerParts.length - 1].toUpperCase() : "READY",
        meta: timerParts.length > 1 ? timerParts.slice(0, -1).join(" - ").toUpperCase() : timerSummary.toUpperCase(),
        type: "timer"
      });
    }

    this.renderStatsPanel(board, stats, visibleTasks);

    const main = board.createDiv({ cls: "noesis-flow-brief-main-grid" });
    const taskPanel = main.createDiv({ cls: "noesis-flow-brief-panel noesis-flow-brief-task-panel" });
    const taskHeader = taskPanel.createDiv({ cls: "noesis-flow-brief-panel-header" });
    taskHeader.createDiv({ cls: "noesis-flow-brief-panel-title", text: "TASKS" });

    if (!showTodayTasks) {
      taskPanel.createDiv({ cls: "noesis-flow-brief-empty-line", text: "TASK SECTIONS ARE HIDDEN IN DASHBOARD SETTINGS." });
    } else {
      this.renderTaskGroups(taskPanel, mainTaskGroups, taskFilter);
    }

    this.renderOverduePanel(main, overdueTasks, showOverdueTasks);
    this.renderEventsPanel(main, this.getEventItems(today, showNextHoliday, showWeekend));
    this.renderEventuallyPanel(board, eventuallyTasks, eventuallyTaskCount);
  }
}
