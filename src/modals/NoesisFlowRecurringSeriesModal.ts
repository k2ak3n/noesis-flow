import { App, Modal, Notice } from "obsidian";
import { moment } from "../time";
import { asVoidHandler, CALENDAR_TASK_PRIORITIES, CALENDAR_TASK_RECURRENCE_OPTIONS } from "../utils";
import { getRecurringTaskDateKeys } from "../tasks/TaskRecurrence";
import { enhanceNoesisFlowDatePicker, enhanceNoesisFlowDatePickers } from "../ui/NoesisFlowUi";
import type { RecurringTaskRecurrence, RecurringTaskSeries } from "../types";

export class NoesisFlowRecurringSeriesModal extends Modal {
  series: RecurringTaskSeries;
  occurrenceLimit: number;
  onSubmit: (updates: Partial<RecurringTaskSeries>) => void | Promise<unknown>;

  constructor(app: App, series: RecurringTaskSeries, occurrenceLimit: number, onSubmit: (updates: Partial<RecurringTaskSeries>) => void | Promise<unknown>) {
    super(app);
    this.series = series;
    this.occurrenceLimit = Math.max(1, Math.min(52, Math.round(Number(occurrenceLimit) || 6)));
    this.onSubmit = onSubmit;
  }

  onOpen() {
    this.modalEl.addClass("noesis-flow-kanban-task-modal-container");
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("noesis-flow-dialog", "noesis-flow-kanban-task-modal");
    const header = contentEl.createDiv({ cls: "noesis-flow-modal-header" });
    header.createEl("h2", { text: "Edit recurring task" });

    const form = contentEl.createDiv({ cls: "noesis-flow-kanban-task-form" });
    let fieldIndex = 0;
    const createField = (parent: HTMLElement, label: string, control: HTMLElement, extraClass = ""): HTMLElement => {
      const field = parent.createDiv({ cls: `noesis-flow-kanban-task-field ${extraClass}`.trim() });
      const labelEl = field.createEl("label", { text: label });
      const controlId = `noesis-flow-recurring-task-${fieldIndex++}`;
      control.id = controlId;
      labelEl.htmlFor = controlId;
      field.appendChild(control);
      return field;
    };
    const taskInput = form.createEl("input");
    taskInput.type = "text";
    taskInput.value = this.series.text || "";
    createField(form, "Task name", taskInput, "noesis-flow-kanban-task-name-field");

    const fields = form.createDiv({ cls: "noesis-flow-kanban-task-fields" });
    const projectInput = fields.createEl("input");
    projectInput.type = "text";
    projectInput.value = this.series.section || "";
    createField(fields, "Project", projectInput);

    const prioritySelect = fields.createEl("select");
    for (const priority of CALENDAR_TASK_PRIORITIES) prioritySelect.add(new Option(priority.label, priority.marker));
    prioritySelect.value = this.series.marker || " ";
    createField(fields, "Priority", prioritySelect);

    const recurrence = this.series.recurrence;
    const repeatSelect = fields.createEl("select");
    for (const option of CALENDAR_TASK_RECURRENCE_OPTIONS.filter((option) => option.value !== "none")) {
      repeatSelect.add(new Option(option.label, option.value));
    }
    repeatSelect.value = recurrence.rule || "weekly";
    createField(fields, "Repeat", repeatSelect);

    const completionUnitSelect = fields.createEl("select");
    for (const option of [["daily", "day"], ["weekly", "week"], ["monthly", "month"]]) {
      completionUnitSelect.add(new Option(option[1], option[0]));
    }
    completionUnitSelect.value = recurrence.completionRule || "weekly";
    const completionUnitField = createField(fields, "After completion", completionUnitSelect);

    const intervalInput = fields.createEl("input");
    intervalInput.type = "number";
    intervalInput.min = "1";
    intervalInput.max = "52";
    intervalInput.step = "1";
    intervalInput.value = String(Math.max(1, Math.min(52, Math.round(Number(recurrence.interval) || 1))));
    const intervalField = createField(fields, "Every", intervalInput);
    const intervalUnit = intervalField.createSpan({ cls: "noesis-flow-kanban-repeat-interval-unit" });

    const skipOptions = fields.createDiv();
    skipOptions.classList.add("noesis-flow-kanban-recurrence-options");
    const weekendLabel = skipOptions.createEl("label");
    const skipWeekendsInput = weekendLabel.createEl("input");
    skipWeekendsInput.type = "checkbox";
    skipWeekendsInput.checked = !!recurrence.skipWeekends;
    weekendLabel.append(skipWeekendsInput, "Skip weekends");
    const holidayLabel = skipOptions.createEl("label");
    const skipHolidaysInput = holidayLabel.createEl("input");
    skipHolidaysInput.type = "checkbox";
    skipHolidaysInput.checked = !!recurrence.skipHolidays;
    holidayLabel.append(skipHolidaysInput, "Skip holidays");
    skipOptions.append(weekendLabel, holidayLabel);
    const skipField = createField(fields, "Skip", skipOptions, "noesis-flow-kanban-task-span-full");

    const excludedDatesInput = fields.createEl("input");
    excludedDatesInput.type = "text";
    excludedDatesInput.placeholder = "2026-12-25, 2026-12-31";
    excludedDatesInput.value = getRecurringTaskDateKeys(recurrence.excludedDates).join(", ");
    const excludedDatesField = createField(fields, "Skip dates", excludedDatesInput, "noesis-flow-kanban-task-span-full");

    const includedDatesInput = fields.createEl("input");
    includedDatesInput.type = "text";
    includedDatesInput.placeholder = "2026-12-24";
    includedDatesInput.value = getRecurringTaskDateKeys(recurrence.includedDates).join(", ");
    const includedDatesField = createField(fields, "Add dates", includedDatesInput, "noesis-flow-kanban-task-span-full");

    const weekdaysInput = fields.createEl("input");
    weekdaysInput.type = "text";
    weekdaysInput.placeholder = "Mon, Wed, Fri";
    weekdaysInput.value = Array.isArray(recurrence.weekdays) ? recurrence.weekdays.join(", ") : recurrence.weekdays || "";
    const weekdaysField = createField(fields, "Weekdays", weekdaysInput, "noesis-flow-kanban-task-span-full");

    const endsSelect = fields.createEl("select");
    endsSelect.add(new Option(`No end (extend in batches of ${this.occurrenceLimit})`, "limit"));
    endsSelect.add(new Option("After a number of occurrences", "count"));
    endsSelect.add(new Option("On a date", "date"));
    endsSelect.value = recurrence.endMode === "count" || recurrence.endMode === "date" ? recurrence.endMode : "limit";
    createField(fields, "Ends", endsSelect);

    const endInput = fields.createEl("input");
    const endField = createField(fields, "Occurrences", endInput);
    const updateFields = () => {
      const rule = repeatSelect.value;
      const unitRule = rule === "after-completion" ? completionUnitSelect.value : rule;
      const unit = unitRule === "daily" ? "day" : unitRule === "monthly" ? "month" : "week";
      const interval = Math.max(1, Math.min(52, Math.round(Number(intervalInput.value) || 1)));
      intervalInput.value = String(interval);
      intervalUnit.textContent = `${unit}${interval === 1 ? "" : "s"}`;
      skipField.classList.remove("is-hidden");
      excludedDatesField.classList.remove("is-hidden");
      includedDatesField.classList.remove("is-hidden");
      weekdaysField.classList.toggle("is-hidden", repeatSelect.value !== "custom-weekdays");
      completionUnitField.classList.toggle("is-hidden", repeatSelect.value !== "after-completion");
      const mode = endsSelect.value;
      endField.classList.toggle("is-hidden", mode === "limit");
      if (mode === "count") {
        endField.querySelector("label").textContent = "Occurrences";
        endInput.type = "number";
        endInput.min = "1";
        endInput.max = "52";
        endInput.value = String(recurrence.endCount || this.series.occurrenceCount || this.occurrenceLimit);
      } else if (mode === "date") {
        endField.querySelector("label").textContent = "End date";
        endInput.type = "date";
        endInput.value = recurrence.endDate || this.series.startDate || "";
      }
      enhanceNoesisFlowDatePicker(endInput);
    };
    repeatSelect.addEventListener("change", updateFields);
    completionUnitSelect.addEventListener("change", updateFields);
    endsSelect.addEventListener("change", updateFields);
    intervalInput.addEventListener("change", updateFields);
    updateFields();

    enhanceNoesisFlowDatePickers(contentEl);

    const actions = contentEl.createDiv({ cls: "noesis-flow-kanban-task-actions" });
    actions.createEl("button", { text: "Cancel", attr: { type: "button" } }).addEventListener("click", () => this.close());
    const save = actions.createEl("button", { cls: "mod-cta", text: "Save changes", attr: { type: "button" } });
    save.addEventListener("click", asVoidHandler(async () => {
      const text = taskInput.value.trim();
      const section = projectInput.value.trim();
      const endMode = endsSelect.value;
      const endValue = endInput.value.trim();
      const interval = Number(intervalInput.value);
      const excludedDates = getRecurringTaskDateKeys(excludedDatesInput.value);
      const includedDates = getRecurringTaskDateKeys(includedDatesInput.value);
      if (!text || !section) {
        new Notice("Enter a task name and project.");
        return;
      }
      if (repeatSelect.value === "custom-weekdays" && !weekdaysInput.value.trim()) {
        new Notice("Enter at least one weekday for a custom repeat.");
        return;
      }
      if (!Number.isInteger(interval) || interval < 1 || interval > 52) {
        new Notice("Choose a repeat interval between 1 and 52.");
        return;
      }
      const invalidExceptionDate = (value) => String(value || "").split(/[\s,|/]+/).filter(Boolean).some((dateKey) => !moment(dateKey, "YYYY-MM-DD", true).isValid());
      if (invalidExceptionDate(excludedDatesInput.value) || invalidExceptionDate(includedDatesInput.value)) {
        new Notice("Use YYYY-MM-DD for exception dates.");
        return;
      }
      if (endMode === "count" && (!/^\d+$/.test(endValue) || Number(endValue) < 1 || Number(endValue) > 52)) {
        new Notice("Choose between 1 and 52 occurrences.");
        return;
      }
      if (endMode === "date" && !moment(endValue, "YYYY-MM-DD", true).isValid()) {
        new Notice("Choose a valid end date.");
        return;
      }
      save.disabled = true;
      const rule = repeatSelect.value as RecurringTaskRecurrence["rule"];
      const completionRule = completionUnitSelect.value as NonNullable<RecurringTaskRecurrence["completionRule"]>;
      const normalizedEndMode = endMode as NonNullable<RecurringTaskRecurrence["endMode"]>;
      await this.onSubmit({
        text,
        section,
        marker: prioritySelect.value,
        recurrence: {
          rule,
          completionRule: rule === "after-completion" ? completionRule : undefined,
          interval,
          weekdays: weekdaysInput.value.trim(),
          skipWeekends: skipWeekendsInput.checked,
          skipHolidays: skipHolidaysInput.checked,
          excludedDates,
          includedDates,
          endMode: normalizedEndMode,
          endCount: endMode === "count" ? Number(endValue) : 0,
          endDate: endMode === "date" ? endValue : ""
        }
      });
      this.close();
    }));
  }
}
