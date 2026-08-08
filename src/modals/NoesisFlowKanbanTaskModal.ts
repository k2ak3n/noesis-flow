import { App, Modal, Notice } from "obsidian";
import type { MomentInput } from "moment";
import { moment } from "../time";
import { asVoidHandler, CALENDAR_TASK_PRIORITIES, CALENDAR_TASK_RECURRENCE_OPTIONS } from "../utils";
import { getRecurringTaskDateKeys } from "../tasks/TaskRecurrence";
import { enhanceNoesisFlowDatePicker, enhanceNoesisFlowDatePickers } from "../ui/NoesisFlowUi";
import type { RecurringTaskRecurrence, RecurringTaskRule } from "../types";

export type TaskCaptureSubmission = {
  text: string;
  section: string;
  dateKey: string;
  marker: string;
  metadata: Record<string, unknown>;
  recurrence: RecurringTaskRecurrence;
};

type KanbanTaskModalOptions = {
  defaultRecurrence?: RecurringTaskRule;
  defaultUndated?: boolean;
  initialDate?: MomentInput;
  onCancel?: () => void;
  recurrenceLimit?: number;
};

export class NoesisFlowKanbanTaskModal extends Modal {
  sections: string[];
  recurrenceEnabled: boolean;
  onSubmit: (task: TaskCaptureSubmission) => void | Promise<unknown>;
  onCancel: (() => void) | null;
  initialDate: string;
  recurrenceLimit: number;
  defaultRecurrence: RecurringTaskRule;
  defaultUndated: boolean;
  didSubmit: boolean;

  constructor(app: App, sections: string[], recurrenceEnabled: boolean, onSubmit: (task: TaskCaptureSubmission) => void | Promise<unknown>, options: KanbanTaskModalOptions = {}) {
    super(app);
    this.sections = Array.isArray(sections) ? sections : [];
    this.recurrenceEnabled = !!recurrenceEnabled;
    this.onSubmit = onSubmit;
    this.onCancel = typeof options.onCancel === "function" ? options.onCancel : null;
    const initialDate = moment(options.initialDate || moment());
    this.initialDate = initialDate.isValid() ? initialDate.format("YYYY-MM-DD") : moment().format("YYYY-MM-DD");
    this.recurrenceLimit = Math.max(1, Math.min(52, Math.round(Number(options.recurrenceLimit) || 6)));
    this.defaultRecurrence = options.defaultRecurrence || "none";
    this.defaultUndated = !!options.defaultUndated;
    this.didSubmit = false;
  }

  onOpen() {
    const { contentEl } = this;
    this.modalEl.addClass("noesis-flow-kanban-task-modal-container");
    contentEl.empty();
    contentEl.addClass("noesis-flow-dialog");
    contentEl.addClass("noesis-flow-kanban-task-modal");
    const header = contentEl.createDiv({ cls: "noesis-flow-kanban-task-header" });
    header.createEl("h2", { text: "New task" });
    header.createDiv({ cls: "noesis-flow-kanban-task-date", text: this.defaultUndated ? "Unscheduled" : moment(this.initialDate, "YYYY-MM-DD").format("ddd, MMM D") });

    const form = contentEl.createDiv({ cls: "noesis-flow-kanban-task-form" });
    const createField = (label: string, control: HTMLElement): HTMLElement => {
      const field = form.createDiv({ cls: "noesis-flow-kanban-task-field" });
      field.createEl("label", { text: label });
      field.appendChild(control);
      return field;
    };

    const taskInput = form.createEl("input");
    taskInput.type = "text";
    taskInput.placeholder = "Task name";
    taskInput.setAttribute("aria-label", "Task name");
    createField("Task name", taskInput).addClass("noesis-flow-kanban-task-name-field");

    const fields = form.createDiv({ cls: "noesis-flow-kanban-task-fields" });
    const createMetaField = (label: string, control: HTMLElement): HTMLElement => {
      const field = fields.createDiv({ cls: "noesis-flow-kanban-task-field" });
      field.createEl("label", { text: label });
      field.appendChild(control);
      return field;
    };

    const dateInput = fields.createEl("input");
    dateInput.type = "date";
    dateInput.value = this.initialDate;
    dateInput.setAttribute("aria-label", "Date");
    const dateField = createMetaField("Date", dateInput);
    dateField.addClass("noesis-flow-kanban-date-field");
    const dateLabel = dateField.querySelector("label");
    const noDateLabel = dateLabel.createSpan({ cls: "noesis-flow-kanban-no-date-option" });
    const noDateInput = noDateLabel.createEl("input", { type: "checkbox" });
    noDateInput.checked = this.defaultUndated;
    noDateLabel.createSpan({ text: "Unscheduled" });

    const sectionListId = `noesis-flow-kanban-section-list-${Date.now()}`;
    const sectionInput = fields.createEl("input");
    sectionInput.type = "text";
    sectionInput.placeholder = "Unassigned";
    sectionInput.setAttribute("list", sectionListId);
    sectionInput.setAttribute("aria-label", "Task project");
    createMetaField("Project", sectionInput);
    const sectionList = form.createEl("datalist");
    sectionList.id = sectionListId;
    for (const section of this.sections) {
      const option = sectionList.createEl("option");
      option.value = section;
      sectionList.appendChild(option);
    }
    form.appendChild(sectionList);

    const prioritySelect = fields.createEl("select");
    prioritySelect.setAttribute("aria-label", "Task priority");
    for (const priority of CALENDAR_TASK_PRIORITIES) {
      const option = prioritySelect.createEl("option");
      option.value = priority.marker;
      option.text = priority.label;
      prioritySelect.appendChild(option);
    }
    prioritySelect.value = " ";
    createMetaField("Priority", prioritySelect);


    let recurrenceSelect: HTMLSelectElement | null = null;
    let completionUnitSelect: HTMLSelectElement | null = null;
    let weekdaysInput: HTMLInputElement | null = null;
    let weekdaysField: HTMLElement | null = null;
    let intervalInput: HTMLInputElement | null = null;
    let intervalField: HTMLElement | null = null;
    let intervalUnit: HTMLElement | null = null;
    let skipWeekendsInput: HTMLInputElement | null = null;
    let skipHolidaysInput: HTMLInputElement | null = null;
    let skipField: HTMLElement | null = null;
    let excludedDatesInput: HTMLInputElement | null = null;
    let excludedDatesField: HTMLElement | null = null;
    let includedDatesInput: HTMLInputElement | null = null;
    let includedDatesField: HTMLElement | null = null;
    let endModeSelect: HTMLSelectElement | null = null;
    let endModeField: HTMLElement | null = null;
    let endValueInput: HTMLInputElement | null = null;
    let endValueField: HTMLElement | null = null;
    if (this.recurrenceEnabled) {
      recurrenceSelect = fields.createEl("select");
      recurrenceSelect.setAttribute("aria-label", "Task recurrence");
      for (const recurrence of CALENDAR_TASK_RECURRENCE_OPTIONS) {
        const option = recurrenceSelect.createEl("option");
        option.value = recurrence.value;
        option.text = recurrence.label;
        recurrenceSelect.appendChild(option);
      }
      if (CALENDAR_TASK_RECURRENCE_OPTIONS.some((recurrence) => recurrence.value === this.defaultRecurrence)) {
        recurrenceSelect.value = this.defaultRecurrence;
      }
      createMetaField("Repeat", recurrenceSelect);

      completionUnitSelect = fields.createEl("select");
      completionUnitSelect.setAttribute("aria-label", "After completion interval");
      for (const option of [["daily", "day"], ["weekly", "week"], ["monthly", "month"]]) {
        completionUnitSelect.createEl("option", { text: option[1], attr: { value: option[0] } });
      }
      const completionUnitField = createMetaField("After completion", completionUnitSelect);
      completionUnitField.addClass("is-hidden");

      intervalInput = fields.createEl("input");
      intervalInput.type = "number";
      intervalInput.min = "1";
      intervalInput.max = "52";
      intervalInput.step = "1";
      intervalInput.value = "1";
      intervalInput.setAttribute("aria-label", "Repeat interval");
      intervalField = createMetaField("Every", intervalInput);
      intervalUnit = intervalField.createSpan({ cls: "noesis-flow-kanban-repeat-interval-unit" });

      const skipOptions = fields.createDiv();
      skipOptions.classList.add("noesis-flow-kanban-recurrence-options");
      const weekendLabel = skipOptions.createEl("label");
      skipWeekendsInput = weekendLabel.createEl("input");
      skipWeekendsInput.type = "checkbox";
      weekendLabel.appendChild(skipWeekendsInput);
      weekendLabel.append("Skip weekends");
      const holidayLabel = skipOptions.createEl("label");
      skipHolidaysInput = holidayLabel.createEl("input");
      skipHolidaysInput.type = "checkbox";
      holidayLabel.appendChild(skipHolidaysInput);
      holidayLabel.append("Skip holidays");
      skipOptions.append(weekendLabel, holidayLabel);
      skipField = createMetaField("Skip", skipOptions);
      skipField.addClass("noesis-flow-kanban-task-span-full");

      excludedDatesInput = fields.createEl("input");
      excludedDatesInput.type = "text";
      excludedDatesInput.placeholder = "2026-12-25, 2026-12-31";
      excludedDatesInput.setAttribute("aria-label", "Dates to skip");
      excludedDatesField = createMetaField("Skip dates", excludedDatesInput);
      excludedDatesField.addClass("noesis-flow-kanban-task-span-full");

      includedDatesInput = fields.createEl("input");
      includedDatesInput.type = "text";
      includedDatesInput.placeholder = "2026-12-24";
      includedDatesInput.setAttribute("aria-label", "Additional recurrence dates");
      includedDatesField = createMetaField("Add dates", includedDatesInput);
      includedDatesField.addClass("noesis-flow-kanban-task-span-full");

      weekdaysInput = fields.createEl("input");
      weekdaysInput.type = "text";
      weekdaysInput.placeholder = "Mon, Wed, Fri";
      weekdaysInput.setAttribute("aria-label", "Custom repeat weekdays");
      weekdaysField = createMetaField("Weekdays", weekdaysInput);
      weekdaysField.addClass("noesis-flow-kanban-task-span-full");
      weekdaysField.addClass("is-hidden");

      endModeSelect = fields.createEl("select");
      endModeSelect.setAttribute("aria-label", "When recurrence ends");
      for (const endOption of [
        { value: "limit", label: `No end (up to ${this.recurrenceLimit} occurrences)` },
        { value: "count", label: "After a number of occurrences" },
        { value: "date", label: "On a date" }
      ]) {
        const option = endModeSelect.createEl("option");
        option.value = endOption.value;
        option.text = endOption.label;
        endModeSelect.appendChild(option);
      }
      endModeField = createMetaField("Ends", endModeSelect);
      endModeField.addClass("is-hidden");

      endValueInput = fields.createEl("input");
      endValueInput.setAttribute("aria-label", "Recurrence end value");
      endValueField = createMetaField("Occurrences", endValueInput);
      endValueField.addClass("is-hidden");

      const updateRepeatFields = () => {
        const undated = noDateInput.checked;
        const repeats = !undated && recurrenceSelect.value !== "none";
        recurrenceSelect.disabled = undated;
        const endMode = endModeSelect.value;
        const rule = recurrenceSelect.value;
        const unitRule = rule === "after-completion" ? completionUnitSelect.value : rule;
        const unit = unitRule === "daily" ? "day" : unitRule === "monthly" ? "month" : "week";
        const interval = Math.max(1, Math.min(52, Math.round(Number(intervalInput.value) || 1)));
        intervalInput.value = String(interval);
        intervalField.classList.toggle("is-hidden", !repeats);
        intervalUnit.textContent = `${unit}${interval === 1 ? "" : "s"}`;
        skipField.classList.toggle("is-hidden", !repeats);
        excludedDatesField.classList.toggle("is-hidden", !repeats);
        includedDatesField.classList.toggle("is-hidden", !repeats);
        weekdaysField.classList.toggle("is-hidden", !repeats || recurrenceSelect.value !== "custom-weekdays");
        completionUnitField.classList.toggle("is-hidden", !repeats || recurrenceSelect.value !== "after-completion");
        endModeField.classList.toggle("is-hidden", !repeats);
        endValueField.classList.toggle("is-hidden", !repeats || endMode === "limit");
        if (endMode === "count") {
          endValueField.querySelector("label").textContent = "Occurrences";
          endValueInput.type = "number";
          endValueInput.min = "1";
          endValueInput.max = String(this.recurrenceLimit);
          endValueInput.step = "1";
          endValueInput.placeholder = String(this.recurrenceLimit);
          if (!/^\d+$/.test(endValueInput.value)) endValueInput.value = String(this.recurrenceLimit);
        } else if (endMode === "date") {
          endValueField.querySelector("label").textContent = "End date";
          endValueInput.type = "date";
          endValueInput.removeAttribute("min");
          endValueInput.removeAttribute("max");
          endValueInput.removeAttribute("step");
          endValueInput.value = this.initialDate;
        }
        enhanceNoesisFlowDatePicker(endValueInput);
      };
      recurrenceSelect.addEventListener("change", updateRepeatFields);
      completionUnitSelect.addEventListener("change", updateRepeatFields);
      endModeSelect.addEventListener("change", updateRepeatFields);
      noDateInput.addEventListener("change", updateRepeatFields);
      updateRepeatFields();
    }

    noDateInput.addEventListener("change", () => {
      dateInput.disabled = noDateInput.checked;
      dateField.classList.toggle("is-undated", noDateInput.checked);
    });
    dateInput.disabled = noDateInput.checked;
    dateField.classList.toggle("is-undated", noDateInput.checked);

    enhanceNoesisFlowDatePickers(contentEl);

    const submit = async () => {
      const text = taskInput.value.trim();
      const section = sectionInput.value.trim() || "Unassigned";
      const dateKey = noDateInput.checked ? "" : dateInput.value.trim();
      const recurrence = noDateInput.checked ? "none" : recurrenceSelect ? recurrenceSelect.value : "none";
      const weekdays = weekdaysInput ? weekdaysInput.value.trim() : "";
      const interval = intervalInput ? Number(intervalInput.value) : 1;
      const excludedDates = excludedDatesInput ? getRecurringTaskDateKeys(excludedDatesInput.value) : [];
      const includedDates = includedDatesInput ? getRecurringTaskDateKeys(includedDatesInput.value) : [];
      const endMode = recurrence !== "none" && endModeSelect ? endModeSelect.value : "limit";
      const endValue = endValueInput ? endValueInput.value.trim() : "";

      if (!text || (dateKey && !moment(dateKey, "YYYY-MM-DD", true).isValid())) {
        new Notice("Enter a task and valid Date - or choose Unscheduled.");
        return;
      }
      if (recurrence === "custom-weekdays" && !weekdays) {
        new Notice("Enter at least one weekday for a custom repeat.");
        return;
      }
      if (recurrence !== "none" && (!Number.isInteger(interval) || interval < 1 || interval > 52)) {
        new Notice("Choose a repeat interval between 1 and 52.");
        return;
      }
      const invalidExceptionDate = (value: unknown): boolean => String(value || "").split(/[\s,|/]+/).filter(Boolean).some((dateKey) => !moment(dateKey, "YYYY-MM-DD", true).isValid());
      if (recurrence !== "none" && (invalidExceptionDate(excludedDatesInput && excludedDatesInput.value) || invalidExceptionDate(includedDatesInput && includedDatesInput.value))) {
        new Notice("Use YYYY-MM-DD for exception dates.");
        return;
      }
      if (endMode === "count" && (!/^\d+$/.test(endValue) || Number(endValue) < 1 || Number(endValue) > this.recurrenceLimit)) {
        new Notice(`Choose between 1 and ${this.recurrenceLimit} occurrences.`);
        return;
      }
      if (endMode === "date") {
        const endDate = moment(endValue, "YYYY-MM-DD", true);
        if (!endDate.isValid() || endDate.isBefore(moment(dateKey, "YYYY-MM-DD", true), "day")) {
          new Notice("Choose an end date on or after the task date.");
          return;
        }
      }

      try {
        const rule = recurrence as RecurringTaskRule;
        const completionRule = completionUnitSelect?.value as NonNullable<RecurringTaskRecurrence["completionRule"]> | undefined;
        const normalizedEndMode = endMode as NonNullable<RecurringTaskRecurrence["endMode"]>;
        await this.onSubmit({
          text,
          section,
          dateKey,
          marker: prioritySelect.value,
          metadata: {},
          recurrence: {
            rule,
            completionRule: rule === "after-completion" ? completionRule : undefined,
            interval,
            weekdays,
            skipWeekends: !!(skipWeekendsInput && skipWeekendsInput.checked),
            skipHolidays: !!(skipHolidaysInput && skipHolidaysInput.checked),
            excludedDates,
            includedDates,
            endMode: normalizedEndMode,
            endCount: endMode === "count" ? Number(endValue) : 0,
            endDate: endMode === "date" ? endValue : ""
          }
        });
        this.didSubmit = true;
        this.close();
      } catch (error) {
        console.error(error);
        new Notice(`Could not add task: ${error instanceof Error ? error.message : String(error)}`);
      }
    };

    const actions = contentEl.createDiv({ cls: "noesis-flow-kanban-task-actions" });
    const cancelButton = actions.createEl("button", { text: "Cancel", attr: { type: "button" } });
    cancelButton.addEventListener("click", () => this.close());
    const submitButton = actions.createEl("button", {
      cls: "mod-cta",
      text: "ADD TASK",
      attr: { type: "button" }
    });
    submitButton.addEventListener("click", asVoidHandler(submit));

    window.setTimeout(() => taskInput.focus(), 0);
  }

  onClose() {
    if (!this.didSubmit && this.onCancel) this.onCancel();
  }
}
