import { App, Modal, Notice } from "obsidian";
import { moment } from "../time";
import { enhanceNoesisFlowDatePickers } from "../ui/NoesisFlowUi";
import { NoesisFlowConfirmModal } from "./NoesisFlowConfirmModal";
import { asVoidHandler } from "../utils";
import type { TimelineEntry } from "../types";

type TimelineEventDetails = Pick<TimelineEntry, "dateKey" | "label" | "section">;

export class NoesisFlowTimelineEventModal extends Modal {
  event: Partial<TimelineEventDetails>;
  sections: string[];
  onSubmit: (event: TimelineEventDetails) => void | Promise<unknown>;
  onDelete: (() => boolean | Promise<boolean>) | null;
  title: string;

  constructor(app: App, event: Partial<TimelineEventDetails>, sections: string[], onSubmit: (event: TimelineEventDetails) => void | Promise<unknown>, title = "Edit event", onDelete: (() => boolean | Promise<boolean>) | null = null) {
    super(app);
    this.event = event || {};
    this.sections = Array.isArray(sections) ? sections : [];
    this.onSubmit = onSubmit;
    this.title = title;
    this.onDelete = onDelete;
  }

  onOpen() {
    const { contentEl } = this;
    this.modalEl.addClass("noesis-flow-kanban-task-modal-container");
    contentEl.empty();
    contentEl.addClass("noesis-flow-dialog", "noesis-flow-kanban-task-modal");
    const header = contentEl.createDiv({ cls: "noesis-flow-modal-header" });
    header.createEl("h2", { text: this.title });
    const form = contentEl.createDiv({ cls: "noesis-flow-kanban-task-form" });
    const createField = (label: string, input: HTMLElement): HTMLElement => {
      const field = form.createDiv({ cls: "noesis-flow-kanban-task-field" });
      field.createEl("label", { text: label });
      field.appendChild(input);
      return field;
    };

    const name = form.createEl("input");
    name.type = "text";
    name.value = this.event.label || "";
    name.placeholder = "Event name";
    createField("Event", name).addClass("noesis-flow-kanban-task-name-field");

    const fields = form.createDiv({ cls: "noesis-flow-kanban-task-fields" });
    const date = fields.createEl("input");
    date.type = "date";
    date.value = this.event.dateKey || moment().format("YYYY-MM-DD");
    const dateField = fields.createDiv({ cls: "noesis-flow-kanban-task-field" });
    dateField.createEl("label", { text: "Date" });
    dateField.appendChild(date);

    const project = fields.createEl("input");
    project.type = "text";
    project.value = this.event.section || "";
    project.placeholder = "Optional project";
    project.setAttribute("list", `noesis-flow-timeline-projects-${Date.now()}`);
    const projectField = fields.createDiv({ cls: "noesis-flow-kanban-task-field" });
    projectField.createEl("label", { text: "Project" });
    projectField.appendChild(project);
    const dataList = form.createEl("datalist");
    dataList.id = project.getAttribute("list") || "";
    for (const section of this.sections) dataList.appendChild(new Option(section, section));
    form.appendChild(dataList);

    enhanceNoesisFlowDatePickers(contentEl);

    const actions = contentEl.createDiv({ cls: "noesis-flow-kanban-task-actions" });
    if (this.onDelete) {
      const remove = actions.createEl("button", { text: "Delete", cls: "mod-warning", attr: { type: "button" } });
      remove.addEventListener("click", () => new NoesisFlowConfirmModal(this.app, {
        title: "Delete event",
        message: "Delete \"" + (this.event.label || "this event") + "\"?",
        confirmLabel: "Delete event",
        onConfirm: async () => {
          remove.disabled = true;
          const deleted = await this.onDelete();
          if (deleted !== false) this.close();
          else remove.disabled = false;
        }
      }).open());
    }
    actions.createEl("button", { text: "Cancel", attr: { type: "button" } }).addEventListener("click", () => this.close());
    const save = actions.createEl("button", { cls: "mod-cta", text: this.title === "New event" ? "Add event" : "Save changes", attr: { type: "button" } });
    save.addEventListener("click", asVoidHandler(async () => {
      if (!name.value.trim() || !moment(date.value, "YYYY-MM-DD", true).isValid()) {
        new Notice("Enter an event name and valid date.");
        return;
      }
      save.disabled = true;
      await this.onSubmit({ label: name.value.trim(), dateKey: date.value, section: project.value.trim() });
      this.close();
    }));
    window.setTimeout(() => name.focus(), 0);
  }
}
