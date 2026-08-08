import { ItemView, Notice, setIcon } from "obsidian";
import type NoesisFlowPlugin from "../main";
import { moment } from "../time";
import { asVoidHandler, NOESIS_FLOW_RECURRING_VIEW_TYPE } from "../utils";
import { getRecurringTaskLabel } from "../tasks/TaskRecurrence";
import { NoesisFlowConfirmModal } from "../modals/NoesisFlowConfirmModal";

export class NoesisFlowRecurringView extends ItemView {
  plugin: NoesisFlowPlugin;

  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() {
    return NOESIS_FLOW_RECURRING_VIEW_TYPE;
  }

  getDisplayText() {
    return "Recurring tasks";
  }

  getIcon() {
    return "repeat-2";
  }

  async onOpen() {
    this.contentEl.addClass("noesis-flow-recurring-view-content");
    this.render();
  }

  async onClose() {
    this.contentEl.empty();
    this.contentEl.removeClass("noesis-flow-recurring-view-content");
  }

  renderIconButton(container, icon, label, onClick, cls = "") {
    const button = container.createEl("button", {
      cls: `clickable-icon noesis-flow-recurring-icon-button ${cls}`,
      attr: { type: "button", "aria-label": label, title: label }
    });
    setIcon(button, icon);
    button.addEventListener("click", onClick);
    return button;
  }

  render() {
    this.contentEl.empty();
    const root = this.contentEl.createDiv({ cls: "noesis-flow-recurring-manager" });

    if (!this.plugin.settings.recurringTasksEnabled || !this.plugin.settings.recurringTaskManagerEnabled) {
      root.createDiv({ cls: "noesis-flow-calendar-empty", text: "Recurring tasks are disabled in Noesis Flow settings." });
      return;
    }

    const header = root.createDiv({ cls: "noesis-flow-recurring-header" });
    const heading = header.createDiv();
    heading.createEl("h2", { text: "Recurring tasks" });
    const headerActions = header.createDiv({ cls: "noesis-flow-recurring-header-actions" });
    const recoverButton = headerActions.createEl("button", { text: "Recover from notes", attr: { type: "button" } });
    recoverButton.addEventListener("click", asVoidHandler(async () => {
      recoverButton.disabled = true;
      const recovered = await this.plugin.recoverRecurringTaskSeries(true);
      new Notice(recovered ? `Recovered ${recovered} recurring ${recovered === 1 ? "series" : "series"}.` : "No missing recurring series were found in configured task notes.");
      this.render();
    }));
    const maintainButton = headerActions.createEl("button", { text: "Refresh upcoming", attr: { type: "button" } });
    maintainButton.addEventListener("click", asVoidHandler(async () => {
      maintainButton.disabled = true;
      const added = await this.plugin.maintainRecurringTaskSeriesHorizon(true);
      new Notice(added ? `Added ${added} upcoming ${added === 1 ? "date" : "dates"}.` : "Upcoming recurring dates are already covered.");
      this.render();
    }));
    const addButton = headerActions.createEl("button", { text: "New recurring task", attr: { type: "button" } });
    addButton.addEventListener("click", () => void this.plugin.openRecurringTaskCapture());

    const seriesList = this.plugin.getRecurringTaskSeries()
      .slice()
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === "active" ? -1 : 1;
        return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
      });

    if (!seriesList.length) {
      root.createDiv({
        cls: "noesis-flow-calendar-empty noesis-flow-recurring-empty",
        text: "No tracked series yet. Create a task with Repeat set to Daily, Weekly, Monthly, or Custom."
      });
      return;
    }

    const list = root.createDiv({ cls: "noesis-flow-recurring-list" });
    for (const series of seriesList) this.renderSeries(list, series);
  }

  renderSeries(container, series) {
    const card = container.createDiv({ cls: `noesis-flow-recurring-card is-${series.status === "paused" ? "paused" : "active"}` });
    const top = card.createDiv({ cls: "noesis-flow-recurring-card-top" });
    top.createDiv({ cls: "noesis-flow-recurring-task-name", text: series.text || "Untitled task" });
    top.createSpan({ cls: "noesis-flow-recurring-status", text: series.status === "paused" ? "Paused" : "Active" });

    const repeatLabel = getRecurringTaskLabel(series.recurrence || { rule: "weekly" }) || "Repeats";
    const start = moment(series.startDate, "YYYY-MM-DD", true);
    const progress = this.plugin.getRecurringTaskSeriesProgress(series);
    const progressPercent = progress.plannedCount ? Math.round(progress.completedCount / progress.plannedCount * 100) : 0;
    const upcoming = this.plugin.getRecurringTaskSeriesUpcomingDates(series, 3);
    const separator = ` ${String.fromCharCode(183)} `;
    const details = [
      series.section || "No project",
      repeatLabel,
      `${progress.plannedCount} planned ${progress.plannedCount === 1 ? "date" : "dates"}`,
      start.isValid() ? `Starts ${start.format("MMM D, YYYY")}` : ""
    ].filter(Boolean);
    card.createDiv({ cls: "noesis-flow-recurring-details", text: details.join(separator) });
    if (series.sourcePath) card.createDiv({ cls: "noesis-flow-recurring-source", text: series.sourcePath });
    const recurrence = series.recurrence || {};
    const exceptions = [
      recurrence.skipWeekends ? "Skip weekends" : "",
      recurrence.skipHolidays ? "Skip holidays" : "",
      Array.isArray(recurrence.excludedDates) && recurrence.excludedDates.length ? `${recurrence.excludedDates.length} skipped date${recurrence.excludedDates.length === 1 ? "" : "s"}` : "",
      Array.isArray(recurrence.includedDates) && recurrence.includedDates.length ? `${recurrence.includedDates.length} added date${recurrence.includedDates.length === 1 ? "" : "s"}` : ""
    ].filter(Boolean);
    if (exceptions.length) card.createDiv({ cls: "noesis-flow-recurring-exceptions", text: exceptions.join(separator) });

    const progressRow = card.createDiv({ cls: "noesis-flow-recurring-progress-row" });
    progressRow.createSpan({ text: `${progress.completedCount} of ${progress.plannedCount} completed` });
    const progressBar = progressRow.createEl("progress", { attr: { max: String(progress.plannedCount), value: String(progress.completedCount) } });
    progressBar.setAttribute("aria-label", `${progressPercent}% complete`);
    if (upcoming.length) {
      const nextLabel = upcoming[0].format("ddd, MMM D");
      const laterLabel = upcoming.slice(1).map((date) => date.format("ddd, MMM D")).join(separator);
      card.createDiv({ cls: "noesis-flow-recurring-upcoming", text: laterLabel ? `Next: ${nextLabel}${separator}Then: ${laterLabel}` : `Next: ${nextLabel}` });
    } else if (series.status === "active") {
      card.createDiv({ cls: "noesis-flow-recurring-upcoming", text: "No further dates are currently planned." });
    }

    const actions = card.createDiv({ cls: "noesis-flow-recurring-actions" });
    const editButton = actions.createEl("button", { text: "Edit", attr: { type: "button" } });
    editButton.addEventListener("click", () => void this.plugin.openRecurringTaskSeriesEditor(series));
    const extendButton = actions.createEl("button", { text: `Add ${this.plugin.settings.recurringTaskOccurrenceLimit} dates`, attr: { type: "button" } });
    extendButton.disabled = series.status === "paused";
    extendButton.addEventListener("click", asVoidHandler(async () => {
      extendButton.disabled = true;
      const added = await this.plugin.extendRecurringTaskSeries(series.id);
      new Notice(added ? `Added ${added} planned ${added === 1 ? "date" : "dates"}.` : "No further dates can be added for this series.");
      if (!added) extendButton.disabled = series.status === "paused";
    }));
    const statusButton = actions.createEl("button", {
      text: series.status === "paused" ? "Resume" : "Pause",
      attr: { type: "button" }
    });
    statusButton.addEventListener("click", asVoidHandler(async () => {
      statusButton.disabled = true;
      await this.plugin.setRecurringTaskSeriesStatus(series.id, series.status === "paused" ? "active" : "paused");
      new Notice(series.status === "paused" ? "Recurring task resumed." : "Recurring task paused.");
    }));
    this.renderIconButton(actions, "trash-2", "Remove tracking", async () => {
      new NoesisFlowConfirmModal(this.app, {
        title: "Remove recurring-task tracking",
        message: "Remove this series from the manager? Its task lines will stay in your note.",
        confirmLabel: "Remove tracking",
        onConfirm: async () => {
          await this.plugin.removeRecurringTaskSeries(series.id);
          new Notice("Recurring task tracking removed.");
        }
      }).open();
    }, "is-destructive");
  }
}
