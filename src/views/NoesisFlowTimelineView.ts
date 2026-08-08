import type NoesisFlowPlugin from "../main";
import type { WorkspaceLeaf } from "obsidian";
import { NoesisFlowTimedView } from "./NoesisFlowTimedView";
import { NOESIS_FLOW_TIMELINE_VIEW_TYPE, clampNumber } from "../utils";
import { createCalendarIconButton, createNoesisFlowWidgetEmpty, createNoesisFlowWidgetShell, renderNoesisFlowMarkdown } from "../ui/NoesisFlowUi";

export class NoesisFlowTimelineView extends NoesisFlowTimedView {
  plugin: NoesisFlowPlugin;
  constructor(leaf: WorkspaceLeaf, plugin: NoesisFlowPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() {
    return NOESIS_FLOW_TIMELINE_VIEW_TYPE;
  }

  getDisplayText() {
    return "Timeline";
  }

  getIcon() {
    return "calendar-clock";
  }

  async onOpen() {
    this.contentEl.empty();
    this.contentEl.addClass("noesis-flow-timeline-view-content");
    await this.plugin.refreshTimelineEntries(false);
    await this.plugin.refreshHolidayCalendar(false);
    this.render();
    this.startPeriodicRender(60000);
  }

  async onClose() {
    this.stopPeriodicRender();
    this.contentEl.empty();
    this.contentEl.removeClass("noesis-flow-timeline-view-content");
  }

  render() {
    if (!this.contentEl) return;
    this.contentEl.empty();

    if (!this.plugin.settings.timelineAddonEnabled) {
      this.contentEl.createDiv({ cls: "noesis-flow-calendar-empty", text: "Timeline is disabled in Noesis Flow settings." });
      return;
    }

    const rangeDays = clampNumber(this.plugin.settings.timelineRangeDays, 1, 365, 60);
    const { body } = createNoesisFlowWidgetShell(this.contentEl, {
      shellClass: "noesis-flow-timeline-shell",
      title: "Timeline",
      meta: `Next ${rangeDays}d`,
      metaClass: "noesis-flow-timeline-range",
      renderActions: (actions) => createCalendarIconButton(actions, "plus", "New event", () => void this.plugin.openTimelineEventCreator(), "+")
    });

    const entries = this.plugin.getTimelineEntries();
    if (!entries.length) {
      createNoesisFlowWidgetEmpty(body, "No upcoming events in this range.", "noesis-flow-timeline-empty");
      return;
    }

    const list = body.createDiv({ cls: "noesis-flow-timeline-list" });
    for (const entry of entries.slice(0, 80)) {
      const item = list.createDiv({ cls: `noesis-flow-timeline-item type-${entry.type || "event"}` });
      const date = item.createDiv({ cls: "noesis-flow-timeline-date" });
      if (entry.type !== "holiday") {
        date.style.setProperty("--noesis-flow-event-color", this.plugin.getCalendarEventColor());
      }
      date.createDiv({ cls: "noesis-flow-timeline-day", text: entry.date.format("D") });
      date.createDiv({ cls: "noesis-flow-timeline-month", text: entry.date.format("MMM") });
      const text = item.createDiv({ cls: "noesis-flow-timeline-text" });
      renderNoesisFlowMarkdown(text.createDiv({ cls: "noesis-flow-timeline-title" }), entry.label, {
        app: this.app,
        component: this
      });
      text.createDiv({ cls: "noesis-flow-timeline-meta", text: entry.section || (entry.type === "holiday" ? "Holiday" : "Event") });
      if (entry.type !== "holiday") {
        const edit = item.createDiv({ cls: "noesis-flow-timeline-edit" });
        createCalendarIconButton(edit, "pencil", `Edit ${entry.label}`, () => void this.plugin.openTimelineEventEditor(entry), "", "noesis-flow-task-edit-button");
      }
    }
  }
}
