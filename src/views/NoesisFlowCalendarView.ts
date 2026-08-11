import { ItemView } from "obsidian";
import type { WorkspaceLeaf } from "obsidian";
import type { Moment } from "moment";
import type NoesisFlowPlugin from "../main";
import type { CalendarTask, CalendarTaskStats, TimelineEntry } from "../types";
import { moment } from "../time";
import { NOESIS_FLOW_CALENDAR_VIEW_TYPE, DEFAULT_SETTINGS, asVoidHandler, getCalendarWeekStart, getCalendarWeekdays, getCalendarWeekdayLabel, isSameCalendarWeek, getCalendarMonthRows, getCalendarQuarter, normalizeWeekendDays } from "../utils";
import { createCalendarIconButton, createNoesisFlowWidgetShell, setTooltip } from "../ui/NoesisFlowUi";

type CalendarWeek = { weekNum: number; days: Moment[] };

function isCalendarTask(value: unknown): value is CalendarTask {
  if (!value || typeof value !== "object") return false;
  const task = value as Partial<CalendarTask>;
  return typeof task.text === "string" && typeof task.sourcePath === "string" && typeof task.lineIndex === "number";
}

export class NoesisFlowCalendarView extends ItemView {
  dayTimer: number | null;
  displayedMonth: Moment;
  pickerMode: "day" | "month" | "year";
  plugin: NoesisFlowPlugin;
  selectedDate: Moment;
  today: Moment;
  constructor(leaf: WorkspaceLeaf, plugin: NoesisFlowPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.today = moment();
    this.displayedMonth = this.today.clone().startOf("month");
    this.selectedDate = this.today.clone().startOf("day");
    this.pickerMode = "day";
    this.dayTimer = null;
  }

  getViewType() {
    return NOESIS_FLOW_CALENDAR_VIEW_TYPE;
  }

  getDisplayText() {
    return "Calendar";
  }

  getIcon() {
    return "calendar-days";
  }

  async onOpen() {
    this.contentEl.empty();
    this.contentEl.addClass("noesis-flow-calendar-view-content");
    this.render();
    this.dayTimer = window.setInterval(() => this.refreshToday(), 60000);
    this.registerInterval(this.dayTimer);
  }

  async onClose() {
    window.clearInterval(this.dayTimer);
    this.contentEl.empty();
    this.contentEl.removeClass("noesis-flow-calendar-view-content");
  }

  get settings() {
    return this.plugin.settings || DEFAULT_SETTINGS;
  }

  refreshToday() {
    const nextToday = moment();
    if (this.today && nextToday.isSame(this.today, "day")) return;

    const wasViewingCurrentMonth = this.today && this.displayedMonth.isSame(this.today, "month");
    this.today = nextToday;
    if (wasViewingCurrentMonth) {
      this.displayedMonth = nextToday.clone().startOf("month");
    }
    this.render();
  }

  setDisplayedMonth(date: Moment): void {
    this.displayedMonth = date.clone().startOf("month");
    this.render();
  }

  shiftDisplayedMonth(amount: number): void {
    this.setDisplayedMonth(this.displayedMonth.clone().add(amount, "month"));
  }


  goToToday() {
    this.today = moment();
    this.selectedDate = this.today.clone().startOf("day");
    this.displayedMonth = this.today.clone().startOf("month");
    this.pickerMode = "day";
    this.render();
  }

  showMonthPicker() {
    this.pickerMode = "month";
    this.render();
  }

  showYearPicker() {
    this.pickerMode = "year";
    this.render();
  }

  getYearPickerStart() {
    return Math.floor(this.displayedMonth.year() / 10) * 10;
  }

  shiftPicker(amount: number): void {
    if (this.pickerMode === "month") {
      this.displayedMonth = this.displayedMonth.clone().add(amount, "year").startOf("month");
    } else if (this.pickerMode === "year") {
      this.displayedMonth = this.displayedMonth.clone().add(amount * 10, "year").startOf("month");
    } else {
      this.displayedMonth = this.displayedMonth.clone().add(amount, "month").startOf("month");
    }
    this.render();
  }

  selectMonth(month: number): void {
    this.displayedMonth = this.displayedMonth.clone().month(month).startOf("month");
    this.pickerMode = "day";
    this.render();
  }

  selectYear(year: number): void {
    this.displayedMonth = this.displayedMonth.clone().year(year).startOf("month");
    this.pickerMode = "month";
    this.render();
  }

  selectDate(date: Moment): void {
    this.selectedDate = date.clone().startOf("day");
    if (!date.isSame(this.displayedMonth, "month")) {
      this.displayedMonth = date.clone().startOf("month");
    }
    this.render();
  }

  handleDateClick(date: Moment): void {
    this.selectDate(date);
    this.plugin.openCalendarTaskDayDialog(date);
  }

  getDateHoverLines(date: Moment, taskSignal: CalendarTaskStats, holidayEntries: string[], eventEntries: TimelineEntry[]): Array<{ text: string; kind: string }> {
    const lines: Array<{ text: string; kind: string }> = [];
    const tasks = taskSignal.tasks || [];

    if (taskSignal.total === 1) {
      const task = tasks[0];
      const priority = task && task.priorityLabel && task.priorityLabel !== "No priority"
        ? ` (${task.priorityLabel} priority)`
        : "";
      lines.push({ text: `1 task${priority}`, kind: "summary" });
      if (task && task.text) lines.push({ text: task.text, kind: "detail" });
    } else if (taskSignal.total > 1) {
      const prioritySummary = [
        ["!", "critical"],
        ["H", "high"],
        ["M", "medium"],
        ["L", "low"]
      ]
        .map(([marker, label]) => {
          const count = taskSignal.priorities && taskSignal.priorities[marker] || 0;
          return count ? `${count} ${label}` : "";
        })
        .filter(Boolean)
        .join(", ");
      lines.push({
        text: `${taskSignal.total} tasks${prioritySummary ? `: ${prioritySummary}` : ""}`,
        kind: "summary"
      });
    }

    if (taskSignal.total > 0) {
      lines.push({ text: "Click to open this day's tasks", kind: "hint" });
    }

    for (const holiday of holidayEntries.slice(0, 2)) {
      lines.push({ text: `Holiday: ${holiday}`, kind: "detail" });
    }
    if (holidayEntries.length > 2) {
      lines.push({ text: `${holidayEntries.length} holidays`, kind: "detail" });
    }
    for (const event of eventEntries.slice(0, 2)) {
      lines.push({ text: `Event: ${event.label}`, kind: "detail" });
    }
    if (eventEntries.length > 2) {
      lines.push({ text: `${eventEntries.length} events`, kind: "detail" });
    }

    const canCaptureTask = this.settings.calendarTaskCaptureEnabled && !date.isBefore(moment(), "day");
    if (!lines.length && canCaptureTask) {
      lines.push({ text: "Click to add a task", kind: "hint" });
    }
    return lines;
  }

  render() {
    if (!this.contentEl) return;
    this.contentEl.empty();

    if (!this.settings.calendarAddonEnabled) {
      this.contentEl.createDiv({
        cls: "noesis-flow-calendar-empty",
        text: "Calendar is disabled in Noesis Flow settings."
      });
      return;
    }

    const weekStart = getCalendarWeekStart(this.settings);
    const weekendDays = normalizeWeekendDays(this.settings.calendarWeekendDays);
    const wrapper = this.contentEl.createDiv({ cls: "noesis-flow-calendar-wrapper" });
    wrapper.classList.toggle("calendar-layout-centered-weekdays", this.settings.calendarLayoutStyle === "centered-weekdays");
    wrapper.classList.toggle("week-numbers-left", !!this.settings.calendarShowWeekNumbers && !this.settings.calendarShowWeekNumbersRight);
    wrapper.classList.toggle("weekend-shading-enabled", !!this.settings.calendarShadeWeekendColumns);
    wrapper.classList.toggle("weekend-tint-red", this.settings.calendarWeekendTintTone === "red");
    wrapper.classList.toggle("plain-date-numbers", !!this.settings.calendarPlainDateNumbers);
    wrapper.classList.toggle("calendar-date-shape-circle", this.settings.calendarDateCellShape === "circle");
    wrapper.classList.toggle("show-mobile-today", !!this.settings.calendarShowTodayButtonOnMobile);
    wrapper.classList.toggle("show-quarters", !!this.settings.calendarShowQuarters);
    wrapper.classList.toggle("show-task-counts", !!this.settings.calendarShowTaskCounts);
    wrapper.style.setProperty("--noesis-flow-calendar-title-size", `${this.settings.calendarHeaderDateScale}em`);
    wrapper.style.setProperty("--noesis-flow-calendar-day-size", `${this.settings.calendarDateNumberScale}em`);
    wrapper.style.setProperty("--noesis-flow-calendar-cell-radius", `${this.settings.calendarSelectedDateRadius}px`);
    wrapper.style.setProperty("--noesis-flow-calendar-date-cell-radius", this.settings.calendarDateCellShape === "circle" ? "999px" : `${this.settings.calendarSelectedDateRadius}px`);
    wrapper.style.setProperty("--noesis-flow-calendar-quarter-section-spacing", `${this.settings.calendarQuarterRailSpacing}px`);
    wrapper.style.setProperty("--noesis-flow-calendar-adjacent-opacity", String(this.settings.calendarOverflowDateOpacity));
    wrapper.style.setProperty("--noesis-flow-calendar-weekend-strength", `${this.settings.calendarWeekendTintStrength}%`);
    wrapper.style.setProperty("--noesis-flow-task-critical-color", this.settings.calendarTaskCriticalColor || "#ea4458");
    wrapper.style.setProperty("--noesis-flow-task-high-color", this.settings.calendarTaskHighColor || "#fd884b");
    wrapper.style.setProperty("--noesis-flow-task-medium-color", this.settings.calendarTaskMediumColor || "#f1c24d");
    wrapper.style.setProperty("--noesis-flow-task-low-color", this.settings.calendarTaskLowColor || "#5cdf95");
    wrapper.addClass(`picker-mode-${this.pickerMode}`);

    const { shell, body } = this.renderHeader(wrapper);
    if (this.pickerMode === "day" && this.settings.calendarShowQuarters) {
      this.renderQuarters(shell);
    }
    if (this.pickerMode === "month") {
      this.renderMonthPicker(body);
    } else if (this.pickerMode === "year") {
      this.renderYearPicker(body);
    } else {
      this.renderMonthGrid(body, weekStart, weekendDays);
    }
  }

  renderHeader(container: HTMLElement): ReturnType<typeof createNoesisFlowWidgetShell> {
    const centeredLayout = this.settings.calendarLayoutStyle === "centered-weekdays";
    const pickerLabel = this.pickerMode === "year" ? "decade" : this.pickerMode === "month" ? "year" : "month";
    const widget = createNoesisFlowWidgetShell(container, {
      shellClass: "noesis-flow-calendar-shell",
      headerClass: "noesis-flow-calendar-header",
      titleClass: "noesis-flow-calendar-title",
      actionsClass: "noesis-flow-calendar-actions",
      bodyClass: "noesis-flow-calendar-body",
      renderTitle: (title) => {
        if (this.pickerMode === "year") {
          title.createSpan({
            cls: "noesis-flow-calendar-year noesis-flow-calendar-year-range",
            text: `${this.getYearPickerStart()} - ${this.getYearPickerStart() + 9}`
          });
          return;
        }

        const choosingMonth = this.pickerMode === "day";
        const titleButton = title.createEl("button", {
          cls: `noesis-flow-calendar-title-button ${choosingMonth ? "noesis-flow-calendar-month" : "noesis-flow-calendar-year noesis-flow-calendar-year-button"}`,
          attr: {
            type: "button",
            "aria-label": choosingMonth
              ? `Choose month, currently ${this.displayedMonth.format("MMMM YYYY")}`
              : `Choose year, currently ${this.displayedMonth.format("YYYY")}`
          }
        });
        if (choosingMonth) {
          titleButton.createSpan({
            cls: "noesis-flow-calendar-title-date-full",
            text: this.displayedMonth.format("MMMM, YYYY")
          });
          titleButton.createSpan({
            cls: "noesis-flow-calendar-title-date-short",
            text: this.displayedMonth.format("MMM YYYY")
          });
        } else {
          titleButton.setText(this.displayedMonth.format("YYYY"));
        }
        setTooltip(titleButton, choosingMonth ? "Choose a month" : "Choose a year");
        titleButton.addEventListener("click", () => choosingMonth ? this.showMonthPicker() : this.showYearPicker());
      },
      renderActions: (actions) => {
        if (!centeredLayout) {
          createCalendarIconButton(actions, "chevron-left", `Previous ${pickerLabel}`, () => this.shiftPicker(-1), "<", "noesis-flow-calendar-prev");
        }
        if (!centeredLayout && this.settings.calendarShowTodayButton) {
          createCalendarIconButton(actions, "calendar-days", "Go to today", () => this.goToToday(), "•", "noesis-flow-calendar-today-button");
        }
        createCalendarIconButton(actions, "chevron-right", `Next ${pickerLabel}`, () => this.shiftPicker(1), ">", "noesis-flow-calendar-next");
      }
    });
    if (centeredLayout) {
      const previous = widget.titleRow.createDiv({ cls: "noesis-flow-calendar-centered-nav noesis-flow-calendar-centered-nav-previous" });
      createCalendarIconButton(previous, "chevron-left", `Previous ${pickerLabel}`, () => this.shiftPicker(-1), "<", "noesis-flow-calendar-prev");
      widget.titleRow.insertBefore(previous, widget.title);
      widget.titleRow.addClass("noesis-flow-calendar-centered-title-row");
      widget.actions.addClass("noesis-flow-calendar-centered-nav", "noesis-flow-calendar-centered-nav-next");
    }
    return widget;
  }

  renderMonthPicker(container: HTMLElement): void {
    const picker = container.createDiv({ cls: "noesis-flow-calendar-picker noesis-flow-calendar-month-picker" });
    for (let month = 0; month < 12; month += 1) {
      const date = this.displayedMonth.clone().month(month);
      const button = picker.createEl("button", {
        cls: "noesis-flow-calendar-picker-button noesis-flow-calendar-picker-month",
        text: date.format("MMM"),
        attr: { type: "button", "aria-label": `Show ${date.format("MMMM YYYY")}` }
      });
      button.classList.toggle("active", month === this.displayedMonth.month());
      button.addEventListener("click", () => this.selectMonth(month));
    }
  }

  renderYearPicker(container: HTMLElement): void {
    const picker = container.createDiv({ cls: "noesis-flow-calendar-picker noesis-flow-calendar-year-picker" });
    const decadeStart = this.getYearPickerStart();
    for (let year = decadeStart - 2; year <= decadeStart + 13; year += 1) {
      const button = picker.createEl("button", {
        cls: "noesis-flow-calendar-picker-button noesis-flow-calendar-picker-year",
        text: String(year),
        attr: { type: "button", "aria-label": `Show ${year}` }
      });
      button.classList.toggle("active", year === this.displayedMonth.year());
      button.classList.toggle("adjacent-range", year < decadeStart || year > decadeStart + 9);
      button.addEventListener("click", () => this.selectYear(year));
    }
  }

  renderQuarters(container: HTMLElement): void {
    const quarters = container.createDiv({ cls: "noesis-flow-calendar-quarters" });
    const activeQuarter = getCalendarQuarter(this.displayedMonth.month());

    for (let quarter = 1; quarter <= 4; quarter += 1) {
      const quarterButton = quarters.createEl("button", {
        cls: "noesis-flow-calendar-quarter",
        text: `Q${quarter}`,
        attr: { type: "button" }
      });
      quarterButton.classList.toggle("active", quarter === activeQuarter);
      setTooltip(quarterButton, `Show Q${quarter}`);
      quarterButton.addEventListener("click", () => {
        this.setDisplayedMonth(this.displayedMonth.clone().month((quarter - 1) * 3).startOf("month"));
      });
    }
  }

  renderMonthGrid(container: HTMLElement, weekStart: number, weekendDays: number[]): void {
    const showWeekNumbers = !!this.settings.calendarShowWeekNumbers;
    const showWeekNumbersRight = !!this.settings.calendarShowWeekNumbersRight;
    const table = container.createEl("table", { cls: "noesis-flow-calendar-grid" });
    const colgroup = table.createEl("colgroup");

    if (showWeekNumbers && !showWeekNumbersRight) {
      colgroup.createEl("col", { cls: "noesis-flow-calendar-week-col" });
    }
    for (let index = 0; index < 7; index += 1) {
      colgroup.createEl("col");
    }
    if (showWeekNumbers && showWeekNumbersRight) {
      colgroup.createEl("col", { cls: "noesis-flow-calendar-week-col" });
    }

    const thead = table.createEl("thead");
    const headerRow = thead.createEl("tr");
    if (showWeekNumbers && !showWeekNumbersRight) {
      headerRow.createEl("th", { cls: "noesis-flow-calendar-week-heading" });
    }
    for (const dayIndex of getCalendarWeekdays(weekStart)) {
      const header = headerRow.createEl("th", {
        cls: "noesis-flow-calendar-weekday",
        text: getCalendarWeekdayLabel(dayIndex)
      });
      header.classList.toggle("weekend", weekendDays.includes(dayIndex));
    }
    if (showWeekNumbers && showWeekNumbersRight) {
      headerRow.createEl("th", { cls: "noesis-flow-calendar-week-heading" });
    }

    const tbody = table.createEl("tbody");
    for (const week of getCalendarMonthRows(this.displayedMonth, weekStart)) {
      const row = tbody.createEl("tr");
      if (showWeekNumbers && !showWeekNumbersRight) {
        this.renderWeekNumber(row, week, weekStart, true);
      }
      for (const date of week.days) {
        this.renderDayCell(row, date, weekendDays);
      }
      if (showWeekNumbers && showWeekNumbersRight) {
        this.renderWeekNumber(row, week, weekStart, false);
      }
    }
  }

  renderWeekNumber(row: HTMLTableRowElement, week: CalendarWeek, weekStart: number, gridRight: boolean): void {
    const cell = row.createEl("td", { cls: "noesis-flow-calendar-week-cell" });
    cell.classList.toggle("grid-right", gridRight);

    const button = cell.createEl("button", {
      cls: "noesis-flow-calendar-week-number",
      text: String(week.weekNum),
      attr: { type: "button" }
    });
    button.classList.toggle("active", isSameCalendarWeek(this.selectedDate, week.days[0], weekStart));
    button.addEventListener("click", () => this.selectDate(week.days[0]));
    setTooltip(button, `Week ${week.weekNum}, starting ${week.days[0].format("MMMM D, YYYY")}`);
  }

  renderDayCell(row: HTMLTableRowElement, date: Moment, weekendDays: number[]): void {
    const cell = row.createEl("td", { cls: "noesis-flow-calendar-cell" });
    cell.classList.toggle("weekend", weekendDays.includes(date.day()));

    const button = cell.createEl("button", {
      cls: "noesis-flow-calendar-day",
      text: date.format("D"),
      attr: { type: "button", "aria-label": date.format("dddd, MMMM D, YYYY") }
    });
    button.classList.toggle("today", date.isSame(this.today, "day"));
    button.classList.toggle("active", date.isSame(this.selectedDate, "day"));
    button.classList.toggle("adjacent-month", !date.isSame(this.displayedMonth, "month"));

    const taskSignal = this.plugin.getCalendarTaskSignalForDate(date);
    const holidayEntries = this.plugin.getHolidayEntriesForDate(date);
    const eventEntries = this.plugin.getCalendarEventsForDate(date);
    if (eventEntries.length) {
      button.classList.add("event");
      button.style.setProperty("--noesis-flow-calendar-event-color", this.plugin.getCalendarEventColor());
    }
    if (holidayEntries.length) {
      button.classList.add("holiday");
    }
    if (taskSignal.total > 0) {
      button.classList.add("has-task-indicator");
      if (taskSignal.level) button.classList.add(`task-load-${taskSignal.level}`);
      const dots = button.createSpan({ cls: "noesis-flow-calendar-task-dots", attr: { "aria-hidden": "true" } });
      for (let index = 0; index < taskSignal.dotCount; index += 1) {
        dots.createSpan({ cls: "noesis-flow-calendar-task-dot" });
      }
    }

    button.addEventListener("click", () => this.handleDateClick(date));
    button.addEventListener("dragover", (event) => {
      if (!event.dataTransfer || !Array.from(event.dataTransfer.types).includes("application/x-noesis-flow-task")) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      button.addClass("is-drop-target");
    });
    button.addEventListener("dragleave", () => {
      button.removeClass("is-drop-target");
    });
    button.addEventListener("drop", asVoidHandler(async (event: DragEvent) => {
      event.preventDefault();
      button.removeClass("is-drop-target");
      const rawTask = event.dataTransfer ? event.dataTransfer.getData("application/x-noesis-flow-task") : "";
      if (!rawTask) return;
      try {
        const task: unknown = JSON.parse(rawTask);
        if (!isCalendarTask(task)) return;
        await this.plugin.updateCalendarTask(task, { dateKey: date.format("YYYY-MM-DD") }, `Task moved to ${date.format("MMM D")}.`);
      } catch (error) {
        console.error(error);
      }
    }));
    const hoverLines = this.getDateHoverLines(date, taskSignal, holidayEntries, eventEntries);
    if (!hoverLines.length) {
      button.removeAttribute("aria-description");
      button.removeAttribute("title");
      return;
    }

    const details = hoverLines.map((line) => line.text).join("\n");
    button.setAttribute("aria-description", details);
  }
}
