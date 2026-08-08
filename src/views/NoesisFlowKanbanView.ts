import { Notice, setIcon } from "obsidian";
import type { WorkspaceLeaf } from "obsidian";
import type { Moment } from "moment";
import type NoesisFlowPlugin from "../main";
import type { CalendarTask, DateTaskFilter, KanbanTaskStatus, KanbanTaskView, KanbanUnscheduledFilter } from "../types";
import { NoesisFlowTimedView } from "./NoesisFlowTimedView";
import { moment } from "../time";
import {
  NOESIS_FLOW_KANBAN_VIEW_TYPE,
  asVoidHandler,
  KANBAN_TASK_VIEW_OPTIONS,
  getDateTaskFilterLabel,
  getDateTaskFilterRange,
  normalizeDateTaskFilter,
  normalizeKanbanTaskView
} from "../utils";
import { renderNoesisFlowTaskRow } from "../ui/NoesisFlowUi";
import { NoesisFlowKanbanFilterModal } from "../modals/NoesisFlowKanbanFilterModal";
import { NoesisFlowKanbanSavedViewModal } from "../modals/NoesisFlowKanbanSavedViewModal";

const PRIORITY_COLUMNS = [
  { value: "!", title: "Critical" },
  { value: "H", title: "High" },
  { value: "M", title: "Medium" },
  { value: "L", title: "Low" },
  { value: " ", title: "No priority" }
];

type KanbanColumn = {
  title: string;
  value: string;
  tasks: CalendarTask[];
};

export class NoesisFlowKanbanView extends NoesisFlowTimedView {
  plugin: NoesisFlowPlugin;
  draggedTask: CalendarTask | null;
  searchQuery: string;
  weekOffset: number;

  constructor(leaf: WorkspaceLeaf, plugin: NoesisFlowPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.draggedTask = null;
    this.searchQuery = "";
    this.weekOffset = 0;
  }

  getViewType() {
    return NOESIS_FLOW_KANBAN_VIEW_TYPE;
  }

  getDisplayText() {
    return "Kanban";
  }

  getIcon() {
    return "columns-3";
  }

  async onOpen() {
    this.contentEl.empty();
    this.contentEl.addClass("noesis-flow-kanban-view-content");
    await this.plugin.refreshCalendarTaskCounts(false);
    await this.plugin.refreshHolidayCalendar(false);
    await this.plugin.refreshTimelineEntries(false);
    this.render();
    this.startPeriodicRender(60000);
  }

  async onClose() {
    this.stopPeriodicRender();
    this.contentEl.empty();
    this.contentEl.removeClass("noesis-flow-kanban-view-content");
  }

  async completeTask(task: CalendarTask, button?: HTMLButtonElement | null): Promise<void> {
    if (button) button.disabled = true;
    try {
      await this.plugin.completeCalendarTask(task);
    } catch (error) {
      console.error(error);
      new Notice(`Could not complete task: ${error instanceof Error ? error.message : String(error)}`);
      if (button) button.disabled = false;
    }
  }

  async setTaskFilter(value: string) {
    this.plugin.settings.kanbanTaskFilter = normalizeDateTaskFilter(value);
    await this.plugin.saveSettings();
    this.render();
  }

  async setTaskView(value: string) {
    this.plugin.settings.kanbanTaskView = normalizeKanbanTaskView(value);
    await this.plugin.saveSettings();
    this.render();
  }


  renderTaskView(container: HTMLElement, view: KanbanTaskView): void {
    const select = container.createEl("select", {
      cls: "dropdown noesis-flow-kanban-view-select",
      attr: { "aria-label": "Kanban grouping" }
    });
    for (const option of KANBAN_TASK_VIEW_OPTIONS) {
      select.createEl("option", { text: option.label, attr: { value: option.value } });
    }
    select.value = view;
    select.addEventListener("change", () => this.setTaskView(select.value));
  }

  openFilterDialog() {
    const dateView = normalizeKanbanTaskView(this.plugin.settings.kanbanTaskView || "sections") === "date";
    new NoesisFlowKanbanFilterModal(
      this.app,
      this.plugin.settings.kanbanTaskStatuses,
      this.plugin.settings.kanbanPriorityFilters,
      this.plugin.settings.kanbanTaskFilter,
      this.plugin.settings.kanbanUnscheduledFilter,
      (statuses, priorities, filter, unscheduledFilter) => this.setFilterValues(statuses, priorities, filter, unscheduledFilter),
      !dateView
    ).open();
  }

  async setFilterValues(statuses: KanbanTaskStatus[], priorities: string[], filter: string = this.plugin.settings.kanbanTaskFilter, unscheduledFilter: KanbanUnscheduledFilter = this.plugin.settings.kanbanUnscheduledFilter): Promise<void> {
    this.plugin.settings.kanbanTaskStatuses = statuses;
    this.plugin.settings.kanbanPriorityFilters = priorities;
    this.plugin.settings.kanbanTaskFilter = normalizeDateTaskFilter(filter);
    this.plugin.settings.kanbanUnscheduledFilter = unscheduledFilter === "include" ? "include" : unscheduledFilter === "exclude" ? "exclude" : "auto";
    await this.plugin.saveSettings();
    this.render();
  }

  renderSearch(container: HTMLElement): void {
    const input = container.createEl("input", {
      cls: "noesis-flow-kanban-search",
      attr: { type: "search", placeholder: "Search tasks", "aria-label": "Search Kanban tasks" }
    });
    input.value = this.searchQuery;
    const applySearch = () => {
      this.searchQuery = input.value;
      this.render();
    };
    input.addEventListener("change", applySearch);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") applySearch();
    });
  }

  renderSavedViews(container: HTMLElement): void {
    const views = Array.isArray(this.plugin.settings.kanbanSavedViews) ? this.plugin.settings.kanbanSavedViews : [];
    const select = container.createEl("select", { cls: "dropdown noesis-flow-kanban-saved-select", attr: { "aria-label": "Saved Kanban views" } });
    select.createEl("option", { text: "Saved views", attr: { value: "" } });
    views.forEach((saved, index) => select.createEl("option", { text: saved.name || `View ${index + 1}`, attr: { value: String(index) } }));
    select.addEventListener("change", asVoidHandler(async () => {
      const saved = views[Number(select.value)];
      if (!saved) return;
      await this.plugin.applyKanbanSavedView(saved);
    }));
    const saveButton = container.createEl("button", { text: "Save", attr: { type: "button", "aria-label": "Save current Kanban view" } });
    saveButton.addEventListener("click", () => new NoesisFlowKanbanSavedViewModal(this.app, {}, async (details) => {
      const savedViews = Array.isArray(this.plugin.settings.kanbanSavedViews) ? this.plugin.settings.kanbanSavedViews : [];
      savedViews.push(Object.assign({}, details, { filter: this.plugin.settings.kanbanTaskFilter, view: this.plugin.settings.kanbanTaskView, statuses: this.plugin.settings.kanbanTaskStatuses, priorities: this.plugin.settings.kanbanPriorityFilters, unscheduledFilter: this.plugin.settings.kanbanUnscheduledFilter, search: this.searchQuery }));
      this.plugin.settings.kanbanSavedViews = savedViews;
      await this.plugin.saveSettings();
      this.render();
    }).open());
  }

  getTaskDateLabel(task: Pick<CalendarTask, "dateKey">, today: Moment): string {
    if (!task.dateKey) return "Unscheduled";
    const date = moment(task.dateKey, "YYYY-MM-DD", true).startOf("day");
    if (!date.isValid()) return "Unscheduled";
    if (date.isBefore(today, "day")) return date.format("ddd, MMM D");
    if (date.isSame(today, "day")) return "Today";
    if (date.isSame(today.clone().add(1, "day"), "day")) return "Tomorrow";
    return date.format("ddd, MMM D");
  }

  getTaskPriorityOrder(task: CalendarTask): number {
    const order: Record<string, number> = { "!": 0, H: 1, M: 2, L: 3, " ": 4 };
    return Object.prototype.hasOwnProperty.call(order, task.marker) ? order[task.marker] : 4;
  }

  shouldShowUnscheduled(filter: DateTaskFilter, view: KanbanTaskView = "sections"): boolean {
    if (view === "date") return false;
    const setting = this.plugin.settings.kanbanUnscheduledFilter || "auto";
    if (setting === "include") return true;
    if (setting === "exclude") return false;
    return filter === "all";
  }

  getVisibleTasks(filter: DateTaskFilter, status: KanbanTaskStatus = "active", includeUnscheduled = this.shouldShowUnscheduled(filter)): CalendarTask[] {
    const today = moment().startOf("day");
    const taskQuery = this.plugin.getTaskQuery(today);
    const candidates = status === "completed" ? taskQuery.completed : taskQuery.actionable;
    const range = getDateTaskFilterRange(filter, today);
    const tasks = candidates.filter((task) => {
      const date = moment(task.dateKey, "YYYY-MM-DD", true).startOf("day");
      if (range.overdueOnly) return status === "active" && taskQuery.pastScheduled.includes(task);
      if (!date.isValid()) return range.includeAll && includeUnscheduled;
      if (range.includeAll) return true;
      return !date.isBefore(today, "day")
        && (!range.startDate || !date.isBefore(range.startDate, "day"))
        && (!range.endDate || !date.isAfter(range.endDate, "day"));
    });
    return tasks;
  }

  sortTasks(tasks: CalendarTask[], view: KanbanTaskView): CalendarTask[] {
    return tasks.sort((a, b) => {
      if (this.plugin.settings.kanbanCardOrder === "custom" && view === "sections") {
        const source = String(a.sourcePath || "").localeCompare(String(b.sourcePath || ""));
        return source || (a.lineIndex || 0) - (b.lineIndex || 0);
      }
      const aDate = String(a.dateKey || "9999-12-31");
      const bDate = String(b.dateKey || "9999-12-31");
      const aPriority = this.getTaskPriorityOrder(a);
      const bPriority = this.getTaskPriorityOrder(b);
      if (view === "date" && aPriority !== bPriority) return aPriority - bPriority;
      if (view !== "date" && aDate !== bDate) return aDate.localeCompare(bDate);
      if (view !== "priority" && aPriority !== bPriority) return aPriority - bPriority;
      const source = String(a.sourcePath || "").localeCompare(String(b.sourcePath || ""));
      return source || (a.lineIndex || 0) - (b.lineIndex || 0);
    });
  }

  getColumns(filter: DateTaskFilter, view: KanbanTaskView, statuses: KanbanTaskStatus[]): KanbanColumn[] {
    const query = this.searchQuery.trim().toLowerCase();
    const weekStart = moment().startOf("isoWeek").add(this.weekOffset, "week");
    const weekEnd = weekStart.clone().add(6, "day");
    const visibleFilter = view === "date" ? "all" : filter;
    const showUnscheduled = this.shouldShowUnscheduled(visibleFilter, view);
    const tasks = statuses.flatMap((status) => this.getVisibleTasks(visibleFilter, status, showUnscheduled)).filter((task) => {
      if (view === "date") {
        const date = moment(task.dateKey, "YYYY-MM-DD", true);
        if (!date.isValid()) return showUnscheduled;
        if (date.isBefore(weekStart, "day") || date.isAfter(weekEnd, "day")) return false;
        if (this.plugin.settings.kanbanDateHideWeekends && (date.day() === 0 || date.day() === 6)) return false;
      }
      if (!task.completed && !this.plugin.settings.kanbanPriorityFilters.includes(task.marker)) return false;
      return !query || `${task.text} ${this.plugin.getProjectLabel(task)} ${task.sourcePath}`.toLowerCase().includes(query);
    });
    const columns = new Map<string, KanbanColumn>();
    const today = moment().startOf("day");

    if (view === "priority") {
      for (const priority of PRIORITY_COLUMNS) {
        columns.set(priority.value, { title: priority.title, value: priority.value, tasks: [] });
      }
      for (const task of tasks) {
        const marker = columns.has(task.marker) ? task.marker : " ";
        columns.get(marker).tasks.push(task);
      }
      return PRIORITY_COLUMNS.map((priority) => {
        const column = columns.get(priority.value);
        column.tasks = this.sortTasks(column.tasks, view);
        return column;
      });
    }

    if (view === "date") {
      const weekStart = moment().startOf("isoWeek").add(this.weekOffset, "week");
      for (let offset = 0; offset < 7; offset += 1) {
        const date = weekStart.clone().add(offset, "day");
        if (this.plugin.settings.kanbanDateHideWeekends && (date.day() === 0 || date.day() === 6)) continue;
        const value = date.format("YYYY-MM-DD");
        columns.set(value, { title: this.getTaskDateLabel({ dateKey: value }, today), value, tasks: [] });
      }
    }

    for (const task of tasks) {
      const value = view === "date" ? String(task.dateKey || "") : String(task.section || "").trim();
      const title = view === "date" ? this.getTaskDateLabel(task, today) : this.plugin.getProjectLabel(task);
      if (!columns.has(value)) columns.set(value, { title, value, tasks: [] });
      columns.get(value).tasks.push(task);
    }

    return Array.from(columns.values())
      .map((column) => ({ ...column, tasks: this.sortTasks(column.tasks, view) }))
      .sort((a, b) => {
        if (view === "date") {
          if (!a.value) return 1;
          if (!b.value) return -1;
          return a.value.localeCompare(b.value);
        }
        if (!a.value) return 1;
        if (!b.value) return -1;
        return a.title.localeCompare(b.title);
      });
  }

  setCardDragEvents(card: HTMLElement, task: CalendarTask): void {
    if (task.completed) return;
    card.draggable = true;
    card.addEventListener("dragstart", (event) => {
      this.draggedTask = task;
      card.addClass("is-dragging");
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", task.text || "task");
        event.dataTransfer.setData("application/x-noesis-flow-task", JSON.stringify(task));
      }
    });
    card.addEventListener("dragend", () => {
      this.draggedTask = null;
      card.removeClass("is-dragging");
      this.contentEl.querySelectorAll(".noesis-flow-kanban-lane.is-drop-target")
        .forEach((lane: HTMLElement) => lane.removeClass("is-drop-target"));
    });
  }

  setCardReorderEvents(card: HTMLElement, task: CalendarTask, view: KanbanTaskView): void {
    if (this.plugin.settings.kanbanCardOrder !== "custom" || view !== "sections" || task.completed) return;
    card.addEventListener("dragover", (event) => {
      if (!this.draggedTask || this.draggedTask === task) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      card.addClass("is-card-drop-target");
    });
    card.addEventListener("dragleave", () => card.removeClass("is-card-drop-target"));
    card.addEventListener("drop", asVoidHandler(async (event: DragEvent) => {
      if (!this.draggedTask || this.draggedTask === task) return;
      event.preventDefault();
      event.stopPropagation();
      card.removeClass("is-card-drop-target");
      const draggedTask = this.draggedTask;
      this.draggedTask = null;
      await this.plugin.reorderKanbanTasks(draggedTask, task);
    }));
  }

  async moveTaskToColumn(task: CalendarTask, column: KanbanColumn, view: KanbanTaskView): Promise<void> {
    if (view === "sections") {
      if (!column.value) {
        new Notice("Use a named project to move a task.");
        return;
      }
      if (String(task.section || "").trim() === column.value) return;
      const project = this.plugin.findProjectForSection(task.sourcePath, column.value);
      await this.plugin.updateCalendarTask(task, { section: column.value, projectId: project?.id || null }, `Task moved to ${column.title}.`);
      return;
    }

    if (view === "date") {
      if (!column.value) {
        new Notice("Use the task date action to make a task unscheduled.");
        return;
      }
      if (task.dateKey === column.value) return;
      await this.plugin.updateCalendarTask(task, { dateKey: column.value }, `Task moved to ${column.title}.`);
      return;
    }

    if (task.marker === column.value) return;
    await this.plugin.updateCalendarTask(task, { marker: column.value }, "Task priority updated.");
  }

  setLaneDropEvents(lane: HTMLElement, column: KanbanColumn, view: KanbanTaskView): void {
    lane.addEventListener("dragover", (event) => {
      if (!this.draggedTask) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      lane.addClass("is-drop-target");
    });
    lane.addEventListener("dragleave", (event) => {
      if (!lane.contains(event.relatedTarget as Node)) lane.removeClass("is-drop-target");
    });
    lane.addEventListener("drop", asVoidHandler(async (event: DragEvent) => {
      event.preventDefault();
      lane.removeClass("is-drop-target");
      const task = this.draggedTask;
      this.draggedTask = null;
      if (task) await this.moveTaskToColumn(task, column, view);
    }));
  }

  getTaskCardHeader(task: CalendarTask, view: KanbanTaskView, today: Moment): string {
    const project = this.plugin.getProjectLabel(task);
    const date = this.getTaskDateLabel(task, today);
    const priority = PRIORITY_COLUMNS.find((column) => column.value === task.marker)?.title || "No priority";
    const separator = ` ${String.fromCharCode(183)} `;
    if (view === "date") return [project, priority].filter(Boolean).join(separator);
    if (view === "priority") return [project, date].filter(Boolean).join(separator);
    return [date, priority].filter(Boolean).join(separator);
  }

  renderTask(container: HTMLElement, task: CalendarTask, today: Moment, view: KanbanTaskView): void {
    const card = container.createDiv({ cls: "noesis-flow-kanban-card" });
    card.tabIndex = 0;
    card.setAttribute("role", "group");
    card.setAttribute("aria-label", `Task: ${task.text}. Press Enter for task details; use the details button to edit or move this task.`);
    card.addEventListener("keydown", (event) => {
      if (event.target instanceof HTMLElement && event.target.closest("button")) return;
      if (!["Enter", " "].includes(event.key)) return;
      event.preventDefault();
      this.plugin.openTaskDetails(task);
    });
    const contextPlacement = this.plugin.settings.kanbanCardContextPlacement;
    card.classList.toggle("has-bottom-context", contextPlacement === "bottom");
    card.classList.toggle("has-centered-context", this.plugin.settings.kanbanCardContextAlignment === "center");
    card.classList.add(`priority-${task.marker === "!" ? "critical" : task.marker === " " ? "none" : String(task.marker || "").toLowerCase()}`);
    const context = card.createDiv({ cls: "noesis-flow-kanban-card-date", text: this.getTaskCardHeader(task, view, today) });
    this.setCardDragEvents(card, task);
    this.setCardReorderEvents(card, task, view);
    renderNoesisFlowTaskRow(card, task, {
      onOpen: (selectedTask) => this.plugin.openTaskDetails(selectedTask),
      onComplete: (selectedTask, button) => { void this.completeTask(selectedTask, button); },
      hideProjectMeta: true,
      actionsPlacement: "top",
      app: this.app,
      component: this
    }, "noesis-flow-kanban-task-item");
    if (contextPlacement === "bottom") card.appendChild(context);
  }

  render() {
    if (!this.contentEl) return;
    this.contentEl.empty();

    if (!this.plugin.settings.kanbanTasksAddonEnabled || !this.plugin.settings.tasksAddonEnabled) {
      this.contentEl.createDiv({ cls: "noesis-flow-calendar-empty", text: "Kanban is disabled in Noesis Flow settings." });
      return;
    }

    const today = moment().startOf("day");
    const filter = normalizeDateTaskFilter(this.plugin.settings.kanbanTaskFilter || "all");
    const view = normalizeKanbanTaskView(this.plugin.settings.kanbanTaskView || "sections");
    const statuses = this.plugin.settings.kanbanTaskStatuses;
    const columns = this.getColumns(filter, view, statuses);
    const taskCount = columns.reduce((total, column) => total + column.tasks.length, 0);
    const visibleFilter = view === "date" ? "all" : filter;
    const isInVisibleDateWeek = (task: CalendarTask): boolean => {
      if (view !== "date") return true;
      const date = moment(task.dateKey, "YYYY-MM-DD", true);
      if (!date.isValid() || !date.isBetween(moment().startOf("isoWeek").add(this.weekOffset, "week"), moment().startOf("isoWeek").add(this.weekOffset, "week").add(6, "day"), "day", "[]")) return false;
      return !this.plugin.settings.kanbanDateHideWeekends || (date.day() !== 0 && date.day() !== 6);
    };
    const activeCount = view === "date"
      ? this.getColumns(filter, view, ["active"]).reduce((total, column) => total + column.tasks.length, 0)
      : this.getVisibleTasks(visibleFilter, "active").filter(isInVisibleDateWeek).length;
    const completedCount = view === "date"
      ? this.getColumns(filter, view, ["completed"]).reduce((total, column) => total + column.tasks.length, 0)
      : this.getVisibleTasks(visibleFilter, "completed").filter(isInVisibleDateWeek).length;
    const progress = activeCount + completedCount ? Math.round(completedCount / (activeCount + completedCount) * 100) : 0;

    const board = this.contentEl.createDiv({ cls: "noesis-flow-kanban-board" });
    board.classList.toggle("is-compact-cards", !!this.plugin.settings.kanbanCompactCards);
    board.classList.toggle("has-priority-borders", !!this.plugin.settings.kanbanCardPriorityBorders);
    board.classList.toggle("has-context-divider", !!this.plugin.settings.kanbanCardContextDivider);
    board.classList.toggle("has-top-accent-bar", this.plugin.settings.kanbanCardAccentPosition === "top");
    board.style.setProperty("--noesis-flow-kanban-card-radius", `${this.plugin.settings.kanbanCardCornerRadius}px`);
    const hero = board.createDiv({ cls: "noesis-flow-kanban-hero" });
    const titleBlock = hero.createDiv({ cls: "noesis-flow-kanban-title-block" });
    titleBlock.createEl("h2", { cls: "noesis-flow-kanban-title", text: "Kanban" });
    const summaryLead = view === "date"
      ? `${moment().startOf("isoWeek").add(this.weekOffset, "week").format("MMM D")}${String.fromCharCode(8211)}${moment().startOf("isoWeek").add(this.weekOffset, "week").add(6, "day").format("MMM D")}`
      : getDateTaskFilterLabel(filter);
    const summary = `${summaryLead} ${String.fromCharCode(183)} ${taskCount} ${taskCount === 1 ? "task" : "tasks"} ${String.fromCharCode(183)} ${progress}% complete`;
    titleBlock.createDiv({ cls: "noesis-flow-kanban-summary", text: summary, attr: { title: summary } });
    const heroActions = hero.createDiv({ cls: "noesis-flow-kanban-hero-actions" });
    this.renderSearch(heroActions);
    const calendarButton = heroActions.createEl("button", {
      cls: "noesis-flow-kanban-calendar-button",
      attr: { type: "button", "aria-label": "Open Calendar sidebar for task drop" }
    });
    setIcon(calendarButton, "calendar-days");
    calendarButton.addEventListener("click", () => void this.plugin.openCalendarForKanbanDrop());
    const addTaskButton = heroActions.createEl("button", {
      cls: "mod-cta noesis-flow-kanban-add-button",
      text: "New task",
      attr: { type: "button", "aria-label": "Add a new Kanban task" }
    });
    addTaskButton.addEventListener("click", () => void this.plugin.openKanbanQuickTaskCapture());
    this.renderSavedViews(heroActions);

    if (view === "date") {
      const previous = heroActions.createEl("button", { text: "‹", attr: { type: "button", "aria-label": "Previous week" } });
      previous.addEventListener("click", () => { this.weekOffset -= 1; this.render(); });
      const current = heroActions.createEl("button", { text: "This week", attr: { type: "button", "aria-label": "Show this week" } });
      current.addEventListener("click", () => { this.weekOffset = 0; this.render(); });
      const next = heroActions.createEl("button", { text: "›", attr: { type: "button", "aria-label": "Next week" } });
      next.addEventListener("click", () => { this.weekOffset += 1; this.render(); });
    }
    this.renderTaskView(heroActions, view);
    const filterButton = heroActions.createEl("button", { cls: "noesis-flow-kanban-filter-button", attr: { type: "button", "aria-label": "Filter Kanban tasks" } });
    setIcon(filterButton, "list-filter");
    filterButton.addEventListener("click", () => this.openFilterDialog());

    if (!taskCount) {
      board.createDiv({
        cls: "noesis-flow-kanban-empty",
        text: filter === "all" ? "NO OPEN TASKS. ADD TASKS TO A MARKDOWN PROJECT TO START A BOARD." : "NO OPEN TASKS IN THIS DATE RANGE."
      });
      return;
    }

    const lanes = board.createDiv({ cls: "noesis-flow-kanban-lanes" });
    for (const column of columns) {
      const lane = lanes.createDiv({ cls: "noesis-flow-kanban-lane" });
      if (view === "date") {
        if (this.plugin.getHolidayEntriesForDate(column.value).length) lane.addClass("is-holiday");
        const eventEntries = this.plugin.getCalendarEventsForDate(column.value);
        if (eventEntries.length) {
          lane.addClass("is-event");
          lane.style.setProperty("--noesis-flow-kanban-event-color", this.plugin.getCalendarEventColor());
        }
      }
      this.setLaneDropEvents(lane, column, view);
      const header = lane.createDiv({ cls: "noesis-flow-kanban-lane-header" });
      header.createDiv({ cls: "noesis-flow-kanban-lane-title", text: column.title });
      header.createDiv({
        cls: "noesis-flow-kanban-lane-count",
        text: `${column.tasks.length} ${column.tasks.length === 1 ? "TASK" : "TASKS"}`
      });
      const cards = lane.createDiv({ cls: "noesis-flow-kanban-cards" });
      for (const task of column.tasks) this.renderTask(cards, task, today, view);
    }
  }
}
