import { Notice, setIcon, WorkspaceLeaf } from "obsidian";
import type NoesisFlowPlugin from "../main";
import type { CalendarTask } from "../types";
import { NoesisFlowTimedView } from "./NoesisFlowTimedView";
import { moment } from "../time";
import { asVoidHandler, NOESIS_FLOW_PLANNING_VIEW_TYPE } from "../utils";

const PRIORITY_NAMES: Record<string, string> = { "!": "Critical", H: "High", M: "Medium", L: "Low", " ": "Normal" };

interface PlanningDayOptions {
  month?: boolean;
  outsideMonth?: boolean;
}

export class NoesisFlowPlanningView extends NoesisFlowTimedView {
  plugin: NoesisFlowPlugin;
  monthOffset: number;
  draggedTask: CalendarTask | null;

  constructor(leaf: WorkspaceLeaf, plugin: NoesisFlowPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.monthOffset = 0;
    this.draggedTask = null;
  }

  getViewType() { return NOESIS_FLOW_PLANNING_VIEW_TYPE; }
  getDisplayText() { return "Monthly Planner"; }
  getIcon() { return "calendar-range"; }

  async onOpen() {
    this.contentEl.addClass("noesis-flow-planning-view-content");
    await this.plugin.refreshCalendarTaskCounts(false);
    this.render();
    this.startPeriodicRender(60000);
  }

  async onClose() {
    this.stopPeriodicRender();
    this.contentEl.empty();
    this.contentEl.removeClass("noesis-flow-planning-view-content");
  }

  getMonthStart() {
    return moment().startOf("month").add(this.monthOffset, "month");
  }

  getActiveTasks(): CalendarTask[] {
    return this.plugin.getTaskQuery(moment().startOf("day")).actionable;
  }

  renderTaskChip(parent: HTMLElement, task: CalendarTask) {
    const priority = task.marker === " " ? "none" : String(task.marker || "none").toLowerCase();
    const chip = parent.createDiv({ cls: `noesis-flow-planning-task priority-${priority}` });
    chip.draggable = true;
    chip.tabIndex = 0;
    chip.setAttribute("role", "group");
    chip.setAttribute("aria-label", `Task: ${task.text}. Press Enter for task details; use the details button to edit or reschedule.`);
    chip.addEventListener("keydown", (event) => {
      if (event.target instanceof HTMLElement && event.target.closest("button")) return;
      if (!["Enter", " "].includes(event.key)) return;
      event.preventDefault();
      this.plugin.openTaskDetails(task);
    });
    chip.setAttribute("title", `${task.section || "Unsorted"} - ${PRIORITY_NAMES[task.marker] || "Normal"}`);
    chip.createSpan({ cls: "noesis-flow-planning-task-title", text: task.text });
    const details = chip.createEl("button", { cls: "noesis-flow-planning-task-details noesis-flow-task-details-button", attr: { type: "button", "aria-label": `Open task details: ${task.text}`, title: "Task details" } });
    setIcon(details, "panel-right-open");
    details.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.plugin.openTaskDetails(task);
    });
    chip.addEventListener("dragstart", (event) => {
      this.draggedTask = task;
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("application/x-noesis-flow-task", JSON.stringify({ sourcePath: task.sourcePath, lineIndex: task.lineIndex }));
      }
    });
    chip.addEventListener("dragend", () => { this.draggedTask = null; });
    chip.addEventListener("dblclick", () => void this.plugin.openTaskDetails(task));
  }

  renderDay(parent: HTMLElement, day: moment.Moment, tasksByDate: Map<string, CalendarTask[]>, options: PlanningDayOptions = {}) {
    const key = day.format("YYYY-MM-DD");
    const isPast = day.isBefore(moment().startOf("day"), "day");
    const column = parent.createDiv({ cls: "noesis-flow-planning-day" });
    if (options.month) column.addClass("is-month-day");
    if (options.outsideMonth) column.addClass("is-outside-month");
    if (isPast) column.addClass("is-past");
    if (day.isSame(moment(), "day")) column.addClass("is-today");
    const head = column.createDiv({ cls: "noesis-flow-planning-day-heading" });
    if (options.month) {
      head.createSpan({ cls: "noesis-flow-planning-day-name", text: day.format("D") });
    } else {
      head.createSpan({ cls: "noesis-flow-planning-day-name", text: day.format("ddd") });
      head.createSpan({ cls: "noesis-flow-planning-day-date", text: day.format("MMM D") });
    }
    const taskArea = column.createDiv({ cls: "noesis-flow-planning-day-tasks" });
    const tasks = tasksByDate.get(key) || [];
    for (const task of tasks) this.renderTaskChip(taskArea, task);
    if (!isPast) {
      taskArea.addEventListener("dragover", (event) => { event.preventDefault(); taskArea.addClass("is-drop-target"); });
      taskArea.addEventListener("dragleave", () => taskArea.removeClass("is-drop-target"));
      taskArea.addEventListener("drop", asVoidHandler(async (event) => {
        event.preventDefault();
        taskArea.removeClass("is-drop-target");
        const task = this.draggedTask;
        if (!task || task.dateKey === key) return;
        const changed = await this.plugin.updateCalendarTask(task, { dateKey: key }, `Task moved to ${day.format("MMM D")}.`);
        if (!changed) new Notice("Could not reschedule that task.");
        this.draggedTask = null;
      }));
    }
  }

  renderMonthGrid(section: HTMLElement, tasksByDate: Map<string, CalendarTask[]>) {
    const month = this.getMonthStart();
    const grid = section.createDiv({ cls: "noesis-flow-planning-month-grid" });
    for (const weekday of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]) {
      grid.createDiv({ cls: "noesis-flow-planning-month-weekday", text: weekday });
    }
    const start = month.clone().startOf("isoWeek");
    const end = month.clone().endOf("month").endOf("isoWeek");
    for (const day = start.clone(); !day.isAfter(end, "day"); day.add(1, "day")) {
      this.renderDay(grid, day.clone(), tasksByDate, { month: true, outsideMonth: !day.isSame(month, "month") });
    }
  }

  renderMonthlyCalendar(root: HTMLElement, tasksByDate: Map<string, CalendarTask[]>) {
    const section = root.createDiv({ cls: "noesis-flow-planning-section" });
    this.renderMonthGrid(section, tasksByDate);
  }

  renderMonthControls(container: HTMLElement) {
    const previous = container.createEl("button", { attr: { type: "button", "aria-label": "Previous month" } });
    setIcon(previous, "chevron-left");
    previous.addEventListener("click", () => { this.monthOffset -= 1; this.render(); });
    const current = container.createEl("button", { text: "This month", attr: { type: "button", "aria-label": "Return to this month" } });
    current.addEventListener("click", () => { this.monthOffset = 0; this.render(); });
    const next = container.createEl("button", { attr: { type: "button", "aria-label": "Next month" } });
    setIcon(next, "chevron-right");
    next.addEventListener("click", () => { this.monthOffset += 1; this.render(); });
  }

  render() {
    if (!this.contentEl) return;
    this.contentEl.empty();
    if (!this.plugin.settings.tasksAddonEnabled || !this.plugin.settings.planningAddonEnabled) {
      this.contentEl.createDiv({ cls: "noesis-flow-calendar-empty", text: "Monthly Planner is disabled in Noesis Flow settings." });
      return;
    }
    const root = this.contentEl.createDiv({ cls: "noesis-flow-planning" });
    const activeTasks = this.getActiveTasks();
    const scheduledTasks = activeTasks.filter((task) => !!task.dateKey);
    const tasksByDate = new Map<string, CalendarTask[]>();
    for (const task of scheduledTasks) {
      const tasks = tasksByDate.get(task.dateKey) || [];
      tasks.push(task);
      tasksByDate.set(task.dateKey, tasks);
    }
    const today = moment().startOf("day");
    const hero = root.createDiv({ cls: "noesis-flow-planner-hero" });
    const titleBlock = hero.createDiv({ cls: "noesis-flow-planner-title-block" });
    titleBlock.createEl("h2", { cls: "noesis-flow-planner-title", text: "MONTHLY PLANNER" });
    titleBlock.createDiv({ cls: "noesis-flow-planner-kicker", text: this.getMonthStart().format("MMMM YYYY") });
    const heroActions = hero.createDiv({ cls: "noesis-flow-planner-hero-actions" });
    const addTask = heroActions.createEl("button", { text: "New task", cls: "mod-cta", attr: { type: "button" } });
    addTask.addEventListener("click", () => void this.plugin.openQuickTaskCapture({ initialDate: today }));
    this.renderMonthControls(heroActions);
    this.renderMonthlyCalendar(root, tasksByDate);
  }
}
