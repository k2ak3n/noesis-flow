import { Modal, Notice, TFile } from "obsidian";
import type NoesisFlowPlugin from "../main";
import { moment } from "../time";
import { CALENDAR_TASK_PRIORITIES } from "../utils";
import { enhanceNoesisFlowDatePickers } from "../ui/NoesisFlowUi";
import { getMarkdownH2Sections } from "../tasks/TaskMarkdown";

/** A single editor used by every task surface. */
export class NoesisFlowTaskDetailsModal extends Modal {
  plugin: NoesisFlowPlugin;
  task: any;

  constructor(app, plugin, task) {
    super(app);
    this.plugin = plugin;
    this.task = task;
  }

  onOpen() {
    const { contentEl } = this;
    this.modalEl.addClass("noesis-flow-task-details-modal-container");
    contentEl.empty();
    contentEl.addClass("noesis-flow-dialog", "noesis-flow-kanban-task-modal", "noesis-flow-task-details-modal");
    const header = contentEl.createDiv({ cls: "noesis-flow-modal-header" });
    header.createEl("h2", { text: "Task details" });
    const form = contentEl.createDiv({ cls: "noesis-flow-kanban-task-form" });
    let fieldIndex = 0;
    const field = (label, control) => {
      const wrap = form.createDiv({ cls: "noesis-flow-kanban-task-field" });
      const labelEl = wrap.createEl("label", { text: label });
      const controlId = `noesis-flow-task-details-${fieldIndex++}`;
      control.id = controlId;
      labelEl.htmlFor = controlId;
      wrap.appendChild(control);
      return wrap;
    };
    const title = document.createElement("input");
    title.type = "text";
    title.value = this.task.text || "";
    field("Task", title).addClass("noesis-flow-kanban-task-name-field");
    const fields = form.createDiv({ cls: "noesis-flow-kanban-task-fields" });
    const meta = (label, control) => {
      const wrap = fields.createDiv({ cls: "noesis-flow-kanban-task-field" });
      const labelEl = wrap.createEl("label", { text: label });
      const controlId = `noesis-flow-task-details-${fieldIndex++}`;
      control.id = controlId;
      labelEl.htmlFor = controlId;
      wrap.appendChild(control);
      return wrap;
    };
    const date = document.createElement("input");
    date.type = "date";
    date.value = this.task.dateKey || "";
    const dateField = meta("Date", date);
    dateField.addClass("noesis-flow-kanban-date-field");
    const noDate = document.createElement("input");
    noDate.type = "checkbox";
    noDate.checked = !date.value;
    date.disabled = noDate.checked;
    dateField.toggleClass("is-undated", noDate.checked);
    const dateLabel = dateField.querySelector("label");
    const noDateLabel = dateLabel.createSpan({ cls: "noesis-flow-kanban-no-date-option" });
    noDateLabel.appendChild(noDate);
    noDateLabel.createSpan({ text: "Unscheduled" });
    noDate.addEventListener("change", () => {
      date.disabled = noDate.checked;
      dateField.toggleClass("is-undated", noDate.checked);
      if (noDate.checked) date.value = "";
      else date.focus();
    });
    const project = document.createElement("input");
    project.type = "text";
    project.value = this.task.section || "";
    const projectListId = `noesis-flow-project-list-${Date.now()}`;
    project.setAttribute("list", projectListId);
    project.placeholder = "Unassigned";
    meta("Project", project);
    const projectList = document.createElement("datalist");
    projectList.id = projectListId;
    const setProjectOptions = (sections: string[]) => {
      projectList.empty();
      for (const section of Array.from(new Set(sections.map((value) => String(value || "").trim()).filter(Boolean)))) {
        projectList.createEl("option", { attr: { value: section } });
      }
    };
    const refreshProjectOptions = async (sourcePath: string) => {
      const fallback = [
        ...this.plugin.getProjectSectionsForSource(sourcePath),
        ...(sourcePath === this.task.sourcePath && this.task.section ? [this.task.section] : [])
      ];
      const file = this.app.vault.getAbstractFileByPath(sourcePath);
      if (!(file instanceof TFile)) {
        setProjectOptions(fallback);
        return;
      }
      try {
        const headings = getMarkdownH2Sections(await this.app.vault.read(file));
        if (projectList.isConnected) setProjectOptions([...headings, ...fallback]);
      } catch (error) {
        console.warn(`Noesis Flow: could not load project headings from ${sourcePath}`, error);
        if (projectList.isConnected) setProjectOptions(fallback);
      }
    };
    form.appendChild(projectList);
    const priority = document.createElement("select");
    for (const item of CALENDAR_TASK_PRIORITIES) priority.createEl("option", { text: item.label, attr: { value: item.marker } });
    priority.value = this.task.marker || " ";
    meta("Priority", priority);
const source = document.createElement("select");
    const sourcePaths = Array.from(new Set([this.task.sourcePath, ...this.plugin.getTaskSourcePaths()].filter(Boolean)));
    for (const path of sourcePaths) source.createEl("option", { text: path, attr: { value: path } });
    source.value = this.task.sourcePath || sourcePaths[0] || "";
    meta("Source note", source);
    void refreshProjectOptions(source.value || this.task.sourcePath);
    source.addEventListener("change", () => void refreshProjectOptions(source.value));
    if (this.task.seriesId) {
      const recurrence = form.createDiv({ cls: "noesis-flow-recurring-occurrence-controls" });
      const series = this.plugin.getRecurringTaskSeries().find((item) => item && item.id === this.task.seriesId);
      const afterCompletion = !!(series && series.recurrence && series.recurrence.rule === "after-completion");
      const recurrenceActions = recurrence.createDiv({ cls: "noesis-flow-recurring-occurrence-actions" });
      const editSeries = recurrenceActions.createEl("button", { text: "Edit future occurrences", attr: { type: "button" } });
      editSeries.addEventListener("click", () => {
        if (series) this.plugin.openRecurringTaskSeriesEditor(series);
      });
      const skipOccurrence = recurrenceActions.createEl("button", { text: "Skip this occurrence", attr: { type: "button" } });
      skipOccurrence.disabled = afterCompletion || !!this.task.completed;
      recurrence.createDiv({
        cls: "noesis-flow-recurring-occurrence-copy",
        text: afterCompletion
          ? "This is a recurring occurrence. Completing it creates the next occurrence; changes here apply only to this date."
          : "This is a recurring occurrence. Changes here apply only to this date; edit the series to update today and future occurrences."
      });
      skipOccurrence.addEventListener("click", () => {
        if (!series || afterCompletion) return;
        const dateLabel = this.task.dateKey || "this date";
        if (confirm(`Skip the ${dateLabel} occurrence? Future occurrences will remain unchanged.`)) {
          void this.plugin.skipRecurringTaskOccurrence(this.task).then((skipped) => { if (skipped) this.close(); });
        }
      });
    }
    enhanceNoesisFlowDatePickers(contentEl);

    const actions = contentEl.createDiv({ cls: "noesis-flow-modal-actions noesis-flow-task-details-actions" });
    const remove = actions.createEl("button", { text: "Delete", cls: "mod-warning", attr: { type: "button" } });
    remove.addEventListener("click", () => { this.close(); this.plugin.requestCalendarTaskDelete(this.task); });
    const primaryActions = actions.createDiv({ cls: "noesis-flow-task-details-primary-actions" });
    const cancel = primaryActions.createEl("button", { text: "Cancel", attr: { type: "button" } });
    cancel.addEventListener("click", () => this.close());
    const completion = primaryActions.createEl("button", { text: this.task.completed ? "Reopen" : "Complete", attr: { type: "button" } });
    completion.addEventListener("click", async () => {
      if (this.task.completed) await this.plugin.updateCalendarTask(this.task, { marker: this.task.marker || " " }, "Task reopened.");
      else await this.plugin.completeCalendarTask(this.task);
      this.close();
    });
    const saveTask = async () => {
      const text = title.value.trim();
      const section = project.value.trim() || "Unassigned";
      if (!text || (date.value && !moment(date.value, "YYYY-MM-DD", true).isValid())) {
        new Notice("Enter a task and valid Date - or clear an optional Date.");
        return;
      }
      const updates: any = {};
      if (text !== this.task.text) updates.text = text;
      if (section !== this.task.section) updates.section = section;
      const registeredProject = this.plugin.findProjectForSection(source.value || this.task.sourcePath, section);
      if ((registeredProject?.id || "") !== (this.task.projectId || "")) updates.projectId = registeredProject?.id || null;
      if (date.value !== (this.task.dateKey || "")) updates.dateKey = date.value;
      if (priority.value !== this.task.marker && !this.task.completed) updates.marker = priority.value;
      const sourceChanged = source.value && source.value !== this.task.sourcePath;
      const saved = sourceChanged
        ? await this.plugin.moveCalendarTaskToSource(this.task, source.value, updates)
        : !Object.keys(updates).length || await this.plugin.updateCalendarTask(this.task, updates);
      if (saved) this.close();
    };
    const save = primaryActions.createEl("button", { text: "Save", cls: "mod-cta", attr: { type: "button" } });
    save.addEventListener("click", saveTask);
    contentEl.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        void saveTask();
      }
    });
    title.focus();
  }

  onClose() {
    this.modalEl.removeClass("noesis-flow-task-details-modal-container");
    this.contentEl.empty();
  }
}
