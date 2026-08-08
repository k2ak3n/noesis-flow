import { App } from "obsidian";
import { CALENDAR_TASK_PRIORITIES } from "../utils";
import { NoesisFlowChoiceModal } from "./NoesisFlowChoiceModal";

type CalendarTaskPriority = (typeof CALENDAR_TASK_PRIORITIES)[number];

export class NoesisFlowCalendarPriorityModal extends NoesisFlowChoiceModal<CalendarTaskPriority> {
  constructor(app: App, onChoose: (priority: CalendarTaskPriority) => void | Promise<void>, options: { onCancel?: () => void } = {}) {
    super(app, onChoose, {
      ...options,
      title: "Task priority",
      choices: CALENDAR_TASK_PRIORITIES,
      renderMeta: (priority) => priority.marker === " " ? "- [ ]" : `- [${priority.marker}] ${priority.description}`
    });
  }
}
