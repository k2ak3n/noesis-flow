import { App, Notice, Modal, Setting } from "obsidian";
import { normalizeCalendarSectionName } from "../utils";

type CalendarSectionModalOptions = {
  defaultValue?: string;
  onCancel?: () => void;
  submitButtonText?: string;
  title?: string;
};

export class NoesisFlowCalendarSectionModal extends Modal {
  onCancel: (() => void) | null;
  defaultValue: string;
  didCancel: boolean;
  didSubmit: boolean;
  onSubmit: (section: string) => void | Promise<void>;
  sections: string[];
  submitButtonText: string;
  title: string;
  constructor(app: App, sections: string[], onSubmit: (section: string) => void | Promise<void>, options: CalendarSectionModalOptions = {}) {
    super(app);
    this.sections = sections || [];
    this.onSubmit = onSubmit;
    this.onCancel = options.onCancel || null;
    this.title = options.title || "Task project";
    this.defaultValue = options.defaultValue || "";
    this.submitButtonText = options.submitButtonText || "Next";
    this.didSubmit = false;
    this.didCancel = false;
  }

  onOpen() {
    const { contentEl } = this;
    const listId = `noesis-flow-section-list-${Date.now()}`;
    contentEl.empty();
    contentEl.addClass("noesis-flow-dialog");
    const header = contentEl.createDiv({ cls: "noesis-flow-modal-header" });
    header.createEl("h2", { text: this.title });

    const input = contentEl.createEl("input", {
      type: "text",
      value: this.defaultValue,
      placeholder: "Choose or create project",
      attr: { list: listId, "aria-label": "Choose or create project" }
    });
    input.addClass("noesis-flow-dialog-text-input");

    const datalist = contentEl.createEl("datalist", { attr: { id: listId } });
    for (const section of this.sections) {
      datalist.createEl("option", { value: section });
    }

    const submit = async () => {
      const value = normalizeCalendarSectionName(input.value);
      if (!value) {
        new Notice("Project name is required.");
        return;
      }

      this.didSubmit = true;
      this.close();
      try {
        await this.onSubmit(value);
      } catch (error) {
        console.error(error);
        new Notice(`Noesis Flow command failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    };

    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void submit();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        this.close();
      }
    });

    new Setting(contentEl)
      .addButton((button) => {
        button.setButtonText("Cancel");
        button.onClick(() => this.close());
      })
      .addButton((button) => {
        button.setButtonText(this.submitButtonText);
        button.setCta();
        button.onClick(submit);
      });

    window.setTimeout(() => input.focus(), 0);
  }

  onClose() {
    if (this.didSubmit || this.didCancel || !this.onCancel) return;
    this.didCancel = true;
    this.onCancel();
  }
}
