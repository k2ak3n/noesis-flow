import { Modal, Notice } from "obsidian";
import type NoesisFlowPlugin from "../main";
import { moment } from "../time";
import { renderNoesisFlowTaskRow } from "../ui/NoesisFlowUi";

/** Fixed-size, scrollable list shown when a Calendar date already has open tasks. */
export class NoesisFlowCalendarDayTasksModal extends Modal {
  plugin: NoesisFlowPlugin;
  date: any;

  constructor(app, plugin, date) {
    super(app);
    this.plugin = plugin;
    this.date = moment(date).startOf("day");
  }

  onOpen() {
    this.modalEl.addClass("noesis-flow-calendar-day-tasks-modal-container");
    this.render();
    void Promise.all([this.plugin.refreshHolidayCalendar(false), this.plugin.refreshTimelineEntries(false)])
      .then(() => this.render())
      .catch((error) => console.warn("Noesis Flow: unable to refresh day workspace", error));
  }

  createSection(container, titleText, count, actionText, onAction, extraClass = "") {
    const section = container.createDiv({ cls: `noesis-flow-calendar-day-section ${extraClass}`.trim() });
    const sectionHeader = section.createDiv({ cls: "noesis-flow-calendar-day-section-header" });
    const heading = sectionHeader.createDiv({ cls: "noesis-flow-calendar-day-section-heading" });
    heading.createEl("h3", { text: titleText });
    heading.createSpan({ cls: "noesis-flow-calendar-day-tasks-count", text: `(${count})` });
    if (actionText) {
      const action = sectionHeader.createEl("button", { text: actionText, cls: "mod-cta", attr: { type: "button" } });
      action.addEventListener("click", onAction);
    }
    return section.createDiv({ cls: "noesis-flow-calendar-day-section-body" });
  }

  render() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("noesis-flow-dialog", "noesis-flow-calendar-day-tasks-modal");
    const activeTasks = this.plugin.getCalendarTasksForDate(this.date) || [];
    const completedTasks = this.plugin.getCompletedCalendarTasksByDate().get(this.date.format("YYYY-MM-DD")) || [];
    const tasks = [...activeTasks, ...completedTasks];
    const events = this.plugin.getCalendarEventsForDate(this.date) || [];
    const holidays = this.plugin.getHolidayEntriesForDate(this.date) || [];
    const header = contentEl.createDiv({ cls: "noesis-flow-calendar-day-tasks-header" });
    const title = header.createDiv({ cls: "noesis-flow-calendar-day-tasks-title" });
    title.createEl("h2", { text: "DAILY OVERVIEW" });
    const meta = header.createDiv({ cls: "noesis-flow-calendar-day-meta-row" });
    meta.createDiv({ cls: "noesis-flow-calendar-day-tasks-date", text: this.date.format("ddd, MMM D") });
    meta.createDiv({ cls: "noesis-flow-calendar-day-summary", text: `${tasks.length} TASKS / ${events.length} EVENTS / ${holidays.length} HOLIDAYS` });

    const workspace = contentEl.createDiv({ cls: "noesis-flow-calendar-day-workspace" });
    const isPastDate = this.date.isBefore(moment(), "day");
    const taskBody = this.createSection(workspace, "TASKS", tasks.length, isPastDate ? "" : "ADD TASK", () => {
      if (this.date.isBefore(moment(), "day")) {
        new Notice("Tasks cannot be scheduled in the past.");
        return;
      }
      this.plugin.openCalendarTaskCapture(this.date, { onComplete: () => this.render() });
    }, "is-tasks");
    if (!tasks.length) taskBody.createDiv({ cls: "noesis-flow-calendar-day-empty", text: "No tasks on this date." });
    for (const task of tasks) {
      renderNoesisFlowTaskRow(taskBody, task, {
        app: this.app,
        component: this,
        actionsPlacement: "meta",
        onComplete: async (currentTask) => {
          if (await this.plugin.completeCalendarTask(currentTask)) this.render();
        },
        onOpen: (currentTask) => this.plugin.openTaskDetails(currentTask),
      }, "noesis-flow-calendar-day-task-row");
    }

    const canAddEvents = this.plugin.settings.calendarEventsEnabled && !!this.plugin.getTimelineTargetFile(false);
    const eventBody = this.createSection(workspace, "MILESTONES & EVENTS", events.length, !canAddEvents ? "SET UP" : isPastDate ? "" : "ADD EVENT", () => {
      if (!canAddEvents) {
        new Notice("Enable Milestones / Events and choose its source note in Noesis Flow settings.");
        return;
      }
      if (this.date.isBefore(moment(), "day")) {
        new Notice("Events cannot be scheduled in the past.");
        return;
      }
      this.plugin.openTimelineEventCreator(this.date, () => this.render());
    }, "is-events");
    if (!events.length) eventBody.createDiv({ cls: "noesis-flow-calendar-day-empty", text: canAddEvents ? "No milestones or events on this date." : "Set up a Milestones / Events note to add entries." });
    for (const event of events) {
      const row = eventBody.createDiv({ cls: "noesis-flow-calendar-day-reference-row is-event" });
      row.style.setProperty("--noesis-flow-day-reference-color", this.plugin.getCalendarEventColor());
      const details = row.createDiv({ cls: "noesis-flow-calendar-day-reference-details" });
      details.createDiv({ cls: "noesis-flow-calendar-day-reference-title", text: event.label || "Event" });
      details.createDiv({ cls: "noesis-flow-calendar-day-reference-meta", text: event.section || "Milestone / Event" });
      row.createEl("button", { text: "EDIT", attr: { type: "button" } }).addEventListener("click", () => this.plugin.openTimelineEventEditor(event, () => this.render()));
    }

    const canAddHolidays = this.plugin.settings.holidayCalendarEnabled && !!this.plugin.getHolidayCalendarTargetFile(false);
    const holidayBody = this.createSection(workspace, "HOLIDAYS", holidays.length, !canAddHolidays ? "SET UP" : isPastDate ? "" : "ADD HOLIDAY", () => {
      if (!canAddHolidays) {
        new Notice("Enable Holidays and choose its source note in Noesis Flow settings.");
        return;
      }
      if (this.date.isBefore(moment(), "day")) {
        new Notice("Holidays cannot be scheduled in the past.");
        return;
      }
      this.plugin.openHolidayCreator(this.date, () => this.render());
    }, "is-holidays");
    if (!holidays.length) holidayBody.createDiv({ cls: "noesis-flow-calendar-day-empty", text: canAddHolidays ? "No holidays on this date." : "Set up a Holidays note to add entries." });
    for (const label of holidays) {
      const row = holidayBody.createDiv({ cls: "noesis-flow-calendar-day-reference-row is-holiday" });
      const details = row.createDiv({ cls: "noesis-flow-calendar-day-reference-details" });
      details.createDiv({ cls: "noesis-flow-calendar-day-reference-title", text: label || "Holiday" });
      details.createDiv({ cls: "noesis-flow-calendar-day-reference-meta", text: "Holiday" });
      row.createEl("button", { text: "OPEN NOTE", attr: { type: "button" } }).addEventListener("click", () => this.plugin.openHolidaySource());
    }
  }

  onClose() {
    this.modalEl.removeClass("noesis-flow-calendar-day-tasks-modal-container");
    this.contentEl.empty();
  }
}
