import { CALENDAR_TASK_PRIORITIES } from "../utils";
import { NoesisFlowChoiceModal } from "./NoesisFlowChoiceModal";

export class NoesisFlowCalendarPriorityModal extends NoesisFlowChoiceModal {
  constructor(app, onChoose, options: any = {}) {
    super(app, onChoose, {
      ...options,
      title: "Task priority",
      choices: CALENDAR_TASK_PRIORITIES,
      renderMeta: (priority: any) => priority.marker === " " ? "- [ ]" : `- [${priority.marker}] ${priority.description}`
    });
  }
}
