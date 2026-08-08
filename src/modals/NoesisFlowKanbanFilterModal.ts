import { Modal, Notice } from "obsidian";
import { asVoidHandler, DATE_TASK_FILTER_OPTIONS, normalizeDateTaskFilter } from "../utils";
import type { DateTaskFilter, KanbanTaskStatus, KanbanUnscheduledFilter } from "../types";

const PRIORITIES: readonly (readonly [string, string])[] = [
  ["!", "Critical"],
  ["H", "High"],
  ["M", "Medium"],
  ["L", "Low"],
  [" ", "No priority"]
];

type FilterApply = (
  statuses: KanbanTaskStatus[],
  priorities: string[],
  dateFilter: DateTaskFilter,
  unscheduledFilter: KanbanUnscheduledFilter
) => void | Promise<void>;

export class NoesisFlowKanbanFilterModal extends Modal {
  statuses: KanbanTaskStatus[];
  priorities: string[];
  dateFilter: DateTaskFilter;
  unscheduledFilter: KanbanUnscheduledFilter;
  onApply: FilterApply;
  showDateFilter: boolean;

  constructor(app: ConstructorParameters<typeof Modal>[0], statuses: KanbanTaskStatus[], priorities: string[], dateFilter: DateTaskFilter, unscheduledFilter: KanbanUnscheduledFilter, onApply: FilterApply, showDateFilter = true) {
    super(app);
    this.statuses = Array.isArray(statuses) ? statuses : ["active"];
    this.priorities = Array.isArray(priorities) ? priorities : PRIORITIES.map(([marker]) => marker);
    this.dateFilter = dateFilter || "all";
    this.unscheduledFilter = ["auto", "include", "exclude"].includes(unscheduledFilter) ? unscheduledFilter : "auto";
    this.onApply = onApply;
    this.showDateFilter = showDateFilter !== false;
  }

  onOpen() {
    const { contentEl } = this;
    this.modalEl.addClass("noesis-flow-kanban-filter-modal-container");
    contentEl.empty();
    contentEl.addClass("noesis-flow-dialog");
    contentEl.addClass("noesis-flow-kanban-filter-modal");
    const header = contentEl.createDiv({ cls: "noesis-flow-modal-header" });
    header.createEl("h2", { text: "Filter tasks" });
    const filterColumns = contentEl.createDiv({ cls: "noesis-flow-kanban-filter-columns" });
    const leftColumn = filterColumns.createDiv({ cls: "noesis-flow-kanban-filter-column" });
    const rightColumn = filterColumns.createDiv({ cls: "noesis-flow-kanban-filter-column" });

    const makeGroup = <Value extends string>(container: HTMLElement, title: string, items: readonly (readonly [Value, string])[], selected: readonly Value[]): Map<Value, HTMLInputElement> => {
      const group = container.createDiv({ cls: "noesis-flow-kanban-filter-group" });
      group.createEl("div", { cls: "noesis-flow-kanban-filter-group-title", text: title });
      const values = new Map<Value, HTMLInputElement>();
      for (const [value, label] of items) {
        const row = group.createEl("label", { cls: "noesis-flow-kanban-filter-option" });
        const input = row.createEl("input", { type: "checkbox" });
        input.value = value;
        input.checked = selected.includes(value);
        row.createSpan({ text: label });
        values.set(value, input);
      }
      return values;
    };

    const statuses = makeGroup(leftColumn, "Completion", [["active", "Active"], ["completed", "Completed"]] as const, this.statuses);
    const priorities = makeGroup(leftColumn, "Priority", PRIORITIES, this.priorities);
    let unscheduledInput: HTMLInputElement | null = null;
    if (this.showDateFilter) {
      const scheduleGroup = rightColumn.createDiv({ cls: "noesis-flow-kanban-filter-group" });
      scheduleGroup.createEl("div", { cls: "noesis-flow-kanban-filter-group-title", text: "Date" });
      const unscheduledRow = scheduleGroup.createEl("label", { cls: "noesis-flow-kanban-filter-option" });
      unscheduledInput = unscheduledRow.createEl("input", { type: "checkbox" });
      unscheduledInput.checked = this.unscheduledFilter === "include" || (this.unscheduledFilter === "auto" && this.dateFilter === "all");
      unscheduledRow.createSpan({ text: "Include unscheduled tasks" });
    }
    let dateSelect: HTMLSelectElement | null = null;
    if (this.showDateFilter) {
      const dateGroup = leftColumn.createDiv({ cls: "noesis-flow-kanban-filter-group" });
      dateGroup.createEl("div", { cls: "noesis-flow-kanban-filter-group-title", text: "Date range" });
      dateSelect = dateGroup.createEl("select", { cls: "dropdown", attr: { "aria-label": "Kanban date range" } });
      for (const option of DATE_TASK_FILTER_OPTIONS) {
        dateSelect.createEl("option", { text: option.label, attr: { value: option.value } });
      }
      dateSelect.value = this.dateFilter;
    }

    const actions = contentEl.createDiv({ cls: "noesis-flow-kanban-filter-actions" });
    const cancel = actions.createEl("button", { text: "Cancel", attr: { type: "button" } });
    cancel.addEventListener("click", () => this.close());
    const apply = actions.createEl("button", { cls: "mod-cta", text: "Apply filters", attr: { type: "button" } });
    apply.addEventListener("click", asVoidHandler(async () => {
      const nextStatuses = Array.from(statuses.entries()).filter(([, input]) => input.checked).map(([value]) => value);
      const nextPriorities = Array.from(priorities.entries()).filter(([, input]) => input.checked).map(([value]) => value);
      if (!nextStatuses.length || !nextPriorities.length) {
        new Notice("Select at least one option in every filter group.");
        return;
      }
      await this.onApply(nextStatuses, nextPriorities, dateSelect ? normalizeDateTaskFilter(dateSelect.value) : this.dateFilter, unscheduledInput ? (unscheduledInput.checked ? "include" : "exclude") : this.unscheduledFilter);
      this.close();
    }));
  }

  onClose() {
    this.modalEl.removeClass("noesis-flow-kanban-filter-modal-container");
  }
}
