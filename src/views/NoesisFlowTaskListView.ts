import { Notice, setIcon } from "obsidian";
import type { WorkspaceLeaf } from "obsidian";
import type NoesisFlowPlugin from "../main";
import type { CalendarTask, DateTaskFilter, KanbanTaskStatus, KanbanUnscheduledFilter } from "../types";
import { NoesisFlowTimedView } from "./NoesisFlowTimedView";
import { moment } from "../time";
import {
  CALENDAR_TASK_PRIORITIES,
  NOESIS_FLOW_TASK_LIST_VIEW_TYPE,
  asVoidHandler,
  TASK_LIST_COLUMN_IDS,
  getDateTaskFilterRange,
  normalizeDateTaskFilter
} from "../utils";
import { renderNoesisFlowMarkdown } from "../ui/NoesisFlowUi";
import { NoesisFlowKanbanFilterModal } from "../modals/NoesisFlowKanbanFilterModal";
import type { TaskUpdates } from "../tasks/TaskMutationService";

type TaskListColumn = "text" | "date" | "section" | "priority" | "actions";
type EditableTextProperty = "text" | "section";

const COLUMN_LABELS: Record<TaskListColumn, string> = { text: "Task", date: "Date", section: "Project", priority: "Priority", actions: "Actions" };
const ALL_TASK_LIST_COLUMNS: TaskListColumn[] = ["text", "date", "section", "priority", "actions"];

function isTaskListColumn(value: string): value is TaskListColumn {
  return ALL_TASK_LIST_COLUMNS.includes(value as TaskListColumn);
}

export class NoesisFlowTaskListView extends NoesisFlowTimedView {
  plugin: NoesisFlowPlugin;
  filter: DateTaskFilter;
  statuses: KanbanTaskStatus[];
  priorities: string[];
  unscheduledFilter: KanbanUnscheduledFilter;
  columnFilters: Record<string, string>;
  draggedColumn: TaskListColumn | "";
  selectedTaskKeys: Set<string>;
  columnChooserOpen: boolean;

  constructor(leaf: WorkspaceLeaf, plugin: NoesisFlowPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.filter = this.plugin.settings.taskListFilter || "all";
    this.statuses = Array.isArray(this.plugin.settings.taskListStatuses) ? this.plugin.settings.taskListStatuses : ["active"];
    this.priorities = Array.isArray(this.plugin.settings.taskListPriorityFilters) ? this.plugin.settings.taskListPriorityFilters : ["!", "H", "M", "L", " "];
    this.unscheduledFilter = this.plugin.settings.taskListUnscheduledFilter || "auto";
    this.columnFilters = { text: "", date: "", section: "", priority: "" };
    this.draggedColumn = "";
    this.selectedTaskKeys = new Set();
    this.columnChooserOpen = false;
  }

  getViewType() { return NOESIS_FLOW_TASK_LIST_VIEW_TYPE; }
  getDisplayText() { return "Task List"; }
  getIcon() { return "table-properties"; }

  async onOpen() {
    this.contentEl.empty();
    this.contentEl.addClass("noesis-flow-task-list-view-content");
    await this.plugin.refreshCalendarTaskCounts(false);
    this.render();
    this.startPeriodicRender(60000);
  }

  async onClose() {
    this.stopPeriodicRender();
    this.contentEl.empty();
    this.contentEl.removeClass("noesis-flow-task-list-view-content");
  }

  taskKey(task: CalendarTask): string {
    return task.id ? `${task.sourcePath || ""}\t${task.id}` : `${task.sourcePath || ""}\t${task.lineIndex || 0}`;
  }

  getColumnOrder(): TaskListColumn[] {
    const stored = Array.isArray(this.plugin.settings.taskListColumnOrder)
      ? this.plugin.settings.taskListColumnOrder.filter((column): column is TaskListColumn => TASK_LIST_COLUMN_IDS.includes(column))
      : [];
    return Array.from(new Set([...stored, ...ALL_TASK_LIST_COLUMNS]));
  }

  getVisibleColumns(): TaskListColumn[] {
    const visible = Array.isArray(this.plugin.settings.taskListVisibleColumns)
      ? this.plugin.settings.taskListVisibleColumns
      : ALL_TASK_LIST_COLUMNS;
    return this.getColumnOrder().filter((column) => visible.includes(column));
  }

  getColumnWidth(column: TaskListColumn): number {
    const width = Number(this.plugin.settings.taskListColumnWidths && this.plugin.settings.taskListColumnWidths[column]);
    return Number.isFinite(width) && width >= 32 ? width : 0;
  }

  getAutomaticColumnWidth(column: TaskListColumn, tasks: CalendarTask[]): number {
    const values: Partial<Record<TaskListColumn, string[]>> = {
      date: [COLUMN_LABELS.date, ...tasks.map((task) => task.dateKey || "")],
      section: [COLUMN_LABELS.section, ...tasks.map((task) => this.plugin.getProjectLabel(task))],
      priority: [COLUMN_LABELS.priority, ...tasks.map((task) => task.priorityLabel || "No priority")]
    };
    const minimums: Partial<Record<TaskListColumn, number>> = { date: 136, section: 145, priority: 106, actions: 148 };
    if (column === "actions") return minimums.actions;
    const canvas = this.contentEl.createEl("canvas");
    const measure = canvas.getContext("2d");
    canvas.remove();
    if (!measure) return minimums[column] || 96;
    const style = window.getComputedStyle(this.contentEl);
    measure.font = style.font || `${style.fontSize} ${style.fontFamily}`;
    const widest = Math.max(...(values[column] || [COLUMN_LABELS[column] || ""]).map((value) => measure.measureText(String(value || "")).width));
    return Math.max(minimums[column] || 96, Math.ceil(widest + 32));
  }

  async moveColumn(column: TaskListColumn, target: TaskListColumn): Promise<void> {
    if (!column || !target || column === target) return;
    const order = this.getColumnOrder();
    const sourceIndex = order.indexOf(column);
    const targetIndex = order.indexOf(target);
    if (sourceIndex < 0 || targetIndex < 0) return;
    order.splice(sourceIndex, 1);
    order.splice(order.indexOf(target), 0, column);
    this.plugin.settings.taskListColumnOrder = order;
    await this.plugin.saveSettings();
    this.render();
  }

  async moveColumnByOffset(column: TaskListColumn, offset: number): Promise<void> {
    const order = this.getColumnOrder();
    const sourceIndex = order.indexOf(column);
    const targetIndex = sourceIndex + offset;
    if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= order.length) return;
    order.splice(sourceIndex, 1);
    order.splice(targetIndex, 0, column);
    this.plugin.settings.taskListColumnOrder = order;
    await this.plugin.saveSettings();
    this.render();
  }

  async setColumnVisibility(column: TaskListColumn, visible: boolean): Promise<void> {
    const current = Array.isArray(this.plugin.settings.taskListVisibleColumns)
      ? this.plugin.settings.taskListVisibleColumns.filter((value) => TASK_LIST_COLUMN_IDS.includes(value))
      : [...TASK_LIST_COLUMN_IDS];
    const next = visible ? Array.from(new Set([...current, column])) : current.filter((value) => value !== column);
    this.plugin.settings.taskListVisibleColumns = next.length ? next : ["text"];
    await this.plugin.saveSettings();
    this.render();
  }

  async setColumnWidth(column: TaskListColumn, value: number | string): Promise<void> {
    const width = Math.round(Number(value));
    if (!Number.isFinite(width) || width < 80 || width > 1000) {
      new Notice("Column widths must be between 80 and 1000 pixels.");
      this.render();
      return;
    }
    this.plugin.settings.taskListColumnWidths = Object.assign({}, this.plugin.settings.taskListColumnWidths, { [column]: width });
    await this.plugin.saveSettings();
    this.render();
  }

  async resetColumnWidth(column: TaskListColumn): Promise<void> {
    const widths = Object.assign({}, this.plugin.settings.taskListColumnWidths);
    delete widths[column];
    this.plugin.settings.taskListColumnWidths = widths;
    await this.plugin.saveSettings();
    this.render();
  }

  async resetAllColumnWidths() {
    this.plugin.settings.taskListColumnWidths = {};
    await this.plugin.saveSettings();
    this.render();
  }

  getTasks(): CalendarTask[] {
    const today = moment().startOf("day");
    const range = getDateTaskFilterRange(this.filter, today);
    const taskQuery = this.plugin.getTaskQuery(today);
    const includeUnscheduled = this.unscheduledFilter === "include" || (this.unscheduledFilter === "auto" && this.filter === "all");
    const activeTasks = taskQuery.actionable;
    const tasks = [
      ...(this.statuses.includes("active") ? activeTasks : []),
      ...(this.statuses.includes("completed") ? taskQuery.completed : [])
    ].filter((task) => {
      const date = moment(task.dateKey, "YYYY-MM-DD", true).startOf("day");
      if (range.overdueOnly) return !task.completed && taskQuery.pastScheduled.includes(task);
      if (!date.isValid()) return range.includeAll && includeUnscheduled;
      if (range.includeAll) return true;
      return !date.isBefore(today, "day")
        && (!range.startDate || !date.isBefore(range.startDate, "day"))
        && (!range.endDate || !date.isAfter(range.endDate, "day"));
    });
    return tasks
      .filter((task) => task.completed || this.priorities.includes(task.marker))

      .filter((task) => this.matchesColumnFilters(task))
      .sort((a, b) => this.compareTasks(a, b));
  }

  matchesColumnFilters(task: CalendarTask): boolean {
    const filters = this.columnFilters;
    const includes = (value: unknown, query: string): boolean => !query || String(value || "").toLowerCase().includes(query.toLowerCase());
    return includes(task.text, filters.text)
      && includes(task.dateKey, filters.date)
      && includes(this.plugin.getProjectLabel(task), filters.section)
      && includes(`${task.priorityLabel || ""} ${task.marker || ""}`, filters.priority);
  }

  async setFilterValues(statuses: KanbanTaskStatus[], priorities: string[], filter: string, unscheduledFilter: string): Promise<void> {
    this.statuses = statuses;
    this.priorities = priorities;
    this.filter = normalizeDateTaskFilter(filter);
    this.unscheduledFilter = unscheduledFilter === "include" ? "include" : unscheduledFilter === "exclude" ? "exclude" : "auto";
    this.plugin.settings.taskListStatuses = this.statuses;
    this.plugin.settings.taskListPriorityFilters = this.priorities;
    this.plugin.settings.taskListFilter = this.filter;
    this.plugin.settings.taskListUnscheduledFilter = this.unscheduledFilter;
    await this.plugin.saveSettings();
    this.render();
  }

  openFilterDialog() {
    new NoesisFlowKanbanFilterModal(
      this.app,
      this.statuses,
      this.priorities,
      this.filter,
      this.unscheduledFilter,
      (statuses, priorities, filter, unscheduledFilter) => this.setFilterValues(statuses, priorities, filter, unscheduledFilter),
      true
    ).open();
  }

  compareTasks(a: CalendarTask, b: CalendarTask): number {
    const storedColumn = this.plugin.settings.taskListSortColumn || "date";
    const column: TaskListColumn = isTaskListColumn(storedColumn) ? storedColumn : "date";
    const direction = this.plugin.settings.taskListSortDirection === "desc" ? -1 : 1;
    const priorityOrder: Record<string, string> = { "!": "0", H: "1", M: "2", L: "3", " ": "4", X: "5" };
    const values: Record<TaskListColumn, (task: CalendarTask) => string> = {
      text: (task) => String(task.text || ""),
      date: (task) => String(task.dateKey || "9999-12-31"),
      section: (task) => this.plugin.getProjectLabel(task),
      priority: (task) => priorityOrder[task.marker] || "5",
      actions: () => ""
    };
    const result = String(values[column] ? values[column](a) : "").localeCompare(String(values[column] ? values[column](b) : ""));
    if (result) return result * direction;
    return String(a.text || "").localeCompare(String(b.text || ""));
  }

  async updateTask(task: CalendarTask, updates: TaskUpdates): Promise<void> {
    try {
      await this.plugin.updateCalendarTask(task, updates, "Task updated.");
    } catch (error) {
      console.error(error);
      new Notice(`Could not update task: ${error instanceof Error ? error.message : String(error)}`);
      this.render();
    }
  }

  registerKeyboardNavigation(control: HTMLInputElement | HTMLSelectElement, rowIndex: number, column: TaskListColumn, columns: TaskListColumn[]): void {
    control.dataset.taskListRow = String(rowIndex);
    control.dataset.taskListColumn = column;
    control.addEventListener("keydown", (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        control.dispatchEvent(new Event("change"));
        control.blur();
        return;
      }
      const key = event.key;
      if (key === "Enter") {
        event.preventDefault();
        control.dispatchEvent(new Event("change"));
        this.focusCell(rowIndex + 1, column);
        return;
      }
      if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(key)) return;
      const isText = control instanceof HTMLInputElement && control.type === "text";
      if (isText && (key === "ArrowLeft" || key === "ArrowRight")) {
        const atStart = control.selectionStart === 0 && control.selectionEnd === 0;
        const atEnd = control.selectionStart === control.value.length && control.selectionEnd === control.value.length;
        if ((key === "ArrowLeft" && !atStart) || (key === "ArrowRight" && !atEnd)) return;
      }
      const columnIndex = columns.indexOf(column);
      const nextRow = key === "ArrowUp" ? rowIndex - 1 : key === "ArrowDown" ? rowIndex + 1 : rowIndex;
      const nextColumn = key === "ArrowLeft" ? columns[columnIndex - 1] : key === "ArrowRight" ? columns[columnIndex + 1] : column;
      if (nextRow < 0 || !nextColumn) return;
      event.preventDefault();
      this.focusCell(nextRow, nextColumn);
    });
  }

  focusCell(rowIndex: number, column: TaskListColumn): void {
    const selector = `[data-task-list-row="${rowIndex}"][data-task-list-column="${column}"]`;
    const next = this.contentEl.querySelector<HTMLElement>(selector);
    if (next) next.focus();
  }

  createTextCell(row: HTMLTableRowElement, task: CalendarTask, property: EditableTextProperty, projects: string, rowIndex: number, columns: TaskListColumn[]): void {
    const cell = row.createEl("td", { cls: `noesis-flow-task-list-cell noesis-flow-task-list-${property}-cell` });
    if (property === "text") {
      const preview = cell.createDiv({ cls: "noesis-flow-task-list-text-preview", attr: { tabindex: "0", "aria-label": `Task: ${task.text}. Press Enter to edit.` } });
      renderNoesisFlowMarkdown(preview, task.text, { app: this.app, component: this, sourcePath: task.sourcePath });
      const beginEditing = (event?: Event) => {
        const target = event && event.target instanceof HTMLElement ? event.target : null;
        if (target && target.closest("a")) return;
        if (event) event.preventDefault();
        this.renderTaskTextEditor(cell, task, rowIndex, columns);
      };
      preview.addEventListener("click", beginEditing);
      preview.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") beginEditing(event);
      });
      return;
    }
    const input = cell.createEl("input", { attr: { type: "text", value: String(task[property] || "") } });
    if (property === "section") input.setAttribute("list", projects);
    this.registerKeyboardNavigation(input, rowIndex, property, columns);
    input.addEventListener("change", asVoidHandler(async () => {
      const value = input.value.trim();
      if (!value || value === String(task[property] || "")) return;
      const updates: TaskUpdates = { [property]: value };
      if (property === "section") updates.projectId = this.plugin.findProjectForSection(task.sourcePath, value)?.id || null;
      await this.updateTask(task, updates);
    }));
  }

  renderTaskTextEditor(cell: HTMLTableCellElement, task: CalendarTask, rowIndex: number, columns: TaskListColumn[]): void {
    cell.empty();
    const input = cell.createEl("input", { attr: { type: "text", value: String(task.text || ""), "aria-label": "Edit task" } });
    this.registerKeyboardNavigation(input, rowIndex, "text", columns);
    const cancel = () => this.render();
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        cancel();
      }
    });
    input.addEventListener("change", asVoidHandler(async () => {
      const value = input.value.trim();
      if (!value || value === String(task.text || "")) {
        this.render();
        return;
      }
      await this.updateTask(task, { text: value });
    }));
    input.focus();
    input.select();
  }

  renderDateCell(row: HTMLTableRowElement, task: CalendarTask, rowIndex: number, columns: TaskListColumn[]): void {
    const cell = row.createEl("td", { cls: "noesis-flow-task-list-cell noesis-flow-task-list-date-cell" });
    const input = cell.createEl("input", { attr: { type: "date", value: task.dateKey || "", "aria-label": `Date ${task.text}` } });
    this.registerKeyboardNavigation(input, rowIndex, "date", columns);
    input.addEventListener("change", asVoidHandler(async () => {
      if (input.value !== String(task.dateKey || "")) await this.updateTask(task, { dateKey: input.value });
    }));
  }

  renderPriorityCell(row: HTMLTableRowElement, task: CalendarTask, rowIndex: number, columns: TaskListColumn[]): void {
    const cell = row.createEl("td", { cls: "noesis-flow-task-list-cell noesis-flow-task-list-priority-cell" });
    const select = cell.createEl("select", { attr: { "aria-label": `Priority for ${task.text}` } });
    if (task.completed) select.createEl("option", { text: "Completed", attr: { value: "X" } });
    for (const item of CALENDAR_TASK_PRIORITIES) select.createEl("option", { text: item.label, attr: { value: item.marker } });
    select.value = task.marker || " ";
    this.registerKeyboardNavigation(select, rowIndex, "priority", columns);
    select.addEventListener("change", asVoidHandler(async () => {
      if (select.value === task.marker) return;
      if (select.value === "X") await this.plugin.completeCalendarTask(task);
      else await this.updateTask(task, { marker: select.value });
    }));
  }

  renderActionsCell(row: HTMLTableRowElement, task: CalendarTask): void {
    const cell = row.createEl("td", { cls: "noesis-flow-task-list-cell noesis-flow-task-list-actions-cell" });
    const controls = cell.createDiv({ cls: "noesis-flow-task-list-row-actions" });
    const details = controls.createEl("button", { cls: "noesis-flow-task-list-action-button", attr: { type: "button", "aria-label": `Open task details: ${task.text}`, title: "Task details" } });
    setIcon(details, "panel-right-open");
    details.addEventListener("click", () => void this.plugin.openTaskDetails(task));
    const source = controls.createEl("button", { cls: "noesis-flow-task-list-action-button", attr: { type: "button", "aria-label": `Open source note: ${task.text}`, title: "Open source note" } });
    setIcon(source, "file-text");
    source.addEventListener("click", () => void this.plugin.openTaskSource(task));
    const complete = controls.createEl("button", { cls: "noesis-flow-task-list-action-button noesis-flow-task-list-complete-button", attr: { type: "button", "aria-label": task.completed ? `Reopen task: ${task.text}` : `Complete task: ${task.text}`, title: task.completed ? "Reopen task" : "Mark complete" } });
    setIcon(complete, task.completed ? "rotate-ccw" : "check");
    complete.addEventListener("click", asVoidHandler(async () => {
      if (task.completed) await this.updateTask(task, { marker: " " });
      else await this.plugin.completeCalendarTask(task);
    }));
    const button = controls.createEl("button", { cls: "noesis-flow-task-list-delete-button", attr: { type: "button", "aria-label": `Delete task: ${task.text}`, title: "Delete task" } });
    setIcon(button, "trash");
    button.addEventListener("click", () => void this.plugin.requestCalendarTaskDelete(task));
  }

  renderSelectionCell(row: HTMLTableRowElement, task: CalendarTask): void {
    const cell = row.createEl("td", { cls: "noesis-flow-task-list-cell noesis-flow-task-list-select-cell" });
    const input = cell.createEl("input", { attr: { type: "checkbox", "aria-label": `Select task for bulk editing: ${task.text}`, title: "Select for bulk editing" } });
    input.checked = this.selectedTaskKeys.has(this.taskKey(task));
    input.addEventListener("change", () => {
      const key = this.taskKey(task);
      if (input.checked) this.selectedTaskKeys.add(key);
      else this.selectedTaskKeys.delete(key);
      this.render();
    });
  }

  renderTaskRow(body: HTMLTableSectionElement, task: CalendarTask, projects: string, columns: TaskListColumn[], rowIndex: number): void {
    const row = body.createEl("tr", { cls: "noesis-flow-task-list-row" });
    row.classList.toggle("is-completed", !!task.completed);
    this.renderSelectionCell(row, task);
    for (const column of columns) {
      if (column === "text") this.createTextCell(row, task, "text", projects, rowIndex, columns);
      else if (column === "date") this.renderDateCell(row, task, rowIndex, columns);
      else if (column === "section") this.createTextCell(row, task, "section", projects, rowIndex, columns);
      else if (column === "priority") this.renderPriorityCell(row, task, rowIndex, columns);
      else if (column === "actions") this.renderActionsCell(row, task);
    }
  }

  renderColumnHeader(head: HTMLTableRowElement, column: TaskListColumn): void {
    const header = head.createEl("th", { cls: `noesis-flow-task-list-${column}-column`, text: COLUMN_LABELS[column] || "" });
    const width = this.getColumnWidth(column);
    if (width) header.style.width = `${width}px`;
    if (column !== "actions" && this.plugin.settings.taskListSortColumn === column) {
      header.addClass("is-sorted");
      header.createSpan({ cls: "noesis-flow-task-list-sort-direction", text: this.plugin.settings.taskListSortDirection === "desc" ? "▼" : "▲" });
    }
    header.draggable = true;
    header.tabIndex = 0;
    header.setAttribute("aria-label", column === "actions"
      ? "Actions column. Press Alt+Shift+Left or Right Arrow to rearrange."
      : `${COLUMN_LABELS[column]} column. Press Enter or Space to sort, or Alt+Shift+Left or Right Arrow to rearrange.`);
    header.addEventListener("click", asVoidHandler(async () => {
      if (column === "actions") return;
      const direction = this.plugin.settings.taskListSortColumn === column && this.plugin.settings.taskListSortDirection === "asc" ? "desc" : "asc";
      this.plugin.settings.taskListSortColumn = column;
      this.plugin.settings.taskListSortDirection = direction;
      await this.plugin.saveSettings();
      this.render();
    }));
    header.addEventListener("keydown", asVoidHandler(async (event: KeyboardEvent) => {
      const moveOffset = event.altKey && event.shiftKey && event.key === "ArrowLeft" ? -1
        : event.altKey && event.shiftKey && event.key === "ArrowRight" ? 1 : 0;
      if (moveOffset) {
        event.preventDefault();
        await this.moveColumnByOffset(column, moveOffset);
        return;
      }
      if (column === "actions" || !["Enter", " "].includes(event.key)) return;
      event.preventDefault();
      const direction = this.plugin.settings.taskListSortColumn === column && this.plugin.settings.taskListSortDirection === "asc" ? "desc" : "asc";
      this.plugin.settings.taskListSortColumn = column;
      this.plugin.settings.taskListSortDirection = direction;
      await this.plugin.saveSettings();
      this.render();
    }));
    header.addEventListener("dragstart", (event) => {
      this.draggedColumn = column;
      header.addClass("is-dragging");
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
    });
    header.addEventListener("dragend", () => {
      this.draggedColumn = "";
      head.querySelectorAll("th").forEach((element: HTMLElement) => element.removeClass("is-drop-target", "is-dragging"));
    });
    header.addEventListener("dragover", (event) => {
      if (!this.draggedColumn || this.draggedColumn === column) return;
      event.preventDefault();
      header.addClass("is-drop-target");
    });
    header.addEventListener("dragleave", () => header.removeClass("is-drop-target"));
    header.addEventListener("drop", asVoidHandler(async (event: DragEvent) => {
      event.preventDefault();
      header.removeClass("is-drop-target");
      const draggedColumn = this.draggedColumn;
      if (draggedColumn) await this.moveColumn(draggedColumn, column);
    }));
    const resizer = header.createDiv({
      cls: "noesis-flow-task-list-column-resizer",
      attr: { role: "separator", tabindex: "0", "aria-label": `Resize ${COLUMN_LABELS[column]} column` }
    });
    resizer.addEventListener("pointerdown", (event) => this.startColumnResize(event, column, header, resizer));
    resizer.addEventListener("keydown", asVoidHandler(async (event: KeyboardEvent) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      const delta = event.key === 'ArrowLeft' ? -10 : 10;
      await this.setColumnWidth(column, Math.max(80, Math.round(header.getBoundingClientRect().width) + delta));
    }));
    resizer.addEventListener("click", (event) => event.stopPropagation());
  }

  startColumnResize(event: PointerEvent, column: string, header: HTMLElement, resizer: HTMLElement) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    header.draggable = false;
    resizer.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startWidth = header.getBoundingClientRect().width;
    const table = header.closest("table");
    const columnDefinition = table?.querySelector<HTMLElement>(`col[data-task-list-column="${column}"]`) || null;
    const onMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== event.pointerId) return;
      const width = Math.max(32, Math.min(1000, Math.round(startWidth + moveEvent.clientX - startX)));
      header.style.width = `${width}px`;
      if (columnDefinition) columnDefinition.style.width = `${width}px`;
    };
    const finish = asVoidHandler(async (upEvent: PointerEvent) => {
      if (upEvent.pointerId !== event.pointerId) return;
      const width = Math.max(32, Math.min(1000, Math.round(startWidth + upEvent.clientX - startX)));
      resizer.removeEventListener("pointermove", onMove);
      resizer.removeEventListener("pointerup", finish);
      resizer.removeEventListener("pointercancel", finish);
      if (resizer.hasPointerCapture(event.pointerId)) resizer.releasePointerCapture(event.pointerId);
      header.draggable = true;
      this.plugin.settings.taskListColumnWidths = Object.assign({}, this.plugin.settings.taskListColumnWidths, { [column]: width });
      await this.plugin.saveSettings();
      this.render();
    });
    resizer.addEventListener("pointermove", onMove);
    resizer.addEventListener("pointerup", finish);
    resizer.addEventListener("pointercancel", finish);
  }

  renderColumnDefinitions(table: HTMLTableElement, columns: TaskListColumn[], tasks: CalendarTask[], availableWidth: number): void {
    const selectionWidth = 28;
    const widths: Record<string, number> = {};
    let nonTextWidth = selectionWidth;
    for (const column of columns) {
      if (column === "text") continue;
      const manualWidth = this.getColumnWidth(column);
      widths[column] = manualWidth || this.getAutomaticColumnWidth(column, tasks);
      nonTextWidth += widths[column];
    }
    const manualTextWidth = this.getColumnWidth("text");
    widths.text = manualTextWidth || Math.max(340, Math.round(availableWidth - nonTextWidth));
    const totalWidth = nonTextWidth + widths.text;
    table.style.width = `${totalWidth}px`;
    table.style.minWidth = `${totalWidth}px`;
    const columnGroup = table.createEl("colgroup");
    const selection = columnGroup.createEl("col", { cls: "noesis-flow-task-list-select-column" });
    selection.style.width = `${selectionWidth}px`;
    for (const column of columns) {
      const definition = columnGroup.createEl("col", {
        cls: `noesis-flow-task-list-${column}-column`,
        attr: { "data-task-list-column": column }
      });
      definition.style.width = `${widths[column]}px`;
    }
  }

  clearColumnFilters() {
    this.columnFilters = { text: "", date: "", section: "", priority: "" };
    this.render();
  }

  renderColumnSearchRow(head: HTMLTableSectionElement, columns: TaskListColumn[]): void {
    const row = head.createEl("tr", { cls: "noesis-flow-task-list-column-filter-row" });
    row.createEl("th", { cls: "noesis-flow-task-list-select-column", text: "" });
    for (const column of columns) {
      const cell = row.createEl("th", { cls: `noesis-flow-task-list-${column}-column` });
      if (!["text", "date", "section", "priority"].includes(column)) {
        if (column === "actions") {
          const clear = cell.createEl("button", { text: "Clear", attr: { type: "button", "aria-label": "Clear column searches" } });
          clear.addEventListener("click", () => this.clearColumnFilters());
        }
        continue;
      }
      const input = cell.createEl("input", {
        cls: "noesis-flow-task-list-column-search",
        attr: {
          type: "search",
          placeholder: `Search ${COLUMN_LABELS[column]}`,
          "aria-label": `Search ${COLUMN_LABELS[column]} column`
        }
      });
      input.value = this.columnFilters[column] || "";
      const apply = () => {
        this.columnFilters[column] = input.value;
        this.render();
      };
      input.addEventListener("change", apply);
      input.addEventListener("keydown", (event) => { if (event.key === "Enter") apply(); });
    }
  }

  renderBulkActions(root: HTMLElement, tasks: CalendarTask[], projects: string): void {
    const selected = tasks.filter((task) => this.selectedTaskKeys.has(this.taskKey(task)));
    if (!selected.length) return;
    const bar = root.createDiv({ cls: "noesis-flow-task-list-bulk-actions" });
    bar.createSpan({ text: `${selected.length} selected` });
    const date = bar.createEl("input", { attr: { type: "date", "aria-label": "Bulk task date" } });
    const section = bar.createEl("input", { attr: { type: "text", placeholder: "Project", list: projects, "aria-label": "Bulk task project" } });
    const priority = bar.createEl("select", { attr: { "aria-label": "Bulk task priority" } });
    priority.createEl("option", { text: "Keep priority", attr: { value: "" } });
    for (const item of CALENDAR_TASK_PRIORITIES) priority.createEl("option", { text: item.label, attr: { value: item.marker } });
    const apply = bar.createEl("button", { text: "Apply fields", attr: { type: "button" } });
    apply.addEventListener("click", asVoidHandler(async () => {
      const updates: TaskUpdates = {};
      if (date.value) updates.dateKey = date.value;
      if (section.value.trim()) updates.section = section.value.trim();
      if (priority.value) updates.marker = priority.value;
      if (!Object.keys(updates).length) return;
      for (const task of selected) {
        const taskUpdates = Object.assign({}, updates);
        if (taskUpdates.section) taskUpdates.projectId = this.plugin.findProjectForSection(task.sourcePath, taskUpdates.section)?.id || null;
        await this.updateTask(task, taskUpdates);
      }
      this.selectedTaskKeys.clear();
      this.render();
    }));
    const clearDates = bar.createEl("button", { text: "Clear Dates", attr: { type: "button" } });
    clearDates.addEventListener("click", asVoidHandler(async () => {
      for (const task of selected) await this.updateTask(task, { dateKey: "" });
      this.selectedTaskKeys.clear();
      this.render();
    }));
    const complete = bar.createEl("button", { text: "Complete", attr: { type: "button" } });
    complete.addEventListener("click", asVoidHandler(async () => {
      for (const task of selected.filter((task) => !task.completed)) await this.plugin.completeCalendarTask(task);
      this.selectedTaskKeys.clear();
      this.render();
    }));
    const reopen = bar.createEl("button", { text: "Reopen", attr: { type: "button" } });
    reopen.addEventListener("click", asVoidHandler(async () => {
      for (const task of selected.filter((task) => task.completed)) await this.updateTask(task, { marker: " " });
      this.selectedTaskKeys.clear();
      this.render();
    }));
    const clear = bar.createEl("button", { text: "Clear selection", attr: { type: "button" } });
    clear.addEventListener("click", () => { this.selectedTaskKeys.clear(); this.render(); });
  }

  renderColumnChooser(root: HTMLElement): void {
    if (!this.columnChooserOpen) return;
    const panel = root.createDiv({ cls: "noesis-flow-task-list-column-chooser" });
    const header = panel.createDiv({ cls: "noesis-flow-task-list-column-chooser-header" });
    header.createSpan({ text: "Columns and widths" });
    const reset = header.createEl("button", { text: "Reset widths", attr: { type: "button" } });
    reset.addEventListener("click", () => void this.resetAllColumnWidths());
    const visible = this.getVisibleColumns();
    for (const column of this.getColumnOrder()) {
      const row = panel.createDiv({ cls: "noesis-flow-task-list-column-control" });
      const label = row.createEl("label");
      const checkbox = label.createEl("input", { type: "checkbox" });
      checkbox.checked = visible.includes(column);
      checkbox.addEventListener("change", () => void this.setColumnVisibility(column, checkbox.checked));
      label.createSpan({ text: COLUMN_LABELS[column] });
      if (!checkbox.checked) continue;
      const width = this.getColumnWidth(column);
      const widthInput = row.createEl("input", {
        cls: "noesis-flow-task-list-column-width-input",
        attr: { type: "number", min: "80", max: "1000", step: "10", value: width ? String(width) : "", placeholder: "Auto", "aria-label": `${COLUMN_LABELS[column]} column width in pixels` }
      });
      widthInput.addEventListener("change", () => {
        if (!widthInput.value) void this.resetColumnWidth(column);
        else void this.setColumnWidth(column, widthInput.value);
      });
      const auto = row.createEl("button", { text: "Auto", attr: { type: "button", "aria-label": `Use automatic width for ${COLUMN_LABELS[column]}` } });
      auto.disabled = !width;
      auto.addEventListener("click", () => void this.resetColumnWidth(column));
    }
  }

  render() {
    if (!this.contentEl) return;
    this.contentEl.empty();
    if (!this.plugin.settings.tasksAddonEnabled || !this.plugin.settings.taskListAddonEnabled) {
      this.contentEl.createDiv({ cls: "noesis-flow-calendar-empty", text: "Task List is disabled in Noesis Flow settings." });
      return;
    }
    const root = this.contentEl.createDiv({ cls: "noesis-flow-task-list" });
    const header = root.createDiv({ cls: "noesis-flow-task-list-header" });
    const title = header.createDiv({ cls: "noesis-flow-task-list-title" });
    title.createEl("h2", { text: "TASK LIST" });
    const filtersActive = this.filter !== "all" || this.statuses.length !== 1 || this.statuses[0] !== "active" || this.priorities.length !== 5 || this.unscheduledFilter !== "auto";
    const controls = header.createDiv({ cls: "noesis-flow-task-list-controls" });
    const addButton = controls.createEl("button", { cls: "mod-cta", text: "New task", attr: { type: "button" } });
    addButton.addEventListener("click", () => void this.plugin.openTaskListQuickTaskCapture());
    const columnButton = controls.createEl("button", { text: "Columns", attr: { type: "button" } });
    columnButton.addEventListener("click", () => { this.columnChooserOpen = !this.columnChooserOpen; this.render(); });
    const filterButton = controls.createEl("button", { cls: "noesis-flow-task-list-filter-button", attr: { type: "button", "aria-label": "Filter Task List" } });
    filterButton.toggleClass("is-active", filtersActive);
    setIcon(filterButton, "list-filter");
    filterButton.addEventListener("click", () => this.openFilterDialog());

    const tasks = this.getTasks();
    const projects = Array.from(new Set([
      ...tasks.map((task) => String(task.section || "").trim()).filter(Boolean),
      ...this.plugin.getProjects().map((project) => project.section)
    ])).sort();
    const projectListId = `noesis-flow-task-list-projects-${Date.now()}`;
    const projectOptions = root.createEl("datalist", { attr: { id: projectListId } });
    for (const project of projects) projectOptions.createEl("option", { attr: { value: project } });
    title.createDiv({ cls: "noesis-flow-task-list-count", text: `${tasks.length} ${tasks.length === 1 ? "TASK" : "TASKS"}` });
    this.renderColumnChooser(root);
    this.renderBulkActions(root, tasks, projectListId);
    const columns = this.getVisibleColumns();
    const tableWrap = root.createDiv({ cls: "noesis-flow-task-list-table-wrap" });
    const table = tableWrap.createEl("table", { cls: "noesis-flow-task-list-table" });
    const availableWidth = Math.round(tableWrap.getBoundingClientRect().width || tableWrap.clientWidth || 0);
    this.renderColumnDefinitions(table, columns, tasks, availableWidth);
    const tableHead = table.createEl("thead");
    const head = tableHead.createEl("tr");
    head.createEl("th", { cls: "noesis-flow-task-list-select-column", text: "", attr: { title: "Select for bulk editing", "aria-label": "Select for bulk editing" } });
    for (const column of columns) this.renderColumnHeader(head, column);
    this.renderColumnSearchRow(tableHead, columns);
    const body = table.createEl("tbody");
    if (!tasks.length) {
      body.createEl("tr").createEl("td", { cls: "noesis-flow-task-list-empty", text: "No tasks match the current filters.", attr: { colspan: String(columns.length + 1) } });
    } else {
      tasks.forEach((task, index) => this.renderTaskRow(body, task, projectListId, columns, index));
    }
  }
}
